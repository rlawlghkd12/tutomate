import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, ErrorBoundary, UpdateChecker, LockScreen, MemberManagementPage } from '@tutomate/ui';
import { useSettingsStore, useLockStore, useAutoLock, useAuthStore, appConfig, isElectron, OAUTH_PROVIDERS, getThemeMode } from '@tutomate/core';
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
  const autoThemeSync = useSettingsStore((s) => s.autoThemeSync);
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

    const applyTheme = () => {
      let active = theme;
      if (autoThemeSync) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        active = prefersDark ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', active);
      document.documentElement.classList.toggle('dark', getThemeMode(active) === 'dark');
    };

    applyTheme();

    if (autoThemeSync) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', applyTheme);
      return () => mq.removeEventListener('change', applyTheme);
    }
  }, [theme, autoThemeSync]);

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
    const handleStageMove = (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const dx = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const dy = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
      const el = e.currentTarget;
      el.style.setProperty('--plx-dash-x', `${dx * -30}px`);
      el.style.setProperty('--plx-dash-y', `${dy * -22}px`);
      el.style.setProperty('--dash-ry', `${dx * 10}deg`);
      el.style.setProperty('--dash-rx', `${dy * -8}deg`);
    };
    const handleStageLeave = (e: React.MouseEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      el.style.setProperty('--plx-dash-x', '0px');
      el.style.setProperty('--plx-dash-y', '0px');
      el.style.setProperty('--dash-ry', '0deg');
      el.style.setProperty('--dash-rx', '0deg');
    };
    return (
      <ErrorBoundary>
        <div
          className="login-stage flex h-screen items-center justify-center lg:justify-end lg:pr-[8vw]"
          style={{ background: 'hsl(var(--layout-bg))' }}
          onMouseMove={handleStageMove}
          onMouseLeave={handleStageLeave}
        >
          <div className="login-orb login-orb-1" aria-hidden="true" />
          <div className="login-orb login-orb-2" aria-hidden="true" />
          <div className="login-orb login-orb-3" aria-hidden="true" />
          <div className="login-grain" aria-hidden="true" />
          <div className="login-header">
            <div className="login-header-brand">{appConfig.appName}</div>
            <div className="login-header-greeting">
              {'환영합니다.'.split('').map((ch, i) => (
                <span key={i} className="login-char" style={{ animationDelay: `${0.8 + i * 0.11}s` }}>
                  {ch}
                </span>
              ))}
            </div>
          </div>
          <div className="login-dashboard" aria-hidden="true">
            <div className="login-dashboard-frame">
              <div className="login-dashboard-chrome">
                <span className="login-dashboard-dot" />
                <span className="login-dashboard-dot" />
                <span className="login-dashboard-dot" />
                <span className="login-dashboard-title">TutorMate · 대시보드</span>
              </div>
              <div className="login-dashboard-body">
                <div className="login-dashboard-stats">
                  <div className="login-dashboard-stat">
                    <span className="login-dashboard-stat-label">강좌</span>
                    <span className="login-dashboard-stat-value">12</span>
                  </div>
                  <div className="login-dashboard-stat">
                    <span className="login-dashboard-stat-label">수강생</span>
                    <span className="login-dashboard-stat-value">84</span>
                  </div>
                  <div className="login-dashboard-stat">
                    <span className="login-dashboard-stat-label">납부</span>
                    <span className="login-dashboard-stat-value-sm">5.4M</span>
                  </div>
                  <div className="login-dashboard-stat">
                    <span className="login-dashboard-stat-label">납부율</span>
                    <span className="login-dashboard-stat-value success">92%</span>
                  </div>
                  <div className="login-dashboard-stat">
                    <span className="login-dashboard-stat-label">완납</span>
                    <span className="login-dashboard-stat-value success">77</span>
                  </div>
                  <div className="login-dashboard-stat">
                    <span className="login-dashboard-stat-label">미납</span>
                    <span className="login-dashboard-stat-value error">7</span>
                  </div>
                </div>
                <div className="login-dashboard-section">
                  <div className="login-dashboard-section-title">전체 강좌</div>
                  <div className="login-dashboard-courses">
                    {[
                      { name: '피아노 개인레슨', teacher: '김민지', p: 85, c: 'c1' },
                      { name: '필라테스', teacher: '이향희', p: 70, c: 'c2' },
                      { name: '드로잉 기초', teacher: '박서연', p: 60, c: 'c3' },
                      { name: '숟가락 난타', teacher: '정수미', p: 92, c: 'c4' },
                      { name: '동양화', teacher: '한지원', p: 45, c: 'c5' },
                      { name: '바이올린', teacher: '최영수', p: 80, c: 'c6' },
                    ].map((course, i) => (
                      <div key={i} className="login-dashboard-course">
                        <div className={`login-dashboard-course-accent ${course.c}`} />
                        <div className="login-dashboard-course-name">{course.name}</div>
                        <div className="login-dashboard-course-meta">{course.teacher}</div>
                        <div className="login-dashboard-course-row">
                          <div className={`login-dashboard-course-progress ${course.c}`} style={{ ['--p' as string]: `${course.p}%` }} />
                          <div className="login-dashboard-course-pct">{course.p}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="login-dashboard-charts">
                  <div className="login-dashboard-chart-revenue">
                    <div className="login-dashboard-section-title">강좌별 수익</div>
                  </div>
                  <div className="login-dashboard-chart-status">
                    <div className="login-dashboard-pie" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="relative z-10 w-full max-w-[360px] rounded-2xl py-12 px-8 text-center shadow-lg" style={{ background: 'hsl(var(--background))' }}>
            <img
              src="icon.png"
              alt="TutorMate"
              className="login-icon mx-auto mb-5 h-16 w-16 rounded-xl"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <p className="login-sub mb-7 text-sm text-muted-foreground">
              소셜 계정으로 로그인하세요
            </p>
            <div className="flex flex-col gap-3">
              {(Object.keys(OAUTH_PROVIDERS) as OAuthProvider[]).map((provider, idx) => {
                const cfg = OAUTH_PROVIDERS[provider];
                if (!cfg) return null;
                return (
                  <button
                    key={provider}
                    onClick={() => handleOAuthLogin(provider)}
                    className="login-item flex h-14 w-full items-center justify-center gap-2.5 rounded-lg text-sm font-medium transition-all hover:-translate-y-0.5 hover:shadow-lg hover:opacity-95"
                    style={{
                      background: cfg.background, color: cfg.color, border: cfg.border,
                      animationDelay: `${0.4 + idx * 0.08}s`,
                    }}
                  >
                    <span dangerouslySetInnerHTML={{ __html: cfg.iconSvg }} className="flex items-center" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            <p className="login-footer mt-6 text-xs text-muted-foreground">
              문의: {appConfig.contactInfo}
            </p>
            <div className="login-footer mt-3 flex justify-center gap-3 text-[0.73rem] text-muted-foreground/60">
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
