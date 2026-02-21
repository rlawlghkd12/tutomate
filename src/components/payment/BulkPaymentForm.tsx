import React, { useState } from 'react';
import { Modal, Form, InputNumber, Button, message, Space, Radio, Divider, theme } from 'antd';
import type { Enrollment } from '../../types';
import { useEnrollmentStore } from '../../stores/enrollmentStore';
import { FLEX_BETWEEN } from '../../config/styles';

const { useToken } = theme;

interface BulkPaymentFormProps {
  visible: boolean;
  onClose: () => void;
  enrollments: Enrollment[];
  courseFee: number;
}

const BulkPaymentForm: React.FC<BulkPaymentFormProps> = ({
  visible,
  onClose,
  enrollments,
  courseFee,
}) => {
  const { token } = useToken();
  const [form] = Form.useForm();
  const { updatePayment } = useEnrollmentStore();
  const [paymentType, setPaymentType] = useState<'fixed' | 'ratio'>('fixed');

  const totalSelectedStudents = enrollments.length;
  const totalExpectedAmount = totalSelectedStudents * courseFee;
  const totalCurrentPaid = enrollments.reduce((sum, e) => sum + e.paidAmount, 0);
  const totalRemaining = totalExpectedAmount - totalCurrentPaid;

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      let amountPerStudent = 0;
      if (paymentType === 'fixed') {
        amountPerStudent = values.fixedAmount || 0;
      } else {
        const ratio = values.ratio || 0;
        amountPerStudent = Math.floor((courseFee * ratio) / 100);
      }

      // 각 수강생에게 납부 금액 추가
      for (const enrollment of enrollments) {
        const newPaidAmount = enrollment.paidAmount + amountPerStudent;
        await updatePayment(enrollment.id, newPaidAmount, courseFee);
      }

      message.success(`${totalSelectedStudents}명의 납부 정보가 업데이트되었습니다.`);
      form.resetFields();
      onClose();
    } catch (error) {
      console.error('일괄 납부 처리 실패:', error);
    }
  };

  return (
    <Modal
      title="일괄 납부 처리"
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          취소
        </Button>,
        <Button key="submit" type="primary" onClick={handleSubmit}>
          적용
        </Button>,
      ]}
      width={600}
    >
      <Form form={form} layout="vertical">
        <div style={{ marginBottom: 16, padding: 12, backgroundColor: token.colorBgLayout, borderRadius: 4 }}>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <div style={FLEX_BETWEEN}>
              <span>선택된 수강생:</span>
              <strong>{totalSelectedStudents}명</strong>
            </div>
            <div style={FLEX_BETWEEN}>
              <span>총 예상 금액:</span>
              <strong>₩{totalExpectedAmount.toLocaleString()}</strong>
            </div>
            <div style={FLEX_BETWEEN}>
              <span>현재 총 납부액:</span>
              <strong>₩{totalCurrentPaid.toLocaleString()}</strong>
            </div>
            <div style={FLEX_BETWEEN}>
              <span>총 잔여 금액:</span>
              <strong style={{ color: token.colorError }}>₩{totalRemaining.toLocaleString()}</strong>
            </div>
          </Space>
        </div>

        <Divider />

        <Form.Item label="납부 방식">
          <Radio.Group value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
            <Radio value="fixed">고정 금액</Radio>
            <Radio value="ratio">비율</Radio>
          </Radio.Group>
        </Form.Item>

        {paymentType === 'fixed' ? (
          <>
            <Form.Item
              name="fixedAmount"
              label="1인당 납부 금액"
              rules={[
                { required: true, message: '납부 금액을 입력하세요' },
                { type: 'number', min: 0, message: '0원 이상이어야 합니다' },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                placeholder="예: 100000"
                formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => Number(value?.replace(/₩\s?|(,*)/g, '') || 0) as any}
              />
            </Form.Item>
            <Space style={{ marginTop: -16, marginBottom: 24 }}>
              <Button
                size="small"
                onClick={() => form.setFieldsValue({ fixedAmount: Math.floor(courseFee / 2) })}
              >
                절반 (₩{Math.floor(courseFee / 2).toLocaleString()})
              </Button>
              <Button
                size="small"
                onClick={() => form.setFieldsValue({ fixedAmount: courseFee })}
              >
                전액 (₩{courseFee.toLocaleString()})
              </Button>
            </Space>
          </>
        ) : (
          <>
            <Form.Item
              name="ratio"
              label="납부 비율 (%)"
              rules={[
                { required: true, message: '비율을 입력하세요' },
                { type: 'number', min: 0, max: 100, message: '0~100 사이의 값이어야 합니다' },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={100}
                placeholder="예: 50"
                formatter={(value) => `${value}%`}
                parser={(value) => Number(value?.replace('%', '') || 0) as any}
              />
            </Form.Item>
            <Space style={{ marginTop: -16, marginBottom: 24 }}>
              <Button
                size="small"
                onClick={() => form.setFieldsValue({ ratio: 25 })}
              >
                25%
              </Button>
              <Button
                size="small"
                onClick={() => form.setFieldsValue({ ratio: 50 })}
              >
                50%
              </Button>
              <Button
                size="small"
                onClick={() => form.setFieldsValue({ ratio: 100 })}
              >
                100%
              </Button>
            </Space>
          </>
        )}

        <div style={{ padding: 12, backgroundColor: token.colorInfoBg, borderRadius: 4, border: `1px solid ${token.colorInfoBorder}` }}>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <strong>미리보기</strong>
            <div>
              1인당 납부액: ₩
              {paymentType === 'fixed'
                ? (form.getFieldValue('fixedAmount') || 0).toLocaleString()
                : Math.floor((courseFee * (form.getFieldValue('ratio') || 0)) / 100).toLocaleString()}
            </div>
            <div>
              총 납부액: ₩
              {(
                totalSelectedStudents *
                (paymentType === 'fixed'
                  ? form.getFieldValue('fixedAmount') || 0
                  : Math.floor((courseFee * (form.getFieldValue('ratio') || 0)) / 100))
              ).toLocaleString()}
            </div>
          </Space>
        </div>
      </Form>
    </Modal>
  );
};

export default BulkPaymentForm;
