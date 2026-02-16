import React, { useCallback, useEffect, useMemo } from 'react';
import { Badge, Dropdown, List, Button, Empty, Typography, Tag, Space } from 'antd';
import {
  BellOutlined,
  CheckOutlined,
  DeleteOutlined,
  WarningOutlined,
  DollarOutlined,
  UserOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useNotificationStore } from '../../stores/notificationStore';
import type { Notification } from '../../types';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';

dayjs.extend(relativeTime);
dayjs.locale('ko');

const { Text } = Typography;

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
        return <WarningOutlined style={{ color: '#ff4d4f' }} />;
      case 'payment_reminder':
        return <DollarOutlined style={{ color: '#faad14' }} />;
      case 'low_attendance':
        return <UserOutlined style={{ color: '#fa8c16' }} />;
      case 'info':
      default:
        return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
    }
  };

  const getPriorityColor = (priority: Notification['priority']) => {
    switch (priority) {
      case 'high':
        return 'red';
      case 'medium':
        return 'orange';
      case 'low':
      default:
        return 'blue';
    }
  };

  const handleNotificationClick = useCallback((notification: Notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
  }, [markAsRead]);

  const dropdownMenu = useMemo(() => (
    <div
      style={{
        width: 420,
        maxHeight: 600,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 3px 6px -4px rgba(0,0,0,.12), 0 6px 16px 0 rgba(0,0,0,.08)',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text strong style={{ fontSize: 16 }}>
          알림 ({unreadCount}개 읽지 않음)
        </Text>
        <Space size="small">
          {notifications.length > 0 && (
            <>
              <Button
                type="text"
                size="small"
                icon={<CheckOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  markAllAsRead();
                }}
              >
                모두 읽음
              </Button>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  clearAll();
                }}
              >
                전체 삭제
              </Button>
            </>
          )}
        </Space>
      </div>

      {/* 알림 목록 */}
      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        {notifications.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="새로운 알림이 없습니다"
            style={{ padding: '60px 0' }}
          />
        ) : (
          <List
            dataSource={notifications}
            renderItem={(notification) => (
              <List.Item
                onClick={() => handleNotificationClick(notification)}
                style={{
                  cursor: 'pointer',
                  background: notification.isRead ? '#fff' : '#f0f5ff',
                  padding: '12px 16px',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = notification.isRead ? '#fafafa' : '#e6f4ff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = notification.isRead ? '#fff' : '#f0f5ff';
                }}
              >
                <List.Item.Meta
                  avatar={getIcon(notification.type)}
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text strong={!notification.isRead}>{notification.title}</Text>
                      <Tag color={getPriorityColor(notification.priority)} style={{ fontSize: 11 }}>
                        {notification.priority === 'high'
                          ? '긴급'
                          : notification.priority === 'medium'
                          ? '중요'
                          : '일반'}
                      </Tag>
                    </div>
                  }
                  description={
                    <div>
                      <div style={{ marginBottom: 4 }}>{notification.message}</div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {dayjs(notification.createdAt).fromNow()}
                      </Text>
                    </div>
                  }
                />
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNotification(notification.id);
                  }}
                  style={{ marginLeft: 8 }}
                />
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  ), [notifications, unreadCount, handleNotificationClick, markAllAsRead, clearAll, deleteNotification]);

  return (
    <Dropdown
      dropdownRender={() => dropdownMenu}
      trigger={['click']}
      placement="bottomRight"
    >
      <Badge count={unreadCount} offset={[-5, 5]} size="small">
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 20 }} />}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      </Badge>
    </Dropdown>
  );
};
