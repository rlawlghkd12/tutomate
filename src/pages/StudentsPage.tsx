import React, { useState, useEffect, useMemo } from 'react';
import { Button, Space, Modal, Checkbox, theme, message } from 'antd';
import { PlusOutlined, DownloadOutlined, FileExcelOutlined, FileTextOutlined } from '@ant-design/icons';
import StudentList from '../components/students/StudentList';
import StudentForm from '../components/students/StudentForm';
import { useStudentStore } from '../stores/studentStore';
import { useEnrollmentStore } from '../stores/enrollmentStore';
import { useCourseStore } from '../stores/courseStore';
import { exportStudentsToExcel, exportStudentsToCSV, STUDENT_EXPORT_FIELDS } from '../utils/export';

const DEFAULT_EXPORT_FIELDS = ['name', 'phone', 'enrolledCourses', 'totalPaid', 'totalRemaining'];

const StudentsPage: React.FC = () => {
  const { token } = theme.useToken();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>(DEFAULT_EXPORT_FIELDS);
  const { students, loadStudents } = useStudentStore();
  const { enrollments, loadEnrollments } = useEnrollmentStore();
  const { courses, loadCourses } = useCourseStore();

  useEffect(() => {
    loadStudents();
    loadEnrollments();
    loadCourses();
  }, [loadStudents, loadEnrollments, loadCourses]);

  const handleExport = (type: 'excel' | 'csv') => {
    if (selectedExportFields.length === 0) {
      message.warning('내보낼 필드를 1개 이상 선택해주세요.');
      return;
    }

    if (students.length === 0) {
      message.warning('내보낼 수강생 데이터가 없습니다');
      return;
    }

    try {
      if (type === 'excel') {
        exportStudentsToExcel(students, enrollments, courses, selectedExportFields);
        message.success('Excel 파일이 다운로드되었습니다');
      } else {
        exportStudentsToCSV(students, enrollments, courses, 'utf-8', selectedExportFields);
        message.success('CSV 파일이 다운로드되었습니다');
      }
      setIsExportModalVisible(false);
    } catch (error) {
      message.error('파일 내보내기에 실패했습니다');
    }
  };

  const allFieldKeys = useMemo(() => STUDENT_EXPORT_FIELDS.map((f) => f.key), []);
  const isAllSelected = selectedExportFields.length === allFieldKeys.length;

  return (
    <div>
      <StudentList
        actions={
          <Space>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => setIsExportModalVisible(true)}
            >
              내보내기
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsModalVisible(true)}
            >
              수강생 등록
            </Button>
          </Space>
        }
      />
      <StudentForm
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        student={null}
      />

      <Modal
        title="수강생 내보내기"
        open={isExportModalVisible}
        onCancel={() => setIsExportModalVisible(false)}
        width={320}
        footer={null}
      >
        <div style={{
          padding: '4px 0 8px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          marginBottom: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Checkbox
            checked={isAllSelected}
            indeterminate={selectedExportFields.length > 0 && !isAllSelected}
            onChange={(e) => setSelectedExportFields(e.target.checked ? allFieldKeys : [])}
          >
            전체 선택
          </Checkbox>
          <span style={{ fontSize: 12, color: token.colorTextTertiary }}>
            {selectedExportFields.length}/{allFieldKeys.length}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
          {STUDENT_EXPORT_FIELDS.map((field) => {
            const isChecked = selectedExportFields.includes(field.key);
            return (
              <div
                key={field.key}
                onClick={() => {
                  setSelectedExportFields((prev) =>
                    isChecked ? prev.filter((k) => k !== field.key) : [...prev, field.key]
                  );
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: token.borderRadius,
                  cursor: 'pointer',
                  background: isChecked ? token.colorPrimaryBg : 'transparent',
                }}
              >
                <Checkbox checked={isChecked} />
                <span style={{ fontSize: 13 }}>{field.label}</span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            type="primary"
            icon={<FileExcelOutlined />}
            onClick={() => handleExport('excel')}
            block
          >
            Excel
          </Button>
          <Button
            icon={<FileTextOutlined />}
            onClick={() => handleExport('csv')}
            block
          >
            CSV
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default StudentsPage;
