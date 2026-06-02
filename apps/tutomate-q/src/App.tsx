import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout, ErrorBoundary, UpdateChecker, GlobalSearch, useGlobalSearch, LockScreen, MemberManagementPage, QuarterSelect } from '@tutomate/ui';
import { useSettingsStore, useLockStore, useAutoLock, useAuthStore, appConfig, isElectron, OAUTH_PROVIDERS } from '@tutomate/core';
import type { OAuthProvider } from '@tutomate/core';
import DashboardPage from './pages/DashboardPage';
import CoursesPage from './pages/CoursesPage';
import CourseDetailPage from './pages/CourseDetailPage';
import StudentsPage from './pages/StudentsPage';
import CalendarPage from './pages/CalendarPage';
import RevenueManagementPage from './pages/RevenueManagementPage';
import SettingsPage from './pages/SettingsPage';
import { useEffect } from 'react';
import { toast, Toaster } from 'sonner';

function RoutedContent() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/:id" element={<CourseDetailPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/revenue" element={<RevenueManagementPage />} />
        <Route path="/members" element={<MemberManagementPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

function App() {
  const { visible, close } = useGlobalSearch();
  const theme = useSettingsStore((s) => s.theme);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const initialize = useAuthStore((s) => s.initialize);
  const authLoading = useAuthStore((s) => s.loading);
  const session = useAuthStore((s) => s.session);
  const signInWithOAuth = useAuthStore((s) => s.signInWithOAuth);
  const lockEnabled = useLockStore((s) => s.isEnabled);
  const isLocked = useLockStore((s) => s.isLocked);
  useAutoLock();

  useEffect(() => {
    loadSettings();
    initialize();
  }, [loadSettings, initialize]);

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

  // 로그인 화면 (세션 없음)
  if (!session) {
    return (
      <ErrorBoundary>
        <div
          className="relative flex h-screen items-center justify-center overflow-hidden px-6"
          style={{ background: 'hsl(36 33% 96%)' }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(58% 50% at 50% 32%, hsl(40 45% 99%), transparent 72%)' }}
          />
          <div className="relative w-full max-w-[400px] rounded-3xl border border-border/60 bg-card px-10 py-12 text-center [box-shadow:var(--shadow-lg)]">
            <img
              src="icon.png"
              alt="TutorMate"
              className="mx-auto mb-6 h-20 w-20 rounded-2xl [box-shadow:var(--shadow-sm)]"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <h1 className="mb-2 break-keep text-[1.7rem] font-bold leading-snug text-foreground" style={{ letterSpacing: '-0.02em' }}>
              {appConfig.welcomeTitle}
            </h1>
            <p className="mb-9 text-base text-muted-foreground">
              소셜 계정으로 간편하게 시작하세요
            </p>
            <div className="flex flex-col gap-3">
              {(Object.keys(OAUTH_PROVIDERS) as OAuthProvider[]).map((provider) => {
                const cfg = OAUTH_PROVIDERS[provider];
                if (!cfg) return null;
                return (
                  <button
                    key={provider}
                    onClick={() => handleOAuthLogin(provider)}
                    className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl text-base font-semibold shadow-sm transition-transform duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0"
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
            <p className="mt-9 text-sm text-muted-foreground">
              문의 {appConfig.contactInfo}
            </p>
          </div>
        </div>
        <Toaster position="top-center" richColors />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <UpdateChecker autoCheck={true} checkInterval={60} />
      <Router>
        <GlobalSearch visible={visible} onClose={close} />
        <Layout sidebarExtra={<QuarterSelect />}>
          <RoutedContent />
        </Layout>
      </Router>
      {isLocked && lockEnabled && <LockScreen />}
      <Toaster position="top-center" richColors />
    </ErrorBoundary>
  );
}

export default App;
