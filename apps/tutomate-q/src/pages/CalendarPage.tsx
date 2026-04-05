import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle,
  Badge, Card, CardContent,
} from '@tutomate/ui';
import { useCourseStore } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import type { Course } from '@tutomate/core';

const WEEK_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

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
    <div>
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
              <div className="w-3 h-3 rounded-full bg-primary" />
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
            {WEEK_DAYS.map((day) => (
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
                      {coursesOnDate.map((course) => {
                        const enrollmentCount = enrollments.filter((e) => e.courseId === course.id).length;
                        const isFull = enrollmentCount >= course.maxStudents;
                        return (
                          <div
                            key={course.id}
                            className={`px-1 py-0.5 mb-0.5 text-[13px] rounded-sm border-l-[3px] ${
                              isFull
                                ? 'bg-red-50 border-l-destructive dark:bg-red-950'
                                : 'bg-blue-50 border-l-blue-500 dark:bg-blue-950'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCourseClick(date);
                            }}
                          >
                            <div className="font-medium truncate">
                              {course.schedule?.startTime} {course.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {course.classroom} ({enrollmentCount}/{course.maxStudents})
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
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
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {selectedCourses.map((course) => {
              const enrollmentCount = enrollments.filter((e) => e.courseId === course.id).length;
              const isFull = enrollmentCount >= course.maxStudents;

              return (
                <Card key={course.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h5 className="font-semibold mb-1">{course.name}</h5>
                        {isFull && (
                          <Badge variant="destructive">정원 마감</Badge>
                        )}
                      </div>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
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
                      <div className="mt-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground space-y-1">
                        <div>
                          <strong>시작일:</strong> {course.schedule.startDate}
                          {course.schedule.totalSessions && ` (총 ${course.schedule.totalSessions}회)`}
                        </div>
                        <div>
                          <strong>수업 요일:</strong>{' '}
                          {[...(Array.isArray(course.schedule.daysOfWeek) ? course.schedule.daysOfWeek : [])]
                            .sort()
                            .map((day) => ['일', '월', '화', '수', '목', '금', '토'][day])
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
    </div>
  );
};

export default CalendarPage;
