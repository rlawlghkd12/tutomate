import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Table,
  Space,
  Typography,
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
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import dayjs from 'dayjs';
import { AutoBackupScheduler } from '../components/backup/AutoBackupScheduler';

const { Title, Text } = Typography;
const { useToken } = theme;

interface BackupInfo {
  filename: string;
  size: number;
  created_at: string;
}

const BackupManagementPage: React.FC = () => {
  const { token } = useToken();
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const result = await invoke<BackupInfo[]>('list_backups');
      setBackups(result);
    } catch (error) {
      message.error('백업 목록을 불러오는데 실패했습니다: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      await invoke<BackupInfo>('create_backup');
      message.success('백업이 성공적으로 생성되었습니다');
      await loadBackups();
    } catch (error) {
      message.error('백업 생성에 실패했습니다: ' + error);
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (filename: string) => {
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
      onOk: async () => {
        setRestoring(filename);
        try {
          await invoke('restore_backup', { filename });
          message.success('백업이 성공적으로 복원되었습니다. 페이지를 새로고침합니다.');
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } catch (error) {
          message.error('백업 복원에 실패했습니다: ' + error);
          setRestoring(null);
        }
      },
    });
  };

  const handleDelete = async (filename: string) => {
    try {
      await invoke('delete_backup', { filename });
      message.success('백업이 삭제되었습니다');
      await loadBackups();
    } catch (error) {
      message.error('백업 삭제에 실패했습니다: ' + error);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const columns = [
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
          <Popconfirm
            title="백업 삭제"
            description="정말로 이 백업을 삭제하시겠습니까?"
            onConfirm={() => handleDelete(record.filename)}
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

  return (
    <div>
      <Title level={2}>백업 관리</Title>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={16}>
          <Card>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <Title level={4}>데이터 백업 및 복구</Title>
                <Text type="secondary">
                  중요한 데이터를 안전하게 백업하고 필요시 복원할 수 있습니다.
                </Text>
              </div>

              <div>
                <Button
                  type="primary"
                  size="large"
                  icon={<SaveOutlined />}
                  onClick={handleCreateBackup}
                  loading={creating}
                >
                  {creating ? '백업 생성 중...' : '지금 백업'}
                </Button>
              </div>

              {creating && (
                <div>
                  <Progress percent={100} status="active" />
                  <Text type="secondary">데이터를 백업하고 있습니다...</Text>
                </div>
              )}

              <Table
                columns={columns}
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
                    <li>백업 파일은 프로그램 설치 폴더의 backups 디렉토리에 저장됩니다</li>
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
    </div>
  );
};

export default BackupManagementPage;
