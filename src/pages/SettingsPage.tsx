import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Card,
  Space,
  Typography,
  Switch,
  Radio,
  Divider,
  Tabs,
  Button,
  Table,
  Input,
  InputNumber,
  message,
  Modal,
  Progress,
  Tag,
  Popconfirm,
} from 'antd';
import {
  SaveOutlined,
  RollbackOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  ImportOutlined,
  DownloadOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { invoke } from '@tauri-apps/api/core';
import dayjs from 'dayjs';
import { useSettingsStore, type FontSize } from '../stores/settingsStore';
import { useLicenseStore } from '../stores/licenseStore';
import LicenseKeyInput from '../components/common/LicenseKeyInput';
import { PLAN_LIMITS } from '../config/planLimits';
import { useAppVersion, APP_NAME } from '../config/version';
import { useBackup, type BackupInfo } from '../hooks/useBackup';
import { supabase } from '../config/supabase';
import { useAuthStore } from '../stores/authStore';
import { MigrationModal } from '../components/common/MigrationModal';
import AdminTab from '../components/settings/AdminTab';

const { Text } = Typography;

const SettingsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const defaultTab = useMemo(() => searchParams.get('tab') || 'general', [searchParams]);
  const {
    theme: appTheme,
    fontSize,
    notificationsEnabled,
    organizationName,
    setTheme,
    setFontSize,
    setNotificationsEnabled,
    setOrganizationName,
    loadSettings,
  } = useSettingsStore();

  const APP_VERSION = useAppVersion();
  const { getPlan, activateLicense, deactivateLicense, licenseKey } = useLicenseStore();
  const [orgNameInput, setOrgNameInput] = useState(organizationName);
  const [showKey, setShowKey] = useState(false);
  const [licenseInput, setLicenseInput] = useState(['', '', '', '']);
  const [activating, setActivating] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const currentPlan = getPlan();
  const {
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
  } = useBackup();

  // 업데이트 관련 상태
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [isLatest, setIsLatest] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; body: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // 자동 백업 상태
  const AUTO_BACKUP_KEY = 'autoBackupSettings';
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupInterval, setAutoBackupInterval] = useState(24);
  const [lastAutoBackup, setLastAutoBackup] = useState<string | undefined>();
  const autoBackupRef = useRef({ enabled: autoBackupEnabled, intervalHours: autoBackupInterval, lastBackup: lastAutoBackup });
  autoBackupRef.current = { enabled: autoBackupEnabled, intervalHours: autoBackupInterval, lastBackup: lastAutoBackup };

  const nextBackupTime = (() => {
    if (!autoBackupEnabled) return '';
    if (lastAutoBackup) {
      return dayjs(lastAutoBackup).add(autoBackupInterval, 'hour').format('YYYY-MM-DD HH:mm');
    }
    return '즉시';
  })();

  useEffect(() => {
    loadSettings();
    useLicenseStore.getState().loadLicense();

    // 자동 백업 설정 로드
    const saved = localStorage.getItem(AUTO_BACKUP_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setAutoBackupEnabled(parsed.enabled ?? false);
      setAutoBackupInterval(parsed.intervalHours ?? 24);
      setLastAutoBackup(parsed.lastBackup);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSettings]);

  // 스토어 organizationName이 로드되면 input 동기화
  useEffect(() => {
    setOrgNameInput(organizationName);
  }, [organizationName]);

  const checkAndAutoBackup = useCallback(async () => {
    const current = autoBackupRef.current;
    if (!current.enabled) return;
    const now = dayjs();
    const last = current.lastBackup ? dayjs(current.lastBackup) : null;
    if (!last || now.diff(last, 'hour') >= current.intervalHours) {
      try {
        await invoke('create_backup');
        const newLast = now.toISOString();
        setLastAutoBackup(newLast);
        localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify({ ...current, lastBackup: newLast }));
        message.success('자동 백업이 완료되었습니다');
      } catch (error) {
        message.error('자동 백업 실패: ' + error);
      }
    }
  }, []);

  useEffect(() => {
    if (!autoBackupEnabled) return;
    checkAndAutoBackup();
    const interval = setInterval(checkAndAutoBackup, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoBackupEnabled, autoBackupInterval, checkAndAutoBackup]);

  const handleAutoBackupToggle = (checked: boolean) => {
    setAutoBackupEnabled(checked);
    const settings = { enabled: checked, intervalHours: autoBackupInterval, lastBackup: checked ? lastAutoBackup : undefined };
    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(settings));
    message.info(checked ? '자동 백업이 활성화되었습니다' : '자동 백업이 비활성화되었습니다');
  };

  const handleAutoBackupIntervalChange = (value: number | null) => {
    if (value && value > 0) {
      setAutoBackupInterval(value);
      localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify({ enabled: autoBackupEnabled, intervalHours: value, lastBackup: lastAutoBackup }));
    }
  };

  const fontSizeOptions = [
    { label: '작게', value: 'small' as FontSize },
    { label: '보통', value: 'medium' as FontSize },
    { label: '크게', value: 'large' as FontSize },
    { label: '아주 크게', value: 'extra-large' as FontSize },
  ];

  // 업데이트 확인
  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateAvailable(null);
    setIsLatest(false);
    try {
      const update = await check();
      if (update && update.version !== APP_VERSION) {
        setUpdateAvailable({
          version: update.version,
          body: update.body || '새로운 버전이 있습니다.',
        });
        message.info(`새 버전 v${update.version}이 있습니다! (현재: v${APP_VERSION})`);
      } else if (update) {
        setIsLatest(true);
        message.success(`최신 버전입니다.`);
      } else {
        setIsLatest(true);
        message.success('최신 버전입니다.');
      }
    } catch (error: any) {
      console.error('Update check:', error);
      message.error(`업데이트 확인 실패: ${error?.message || error} (현재: v${APP_VERSION})`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  // 업데이트 다운로드 및 설치
  const handleDownloadUpdate = async () => {
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const update = await check();
      if (update) {
        let downloaded = 0;
        let contentLength = 0;

        await update.download((event) => {
          switch (event.event) {
            case 'Started':
              contentLength = event.data.contentLength || 0;
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              if (contentLength > 0) {
                setDownloadProgress(Math.round((downloaded / contentLength) * 100));
              }
              break;
            case 'Finished':
              setDownloadProgress(100);
              break;
          }
        });

        setDownloading(false);
        Modal.confirm({
          title: '업데이트 다운로드 완료',
          content: '업데이트를 설치하고 재시작하시겠습니까?',
          okText: '설치 및 재시작',
          cancelText: '나중에',
          onOk: async () => {
            await update.install();
            await relaunch();
          },
        });
      }
    } catch (error) {
      console.error('Update download failed:', error);
      message.error('업데이트 다운로드에 실패했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  const handleActivateLicense = async () => {
    const key = licenseInput.join('-');
    if (licenseInput.some((g) => g.length !== 4)) {
      message.warning('라이선스 키를 모두 입력하세요.');
      return;
    }
    setActivating(true);
    try {
      const result = await activateLicense(key);
      if (result.result === 'success') {
        message.success('라이선스가 활성화되었습니다!');
        setLicenseInput(['', '', '', '']);
        // 새 조직이면 로컬 데이터 마이그레이션 제안
        if (result.isNewOrg && useAuthStore.getState().isCloud) {
          try {
            const courses = JSON.parse(sessionStorage.getItem('courses') || '[]');
            const students = JSON.parse(sessionStorage.getItem('students') || '[]');
            if (courses.length > 0 || students.length > 0) {
              setShowMigration(true);
            }
          } catch {
            // ignore
          }
        }
      } else if (result.result === 'invalid_format') {
        message.error('유효하지 않은 형식입니다.');
      } else if (result.result === 'network_error') {
        message.error('서버에 연결할 수 없습니다. 인터넷 연결을 확인하세요.');
      } else if (result.result === 'max_seats_reached') {
        message.error('이 라이선스의 최대 사용자 수에 도달했습니다.');
      } else {
        message.error('유효하지 않은 라이선스 키입니다.');
      }
    } finally {
      setActivating(false);
    }
  };

  const handleImportBackup = async () => {
    const result = await importBackup();
    if (!result) return;

    Modal.confirm({
      title: '백업 파일 복원',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>백업 파일을 불러왔습니다. 바로 복원하시겠습니까?</p>
          <p><Text type="danger">현재 데이터가 백업 데이터로 교체됩니다. 현재 데이터는 자동 백업됩니다.</Text></p>
        </div>
      ),
      okText: '복원',
      okType: 'danger',
      cancelText: '나중에',
      onOk: () => restoreBackup(result.filename),
      onCancel: () => {
        message.info('백업 목록에 추가되었습니다. 나중에 복원할 수 있습니다.');
      },
    });
  };

  const handleRestore = (filename: string) => {
    Modal.confirm({
      title: '백업 복원',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>정말로 이 백업을 복원하시겠습니까?</p>
          <p>
            <Text type="danger">
              현재 데이터가 백업 시점으로 되돌아갑니다. 복원 전 자동으로 현재 데이터를 백업합니다.
            </Text>
          </p>
        </div>
      ),
      okText: '복원',
      okType: 'danger',
      cancelText: '취소',
      onOk: () => restoreBackup(filename),
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const backupColumns = [
    {
      title: '백업 파일명',
      dataIndex: 'filename',
      key: 'filename',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: '파일 크기',
      dataIndex: 'size',
      key: 'size',
      render: (size: number) => formatFileSize(size),
    },
    {
      title: '생성 일시',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '상태',
      key: 'status',
      render: (_: any, record: BackupInfo) => {
        const now = dayjs();
        const createdAt = dayjs(record.created_at);
        const hoursAgo = now.diff(createdAt, 'hour');

        if (hoursAgo < 24) {
          return <Tag color="green">최신</Tag>;
        } else if (hoursAgo < 168) {
          return <Tag color="blue">1주일 이내</Tag>;
        } else {
          return <Tag color="default">오래됨</Tag>;
        }
      },
    },
    {
      title: '작업',
      key: 'action',
      render: (_: any, record: BackupInfo) => (
        <Space>
          <Button
            type="primary"
            icon={<RollbackOutlined />}
            onClick={() => handleRestore(record.filename)}
            loading={restoring === record.filename}
            disabled={restoring !== null}
          >
            복원
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => downloadBackup(record.filename)}
          >
            다운로드
          </Button>
          <Popconfirm
            title="백업 삭제"
            description="정말로 이 백업을 삭제하시겠습니까?"
            onConfirm={() => deleteBackup(record.filename)}
            okText="삭제"
            cancelText="취소"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />}>
              삭제
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const settingRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 0',
  };

  const tabItems = [
    {
      key: 'general',
      label: '일반',
      children: (
        <Card style={{ maxWidth: 1000 }}>
          {/* 이름 */}
          <div style={settingRowStyle}>
            <div style={{ flex: 1, marginRight: 24 }}>
              <Text strong>이름</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '0.85em' }}>
                {currentPlan === 'trial' ? '라이선스 활성화 후 변경 가능' : '헤더와 백업 파일명에 표시'}
              </Text>
            </div>
            <Space>
              <Input
                value={orgNameInput}
                onChange={(e) => setOrgNameInput(e.target.value)}
                placeholder="이름을 입력하세요"
                style={{ width: 240 }}
                disabled={currentPlan === 'trial'}
              />
              <Button
                type="primary"
                icon={<SaveOutlined />}
                size="small"
                disabled={currentPlan === 'trial' || orgNameInput === organizationName}
                onClick={async () => {
                  setOrganizationName(orgNameInput);
                  // 클라우드 모드면 Supabase organizations 테이블도 업데이트
                  const orgId = useAuthStore.getState().organizationId;
                  if (supabase && orgId) {
                    await supabase.from('organizations').update({ name: orgNameInput }).eq('id', orgId);
                  }
                  message.success('이름이 저장되었습니다.');
                }}
              >
                저장
              </Button>
            </Space>
          </div>

          <Divider style={{ margin: 0 }} />

          {/* 다크 모드 */}
          <div style={settingRowStyle}>
            <div>
              <Text strong>다크 모드</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '0.85em' }}>앱의 테마를 변경합니다</Text>
            </div>
            <Switch
              checked={appTheme === 'dark'}
              onChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              checkedChildren="켜짐"
              unCheckedChildren="꺼짐"
            />
          </div>

          <Divider style={{ margin: 0 }} />

          {/* 텍스트 크기 */}
          <div style={settingRowStyle}>
            <div>
              <Text strong>텍스트 크기</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '0.85em' }}>앱 전체의 텍스트 크기를 조절합니다</Text>
            </div>
            <Radio.Group
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value)}
              options={fontSizeOptions}
              optionType="button"
              buttonStyle="solid"
              size="small"
            />
          </div>

          <Divider style={{ margin: 0 }} />

          {/* 알림 */}
          <div style={settingRowStyle}>
            <div>
              <Text strong>알림</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '0.85em' }}>
                {notificationsEnabled ? '앱 내 알림이 활성화되어 있습니다' : '알림이 비활성화되어 있습니다'}
              </Text>
            </div>
            <Switch
              checked={notificationsEnabled}
              onChange={setNotificationsEnabled}
              checkedChildren="켜짐"
              unCheckedChildren="꺼짐"
            />
          </div>

          <Divider style={{ margin: 0 }} />

          {/* 앱 정보 */}
          <div style={settingRowStyle}>
            <div>
              <Text strong>앱 정보</Text>
              <br />
              <Space size={8}>
                <Text type="secondary" style={{ fontSize: '0.85em' }}>{APP_NAME} v{APP_VERSION}</Text>
                {isLatest && <Tag color="green" style={{ margin: 0 }}>최신 버전</Tag>}
              </Space>
            </div>
            <Button
              onClick={handleCheckUpdate}
              loading={checkingUpdate}
              size="small"
            >
              업데이트 확인
            </Button>
          </div>

          {updateAvailable && (
            <>
              <Divider style={{ margin: 0 }} />
              <div style={{ padding: '16px 0' }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space>
                    <Tag color="green">새 버전</Tag>
                    <Text strong>v{updateAvailable.version}</Text>
                  </Space>
                  <Text type="secondary">{updateAvailable.body}</Text>
                  {downloading ? (
                    <Progress percent={downloadProgress} status="active" />
                  ) : (
                    <Button type="primary" onClick={handleDownloadUpdate} size="small">
                      다운로드 및 설치
                    </Button>
                  )}
                </Space>
              </div>
            </>
          )}
        </Card>
      ),
    },
    {
      key: 'backup',
      label: '백업',
      children: (
        <Card style={{ maxWidth: 1000 }}>
          {/* 수동 백업 */}
          <div style={settingRowStyle}>
            <div>
              <Text strong>수동 백업</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '0.85em' }}>데이터를 백업하거나 외부 파일을 불러옵니다</Text>
            </div>
            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={createBackup}
                loading={creating}
                size="small"
              >
                {creating ? '생성 중...' : '지금 백업'}
              </Button>
              <Button
                icon={<ImportOutlined />}
                onClick={handleImportBackup}
                loading={importing}
                size="small"
              >
                {importing ? '불러오는 중...' : '불러오기'}
              </Button>
            </Space>
          </div>

          <Divider style={{ margin: 0 }} />

          {/* 자동 백업 */}
          <div style={settingRowStyle}>
            <div>
              <Text strong>자동 백업</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '0.85em' }}>
                {autoBackupEnabled
                  ? lastAutoBackup
                    ? `다음 백업: ${nextBackupTime}`
                    : '즉시 백업 예정'
                  : '앱 실행 중 주기적으로 자동 백업'}
              </Text>
            </div>
            <Space>
              {autoBackupEnabled && (
                <InputNumber
                  min={1}
                  max={168}
                  value={autoBackupInterval}
                  onChange={handleAutoBackupIntervalChange}
                  style={{ width: 80 }}
                  size="small"
                  addonAfter="시간"
                />
              )}
              <Switch
                checked={autoBackupEnabled}
                onChange={handleAutoBackupToggle}
                checkedChildren="켜짐"
                unCheckedChildren="꺼짐"
              />
            </Space>
          </div>

          {creating && (
            <>
              <Divider style={{ margin: 0 }} />
              <div style={{ padding: '12px 0' }}>
                <Progress percent={100} status="active" />
                <Text type="secondary">데이터를 백업하고 있습니다...</Text>
              </div>
            </>
          )}

          <Divider style={{ margin: 0 }} />

          {/* 백업 목록 */}
          <div style={{ paddingTop: 16 }}>
            <Table
              columns={backupColumns}
              dataSource={backups}
              rowKey="filename"
              loading={loading}
              pagination={false}
              size="small"
              locale={{
                emptyText: '백업이 없습니다. "지금 백업" 버튼을 눌러 첫 백업을 생성하세요.',
              }}
            />
          </div>
        </Card>
      ),
    },
    {
      key: 'license',
      label: '라이선스',
      children: (
        <Card style={{ maxWidth: 1000 }}>
          {/* 현재 플랜 */}
          <div style={settingRowStyle}>
            <div>
              <Text strong>현재 플랜</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '0.85em' }}>
                {currentPlan === 'trial'
                  ? `강좌 ${PLAN_LIMITS.trial.maxCourses}개, 강좌당 수강생 ${PLAN_LIMITS.trial.maxStudentsPerCourse}명 제한`
                  : '모든 기능을 제한 없이 사용 가능'}
              </Text>
            </div>
            <Tag
              color={currentPlan === 'trial' ? 'orange' : currentPlan === 'admin' ? 'red' : 'green'}
              style={{ fontSize: 13, padding: '2px 10px' }}
            >
              {currentPlan === 'trial' ? '체험판' : currentPlan === 'admin' ? 'Admin' : 'Basic'}
            </Tag>
          </div>

          <Divider style={{ margin: 0 }} />

          {/* 라이선스 키 */}
          <div style={{ padding: '16px 0' }}>
            <div style={{ marginBottom: 12 }}>
              <Text strong>라이선스 키</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '0.85em' }}>
                라이선스 키를 입력하여 모든 기능을 활성화하세요 (문의: 010-3556-7586)
              </Text>
            </div>
            {currentPlan !== 'trial' && licenseKey ? (
              <Space>
                <Text code>{showKey ? licenseKey : `${licenseKey.slice(0, 9)}****-****`}</Text>
                <Button
                  type="text"
                  size="small"
                  icon={showKey ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  onClick={() => setShowKey(!showKey)}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => { navigator.clipboard.writeText(licenseKey); message.success('키가 복사되었습니다.'); }}
                />
                <Tag color="green">활성화됨</Tag>
                <Button
                  size="small"
                  danger
                  onClick={() => {
                    Modal.confirm({
                      title: '로그아웃',
                      icon: <ExclamationCircleOutlined />,
                      content: '로그아웃하면 클라우드 동기화가 해제됩니다. 계속하시겠습니까?',
                      okText: '로그아웃',
                      okType: 'danger',
                      cancelText: '취소',
                      onOk: async () => {
                        await deactivateLicense();
                        message.success('로그아웃되었습니다.');
                      },
                    });
                  }}
                >
                  로그아웃
                </Button>
              </Space>
            ) : (
              <Space direction="vertical" size={8}>
                <Text type="secondary" style={{ fontSize: '0.85em' }}>
                  키를 직접 입력하거나 전체 붙여넣기 하세요
                </Text>
                <Space>
                  <LicenseKeyInput value={licenseInput} onChange={setLicenseInput} onPressEnter={handleActivateLicense} />
                  <Button type="primary" onClick={handleActivateLicense} loading={activating}>
                    활성화
                  </Button>
                </Space>
              </Space>
            )}
          </div>

        </Card>
      ),
    },
    // Admin 탭: admin 플랜이거나 DEV 모드일 때 표시
    ...(currentPlan === 'admin'
      ? [{
          key: 'admin',
          label: 'Admin',
          children: <AdminTab />,
        }]
      : []),
  ];

  return (
    <div>
      <Tabs items={tabItems} defaultActiveKey={defaultTab} />
      <MigrationModal
        visible={showMigration}
        onClose={() => setShowMigration(false)}
      />
    </div>
  );
};

export default SettingsPage;
