import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Check,
  Trash2,
  AlertTriangle,
  DollarSign,
  Info,
  ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '@tutomate/core';
import type { Notification } from '@tutomate/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';

dayjs.extend(relativeTime);
dayjs.locale('ko');

/* ── inline style helpers (Tailwind v4 color classes are unreliable here) ── */

const bellBtnStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 44,
  height: 44,
  borderRadius: 'var(--radius)',
  border: 'none',
  background: 'transparent',
  color: 'hsl(var(--foreground))',
  cursor: 'pointer',
  transition: 'background 0.15s',
};

const badgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 20,
  height: 20,
  borderRadius: 9999,
  padding: '0 6px',
  fontSize: '0.73rem',
  fontWeight: 700,
  lineHeight: 1,
  background: 'hsl(var(--destructive))',
  color: 'hsl(var(--destructive-foreground))',
};

const popoverStyle: React.CSSProperties = {
  width: 560,
  padding: 0,
  background: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
  border: '1px solid hsl(var(--border) / 0.5)',
  borderRadius: 22,
  overflow: 'hidden',
  boxShadow:
    '0 24px 60px -16px rgba(0, 0, 0, 0.24), 0 8px 20px -10px rgba(0, 0, 0, 0.12)',
  // 화면 높이에 맞춰 팝오버 전체가 잘리지 않도록 제한 (짧은 창에서 하단 잘림 방지)
  // Radix 변수가 비어 있는 환경을 대비해 85vh 폴백을 둔다 — 폴백이 없으면 cap이 사라져 스크롤이 안 됨
  display: 'flex',
  flexDirection: 'column',
  maxHeight: 'var(--radix-popover-content-available-height, 85vh)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '18px 22px',
  borderBottom: '1px solid hsl(var(--border) / 0.5)',
  flexShrink: 0,
};

const headerTitleStyle: React.CSSProperties = {
  fontSize: '1.0625rem',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  color: 'hsl(var(--foreground))',
};

const headerBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '8px 13px',
  fontSize: '0.875rem',
  fontWeight: 600,
  lineHeight: 1.3,
  borderRadius: 10,
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
  padding: '72px 0',
  fontSize: '0.875rem',
  color: 'hsl(var(--muted-foreground))',
};

/* ── priority meta: the single primary urgency signal (Korean text + color) ── */

const priorityMeta: Record<
  Notification['priority'],
  { label: string; color: string }
> = {
  high: { label: '긴급', color: 'hsl(var(--error))' },
  medium: { label: '중요', color: 'hsl(var(--warning))' },
  low: { label: '일반', color: 'hsl(var(--info))' },
};

const priorityRank: Record<Notification['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/* ── type icon is a NEUTRAL category indicator (no urgency color) ── */

const getTypeIcon = (type: Notification['type']) => {
  const common = {
    width: 16,
    height: 16,
    flexShrink: 0,
    color: 'hsl(var(--muted-foreground))',
  } as const;
  const chip: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    flexShrink: 0,
    borderRadius: 9,
    background: 'hsl(var(--accent) / 0.55)',
  };
  let icon: React.ReactNode;
  switch (type) {
    case 'payment_overdue':
      icon = <AlertTriangle style={common} />;
      break;
    case 'payment_reminder':
      icon = <DollarSign style={common} />;
      break;
    default:
      icon = <Info style={common} />;
  }
  return <span style={chip}>{icon}</span>;
};

/* ── navigation target per related entity ── */

const navTargetFor = (
  n: Notification,
): { href: string; label: string } | null => {
  if (!n.relatedType) return null;
  switch (n.relatedType) {
    case 'course':
      return n.relatedId
        ? { href: `/courses/${n.relatedId}`, label: '강좌 보기' }
        : null;
    case 'student':
      return n.relatedId
        ? { href: `/students?edit=${n.relatedId}`, label: '학생 보기' }
        : null;
    case 'enrollment':
      return { href: '/revenue', label: '수익 관리 보기' };
    default:
      return null;
  }
};

