import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, Badge, Card, Typography, Modal, Descriptions, Tag, List, theme, Button, Space } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useCourseStore } from '../stores/courseStore';
import { useEnrollmentStore } from '../stores/enrollmentStore';
import type { Course } from '../types';

const { Title } = Typography;
const { useToken } = theme;

const CalendarPage: React.FC = () => {
  const { token } = useToken();
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

  // 특정 날짜에 해당하는 강좌들을 찾는 함수
  const getCoursesForDate = useCallback((date: Dayjs): Course[] => {
    return courses.filter((course) => {
      if (!course.schedule) return false;

      const { startDate, endDate, daysOfWeek, holidays } = course.schedule;
      const dateStr = date.format('YYYY-MM-DD');

      // 날짜 범위 확인 (시작일 이전이면 제외)
      if (dateStr < startDate) return false;

      // 종료일이 있는 경우에만 종료일 체크
      if (endDate && dateStr > endDate) return false;

      // 휴강일 확인
      if (holidays && holidays.includes(dateStr)) return false;

      // 요일 확인
      const dayOfWeek = date.day();
      return daysOfWeek.includes(dayOfWeek);
    });
  }, [courses]);

  // 달력 셀 렌더링
  const dateCellRender = (value: Dayjs) => {
    const coursesOnDate = getCoursesForDate(value);

    return (
      <div style={{ minHeight: '80px' }}>
        {coursesOnDate.map((course) => {
          const enrollmentCount = enrollments.filter((e) => e.courseId === course.id).length;
          const isFull = enrollmentCount >= course.maxStudents;

          return (
            <div
              key={course.id}
              style={{
                padding: '2px 4px',
                marginBottom: '2px',
                backgroundColor: isFull ? token.colorErrorBg : token.colorInfoBg,
                borderLeft: `3px solid ${isFull ? token.colorError : token.colorInfo}`,
                fontSize: '12px',
                cursor: 'pointer',
                borderRadius: '2px',
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleCourseClick(value);
              }}
            >
              <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {course.schedule?.startTime} {course.name}
              </div>
              <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>
                {course.classroom} ({enrollmentCount}/{course.maxStudents})
              </div>
            </div>
          );
        })}
      </div>
    );
  };

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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={2} style={{ margin: 0 }}>강좌 캘린더</Title>
        <Space>
          <Button onClick={handleToday}>오늘</Button>
          <Button icon={<LeftOutlined />} onClick={handlePreviousMonth} />
          <span style={{ fontSize: '16px', fontWeight: 500, minWidth: '120px', textAlign: 'center' }}>
            {currentMonth.format('YYYY년 MM월')}
          </span>
          <Button icon={<RightOutlined />} onClick={handleNextMonth} />
        </Space>
      </div>

      <Card>
        <div style={{ marginBottom: 16 }}>
          <Badge color="#1890ff" text="수업 있음" style={{ marginRight: 16 }} />
          <Badge color="#ff4d4f" text="정원 마감" />
        </div>

        <Calendar
          value={currentMonth}
          dateCellRender={dateCellRender}
          onSelect={handleDateSelect}
          onChange={(date) => setCurrentMonth(date)}
        />
      </Card>

      <Modal
        title={`${selectedDate.format('YYYY년 MM월 DD일 (ddd)')} 강좌 목록`}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={700}
      >
        <List
          dataSource={selectedCourses}
          renderItem={(course) => {
            const enrollmentCount = enrollments.filter((e) => e.courseId === course.id).length;
            const isFull = enrollmentCount >= course.maxStudents;

            return (
              <Card
                size="small"
                style={{ marginBottom: 12 }}
                styles={{ body: { padding: 16 } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                  <div>
                    <Title level={5} style={{ margin: 0, marginBottom: 4 }}>
                      {course.name}
                    </Title>
                    {isFull && <Tag color="red">정원 마감</Tag>}
                  </div>
                  <Tag color="blue">
                    {enrollmentCount}/{course.maxStudents}명
                  </Tag>
                </div>

                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="강의실">{course.classroom}</Descriptions.Item>
                  <Descriptions.Item label="강사">{course.instructorName}</Descriptions.Item>
                  <Descriptions.Item label="수업 시간">
                    {course.schedule?.startTime} ~ {course.schedule?.endTime}
                  </Descriptions.Item>
                  <Descriptions.Item label="수강료">
                    ₩{course.fee.toLocaleString()}
                  </Descriptions.Item>
                </Descriptions>

                {course.schedule && (
                  <div style={{ marginTop: 8, padding: 8, backgroundColor: token.colorBgLayout, borderRadius: 4 }}>
                    <div style={{ fontSize: '12px', color: token.colorTextSecondary }}>
                      <strong>시작일:</strong> {course.schedule.startDate}
                      {course.schedule.totalSessions && ` (총 ${course.schedule.totalSessions}회)`}
                    </div>
                    <div style={{ fontSize: '12px', color: token.colorTextSecondary, marginTop: 4 }}>
                      <strong>수업 요일:</strong>{' '}
                      {course.schedule.daysOfWeek
                        .sort()
                        .map((day) => ['일', '월', '화', '수', '목', '금', '토'][day])
                        .join(', ')}
                    </div>
                  </div>
                )}
              </Card>
            );
          }}
        />
      </Modal>
    </div>
  );
};

export default CalendarPage;
