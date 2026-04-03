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
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';

dayjs.extend(relativeTime);
dayjs.locale('ko');

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
    switch (type) {
      case 'payment_overdue':
        return <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />;
      case 'payment_reminder':
        return <DollarSign className="h-4 w-4 shrink-0 text-amber-500" />;
      case 'info':
      default:
        return <Info className="h-4 w-4 shrink-0 text-primary" />;
    }
  };

  const getPriorityLabel = (priority: Notification['priority']) => {
    switch (priority) {
      case 'high':
        return { text: '긴급', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' };
      case 'medium':
        return { text: '중요', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' };
      case 'low':
      default:
        return { text: '일반', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' };
    }
  };

  const handleNotificationClick = useCallback((notification: Notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
  }, [markAsRead]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">
            알림 ({unreadCount}개 읽지 않음)
          </span>
          <div className="flex gap-1">
            {notifications.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    markAllAsRead();
                  }}
                >
                  <Check className="mr-1 h-3 w-3" />
                  모두 읽음
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearAll();
                  }}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  전체 삭제
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Notification list */}
        <ScrollArea className="max-h-[480px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground">
              <Bell className="mb-2 h-8 w-8 opacity-30" />
              새로운 알림이 없습니다
            </div>
          ) : (
            <div>
              {notifications.map((notification) => {
                const priority = getPriorityLabel(notification.priority);
                return (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-accent/50',
                      !notification.isRead && 'bg-primary/5',
                    )}
                  >
                    <div className="mt-0.5">
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm', !notification.isRead && 'font-semibold')}>
                          {notification.title}
                        </span>
                        <span className={cn('inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium', priority.className)}>
                          {priority.text}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {notification.message}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground/70">
                        {dayjs(notification.createdAt).fromNow()}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
