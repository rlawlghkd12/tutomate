import { useEffect, useState } from 'react';
import { Download, X, Loader2 } from 'lucide-react';
import { logInfo, logError } from '@tutomate/core';
import { handleError } from '@tutomate/core';
import { isElectron } from '@tutomate/core';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';

const SKIPPED_VERSION_KEY = 'skippedUpdateVersion';

interface UpdateCheckerProps {
  autoCheck?: boolean;
  checkInterval?: number; // 분 단위
}

export function UpdateChecker({ autoCheck = true, checkInterval = 60 }: UpdateCheckerProps) {
  const [updateInfo, setUpdateInfo] = useState<{ currentVersion: string; latestVersion: string; body: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [restarting, setRestarting] = useState(false);
  const [initialChecking, setInitialChecking] = useState(true);
  // For the post-download confirm dialog
  const [showInstallConfirm, setShowInstallConfirm] = useState(false);

  const modalVisible = updateInfo !== null;

  const checkForUpdates = async (silent = false) => {
    if (!isElectron()) { setInitialChecking(false); return; }
    try {
      logInfo('Checking for updates');
      const result = await window.electronAPI.checkForUpdates();

      if (result) {
        logInfo('Update available', {
          data: {
            current: result.currentVersion,
            latest: result.version,
          }
        });

        const skippedVersion = localStorage.getItem(SKIPPED_VERSION_KEY);
        if (silent && skippedVersion === result.version) {
          logInfo('Update skipped by user', { data: { version: result.version } });
          setInitialChecking(false);
          return;
        }

        setUpdateInfo({
          currentVersion: result.currentVersion,
          latestVersion: result.version,
          body: (typeof result.releaseNotes === 'string' ? result.releaseNotes : '') || '새로운 버전이 출시되었습니다.',
        });
      } else {
        logInfo('No updates available');
        if (!silent) {
          // Show a simple info dialog for "no updates"
          setNoUpdateDialog(true);
        }
      }
    } catch (error) {
      logError('Failed to check for updates', { error });
      if (!silent) {
        handleError(error);
      }
    } finally {
      setInitialChecking(false);
    }
  };

  const [noUpdateDialog, setNoUpdateDialog] = useState(false);

  const downloadAndInstall = async () => {
    if (!isElectron()) return;
    try {
      setDownloading(true);
      setDownloadProgress(0);

      logInfo('Starting update download');

      // 다운로드 진행률 이벤트 리스너
      const removeListener = window.electronAPI.onUpdateEvent((type, data) => {
        if (type === 'download-progress') {
          setDownloadProgress(Math.min(data.percent, 100));
        } else if (type === 'update-downloaded') {
          setDownloadProgress(100);
        } else if (type === 'error') {
          logError('Update download error event', { error: data?.message });
        }
      });

      await window.electronAPI.downloadUpdate();

      removeListener();
      logInfo('Download complete');
      setDownloading(false);
      setUpdateInfo(null);

      // 다운로드 완료 후 설치+재시작 확인
      setShowInstallConfirm(true);
    } catch (error) {
      logError('Failed to download and install update', { error });
      handleError(error);
      setDownloading(false);
    }
  };

  const handleInstallAndRestart = () => {
    setShowInstallConfirm(false);
    setRestarting(true);
    setTimeout(() => {
      window.electronAPI.installUpdate();
    }, 300);
  };

  useEffect(() => {
    // 개발 모드에서는 업데이트 체크 건너뛰기
    if (import.meta.env.DEV) { setInitialChecking(false); return; }

    if (autoCheck) {
      // 앱 시작 시 체크
      checkForUpdates(true);

      // 주기적으로 체크
      const interval = setInterval(() => {
        checkForUpdates(true);
      }, checkInterval * 60 * 1000);

      return () => clearInterval(interval);
    }
  }, [autoCheck, checkInterval]);

  if (initialChecking) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'hsl(var(--background))', fontSize: '1rem', color: 'hsl(var(--muted-foreground))' }}>
        <Loader2 style={{ width: 48, height: 48, color: 'hsl(var(--primary))' }} className="animate-spin" />
        <div>업데이트 확인 중...</div>
      </div>
    );
  }

  if (restarting) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'rgba(0,0,0,0.85)', fontSize: '1.14rem', color: '#fff' }}>
        <div style={{ fontSize: '2.86rem' }}>🔄</div>
        <div>업데이트 설치 중...</div>
        <div style={{ fontSize: '1rem', opacity: 0.6 }}>잠시 후 앱이 재시작됩니다</div>
      </div>
    );
  }

  return (
    <>
      {/* Update available dialog */}
      <Dialog
        open={modalVisible}
        onOpenChange={(open) => {
          if (!open) {
            if (updateInfo?.latestVersion) {
              localStorage.setItem(SKIPPED_VERSION_KEY, updateInfo.latestVersion);
            }
            setUpdateInfo(null);
          }
        }}
      >
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>업데이트 알림</DialogTitle>
            <DialogDescription className="sr-only">새 버전 업데이트 정보</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm">
                <span className="font-semibold">현재 버전:</span> {updateInfo?.currentVersion}
              </p>
              <p className="text-sm">
                <span className="font-semibold">최신 버전:</span> {updateInfo?.latestVersion}
              </p>
            </div>

            {updateInfo?.body && (
              <div>
                <span className="text-sm font-semibold">변경 사항:</span>
                <div
                  className="mt-2 max-h-[200px] overflow-y-auto rounded-md bg-muted p-3 text-[13px] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: updateInfo.body }}
                />
              </div>
            )}

            {downloading && (
              <div className="space-y-2">
                <span className="text-sm">다운로드 중...</span>
                <Progress value={Math.round(downloadProgress)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (updateInfo?.latestVersion) {
                  localStorage.setItem(SKIPPED_VERSION_KEY, updateInfo.latestVersion);
                  logInfo('User skipped update', { data: { version: updateInfo.latestVersion } });
                }
                setUpdateInfo(null);
              }}
              disabled={downloading}
            >
              <X className="mr-2 h-4 w-4" />
              이 버전 건너뛰기
            </Button>
            <Button
              onClick={downloadAndInstall}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {downloading ? '설치 중...' : '지금 업데이트'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Install confirm dialog */}
      <Dialog open={showInstallConfirm} onOpenChange={setShowInstallConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>업데이트 다운로드 완료</DialogTitle>
            <DialogDescription>
              업데이트를 설치하고 재시작하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInstallConfirm(false)}>
              나중에
            </Button>
            <Button onClick={handleInstallAndRestart}>
              설치 및 재시작
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No update dialog */}
      <Dialog open={noUpdateDialog} onOpenChange={setNoUpdateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>최신 버전입니다</DialogTitle>
            <DialogDescription>
              현재 최신 버전을 사용하고 있습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setNoUpdateDialog(false)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// 수동으로 업데이트 체크를 트리거하는 훅
export function useUpdateChecker() {
  const [checking, setChecking] = useState(false);
  const [manualUpdateInfo, setManualUpdateInfo] = useState<{
    version: string;
    currentVersion: string;
    releaseNotes: string;
  } | null>(null);

  const checkForUpdates = async () => {
    if (!isElectron()) return;
    setChecking(true);
    try {
      logInfo('Manual update check triggered');
      const result = await window.electronAPI.checkForUpdates();

      if (result) {
        logInfo('Update available', {
          data: {
            current: result.currentVersion,
            latest: result.version,
          }
        });

        setManualUpdateInfo({
          version: result.version,
          currentVersion: result.currentVersion,
          releaseNotes: typeof result.releaseNotes === 'string' ? result.releaseNotes : '',
        });
      } else {
        setManualUpdateInfo(null);
        // The component using this hook should show a "no updates" message
      }
    } catch (error) {
      logError('Failed to check for updates', { error });
      handleError(error);
    } finally {
      setChecking(false);
    }
  };

  const handleUpdate = async () => {
    if (!isElectron()) return;
    try {
      await window.electronAPI.downloadUpdate();
      window.electronAPI.installUpdate();
    } catch (error) {
      handleError(error);
    }
  };

  return { checkForUpdates, checking, manualUpdateInfo, handleUpdate, clearUpdateInfo: () => setManualUpdateInfo(null) };
}
