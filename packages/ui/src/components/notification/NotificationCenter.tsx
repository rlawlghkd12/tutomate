import React, { useCallback, useEffect } from 'react';
import {
  Bell,
  Check,
  Trash2,
  AlertTriangle,
  DollarSign,
  Info,
} from 'lucide-react';
import { useNotificationStore } from '@tutomate/core';
import type { Notification } from '@tutomate/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';

dayjs.extend(relativeTime);
dayjs.locale('ko');

/* ── inline style helpers (Tailwind v4 color classes are unreliable) ── */

const bellBtnStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  borderRadius: 'var(--radius)',
  border: 'none',
  background: 'transparent',
  color: 'hsl(var(--foreground))',
  cursor: 'pointer',
  transition: 'background 0.15s',
};

const badgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 2,
  right: 2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 18,
  height: 18,
  borderRadius: 9999,
  padding: '0 5px',
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1,
  background: 'hsl(var(--destructive))',
  color: 'hsl(var(--destructive-foreground))',
};

const popoverStyle: React.CSSProperties = {
  width: 420,
  padding: 0,
  background: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 16px',
  borderBottom: '1px solid hsl(var(--border))',
};

const headerTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'hsl(var(--foreground))',
};

const headerBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1.4,
  borderRadius: 'var(--radius)',
  border: 'none',
  cursor: 'pointer',
  transition: 'background 0.15s',
  background: 'transparent',
  color: 'hsl(var(--foreground))',
};

const headerBtnDeleteStyle: React.CSSProperties = {
  ...headerBtnStyle,
  color: 'hsl(var(--destructive))',
};

const emptyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '64px 0',
  fontSize: 14,
  color: 'hsl(var(--muted-foreground))',
};

const itemDeleteBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: 28,
  height: 28,
  borderRadius: 'var(--radius)',
  border: 'none',
  background: 'transparent',
  color: 'hsl(var(--muted-foreground))',
  cursor: 'pointer',
  transition: 'background 0.15s, color 0.15s',
};

/* ── priority badge colors (inline, dark-mode safe) ── */

const priorityStyles: Record<
  Notification['priority'],
  { text: string; style: React.CSSProperties }
> = {
  high: {
    text: '긴급',
    style: {
      background: 'hsl(0 80% 92%)',
      color: 'hsl(0 70% 40%)',
    },
  },
  medium: {
    text: '중요',
    style: {
      background: 'hsl(30 80% 92%)',
      color: 'hsl(30 70% 35%)',
    },
  },
  low: {
    text: '일반',
    style: {
      background: 'hsl(210 80% 92%)',
      color: 'hsl(210 70% 35%)',
    },
  },
};

/* ── icon colors (inline, dark-mode safe via CSS vars) ── */

const iconColor: Record<Notification['type'], string> = {
  payment_overdue: 'hsl(var(--destructive))',
  payment_reminder: 'hsl(var(--warning))',
  info: 'hsl(var(--info))',
};

export const NotificationCenter: React.FC = () => {
  const {
    notifications,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    getUnreadCount,
  } = useNotificationStore();

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const unreadCount = getUnreadCount();

  const getIcon = (type: Notification['type']) => {
    const c = iconColor[type] ?? 'hsl(var(--info))';
    switch (type) {
      case 'payment_overdue':
        return <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, color: c }} />;
      case 'payment_reminder':
        return <DollarSign style={{ width: 16, height: 16, flexShrink: 0, color: c }} />;
      case 'info':
      default:
        return <Info style={{ width: 16, height: 16, flexShrink: 0, color: c }} />;
    }
  };

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      if (!notification.isRead) {
        markAsRead(notification.id);
      }
    },
    [markAsRead],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          style={bellBtnStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'hsl(var(--accent))';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <Bell style={{ width: 20, height: 20 }} />
          {unreadCount > 0 && (
            <span style={badgeStyle}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" style={popoverStyle} className="w-auto p-0">
        {/* ── Header ── */}
        <div style={headerStyle}>
          <span style={headerTitleStyle}>
            알림 ({unreadCount}개 읽지 않음)
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {notifications.length > 0 && (
              <>
                <button
                  type="button"
                  style={headerBtnStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'hsl(var(--accent))';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    markAllAsRead();
                  }}
                >
                  <Check style={{ width: 14, height: 14 }} />
                  모두 읽음
                </button>
                <button
                  type="button"
                  style={headerBtnDeleteStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'hsl(var(--accent))';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    clearAll();
                  }}
                >
                  <Trash2 style={{ width: 14, height: 14 }} />
                  전체 삭제
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Notification list ── */}
        <ScrollArea style={{ maxHeight: 480 }}>
          {notifications.length === 0 ? (
            <div style={emptyStyle}>
              <Bell style={{ width: 32, height: 32, marginBottom: 8, opacity: 0.3 }} />
              새로운 알림이 없습니다
            </div>
          ) : (
            <div>
              {notifications.map((notification) => {
                const priority =
                  priorityStyles[notification.priority] ?? priorityStyles.low;

                const itemStyle: React.CSSProperties = {
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: '1px solid hsl(var(--border))',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  background: notification.isRead
                    ? 'transparent'
                    : 'hsl(var(--accent) / 0.35)',
                };

                return (
                  <div
                    key={notification.id}
                    style={itemStyle}
                    onClick={() => handleNotificationClick(notification)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'hsl(var(--accent))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = notification.isRead
                        ? 'transparent'
                        : 'hsl(var(--accent) / 0.35)';
                    }}
                  >
                    <div style={{ marginTop: 2 }}>
                      {getIcon(notification.type)}
                    </div>

                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontSize: 14,
                            color: 'hsl(var(--foreground))',
                            fontWeight: notification.isRead ? 400 : 600,
                          }}
                        >
                          {notification.title}
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 500,
                            lineHeight: 1.4,
                            ...priority.style,
                          }}
                        >
                          {priority.text}
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 13,
                          color: 'hsl(var(--muted-foreground))',
                          lineHeight: 1.5,
                        }}
                      >
                        {notification.message}
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: 'hsl(var(--muted-foreground))',
                          opacity: 0.7,
                        }}
                      >
                        {dayjs(notification.createdAt).fromNow()}
                      </div>
                    </div>

                    <button
                      type="button"
                      style={itemDeleteBtnStyle}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'hsl(var(--accent))';
                        e.currentTarget.style.color = 'hsl(var(--destructive))';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'hsl(var(--muted-foreground))';
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
