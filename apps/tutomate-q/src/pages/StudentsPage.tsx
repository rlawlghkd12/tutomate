import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle,
  StudentList, StudentForm, EnrollmentForm,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
  PageEnter,
} from '@tutomate/ui';
import { useStudentStore } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import { useCourseStore } from '@tutomate/core';
import { exportStudentsToExcel, exportStudentsToCSV, STUDENT_EXPORT_FIELDS, getCurrentQuarter, isActiveEnrollment } from '@tutomate/core';

const DEFAULT_EXPORT_FIELDS = ['name', 'phone', 'enrolledCourses', 'totalPaid', 'totalRemaining'];

const StudentsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editStudent, setEditStudent] = useState<any>(null);
  const [enrollStudent, setEnrollStudent] = useState<any>(null);
  const [askEnrollStudent, setAskEnrollStudent] = useState<any>(null);
  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>(DEFAULT_EXPORT_FIELDS);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const { students, loadStudents, getStudentById } = useStudentStore();
  const { enrollments, loadEnrollments } = useEnrollmentStore();
  const { courses, loadCourses } = useCourseStore();
  const currentQuarter = getCurrentQuarter();
  const quarterEnrollments = useMemo(
    () => enrollments.filter((e) => isActiveEnrollment(e) && (e.quarter === currentQuarter || !e.quarter)),
    [enrollments, currentQuarter],
  );

  useEffect(() => {
    loadStudents();
    loadEnrollments();
    loadCourses();
  }, [loadStudents, loadEnrollments, loadCourses]);

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
        exportStudentsToExcel(students, quarterEnrollments, courses, selectedExportFields);
        toast.success('Excel 파일이 다운로드되었습니다');
      } else {
        exportStudentsToCSV(students, quarterEnrollments, courses, 'utf-8', selectedExportFields);
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
        <DialogContent className="max-w-[680px]">
          <DialogHeader>
            <DialogTitle>수강생 내보내기</DialogTitle>
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
                {selectedExportFields.length}개 선택 · 드래그로 순서 변경
              </span>
            </div>

            {/* 선택 가능한 필드 */}
            <div className="flex flex-wrap gap-2 mb-4">
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
                    className={`px-3 py-1.5 rounded-full text-[0.87rem] font-medium border transition-colors cursor-pointer ${
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

            {/* 선택된 컬럼 순서 (드래그) */}
            {selectedExportFields.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4 p-3 rounded-lg bg-muted/30 border border-dashed border-border">
                {selectedExportFields.map((key, idx) => {
                  const field = STUDENT_EXPORT_FIELDS.find((f) => f.key === key);
                  if (!field) return null;
                  const isDragging = dragIdx === idx;
                  const showLeftBar = dragOverIdx === idx && dragIdx !== null && dragIdx > idx;
                  const showRightBar = dragOverIdx === idx && dragIdx !== null && dragIdx < idx;
                  return (
                    <span
                      key={key}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(idx)); setDragIdx(idx); }}
                      onDragOver={(e) => { e.preventDefault(); if (dragOverIdx !== idx) setDragOverIdx(idx); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fromIdx = Number(e.dataTransfer.getData('text/plain'));
                        setDragIdx(null);
                        setDragOverIdx(null);
                        if (fromIdx === idx) return;
                        setSelectedExportFields((prev) => {
                          const next = [...prev];
                          const [moved] = next.splice(fromIdx, 1);
                          next.splice(idx, 0, moved);
                          return next;
                        });
                      }}
                      onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                      className={`relative px-2.5 py-1 rounded-md text-xs font-medium border cursor-grab active:cursor-grabbing select-none transition-opacity duration-150 ${
                        isDragging ? 'opacity-20' : 'bg-background'
                      }`}
                    >
                      {showLeftBar && <span className="absolute -left-1.5 top-0 bottom-0 w-0.5 bg-primary rounded-full" />}
                      {field.label}
                      {showRightBar && <span className="absolute -right-1.5 top-0 bottom-0 w-0.5 bg-primary rounded-full" />}
                    </span>
                  );
                })}
              </div>
            )}

            {/* 미리보기 */}
            {selectedExportFields.length > 0 && students.length > 0 && (
              <div className="rounded-lg border overflow-hidden mb-4">
                <div className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2 bg-muted/30">미리보기</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/20">
                        {selectedExportFields.map((key) => {
                          const field = STUDENT_EXPORT_FIELDS.find((f) => f.key === key);
                          return <th key={key} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{field?.label}</th>;
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {students.slice(0, 3).map((student) => (
                        <tr key={student.id} className="border-b last:border-0">
                          {selectedExportFields.map((key) => {
                            const field = STUDENT_EXPORT_FIELDS.find((f) => f.key === key);
                            const value = field ? field.getValue(student, quarterEnrollments, courses) : '';
                            return <td key={key} className="px-3 py-2 whitespace-nowrap truncate max-w-[150px]">{value || '-'}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
