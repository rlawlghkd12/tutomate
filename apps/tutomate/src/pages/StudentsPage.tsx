import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { StudentList, StudentForm } from '@tutomate/ui';
import {
  useStudentStore,
  useEnrollmentStore,
  useCourseStore,
  exportStudentsToExcel,
  exportStudentsToCSV,
  STUDENT_EXPORT_FIELDS,
} from '@tutomate/core';

const DEFAULT_EXPORT_FIELDS = ['name', 'phone', 'enrolledCourses', 'totalPaid', 'totalRemaining'];

const StudentsPage: React.FC = () => {
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
      toast.warning('내보낼 필드를 1개 이상 선택해주세요.');
      return;
    }

    if (students.length === 0) {
      toast.warning('내보낼 수강생 데이터가 없습니다');
      return;
    }

    try {
      if (type === 'excel') {
        exportStudentsToExcel(students, enrollments, courses, selectedExportFields);
        toast.success('Excel 파일이 다운로드되었습니다');
      } else {
        exportStudentsToCSV(students, enrollments, courses, 'utf-8', selectedExportFields);
        toast.success('CSV 파일이 다운로드되었습니다');
      }
      setIsExportModalVisible(false);
    } catch (error) {
      toast.error('파일 내보내기에 실패했습니다');
    }
  };

  const allFieldKeys = useMemo(() => STUDENT_EXPORT_FIELDS.map((f) => f.key), []);
  const isAllSelected = selectedExportFields.length === allFieldKeys.length;

  return (
    <div>
      <StudentList
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIsExportModalVisible(true)}
            >
              <Download className="h-4 w-4" />
              내보내기
            </Button>
            <Button
              onClick={() => setIsModalVisible(true)}
            >
              <Plus className="h-4 w-4" />
              수강생 등록
            </Button>
          </div>
        }
      />
      <StudentForm
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        student={null}
      />

      <Dialog open={isExportModalVisible} onOpenChange={setIsExportModalVisible}>
        <DialogContent className="max-w-[320px]">
          <DialogHeader>
            <DialogTitle>수강생 내보내기</DialogTitle>
            <DialogDescription className="sr-only">내보낼 필드를 선택하세요</DialogDescription>
          </DialogHeader>

          <div className="flex justify-between items-center py-1 pb-2 border-b border-border mb-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={isAllSelected ? true : selectedExportFields.length > 0 ? "indeterminate" : false}
                onCheckedChange={(checked) => setSelectedExportFields(checked ? allFieldKeys : [])}
              />
              전체 선택
            </label>
            <span className="text-xs text-muted-foreground">
              {selectedExportFields.length}/{allFieldKeys.length}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 mb-4">
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
                  className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer ${
                    isChecked ? 'bg-primary/10' : 'hover:bg-muted'
                  }`}
                >
                  <Checkbox checked={isChecked} />
                  <span className="text-[13px]">{field.label}</span>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => handleExport('excel')}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleExport('csv')}
            >
              <FileText className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentsPage;
