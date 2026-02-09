import React, { useEffect } from 'react';
import { Modal, Form, InputNumber, Button, message, Descriptions, Space, DatePicker, Row, Col } from 'antd';
import type { Enrollment } from '../../types';
import { useEnrollmentStore } from '../../stores/enrollmentStore';
import dayjs from 'dayjs';

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
  const [form] = Form.useForm();
  const { updatePayment } = useEnrollmentStore();

  useEffect(() => {
    if (visible && enrollment) {
      form.setFieldsValue({
        paidAmount: enrollment.paidAmount,
        paidAt: enrollment.paidAt ? dayjs(enrollment.paidAt) : dayjs(),
      });
    }
  }, [visible, enrollment, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (!enrollment) {
        message.error('수강 정보를 찾을 수 없습니다.');
        return;
      }

      const paidAt = values.paidAt ? values.paidAt.format('YYYY-MM-DD') : undefined;
      updatePayment(enrollment.id, values.paidAmount, courseFee, paidAt);
      message.success('납부 정보가 업데이트되었습니다.');
      form.resetFields();
      onClose();
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  if (!enrollment) {
    return null;
  }

  const remainingAmount = courseFee - (form.getFieldValue('paidAmount') || enrollment.paidAmount);

  return (
    <Modal
      title="납부 관리"
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          취소
        </Button>,
        <Button key="submit" type="primary" onClick={handleSubmit}>
          저장
        </Button>,
      ]}
    >
      <Descriptions column={1} bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="수강료">
          ₩{courseFee.toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label="현재 납부 금액">
          ₩{enrollment.paidAmount.toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label="잔여 금액">
          ₩{enrollment.remainingAmount.toLocaleString()}
        </Descriptions.Item>
      </Descriptions>

      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="paidAmount"
              label="납부 금액"
              rules={[
                { required: true, message: '납부 금액을 입력하세요' },
                { type: 'number', max: courseFee, message: '수강료를 초과할 수 없습니다' },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={courseFee}
                placeholder="납부 금액 입력"
                formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => value?.replace(/₩\s?|(,*)/g, '') as unknown as number}
                onChange={() => form.validateFields(['paidAmount'])}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="paidAt"
              label="납부일"
              rules={[{ required: true, message: '납부일을 선택하세요' }]}
            >
              <DatePicker style={{ width: '100%' }} placeholder="납부일 선택" />
            </Form.Item>
          </Col>
        </Row>
        <Space style={{ marginTop: -16, marginBottom: 24 }}>
          <Button
            size="small"
            onClick={() => {
              form.setFieldsValue({ paidAmount: Math.floor(courseFee / 2) });
              form.validateFields(['paidAmount']);
            }}
          >
            절반
          </Button>
          <Button
            size="small"
            onClick={() => {
              form.setFieldsValue({ paidAmount: courseFee });
              form.validateFields(['paidAmount']);
            }}
          >
            잔액 전액
          </Button>
        </Space>

        <Form.Item label="변경 후 잔여 금액">
          <InputNumber
            value={remainingAmount}
            disabled
            style={{ width: '100%' }}
            formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default PaymentForm;
