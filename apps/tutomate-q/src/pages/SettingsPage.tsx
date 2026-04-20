import React, { useEffect, useState } from 'react';
import {
  Save, Lock, Loader2,
  KeyRound, Building2, Palette, Bell, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
  Badge, Input, Switch, Progress,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  PageEnter,
} from '@tutomate/ui';
import {
  isElectron,
  useSettingsStore,
  useLockStore,
  PLAN_LIMITS,
  useAppVersion,
  APP_NAME,
  supabase,
  useAuthStore,
  getAuthProviderLabel,
  getAuthProviderColor,
  THEMES,
} from '@tutomate/core';
import type { FontSize, ThemeId } from '@tutomate/core';
// AdminTab removed — admin 앱에서 관리

const SettingsPage: React.FC = () => {
  const {
    theme: appTheme,
    autoThemeSync,
    fontSize,
    notificationsEnabled,
    setTheme,
    setAutoThemeSync,
    setFontSize,
    setNotificationsEnabled,
    loadSettings,
  } = useSettingsStore();
  const organizationName = useAuthStore((s) => s.organizationName) || '';

  const {
    isEnabled: lockEnabled,
    pin: lockPin,
    autoLockMinutes,
    setEnabled: setLockEnabled,
    setPin: setLockPin,
    setAutoLockMinutes,
    lock,
    verifyPin,
  } = useLockStore();

  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinStep, setPinStep] = useState<'verify' | 'new' | 'confirm'>('new');
  const [pinInput, setPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const APP_VERSION = useAppVersion();
  const session = useAuthStore((s) => s.session);
  const currentPlan = useAuthStore((s) => s.plan) || 'trial';
  const [orgNameInput, setOrgNameInput] = useState(organizationName);

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [isLatest, setIsLatest] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; body: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);


  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    setOrgNameInput(organizationName);
  }, [organizationName]);

  const handleLockToggle = async (checked: boolean) => {
    if (checked && !lockPin) {
      setPinStep('new');
      setPinInput('');
      setNewPinInput('');
      setPinError('');
      setPinModalVisible(true);
      return;
    }
    setLockEnabled(checked);
    toast.info(checked ? '화면 잠금이 활성화되었습니다' : '화면 잠금이 비활성화되었습니다');
  };

  const openPinChangeModal = () => {
    if (lockPin) {
      setPinStep('verify');
    } else {
      setPinStep('new');
    }
    setPinInput('');
    setNewPinInput('');
    setPinError('');
    setPinModalVisible(true);
  };

  const handlePinModalOk = async () => {
    if (pinStep === 'verify') {
      const valid = await verifyPin(pinInput);
      if (!valid) { setPinError('기존 PIN이 올바르지 않습니다.'); return; }
      setPinStep('new');
      setPinInput('');
      setPinError('');
      return;
    }
    if (pinStep === 'new') {
      if (pinInput.length < 4 || pinInput.length > 6) { setPinError('PIN은 4~6자리 숫자를 입력하세요.'); return; }
      setPinStep('confirm');
      setNewPinInput(pinInput);
      setPinInput('');
      setPinError('');
      return;
    }
    if (pinStep === 'confirm') {
      if (pinInput !== newPinInput) { setPinError('PIN이 일치하지 않습니다.'); setPinInput(''); return; }
      await setLockPin(pinInput);
      if (!lockEnabled) setLockEnabled(true);
      setPinModalVisible(false);
      setPinInput('');
      setNewPinInput('');
      setPinError('');
      toast.success('PIN이 설정되었습니다.');
    }
  };

  const autoLockOptions = [
    { label: '사용 안 함', value: '0' },
    { label: '1분', value: '1' },
    { label: '3분', value: '3' },
    { label: '5분', value: '5' },
    { label: '10분', value: '10' },
    { label: '30분', value: '30' },
    { label: '1시간', value: '60' },
    { label: '2시간', value: '120' },
    { label: '6시간', value: '360' },
    { label: '24시간', value: '1440' },
  ];

  const fontSizeOptions: { label: string; value: FontSize; px: number }[] = [
    { label: '아주 작게', value: 'xs', px: 11 },
    { label: '작게', value: 'small', px: 12 },
    { label: '보통', value: 'medium', px: 14 },
    { label: '크게', value: 'large', px: 16 },
    { label: '매우 크게', value: 'xl', px: 18 },
    { label: '특대', value: 'xxl', px: 20 },
    { label: '최대', value: 'xxxl', px: 22 },
  ];

  const [sliderValue, setSliderValue] = useState(() => fontSizeOptions.findIndex(o => o.value === fontSize));

  const handleCheckUpdate = async () => {
    if (!isElectron()) { toast.warning('업데이트는 데스크톱 앱에서만 사용 가능합니다'); return; }
    setCheckingUpdate(true);
    setUpdateAvailable(null);
    setIsLatest(false);
    try {
      const result = await window.electronAPI.checkForUpdates();
      if (result && result.version !== APP_VERSION) {
        setUpdateAvailable({
          version: result.version,
          body: (typeof result.releaseNotes === 'string' ? result.releaseNotes : '') || '새로운 버전이 있습니다.',
        });
        toast.info(`새 버전 v${result.version}이 있습니다! (현재: v${APP_VERSION})`);
      } else {
        setIsLatest(true);
        toast.success('최신 버전입니다.');
      }
    } catch (error: any) {
      console.error('Update check:', error);
      toast.error(`업데이트 확인 실패: ${error?.message || error} (현재: v${APP_VERSION})`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!isElectron()) return;
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const removeListener = window.electronAPI.onUpdateEvent((type, data) => {
        if (type === 'download-progress') setDownloadProgress(Math.round(data.percent));
        else if (type === 'update-downloaded') setDownloadProgress(100);
      });
      await window.electronAPI.downloadUpdate();
      removeListener();
      setDownloading(false);
      setInstallDialogOpen(true);
    } catch (error) {
      console.error('Update download failed:', error);
      toast.error('업데이트 다운로드에 실패했습니다.');
    } finally {
      setDownloading(false);
    }
  };


  const providerColor = getAuthProviderColor();
  const providerBadgeVariant = providerColor === 'green' ? 'success' as const
    : providerColor === 'blue' ? 'info' as const
    : providerColor === 'orange' ? 'warning' as const
    : 'secondary' as const;

  const planBadgeVariant = currentPlan === 'trial' ? 'warning' as const
    : currentPlan === 'admin' ? 'error' as const
    : 'success' as const;

  return (
    <PageEnter>
      <div className="max-w-[1000px]">

          {/* ── 섹션 1: 계정 ── */}
          <div className="mb-4">
            <h3 className="text-base font-bold flex items-center gap-1.5"><KeyRound className="h-4 w-4 shrink-0" />계정</h3>
            <p className="text-sm text-muted-foreground mt-1">로그인 및 조직 관리</p>
          </div>
          <div className="border rounded-xl px-5 py-1 mb-2">
            <div className="flex justify-between items-center border-b py-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">로그인 계정</p>
                  <Badge variant={providerBadgeVariant}>{getAuthProviderLabel()}</Badge>
                </div>
                <p className="text-muted-foreground text-[0.85em]">{session?.user?.email || '-'}</p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setLogoutDialogOpen(true)}>로그아웃</Button>
            </div>
            <div className="flex justify-between items-center border-b py-4">
              <div>
                <p className="font-semibold text-sm">현재 플랜</p>
                <p className="text-muted-foreground text-[0.85em]">
                  {currentPlan === 'trial'
                    ? `강좌 ${PLAN_LIMITS.trial.maxCourses}개, 강좌당 수강생 ${PLAN_LIMITS.trial.maxStudentsPerCourse}명 제한`
                    : '모든 기능을 제한 없이 사용 가능'}
                </p>
              </div>
              <Badge variant={planBadgeVariant}>
                {currentPlan === 'trial' ? '체험판' : currentPlan === 'admin' ? 'Admin' : 'Basic'}
              </Badge>
            </div>
            {/* 현재 워크스페이스 나가기 (owner 아닐 때만) */}
            {useAuthStore.getState().role !== 'owner' && (
            <div className="flex justify-between items-center" style={{ padding: '16px 0' }}>
              <div>
                <p className="font-semibold text-sm">워크스페이스 나가기</p>
                <p className="text-muted-foreground text-[0.85em]">이 워크스페이스에서 나가면 더 이상 데이터에 접근할 수 없습니다</p>
              </div>
              <Button variant="outline" size="sm" style={{ color: 'hsl(var(--destructive))' }} onClick={() => setLeaveDialogOpen(true)}>
                나가기
              </Button>
            </div>
            )}
          </div>

          {/* ── 섹션 2: 워크스페이스 ── */}
          <div className="mt-8 mb-4">
            <h3 className="text-base font-bold flex items-center gap-1.5"><Building2 className="h-4 w-4 shrink-0" />워크스페이스</h3>
            <p className="text-sm text-muted-foreground mt-1">사이드바와 헤더에 표시되는 이름</p>
          </div>
          <div className="border rounded-xl px-5 py-1 mb-2">
            <div className="flex justify-between items-center" style={{ padding: '16px 0' }}>
              <div className="flex-1 mr-6">
                <p className="font-semibold text-sm">이름</p>
                <p className="text-muted-foreground text-[0.85em]">사이드바와 헤더에 표시됩니다</p>
              </div>
              <div className="flex items-center gap-2">
                <Input value={orgNameInput} onChange={(e) => setOrgNameInput(e.target.value)} placeholder="이름을 입력하세요" className="w-[240px]" />
                <Button size="sm" disabled={orgNameInput === organizationName} onClick={async () => {
                  const orgId = useAuthStore.getState().organizationId;
                  if (!supabase || !orgId) return;
                  const { error } = await supabase.from('organizations').update({ name: orgNameInput }).eq('id', orgId);
                  if (error) { toast.error('이름 저장에 실패했습니다.'); return; }
                  useAuthStore.setState({ organizationName: orgNameInput });
                  toast.success('이름이 저장되었습니다.');
                }}>
                  <Save className="h-4 w-4" />저장
                </Button>
              </div>
            </div>
          </div>

          {/* ── 섹션 3: 화면 설정 ── */}
          <div className="mt-8 mb-4">
            <h3 className="text-base font-bold flex items-center gap-1.5"><Palette className="h-4 w-4 shrink-0" />화면 설정</h3>
            <p className="text-sm text-muted-foreground mt-1">앱 모양 변경</p>
          </div>
          <div className="border rounded-xl px-5 py-1 mb-2">
            {/* 테마 갤러리 */}
            <div className="border-b py-4">
              <div className="mb-3">
                <p className="font-semibold text-sm">테마</p>
                <p className="text-muted-foreground text-[0.85em]">앱의 색상 테마를 선택하세요</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {THEMES.map((t) => {
                  const selected = appTheme === t.id && !autoThemeSync;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { setAutoThemeSync(false); setTheme(t.id as ThemeId); }}
                      disabled={autoThemeSync}
                      className={`relative rounded-xl border-2 p-2.5 text-left transition-all ${
                        selected
                          ? 'border-primary shadow-sm'
                          : 'border-transparent bg-muted/40 hover:border-border'
                      } ${autoThemeSync ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      aria-label={`${t.label} 테마${selected ? ' (선택됨)' : ''}`}
                    >
                      <div
                        className="h-12 rounded-md mb-1.5 flex border"
                        style={{ background: t.preview.bg, borderColor: 'rgba(0,0,0,0.08)' }}
                      >
                        <div className="flex-1" />
                        <div className="w-5 m-1.5 rounded" style={{ background: t.preview.accent }} />
                      </div>
                      <div className="text-xs font-medium flex items-center gap-1">
                        {t.label}
                        {selected && <span className="text-primary">✓</span>}
                      </div>
                      <div className="text-[0.67rem] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
                        {t.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* OS 자동 연동 스위치 */}
            <div className="flex justify-between items-center border-b py-4">
              <div>
                <p className="font-semibold text-sm">OS 설정 자동 연동</p>
                <p className="text-muted-foreground text-[0.85em]">시스템이 다크모드면 다크, 라이트면 라이트로 자동 전환</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{autoThemeSync ? '켜짐' : '꺼짐'}</span>
                <Switch checked={autoThemeSync} onCheckedChange={setAutoThemeSync} />
              </div>
            </div>
            <div className="flex items-center" style={{ padding: '16px 0' }}>
              <div style={{ flexShrink: 0, marginRight: 16 }}>
                <p className="font-semibold text-sm">텍스트 크기</p>
                <p className="text-muted-foreground text-[0.85em]">
                  {fontSizeOptions.find(o => o.value === fontSize)?.label} ({fontSizeOptions.find(o => o.value === fontSize)?.px}px)
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, marginLeft: 'auto', maxWidth: 280 }}>
                <span style={{ fontSize: '0.79rem', color: 'hsl(var(--muted-foreground))' }}>가</span>
                <input type="range" min={0} max={6} step="any" value={sliderValue} onChange={(e) => { const val = Number(e.target.value); setSliderValue(val); const idx = Math.round(val); if (fontSizeOptions[idx]) setFontSize(fontSizeOptions[idx].value); }} onPointerUp={() => setSliderValue(Math.round(sliderValue))} onTouchEnd={() => setSliderValue(Math.round(sliderValue))} style={{ flex: 1 }} />
                <span style={{ fontSize: '1.29rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))' }}>가</span>
              </div>
            </div>
          </div>

          {/* ── 섹션 4: 알림 / 보안 ── */}
          <div className="mt-8 mb-4">
            <h3 className="text-base font-bold flex items-center gap-1.5"><Bell className="h-4 w-4 shrink-0" />알림 / 보안</h3>
            <p className="text-sm text-muted-foreground mt-1">알림과 잠금 설정</p>
          </div>
          <div className="border rounded-xl px-5 py-1 mb-2">
            <div className="flex justify-between items-center border-b py-4">
              <div>
                <p className="font-semibold text-sm">알림</p>
                <p className="text-muted-foreground text-[0.85em]">{notificationsEnabled ? '앱 내 알림이 활성화되어 있습니다' : '알림이 비활성화되어 있습니다'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{notificationsEnabled ? '켜짐' : '꺼짐'}</span>
                <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
              </div>
            </div>
            <div className="flex justify-between items-center" style={{ padding: '16px 0' }}>
              <div>
                <p className="font-semibold text-sm">화면 잠금 사용</p>
                <p className="text-muted-foreground text-[0.85em]">{lockEnabled ? '화면 잠금이 활성화되어 있습니다' : '자리를 비울 때 화면을 잠급니다'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{lockEnabled ? '켜짐' : '꺼짐'}</span>
                <Switch checked={lockEnabled} onCheckedChange={handleLockToggle} />
              </div>
            </div>
            {lockEnabled && (
              <>
                <div className="flex justify-between items-center" style={{ borderTop: '1px solid hsl(var(--border))', padding: '16px 0' }}>
                  <div>
                    <p className="font-semibold text-sm">PIN 설정</p>
                    <p className="text-muted-foreground text-[0.85em]">4~6자리 숫자 PIN</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={openPinChangeModal}>
                    <Lock className="h-4 w-4" />PIN 변경
                  </Button>
                </div>
                <div className="flex justify-between items-center" style={{ borderTop: '1px solid hsl(var(--border))', padding: '16px 0' }}>
                  <div>
                    <p className="font-semibold text-sm">자동 잠금</p>
                    <p className="text-muted-foreground text-[0.85em]">미사용 시 자동으로 화면을 잠급니다</p>
                  </div>
                  <Select value={String(autoLockMinutes)} onValueChange={(val) => setAutoLockMinutes(Number(val))}>
                    <SelectTrigger className="w-[130px] h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {autoLockOptions.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-between items-center" style={{ borderTop: '1px solid hsl(var(--border))', padding: '16px 0' }}>
                  <div>
                    <p className="font-semibold text-sm">지금 잠금</p>
                    <p className="text-muted-foreground text-[0.85em]">화면을 즉시 잠급니다</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={lock}>
                    <Lock className="h-4 w-4" />잠금
                  </Button>
                </div>
              </>
            )}
          </div>

          <Dialog open={pinModalVisible} onOpenChange={(open) => { if (!open) { setPinModalVisible(false); setPinInput(''); setNewPinInput(''); setPinError(''); } }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>{pinStep === 'verify' ? '기존 PIN 확인' : pinStep === 'new' ? '새 PIN 입력' : 'PIN 확인'}</DialogTitle>
                <DialogDescription className="sr-only">PIN을 설정합니다</DialogDescription>
              </DialogHeader>
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-4 text-sm">
                  {pinStep === 'verify' ? '기존 PIN을 입력하세요' : pinStep === 'new' ? '새 PIN을 입력하세요 (4~6자리 숫자)' : '새 PIN을 다시 입력하세요'}
                </p>
                <Input type="password" value={pinInput} onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); if (val.length <= 6) { setPinInput(val); setPinError(''); } }} onKeyDown={(e) => { if (e.key === 'Enter') handlePinModalOk(); }} placeholder="PIN 입력" maxLength={6} className="w-[200px] mx-auto text-center text-xl tracking-[8px]" autoFocus />
                {pinError && <p className="mt-2 text-destructive text-sm">{pinError}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setPinModalVisible(false); setPinInput(''); setNewPinInput(''); setPinError(''); }}>취소</Button>
                <Button onClick={handlePinModalOk} disabled={pinInput.length < 4}>{pinStep === 'confirm' ? '설정' : '다음'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── 섹션 5: 앱 정보 ── */}
          <div className="mt-8 mb-4">
            <h3 className="text-base font-bold flex items-center gap-1.5"><Info className="h-4 w-4 shrink-0" />앱 정보</h3>
          </div>
          <div className="border rounded-xl px-5 py-1 mb-2">
            <div className="flex justify-between items-center" style={{ padding: '16px 0' }}>
              <div>
                <p className="font-semibold text-sm">버전</p>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-[0.85em]">{APP_NAME} v{APP_VERSION}</span>
                  {isLatest && <Badge variant="success">최신 버전</Badge>}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleCheckUpdate} disabled={checkingUpdate}>
                {checkingUpdate && <Loader2 className="h-4 w-4 animate-spin" />}
                업데이트 확인
              </Button>
            </div>
            {updateAvailable && (
              <div style={{ borderTop: '1px solid hsl(var(--border))', padding: '16px 0' }}>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="success">새 버전</Badge>
                    <span className="font-semibold">v{updateAvailable.version}</span>
                  </div>
                  <div className="text-[0.87rem] text-muted-foreground" dangerouslySetInnerHTML={{ __html: updateAvailable.body }} />
                  {downloading ? (
                    <div className="space-y-1">
                      <Progress value={downloadProgress} />
                      <p className="text-xs text-muted-foreground text-center">{downloadProgress}%</p>
                    </div>
                  ) : (
                    <Button size="sm" onClick={handleDownloadUpdate}>다운로드 및 설치</Button>
                  )}
                </div>
              </div>
            )}
            {/* 이용약관 / 개인정보 처리방침 */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground" style={{ borderTop: '1px solid hsl(var(--border))', padding: '16px 0' }}>
              <a href="https://taktonlabs.com/terms" target="_blank" rel="noopener noreferrer" className="hover:underline">이용약관</a>
              <span>·</span>
              <a href="https://taktonlabs.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:underline">개인정보 처리방침</a>
            </div>
          </div>
      </div>

      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>로그아웃</AlertDialogTitle>
            <AlertDialogDescription>로그아웃하면 로그인 화면으로 돌아갑니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { await useAuthStore.getState().signOut(); toast.success('로그아웃되었습니다.'); }}>로그아웃</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>워크스페이스 나가기</AlertDialogTitle>
            <AlertDialogDescription>이 워크스페이스에서 나가면 더 이상 데이터에 접근할 수 없습니다. 계속하시겠습니까?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
              if (!supabase) return;
              const orgId = useAuthStore.getState().organizationId;
              if (!orgId) return;
              const { showSwitchOverlay, hideSwitchOverlay } = await import('@tutomate/ui');
              try {
                const { data: orgList } = await supabase.functions.invoke('list-my-organizations');
                const myOrgs = orgList?.organizations || [];
                const ownerOrg = myOrgs.find((o: any) => o.role === 'owner' && o.id !== orgId) || myOrgs.find((o: any) => o.id !== orgId);

                const { data: leaveResult, error: leaveErr } = await supabase.functions.invoke('leave-organization', {
                  body: { organization_id: orgId },
                });
                if (leaveErr || leaveResult?.error) {
                  const msg = leaveResult?.error === 'owner_cannot_leave' ? '소유자는 워크스페이스를 나갈 수 없습니다.' : '나가기 실패';
                  toast.error(msg);
                  return;
                }

                if (ownerOrg) {
                  showSwitchOverlay(ownerOrg.name);
                  await useAuthStore.getState().switchOrganization(ownerOrg.id);
                  const { reloadAllStores } = await import('@tutomate/core');
                  await reloadAllStores();
                }
              } finally { hideSwitchOverlay(); }
            }}>나가기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업데이트 다운로드 완료</AlertDialogTitle>
            <AlertDialogDescription>업데이트를 설치하고 재시작하시겠습니까?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>나중에</AlertDialogCancel>
            <AlertDialogAction onClick={() => window.electronAPI.installUpdate()}>설치 및 재시작</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageEnter>
  );
};

export default SettingsPage;
