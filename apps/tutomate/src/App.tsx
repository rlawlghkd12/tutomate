import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, ErrorBoundary, UpdateChecker, LockScreen, MemberManagementPage } from '@tutomate/ui';
import { useSettingsStore, useLockStore, useAutoLock, useAuthStore, appConfig, isElectron, OAUTH_PROVIDERS } from '@tutomate/core';
import type { OAuthProvider } from '@tutomate/core';
import React, { Suspense, useEffect } from 'react';

const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const CoursesPage = React.lazy(() => import('./pages/CoursesPage'));
const CourseDetailPage = React.lazy(() => import('./pages/CourseDetailPage'));
const StudentsPage = React.lazy(() => import('./pages/StudentsPage'));
const CalendarPage = React.lazy(() => import('./pages/CalendarPage'));
const RevenueManagementPage = React.lazy(() => import('./pages/RevenueManagementPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
import { toast, Toaster } from 'sonner';

function App() {
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
        <div className="flex h-screen items-center justify-center" style={{ background: 'hsl(var(--muted))' }}>
          <div className="w-full max-w-[380px] rounded-2xl p-12 text-center shadow-lg" style={{ background: 'hsl(var(--background))' }}>
            <img
              src="icon.png"
              alt="TutorMate"
              className="mx-auto mb-4 h-16 w-16 rounded-xl"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <h3 className="mb-1 text-xl font-semibold text-gray-900 whitespace-pre-line">{appConfig.welcomeTitle}</h3>
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
            <div className="mt-3 flex justify-center gap-3 text-[11px] text-muted-foreground/60">
              <a href="https://taktonlabs.com/terms" target="_blank" rel="noopener noreferrer" className="hover:underline">이용약관</a>
              <span>·</span>
              <a href="https://taktonlabs.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:underline">개인정보 처리방침</a>
            </div>
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
        <Layout>
          <Suspense fallback={<div style={{padding:24}}><div className="page-enter"><div className="grid grid-cols-3 sm:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=>(<div key={i} style={{borderRadius:8,border:'1px solid hsl(var(--border))',padding:12}}><div style={{height:12,width:'50%',borderRadius:4,background:'hsl(var(--muted))',animation:'skeleton-pulse 1.5s ease-in-out infinite',marginBottom:8}}/><div style={{height:24,width:'60%',borderRadius:4,background:'hsl(var(--muted))',animation:'skeleton-pulse 1.5s ease-in-out infinite'}}/></div>))}</div></div></div>}>
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
          </Suspense>
        </Layout>
      </Router>
      {isLocked && lockEnabled && <LockScreen />}
      <Toaster position="top-center" richColors />
    </ErrorBoundary>
  );
}

export default App;
