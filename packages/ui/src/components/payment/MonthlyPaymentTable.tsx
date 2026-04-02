import React, { useState, useMemo, useCallback } from 'react';
import {
  Table, Tag, Button, Space, InputNumber, DatePicker, Input, message,
  Row, Col, Select, theme, Empty, Tooltip, Popconfirm,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CalendarOutlined } from '@ant-design/icons';
import type { PaymentMethod, Enrollment } from '@tutomate/core';
import { useMonthlyPaymentStore } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import { useStudentStore } from '@tutomate/core';
import dayjs from 'dayjs';

const { useToken } = theme;

interface MonthlyPaymentTableProps {
  courseId: string;
  courseFee: number;
  enrollments: Enrollment[];
  /** 분기 시스템: 표시할 월 목록 (YYYY-MM 형식). 없으면 ±6개월 표시 */
  quarterMonths?: string[];
  /** 강좌 생성일 (이 날짜 이전 월은 선택 불가) */
  courseCreatedAt?: string;
}

const MonthlyPaymentTable: React.FC<MonthlyPaymentTableProps> = ({
  courseId: _courseId,
  courseFee,
  enrollments,
  quarterMonths,
  courseCreatedAt,
}) => {
  const { token } = useToken();
  const { getStudentById } = useStudentStore();
  const { payments, addPayment, updatePayment } = useMonthlyPaymentStore();
  const { updatePayment: updateEnrollmentPayment } = useEnrollmentStore();

  const [selectedMonth, setSelectedMonth] = useState<string>(
    quarterMonths?.[0] ?? dayjs().format('YYYY-MM'),
  );

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
    const nonExempt = enrollments.filter((e) => e.paymentStatus !== 'exempt');
    const nonExemptIds = new Set(nonExempt.map((e) => e.id));
    const monthPayments = payments.filter((p) => p.month === selectedMonth);
    // 면제 수강생의 납부 기록은 통계에서 제외
    const coursePayments = monthPayments.filter((p) => nonExemptIds.has(p.enrollmentId));
    const paidCount = coursePayments.filter((p) => p.status === 'paid').length;
    const totalPaid = coursePayments.reduce((sum, p) => sum + p.amount, 0);
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

  // 면제 처리
  const handleExempt = useCallback(async (enrollment: Enrollment) => {
    await updateEnrollmentPayment(
      enrollment.id, 0, courseFee, dayjs().format('YYYY-MM-DD'), true,
    );
    message.success('수강료가 면제 처리되었습니다.');
  }, [updateEnrollmentPayment, courseFee]);

  // 면제 취소
  const handleCancelExempt = useCallback(async (enrollment: Enrollment) => {
    await updateEnrollmentPayment(
      enrollment.id, 0, courseFee, undefined,
    );
    message.success('면제가 취소되었습니다.');
  }, [updateEnrollmentPayment, courseFee]);

  // 할인 금액 수정
  const handleDiscountChange = useCallback(async (enrollment: Enrollment, newDiscount: number) => {
    const allPayments = payments.filter((p) => p.enrollmentId === enrollment.id);
    const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);
    await updateEnrollmentPayment(
      enrollment.id,
      totalPaid,
      courseFee,
      enrollment.paidAt,
      false,
      enrollment.paymentMethod,
      newDiscount,
    );
    message.success('할인 금액이 업데이트되었습니다.');
  }, [payments, updateEnrollmentPayment, courseFee]);

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
      width: 80,
      render: (_, record) => record.studentName,
      sorter: (a, b) => a.studentName.localeCompare(b.studentName),
    },
    {
      title: '상태',
      key: 'status',
      width: 64,
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
      width: 120,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <InputNumber
            size="small"
            style={{ width: '100%' }}
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
      width: 100,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <Select
            size="small"
            value={record.monthPayment?.paymentMethod || undefined}
            placeholder="선택"
            style={{ width: '100%' }}
            onChange={(value) => {
              handleRecordPayment(
                record.enrollment,
                record.monthPayment?.amount ?? 0,
                value,
                record.monthPayment?.paidAt,
              );
            }}
            options={[
              { value: 'transfer', label: '계좌이체' },
              { value: 'card', label: '카드' },
              { value: 'cash', label: '현금' },
            ]}
          />
        );
      },
    },
    {
      title: '납부일',
      key: 'paidAt',
      width: 120,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <DatePicker
            size="small"
            style={{ width: '100%' }}
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
      width: 110,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <InputNumber
            size="small"
            style={{ width: '100%' }}
            min={0}
            max={courseFee}
            value={record.enrollment.discountAmount ?? 0}
            formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => value?.replace(/₩\s?|(,*)/g, '') as unknown as number}
            onBlur={(e) => {
              const raw = e.target.value?.replace(/₩\s?|(,*)/g, '') || '0';
              const val = parseInt(raw, 10) || 0;
              if (val !== (record.enrollment.discountAmount ?? 0)) {
                handleDiscountChange(record.enrollment, val);
              }
            }}
            onPressEnter={(e) => {
              const raw = (e.target as HTMLInputElement).value?.replace(/₩\s?|(,*)/g, '') || '0';
              const val = parseInt(raw, 10) || 0;
              handleDiscountChange(record.enrollment, val);
            }}
          />
        );
      },
      sorter: (a, b) => (a.enrollment.discountAmount ?? 0) - (b.enrollment.discountAmount ?? 0),
    },
    {
      title: '메모',
      key: 'notes',
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <Input
            size="small"
            style={{ width: '100%' }}
            value={record.monthPayment?.notes ?? ''}
            placeholder="메모"
            onChange={() => {
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
      width: 120,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') {
          return (
            <Popconfirm
              title="면제 취소"
              description="면제를 취소하시겠습니까?"
              onConfirm={() => handleCancelExempt(record.enrollment)}
              okText="취소하기"
              cancelText="닫기"
            >
              <Button size="small">면제 취소</Button>
            </Popconfirm>
          );
        }
        return (
          <Space size={4}>
            {(!record.monthPayment || record.monthPayment.status === 'pending') && (
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
            )}
            <Popconfirm
              title="수강료 면제"
              description="수강료를 면제 처리하시겠습니까?"
              onConfirm={() => handleExempt(record.enrollment)}
              okText="면제"
              cancelText="취소"
            >
              <Button size="small" danger>면제</Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  // 월 이동
  const months = useMemo(() => {
    if (quarterMonths && quarterMonths.length > 0) {
      return quarterMonths;
    }
    const minMonth = courseCreatedAt ? dayjs(courseCreatedAt).format('YYYY-MM') : null;
    const result: string[] = [];
    for (let i = -6; i <= 6; i++) {
      const m = dayjs().add(i, 'month').format('YYYY-MM');
      if (minMonth && m < minMonth) continue;
      result.push(m);
    }
    return result;
  }, [quarterMonths, courseCreatedAt]);

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
            {!quarterMonths && (
              <Button
                size="small"
                onClick={() => setSelectedMonth(dayjs().format('YYYY-MM'))}
              >
                이번 달
              </Button>
            )}
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
