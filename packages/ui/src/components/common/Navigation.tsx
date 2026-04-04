import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Users, Calendar, DollarSign, Settings } from 'lucide-react';

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

const navItemBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  padding: '12px 16px',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background 0.15s, color 0.15s',
  background: 'transparent',
  color: 'hsl(var(--muted-foreground))',
  textAlign: 'left' as const,
};

const navItemActive: React.CSSProperties = {
  ...navItemBase,
  background: 'hsl(var(--accent))',
  color: 'hsl(var(--foreground))',
  fontWeight: 600,
};

const Navigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

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
        style={isActive ? navItemActive : navItemBase}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'hsl(var(--accent))';
            e.currentTarget.style.color = 'hsl(var(--foreground))';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'hsl(var(--muted-foreground))';
          }
        }}
      >
        <Icon style={{ width: 20, height: 20, flexShrink: 0 }} />
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <nav style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 12px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {mainItems.map(renderItem)}
      </div>
      <div style={{ marginTop: 'auto', borderTop: '1px solid hsl(var(--border))', paddingTop: 8, paddingBottom: 12 }}>
        {bottomItems.map(renderItem)}
      </div>
    </nav>
  );
};

export default Navigation;
