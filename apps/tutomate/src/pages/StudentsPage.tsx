import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { StudentList, StudentForm, EnrollmentForm, PageEnter } from '@tutomate/ui';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '../components/ui/alert-dialog';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editStudent, setEditStudent] = useState<any>(null);
  const [enrollStudent, setEnrollStudent] = useState<any>(null);
  const [askEnrollStudent, setAskEnrollStudent] = useState<any>(null);
  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>(DEFAULT_EXPORT_FIELDS);
  const { students, loadStudents, getStudentById } = useStudentStore();
  const { enrollments, loadEnrollments } = useEnrollmentStore();
  const { courses, loadCourses } = useCourseStore();

  useEffect(() => {
    loadStudents();
    loadEnrollments();
    loadCourses();
  }, [loadStudents, loadEnrollments, loadCourses]);

  // URL에서 edit 파라미터 읽어서 수강생 편집 모달 열기
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && students.length > 0) {
      const student = getStudentById(editId);
      if (student) {
        setEditStudent(student);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, students, getStudentById, setSearchParams]);

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
    <PageEnter>
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
        onCreated={(s) => { setIsModalVisible(false); setAskEnrollStudent(s); }}
      />
      <StudentForm
        visible={!!editStudent}
        onClose={() => setEditStudent(null)}
        student={editStudent}
      />

      <Dialog open={isExportModalVisible} onOpenChange={setIsExportModalVisible}>
        <DialogContent className="max-w-[360px]">
          <DialogHeader>
            <DialogTitle>수강생 내보내기</DialogTitle>
            <DialogDescription className="sr-only">내보낼 필드를 선택하세요</DialogDescription>
          </DialogHeader>

          <div style={{ marginTop: 8 }}>
            <div className="flex justify-between items-center mb-3">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setSelectedExportFields(isAllSelected ? [] : allFieldKeys)}
              >
                {isAllSelected ? '선택 해제' : '전체 선택'}
              </button>
              <span className="text-xs text-muted-foreground">
                {selectedExportFields.length}개 선택
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {STUDENT_EXPORT_FIELDS.map((field) => {
                const isChecked = selectedExportFields.includes(field.key);
                return (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() => {
                      setSelectedExportFields((prev) =>
                        isChecked ? prev.filter((k) => k !== field.key) : [...prev, field.key]
                      );
                    }}
                    className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors cursor-pointer ${
                      isChecked
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30'
                    }`}
                  >
                    {field.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => handleExport('excel')}
              disabled={selectedExportFields.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleExport('csv')}
              disabled={selectedExportFields.length === 0}
            >
              <FileText className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!askEnrollStudent} onOpenChange={(open) => { if (!open) setAskEnrollStudent(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>수강 신청</AlertDialogTitle>
            <AlertDialogDescription>
              "{askEnrollStudent?.name}" 수강생의 수강 신청을 바로 하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>나중에</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setEnrollStudent(askEnrollStudent); setAskEnrollStudent(null); }}>
              수강 신청
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EnrollmentForm
        visible={!!enrollStudent}
        onClose={() => setEnrollStudent(null)}
        student={enrollStudent}
      />
    </PageEnter>
  );
};

export default StudentsPage;
