import React from 'react';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  BookOutlined,
  UserOutlined,
  CalendarOutlined,
  DollarOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSettingsStore } from '../../stores/settingsStore';

interface NavigationProps {
  collapsed?: boolean;
}

const Navigation: React.FC<NavigationProps> = ({ collapsed = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useSettingsStore();

  const menuItems: MenuProps['items'] = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '대시보드',
    },
    {
      key: '/courses',
      icon: <BookOutlined />,
      label: '강좌 관리',
    },
    {
      key: '/students',
      icon: <UserOutlined />,
      label: '수강생 관리',
    },
    {
      key: '/calendar',
      icon: <CalendarOutlined />,
      label: '캘린더',
    },
    {
      key: '/revenue',
      icon: <DollarOutlined />,
      label: '수익 관리',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '설정',
    },
  ];

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    navigate(e.key);
  };

  return (
    <Menu
      theme={theme === 'dark' ? 'dark' : 'light'}
      mode="inline"
      inlineCollapsed={collapsed}
      selectedKeys={[location.pathname]}
      items={menuItems}
      onClick={handleMenuClick}
      style={{
        backgroundColor: theme === 'dark' ? '#0a0a0a' : undefined,
      }}
    />
  );
};

export default Navigation;
