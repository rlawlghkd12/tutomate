import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Users, Calendar, DollarSign, Settings, UserCog, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { canManageMembers, useAuthStore } from '@tutomate/core';

// AI 어시스턴트를 노출할 조직 (파일럿 한정)
const AI_ENABLED_ORG_IDS = new Set([
  '85a37f47-7c4e-4c70-842d-379fd184d8a5',
  'c41c7046-5698-4a46-a407-f638d3301b5e',
]);

const baseMainItems = [
  { key: '/', icon: LayoutDashboard, label: '대시보드' },
  { key: '/courses', icon: BookOpen, label: '강좌 관리' },
  { key: '/students', icon: Users, label: '수강생 관리' },
  { key: '/calendar', icon: Calendar, label: '캘린더' },
  { key: '/revenue', icon: DollarSign, label: '수익 관리' },
];

const aiItem = { key: '/ai-chat', icon: Sparkles, label: 'AI 어시스턴트' };

const bottomItems = [
  { key: '/settings', icon: Settings, label: '설정' },
];

const Navigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const organizationId = useAuthStore((s) => s.organizationId);
  const mainItems = organizationId && AI_ENABLED_ORG_IDS.has(organizationId)
    ? [...baseMainItems, aiItem]
    : baseMainItems;

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
