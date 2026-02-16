import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Switch, InputNumber, Space, Typography, message, Alert } from 'antd';
import { invoke } from '@tauri-apps/api/core';
import dayjs from 'dayjs';
import { FLEX_BETWEEN } from '../../config/styles';

const { Text } = Typography;

interface BackupSettings {
  enabled: boolean;
  intervalHours: number;
  lastBackup?: string;
}

const STORAGE_KEY = 'autoBackupSettings';
const DEFAULT_SETTINGS: BackupSettings = {
  enabled: false,
  intervalHours: 24,
};

export const AutoBackupScheduler: React.FC = () => {
  const [settings, setSettings] = useState<BackupSettings>(DEFAULT_SETTINGS);
  const [nextBackupTime, setNextBackupTime] = useState<string>('');
  const settingsRef = useRef<BackupSettings>(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const savedSettings = localStorage.getItem(STORAGE_KEY);
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setSettings(parsed);
    }
  }, []);

  const checkAndBackup = useCallback(async () => {
    const current = settingsRef.current;
    if (!current.enabled) return;

    const now = dayjs();
    const lastBackupTime = current.lastBackup ? dayjs(current.lastBackup) : null;

    if (!lastBackupTime || now.diff(lastBackupTime, 'hour') >= current.intervalHours) {
      try {
        await invoke('create_backup');
        const newSettings: BackupSettings = {
          ...current,
          lastBackup: now.toISOString(),
        };
        setSettings(newSettings);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
        message.success('자동 백업이 완료되었습니다');
      } catch (error) {
        message.error('자동 백업 실패: ' + error);
      }
    }
  }, []);

  useEffect(() => {
    if (settings.lastBackup) {
      const lastBackup = dayjs(settings.lastBackup);
      const next = lastBackup.add(settings.intervalHours, 'hour');
      setNextBackupTime(next.format('YYYY-MM-DD HH:mm:ss'));
    } else if (settings.enabled) {
      setNextBackupTime('즉시');
    }
  }, [settings.lastBackup, settings.intervalHours, settings.enabled]);

  useEffect(() => {
    if (!settings.enabled) {
      return;
    }

    checkAndBackup();

    const interval = setInterval(checkAndBackup, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [settings.enabled, settings.intervalHours, checkAndBackup]);

  const handleToggle = (checked: boolean) => {
    const newSettings = {
      ...settings,
      enabled: checked,
      lastBackup: checked ? settings.lastBackup : undefined,
    };
    setSettings(newSettings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));

    if (checked) {
      message.success('자동 백업이 활성화되었습니다');
    } else {
      message.info('자동 백업이 비활성화되었습니다');
    }
  };

  const handleIntervalChange = (value: number | null) => {
    if (value && value > 0) {
      const newSettings = {
        ...settings,
        intervalHours: value,
      };
      setSettings(newSettings);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
    }
  };

  return (
    <Card title="자동 백업 설정" size="small">
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={FLEX_BETWEEN}>
          <Text>자동 백업 활성화</Text>
          <Switch checked={settings.enabled} onChange={handleToggle} />
        </div>

        {settings.enabled && (
          <>
            <div style={FLEX_BETWEEN}>
              <Text>백업 주기 (시간)</Text>
              <InputNumber
                min={1}
                max={168}
                value={settings.intervalHours}
                onChange={handleIntervalChange}
                style={{ width: 100 }}
              />
            </div>

            <Alert
              message={
                <Space direction="vertical" size="small">
                  {settings.lastBackup && (
                    <Text type="secondary">
                      마지막 백업: {dayjs(settings.lastBackup).format('YYYY-MM-DD HH:mm:ss')}
                    </Text>
                  )}
                  <Text type="secondary">다음 백업 예정: {nextBackupTime}</Text>
                </Space>
              }
              type="info"
              showIcon
            />

            <Text type="secondary" style={{ fontSize: 12 }}>
              앱이 실행 중일 때 설정된 주기마다 자동으로 백업이 생성됩니다.
            </Text>
          </>
        )}
      </Space>
    </Card>
  );
};
