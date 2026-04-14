import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Users, Calendar, DollarSign, Settings, UserCog } from 'lucide-react';
import { motion } from 'motion/react';
import { canManageMembers } from '@tutomate/core';

const mainItems = [
  { key: '/', icon: LayoutDashboard, label: '대시보드' },
  { key: '/courses', icon: BookOpen, label: '강좌 관리' },
  { key: '/students', icon: Users, label: '수강생 관리' },
  { key: '/calendar', icon: Calendar, label: '캘린더' },
  { key: '/revenue', icon: DollarSign, label: '수익 관리' },
];

const bottomItems = [
  { key: '/settings', icon: Settings, label: '설정' },
];

const Navigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const ownerItems = canManageMembers()
    ? [{ key: '/members', icon: UserCog, label: '멤버 관리' }]
    : [];

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/') return '/';
    return '/' + path.split('/').filter(Boolean)[0];
  };

  const selectedKey = getSelectedKey();

  const renderItem = (item: typeof mainItems[0]) => {
    const Icon = item.icon;
    const isActive = selectedKey === item.key;
    return (
      <button
        key={item.key}
        onClick={() => navigate(item.key)}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '9px 12px',
          border: 'none',
          borderRadius: 'calc(var(--radius) - 2px)',
          fontSize: 'inherit',
          fontWeight: isActive ? 600 : 450,
          cursor: 'pointer',
          background: 'transparent',
          color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          textAlign: 'left' as const,
          transition: 'color 0.15s ease',
          zIndex: 1,
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.color = 'hsl(var(--foreground))';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.color = 'hsl(var(--muted-foreground))';
          }
        }}
      >
        {/* Apple-style sliding background pill */}
        {isActive && (
          <motion.span
            layoutId="nav-active-pill"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              background: 'hsl(var(--primary) / 0.1)',
              zIndex: -1,
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          />
        )}
        <Icon style={{ width: 18, height: 18, flexShrink: 0 }} />
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <nav style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '4px 10px 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {mainItems.map(renderItem)}
      </div>
      <div style={{ marginTop: 'auto', borderTop: '1px solid hsl(var(--border))', paddingTop: 8, paddingBottom: 12 }}>
        {ownerItems.map(renderItem)}
        {bottomItems.map(renderItem)}
      </div>
    </nav>
  );
};

export default Navigation;
