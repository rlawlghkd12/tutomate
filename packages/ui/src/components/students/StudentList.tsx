import React, { useState, useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { Search, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Student } from '@tutomate/core';
import { useStudentStore } from '@tutomate/core';
import { appConfig, isActiveEnrollment, isCourseEnded } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import { useCourseStore } from '@tutomate/core';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

import StudentForm from './StudentForm';
import EnrollmentForm from './EnrollmentForm';

interface StudentRow {
  rowKey: string;
  index: number;
  student: Student;
  courses: { id: string; name: string }[];
}

interface StudentListProps {
  actions?: React.ReactNode;
}

const StudentList: React.FC<StudentListProps> = ({ actions }) => {
  const navigate = useNavigate();
  const { students } = useStudentStore();
  const { enrollments } = useEnrollmentStore();
  const { courses } = useCourseStore();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [enrollStudent, setEnrollStudent] = useState<Student | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchField, setSearchField] = useState<string>('all');
  const [sorting, setSorting] = useState<SortingState>([]);

  const handleEdit = useCallback((student: Student) => {
    setSelectedStudent(student);
    setIsModalVisible(true);
  }, []);

  const handleCloseStudentModal = useCallback(() => {
    setIsModalVisible(false);
    setSelectedStudent(null);
  }, []);

  // 학생별로 행 생성 (강좌는 배열로)
  const studentRows = useMemo(() => {
    return students.map((student, index) => {
      const studentEnrollments = enrollments.filter((e) => e.studentId === student.id && isActiveEnrollment(e));
      const studentCourses = studentEnrollments
        .map((enrollment) => {
          const course = courses.find((c) => c.id === enrollment.courseId);
          return course && !isCourseEnded(course) ? { id: course.id, name: course.name } : null;
        })
        .filter((c): c is { id: string; name: string } => c !== null);

      return {
        rowKey: student.id,
        index: index + 1,
        student,
        courses: studentCourses,
      };
    });
  }, [students, enrollments, courses]);

  // 필터링
  const filteredRows = useMemo(() => {
    const filtered = studentRows.filter((row) => {
      if (!searchText) return true;
      const searchLower = searchText.toLowerCase();
      switch (searchField) {
        case 'name':
          return row.student.name.toLowerCase().includes(searchLower);
        case 'phone':
          return row.student.phone.includes(searchText);
        case 'course':
          return row.courses.some((c) => c.name.toLowerCase().includes(searchLower));
        case 'notes':
          return (row.student.notes || '').toLowerCase().includes(searchLower);
        default:
          return (
            row.student.name.toLowerCase().includes(searchLower) ||
            row.student.phone.includes(searchText) ||
            row.courses.some((c) => c.name.toLowerCase().includes(searchLower)) ||
            (row.student.notes || '').toLowerCase().includes(searchLower)
          );
      }
    });

    // 필터링 후 인덱스 재부여
    return filtered.map((row, idx) => ({ ...row, index: idx + 1 }));
  }, [studentRows, searchText, searchField]);

  const columns = useMemo<ColumnDef<StudentRow>[]>(() => [
    {
      id: 'index',
      header: 'No.',
      size: 40,
      enableSorting: false,
      cell: ({ row }) => row.original.index,
    },
    {
      id: 'name',
      header: '이름',
      accessorFn: (row) => row.student.name,
      cell: ({ row }) => (
        <button
          className="text-primary hover:underline whitespace-nowrap"
          onClick={() => handleEdit(row.original.student)}
        >
          {row.original.student.name}
        </button>
      ),
    },
    ...(appConfig.enableMemberFeature ? [{
      id: 'isMember',
      header: '회원',
      enableSorting: true,
      accessorFn: (row: StudentRow) => row.student.isMember ? 1 : 0,
      sortingFn: 'basic',
      cell: ({ row }: { row: { original: StudentRow } }) => row.original.student.isMember
        ? <Badge>회원</Badge>
        : <Badge variant="secondary">비회원</Badge>,
    } satisfies ColumnDef<StudentRow>] : []),
    {
      id: 'phone',
      header: '전화번호',
      enableSorting: false,
      cell: ({ row }) => <span className="whitespace-nowrap">{row.original.student.phone}</span>,
    },
    {
      id: 'courses',
      header: '강좌',
      enableSorting: false,
      cell: ({ row }) => {
        if (row.original.courses.length === 0) {
          return <span className="text-muted-foreground/50">-</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {row.original.courses.map((course) => (
              <Badge
                key={course.id}
                className="cursor-pointer"
                onClick={() => navigate(`/courses/${course.id}`)}
              >
                {course.name}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      id: 'notes',
      header: '메모',
      enableSorting: false,
      cell: ({ row }) => row.original.student.notes ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground truncate block max-w-[200px]">
                {row.original.student.notes}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="start">
              {row.original.student.notes}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : '-',
    },
    {
      id: 'actions',
      header: '작업',
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEnrollStudent(row.original.student)}
        >
          <BookOpen className="h-3.5 w-3.5 mr-1" />
          수강 신청
        </Button>
      ),
    },
  ], [handleEdit, navigate]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.rowKey,
  });

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Select value={searchField} onValueChange={setSearchField}>
          <SelectTrigger style={{ width: 110 }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="name">이름</SelectItem>
            <SelectItem value="phone">전화번호</SelectItem>
            <SelectItem value="course">강좌</SelectItem>
            <SelectItem value="notes">메모</SelectItem>
          </SelectContent>
        </Select>
        <div style={{ position: 'relative', maxWidth: 300, flex: 1 }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'hsl(var(--muted-foreground))', pointerEvents: 'none' }} />
          <Input
            placeholder={
              searchField === 'name' ? '이름 검색' :
              searchField === 'phone' ? '전화번호 검색' :
              searchField === 'course' ? '강좌명 검색' :
              searchField === 'notes' ? '메모 검색' :
              '이름, 전화번호, 강좌, 메모 검색'
            }
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        {actions && (
          <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', gap: 8 }}>
            {actions}
          </div>
        )}
      </div>
      <div className="rounded-xl overflow-hidden bg-card [box-shadow:var(--shadow-sm)]">
      <Table style={{ width: table.getCenterTotalSize() }}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="relative group"
                  style={{
                    width: header.getSize(),
                    cursor: header.column.getCanSort() ? 'pointer' : undefined,
                    userSelect: 'none',
                  }}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {header.isPlaceholder ? null : (
                    <span className="inline-flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span className="text-[0.71rem]" style={{ opacity: header.column.getIsSorted() ? 1 : 0.3 }}>
                          {header.column.getIsSorted() === 'asc' ? '▲' : header.column.getIsSorted() === 'desc' ? '▼' : '⇅'}
                        </span>
                      )}
                    </span>
                  )}
                  {header.column.getCanResize() && (
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        'absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none opacity-0 group-hover:opacity-100 transition-opacity',
                        header.column.getIsResizing() && 'opacity-100 bg-primary'
                      )}
                      style={{ background: header.column.getIsResizing() ? undefined : 'hsl(var(--border))' }}
                    />
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {students.length === 0 ? '등록된 수강생이 없습니다' : '검색 결과가 없습니다'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </div>
      <StudentForm
        visible={isModalVisible}
        onClose={handleCloseStudentModal}
        student={selectedStudent}
      />
      <EnrollmentForm
        visible={!!enrollStudent}
        onClose={() => setEnrollStudent(null)}
        student={enrollStudent}
      />
    </>
  );
};

export default StudentList;
