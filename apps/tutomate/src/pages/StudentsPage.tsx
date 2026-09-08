import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { StudentList, StudentForm, EnrollmentForm, PageEnter, ExportQuarterScope, EXPORT_SCOPE_ALL } from '@tutomate/ui';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '../components/ui/alert-dialog';
import {
  useStudentStore,
  useEnrollmentStore,
  useCourseStore,
  exportStudentsToExcel,
  exportStudentsToCSV,
  STUDENT_EXPORT_FIELDS,
  isActiveEnrollment,
  getCurrentQuarter,
  getQuarterOptions,
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
  const [exportScope, setExportScope] = useState<string>(getCurrentQuarter());
  const { students, loadStudents, getStudentById } = useStudentStore();
  const { enrollments, loadEnrollments } = useEnrollmentStore();
  const { courses, loadCourses } = useCourseStore();

  const quarterOptions = useMemo(
    () => getQuarterOptions(enrollments.map((e) => e.quarter).filter(Boolean) as string[]),
    [enrollments],
  );
  // 선택한 분기 범위에 해당하는 수강 등록 (수강취소 포함 여부와 무관)
  const scopedEnrollments = useMemo(
    () =>
      exportScope === EXPORT_SCOPE_ALL
        ? enrollments
        : enrollments.filter((e) => e.quarter === exportScope || !e.quarter),
    [exportScope, enrollments],
  );
  // 실제 내보낼 등록: 수강취소생은 항상 제외(활성 등록만)
  const exportEnrollments = useMemo(
    () => scopedEnrollments.filter(isActiveEnrollment),
    [scopedEnrollments],
  );
  // 내보낼 수강생: "범위 내 등록이 있으나 활성 등록이 없는(수강취소만 남은)" 학생 제외
  const exportStudents = useMemo(() => {
    const activeIds = new Set(exportEnrollments.map((e) => e.studentId));
    const scopedIds = new Set(scopedEnrollments.map((e) => e.studentId));
    return students.filter((s) => !scopedIds.has(s.id) || activeIds.has(s.id));
  }, [students, exportEnrollments, scopedEnrollments]);
  const exportQuarterTag = exportScope === EXPORT_SCOPE_ALL ? '전체분기' : exportScope;

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

    if (exportStudents.length === 0) {
      toast.warning('내보낼 수강생 데이터가 없습니다');
      return;
    }

    try {
      if (type === 'excel') {
        exportStudentsToExcel(exportStudents, exportEnrollments, courses, selectedExportFields, exportQuarterTag);
        toast.success('Excel 파일이 다운로드되었습니다');
      } else {
        exportStudentsToCSV(exportStudents, exportEnrollments, courses, 'utf-8', selectedExportFields, exportQuarterTag);
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
        <DialogContent className="max-w-[320px]">
          <DialogHeader>
            <DialogTitle>수강생 내보내기</DialogTitle>
            <DialogDescription className="sr-only">내보낼 필드를 선택하세요</DialogDescription>
          </DialogHeader>

          <ExportQuarterScope
            value={exportScope}
            onChange={setExportScope}
            quarters={quarterOptions}
          />

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

          <div className="flex flex-col gap-0.5 mb-2">
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
