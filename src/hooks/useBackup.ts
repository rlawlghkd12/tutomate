import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useSettingsStore } from '../stores/settingsStore';

export interface BackupInfo {
  filename: string;
  size: number;
  created_at: string;
}

export function useBackup() {
  const organizationName = useSettingsStore((s) => s.organizationName);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<BackupInfo[]>('list_backups');
      setBackups(result);
    } catch (error) {
      message.error('백업 목록을 불러오는데 실패했습니다: ' + error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const createBackup = useCallback(async () => {
    setCreating(true);
    try {
      await invoke<BackupInfo>('create_backup', { orgName: organizationName });
      message.success('백업이 성공적으로 생성되었습니다');
      await loadBackups();
    } catch (error) {
      message.error('백업 생성에 실패했습니다: ' + error);
    } finally {
      setCreating(false);
    }
  }, [loadBackups, organizationName]);

  const importBackup = useCallback(async (): Promise<BackupInfo | null> => {
    try {
      const selected = await open({
        title: '백업 파일 선택',
        filters: [{ name: '백업 파일', extensions: ['zip'] }],
        multiple: false,
      });

      if (!selected) return null;

      setImporting(true);
      const result = await invoke<BackupInfo>('import_backup', { sourcePath: selected, orgName: organizationName });
      await loadBackups();
      return result;
    } catch (error) {
      message.error('백업 파일 불러오기 실패: ' + error);
      return null;
    } finally {
      setImporting(false);
    }
  }, [loadBackups, organizationName]);

  const restoreBackup = useCallback(async (filename: string) => {
    setRestoring(filename);
    try {
      await invoke('restore_backup', { filename });
      message.success('백업이 성공적으로 복원되었습니다. 페이지를 새로고침합니다.');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      message.error('백업 복원에 실패했습니다: ' + error);
      setRestoring(null);
    }
  }, []);

  const downloadBackup = useCallback(async (filename: string) => {
    try {
      const savePath = await save({
        title: '백업 파일 저장',
        defaultPath: filename,
        filters: [{ name: '백업 파일', extensions: ['zip'] }],
      });

      if (!savePath) return;

      await invoke('export_backup_file', { filename, destPath: savePath });
      message.success('백업 파일이 저장되었습니다.');
    } catch (error) {
      message.error('백업 파일 다운로드 실패: ' + error);
    }
  }, []);

  const deleteBackup = useCallback(async (filename: string) => {
    try {
      await invoke('delete_backup', { filename });
      message.success('백업이 삭제되었습니다');
      await loadBackups();
    } catch (error) {
      message.error('백업 삭제에 실패했습니다: ' + error);
    }
  }, [loadBackups]);

  return {
    backups,
    loading,
    creating,
    importing,
    restoring,
    createBackup,
    importBackup,
    restoreBackup,
    downloadBackup,
    deleteBackup,
  };
}
