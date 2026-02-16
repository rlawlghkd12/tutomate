import React, { useEffect } from 'react';
import { Modal, Form, Select, InputNumber, Button, message, Space, Input, Row, Col, theme } from 'antd';
import type { Student, EnrollmentFormData } from '../../types';
import { useEnrollmentStore } from '../../stores/enrollmentStore';
import { useCourseStore } from '../../stores/courseStore';

const { Option } = Select;
const { TextArea } = Input;

interface EnrollmentFormProps {
  visible: boolean;
  onClose: () => void;
  student: Student | null;
}

const EnrollmentForm: React.FC<EnrollmentFormProps> = ({ visible, onClose, student }) => {
  const { token } = theme.useToken();
  const [form] = Form.useForm();
  const { addEnrollment, enrollments } = useEnrollmentStore();
  const { courses, getCourseById } = useCourseStore();

  useEffect(() => {
    if (visible) {
      form.resetFields();
    }
  }, [visible, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (!student) {
        message.error('수강생 정보가 없습니다.');
        return;
      }

      const course = getCourseById(values.courseId);
      if (!course) {
        message.error('강좌 정보를 찾을 수 없습니다.');
        return;
      }

      // 중복 등록 체크
      const alreadyEnrolled = enrollments.some(
        (e) => e.studentId === student.id && e.courseId === values.courseId
      );
      if (alreadyEnrolled) {
        message.error('이미 등록된 강좌입니다.');
        return;
      }

      const currentEnrollmentCount = enrollments.filter(e => e.courseId === values.courseId).length;
      if (currentEnrollmentCount >= course.maxStudents) {
        message.error('강좌 정원이 마감되었습니다.');
        return;
      }

      const paidAmount = values.paidAmount || 0;

      let paymentStatus: 'pending' | 'partial' | 'completed' = 'pending';
      if (paidAmount === 0) {
        paymentStatus = 'pending';
      } else if (paidAmount < course.fee) {
        paymentStatus = 'partial';
      } else {
        paymentStatus = 'completed';
      }

      const enrollmentData: EnrollmentFormData = {
        courseId: values.courseId,
        studentId: student.id,
        paymentStatus,
        paidAmount,
        notes: values.notes,
      };

      addEnrollment(enrollmentData);
      message.success('강좌 신청이 완료되었습니다.');

      form.resetFields();
      onClose();
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  const handleCourseChange = (courseId: string) => {
    const course = getCourseById(courseId);
    if (course) {
      form.setFieldsValue({ paidAmount: course.fee });
    }
  };

  return (
    <Modal
      title={`강좌 신청 - ${student?.name || ''}`}
      open={visible}
      onCancel={onClose}
      width={500}
      footer={[
        <Button key="cancel" onClick={onClose}>
          취소
        </Button>,
        <Button key="submit" type="primary" onClick={handleSubmit}>
          신청
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="courseId"
              label="강좌 선택"
              rules={[{ required: true, message: '강좌를 선택하세요' }]}
            >
              <Select
                placeholder="강좌를 선택하세요"
                onChange={handleCourseChange}
                showSearch
                optionFilterProp="children"
              >
                {courses.map((course) => {
                  const currentCount = enrollments.filter(e => e.courseId === course.id).length;
                  const isFull = currentCount >= course.maxStudents;
                  const isEnrolled = enrollments.some(e => e.studentId === student?.id && e.courseId === course.id);
                  const isDisabled = isFull || isEnrolled;
                  return (
                    <Option key={course.id} value={course.id} disabled={isDisabled}>
                      <span style={isEnrolled ? { textDecoration: 'line-through', color: token.colorTextQuaternary } : undefined}>
                        {course.name} (₩{course.fee.toLocaleString()}) - {currentCount}/{course.maxStudents}명
                        {isEnrolled && ' [수강중]'}
                        {isFull && !isEnrolled && ' [정원 마감]'}
                      </span>
                    </Option>
                  );
                })}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="paidAmount"
              label="납부 금액"
              initialValue={0}
              rules={[{ required: true, message: '납부 금액을 입력하세요' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                placeholder="30000"
                formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => (Number(value?.replace(/₩\s?|(,*)/g, '')) || 0) as any}
              />
            </Form.Item>
          </Col>
        </Row>

        <Space wrap style={{ marginBottom: 16 }}>
          <Button size="small" onClick={() => form.setFieldsValue({ paidAmount: 20000 })}>2만원</Button>
          <Button size="small" onClick={() => form.setFieldsValue({ paidAmount: 30000 })}>3만원</Button>
          <Button size="small" onClick={() => form.setFieldsValue({ paidAmount: 40000 })}>4만원</Button>
          <Button size="small" onClick={() => form.setFieldsValue({ paidAmount: 60000 })}>6만원</Button>
          <Button size="small" onClick={() => form.setFieldsValue({ paidAmount: 90000 })}>9만원</Button>
        </Space>

        <Form.Item name="notes" label="메모">
          <TextArea rows={2} placeholder="추가 정보를 입력하세요" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default EnrollmentForm;
