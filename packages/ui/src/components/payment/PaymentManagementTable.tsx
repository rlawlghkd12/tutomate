import React, { useState, useMemo, useCallback } from 'react';
import {
  Table, Tag, Button, Space, InputNumber, DatePicker, Input, Modal, Form,
  Select, message, Empty, Popconfirm, theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined } from '@ant-design/icons';
import type { Enrollment } from '@tutomate/core';
import { usePaymentRecordStore } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import { useStudentStore } from '@tutomate/core';
import { PAYMENT_METHOD_LABELS } from '@tutomate/core';
import dayjs from 'dayjs';

const { useToken } = theme;

interface PaymentManagementTableProps {
  courseId: string;
  courseFee: number;
  enrollments: Enrollment[];
  onStudentClick?: (studentId: string) => void;
  rowSelection?: {
    selectedRowKeys: React.Key[];
    onChange: (keys: React.Key[]) => void;
  };
}

const PaymentManagementTable: React.FC<PaymentManagementTableProps> = ({
  courseId: _courseId,
  courseFee,
  enrollments,
  onStudentClick,
  rowSelection,
}) => {
  const { token } = useToken();
  const { getStudentById } = useStudentStore();
  const { records, addPayment, deletePayment, updateRecord } = usePaymentRecordStore();
  const { updatePayment: updateEnrollmentPayment } = useEnrollmentStore();

  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
  const [isHistoryModalVisible, setIsHistoryModalVisible] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [modalDiscount, setModalDiscount] = useState(0);
  const [form] = Form.useForm();

  // 수강생별 납부 현황
  const tableData = useMemo(() => {
    return enrollments.map((enrollment) => {
      const student = getStudentById(enrollment.studentId);
      const enrollmentRecords = records
        .filter((r) => r.enrollmentId === enrollment.id)
        .sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''));
      // enrollment 데이터를 source of truth로 사용 (payment_records는 이력 표시용)
      const totalPaid = enrollment.paidAmount;
      const effectiveFee = courseFee - (enrollment.discountAmount ?? 0);
      const remaining = Math.max(0, enrollment.remainingAmount);

      return {
        key: enrollment.id,
        enrollment,
        student,
        studentName: student?.name || '-',
        totalPaid,
        effectiveFee,
        remaining,
        records: enrollmentRecords,
      };
    });
  }, [enrollments, records, getStudentById, courseFee]);

  // 통계
  const stats = useMemo(() => {
    const nonExempt = tableData.filter((d) => d.enrollment.paymentStatus !== 'exempt');
    const paidCount = nonExempt.filter((d) => d.enrollment.paymentStatus === 'completed').length;
    const totalPaid = nonExempt.reduce((sum, d) => sum + d.totalPaid, 0);
    const expectedTotal = nonExempt.reduce((sum, d) => sum + d.effectiveFee, 0);
    return { paidCount, totalPaid, expectedTotal, totalStudents: enrollments.length };
  }, [tableData, enrollments.length]);

  // 할인 금액 수정
  const handleDiscountChange = useCallback(async (enrollment: Enrollment, newDiscount: number) => {
    const enrollmentRecords = records.filter((r) => r.enrollmentId === enrollment.id);
    const totalPaid = enrollmentRecords.reduce((sum, r) => sum + r.amount, 0);
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
  }, [records, updateEnrollmentPayment, courseFee]);

  // 납부 추가
  const handleAddPayment = useCallback(async () => {
    try {
      const values = await form.validateFields();
      if (!selectedEnrollmentId) return;

      // 할인 변경 확인
      const enrollment = enrollments.find((e) => e.id === selectedEnrollmentId);
      const newDiscount = values.discountAmount ?? 0;
      if (enrollment && newDiscount !== (enrollment.discountAmount ?? 0)) {
        await handleDiscountChange(enrollment, newDiscount);
      }

      // 납부 기록 추가 (금액이 있을 때만)
      if (values.amount > 0) {
        await addPayment(
          selectedEnrollmentId,
          values.amount,
          courseFee,
          values.paymentMethod,
          values.paidAt?.format('YYYY-MM-DD'),
          values.notes,
        );
      }

      message.success('납부가 기록되었습니다.');
      form.resetFields();
      setIsPaymentModalVisible(false);
      setSelectedEnrollmentId(null);
    } catch (error) {
      console.error('Payment failed:', error);
    }
  }, [selectedEnrollmentId, form, addPayment, courseFee, enrollments, handleDiscountChange]);

  // 납부 삭제
  const handleDeletePayment = useCallback(async (recordId: string) => {
    await deletePayment(recordId, courseFee);
    message.success('납부 기록이 삭제되었습니다.');
  }, [deletePayment, courseFee]);

  // 면제 처리
  const handleExempt = useCallback(async (enrollment: Enrollment) => {
    await updateEnrollmentPayment(
      enrollment.id, 0, courseFee, dayjs().format('YYYY-MM-DD'), true,
    );
    message.success('수강료가 면제 처리되었습니다.');
  }, [updateEnrollmentPayment, courseFee]);

  // 면제 취소
  const handleCancelExempt = useCallback(async (enrollment: Enrollment) => {
    const enrollmentRecords = records.filter((r) => r.enrollmentId === enrollment.id);
    const totalPaid = enrollmentRecords.reduce((sum, r) => sum + r.amount, 0);
    await updateEnrollmentPayment(
      enrollment.id, totalPaid, courseFee, undefined, false,
      undefined, enrollment.discountAmount,
    );
    message.success('면제가 취소되었습니다.');
  }, [updateEnrollmentPayment, courseFee, records]);

  // 완납 처리
  const handleFullPayment = useCallback(async (enrollment: Enrollment) => {
    const enrollmentRecords = records.filter((r) => r.enrollmentId === enrollment.id);
    const totalPaid = enrollmentRecords.reduce((sum, r) => sum + r.amount, 0);
    const effectiveFee = courseFee - (enrollment.discountAmount ?? 0);
    const remaining = effectiveFee - totalPaid;
    if (remaining <= 0) return;

    await addPayment(
      enrollment.id,
      remaining,
      courseFee,
      undefined,
      dayjs().format('YYYY-MM-DD'),
    );
    message.success('완납 처리되었습니다.');
  }, [records, addPayment, courseFee]);

  // 전체 완납
  const handleBulkFullPayment = useCallback(async () => {
    const unpaid = tableData.filter(
      (d) => d.enrollment.paymentStatus !== 'exempt' && d.remaining > 0,
    );
    for (const item of unpaid) {
      await addPayment(
        item.enrollment.id,
        item.remaining,
        courseFee,
        undefined,
        dayjs().format('YYYY-MM-DD'),
      );
    }
    message.success(`${unpaid.length}명의 완납이 처리되었습니다.`);
  }, [tableData, addPayment, courseFee]);

  // 선택된 수강생 데이터 (납부 모달 + 이력 모달 공용)
  const selectedData = useMemo(() => {
    if (!selectedEnrollmentId) return null;
    return tableData.find((d) => d.key === selectedEnrollmentId) ?? null;
  }, [selectedEnrollmentId, tableData]);

  // 메인 테이블 컬럼
  const columns: ColumnsType<typeof tableData[0]> = [
    {
      title: '이름',
      key: 'name',
      width: 80,
      render: (_, record) => onStudentClick && record.student ? (
        <a onClick={() => onStudentClick(record.student!.id)} style={{ whiteSpace: 'nowrap' }}>
          {record.studentName}
        </a>
      ) : (
        <span style={{ whiteSpace: 'nowrap' }}>{record.studentName}</span>
      ),
      sorter: (a, b) => a.studentName.localeCompare(b.studentName),
    },
    {
      title: '전화번호',
      key: 'phone',
      width: 120,
      render: (_, record) => (
        <span style={{ whiteSpace: 'nowrap' }}>{record.student?.phone || '-'}</span>
      ),
    },
    {
      title: '납부상태',
      key: 'status',
      width: 80,
      render: (_, record) => {
        const s = record.enrollment.paymentStatus;
        if (s === 'exempt') return <Tag color="purple">면제</Tag>;
        if (s === 'completed') return <Tag color="green">완납</Tag>;
        if (s === 'partial') return <Tag color="orange">부분납부</Tag>;
        return <Tag color="red">미납</Tag>;
      },
      filters: [
        { text: '완납', value: 'completed' },
        { text: '부분납부', value: 'partial' },
        { text: '미납', value: 'pending' },
        { text: '면제', value: 'exempt' },
      ],
      onFilter: (value, record) => record.enrollment.paymentStatus === value,
    },
    {
      title: '납부액/수강료',
      key: 'paid',
      width: 140,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        const discount = record.enrollment.discountAmount ?? 0;
        return (
          <div style={{ whiteSpace: 'nowrap', lineHeight: 1.3 }}>
            <div>₩{record.totalPaid.toLocaleString()} / ₩{record.effectiveFee.toLocaleString()}</div>
            {discount > 0 && (
              <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                할인 ₩{discount.toLocaleString()}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '잔액',
      key: 'remaining',
      width: 90,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <span style={{
            whiteSpace: 'nowrap',
            color: record.remaining > 0 ? token.colorError : token.colorSuccess,
            fontWeight: 600,
          }}>
            ₩{record.remaining.toLocaleString()}
          </span>
        );
      },
      sorter: (a, b) => a.remaining - b.remaining,
    },
    {
      title: '',
      key: 'actions',
      width: 200,
      render: (_, record) => {
        const openHistory = () => {
          setSelectedEnrollmentId(record.enrollment.id);
          setIsHistoryModalVisible(true);
        };

        if (record.enrollment.paymentStatus === 'exempt') {
          return (
            <Space size={4}>
              <Button size="small" onClick={openHistory}>이력보기</Button>
              <Popconfirm
                title="면제를 취소하시겠습니까?"
                onConfirm={() => handleCancelExempt(record.enrollment)}
                okText="취소하기"
                cancelText="닫기"
              >
                <Button size="small">면제 취소</Button>
              </Popconfirm>
            </Space>
          );
        }
        return (
          <Space size={4}>
            <Button size="small" onClick={openHistory}>이력보기</Button>
            <Button
              size="small"
              type="primary"
              ghost
              onClick={() => {
                const discount = record.enrollment.discountAmount ?? 0;
                setSelectedEnrollmentId(record.enrollment.id);
                setModalDiscount(discount);
                form.setFieldsValue({
                  amount: record.remaining > 0 ? record.remaining : undefined,
                  paidAt: dayjs(),
                  discountAmount: discount,
                });
                setIsPaymentModalVisible(true);
              }}
            >
              납부
            </Button>
            {record.remaining > 0 && (
              <Button
                size="small"
                onClick={() => handleFullPayment(record.enrollment)}
              >
                완납
              </Button>
            )}
            <Popconfirm
              title="수강료를 면제 처리하시겠습니까?"
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

  return (
    <div>
      {/* 통계 + 전체 완납 */}
      <div style={{
        marginBottom: 16,
        padding: 12,
        backgroundColor: token.colorFillQuaternary,
        borderRadius: token.borderRadius,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
      }}>
        <div>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>완납 인원</span>
          <div style={{ fontWeight: 600 }}>
            <span style={{ color: token.colorSuccess }}>{stats.paidCount}</span>
            <span style={{ color: token.colorTextSecondary }}> / {stats.totalStudents}명</span>
          </div>
        </div>
        <div>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>납부 합계</span>
          <div style={{ fontWeight: 600, color: token.colorSuccess }}>₩{stats.totalPaid.toLocaleString()}</div>
        </div>
        <div>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>예상 합계</span>
          <div style={{ fontWeight: 600 }}>₩{stats.expectedTotal.toLocaleString()}</div>
        </div>
        <div>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>수납률</span>
          <div style={{
            fontWeight: 600,
            color: stats.expectedTotal > 0 && stats.totalPaid < stats.expectedTotal
              ? token.colorError : token.colorSuccess,
          }}>
            {stats.expectedTotal > 0 ? Math.round((stats.totalPaid / stats.expectedTotal) * 100) : 0}%
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Button type="primary" size="small" onClick={handleBulkFullPayment}>
            전체 완납
          </Button>
        </div>
      </div>

      {/* 테이블 */}
      <Table
        columns={columns}
        dataSource={tableData}
        rowKey="key"
        pagination={false}
        size="small"
        rowSelection={rowSelection ? { selectedRowKeys: rowSelection.selectedRowKeys, onChange: rowSelection.onChange } : undefined}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="수강생이 없습니다"
            />
          ),
        }}
      />

      {/* 납부 추가 모달 */}
      <Modal
        title={`납부 — ${selectedData?.studentName ?? ''}`}
        open={isPaymentModalVisible}
        onCancel={() => {
          setIsPaymentModalVisible(false);
          setSelectedEnrollmentId(null);
          form.resetFields();
        }}
        onOk={handleAddPayment}
        okText="납부 기록"
        cancelText="취소"
      >
        {/* 수강료 요약 */}
        {selectedData && (() => {
          const modalEffectiveFee = courseFee - modalDiscount;
          const modalRemaining = Math.max(0, modalEffectiveFee - selectedData.totalPaid);
          return (
            <div style={{
              marginBottom: 16,
              padding: 12,
              backgroundColor: token.colorFillQuaternary,
              borderRadius: token.borderRadius,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: token.colorTextSecondary }}>수강료</span>
                <span style={{ fontWeight: 600 }}>₩{courseFee.toLocaleString()}</span>
              </div>
              {modalDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: token.colorTextSecondary }}>할인</span>
                  <span style={{ color: token.colorSuccess }}>-₩{modalDiscount.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: token.colorTextSecondary }}>기납부액</span>
                <span>₩{selectedData.totalPaid.toLocaleString()}</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                paddingTop: 6, borderTop: `1px solid ${token.colorBorderSecondary}`,
                fontWeight: 600, fontSize: 15,
              }}>
                <span>납부할 금액</span>
                <span style={{ color: modalRemaining > 0 ? token.colorError : token.colorSuccess }}>
                  ₩{modalRemaining.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })()}

        <Form form={form} layout="vertical">
          <Form.Item
            name="discountAmount"
            label="할인 금액"
          >
            <InputNumber<number>
              style={{ width: '100%' }}
              min={0}
              max={courseFee}
              formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => value?.replace(/₩\s?|(,*)/g, '') as unknown as number}
              onChange={(value) => {
                const newDiscount = value ?? 0;
                setModalDiscount(newDiscount);
                // 납부 금액도 새 잔액으로 자동 조정
                if (selectedData) {
                  const newRemaining = Math.max(0, courseFee - newDiscount - selectedData.totalPaid);
                  form.setFieldsValue({ amount: newRemaining });
                }
              }}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label="납부 금액"
            rules={[{ required: true, message: '금액을 입력하세요' }]}
          >
            <InputNumber<number>
              style={{ width: '100%' }}
              min={0}
              formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => value?.replace(/₩\s?|(,*)/g, '') as unknown as number}
            />
          </Form.Item>
          <Form.Item
            name="paymentMethod"
            label="납부 방법"
          >
            <Select placeholder="선택">
              <Select.Option value="transfer">계좌이체</Select.Option>
              <Select.Option value="card">카드</Select.Option>
              <Select.Option value="cash">현금</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="paidAt"
            label="납부일"
            rules={[{ required: true, message: '납부일을 선택하세요' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="메모">
            <Input placeholder="메모" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 납부 이력 모달 */}
      <Modal
        title={`납부 이력 — ${selectedData?.studentName ?? ''}`}
        open={isHistoryModalVisible}
        onCancel={() => {
          setIsHistoryModalVisible(false);
          setSelectedEnrollmentId(null);
        }}
        footer={null}
        width={560}
      >
        {(selectedData?.records ?? []).length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="납부 이력이 없습니다" />
        ) : (
          <Table
            columns={[
              {
                title: '납부일',
                key: 'paidAt',
                width: 100,
                render: (_, r) => r.paidAt,
              },
              {
                title: '금액',
                key: 'amount',
                width: 110,
                render: (_, r) => `₩${r.amount.toLocaleString()}`,
              },
              {
                title: '방법',
                key: 'paymentMethod',
                width: 70,
                render: (_, r) => r.paymentMethod
                  ? PAYMENT_METHOD_LABELS[r.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] || '-'
                  : '-',
              },
              {
                title: '메모',
                key: 'notes',
                render: (_, r) => (
                  <Input
                    size="small"
                    style={{ width: '100%' }}
                    defaultValue={r.notes ?? ''}
                    placeholder="메모"
                    onBlur={(e) => {
                      const val = e.target.value;
                      if (val !== (r.notes ?? '')) {
                        updateRecord(r.id, { notes: val || undefined });
                      }
                    }}
                  />
                ),
              },
              {
                title: '',
                key: 'action',
                width: 40,
                render: (_, r) => (
                  <Popconfirm
                    title="삭제하시겠습니까?"
                    onConfirm={() => handleDeletePayment(r.id)}
                    okText="삭제"
                    okType="danger"
                    cancelText="취소"
                  >
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ),
              },
            ] as ColumnsType<typeof tableData[0]['records'][0]>}
            dataSource={selectedData?.records ?? []}
            rowKey="id"
            pagination={false}
            size="small"
          />
        )}
      </Modal>
    </div>
  );
};

export default PaymentManagementTable;
