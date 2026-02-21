import React, { useEffect, useState } from 'react';
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

interface NavigationProps {
  collapsed?: boolean;
}

const Navigation: React.FC<NavigationProps> = ({ collapsed = false }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // 접을 때: Sider 전환 끝난 후 inlineCollapsed 적용 (툴팁 깜빡임 방지)
  // 펼칠 때: 즉시 적용
  const [delayedCollapsed, setDelayedCollapsed] = useState(collapsed);
  useEffect(() => {
    if (collapsed) {
      const timer = setTimeout(() => setDelayedCollapsed(true), 200);
      return () => clearTimeout(timer);
    } else {
      setDelayedCollapsed(false);
    }
  }, [collapsed]);

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/') return '/';
    const base = '/' + path.split('/').filter(Boolean)[0];
    return base;
  };

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
      mode="inline"
      inlineCollapsed={delayedCollapsed}
      selectedKeys={[getSelectedKey()]}
      items={menuItems}
      onClick={handleMenuClick}
    />
  );
};

export default Navigation;
