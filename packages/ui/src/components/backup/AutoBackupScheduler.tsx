import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { createCloudBackup } from '@tutomate/core';

import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Alert, AlertDescription } from '../ui/alert';

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
        await createCloudBackup();
        const newSettings: BackupSettings = {
          ...current,
          lastBackup: now.toISOString(),
        };
        setSettings(newSettings);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
        toast.success('자동 백업이 완료되었습니다');
      } catch (error) {
        toast.error('자동 백업 실패: ' + error);
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
      toast.success('자동 백업이 활성화되었습니다');
    } else {
      toast.info('자동 백업이 비활성화되었습니다');
    }
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">자동 백업 설정</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm">자동 백업 활성화</span>
          <Switch checked={settings.enabled} onCheckedChange={handleToggle} />
        </div>

        {settings.enabled && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm">백업 주기 (시간)</span>
              <Input
                type="number"
                min={1}
                max={168}
                value={settings.intervalHours}
                onChange={handleIntervalChange}
                className="w-[100px] h-8 text-sm"
              />
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <div className="flex flex-col gap-1">
                  {settings.lastBackup && (
                    <span className="text-xs text-muted-foreground">
                      마지막 백업: {dayjs(settings.lastBackup).format('YYYY-MM-DD HH:mm:ss')}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">다음 백업 예정: {nextBackupTime}</span>
                </div>
              </AlertDescription>
            </Alert>

            <p className="text-xs text-muted-foreground">
              앱이 실행 중일 때 설정된 주기마다 자동으로 백업이 생성됩니다.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
