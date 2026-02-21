import React, { useState } from 'react';
import { Modal, Button, Space, Typography, message, Progress } from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';

import type { Course, Student, Enrollment } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { supabaseBulkInsert } from '../../utils/supabaseStorage';
import { mapCourseToDb, mapStudentToDb, mapEnrollmentToDb } from '../../utils/fieldMapper';
import { logInfo, logError } from '../../utils/logger';

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

    try {
      const courses: Course[] = JSON.parse(sessionStorage.getItem('courses') || '[]');
      const students: Student[] = JSON.parse(sessionStorage.getItem('students') || '[]');
      const enrollments: Enrollment[] = JSON.parse(sessionStorage.getItem('enrollments') || '[]');

      // 로컬 ID → 새 UUID 매핑 (PK 충돌 방지)
      const courseIdMap = new Map<string, string>();
      const studentIdMap = new Map<string, string>();

      const totalSteps = 3;
      let step = 0;

      // 1. 강좌 마이그레이션 (새 UUID 부여)
      if (courses.length > 0) {
        const courseRows = courses.map(c => {
          const newId = crypto.randomUUID();
          courseIdMap.set(c.id, newId);
          return mapCourseToDb({ ...c, id: newId }, orgId);
        });
        await supabaseBulkInsert('courses', courseRows);
        logInfo('Migrated courses to cloud', { data: { count: courses.length } });
      }
      step++;
      setProgress(Math.round((step / totalSteps) * 100));

      // 2. 수강생 마이그레이션 (새 UUID 부여)
      if (students.length > 0) {
        const studentRows = students.map(s => {
          const newId = crypto.randomUUID();
          studentIdMap.set(s.id, newId);
          return mapStudentToDb({ ...s, id: newId }, orgId);
        });
        await supabaseBulkInsert('students', studentRows);
        logInfo('Migrated students to cloud', { data: { count: students.length } });
      }
      step++;
      setProgress(Math.round((step / totalSteps) * 100));

      // 3. 수강 등록 마이그레이션 (새 UUID + FK 매핑)
      if (enrollments.length > 0) {
        const enrollmentRows = enrollments.map(e => {
          const newId = crypto.randomUUID();
          return mapEnrollmentToDb({
            ...e,
            id: newId,
            courseId: courseIdMap.get(e.courseId) || e.courseId,
            studentId: studentIdMap.get(e.studentId) || e.studentId,
          }, orgId);
        });
        await supabaseBulkInsert('enrollments', enrollmentRows);
        logInfo('Migrated enrollments to cloud', { data: { count: enrollments.length } });
      }
      step++;
      setProgress(100);

      message.success(
        `데이터가 클라우드로 이전되었습니다. (강좌 ${courses.length}개, 수강생 ${students.length}명, 등록 ${enrollments.length}건)`,
      );
      onClose();
    } catch (error) {
      logError('Migration failed', { error });
      message.error('데이터 이전 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setMigrating(false);
    }
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
