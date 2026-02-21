import React, { useState, useMemo } from 'react';
import { Layout as AntLayout, theme, Button, Typography } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, RightOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import Navigation from './Navigation';
import { NotificationCenter } from '../notification/NotificationCenter';
import { useAppVersion, APP_NAME } from '../../config/version';
import { useSettingsStore } from '../../stores/settingsStore';
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

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { token } = useToken();
  const [collapsed, setCollapsed] = useState(false);
  const APP_VERSION = useAppVersion();
  const organizationName = useSettingsStore((s) => s.organizationName);
  const location = useLocation();

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
        <div style={{ marginTop: 'auto', padding: '12px 16px', textAlign: 'center' }}>
          <span style={{ fontSize: 12, color: token.colorTextTertiary }}>
            {collapsed ? `v${APP_VERSION}` : `${APP_NAME} v${APP_VERSION}`}
          </span>
        </div>
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
            <span style={{ fontWeight: 600, fontSize: 15 }}>{organizationName}</span>
            {pageTitle && (
              <>
                <RightOutlined style={{ fontSize: 11, color: token.colorTextQuaternary }} />
                <Text style={{ fontSize: 15, color: token.colorTextSecondary }}>{pageTitle}</Text>
              </>
            )}
          </div>
          <NotificationCenter />
        </Header>
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
