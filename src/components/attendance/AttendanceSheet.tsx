import React, { useState } from 'react';
import { Table, DatePicker, Radio, Space, Tag, message, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEnrollmentStore } from '../../stores/enrollmentStore';
import { useStudentStore } from '../../stores/studentStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import dayjs from 'dayjs';

interface AttendanceSheetProps {
  courseId: string;
}

const AttendanceSheet: React.FC<AttendanceSheetProps> = ({ courseId }) => {
  const [selectedDate, setSelectedDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const { enrollments } = useEnrollmentStore();
  const { getStudentById } = useStudentStore();
  const { attendances, markAttendance, getAttendanceByDate } = useAttendanceStore();

  const courseEnrollments = enrollments.filter((e) => e.courseId === courseId);

  const enrolledStudents = courseEnrollments.map((enrollment) => {
    const student = getStudentById(enrollment.studentId);
    const attendance = getAttendanceByDate(courseId, enrollment.studentId, selectedDate);

    return {
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      name: student?.name || '-',
      phone: student?.phone || '-',
      status: attendance?.status || null,
    };
  });

  const handleStatusChange = (studentId: string, status: 'present' | 'absent' | 'late') => {
    markAttendance(courseId, studentId, selectedDate, status);
    message.success('출석이 기록되었습니다.');
  };

  const handleBulkAttendance = (status: 'present' | 'absent') => {
    courseEnrollments.forEach((enrollment) => {
      markAttendance(courseId, enrollment.studentId, selectedDate, status);
    });
    message.success(`전체 ${status === 'present' ? '출석' : '결석'} 처리되었습니다.`);
  };

  const getAttendanceStats = () => {
    const dateAttendances = attendances.filter(
      (a) => a.courseId === courseId && a.date === selectedDate
    );

    return {
      total: courseEnrollments.length,
      present: dateAttendances.filter((a) => a.status === 'present').length,
      absent: dateAttendances.filter((a) => a.status === 'absent').length,
      late: dateAttendances.filter((a) => a.status === 'late').length,
    };
  };

  const stats = getAttendanceStats();

  const columns: ColumnsType<typeof enrolledStudents[0]> = [
    {
      title: '이름',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '전화번호',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: '출석 상태',
      key: 'status',
      render: (_, record) => {
        const statusMap = {
          present: { color: 'green', text: '출석' },
          absent: { color: 'red', text: '결석' },
          late: { color: 'orange', text: '지각' },
        };

        if (record.status) {
          const status = statusMap[record.status];
          return <Tag color={status.color}>{status.text}</Tag>;
        }

        return <Tag>미체크</Tag>;
      },
    },
    {
      title: '체크',
      key: 'action',
      render: (_, record) => (
        <Radio.Group
          value={record.status}
          onChange={(e) => handleStatusChange(record.studentId, e.target.value)}
        >
          <Radio.Button value="present">출석</Radio.Button>
          <Radio.Button value="late">지각</Radio.Button>
          <Radio.Button value="absent">결석</Radio.Button>
        </Radio.Group>
      ),
    },
  ];

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Space>
            <span>날짜 선택:</span>
            <DatePicker
              value={dayjs(selectedDate)}
              onChange={(date) => {
                if (date) {
                  setSelectedDate(date.format('YYYY-MM-DD'));
                }
              }}
              format="YYYY-MM-DD"
            />
          </Space>
          <Space>
            <Button
              size="small"
              onClick={() => setSelectedDate(dayjs().format('YYYY-MM-DD'))}
            >
              오늘
            </Button>
            <Button
              size="small"
              onClick={() => setSelectedDate(dayjs().subtract(1, 'day').format('YYYY-MM-DD'))}
            >
              어제
            </Button>
            <Button
              size="small"
              onClick={() => setSelectedDate(dayjs().add(1, 'day').format('YYYY-MM-DD'))}
            >
              내일
            </Button>
            <Button
              size="small"
              onClick={() => setSelectedDate(dayjs(selectedDate).subtract(7, 'day').format('YYYY-MM-DD'))}
            >
              -7일
            </Button>
            <Button
              size="small"
              onClick={() => setSelectedDate(dayjs(selectedDate).add(7, 'day').format('YYYY-MM-DD'))}
            >
              +7일
            </Button>
          </Space>
        </Space>

        <Space size="large" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Tag color="blue">전체: {stats.total}명</Tag>
            <Tag color="green">출석: {stats.present}명</Tag>
            <Tag color="orange">지각: {stats.late}명</Tag>
            <Tag color="red">결석: {stats.absent}명</Tag>
            <Tag>출석률: {stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(1) : 0}%</Tag>
          </Space>
          <Space style={{ marginLeft: 32 }}>
            <Button
              size="small"
              type="primary"
              onClick={() => handleBulkAttendance('present')}
            >
              전체 출석
            </Button>
            <Button
              size="small"
              danger
              onClick={() => handleBulkAttendance('absent')}
            >
              전체 결석
            </Button>
          </Space>
        </Space>

        <Table
          columns={columns}
          dataSource={enrolledStudents}
          rowKey="studentId"
          pagination={false}
        />
      </Space>
    </div>
  );
};

export default AttendanceSheet;
