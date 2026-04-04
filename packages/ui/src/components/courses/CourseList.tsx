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
import { Search, ArrowUpDown } from 'lucide-react';
import type { Course } from '@tutomate/core';
import { useCourseStore } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
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
}

const CourseList: React.FC<CourseListProps> = ({ actions }) => {
  const navigate = useNavigate();
  const { courses } = useCourseStore();
  const { getEnrollmentCountByCourseId } = useEnrollmentStore();
  const [searchText, setSearchText] = useState('');
  const [searchField, setSearchField] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('active');
  const [sorting, setSorting] = useState<SortingState>([]);

  const handleView = useCallback((id: string) => {
    navigate(`/courses/${id}`);
  }, [navigate]);

  const getStatus = useCallback((course: Course) => {
    const currentStudents = getEnrollmentCountByCourseId(course.id);
    if (currentStudents >= course.maxStudents) {
      return 'full';
    } else if (currentStudents >= course.maxStudents * 0.8) {
      return 'almost';
    } else {
      return 'open';
    }
  }, [getEnrollmentCountByCourseId]);

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

  const isCourseEnded = useCallback((course: Course): boolean => {
    if (!course.schedule?.endDate) return false;
    return course.schedule.endDate < dayjs().format('YYYY-MM-DD');
  }, []);

  const activeCourses = useMemo(() => filteredCourses.filter(c => !isCourseEnded(c)), [filteredCourses, isCourseEnded]);
  const endedCourses = useMemo(() => filteredCourses.filter(c => isCourseEnded(c)), [filteredCourses, isCourseEnded]);
  const displayedCourses = activeTab === 'active' ? activeCourses : endedCourses;

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
      header: ({ column }) => (
        <button
          className="flex items-center gap-1"
          onClick={() => column.toggleSorting()}
        >
          강좌 이름
          <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      size: 200,
      cell: ({ row }) => {
        const course = row.original;
        const dayLabels = ['일','월','화','수','목','금','토'];
        const schedDays = course.schedule?.daysOfWeek?.length
          ? course.schedule.daysOfWeek.sort((a,b) => a-b).map(d => dayLabels[d]).join('')
          : null;
        const schedTime = course.schedule?.startTime && course.schedule?.endTime
          ? `${course.schedule.startTime}~${course.schedule.endTime}`
          : null;
        return (
          <div>
            <button
              className="text-left text-primary hover:underline cursor-pointer truncate max-w-[200px] block"
              onClick={() => handleView(course.id)}
            >
              {course.name}
              {isCourseEnded(course) && (
                <Badge variant="secondary" className="ml-2">종료</Badge>
              )}
            </button>
            {(schedDays || schedTime) && (
              <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                {schedDays}{schedDays && schedTime && ' '}{schedTime}
              </span>
            )}
          </div>
        );
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
      header: ({ column }) => (
        <button
          className="flex items-center gap-1"
          onClick={() => column.toggleSorting()}
        >
          수강료
          <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      size: 110,
      cell: ({ getValue }) => `₩${(getValue<number>()).toLocaleString()}`,
    },
    {
      id: 'students',
      header: ({ column }) => (
        <button
          className="flex items-center gap-1"
          onClick={() => column.toggleSorting()}
        >
          수강 인원
          <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      size: 90,
      accessorFn: (row) => getEnrollmentCountByCourseId(row.id),
      cell: ({ row }) => {
        const course = row.original;
        const currentStudents = getEnrollmentCountByCourseId(course.id);
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
          return <Badge className="bg-orange-500 hover:bg-orange-500/80 text-white border-transparent">마감 임박</Badge>;
        } else {
          return <Badge className="bg-green-500 hover:bg-green-500/80 text-white border-transparent">모집 중</Badge>;
        }
      },
    },
  ], [handleView, getEnrollmentCountByCourseId, getStatus, isCourseEnded]);

  const table = useReactTable({
    data: displayedCourses,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const emptyMessage = courses.length === 0
    ? "등록된 강좌가 없습니다"
    : activeTab === 'ended'
      ? "종료된 강좌가 없습니다"
      : "검색 결과가 없습니다";

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} style={{ marginBottom: 16 }}>
        <TabsList>
          <TabsTrigger value="active">
            현재 강좌 <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.7 }}>{activeCourses.length}</span>
          </TabsTrigger>
          <TabsTrigger value="ended">
            종료된 강좌 <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.7 }}>{endedCourses.length}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

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
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#a1a1aa', pointerEvents: 'none' }} />
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
        {actions && <div style={{ flex: 1, textAlign: 'right' }}>{actions}</div>}
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  style={{ width: header.getSize() }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
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
                  <TableCell key={cell.id}>
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
    </>
  );
};

export default CourseList;
