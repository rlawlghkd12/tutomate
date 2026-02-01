import React from 'react';
import { Layout as AntLayout, theme } from 'antd';
import Navigation from './Navigation';
import { NotificationCenter } from '../notification/NotificationCenter';
import { useSettingsStore } from '../../stores/settingsStore';

const { Header, Sider, Content } = AntLayout;
const { useToken } = theme;

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { token } = useToken();
  const { theme: appTheme } = useSettingsStore();

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider
        width={150}
        breakpoint="lg"
        collapsedWidth="0"
        theme={appTheme === 'dark' ? 'dark' : 'light'}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          backgroundColor: appTheme === 'dark' ? '#0a0a0a' : undefined,
        }}
      >
        <div
          style={{
            height: 32,
            margin: 16,
            color: appTheme === 'dark' ? 'white' : token.colorText,
            fontSize: 20,
            fontWeight: 'bold',
            textAlign: 'center',
          }}
        >
          수강생 관리
        </div>
        <Navigation />
      </Sider>
      <AntLayout style={{ marginLeft: 150 }}>
        <Header
          style={{
            background: token.colorBgContainer,
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `1px solid ${token.colorBorder}`,
          }}
        >
          <h2 style={{ margin: 0 }}>수강생 관리 시스템</h2>
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
