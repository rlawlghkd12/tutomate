import React, { useState } from 'react';
import { Layout as AntLayout, theme, Button } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import Navigation from './Navigation';
import { NotificationCenter } from '../notification/NotificationCenter';
import { useAppVersion, APP_NAME } from '../../config/version';
import { FLEX_BETWEEN } from '../../config/styles';

const { Header, Sider, Content } = AntLayout;
const { useToken } = theme;

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { token } = useToken();
  const [collapsed, setCollapsed] = useState(false);
  const APP_VERSION = useAppVersion();

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider
        width={150}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        collapsedWidth={60}
        trigger={null}
        theme="light"
        style={{
          overflow: 'auto',
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
          <span style={{ fontSize: 11, color: token.colorTextQuaternary }}>
            {collapsed ? `v${APP_VERSION}` : `${APP_NAME} v${APP_VERSION}`}
          </span>
        </div>
      </Sider>
      <AntLayout style={{ marginLeft: collapsed ? 60 : 150, transition: 'all 0.2s ease' }}>
        <Header
          style={{
            background: token.colorBgContainer,
            padding: '0 24px',
            ...FLEX_BETWEEN,
            borderBottom: `1px solid ${token.colorBorder}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16 }}
            />
            <h2 style={{ margin: 0 }}>통도예술마을협동조합</h2>
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
