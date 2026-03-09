import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { isTauri } from '../utils/tauri';
import { createCloudBackup, restoreCloudBackup } from '../utils/backupHelper';

// 동적 Tauri 임포트 헬퍼
const getTauriCore = () => isTauri() ? import('@tauri-apps/api/core') : null;
const getTauriDialog = () => isTauri() ? import('@tauri-apps/plugin-dialog') : null;

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
    const core = await getTauriCore();
    if (!core) { setLoading(false); return; }
    setLoading(true);
    try {
      const result = await core.invoke<BackupInfo[]>('list_backups');
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
    if (!isTauri()) { message.warning('백업은 데스크톱 앱에서만 사용 가능합니다'); return; }
    setCreating(true);
    try {
      await createCloudBackup(organizationName);
      message.success('백업이 성공적으로 생성되었습니다');
      await loadBackups();
    } catch (error) {
      message.error('백업 생성에 실패했습니다: ' + error);
    } finally {
      setCreating(false);
    }
  }, [loadBackups, organizationName]);

  const importBackup = useCallback(async (): Promise<BackupInfo | null> => {
    const core = await getTauriCore();
    const dialog = await getTauriDialog();
    if (!core || !dialog) { message.warning('백업은 데스크톱 앱에서만 사용 가능합니다'); return null; }
    try {
      const selected = await dialog.open({
        title: '백업 파일 선택',
        filters: [{ name: '백업 파일', extensions: ['zip'] }],
        multiple: false,
      });

      if (!selected) return null;

      setImporting(true);
      const result = await core.invoke<BackupInfo>('import_backup', { sourcePath: selected, orgName: organizationName });
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
    if (!isTauri()) return;
    const orgId = useAuthStore.getState().organizationId;
    if (!orgId) {
      message.error('조직 정보가 없어 복원할 수 없습니다.');
      return;
    }
    setRestoring(filename);
    try {
      const result = await restoreCloudBackup(filename, orgId);
      if (result.success) {
        message.success('백업이 성공적으로 복원되었습니다. 페이지를 새로고침합니다.');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        message.error('백업 복원에 실패했습니다: ' + (result.error || '알 수 없는 오류'));
        setRestoring(null);
      }
    } catch (error) {
      message.error('백업 복원에 실패했습니다: ' + error);
      setRestoring(null);
    }
  }, []);

  const downloadBackup = useCallback(async (filename: string) => {
    const core = await getTauriCore();
    const dialog = await getTauriDialog();
    if (!core || !dialog) return;
    try {
      const savePath = await dialog.save({
        title: '백업 파일 저장',
        defaultPath: filename,
        filters: [{ name: '백업 파일', extensions: ['zip'] }],
      });

      if (!savePath) return;

      await core.invoke('export_backup_file', { filename, destPath: savePath });
      message.success('백업 파일이 저장되었습니다.');
    } catch (error) {
      message.error('백업 파일 다운로드 실패: ' + error);
    }
  }, []);

  const deleteBackup = useCallback(async (filename: string) => {
    const core = await getTauriCore();
    if (!core) return;
    try {
      await core.invoke('delete_backup', { filename });
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
