import { useEffect, useState } from 'react';
import { Modal, Button, Progress, Typography, Space, theme } from 'antd';
import { DownloadOutlined, CloseOutlined } from '@ant-design/icons';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { logInfo, logError } from '../../utils/logger';
import { handleError } from '../../utils/errors';

const { Text, Paragraph } = Typography;

const SKIPPED_VERSION_KEY = 'skippedUpdateVersion';

interface UpdateCheckerProps {
  autoCheck?: boolean;
  checkInterval?: number; // 분 단위
}

export function UpdateChecker({ autoCheck = true, checkInterval = 60 }: UpdateCheckerProps) {
  const { token } = theme.useToken();
  const [updateInfo, setUpdateInfo] = useState<{ currentVersion: string; latestVersion: string; body: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const modalVisible = updateInfo !== null;

  const checkForUpdates = async (silent = false) => {
    try {
      logInfo('Checking for updates');
      const update = await check();

      if (update) {
        logInfo('Update available', {
          data: {
            current: update.currentVersion,
            latest: update.version,
          }
        });

        const skippedVersion = localStorage.getItem(SKIPPED_VERSION_KEY);
        if (silent && skippedVersion === update.version) {
          logInfo('Update skipped by user', { data: { version: update.version } });
          return;
        }

        setUpdateInfo({
          currentVersion: update.currentVersion,
          latestVersion: update.version,
          body: update.body || '새로운 버전이 출시되었습니다.',
        });
      } else {
        logInfo('No updates available');
        if (!silent) {
          Modal.info({
            title: '최신 버전입니다',
            content: '현재 최신 버전을 사용하고 있습니다.',
          });
        }
      }
    } catch (error) {
      logError('Failed to check for updates', { error });
      if (!silent) {
        handleError(error);
      }
    }
  };

  const downloadAndInstall = async () => {
    try {
      setDownloading(true);
      setDownloadProgress(0);

      logInfo('Starting update download');
      const update = await check();

      if (!update) {
        logInfo('No update found during download attempt');
        return;
      }

      // 다운로드 및 설치
      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            downloaded = 0;
            logInfo('Download started', { data: { contentLength } });
            setDownloadProgress(0);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            const progress = contentLength ? (downloaded / contentLength) * 100 : 0;
            setDownloadProgress(Math.min(progress, 100));
            break;
          case 'Finished':
            logInfo('Download finished');
            setDownloadProgress(100);
            break;
        }
      });

      logInfo('Update installed successfully');

      // 설치 완료 후 재시작
      Modal.success({
        title: '업데이트 완료',
        content: '업데이트가 설치되었습니다. 프로그램을 재시작합니다.',
        onOk: async () => {
          await relaunch();
        },
      });
    } catch (error) {
      logError('Failed to download and install update', { error });
      handleError(error);
      setDownloading(false);
    }
  };

  useEffect(() => {
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

  return (
    <>
      <Modal
        title="업데이트 알림"
        open={modalVisible}
        onCancel={() => {
          if (updateInfo?.latestVersion) {
            localStorage.setItem(SKIPPED_VERSION_KEY, updateInfo.latestVersion);
          }
          setUpdateInfo(null);
        }}
        footer={null}
        width={500}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Paragraph>
              <Text strong>현재 버전:</Text> {updateInfo?.currentVersion}
            </Paragraph>
            <Paragraph>
              <Text strong>최신 버전:</Text> {updateInfo?.latestVersion}
            </Paragraph>
          </div>

          {updateInfo?.body && (
            <div>
              <Text strong>변경 사항:</Text>
              <div
                style={{
                  marginTop: 8,
                  padding: 12,
                  background: token.colorFillQuaternary,
                  borderRadius: 4,
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                  {updateInfo.body}
                </pre>
              </div>
            </div>
          )}

          {downloading && (
            <div>
              <Text>다운로드 중...</Text>
              <Progress percent={Math.round(downloadProgress)} status="active" />
            </div>
          )}

          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button
              icon={<CloseOutlined />}
              onClick={() => {
                if (updateInfo?.latestVersion) {
                  localStorage.setItem(SKIPPED_VERSION_KEY, updateInfo.latestVersion);
                  logInfo('User skipped update', { data: { version: updateInfo.latestVersion } });
                }
                setUpdateInfo(null);
              }}
              disabled={downloading}
            >
              이 버전 건너뛰기
            </Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={downloadAndInstall}
              loading={downloading}
            >
              {downloading ? '설치 중...' : '지금 업데이트'}
            </Button>
          </Space>
        </Space>
      </Modal>
    </>
  );
}

// 수동으로 업데이트 체크를 트리거하는 훅
export function useUpdateChecker() {
  const [checking, setChecking] = useState(false);

  const checkForUpdates = async () => {
    setChecking(true);
    try {
      logInfo('Manual update check triggered');
      const update = await check();

      if (update) {
        logInfo('Update available', {
          data: {
            current: update.currentVersion,
            latest: update.version,
          }
        });

        Modal.confirm({
          title: '업데이트 알림',
          content: (
            <div>
              <p>새로운 버전 {update.version}이(가) 출시되었습니다.</p>
              <p>현재 버전: {update.currentVersion}</p>
              {update.body && (
                <div style={{ marginTop: 12, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{update.body}</pre>
                </div>
              )}
            </div>
          ),
          okText: '업데이트',
          cancelText: '나중에',
          onOk: async () => {
            try {
              await update.downloadAndInstall();
              await relaunch();
            } catch (error) {
              handleError(error);
            }
          },
        });
      } else {
        Modal.info({
          title: '최신 버전입니다',
          content: '현재 최신 버전을 사용하고 있습니다.',
        });
      }
    } catch (error) {
      logError('Failed to check for updates', { error });
      handleError(error);
    } finally {
      setChecking(false);
    }
  };

  return { checkForUpdates, checking };
}
