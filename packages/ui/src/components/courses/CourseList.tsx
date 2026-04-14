import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnSizingState,
} from '@tanstack/react-table';
import { Search } from 'lucide-react';
import type { Course } from '@tutomate/core';
import { useCourseStore } from '@tutomate/core';
import { useEnrollmentStore, isCourseEnded, DAY_LABELS, isActiveEnrollment } from '@tutomate/core';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Progress } from '../ui/progress';

interface CourseListProps {
  actions?: React.ReactNode;
  quarterSelector?: React.ReactNode;
  selectedQuarter?: string;
}

const CourseList: React.FC<CourseListProps> = ({ actions, quarterSelector, selectedQuarter }) => {
  const navigate = useNavigate();
  const { courses } = useCourseStore();
  const { getEnrollmentCountByCourseId, enrollments } = useEnrollmentStore();
  const [searchText, setSearchText] = useState('');
  const [searchField, setSearchField] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('active');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    try { const s = localStorage.getItem('courseList_colSizing'); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  useEffect(() => {
    if (Object.keys(columnSizing).length > 0) localStorage.setItem('courseList_colSizing', JSON.stringify(columnSizing));
  }, [columnSizing]);

  const handleView = useCallback((id: string) => {
    const params = selectedQuarter ? `?q=${selectedQuarter}` : '';
    navigate(`/courses/${id}${params}`);
  }, [navigate, selectedQuarter]);

  const getQuarterEnrollmentCount = useCallback((courseId: string) => {
    if (!selectedQuarter) return undefined;
    return enrollments.filter(
      (e) => e.courseId === courseId && isActiveEnrollment(e) && e.quarter === selectedQuarter
    ).length;
  }, [enrollments, selectedQuarter]);

  const getStatus = useCallback((course: Course) => {
    const currentStudents =
      getQuarterEnrollmentCount(course.id) ?? getEnrollmentCountByCourseId(course.id);
    if (currentStudents >= course.maxStudents) {
      return 'full';
    } else if (currentStudents >= course.maxStudents * 0.8) {
      return 'almost';
    } else {
      return 'open';
    }
  }, [getQuarterEnrollmentCount, getEnrollmentCountByCourseId]);

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      if (!searchText) return true;
      const searchLower = searchText.toLowerCase();
      switch (searchField) {
        case 'name':
          return course.name.toLowerCase().includes(searchLower);
        case 'classroom':
          return course.classroom.toLowerCase().includes(searchLower);
        case 'instructor':
          return course.instructorName.toLowerCase().includes(searchLower);
        case 'instructorPhone':
          return course.instructorPhone.includes(searchText);
        default:
          return (
            course.name.toLowerCase().includes(searchLower) ||
            course.classroom.toLowerCase().includes(searchLower) ||
            course.instructorName.toLowerCase().includes(searchLower) ||
            course.instructorPhone.includes(searchText)
          );
      }
    });
  }, [courses, searchText, searchField]);

  const activeCourses = useMemo(() => filteredCourses.filter(c => !isCourseEnded(c)), [filteredCourses]);
  const endedCourses = useMemo(() => filteredCourses.filter(c => isCourseEnded(c)), [filteredCourses, isCourseEnded]);
  const displayedCourses = useMemo(() => {
    if (quarterSelector && selectedQuarter) {
      const [year, qStr] = selectedQuarter.split('-Q');
      const q = Number(qStr);
      const startMonth = (q - 1) * 3 + 1;
      const endMonth = q * 3;
      const quarterStart = `${year}-${String(startMonth).padStart(2, '0')}-01`;
      // 분기 마지막 날 (Q1→03-31, Q2→06-30, Q3→09-30, Q4→12-31)
      const lastDay = new Date(Number(year), endMonth, 0).getDate();
      const quarterEnd = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;

      return filteredCourses.filter((c) => {
        // 선택된 분기 이후에 생성된 강좌 제외
        if (c.createdAt && c.createdAt.slice(0, 10) > quarterEnd) return false;
        // 선택된 분기 시작 전에 종료된 강좌 제외
        if (c.schedule?.endDate && c.schedule.endDate < quarterStart) return false;
        return true;
      });
    }
    return activeTab === 'active' ? activeCourses : endedCourses;
  }, [quarterSelector, selectedQuarter, filteredCourses, activeTab, activeCourses, endedCourses]);

  const columns: ColumnDef<Course>[] = useMemo(() => [
    {
      id: 'index',
      header: 'No.',
      size: 40,
      enableSorting: false,
      cell: ({ row }) => row.index + 1,
    },
    {
      accessorKey: 'name',
      header: '강좌 이름',
      size: 200,
      cell: ({ row }) => {
        const course = row.original;
        return (
          <button
            className="text-left text-primary hover:underline cursor-pointer truncate max-w-[200px] block"
            onClick={() => handleView(course.id)}
          >
            {course.name}
            {isCourseEnded(course) && (
              <Badge variant="secondary" className="ml-2">종료</Badge>
            )}
          </button>
        );
      },
    },
    {
      id: 'schedDays',
      header: '요일',
      size: 80,
      enableSorting: false,
      cell: ({ row }) => {
        const days = row.original.schedule?.daysOfWeek;
        return Array.isArray(days) && days.length ? [...days].sort((a,b) => a-b).map(d => DAY_LABELS[d]).join(' ') : '-';
      },
    },
    {
      id: 'schedTime',
      header: '시간',
      size: 100,
      enableSorting: false,
      cell: ({ row }) => {
        const s = row.original.schedule;
        return s?.startTime && s?.endTime ? `${s.startTime}~${s.endTime}` : '-';
      },
    },
    {
      accessorKey: 'classroom',
      header: '강의실',
      size: 110,
      enableSorting: false,
    },
    {
      accessorKey: 'instructorName',
      header: '강사',
      size: 80,
      enableSorting: false,
    },
    {
      accessorKey: 'instructorPhone',
      header: '강사 전화번호',
      size: 130,
      enableSorting: false,
    },
    {
      accessorKey: 'fee',
      header: '수강료',
      size: 110,
      cell: ({ getValue }) => `₩${(getValue<number>()).toLocaleString()}`,
    },
    {
      id: 'students',
      header: '수강 인원',
      size: 90,
      accessorFn: (row) => getQuarterEnrollmentCount(row.id) ?? getEnrollmentCountByCourseId(row.id),
      cell: ({ row }) => {
        const course = row.original;
        const currentStudents = getQuarterEnrollmentCount(course.id) ?? getEnrollmentCountByCourseId(course.id);
        const percentage = (currentStudents / course.maxStudents) * 100;
        return (
          <div className="leading-tight">
            <span>{currentStudents} / {course.maxStudents}</span>
            <Progress
              value={Math.min(percentage, 100)}
              className={cn("mt-0.5 h-1.5", percentage >= 100 && "[&>div]:bg-destructive")}
            />
          </div>
        );
      },
    },
    {
      id: 'status',
      header: '상태',
      size: 75,
      enableSorting: false,
      cell: ({ row }) => {
        const status = getStatus(row.original);
        if (status === 'full') {
          return <Badge variant="destructive">정원 마감</Badge>;
        } else if (status === 'almost') {
          return <Badge variant="warning">마감 임박</Badge>;
        } else {
          return <Badge variant="success">모집 중</Badge>;
        }
      },
    },
  ], [handleView, getEnrollmentCountByCourseId, getQuarterEnrollmentCount, getStatus, isCourseEnded]);

  const table = useReactTable({
    data: displayedCourses,
    columns,
    state: {
      sorting,
      columnSizing,
    },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const emptyMessage = courses.length === 0
    ? "등록된 강좌가 없습니다"
    : quarterSelector
      ? "검색 결과가 없습니다"
      : activeTab === 'ended'
        ? "종료된 강좌가 없습니다"
        : "검색 결과가 없습니다";

  return (
    <>
      {quarterSelector ? (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          {quarterSelector}
          <span style={{ fontSize: '0.93rem', color: 'hsl(var(--muted-foreground))' }}>
            {displayedCourses.length}개 강좌
          </span>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} style={{ marginBottom: 16 }}>
          <TabsList>
            <TabsTrigger value="active">
              현재 강좌 <span style={{ marginLeft: 6, fontSize: '0.86rem', opacity: 0.7 }}>{activeCourses.length}</span>
            </TabsTrigger>
            <TabsTrigger value="ended">
              종료된 강좌 <span style={{ marginLeft: 6, fontSize: '0.86rem', opacity: 0.7 }}>{endedCourses.length}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Select value={searchField} onValueChange={setSearchField}>
          <SelectTrigger style={{ width: 110 }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="name">강좌명</SelectItem>
            <SelectItem value="classroom">강의실</SelectItem>
            <SelectItem value="instructor">강사명</SelectItem>
            <SelectItem value="instructorPhone">전화번호</SelectItem>
          </SelectContent>
        </Select>
        <div style={{ position: 'relative', maxWidth: 300, flex: 1 }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'hsl(var(--muted-foreground))', pointerEvents: 'none' }} />
          <Input
            placeholder={
              searchField === 'name' ? '강좌명 검색' :
              searchField === 'classroom' ? '강의실 검색' :
              searchField === 'instructor' ? '강사명 검색' :
              searchField === 'instructorPhone' ? '전화번호 검색' :
              '강좌명, 강의실, 강사명, 전화번호 검색'
            }
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        {actions && <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', gap: 8 }}>{actions}</div>}
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
                      onDoubleClick={() => header.column.resetSize()}
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
              <TableRow
                key={row.original.id}
                className={cn(
                  "cursor-pointer",
                  isCourseEnded(row.original) && "opacity-60"
                )}
                onClick={() => handleView(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <p>{emptyMessage}</p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </div>
    </>
  );
};

export default CourseList;
