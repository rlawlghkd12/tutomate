import React, { useEffect, useState } from 'react';
import { Card, Switch, InputNumber, Space, Typography, message, Alert } from 'antd';
import { invoke } from '@tauri-apps/api/core';
import dayjs from 'dayjs';

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

  useEffect(() => {
    // 설정 불러오기
    const savedSettings = localStorage.getItem(STORAGE_KEY);
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setSettings(parsed);
    }
  }, []);

  useEffect(() => {
    // 자동 백업 스케줄러
    if (!settings.enabled) {
      return;
    }

    const checkAndBackup = async () => {
      const now = dayjs();
      const lastBackupTime = settings.lastBackup ? dayjs(settings.lastBackup) : null;

      // 마지막 백업으로부터 설정된 시간이 지났는지 확인
      if (!lastBackupTime || now.diff(lastBackupTime, 'hour') >= settings.intervalHours) {
        try {
          await invoke('create_backup');
          const newSettings = {
            ...settings,
            lastBackup: now.toISOString(),
          };
          setSettings(newSettings);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
          message.success('자동 백업이 완료되었습니다');
        } catch (error) {
          message.error('자동 백업 실패: ' + error);
        }
      }
    };

    // 다음 백업 시간 계산
    const calculateNextBackup = () => {
      if (settings.lastBackup) {
        const lastBackup = dayjs(settings.lastBackup);
        const next = lastBackup.add(settings.intervalHours, 'hour');
        setNextBackupTime(next.format('YYYY-MM-DD HH:mm:ss'));
      } else {
        setNextBackupTime('즉시');
      }
    };

    calculateNextBackup();

    // 초기 체크
    checkAndBackup();

    // 1시간마다 체크 (실제 백업은 설정된 간격에 따라)
    const interval = setInterval(checkAndBackup, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [settings.enabled, settings.intervalHours, settings.lastBackup]);

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text>자동 백업 활성화</Text>
          <Switch checked={settings.enabled} onChange={handleToggle} />
        </div>

        {settings.enabled && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
