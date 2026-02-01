import React, { useEffect } from 'react';
import { Card, Row, Col, Statistic, Typography } from 'antd';
import {
  BookOutlined,
  UserOutlined,
  CheckCircleOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { useCourseStore } from '../stores/courseStore';
import { useStudentStore } from '../stores/studentStore';
import { useEnrollmentStore } from '../stores/enrollmentStore';
import { useAttendanceStore } from '../stores/attendanceStore';
import { generateAllNotifications } from '../utils/notificationGenerator';
import { MonthlyRevenueChart } from '../components/charts/MonthlyRevenueChart';
import { CourseRevenueChart } from '../components/charts/CourseRevenueChart';
import { PaymentStatusChart } from '../components/charts/PaymentStatusChart';

const { Title } = Typography;

const DashboardPage: React.FC = () => {
  const { courses, loadCourses } = useCourseStore();
  const { students, loadStudents } = useStudentStore();
  const { enrollments, loadEnrollments } = useEnrollmentStore();
  const { attendances, loadAttendances } = useAttendanceStore();

  useEffect(() => {
    loadCourses();
    loadStudents();
    loadEnrollments();
    loadAttendances();
  }, [loadCourses, loadStudents, loadEnrollments, loadAttendances]);

  // 알림 생성 (하루에 한 번)
  useEffect(() => {
    if (enrollments.length > 0 && students.length > 0 && courses.length > 0) {
      generateAllNotifications(enrollments, students, courses, attendances);
    }
  }, [enrollments, students, courses, attendances]);

  const totalCourses = courses.length;
  const totalStudents = students.length;
  const totalEnrollments = enrollments.length;

  const completedPayments = enrollments.filter((e) => e.paymentStatus === 'completed').length;
  const pendingPayments = enrollments.filter((e) => e.paymentStatus === 'pending').length;

  const totalRevenue = enrollments.reduce((sum, enrollment) => {
    return sum + enrollment.paidAmount;
  }, 0);

  const expectedRevenue = enrollments.reduce((sum, enrollment) => {
    const course = courses.find((c) => c.id === enrollment.courseId);
    return sum + (course?.fee || 0);
  }, 0);

  const paymentRate = expectedRevenue > 0 ? (totalRevenue / expectedRevenue) * 100 : 0;

  return (
    <div>
      <Title level={2}>대시보드</Title>
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="전체 강좌"
              value={totalCourses}
              prefix={<BookOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="전체 수강생"
              value={totalStudents}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="전체 수강 신청"
              value={totalEnrollments}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="총 납부 금액"
              value={totalRevenue}
              prefix={<DollarOutlined />}
              suffix="원"
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic title="완납" value={completedPayments} suffix="건" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic title="미납" value={pendingPayments} suffix="건" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="납부율"
              value={paymentRate.toFixed(1)}
              suffix="%"
              precision={1}
            />
          </Card>
        </Col>
      </Row>

      {/* 차트 섹션 */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="월별 수익 추이">
            <MonthlyRevenueChart enrollments={enrollments} courses={courses} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="강좌별 수익 비교">
            <CourseRevenueChart enrollments={enrollments} courses={courses} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="납부 상태 분포">
            <PaymentStatusChart enrollments={enrollments} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="최근 강좌">
            {courses.slice(0, 5).map((course) => (
              <div
                key={course.id}
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>
                    <strong>{course.name}</strong> - {course.classroom}
                  </span>
                  <span>
                    {course.currentStudents}/{course.maxStudents}명
                  </span>
                </div>
              </div>
            ))}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
