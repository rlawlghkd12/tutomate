import React, { useState, useMemo, useCallback } from 'react';
import {
  Table, Tag, Button, Space, InputNumber, DatePicker, Radio, Input, message,
  Row, Col, Select, theme, Empty, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CalendarOutlined } from '@ant-design/icons';
import type { MonthlyPayment, PaymentMethod, Enrollment } from '../../types';
import { useMonthlyPaymentStore } from '../../stores/monthlyPaymentStore';
import { useEnrollmentStore } from '../../stores/enrollmentStore';
import { useStudentStore } from '../../stores/studentStore';
import dayjs from 'dayjs';

const { useToken } = theme;

interface MonthlyPaymentTableProps {
  courseId: string;
  courseFee: number;
  enrollments: Enrollment[];
}

const MonthlyPaymentTable: React.FC<MonthlyPaymentTableProps> = ({
  courseId,
  courseFee,
  enrollments,
}) => {
  const { token } = useToken();
  const { getStudentById } = useStudentStore();
  const { payments, addPayment, updatePayment } = useMonthlyPaymentStore();
  const { updatePayment: updateEnrollmentPayment } = useEnrollmentStore();

  const [selectedMonth, setSelectedMonth] = useState<string>(dayjs().format('YYYY-MM'));

  // 해당 강좌의 수강생별 월별 납부 현황
  const monthlyData = useMemo(() => {
    return enrollments.map((enrollment) => {
      const student = getStudentById(enrollment.studentId);
      const enrollmentPayments = payments.filter(
        (p) => p.enrollmentId === enrollment.id && p.month === selectedMonth,
      );
      const monthPayment = enrollmentPayments[0]; // 월당 하나의 레코드

      return {
        key: enrollment.id,
        enrollment,
        student,
        monthPayment,
        studentName: student?.name || '-',
      };
    });
  }, [enrollments, payments, selectedMonth, getStudentById]);

  // 월별 통계
  const monthStats = useMemo(() => {
    const monthPayments = payments.filter((p) => p.month === selectedMonth);
    const coursePayments = monthPayments.filter((p) =>
      enrollments.some((e) => e.id === p.enrollmentId),
    );
    const paidCount = coursePayments.filter((p) => p.status === 'paid').length;
    const totalPaid = coursePayments.reduce((sum, p) => sum + p.amount, 0);
    const nonExempt = enrollments.filter((e) => e.paymentStatus !== 'exempt');
    const expectedTotal = nonExempt.reduce((sum, e) => sum + (courseFee - (e.discountAmount ?? 0)), 0);

    return { paidCount, totalPaid, expectedTotal, totalStudents: enrollments.length };
  }, [payments, selectedMonth, enrollments, courseFee]);

  // 특정 수강생의 월별 납부 기록
  const handleRecordPayment = useCallback(async (
    enrollment: Enrollment,
    amount: number,
    paymentMethod?: PaymentMethod,
    paidAt?: string,
  ) => {
    const existing = payments.find(
      (p) => p.enrollmentId === enrollment.id && p.month === selectedMonth,
    );

    if (existing) {
      await updatePayment(existing.id, {
        amount,
        status: amount > 0 ? 'paid' : 'pending',
        paymentMethod,
        paidAt: paidAt || (amount > 0 ? dayjs().format('YYYY-MM-DD') : undefined),
      });
    } else {
      await addPayment(enrollment.id, selectedMonth, amount, paymentMethod, paidAt);
    }

    // 수강생의 전체 월별 납부 합산 → enrollment paidAmount 업데이트
    const allPayments = payments.filter((p) => p.enrollmentId === enrollment.id);
    const otherMonthsTotal = allPayments
      .filter((p) => p.month !== selectedMonth)
      .reduce((sum, p) => sum + p.amount, 0);
    const newTotalPaid = otherMonthsTotal + amount;

    await updateEnrollmentPayment(
      enrollment.id,
      newTotalPaid,
      courseFee,
      paidAt || dayjs().format('YYYY-MM-DD'),
      false,
      paymentMethod,
      enrollment.discountAmount,
    );

    message.success('납부 기록이 업데이트되었습니다.');
  }, [payments, selectedMonth, addPayment, updatePayment, updateEnrollmentPayment, courseFee]);

  // 전체 완납 처리
  const handleBulkPaid = useCallback(async () => {
    const unpaid = monthlyData.filter(
      (d) => d.enrollment.paymentStatus !== 'exempt' && (!d.monthPayment || d.monthPayment.status === 'pending'),
    );

    for (const item of unpaid) {
      const effectiveFee = courseFee - (item.enrollment.discountAmount ?? 0);
      await handleRecordPayment(item.enrollment, effectiveFee);
    }

    message.success(`${unpaid.length}명의 납부가 처리되었습니다.`);
  }, [monthlyData, handleRecordPayment, courseFee]);

  const columns: ColumnsType<typeof monthlyData[0]> = [
    {
      title: '이름',
      key: 'name',
      width: 120,
      render: (_, record) => record.studentName,
      sorter: (a, b) => a.studentName.localeCompare(b.studentName),
    },
    {
      title: '상태',
      key: 'status',
      width: 80,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') {
          return <Tag color="purple">면제</Tag>;
        }
        if (!record.monthPayment || record.monthPayment.status === 'pending') {
          return <Tag color="red">미납</Tag>;
        }
        return <Tag color="green">납부</Tag>;
      },
      filters: [
        { text: '납부', value: 'paid' },
        { text: '미납', value: 'pending' },
        { text: '면제', value: 'exempt' },
      ],
      onFilter: (value, record) => {
        if (value === 'exempt') return record.enrollment.paymentStatus === 'exempt';
        if (value === 'paid') return record.monthPayment?.status === 'paid';
        return !record.monthPayment || record.monthPayment.status === 'pending';
      },
    },
    {
      title: '납부 금액',
      key: 'amount',
      width: 150,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <InputNumber
            size="small"
            style={{ width: 130 }}
            min={0}
            value={record.monthPayment?.amount ?? 0}
            formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => value?.replace(/₩\s?|(,*)/g, '') as unknown as number}
            onBlur={(e) => {
              const raw = e.target.value?.replace(/₩\s?|(,*)/g, '') || '0';
              const val = parseInt(raw, 10) || 0;
              if (val !== (record.monthPayment?.amount ?? 0)) {
                handleRecordPayment(record.enrollment, val, record.monthPayment?.paymentMethod);
              }
            }}
            onPressEnter={(e) => {
              const raw = (e.target as HTMLInputElement).value?.replace(/₩\s?|(,*)/g, '') || '0';
              const val = parseInt(raw, 10) || 0;
              handleRecordPayment(record.enrollment, val, record.monthPayment?.paymentMethod);
            }}
          />
        );
      },
    },
    {
      title: '납부 방법',
      key: 'paymentMethod',
      width: 180,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <Radio.Group
            size="small"
            value={record.monthPayment?.paymentMethod}
            onChange={(e) => {
              handleRecordPayment(
                record.enrollment,
                record.monthPayment?.amount ?? 0,
                e.target.value,
                record.monthPayment?.paidAt,
              );
            }}
          >
            <Radio.Button value="cash">현금</Radio.Button>
            <Radio.Button value="card">카드</Radio.Button>
            <Radio.Button value="transfer">이체</Radio.Button>
          </Radio.Group>
        );
      },
    },
    {
      title: '납부일',
      key: 'paidAt',
      width: 130,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <DatePicker
            size="small"
            style={{ width: 120 }}
            value={record.monthPayment?.paidAt ? dayjs(record.monthPayment.paidAt) : null}
            onChange={(date) => {
              if (date) {
                handleRecordPayment(
                  record.enrollment,
                  record.monthPayment?.amount ?? courseFee,
                  record.monthPayment?.paymentMethod,
                  date.format('YYYY-MM-DD'),
                );
              }
            }}
            placeholder="납부일"
          />
        );
      },
    },
    {
      title: '할인',
      key: 'discount',
      width: 100,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        const discount = record.enrollment.discountAmount ?? 0;
        if (discount === 0) return '-';
        return (
          <span style={{ color: token.colorSuccess, fontSize: 13 }}>
            -₩{discount.toLocaleString()}
          </span>
        );
      },
      sorter: (a, b) => (a.enrollment.discountAmount ?? 0) - (b.enrollment.discountAmount ?? 0),
    },
    {
      title: '메모',
      key: 'notes',
      width: 150,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <Input
            size="small"
            style={{ width: 140 }}
            value={record.monthPayment?.notes ?? ''}
            placeholder="메모"
            onChange={(e) => {
              // 실시간 업데이트는 하지 않고 blur 시에만
            }}
            onBlur={(e) => {
              const val = e.target.value;
              if (val !== (record.monthPayment?.notes ?? '')) {
                if (record.monthPayment) {
                  updatePayment(record.monthPayment.id, { notes: val || undefined });
                } else if (val) {
                  // 레코드가 없으면 새로 생성하면서 메모 추가
                  addPayment(record.enrollment.id, selectedMonth, 0, undefined, undefined, val);
                }
              }
            }}
            defaultValue={record.monthPayment?.notes ?? ''}
          />
        );
      },
    },
    {
      title: '',
      key: 'quick',
      width: 80,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return null;
        if (record.monthPayment?.status === 'paid') return null;
        return (
          <Tooltip title={`₩${(courseFee - (record.enrollment.discountAmount ?? 0)).toLocaleString()} 완납 처리`}>
            <Button
              size="small"
              type="primary"
              ghost
              onClick={() => handleRecordPayment(record.enrollment, courseFee - (record.enrollment.discountAmount ?? 0))}
            >
              완납
            </Button>
          </Tooltip>
        );
      },
    },
  ];

  // 월 이동
  const months = useMemo(() => {
    const result: string[] = [];
    for (let i = -6; i <= 6; i++) {
      result.push(dayjs().add(i, 'month').format('YYYY-MM'));
    }
    return result;
  }, []);

  return (
    <div>
      {/* 월 선택 + 액션 */}
      <Row gutter={16} align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <CalendarOutlined />
            <Select
              value={selectedMonth}
              onChange={setSelectedMonth}
              style={{ width: 140 }}
            >
              {months.map((m) => (
                <Select.Option key={m} value={m}>
                  {dayjs(m + '-01').format('YYYY년 M월')}
                </Select.Option>
              ))}
            </Select>
            <Button
              size="small"
              onClick={() => setSelectedMonth(dayjs().format('YYYY-MM'))}
            >
              이번 달
            </Button>
          </Space>
        </Col>
        <Col flex="auto" style={{ textAlign: 'right' }}>
          <Button
            type="primary"
            onClick={handleBulkPaid}
          >
            전체 완납
          </Button>
        </Col>
      </Row>

      {/* 월별 통계 */}
      <div style={{
        marginBottom: 16,
        padding: 12,
        backgroundColor: token.colorFillQuaternary,
        borderRadius: token.borderRadius,
        display: 'flex',
        gap: 24,
      }}>
        <div>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>납부 인원</span>
          <div style={{ fontWeight: 600 }}>
            <span style={{ color: token.colorSuccess }}>{monthStats.paidCount}</span>
            <span style={{ color: token.colorTextSecondary }}> / {monthStats.totalStudents}명</span>
          </div>
        </div>
        <div>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>납부 합계</span>
          <div style={{ fontWeight: 600, color: token.colorSuccess }}>₩{monthStats.totalPaid.toLocaleString()}</div>
        </div>
        <div>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>예상 합계</span>
          <div style={{ fontWeight: 600 }}>₩{monthStats.expectedTotal.toLocaleString()}</div>
        </div>
        <div>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>수납률</span>
          <div style={{ fontWeight: 600, color: monthStats.expectedTotal > 0 && monthStats.totalPaid < monthStats.expectedTotal ? token.colorError : token.colorSuccess }}>
            {monthStats.expectedTotal > 0 ? Math.round((monthStats.totalPaid / monthStats.expectedTotal) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <Table
        columns={columns}
        dataSource={monthlyData}
        rowKey="key"
        pagination={false}
        size="small"
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="수강생이 없습니다"
            />
          ),
        }}
      />

    </div>
  );
};

export default MonthlyPaymentTable;
