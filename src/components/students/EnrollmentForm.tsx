import React, { useEffect, useState } from 'react';
import { Modal, Form, Select, InputNumber, Button, message, Space, Input, Row, Col, Radio, theme } from 'antd';
import dayjs from 'dayjs';
import type { Student, EnrollmentFormData, PaymentMethod } from '../../types';
import { useEnrollmentStore } from '../../stores/enrollmentStore';
import { useCourseStore } from '../../stores/courseStore';
import { useLicenseStore } from '../../stores/licenseStore';

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
  const { getPlan, getLimit } = useLicenseStore();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [isExempt, setIsExempt] = useState(false);

  const selectedCourse = selectedCourseId ? getCourseById(selectedCourseId) : null;
  const courseFee = selectedCourse?.fee || 0;
  const effectiveFee = courseFee - discountAmount;

  useEffect(() => {
    if (visible) {
      form.resetFields();
      setSelectedCourseId(null);
      setDiscountAmount(0);
      setIsExempt(false);
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

      // 체험판 강좌당 수강생 수 제한 체크
      if (getPlan() === 'trial') {
        const maxStudentsPerCourse = getLimit('maxStudentsPerCourse');
        if (currentEnrollmentCount >= maxStudentsPerCourse) {
          message.warning(`체험판은 강좌당 최대 ${maxStudentsPerCourse}명까지 등록 가능합니다. 설정에서 라이선스를 활성화하세요.`);
          return;
        }
      }

      const paidAmount = isExempt ? 0 : (values.paidAmount || 0);
      const discount = values.discountAmount || 0;
      const effFee = course.fee - discount;

      let paymentStatus: 'pending' | 'partial' | 'completed' | 'exempt' = 'pending';
      if (isExempt) {
        paymentStatus = 'exempt';
      } else if (paidAmount === 0) {
        paymentStatus = 'pending';
      } else if (paidAmount < effFee) {
        paymentStatus = 'partial';
      } else {
        paymentStatus = 'completed';
      }

      const enrollmentData: EnrollmentFormData = {
        courseId: values.courseId,
        studentId: student.id,
        paymentStatus,
        paidAmount,
        paidAt: (paidAmount > 0 || isExempt) ? dayjs().format('YYYY-MM-DD') : undefined,
        paymentMethod: values.paymentMethod,
        discountAmount: discount,
        notes: values.notes,
      };

      await addEnrollment(enrollmentData);
      message.success('강좌 신청이 완료되었습니다.');

      form.resetFields();
      setSelectedCourseId(null);
      setDiscountAmount(0);
      setIsExempt(false);
      onClose();
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  const handleCourseChange = (courseId: string) => {
    const course = getCourseById(courseId);
    setSelectedCourseId(courseId);
    setDiscountAmount(0);
    setIsExempt(false);
    if (course) {
      form.setFieldsValue({ paidAmount: course.fee, discountAmount: 0 });
    }
  };

  const handleDiscountChange = (value: number | null) => {
    const discount = value || 0;
    setDiscountAmount(discount);
    // 할인 적용 후 납부금액이 할인된 수강료 초과하면 조정
    const currentPaid = form.getFieldValue('paidAmount') || 0;
    const newEffectiveFee = courseFee - discount;
    if (currentPaid > newEffectiveFee) {
      form.setFieldsValue({ paidAmount: newEffectiveFee });
    }
  };

  const handleExemptToggle = () => {
    const newExempt = !isExempt;
    setIsExempt(newExempt);
    if (newExempt) {
      form.setFieldsValue({ paidAmount: 0 });
    } else {
      form.setFieldsValue({ paidAmount: effectiveFee });
    }
  };

  return (
    <Modal
      title={`강좌 신청 - ${student?.name || ''}`}
      open={visible}
      onCancel={onClose}
      width={520}
      style={{ top: 40, paddingBottom: 40 }}
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
        {/* 강좌 선택 */}
        <Form.Item
          name="courseId"
          label="강좌 선택"
          rules={[{ required: true, message: '강좌를 선택하세요' }]}
        >
          <Select
            placeholder="강좌를 선택하세요"
            onChange={handleCourseChange}
            showSearch
            optionFilterProp="label"
          >
            {courses.map((course) => {
              const currentCount = enrollments.filter(e => e.courseId === course.id).length;
              const trialLimit = getPlan() === 'trial' ? getLimit('maxStudentsPerCourse') : Infinity;
              const effectiveMax = Math.min(course.maxStudents, trialLimit);
              const isFull = currentCount >= effectiveMax;
              const isEnrolled = enrollments.some(e => e.studentId === student?.id && e.courseId === course.id);
              const isDisabled = isFull || isEnrolled;
              const label = `${course.name} (₩${course.fee.toLocaleString()}) - ${currentCount}/${course.maxStudents}명`;
              return (
                <Option key={course.id} value={course.id} disabled={isDisabled} label={label}>
                  <span style={isEnrolled ? { textDecoration: 'line-through', color: token.colorTextQuaternary } : undefined}>
                    {label}
                    {isEnrolled && ' [수강중]'}
                    {isFull && !isEnrolled && ' [정원 마감]'}
                  </span>
                </Option>
              );
            })}
          </Select>
        </Form.Item>

        {selectedCourseId && (
          <>
            {/* 할인 + 면제 */}
            <Row gutter={16} align="middle">
              <Col flex="auto">
                <Form.Item name="discountAmount" label="할인 금액" initialValue={0}>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    max={courseFee}
                    placeholder="0"
                    formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(value) => (Number(value?.replace(/₩\s?|(,*)/g, '')) || 0) as any}
                    onChange={handleDiscountChange}
                    disabled={isExempt}
                  />
                </Form.Item>
              </Col>
              <Col>
                <Form.Item label=" ">
                  <Button
                    type={isExempt ? 'primary' : 'default'}
                    danger={isExempt}
                    onClick={handleExemptToggle}
                  >
                    {isExempt ? '면제 해제' : '면제'}
                  </Button>
                </Form.Item>
              </Col>
            </Row>

            {discountAmount > 0 && !isExempt && (
              <div style={{ marginTop: -12, marginBottom: 16, fontSize: 12, color: token.colorSuccess }}>
                할인 적용 수강료: ₩{effectiveFee.toLocaleString()}
              </div>
            )}

            {isExempt && (
              <div style={{ marginTop: -12, marginBottom: 16, padding: 8, backgroundColor: token.colorWarningBg, borderRadius: token.borderRadius, fontSize: 12 }}>
                면제 처리됩니다. 수익에 포함되지 않습니다.
              </div>
            )}

            {/* 납부 금액 */}
            <Form.Item
              name="paidAmount"
              label="납부 금액"
              initialValue={0}
              rules={[{ required: true, message: '납부 금액을 입력하세요' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={effectiveFee}
                placeholder="30000"
                formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => (Number(value?.replace(/₩\s?|(,*)/g, '')) || 0) as any}
                disabled={isExempt}
              />
            </Form.Item>

            <Space wrap style={{ marginBottom: 16 }}>
              <Button size="small" onClick={() => form.setFieldsValue({ paidAmount: effectiveFee })} disabled={isExempt}>완납</Button>
              <Button size="small" onClick={() => form.setFieldsValue({ paidAmount: Math.floor(effectiveFee / 2) })} disabled={isExempt}>절반</Button>
              <Button size="small" onClick={() => form.setFieldsValue({ paidAmount: 0 })} disabled={isExempt}>미납</Button>
            </Space>

            {/* 납부 방법 */}
            <Form.Item name="paymentMethod" label="납부 방법">
              <Radio.Group disabled={isExempt}>
                <Radio.Button value="cash">현금</Radio.Button>
                <Radio.Button value="card">카드</Radio.Button>
                <Radio.Button value="transfer">계좌이체</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </>
        )}

        <Form.Item name="notes" label="메모">
          <TextArea rows={2} placeholder="추가 정보를 입력하세요" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default EnrollmentForm;