export const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
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

  // 안읽음 먼저 → 우선순위 높은 순 → 최신순
  const sorted = useMemo(() => {
    return [...notifications].sort((a, b) => {
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      if (a.priority !== b.priority)
        return priorityRank[a.priority] - priorityRank[b.priority];
      return dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf();
    });
  }, [notifications]);

  const handleItemClick = useCallback(
    (n: Notification) => {
      if (!n.isRead) markAsRead(n.id);
      const target = navTargetFor(n);
      if (target) {
        setOpen(false);
        navigate(target.href);
      }
    },
    [markAsRead, navigate],
  );

  const handleDelete = useCallback(
    (n: Notification) => {
      if (window.confirm(`'${n.title}' 알림을 삭제할까요?`)) {
        deleteNotification(n.id);
      }
    },
    [deleteNotification],
  );

  const handleClearAll = useCallback(() => {
    if (window.confirm('모든 알림을 삭제할까요?')) {
      clearAll();
    }
  }, [clearAll]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unreadCount > 0 ? `알림, 안 읽음 ${unreadCount}개` : '알림'
          }
          style={bellBtnStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'hsl(var(--accent))';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
          onFocus={(e) => {
            e.currentTarget.style.background = 'hsl(var(--accent))';
            e.currentTarget.style.outline = '2px solid hsl(var(--foreground))';
            e.currentTarget.style.outlineOffset = '2px';
          }}
          onBlur={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.outline = 'none';
          }}
        >
          <Bell style={{ width: 22, height: 22 }} />
          {unreadCount > 0 && (
            <span style={badgeStyle}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" style={popoverStyle} className="w-auto p-0">
        {/* hover/focus 시에만 삭제 버튼 노출 — 평소엔 깔끔하게 숨김 */}
        <style>{`
          .tm-notif-del {
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.15s ease;
          }
          .tm-notif-row:hover .tm-notif-del,
          .tm-notif-del:focus-visible {
            opacity: 1;
            pointer-events: auto;
          }
        `}</style>
        {/* ── Header ── */}
        <div style={headerStyle}>
          <span style={headerTitleStyle}>
            알림{unreadCount > 0 ? ` · 안읽음 ${unreadCount}개` : ''}
          </span>
          {notifications.length > 0 && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                style={headerBtnStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'hsl(var(--accent))';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                onFocus={(e) => {
                  e.currentTarget.style.background = 'hsl(var(--accent))';
                  e.currentTarget.style.outline = '2px solid hsl(var(--foreground))';
                  e.currentTarget.style.outlineOffset = '1px';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.outline = 'none';
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  markAllAsRead();
                }}
              >
                <Check style={{ width: 16, height: 16 }} />
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
                onFocus={(e) => {
                  e.currentTarget.style.background = 'hsl(var(--accent))';
                  e.currentTarget.style.outline = '2px solid hsl(var(--destructive))';
                  e.currentTarget.style.outlineOffset = '1px';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.outline = 'none';
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearAll();
                }}
              >
                <Trash2 style={{ width: 16, height: 16 }} />
                전체 삭제
              </button>
            </div>
          )}
        </div>

        {/* ── Notification list ── */}
        <div style={{ flex: 1, minHeight: 0, maxHeight: 520, overflowY: 'auto', overscrollBehavior: 'contain' }}>
          {sorted.length === 0 ? (
            <div style={emptyStyle}>
              <Bell
                style={{ width: 36, height: 36, marginBottom: 10, opacity: 0.3 }}
              />
              새로운 알림이 없습니다
            </div>
          ) : (
            <div role="region" aria-label={`알림 목록, 총 ${sorted.length}개`}>
              {sorted.map((n) => {
                const prio = priorityMeta[n.priority] ?? priorityMeta.low;
                const target = navTargetFor(n);
                const unread = !n.isRead;

                return (
                  <div
                    key={n.id}
                    className="tm-notif-row"
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'stretch',
                      borderBottom: '1px solid hsl(var(--border) / 0.32)',
                      // 안읽음 표시: 좌측 컬러 바(우선순위 색) — hover에도 유지
                      borderLeft: unread
                        ? `4px solid ${prio.color}`
                        : '4px solid transparent',
                      background: unread
                        ? 'hsl(var(--accent) / 0.22)'
                        : 'transparent',
                    }}
                  >
                    {/* 본문 클릭 영역: 읽음 처리 + (관련 항목 있으면) 이동 */}
                    <button
                      type="button"
                      aria-label={`${unread ? '안 읽음, ' : ''}${prio.label}, ${n.title}. ${n.message}${
                        target ? `. 누르면 ${target.label}` : ''
                      }`}
                      onClick={() => handleItemClick(n)}
                      style={{
                        flex: 1,
                        display: 'block',
                        textAlign: 'left',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: '18px 84px 18px 22px',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'hsl(var(--accent) / 0.55)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.background = 'hsl(var(--accent) / 0.55)';
                        e.currentTarget.style.outline = '2px solid hsl(var(--foreground))';
                        e.currentTarget.style.outlineOffset = '-2px';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.outline = 'none';
                      }}
                    >
                      {/* 1행: 카테고리 아이콘 + 제목 + 우선순위 + 안읽음 태그 */}
                      <div
                        aria-hidden="true"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                        }}
                      >
                        {getTypeIcon(n.type)}
                        <span
                          style={{
                            fontSize: '0.875rem',
                            color: 'hsl(var(--foreground))',
                            fontWeight: unread ? 600 : 500,
                          }}
                        >
                          {n.title}
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 10px',
                            borderRadius: 9999,
                            fontSize: '0.73rem',
                            fontWeight: 700,
                            lineHeight: 1.4,
                            color: 'hsl(var(--foreground))',
                            background: `color-mix(in srgb, ${prio.color} 24%, hsl(var(--popover)))`,
                            border: `1px solid color-mix(in srgb, ${prio.color} 45%, hsl(var(--popover)))`,
                          }}
                        >
                          {prio.label}
                        </span>
                        {unread && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: '0.73rem',
                              fontWeight: 700,
                              color: 'hsl(var(--foreground))',
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 9999,
                                background: 'hsl(var(--foreground))',
                              }}
                            />
                            안읽음
                          </span>
                        )}
                      </div>

                      {/* 2행: 메시지 */}
                      <div
                        aria-hidden="true"
                        style={{
                          marginTop: 6,
                          fontSize: '0.875rem',
                          color: 'hsl(var(--foreground))',
                          lineHeight: 1.55,
                        }}
                      >
                        {n.message}
                      </div>

                      {/* 3행: 시간 + 이동 안내 */}
                      <div
                        aria-hidden="true"
                        style={{
                          marginTop: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          fontSize: '0.75rem',
                          color: 'hsl(var(--muted-foreground))',
                        }}
                      >
                        <span>{dayjs(n.createdAt).fromNow()}</span>
                        {target && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                              fontWeight: 700,
                              color: 'hsl(var(--info))',
                            }}
                          >
                            {target.label}
                            <ChevronRight style={{ width: 16, height: 16 }} />
                          </span>
                        )}
                      </div>
                    </button>

                    {/* 삭제: 평소 숨김, 행 hover/포커스 시 노출 (라벨 + 확인창으로 오인 탭 방지) */}
                    <button
                      type="button"
                      className="tm-notif-del"
                      aria-label={`${n.title} 알림 삭제`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(n);
                      }}
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        bottom: 8,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        width: 60,
                        border: 'none',
                        borderRadius: 12,
                        background:
                          'color-mix(in srgb, hsl(var(--destructive)) 10%, hsl(var(--popover)))',
                        color: 'hsl(var(--destructive))',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.15)',
                        transition: 'background 0.15s, color 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          'color-mix(in srgb, hsl(var(--destructive)) 18%, hsl(var(--popover)))';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          'color-mix(in srgb, hsl(var(--destructive)) 10%, hsl(var(--popover)))';
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.outline = '2px solid hsl(var(--destructive))';
                        e.currentTarget.style.outlineOffset = '2px';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.outline = 'none';
                      }}
                    >
                      <Trash2 style={{ width: 18, height: 18 }} />
                      삭제
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
