import { HashRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme as antdTheme, Button, Typography, Space, Spin, Layout, Menu } from 'antd';
import { DashboardOutlined, UserOutlined, KeyOutlined, TeamOutlined, LogoutOutlined } from '@ant-design/icons';
import koKR from 'antd/locale/ko_KR';
import { ErrorBoundary } from '@tutomate/ui';
import { useAuthStore, supabase, OAUTH_PROVIDERS, getAuthProviderLabel } from '@tutomate/core';
import type { OAuthProvider } from '@tutomate/core';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import LicensesPage from './pages/LicensesPage';
import OrganizationsPage from './pages/OrganizationsPage';
import { useEffect } from 'react';

const { Text, Title } = Typography;
const { Sider, Content } = Layout;

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAuthStore((s) => s.session);

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: '대시보드' },
    { key: '/users', icon: <UserOutlined />, label: '유저' },
    { key: '/licenses', icon: <KeyOutlined />, label: '라이선스' },
    { key: '/organizations', icon: <TeamOutlined />, label: '조직' },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={200} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ padding: '16px 16px 8px', fontWeight: 700, fontSize: 16 }}>
          TutorMate Admin
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ border: 'none' }}
        />
        <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, padding: '0 16px' }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            {session?.user?.email}
          </Text>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
            {getAuthProviderLabel()}
          </Text>
          <Button
            size="small"
            danger
            block
            icon={<LogoutOutlined />}
            onClick={async () => {
              await useAuthStore.getState().deactivateCloud();
            }}
          >
            로그아웃
          </Button>
        </div>
      </Sider>
      <Content style={{ padding: 24, background: '#f5f5f5' }}>
        <div style={{ background: '#fff', borderRadius: 8, padding: 24, minHeight: '100%' }}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/licenses" element={<LicensesPage />} />
            <Route path="/organizations" element={<OrganizationsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Content>
    </Layout>
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
    if (error) console.error('OAuth error:', error);
  };

  const themeConfig = { algorithm: antdTheme.defaultAlgorithm };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!session) {
    return (
      <ConfigProvider locale={koKR} theme={themeConfig}>
        <AntApp>
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh',
            background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e9f2 100%)',
          }}>
            <div style={{
              maxWidth: 380, width: '100%', textAlign: 'center',
              background: '#fff', borderRadius: 16, padding: '48px 36px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
            }}>
              <Title level={3} style={{ marginBottom: 4 }}>TutorMate Admin</Title>
              <Text type="secondary" style={{ display: 'block', marginBottom: 28 }}>
                관리자 계정으로 로그인하세요
              </Text>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {(Object.keys(OAUTH_PROVIDERS) as OAuthProvider[]).map((provider) => {
                  const cfg = OAUTH_PROVIDERS[provider];
                  if (!cfg) return null;
                  return (
                    <Button
                      key={provider}
                      block
                      size="large"
                      onClick={() => handleOAuthLogin(provider)}
                      style={{
                        background: cfg.background, color: cfg.color, border: cfg.border,
                        height: 48, borderRadius: 8, fontWeight: 500,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      }}
                    >
                      <span dangerouslySetInnerHTML={{ __html: cfg.iconSvg }} style={{ display: 'flex', alignItems: 'center' }} />
                      {cfg.label}
                    </Button>
                  );
                })}
              </Space>
            </div>
          </div>
        </AntApp>
      </ConfigProvider>
    );
  }

  return (
    <ErrorBoundary>
      <ConfigProvider locale={koKR} theme={themeConfig}>
        <AntApp>
          <Router>
            <AdminLayout />
          </Router>
        </AntApp>
      </ConfigProvider>
    </ErrorBoundary>
  );
}

export default App;
