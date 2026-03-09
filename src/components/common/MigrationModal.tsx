import React, { useState } from 'react';
import { Modal, Button, Space, Typography, message, Progress } from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';

import { useAuthStore } from '../../stores/authStore';
import { migrateLocalToCloud, clearLocalData } from '../../utils/migrationHelper';

const { Text } = Typography;

interface MigrationModalProps {
  visible: boolean;
  onClose: () => void;
}

export const MigrationModal: React.FC<MigrationModalProps> = ({ visible, onClose }) => {
  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleMigrate = async () => {
    const orgId = useAuthStore.getState().organizationId;
    if (!orgId) {
      message.error('조직 정보를 찾을 수 없습니다.');
      return;
    }

    setMigrating(true);
    setProgress(0);

    const result = await migrateLocalToCloud(orgId, setProgress);

    if (result.success) {
      await clearLocalData();
      const { courses, students, enrollments } = result.counts;
      message.success(
        `데이터가 클라우드로 이전되었습니다. (강좌 ${courses}개, 수강생 ${students}명, 등록 ${enrollments}건)`,
      );
      onClose();
    } else {
      message.error('데이터 이전 중 오류가 발생했습니다. 다시 시도해주세요.');
    }

    setMigrating(false);
  };

  return (
    <Modal
      title="로컬 데이터 클라우드 이전"
      open={visible}
      onCancel={onClose}
      closable={!migrating}
      maskClosable={false}
      footer={null}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <CloudUploadOutlined style={{ fontSize: 48, color: '#1890ff' }} />
        </div>
        <Text>
          기존에 저장된 로컬 데이터가 있습니다. 클라우드로 이전하면 다른 기기에서도 같은 데이터를 사용할 수 있습니다.
        </Text>
        <Text type="secondary">
          건너뛰기를 선택하면 클라우드에서 새로 시작합니다.
        </Text>

        {migrating && (
          <Progress percent={progress} status="active" />
        )}

        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose} disabled={migrating}>
            건너뛰기
          </Button>
          <Button type="primary" onClick={handleMigrate} loading={migrating}>
            클라우드로 이전
          </Button>
        </Space>
      </Space>
    </Modal>
  );
};
