import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Layout as AntLayout, theme, Button, Typography, Tag, Alert } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, RightOutlined, WifiOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import Navigation from './Navigation';
import { NotificationCenter } from '../notification/NotificationCenter';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLicenseStore } from '../../stores/licenseStore';
import { FLEX_BETWEEN } from '../../config/styles';

const { Header, Sider, Content } = AntLayout;
const { useToken } = theme;
const { Text } = Typography;

interface LayoutProps {
  children: React.ReactNode;
}

const PAGE_TITLES: Record<string, string> = {
  '/': '대시보드',
  '/courses': '강좌 관리',
  '/students': '수강생 관리',
  '/calendar': '캘린더',
  '/revenue': '수익 관리',
  '/settings': '설정',
};

const AUTO_COLLAPSE_WIDTH = 860;

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { token } = useToken();
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < AUTO_COLLAPSE_WIDTH);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [offlineDismissed, setOfflineDismissed] = useState(false);
  const organizationName = useSettingsStore((s) => s.organizationName);
  const getPlan = useLicenseStore((s) => s.getPlan);
  const isTrial = getPlan() === 'trial';
  const location = useLocation();
  const navigate = useNavigate();

  const handleResize = useCallback(() => {
    const shouldCollapse = window.innerWidth < AUTO_COLLAPSE_WIDTH;
    setCollapsed((prev) => {
      if (shouldCollapse && !prev) return true;
      if (!shouldCollapse && prev) return false;
      return prev;
    });
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  useEffect(() => {
    const goOffline = () => { setOffline(true); setOfflineDismissed(false); };
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  const pageTitle = useMemo(() => {
    const path = location.pathname;
    if (PAGE_TITLES[path]) return PAGE_TITLES[path];
    // /courses/:id 같은 하위 경로
    const base = '/' + path.split('/').filter(Boolean)[0];
    if (base === '/courses' && path !== '/courses') return '강좌 상세';
    return PAGE_TITLES[base] || '';
  }, [location.pathname]);

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider
        width={180}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        collapsedWidth={60}
        trigger={null}
        theme="light"
        style={{
          overflow: 'hidden',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          transition: 'all 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ height: 16 }} />
        <Navigation collapsed={collapsed} />
        {isTrial && (
          <div style={{ marginTop: 'auto', padding: collapsed ? '12px 4px' : '12px 16px', textAlign: 'center' }}>
            <Tag
              color="orange"
              style={{ margin: 0, fontSize: collapsed ? 11 : undefined, cursor: 'pointer' }}
              onClick={() => navigate('/settings?tab=license')}
            >체험판</Tag>
          </div>
        )}
      </Sider>
      <AntLayout style={{ marginLeft: collapsed ? 60 : 180, transition: 'all 0.2s ease' }}>
        <Header
          style={{
            background: token.colorBgContainer,
            padding: '0 24px',
            ...FLEX_BETWEEN,
            borderBottom: `1px solid ${token.colorBorder}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16 }}
            />
            <span style={{ color: token.colorTextTertiary }}>{organizationName}</span>
            {pageTitle && (
              <>
                <RightOutlined style={{ fontSize: '0.7em', color: token.colorTextQuaternary }} />
                <Text style={{ fontWeight: 600 }}>{pageTitle}</Text>
              </>
            )}
          </div>
          <NotificationCenter />
        </Header>
        {offline && !offlineDismissed && (
          <Alert
            message={<><WifiOutlined /> 인터넷에 연결되어 있지 않습니다</>}
            type="warning"
            closable
            onClose={() => setOfflineDismissed(true)}
            banner
          />
        )}
        <Content style={{ margin: '24px 16px 0', overflow: 'initial' }}>
          <div style={{ padding: 24, background: token.colorBgContainer, minHeight: 360 }}>
            {children}
          </div>
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
