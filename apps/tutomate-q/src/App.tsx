import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, ErrorBoundary, UpdateChecker, GlobalSearch, useGlobalSearch, LockScreen, LicenseKeyInput, Button, Dialog, DialogContent, DialogHeader, DialogTitle, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@tutomate/ui';
import { useSettingsStore, useLockStore, useAutoLock, useLicenseStore, useAuthStore, migrateOrgData, reloadAllStores, appConfig, isElectron, OAUTH_PROVIDERS } from '@tutomate/core';
import type { OAuthProvider } from '@tutomate/core';
import DashboardPage from './pages/DashboardPage';
import CoursesPage from './pages/CoursesPage';
import CourseDetailPage from './pages/CourseDetailPage';
import StudentsPage from './pages/StudentsPage';
import CalendarPage from './pages/CalendarPage';
import RevenueManagementPage from './pages/RevenueManagementPage';
import SettingsPage from './pages/SettingsPage';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast, Toaster } from 'sonner';

function App() {
  const { visible, close } = useGlobalSearch();
  const { theme, fontSize, loadSettings } = useSettingsStore();
  const { loadLicense, activateLicense } = useLicenseStore();
  const { initialize, loading: authLoading, session, needsSetup, signInWithOAuth, startTrial } = useAuthStore();
  const { isEnabled: lockEnabled, isLocked } = useLockStore();
  useAutoLock();
  const [licenseInput, setLicenseInput] = useState(['', '', '', '']);
  const [activating, setActivating] = useState(false);
  const [showMigrateDialog, setShowMigrateDialog] = useState(false);
  const [migrateResolve, setMigrateResolve] = useState<((v: boolean) => void) | null>(null);

  useEffect(() => {
    loadSettings();
    loadLicense();
    initialize();
  }, [loadSettings, loadLicense, initialize]);

  // OAuth deep link 리스너
  useEffect(() => {
    if (!isElectron()) return;
    return window.electronAPI.onOAuthCallback((code) => {
      useAuthStore.getState().handleOAuthCallback(code).catch((err) => {
        toast.error(`로그인 실패: ${err.message}`);
      });
    });
  }, []);

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    try {
      await signInWithOAuth(provider);
    } catch (err: any) {
      toast.error(`로그인 실패: ${err.message}`);
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
            setShowMigrateDialog(true);
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
            toast.success('라이선스가 활성화되었습니다!');
          }
        } else {
          toast.success('라이선스가 활성화되었습니다!');
        }
        setLicenseInput(['', '', '', '']);
      } else if (result.result === 'invalid_format') {
        toast.error(`유효하지 않은 형식입니다. 형식: ${appConfig.licenseFormatHint}`);
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

  const handleStartTrial = async () => {
    try {
      await startTrial();
    } catch (err: any) {
      toast.error(`체험판 시작 실패: ${err.message}`);
    }
  };

  useEffect(() => {
    document.documentElement.style.backgroundColor = '';
    document.body.style.backgroundColor = '';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const fontSizeMap: Record<string, number> = {
      xs: 11, small: 12, medium: 14, large: 16, xl: 18, xxl: 20, xxxl: 22,
    };
    const px = fontSizeMap[fontSize] ?? 14;
    document.documentElement.style.setProperty('--font-size-base-value', `${px}px`);
    document.documentElement.style.fontSize = `${px}px`;
  }, [fontSize]);

  if (isLocked && lockEnabled) {
    return (
      <ErrorBoundary>
        <LockScreen />
        <Toaster position="top-center" richColors />
      </ErrorBoundary>
    );
  }

  if (authLoading) {
    return null;
  }

  // Step 1: 로그인 화면 (세션 없음)
  if (!session) {
    return (
      <ErrorBoundary>
        <div className="flex h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-200">
          <div className="w-full max-w-[380px] rounded-2xl bg-white p-12 text-center shadow-lg">
            <img
              src="icon.png"
              alt="TutorMate"
              className="mx-auto mb-4 h-16 w-16 rounded-xl"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <h3 className="mb-1 text-xl font-semibold">{appConfig.welcomeTitle}</h3>
            <p className="mb-7 text-sm text-muted-foreground">
              소셜 계정으로 로그인하세요
            </p>
            <div className="flex flex-col gap-3">
              {(Object.keys(OAUTH_PROVIDERS) as OAuthProvider[]).map((provider) => {
                const cfg = OAUTH_PROVIDERS[provider];
                if (!cfg) return null;
                return (
                  <button
                    key={provider}
                    onClick={() => handleOAuthLogin(provider)}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
                    style={{
                      background: cfg.background, color: cfg.color, border: cfg.border,
                    }}
                  >
                    <span dangerouslySetInnerHTML={{ __html: cfg.iconSvg }} className="flex items-center" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              문의: {appConfig.contactInfo}
            </p>
          </div>
        </div>
        <Toaster position="top-center" richColors />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Dialog open={needsSetup}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{appConfig.welcomeTitle}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-6">
            <div>
              <p className="font-semibold">라이선스 키가 있으신가요?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                키를 직접 입력하거나 전체 붙여넣기 하세요
              </p>
              <div className="mt-3">
                <LicenseKeyInput value={licenseInput} onChange={setLicenseInput} onPressEnter={handleActivateLicense} />
              </div>
              <Button
                onClick={handleActivateLicense}
                disabled={activating}
                className="mt-4 w-full"
              >
                {activating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                라이선스 활성화
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={handleStartTrial}
              className="w-full"
            >
              체험판으로 시작 (강좌 5개, 강좌당 수강생 10명 제한)
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              라이선스 문의: {appConfig.contactInfo}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showMigrateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기존 데이터 이전</AlertDialogTitle>
            <AlertDialogDescription>
              기존 데이터를 라이선스 계정으로 이전하시겠습니까? "새로 시작"을 선택하면 빈 상태로 시작합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowMigrateDialog(false);
              migrateResolve?.(false);
            }}>
              새로 시작
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowMigrateDialog(false);
              migrateResolve?.(true);
            }}>
              이전
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UpdateChecker autoCheck={true} checkInterval={60} />
      <Router>
        <GlobalSearch visible={visible} onClose={close} />
        <Layout>
          <ErrorBoundary>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/courses/:id" element={<CourseDetailPage />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/revenue" element={<RevenueManagementPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ErrorBoundary>
        </Layout>
      </Router>
      {isLocked && lockEnabled && <LockScreen />}
      <Toaster position="top-center" richColors />
    </ErrorBoundary>
  );
}

export default App;
