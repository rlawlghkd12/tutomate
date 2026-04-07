import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useCourseStore, useEnrollmentStore, DAY_LABELS } from '@tutomate/core';
import type { Course } from '@tutomate/core';
import { PageEnter } from '@tutomate/ui';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';

const CalendarPage: React.FC = () => {
  const { courses, loadCourses } = useCourseStore();
  const { enrollments, loadEnrollments } = useEnrollmentStore();
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs());
  const [selectedCourses, setSelectedCourses] = useState<Course[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);

  useEffect(() => {
    loadCourses();
    loadEnrollments();
  }, [loadCourses, loadEnrollments]);

  const getCoursesForDate = useCallback((date: Dayjs): Course[] => {
    return courses.filter((course) => {
      if (!course.schedule) return false;

      const { startDate, endDate, daysOfWeek, holidays } = course.schedule;
      const dateStr = date.format('YYYY-MM-DD');

      if (dateStr < startDate) return false;
      if (endDate && dateStr > endDate) return false;
      if (holidays && holidays.includes(dateStr)) return false;

      const dayOfWeek = date.day();
      return daysOfWeek.includes(dayOfWeek);
    });
  }, [courses]);

  const handleCourseClick = (date: Dayjs) => {
    const coursesOnDate = getCoursesForDate(date);
    if (coursesOnDate.length > 0) {
      setSelectedDate(date);
      setSelectedCourses(coursesOnDate);
      setIsModalVisible(true);
    }
  };

  const handleDateSelect = (date: Dayjs) => {
    handleCourseClick(date);
  };

  const handlePreviousMonth = () => {
    setCurrentMonth(currentMonth.subtract(1, 'month'));
  };

  const handleNextMonth = () => {
    setCurrentMonth(currentMonth.add(1, 'month'));
  };

  const handleToday = () => {
    setCurrentMonth(dayjs());
  };

  // Build calendar grid
  const startOfMonth = currentMonth.startOf('month');
  const endOfMonth = currentMonth.endOf('month');
  const startDay = startOfMonth.day(); // 0=Sun
  const daysInMonth = endOfMonth.date();

  const calendarDays: (Dayjs | null)[] = [];
  // Fill leading blanks
  for (let i = 0; i < startDay; i++) {
    calendarDays.push(null);
  }
  // Fill days
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(currentMonth.date(d));
  }

  return (
    <PageEnter>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold m-0">강좌 캘린더</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToday}>오늘</Button>
          <Button variant="outline" size="sm" onClick={handlePreviousMonth}>
            <ChevronLeft className="h-4 w-4" />
            이전
          </Button>
          <span className="text-base font-medium min-w-[120px] text-center">
            {currentMonth.format('YYYY년 MM월')}
          </span>
          <Button variant="outline" size="sm" onClick={handleNextMonth}>
            다음
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
              <span className="text-sm">수업 있음</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
              <span className="text-sm">정원 마감</span>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 border-b border-border">
            {DAY_LABELS.map((day, i) => (
              <div key={day} className={`p-2 text-center text-sm font-medium border-b border-border ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground'}`}>
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((date, idx) => {
              if (!date) {
                return <div key={`blank-${idx}`} className="min-h-[100px] border-b border-r border-border" />;
              }

              const coursesOnDate = getCoursesForDate(date);
              const isToday = date.isSame(dayjs(), 'day');

              return (
                <div
                  key={date.format('YYYY-MM-DD')}
                  className={`min-h-[100px] border-b border-r border-border p-1 cursor-pointer hover:bg-muted/50 ${isToday ? 'bg-primary/5' : ''}`}
                  onClick={() => handleDateSelect(date)}
                >
                  <div className={`text-xs mb-1 ${isToday ? 'font-bold text-primary' : date.day() === 0 ? 'text-red-500' : date.day() === 6 ? 'text-blue-500' : 'text-foreground'}`}>
                    {date.date()}
                  </div>
                  {coursesOnDate.map((course) => {
                    const enrollmentCount = enrollments.filter((e) => e.courseId === course.id).length;
                    const isFull = enrollmentCount >= course.maxStudents;

                    return (
                      <div
                        key={course.id}
                        style={{
                          padding: '4px 6px',
                          marginBottom: 2,
                          fontSize: '0.93rem',
                          borderRadius: 4,
                          cursor: 'pointer',
                          borderLeft: `3px solid ${isFull ? 'hsl(var(--destructive))' : 'hsl(var(--info))'}`,
                          background: isFull ? 'hsl(var(--destructive) / 0.08)' : 'hsl(var(--info) / 0.08)',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCourseClick(date);
                        }}
                      >
                        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'hsl(var(--foreground))' }}>
                          {course.schedule?.startTime} {course.name}
                        </div>
                        <div style={{ fontSize: '0.86rem', color: 'hsl(var(--muted-foreground))' }}>
                          {course.classroom} ({enrollmentCount}/{course.maxStudents})
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalVisible} onOpenChange={setIsModalVisible}>
        <DialogContent className="max-w-[700px]">
          <DialogHeader>
            <DialogTitle>{selectedDate.format('YYYY년 MM월 DD일 (ddd)')} 강좌 목록</DialogTitle>
            <DialogDescription className="sr-only">선택한 날짜의 강좌 목록입니다</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {selectedCourses.map((course) => {
              const enrollmentCount = enrollments.filter((e) => e.courseId === course.id).length;
              const isFull = enrollmentCount >= course.maxStudents;

              return (
                <Card key={course.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h5 className="font-semibold m-0 mb-1">{course.name}</h5>
                        {isFull && <Badge variant="error">정원 마감</Badge>}
                      </div>
                      <Badge variant="info">
                        {enrollmentCount}/{course.maxStudents}명
                      </Badge>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <dt className="text-muted-foreground">강의실</dt>
                        <dd>{course.classroom}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">강사</dt>
                        <dd>{course.instructorName}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">수업 시간</dt>
                        <dd>{course.schedule?.startTime} ~ {course.schedule?.endTime}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">수강료</dt>
                        <dd>{'\u20A9'}{course.fee.toLocaleString()}</dd>
                      </div>
                    </dl>

                    {course.schedule && (
                      <div className="mt-2 p-2 bg-muted rounded text-xs text-muted-foreground">
                        <div>
                          <strong>시작일:</strong> {course.schedule.startDate}
                          {course.schedule.totalSessions && ` (총 ${course.schedule.totalSessions}회)`}
                        </div>
                        <div className="mt-1">
                          <strong>수업 요일:</strong>{' '}
                          {[...(Array.isArray(course.schedule.daysOfWeek) ? course.schedule.daysOfWeek : [])]
                            .sort()
                            .map((day) => DAY_LABELS[day])
                            .join(', ')}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </PageEnter>
  );
};

export default CalendarPage;
