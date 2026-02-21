import React, { useEffect, useState } from 'react';
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
  message,
  Modal,
  Progress,
  Tag,
  Popconfirm,
  Row,
  Col,
  theme,
} from 'antd';
import {
  SaveOutlined,
  RollbackOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  ImportOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import dayjs from 'dayjs';
import { useSettingsStore, type FontSize } from '../stores/settingsStore';
import { AutoBackupScheduler } from '../components/backup/AutoBackupScheduler';
import { useAppVersion, APP_NAME } from '../config/version';
import { useBackup, type BackupInfo } from '../hooks/useBackup';

const { Title, Text } = Typography;
const { useToken } = theme;

const SettingsPage: React.FC = () => {
  const { token } = useToken();
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
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; body: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
    try {
      const update = await check();
      if (update && update.version !== APP_VERSION) {
        setUpdateAvailable({
          version: update.version,
          body: update.body || '새로운 버전이 있습니다.',
        });
        message.info(`새 버전 v${update.version}이 있습니다! (현재: v${APP_VERSION})`);
      } else if (update) {
        message.success(`최신 버전입니다. (현재: v${APP_VERSION}, 서버: v${update.version})`);
      } else {
        message.warning(`업데이트 정보 없음 (현재: v${APP_VERSION})`);
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

        await update.downloadAndInstall((event) => {
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

        message.success('업데이트가 완료되었습니다. 앱을 재시작합니다.');
        await relaunch();
      }
    } catch (error) {
      console.error('Update download failed:', error);
      message.error('업데이트 다운로드에 실패했습니다.');
    } finally {
      setDownloading(false);
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

  const tabItems = [
    {
      key: 'general',
      label: '일반',
      children: (
        <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 800 }}>
          {/* 기관명 설정 */}
          <Card>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Title level={4}>기관명</Title>
                <Text type="secondary">헤더와 백업 파일명에 표시되는 기관명을 설정합니다.</Text>
              </div>
              <Input
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="기관명을 입력하세요"
                style={{ maxWidth: 400 }}
              />
            </Space>
          </Card>

          {/* 테마 설정 */}
          <Card>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Title level={4}>테마</Title>
                <Text type="secondary">앱의 테마를 변경합니다.</Text>
              </div>
              <Space>
                <Text>다크 모드:</Text>
                <Switch
                  checked={appTheme === 'dark'}
                  onChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                  checkedChildren="켜짐"
                  unCheckedChildren="꺼짐"
                />
              </Space>
            </Space>
          </Card>

          {/* 폰트 크기 설정 */}
          <Card>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Title level={4}>텍스트 크기</Title>
                <Text type="secondary">앱 전체의 텍스트 크기를 조절합니다.</Text>
              </div>
              <Radio.Group
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
                options={fontSizeOptions}
                optionType="button"
                buttonStyle="solid"
              />
              <Divider />
              <div>
                <Text style={{ fontSize: fontSize === 'small' ? 12 : fontSize === 'medium' ? 14 : fontSize === 'large' ? 16 : 18 }}>
                  미리보기: 이것은 선택한 크기의 텍스트입니다.
                </Text>
              </div>
            </Space>
          </Card>

          {/* 알림 설정 */}
          <Card>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Title level={4}>알림</Title>
                <Text type="secondary">앱 내 알림을 제어합니다.</Text>
              </div>
              <Space>
                <Text>알림 활성화:</Text>
                <Switch
                  checked={notificationsEnabled}
                  onChange={setNotificationsEnabled}
                  checkedChildren="켜짐"
                  unCheckedChildren="꺼짐"
                />
              </Space>
              {!notificationsEnabled && (
                <Text type="warning">
                  알림이 비활성화되어 있습니다. 중요한 업데이트를 놓칠 수 있습니다.
                </Text>
              )}
            </Space>
          </Card>

          {/* 버전 정보 */}
          <Card>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Title level={4}>앱 정보</Title>
              </div>
              <Row gutter={16} align="middle">
                <Col>
                  <Text>현재 버전:</Text>
                </Col>
                <Col>
                  <Text strong>v{APP_VERSION}</Text>
                </Col>
                <Col>
                  <Button
                    onClick={handleCheckUpdate}
                    loading={checkingUpdate}
                    size="small"
                  >
                    업데이트 확인
                  </Button>
                </Col>
              </Row>

              {updateAvailable && (
                <Card
                  size="small"
                  style={{
                    backgroundColor: token.colorBgElevated,
                    border: `1px solid ${token.colorPrimary}`,
                  }}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Space>
                      <Tag color="green">새 버전</Tag>
                      <Text strong style={{ color: token.colorText }}>v{updateAvailable.version}</Text>
                    </Space>
                    <Text style={{ color: token.colorTextSecondary }}>{updateAvailable.body}</Text>
                    {downloading ? (
                      <Progress percent={downloadProgress} status="active" />
                    ) : (
                      <Button type="primary" onClick={handleDownloadUpdate}>
                        다운로드 및 설치
                      </Button>
                    )}
                  </Space>
                </Card>
              )}

              <Text type="secondary">{APP_NAME}</Text>
            </Space>
          </Card>
        </Space>
      ),
    },
    {
      key: 'backup',
      label: '백업',
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <Card>
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <div>
                  <Title level={4}>데이터 백업 및 복구</Title>
                  <Text type="secondary">
                    중요한 데이터를 안전하게 백업하고 필요시 복원할 수 있습니다.
                  </Text>
                </div>

                <Space>
                  <Button
                    type="primary"
                    size="large"
                    icon={<SaveOutlined />}
                    onClick={createBackup}
                    loading={creating}
                  >
                    {creating ? '백업 생성 중...' : '지금 백업'}
                  </Button>
                  <Button
                    size="large"
                    icon={<ImportOutlined />}
                    onClick={handleImportBackup}
                    loading={importing}
                  >
                    {importing ? '불러오는 중...' : '백업 파일 불러오기'}
                  </Button>
                </Space>

                {creating && (
                  <div>
                    <Progress percent={100} status="active" />
                    <Text type="secondary">데이터를 백업하고 있습니다...</Text>
                  </div>
                )}

                <Table
                  columns={backupColumns}
                  dataSource={backups}
                  rowKey="filename"
                  loading={loading}
                  pagination={false}
                  locale={{
                    emptyText: '백업이 없습니다. "지금 백업" 버튼을 눌러 첫 백업을 생성하세요.',
                  }}
                />

                <Card
                  size="small"
                  style={{
                    backgroundColor: token.colorInfoBg,
                    border: `1px solid ${token.colorInfoBorder}`
                  }}
                >
                  <Space direction="vertical">
                    <Text strong>백업 안내</Text>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      <li>백업은 모든 강좌, 수강생 데이터를 포함합니다</li>
                      <li>복원 시 현재 데이터는 자동으로 백업됩니다</li>
                      <li>정기적으로 백업을 생성하여 데이터 손실을 방지하세요</li>
                    </ul>
                  </Space>
                </Card>
              </Space>
            </Card>
          </Col>

          <Col xs={24} lg={8}>
            <AutoBackupScheduler />
          </Col>
        </Row>
      ),
    },
  ];

  return (
    <div>
      <Tabs items={tabItems} />
    </div>
  );
};

export default SettingsPage;
