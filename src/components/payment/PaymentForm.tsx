import React, { useEffect, useState } from 'react';
import { Modal, Form, InputNumber, Button, message, Space, DatePicker, Row, Col, Popconfirm, Tag, Radio, Divider, theme } from 'antd';
import type { Enrollment } from '../../types';
import { useEnrollmentStore } from '../../stores/enrollmentStore';
import dayjs from 'dayjs';

const { useToken } = theme;

interface PaymentFormProps {
  visible: boolean;
  onClose: () => void;
  enrollment: Enrollment | null;
  courseFee: number;
}

const PaymentForm: React.FC<PaymentFormProps> = ({
  visible,
  onClose,
  enrollment,
  courseFee,
}) => {
  const { token } = useToken();
  const [form] = Form.useForm();
  const { updatePayment } = useEnrollmentStore();
  const [discountAmount, setDiscountAmount] = useState(0);

  useEffect(() => {
    if (visible && enrollment) {
      const discount = enrollment.discountAmount ?? 0;
      setDiscountAmount(discount);
      form.setFieldsValue({
        paidAmount: enrollment.paidAmount,
        paidAt: enrollment.paidAt ? dayjs(enrollment.paidAt) : dayjs(),
        paymentMethod: enrollment.paymentMethod || undefined,
        discountAmount: discount,
      });
    }
  }, [visible, enrollment, form]);

  const effectiveFee = courseFee - discountAmount;

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (!enrollment) {
        message.error('수강 정보를 찾을 수 없습니다.');
        return;
      }

      const paidAt = values.paidAt ? values.paidAt.format('YYYY-MM-DD') : undefined;
      await updatePayment(
        enrollment.id,
        values.paidAmount,
        courseFee,
        paidAt,
        false,
        values.paymentMethod || undefined,
        values.discountAmount ?? 0,
      );
      message.success('납부 정보가 업데이트되었습니다.');
      form.resetFields();
      onClose();
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  const handleExempt = async () => {
    if (!enrollment) return;
    await updatePayment(enrollment.id, 0, courseFee, dayjs().format('YYYY-MM-DD'), true);
    message.success('수강료가 면제 처리되었습니다.');
    form.resetFields();
    onClose();
  };

  const handleCancelExempt = async () => {
    if (!enrollment) return;
    await updatePayment(enrollment.id, 0, courseFee, undefined);
    message.success('면제가 취소되었습니다.');
    form.resetFields();
    onClose();
  };

  if (!enrollment) {
    return null;
  }

  const isExempt = enrollment.paymentStatus === 'exempt';
  const currentPaidAmount = form.getFieldValue('paidAmount') ?? enrollment.paidAmount;
  const remainingAmount = effectiveFee - currentPaidAmount;

  return (
    <Modal
      title="납부 관리"
      open={visible}
      onCancel={onClose}
      styles={{ body: { paddingBottom: 24 } }}
      footer={[
        isExempt ? (
          <Popconfirm
            key="cancelExempt"
            title="면제 취소"
            description="면제를 취소하시겠습니까? 납부 상태가 미납으로 변경됩니다."
            onConfirm={handleCancelExempt}
            okText="취소하기"
            cancelText="닫기"
          >
            <Button>면제 취소</Button>
          </Popconfirm>
        ) : (
          <Popconfirm
            key="exempt"
            title="수강료 면제"
            description="정말 수강료를 면제 처리하시겠습니까? 면제된 금액은 수익에 포함되지 않습니다."
            onConfirm={handleExempt}
            okText="면제"
            cancelText="취소"
          >
            <Button danger>면제</Button>
          </Popconfirm>
        ),
        <Button key="cancel" onClick={onClose}>
          취소
        </Button>,
        <Button key="submit" type="primary" onClick={handleSubmit} disabled={isExempt}>
          저장
        </Button>,
      ]}
    >
      {/* 현재 상태 요약 */}
      <div style={{ marginBottom: 16, padding: 12, backgroundColor: token.colorFillQuaternary, borderRadius: token.borderRadius }}>
        {isExempt ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag color="purple">면제</Tag>
            <span>이 수강은 수강료가 면제되었습니다.</span>
          </div>
        ) : (
          <Row gutter={[16, 4]}>
            <Col span={8}>
              <div style={{ fontSize: 12, color: token.colorTextSecondary }}>수강료</div>
              <div style={{ fontWeight: 500 }}>₩{courseFee.toLocaleString()}</div>
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 12, color: token.colorTextSecondary }}>납부 금액</div>
              <div style={{ fontWeight: 500, color: token.colorSuccess }}>₩{enrollment.paidAmount.toLocaleString()}</div>
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 12, color: token.colorTextSecondary }}>잔여 금액</div>
              <div style={{ fontWeight: 500, color: enrollment.remainingAmount > 0 ? token.colorError : token.colorSuccess }}>
                ₩{enrollment.remainingAmount.toLocaleString()}
              </div>
            </Col>
          </Row>
        )}
      </div>

      <Form form={form} layout="vertical">
        {/* 할인 */}
        <Form.Item name="discountAmount" label="할인 금액">
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            max={courseFee}
            placeholder="0원이면 할인 없음"
            formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => value?.replace(/₩\s?|(,*)/g, '') as unknown as number}
            onChange={(value) => setDiscountAmount(value || 0)}
            disabled={isExempt}
          />
        </Form.Item>
        {discountAmount > 0 && (
          <div style={{ marginTop: -16, marginBottom: 16, fontSize: 12, color: token.colorSuccess }}>
            할인 적용 수강료: ₩{effectiveFee.toLocaleString()} (₩{courseFee.toLocaleString()} - ₩{discountAmount.toLocaleString()})
          </div>
        )}

        <Divider style={{ margin: '8px 0 16px' }} />

        {/* 납부 금액 + 납부일 */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="paidAmount"
              label="납부 금액"
              rules={[
                { required: true, message: '납부 금액을 입력하세요' },
                { type: 'number', max: effectiveFee, message: '수강료를 초과할 수 없습니다' },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={effectiveFee}
                placeholder="납부 금액 입력"
                formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => value?.replace(/₩\s?|(,*)/g, '') as unknown as number}
                onChange={() => form.validateFields(['paidAmount'])}
                disabled={isExempt}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="paidAt"
              label="납부일"
              rules={[{ required: true, message: '납부일을 선택하세요' }]}
            >
              <DatePicker style={{ width: '100%' }} placeholder="납부일 선택" disabled={isExempt} />
            </Form.Item>
          </Col>
        </Row>
        <Space style={{ marginTop: -16, marginBottom: 16 }}>
          <Button size="small" onClick={() => { form.setFieldsValue({ paidAmount: Math.floor(effectiveFee / 2) }); form.validateFields(['paidAmount']); }} disabled={isExempt}>
            절반
          </Button>
          <Button size="small" onClick={() => { form.setFieldsValue({ paidAmount: effectiveFee }); form.validateFields(['paidAmount']); }} disabled={isExempt}>
            잔액 전액
          </Button>
        </Space>

        {/* 납부 방법 — Radio.Button 통일 */}
        <Form.Item name="paymentMethod" label="납부 방법">
          <Radio.Group disabled={isExempt}>
            <Radio.Button value="cash">현금</Radio.Button>
            <Radio.Button value="card">카드</Radio.Button>
            <Radio.Button value="transfer">계좌이체</Radio.Button>
          </Radio.Group>
        </Form.Item>

        {/* 변경 후 잔여 금액 */}
        {!isExempt && (
          <div style={{ padding: 10, backgroundColor: token.colorFillQuaternary, borderRadius: token.borderRadius, textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: token.colorTextSecondary }}>변경 후 잔여 금액: </span>
            <span style={{ fontWeight: 600, color: remainingAmount > 0 ? token.colorError : token.colorSuccess }}>
              ₩{remainingAmount.toLocaleString()}
            </span>
          </div>
        )}
      </Form>
    </Modal>
  );
};

export default PaymentForm;
