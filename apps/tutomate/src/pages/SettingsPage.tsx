import React, { useEffect, useState } from 'react';
import {
  Save,
  Eye,
  EyeOff,
  Copy,
  Lock,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  isElectron,
  useSettingsStore,
  useLockStore,
  useLicenseStore,
  PLAN_LIMITS,
  useAppVersion,
  APP_NAME,
  supabase,
  useAuthStore,
  migrateOrgData,
  reloadAllStores,
  getAuthProviderLabel,
  getAuthProviderColor,
  appConfig,
} from '@tutomate/core';
import type { FontSize } from '@tutomate/core';
import { LicenseKeyInput, AdminTab } from '@tutomate/ui';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Progress } from '../components/ui/progress';
// useBackup 제거 (v0.3.0 — 백업 탭 비활성화)

const SettingsPage: React.FC = () => {
  const {
    theme: appTheme,
    fontSize,
    notificationsEnabled,
    organizationName,
    setTheme,
    setFontSize,
    setNotificationsEnabled,
    setOrganizationName,
    loadSettings,
  } = useSettingsStore();

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

  // PIN 설정 모달 상태
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinStep, setPinStep] = useState<'verify' | 'new' | 'confirm'>('new');
  const [pinInput, setPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const APP_VERSION = useAppVersion();
  const session = useAuthStore((s) => s.session);
  const { getPlan, activateLicense, licenseKey } = useLicenseStore();
  const [orgNameInput, setOrgNameInput] = useState(organizationName);
  const [showKey, setShowKey] = useState(false);
  const [licenseInput, setLicenseInput] = useState(['', '', '', '']);
  const [activating, setActivating] = useState(false);
  const [licenseModalVisible, setLicenseModalVisible] = useState(false);
  const currentPlan = getPlan();

  // 업데이트 관련 상태
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [isLatest, setIsLatest] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; body: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // 로그아웃 AlertDialog 상태
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  // 업데이트 설치 AlertDialog 상태
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  // 라이선스 데이터 이전 AlertDialog 상태
  const [migrateDialogOpen, setMigrateDialogOpen] = useState(false);
  const [migrateResolve, setMigrateResolve] = useState<((val: boolean) => void) | null>(null);
  useEffect(() => {
    loadSettings();
    useLicenseStore.getState().loadLicense();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (!valid) {
        setPinError('기존 PIN이 올바르지 않습니다.');
        return;
      }
      setPinStep('new');
      setPinInput('');
      setPinError('');
      return;
    }

    if (pinStep === 'new') {
      if (pinInput.length < 4 || pinInput.length > 6) {
        setPinError('PIN은 4~6자리 숫자를 입력하세요.');
        return;
      }
      setPinStep('confirm');
      setNewPinInput(pinInput);
      setPinInput('');
      setPinError('');
      return;
    }

    if (pinStep === 'confirm') {
      if (pinInput !== newPinInput) {
        setPinError('PIN이 일치하지 않습니다.');
        setPinInput('');
        return;
      }
      await setLockPin(pinInput);
      if (!lockEnabled) {
        setLockEnabled(true);
      }
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

  // 업데이트 확인
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

  // 업데이트 다운로드 및 설치
  const handleDownloadUpdate = async () => {
    if (!isElectron()) return;
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const removeListener = window.electronAPI.onUpdateEvent((type, data) => {
        if (type === 'download-progress') {
          setDownloadProgress(Math.round(data.percent));
        } else if (type === 'update-downloaded') {
          setDownloadProgress(100);
        }
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

  const handleActivateLicense = async () => {
    const key = licenseInput.join('-');
    if (licenseInput.some((g) => g.length !== 4)) {
      toast.warning('라이선스 키를 모두 입력하세요.');
      return;
    }
    setActivating(true);
    try {
      const result = await activateLicense(key);
      if (result.result === 'success') {
        if (result.orgChanged && result.previousOrgId) {
          const newOrgId = useAuthStore.getState().organizationId!;
          const migrate = await new Promise<boolean>((resolve) => {
            setMigrateResolve(() => resolve);
            setMigrateDialogOpen(true);
          });
          if (migrate) {
            const ok = await migrateOrgData(result.previousOrgId, newOrgId);
            await reloadAllStores();
            if (ok) {
              toast.success('라이선스가 활성화되었습니다! 기존 데이터가 이전되었습니다.');
            } else {
              toast.warning('라이선스는 활성화되었지만 데이터 이전에 실패했습니다.');
            }
          } else {
            await reloadAllStores();
            toast.success('라이선스가 활성화되었습니다! 새로 시작합니다.');
          }
        } else {
          toast.success('라이선스가 활성화되었습니다!');
        }
        setLicenseInput(['', '', '', '']);
        setLicenseModalVisible(false);
      } else if (result.result === 'invalid_format') {
        toast.error('유효하지 않은 형식입니다.');
      } else if (result.result === 'network_error') {
        toast.error('서버에 연결할 수 없습니다. 인터넷 연결을 확인하세요.');
      } else if (result.result === 'max_seats_reached') {
        toast.error('이 라이선스의 최대 사용자 수에 도달했습니다.');
      } else {
        toast.error('유효하지 않은 라이선스 키입니다.');
      }
    } finally {
      setActivating(false);
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
    <div>
      <Card className="max-w-[1000px]">
        <CardContent className="p-6">
          {/* 계정 */}
          <div className="flex justify-between items-center py-4">
            <div>
              <p className="font-semibold text-sm">로그인 계정</p>
              <p className="text-muted-foreground text-[0.85em]">
                {session?.user?.email || '-'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={providerBadgeVariant}>{getAuthProviderLabel()}</Badge>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setLogoutDialogOpen(true)}
              >
                로그아웃
              </Button>
            </div>
          </div>

          <Separator />

          {/* 현재 플랜 + 라이선스 */}
          <div className="flex justify-between items-center py-4">
            <div>
              <p className="font-semibold text-sm">현재 플랜</p>
              <p className="text-muted-foreground text-[0.85em]">
                {currentPlan === 'trial'
                  ? `강좌 ${PLAN_LIMITS.trial.maxCourses}개, 강좌당 수강생 ${PLAN_LIMITS.trial.maxStudentsPerCourse}명 제한`
                  : '모든 기능을 제한 없이 사용 가능'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={planBadgeVariant} className="text-[13px] px-2.5 py-0.5">
                {currentPlan === 'trial' ? '체험판' : currentPlan === 'admin' ? 'Admin' : 'Basic'}
              </Badge>
              {currentPlan !== 'trial' && licenseKey ? (
                <>
                  <code className="text-sm bg-muted px-2 py-0.5 rounded">{showKey ? licenseKey : `${licenseKey.slice(0, 9)}****-****`}</code>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowKey(!showKey)}>
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(licenseKey); toast.success('키가 복사되었습니다.'); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => setLicenseModalVisible(true)}>라이선스 활성화</Button>
              )}
            </div>
          </div>

          {/* 라이선스 활성화 모달 */}
          <Dialog open={licenseModalVisible} onOpenChange={setLicenseModalVisible}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>라이선스 활성화</DialogTitle>
                <DialogDescription className="text-[0.85em]">
                  키를 직접 입력하거나 전체 붙여넣기 하세요
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <LicenseKeyInput value={licenseInput} onChange={setLicenseInput} onPressEnter={handleActivateLicense} />
                <Button className="w-full" onClick={handleActivateLicense} disabled={activating}>
                  {activating && <Loader2 className="h-4 w-4 animate-spin" />}
                  활성화
                </Button>
                <p className="text-muted-foreground text-[0.85em] text-center">
                  문의: {appConfig.contactInfo}
                </p>
              </div>
            </DialogContent>
          </Dialog>

          <Separator />

          {/* 이름 */}
          <div className="flex justify-between items-center py-4">
            <div className="flex-1 mr-6">
              <p className="font-semibold text-sm">이름</p>
              <p className="text-muted-foreground text-[0.85em]">
                {currentPlan === 'trial' ? '라이선스 활성화 후 변경 가능' : '헤더와 백업 파일명에 표시'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={orgNameInput}
                onChange={(e) => setOrgNameInput(e.target.value)}
                placeholder="이름을 입력하세요"
                className="w-[240px]"
                disabled={currentPlan === 'trial'}
              />
              <Button
                size="sm"
                disabled={currentPlan === 'trial' || orgNameInput === organizationName}
                onClick={async () => {
                  const prevName = organizationName;
                  setOrganizationName(orgNameInput);
                  const orgId = useAuthStore.getState().organizationId;
                  if (supabase && orgId) {
                    const { error } = await supabase.from('organizations').update({ name: orgNameInput }).eq('id', orgId);
                    if (error) {
                      setOrganizationName(prevName);
                      toast.error('이름 저장에 실패했습니다.');
                      return;
                    }
                  }
                  toast.success('이름이 저장되었습니다.');
                }}
              >
                <Save className="h-4 w-4" />
                저장
              </Button>
            </div>
          </div>

          <Separator />

          {/* 다크 모드 */}
          <div className="flex justify-between items-center py-4">
            <div>
              <p className="font-semibold text-sm">다크 모드</p>
              <p className="text-muted-foreground text-[0.85em]">앱의 테마를 변경합니다</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{appTheme === 'dark' ? '켜짐' : '꺼짐'}</span>
              <Switch checked={appTheme === 'dark'} onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')} />
            </div>
          </div>

          <Separator />

          {/* 텍스트 크기 */}
          <div style={{ padding: '16px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <p className="font-semibold text-sm">텍스트 크기</p>
                <p className="text-muted-foreground text-[0.85em]">앱 전체의 텍스트 크기를 조절합니다</p>
              </div>
              <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
                {fontSizeOptions.find(o => o.value === fontSize)?.label} ({
                  fontSizeOptions.find(o => o.value === fontSize)?.px
                }px)
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>가</span>
              <input
                type="range"
                min={0}
                max={6}
                step={1}
                value={fontSizeOptions.findIndex(o => o.value === fontSize)}
                onChange={(e) => setFontSize(fontSizeOptions[Number(e.target.value)].value)}
                style={{ flex: 1, accentColor: 'hsl(var(--foreground))' }}
              />
              <span style={{ fontSize: 18, fontWeight: 700, color: 'hsl(var(--muted-foreground))' }}>가</span>
            </div>
          </div>

          <Separator />

          {/* 알림 */}
          <div className="flex justify-between items-center py-4">
            <div>
              <p className="font-semibold text-sm">알림</p>
              <p className="text-muted-foreground text-[0.85em]">
                {notificationsEnabled ? '앱 내 알림이 활성화되어 있습니다' : '알림이 비활성화되어 있습니다'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{notificationsEnabled ? '켜짐' : '꺼짐'}</span>
              <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
            </div>
          </div>

          <Separator />

          {/* 화면 잠금 */}
          <div className="flex justify-between items-center py-4">
            <div>
              <p className="font-semibold text-sm">화면 잠금 사용</p>
              <p className="text-muted-foreground text-[0.85em]">
                {lockEnabled ? '화면 잠금이 활성화되어 있습니다' : '자리를 비울 때 화면을 잠급니다'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{lockEnabled ? '켜짐' : '꺼짐'}</span>
              <Switch checked={lockEnabled} onCheckedChange={handleLockToggle} />
            </div>
          </div>

          {lockEnabled && (
            <>
              <Separator />
              <div className="flex justify-between items-center py-4">
                <div>
                  <p className="font-semibold text-sm">PIN 설정</p>
                  <p className="text-muted-foreground text-[0.85em]">4~6자리 숫자 PIN</p>
                </div>
                <Button variant="outline" size="sm" onClick={openPinChangeModal}>
                  <Lock className="h-4 w-4" />
                  PIN 변경
                </Button>
              </div>
              <Separator />
              <div className="flex justify-between items-center py-4">
                <div>
                  <p className="font-semibold text-sm">자동 잠금</p>
                  <p className="text-muted-foreground text-[0.85em]">미사용 시 자동으로 화면을 잠급니다</p>
                </div>
                <Select value={String(autoLockMinutes)} onValueChange={(val) => setAutoLockMinutes(Number(val))}>
                  <SelectTrigger className="w-[130px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {autoLockOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="flex justify-between items-center py-4">
                <div>
                  <p className="font-semibold text-sm">지금 잠금</p>
                  <p className="text-muted-foreground text-[0.85em]">화면을 즉시 잠급니다</p>
                </div>
                <Button variant="outline" size="sm" onClick={lock}>
                  <Lock className="h-4 w-4" />
                  잠금
                </Button>
              </div>
            </>
          )}

          {/* PIN 설정 Dialog */}
          <Dialog open={pinModalVisible} onOpenChange={(open) => {
            if (!open) {
              setPinModalVisible(false);
              setPinInput('');
              setNewPinInput('');
              setPinError('');
            }
          }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>
                  {pinStep === 'verify' ? '기존 PIN 확인' : pinStep === 'new' ? '새 PIN 입력' : 'PIN 확인'}
                </DialogTitle>
                <DialogDescription className="sr-only">PIN을 설정합니다</DialogDescription>
              </DialogHeader>
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-4 text-sm">
                  {pinStep === 'verify' ? '기존 PIN을 입력하세요' : pinStep === 'new' ? '새 PIN을 입력하세요 (4~6자리 숫자)' : '새 PIN을 다시 입력하세요'}
                </p>
                <Input
                  type="password"
                  value={pinInput}
                  onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); if (val.length <= 6) { setPinInput(val); setPinError(''); } }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePinModalOk(); }}
                  placeholder="PIN 입력"
                  maxLength={6}
                  className="w-[200px] mx-auto text-center text-xl tracking-[8px]"
                  autoFocus
                />
                {pinError && <p className="mt-2 text-destructive text-sm">{pinError}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setPinModalVisible(false); setPinInput(''); setNewPinInput(''); setPinError(''); }}>취소</Button>
                <Button onClick={handlePinModalOk} disabled={pinInput.length < 4}>
                  {pinStep === 'confirm' ? '설정' : '다음'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Separator />

          {/* 앱 정보 */}
          <div className="flex justify-between items-center py-4">
            <div>
              <p className="font-semibold text-sm">앱 정보</p>
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
            <>
              <Separator />
              <div className="py-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="success">새 버전</Badge>
                  <span className="font-semibold">v{updateAvailable.version}</span>
                </div>
                <div className="text-[13px] text-muted-foreground" dangerouslySetInnerHTML={{ __html: updateAvailable.body }} />
                {downloading ? (
                  <div className="space-y-1">
                    <Progress value={downloadProgress} />
                    <p className="text-xs text-muted-foreground text-center">{downloadProgress}%</p>
                  </div>
                ) : (
                  <Button size="sm" onClick={handleDownloadUpdate}>다운로드 및 설치</Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {currentPlan === 'admin' && (
        <Card className="max-w-[1000px] mt-4">
          <CardContent className="p-6">
            <AdminTab />
          </CardContent>
        </Card>
      )}

      {/* 로그아웃 확인 AlertDialog */}
      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>로그아웃</AlertDialogTitle>
            <AlertDialogDescription>로그아웃하면 로그인 화면으로 돌아갑니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                await useAuthStore.getState().deactivateCloud();
                toast.success('로그아웃되었습니다.');
              }}
            >
              로그아웃
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 업데이트 설치 AlertDialog */}
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

      {/* 데이터 이전 AlertDialog */}
      <AlertDialog open={migrateDialogOpen} onOpenChange={(open) => {
        if (!open && migrateResolve) {
          migrateResolve(false);
          setMigrateResolve(null);
        }
        setMigrateDialogOpen(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>체험판 데이터 이전</AlertDialogTitle>
            <AlertDialogDescription>
              체험판에서 입력한 데이터를 라이선스 계정으로 이전하시겠습니까? "새로 시작"을 선택하면 빈 상태로 시작합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              if (migrateResolve) { migrateResolve(false); setMigrateResolve(null); }
              setMigrateDialogOpen(false);
            }}>새로 시작</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (migrateResolve) { migrateResolve(true); setMigrateResolve(null); }
              setMigrateDialogOpen(false);
            }}>이전</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SettingsPage;
