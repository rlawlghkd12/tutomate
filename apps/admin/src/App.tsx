import { HashRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ErrorBoundary, Button } from '@tutomate/ui';
import { useAuthStore, supabase, OAUTH_PROVIDERS, getAuthProviderLabel } from '@tutomate/core';
import type { OAuthProvider } from '@tutomate/core';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import LicensesPage from './pages/LicensesPage';
import OrganizationsPage from './pages/OrganizationsPage';
import { useEffect } from 'react';
import { LayoutDashboard, User, Key, Users, LogOut, Loader2 } from 'lucide-react';
import { toast, Toaster } from 'sonner';

const menuItems = [
  { key: '/', icon: <LayoutDashboard className="h-4 w-4" />, label: '대시보드' },
  { key: '/users', icon: <User className="h-4 w-4" />, label: '유저' },
  { key: '/licenses', icon: <Key className="h-4 w-4" />, label: '라이선스' },
  { key: '/organizations', icon: <Users className="h-4 w-4" />, label: '조직' },
];

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAuthStore((s) => s.session);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-[200px] flex-col border-r bg-white">
        <div className="px-4 pb-2 pt-4 text-base font-bold">
          TutorMate Admin
        </div>
        <nav className="flex-1">
          {menuItems.map((item) => (
            <button
              key={item.key}
              onClick={() => navigate(item.key)}
              className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-gray-100 ${
                location.pathname === item.key ? 'bg-gray-100 font-medium text-primary' : 'text-gray-700'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="border-t p-4">
          <p className="mb-1 truncate text-xs text-muted-foreground">
            {session?.user?.email}
          </p>
          <p className="mb-2 text-[11px] text-muted-foreground">
            {getAuthProviderLabel()}
          </p>
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={async () => {
              await useAuthStore.getState().signOut();
            }}
          >
            <LogOut className="mr-1 h-3.5 w-3.5" />
            로그아웃
          </Button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 bg-gray-100 p-6">
        <div className="min-h-full rounded-lg bg-white p-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/licenses" element={<LicensesPage />} />
            <Route path="/organizations" element={<OrganizationsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function App() {
  const { initialize, loading, session } = useAuthStore();

  useEffect(() => {
    if (supabase) {
      supabase.auth.onAuthStateChange((event, session) => {
        useAuthStore.setState({ session });
        if (event === 'SIGNED_IN' && session) {
          if (window.location.hash.includes('access_token')) {
            window.location.hash = '';
          }
          initialize();
        }
      });
    }
    initialize();
  }, [initialize]);

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    if (!supabase) return;
    if (provider === 'naver') return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) {
      console.error('OAuth error:', error);
      toast.error(`로그인 실패: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <div className="flex h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-200">
          <div className="w-full max-w-[380px] rounded-2xl bg-white p-12 text-center shadow-lg">
            <h3 className="mb-1 text-xl font-semibold">TutorMate Admin</h3>
            <p className="mb-7 text-sm text-muted-foreground">
              관리자 계정으로 로그인하세요
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
          </div>
        </div>
        <Toaster position="top-center" richColors />
      </>
    );
  }

  return (
    <ErrorBoundary>
      <Router>
        <AdminLayout />
      </Router>
      <Toaster position="top-center" richColors />
    </ErrorBoundary>
  );
}

export default App;
