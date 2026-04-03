import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, User, Calendar, DollarSign, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

interface NavigationProps {
  collapsed?: boolean;
}

const menuItems = [
  { key: '/', icon: LayoutDashboard, label: '대시보드' },
  { key: '/courses', icon: BookOpen, label: '강좌 관리' },
  { key: '/students', icon: User, label: '수강생 관리' },
  { key: '/calendar', icon: Calendar, label: '캘린더' },
  { key: '/revenue', icon: DollarSign, label: '수익 관리' },
  { key: '/settings', icon: Settings, label: '설정' },
];

const Navigation: React.FC<NavigationProps> = ({ collapsed = false }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/') return '/';
    return '/' + path.split('/').filter(Boolean)[0];
  };

  const selectedKey = getSelectedKey();

  return (
    <nav className="flex flex-col gap-1 px-2">
      {menuItems.map((item) => {
        const Icon = item.icon;
        const isActive = selectedKey === item.key;
        return (
          <button
            key={item.key}
            onClick={() => navigate(item.key)}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
              collapsed && 'justify-center px-2',
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </button>
        );
      })}
    </nav>
  );
};

export default Navigation;
