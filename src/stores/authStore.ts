import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

import type { PlanType } from '../config/planLimits';
import { supabase } from '../config/supabase';
import { logInfo, logError, logWarn } from '../utils/logger';
import { isTauri } from '../utils/tauri';
import { hasLocalData, migrateLocalToCloud, clearLocalData, getLocalDataSnapshot, restoreMonthlyPaymentsFromBackup } from '../utils/migrationHelper';
import { useSettingsStore } from './settingsStore';

/**
 * 마이그레이션 전 로컬 데이터 자동 백업 (1회, UI 미노출)
 * 로컬 파일이 Supabase로 올라가기 전에 안전하게 ZIP으로 보관
 */
async function silentLocalBackup(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('create_backup', { orgName: 'pre-migration' });
    logInfo('Silent pre-migration backup created');
  } catch (err) {
    logWarn(`Silent backup failed (non-critical): ${err}`);
  }
}

async function getDeviceId(): Promise<string> {
  let machineId: string;

  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    machineId = await invoke<string>('get_machine_id');
  } else {
    // 브라우저 폴백: localStorage에 랜덤 ID 저장
    const stored = localStorage.getItem('tutomate_device_id');
    if (stored) {
      machineId = stored;
    } else {
      machineId = crypto.randomUUID();
      localStorage.setItem('tutomate_device_id', machineId);
    }
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(machineId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface AuthStore {
  session: Session | null;
  organizationId: string | null;
  plan: PlanType | null;
  isCloud: boolean;
  loading: boolean;
  _previousOrg: { organizationId: string; plan: PlanType | null } | null;

  initialize: () => Promise<void>;
  activateCloud: (licenseKey: string) => Promise<
    | { status: 'success'; isNewOrg: boolean; orgChanged: boolean; previousOrgId: string | null }
    | { status: 'invalid_key' | 'max_seats_reached' | 'error' }
  >;
  rollbackOrg: () => void;
  deactivateCloud: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  organizationId: null,
  plan: null,
  isCloud: false,
  loading: true,
  _previousOrg: null,

  initialize: async () => {
    if (!supabase) {
      logWarn('Supabase not configured, running in local-only mode');
      set({ loading: false });
      return;
    }

    try {
      // 1. 기존 세션 확인 또는 익명 로그인
      let { data: { session } } = await supabase.auth.getSession();

      // 캐시된 세션이 있어도 유저가 실제로 DB에 존재하는지 검증
      // (PITR 복원 등으로 auth.users가 변경된 경우 대비)
      if (session) {
        const { error: verifyError } = await supabase.auth.getUser(session.access_token);
        if (verifyError) {
          logWarn(`Cached session invalid, signing out: ${verifyError.message}`);
          await supabase.auth.signOut();
          session = null;
        }
      }

      if (!session) {
        const { data, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError || !data.session) {
          logError('Anonymous sign-in failed', { error: signInError });
          set({ loading: false });
          return;
        }
        session = data.session;
      }

      // 2. 기존 조직 연결 확인
      const { data: orgLink } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', session.user.id)
        .single();

      if (orgLink) {
        // 기존 조직 복원 — UI 즉시 해제, 무거운 작업은 백그라운드
        const { data: orgData } = await supabase
          .from('organizations')
          .select('plan, name')
          .eq('id', orgLink.organization_id)
          .single();

        set({
          session,
          organizationId: orgLink.organization_id,
          plan: (orgData?.plan as PlanType) || 'trial',
          isCloud: true,
          loading: false, // UI를 먼저 해제 — 무거운 작업은 백그라운드로
        });

        // Supabase의 조직명을 settingsStore에 동기화
        if (orgData?.name) {
          useSettingsStore.getState().setOrganizationName(orgData.name);
        }

        logInfo('Cloud session restored', { data: { orgId: orgLink.organization_id, plan: orgData?.plan, name: orgData?.name } });

        // 무거운 작업은 UI 블로킹 없이 백그라운드 실행 (org당 1회만)
        const bgOrgId = orgLink.organization_id;
        const migrationKey = `migration-done-${bgOrgId}`;

        if (!localStorage.getItem(migrationKey)) {
          setTimeout(async () => {
            try {
              // 라이선스 유저: 이미 Supabase 데이터가 있으므로 로컬 파일만 정리
              if (await hasLocalData()) {
                await silentLocalBackup();

                // DB에 원본 JSON 백업 저장 (복구용)
                const snapshot = await getLocalDataSnapshot();
                if (snapshot && supabase) {
                  await supabase.from('organizations')
                    .update({ local_backup: snapshot })
                    .eq('id', bgOrgId);
                  logInfo('Licensed user: local data snapshot saved to DB');
                }

                await clearLocalData();
                logInfo('Licensed user: cleared leftover local data (Supabase data preserved)');
              }

              // monthly_payments가 Supabase에 없으면 백업 ZIP에서 복원 시도
              await restoreMonthlyPaymentsFromBackup(bgOrgId);

              // 완료 플래그 → 다음 시작부터 스킵
              localStorage.setItem(migrationKey, new Date().toISOString());
              logInfo('Background migration completed, flagged as done');
            } catch (bgErr) {
              // 실패 시 플래그 안 세팅 → 다음 시작에 재시도
              logWarn(`Background migration task failed (will retry next launch): ${bgErr}`);
            }
          }, 100);
        }
      } else {
        // 3. 조직 없음 → trial org 자동 생성
        let deviceId: string;
        try {
          deviceId = await getDeviceId();
        } catch (error) {
          logError('Failed to get device ID', { error });
          set({ loading: false });
          return;
        }

        const { data: trialData, error: trialError } = await supabase.functions.invoke(
          'create-trial-org',
          { body: { device_id: deviceId } },
        );

        if (trialError || trialData?.error) {
          logError('Trial org creation failed', { error: trialError, data: trialData });
          set({ loading: false });
          return;
        }

        const organizationId = trialData.organization_id as string;
        const plan = (trialData.plan as PlanType) || 'trial';
        const isNewOrg = trialData.is_new_org as boolean;

        set({
          session,
          organizationId,
          plan,
          isCloud: true,
          loading: false, // UI를 먼저 해제
        });
        logInfo('Trial cloud activated', { data: { orgId: organizationId, isNewOrg } });

        // 4. 새 org인 경우에만 로컬→클라우드 마이그레이션 (백그라운드, org당 1회만)
        //    isNewOrg=false(기존 org 재연결)일 때 migrateLocalToCloud를 실행하면
        //    기존 Supabase 데이터를 DELETE 후 빈 데이터를 INSERT하는 사고 발생
        const trialMigrationKey = `migration-done-${organizationId}`;

        if (isNewOrg && !localStorage.getItem(trialMigrationKey)) {
          setTimeout(async () => {
            try {
              if (await hasLocalData()) {
                await silentLocalBackup();

                // DB에 원본 JSON 백업 저장 (복구용)
                const snapshot = await getLocalDataSnapshot();
                if (snapshot && supabase) {
                  await supabase.from('organizations')
                    .update({ local_backup: snapshot })
                    .eq('id', organizationId);
                  logInfo('Local data snapshot saved to DB');
                }

                const result = await migrateLocalToCloud(organizationId);
                if (result.success) {
                  await clearLocalData();
                  logInfo('Auto-migration completed', { data: result.counts });
                } else {
                  logWarn('Auto-migration failed, local data preserved');
                  return; // 실패 시 플래그 안 세팅 → 재시도
                }
              }

              localStorage.setItem(trialMigrationKey, new Date().toISOString());
              logInfo('Trial migration completed, flagged as done');
            } catch (err) {
              logWarn(`Trial migration failed (will retry next launch): ${err}`);
            }
          }, 100);
        } else if (!isNewOrg) {
          // 기존 org 재연결: 로컬 데이터만 정리 (마이그레이션 없이)
          if (!localStorage.getItem(trialMigrationKey)) {
            setTimeout(async () => {
              try {
                if (await hasLocalData()) {
                  await silentLocalBackup();
                  await clearLocalData();
                  logInfo('Existing org reconnect: cleared local data without migration');
                }
                localStorage.setItem(trialMigrationKey, new Date().toISOString());
              } catch (err) {
                logWarn(`Local cleanup failed: ${err}`);
              }
            }, 100);
          }
        }
      }
    } catch (error) {
      logError('Failed to initialize auth', { error });
      set({ loading: false });
    }

  },

  activateCloud: async (licenseKey: string): Promise<
    | { status: 'success'; isNewOrg: boolean; orgChanged: boolean; previousOrgId: string | null }
    | { status: 'invalid_key' | 'max_seats_reached' | 'error' }
  > => {
    if (!supabase) {
      logError('Supabase client not initialized', {});
      return { status: 'error' };
    }

    try {
      // 세션 갱신 (만료된 토큰으로 Edge Function 호출 시 401 방지)
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      let session = refreshData?.session;
      logInfo('refreshSession result', {
        data: {
          hasSession: !!session,
          refreshError: refreshError?.message || null,
          userId: session?.user?.id?.slice(0, 8) || null,
        },
      });

      // refreshSession 성공해도 유저가 DB에 없을 수 있음 (PITR 복원 후 등)
      // getUser로 실제 유효성 검증
      if (session) {
        const { data: userData, error: verifyError } = await supabase.auth.getUser();
        logInfo('getUser verification', {
          data: {
            verified: !verifyError,
            error: verifyError?.message || null,
            userId: userData?.user?.id?.slice(0, 8) || null,
          },
        });
        if (verifyError) {
          logWarn(`Session token invalid (user may not exist): ${verifyError.message}`);
          // 기존 세션 정리 후 재로그인
          await supabase.auth.signOut();
          session = null;
        }
      }

      if (!session) {
        logInfo('No valid session, attempting anonymous sign-in');
        const { data, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError || !data.session) {
          logError('Anonymous sign-in failed', { error: signInError, data: { message: signInError?.message } });
          return { status: 'error' };
        }
        session = data.session;
        logInfo('Anonymous sign-in successful', { data: { userId: session.user.id } });
      }

      // 기기 ID 조회
      let deviceId: string;
      try {
        deviceId = await getDeviceId();
        logInfo('Device ID retrieved', { data: { deviceId: deviceId.slice(0, 8) + '...' } });
      } catch (error) {
        logError('Failed to get device ID, aborting activation', { error });
        return { status: 'error' };
      }

      // Edge Function으로 라이센스 검증 + 조직 연결 (trial → licensed 업그레이드 포함)
      // 현재 세션 토큰 확인 로그
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      logInfo('Calling activate-license edge function', {
        data: {
          sessionUserId: currentSession?.user?.id?.slice(0, 8) || 'none',
          tokenPrefix: currentSession?.access_token?.slice(0, 20) || 'none',
          tokenLength: currentSession?.access_token?.length || 0,
        },
      });
      const { data, error } = await supabase.functions.invoke('activate-license', {
        body: { license_key: licenseKey, device_id: deviceId },
      });

      if (error) {
        // FunctionsHttpError의 경우 응답 body에서 상세 에러 추출
        let detail = error.message;
        let statusCode: number | null = null;
        try {
          // supabase-js v2: FunctionsHttpError has .context (Response object)
          const ctx = (error as any).context;
          if (ctx) {
            statusCode = ctx.status || null;
            if (typeof ctx.json === 'function') {
              const body = await ctx.json();
              detail = JSON.stringify(body);
            } else if (typeof ctx.text === 'function') {
              detail = await ctx.text();
            }
          }
        } catch (_) {
          try {
            if (typeof (error as any).json === 'function') {
              const body = await (error as any).json();
              detail = JSON.stringify(body);
            }
          } catch (_2) { /* ignore */ }
        }
        logError('License activation failed', {
          error,
          data: {
            message: error.message,
            detail,
            statusCode,
            errorType: error.constructor?.name,
            errorKeys: Object.keys(error),
          },
        });
        return { status: 'error' };
      }

      logInfo('Edge function response', { data });

      if (data?.error === 'max_seats_reached') {
        return { status: 'max_seats_reached' };
      }

      if (data?.error === 'invalid_key' || data?.error === 'invalid_format') {
        return { status: 'invalid_key' };
      }

      if (data?.error) {
        logError('License activation returned error', { data: { error: data.error } });
        return { status: 'error' };
      }

      const organizationId = data.organization_id as string;
      const isNewOrg = data.is_new_org as boolean;
      const plan = (data.plan as PlanType) || 'basic';

      const previousOrgId: string | null = useAuthStore.getState().organizationId;
      const orgChanged: boolean = previousOrgId !== null && previousOrgId !== organizationId;

      set({
        session,
        organizationId,
        plan,
        isCloud: true,
        _previousOrg: orgChanged ? { organizationId: previousOrgId as string, plan: useAuthStore.getState().plan } : null,
      });

      // 활성화된 조직의 이름을 Supabase에서 가져와 동기화
      if (supabase) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', organizationId)
          .single();
        if (orgData?.name) {
          useSettingsStore.getState().setOrganizationName(orgData.name);
        }
      }

      logInfo('License activated, cloud upgraded', { data: { orgId: organizationId, isNewOrg, plan, orgChanged } });
      return { status: 'success', isNewOrg, orgChanged, previousOrgId };
    } catch (error) {
      logError('activateCloud error', { error });
      return { status: 'error' };
    }
  },

  rollbackOrg: () => {
    const prev: { organizationId: string; plan: PlanType | null } | null = useAuthStore.getState()._previousOrg;
    if (prev) {
      set({
        organizationId: prev.organizationId,
        plan: prev.plan,
        _previousOrg: null,
      });
      logInfo('Org rollback to previous trial org', { data: { orgId: prev.organizationId } });
    }
  },

  deactivateCloud: async () => {
    if (!supabase) return;

    try {
      await supabase.auth.signOut();
    } catch (error) {
      logError('Sign out error', { error });
    }

    set({
      session: null,
      organizationId: null,
      plan: null,
      isCloud: false,
    });

    logInfo('Cloud deactivated');
  },
}));

// 세션 변경 리스너 (모듈 로드 시 1회만 등록)
if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      useAuthStore.setState({ session: null, organizationId: null, plan: null, isCloud: false });
    } else {
      useAuthStore.setState({ session });
    }
  });
}

// 스토어 외부에서 사용하는 헬퍼
export const isCloud = (): boolean => useAuthStore.getState().isCloud;
export const getOrgId = (): string | null => useAuthStore.getState().organizationId;
export const getPlan = (): PlanType | null => useAuthStore.getState().plan;
