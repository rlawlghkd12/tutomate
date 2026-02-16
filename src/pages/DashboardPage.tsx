import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Progress, Empty, Button, Spin, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const { useToken } = theme;
import { useNavigate } from 'react-router-dom';
import { useCourseStore } from '../stores/courseStore';
import { useStudentStore } from '../stores/studentStore';
import { useEnrollmentStore } from '../stores/enrollmentStore';
import { useAttendanceStore } from '../stores/attendanceStore';
import { generateAllNotifications } from '../utils/notificationGenerator';
import { CourseRevenueChart } from '../components/charts/CourseRevenueChart';
import { PaymentStatusChart } from '../components/charts/PaymentStatusChart';

const DashboardPage: React.FC = () => {
  const { token } = useToken();
  const navigate = useNavigate();
  const { courses, loadCourses } = useCourseStore();
  const { students, loadStudents } = useStudentStore();
  const { enrollments, loadEnrollments } = useEnrollmentStore();
  const { loadAttendances } = useAttendanceStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([loadCourses(), loadStudents(), loadEnrollments(), loadAttendances()]);
      setLoading(false);
    };
    loadData().then(() => {
      const { enrollments, students, courses, attendances } = {
        enrollments: useEnrollmentStore.getState().enrollments,
        students: useStudentStore.getState().students,
        courses: useCourseStore.getState().courses,
        attendances: useAttendanceStore.getState().attendances,
      };
      if (enrollments.length > 0 && students.length > 0 && courses.length > 0) {
        generateAllNotifications(enrollments, students, courses, attendances);
      }
    });
  }, [loadCourses, loadStudents, loadEnrollments, loadAttendances]);

  const totalCourses = courses.length;
  const totalStudents = students.length;

  const completedPayments = enrollments.filter((e) => e.paymentStatus === 'completed').length;
  const pendingPayments = enrollments.filter((e) => e.paymentStatus === 'pending').length;

  const totalRevenue = enrollments.reduce((sum, enrollment) => {
    return sum + enrollment.paidAmount;
  }, 0);

  const expectedRevenue = enrollments
    .filter((e) => e.paymentStatus !== 'exempt')
    .reduce((sum, enrollment) => {
      const course = courses.find((c) => c.id === enrollment.courseId);
      return sum + (course?.fee || 0);
    }, 0);

  const paymentRate = expectedRevenue > 0 ? (totalRevenue / expectedRevenue) * 100 : 0;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      {/* 상단 통계 - 한 줄 */}
      <Row gutter={[12, 12]}>
        <Col xs={8} sm={4}>
          <Card size="small" hoverable onClick={() => navigate('/courses')} bodyStyle={{ padding: '12px' }}>
            <Statistic title="강좌" value={totalCourses} valueStyle={{ color: '#1890ff', fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={8} sm={4}>
          <Card size="small" hoverable onClick={() => navigate('/students')} bodyStyle={{ padding: '12px' }}>
            <Statistic title="수강생" value={totalStudents} valueStyle={{ color: '#52c41a', fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={8} sm={4}>
          <Card size="small" hoverable onClick={() => navigate('/revenue')} bodyStyle={{ padding: '12px' }}>
            <Statistic title="납부" value={totalRevenue.toLocaleString()} suffix="원" valueStyle={{ color: '#722ed1', fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={8} sm={4}>
          <Card size="small" bodyStyle={{ padding: '12px' }}>
            <Statistic title="납부율" value={paymentRate.toFixed(0)} suffix="%" valueStyle={{ color: paymentRate >= 80 ? '#52c41a' : '#faad14', fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={8} sm={4}>
          <Card size="small" bodyStyle={{ padding: '12px' }}>
            <Statistic title="완납" value={completedPayments} suffix="건" valueStyle={{ color: '#52c41a', fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={8} sm={4}>
          <Card size="small" bodyStyle={{ padding: '12px' }}>
            <Statistic title="미납" value={pendingPayments} suffix="건" valueStyle={{ color: '#ff4d4f', fontSize: 20 }} />
          </Card>
        </Col>
      </Row>

      {/* 전체 강좌 */}
      <Card title={`전체 강좌 (${totalCourses})`} size="small" style={{ marginTop: 16 }}>
        {courses.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="등록된 강좌가 없습니다"
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/courses')}>
              강좌 등록하기
            </Button>
          </Empty>
        ) : (
          <Row gutter={[8, 8]}>
            {courses.map((course) => {
              const currentStudents = enrollments.filter(e => e.courseId === course.id).length;
              const percentage = (currentStudents / course.maxStudents) * 100;
              return (
                <Col key={course.id} xs={12} sm={8} md={6} lg={4}>
                  <Card
                    size="small"
                    hoverable
                    onClick={() => navigate(`/courses/${course.id}`)}
                    style={{ cursor: 'pointer' }}
                    bodyStyle={{ padding: 12 }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{course.name}</div>
                    <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 8 }}>
                      {course.instructorName} · {course.classroom}
                    </div>
                    <Progress
                      percent={percentage}
                      size="small"
                      status={percentage >= 100 ? 'exception' : 'normal'}
                      format={() => `${currentStudents}/${course.maxStudents}`}
                    />
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Card>

      {/* 차트 */}
      <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
        <Col xs={24} md={16}>
          <Card title="강좌별 수익" size="small">
            <CourseRevenueChart enrollments={enrollments} courses={courses} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="납부 상태" size="small">
            <PaymentStatusChart enrollments={enrollments} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
