import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronRight as ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle,
  Badge, Card, CardContent, PageEnter,
} from '@tutomate/ui';
import {
  useCourseStore, DAY_LABELS, formatTime12,
  isActiveEnrollment, getCurrentQuarter, appConfig,
} from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import type { Course } from '@tutomate/core';

const CalendarPage: React.FC = () => {
  const { courses, loadCourses } = useCourseStore();
  const { enrollments, loadEnrollments } = useEnrollmentStore();
  const navigate = useNavigate();
  const currentQuarter = getCurrentQuarter();

  // 현재 활성 + (Q 모드면) 현재 분기 enrollment만 카운트
  const countEnrollments = (courseId: string): number =>
    enrollments.filter((e) =>
      e.courseId === courseId
      && isActiveEnrollment(e)
      && (!appConfig.enableQuarterSystem || e.quarter === currentQuarter)
    ).length;
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs());
  const [selectedCourses, setSelectedCourses] = useState<Course[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);

  useEffect(() => {
    loadCourses();
    loadEnrollments();
  }, [loadCourses, loadEnrollments]);

  const getCoursesForDate = useCallback((date: Dayjs): Course[] => {
    return courses
      .filter((course) => {
        if (!course.schedule) return false;

        const { startDate, endDate, daysOfWeek, holidays } = course.schedule;
        const dateStr = date.format('YYYY-MM-DD');

        if (dateStr < startDate) return false;
        if (endDate && dateStr > endDate) return false;
        if (holidays && holidays.includes(dateStr)) return false;

        const dayOfWeek = date.day();
        return daysOfWeek.includes(dayOfWeek);
      })
      .sort((a, b) => {
        const at = a.schedule?.startTime || '';
        const bt = b.schedule?.startTime || '';
        return at.localeCompare(bt);
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
  for (let i = 0; i < startDay; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(currentMonth.date(i));
  }
  // Fill remaining cells to complete the grid
  while (calendarDays.length % 7 !== 0) {
    calendarDays.push(null);
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
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-1.5">
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'hsl(var(--info))' }} />
              <span className="text-sm">수업 있음</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-destructive" />
              <span className="text-sm">정원 마감</span>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 border-t border-l">
            {/* Header */}
            {DAY_LABELS.map((day) => (
              <div key={day} className="border-b border-r p-2 text-center text-sm font-medium text-muted-foreground bg-muted/30">
                {day}
              </div>
            ))}
            {/* Days */}
            {calendarDays.map((date, idx) => {
              const coursesOnDate = date ? getCoursesForDate(date) : [];
              const isToday = date?.isSame(dayjs(), 'day');
              return (
                <div
                  key={idx}
                  className={`border-b border-r min-h-[100px] p-1 cursor-pointer hover:bg-accent/50 transition-colors ${
                    !date ? 'bg-muted/10' : ''
                  } ${isToday ? 'bg-primary/5' : ''}`}
                  onClick={() => date && handleCourseClick(date)}
                >
                  {date && (
                    <>
                      <div className={`text-sm mb-1 ${isToday ? 'font-bold text-primary' : 'text-muted-foreground'}`}>
                        {date.date()}
                      </div>
                      {coursesOnDate.slice(0, 3).map((course) => {
                        const enrollmentCount = countEnrollments(course.id);
                        const isFull = enrollmentCount >= course.maxStudents;
                        return (
                          <div
                            key={course.id}
                            style={{
                              padding: '2px 4px',
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
                            <div className="font-medium truncate">
                              {course.schedule?.startTime ? formatTime12(course.schedule.startTime) : ''} {course.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {course.classroom} ({enrollmentCount}/{course.maxStudents})
                            </div>
                          </div>
                        );
                      })}
                      {coursesOnDate.length > 3 && (
                        <button
                          type="button"
                          className="w-full text-sm font-medium text-primary px-2 py-1.5 rounded hover:bg-primary/10 transition-colors text-left"
                          onClick={(e) => { e.stopPropagation(); handleCourseClick(date); }}
                        >
                          + {coursesOnDate.length - 3}개 더 보기
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalVisible} onOpenChange={setIsModalVisible}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="text-base">
              {selectedDate.format('YYYY년 MM월 DD일 (ddd)')}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {selectedCourses.length}개 수업
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="divide-y border-y -mx-6 px-6 max-h-[60vh] overflow-y-auto">
            {selectedCourses.map((course) => {
              const enrollmentCount = countEnrollments(course.id);
              const isFull = enrollmentCount >= course.maxStudents;
              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => {
                    setIsModalVisible(false);
                    navigate(`/courses/${course.id}`);
                  }}
                  className="w-[calc(100%+3rem)] -mx-6 px-6 flex items-center gap-4 py-3 hover:bg-accent text-left transition-colors"
                >
                  {/* 시간 */}
                  <div className="flex flex-col items-center min-w-[80px] tabular-nums">
                    <div className="text-base font-semibold leading-tight">
                      {course.schedule?.startTime ? formatTime12(course.schedule.startTime) : ''}
                    </div>
                    <div className="text-xs text-muted-foreground leading-tight">
                      ~ {course.schedule?.endTime ? formatTime12(course.schedule.endTime) : ''}
                    </div>
                  </div>
                  {/* 본문 */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{course.name}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {course.classroom} · {course.instructorName}
                    </div>
                  </div>
                  {/* 인원 + 화살표 */}
                  <div className="flex items-center gap-2">
                    <Badge variant={isFull ? 'destructive' : 'info'}>
                      {enrollmentCount}/{course.maxStudents}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </PageEnter>
  );
};

export default CalendarPage;
