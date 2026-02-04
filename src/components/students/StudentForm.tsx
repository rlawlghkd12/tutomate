import React, { useEffect, useRef } from 'react';
import { Modal, Form, Input, Button, message, Space, Select } from 'antd';
import type { Student, StudentFormData } from '../../types';
import { useStudentStore } from '../../stores/studentStore';
import { useCourseStore } from '../../stores/courseStore';
import { useEnrollmentStore } from '../../stores/enrollmentStore';
import type { EnrollmentFormData } from '../../types';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;

interface StudentFormProps {
  visible: boolean;
  onClose: () => void;
  student?: Student | null;
}

const StudentForm: React.FC<StudentFormProps> = ({ visible, onClose, student }) => {
  const [form] = Form.useForm();
  const { addStudent, updateStudent } = useStudentStore();
  const { courses, incrementCurrentStudents, getCourseById } = useCourseStore();
  const { addEnrollment } = useEnrollmentStore();
  const nameInputRef = useRef<any>(null);
  const phoneInputRef = useRef<any>(null);
  const emailInputRef = useRef<any>(null);
  const birthDateInputRef = useRef<any>(null);

  const availableCourses = courses.filter(
    (course) => course.currentStudents < course.maxStudents
  );

  useEffect(() => {
    if (visible && student) {
      form.setFieldsValue({
        ...student,
        birthDate: student.birthDate ? student.birthDate.replace(/-/g, '').slice(2) : undefined,
      });
    } else if (visible) {
      form.resetFields();
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [visible, student, form]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    let formattedValue = value;

    if (value.length <= 3) {
      formattedValue = value;
    } else if (value.length <= 7) {
      formattedValue = `${value.slice(0, 3)}-${value.slice(3)}`;
    } else if (value.length <= 11) {
      formattedValue = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`;
    } else {
      formattedValue = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;
    }

    form.setFieldsValue({ phone: formattedValue });
  };

  const parseBirthDate = (value: string): string | undefined => {
    if (!value) return undefined;
    const digits = value.replace(/[^0-9]/g, '');
    if (digits.length !== 6) return undefined;

    const yy = parseInt(digits.slice(0, 2), 10);
    const mm = digits.slice(2, 4);
    const dd = digits.slice(4, 6);
    const year = yy >= 0 && yy <= 30 ? 2000 + yy : 1900 + yy;

    return `${year}-${mm}-${dd}`;
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const birthDateParsed = parseBirthDate(values.birthDate);

      const formData = {
        ...values,
        birthDate: birthDateParsed,
      };

      if (student) {
        updateStudent(student.id, formData);
        message.success('수강생 정보가 수정되었습니다.');
        form.resetFields();
        onClose();
      } else {
        const newStudent = addStudent(formData as StudentFormData);

        if (values.courseId && newStudent) {
          const course = getCourseById(values.courseId);
          if (course && course.currentStudents < course.maxStudents) {
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
              studentId: newStudent.id,
              paymentStatus,
              paidAmount,
              notes: '',
            };

            addEnrollment(enrollmentData);
            incrementCurrentStudents(values.courseId);
          }
        }

        message.success('수강생이 등록되었습니다.');
        form.resetFields();
        setTimeout(() => {
          nameInputRef.current?.focus();
        }, 100);
      }
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, nextRef: React.RefObject<any> | null) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nextRef?.current) {
        nextRef.current.focus();
      }
    }
  };

  return (
    <Modal
      title={student ? '수강생 정보 수정' : '수강생 등록'}
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          취소
        </Button>,
        <Button key="submit" type="primary" onClick={handleSubmit}>
          {student ? '수정' : '등록'}
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="이름"
          rules={[{ required: true, message: '이름을 입력하세요' }]}
        >
          <Input
            ref={nameInputRef}
            placeholder="예: 김철수"
            onKeyDown={(e) => handleKeyDown(e, phoneInputRef)}
          />
        </Form.Item>

        <Form.Item
          name="phone"
          label="전화번호"
          rules={[{ required: true, message: '전화번호를 입력하세요' }]}
        >
          <Input
            ref={phoneInputRef}
            placeholder="01035567586 → 010-3556-7586"
            onChange={handlePhoneChange}
            maxLength={13}
            onKeyDown={(e) => handleKeyDown(e, emailInputRef)}
          />
        </Form.Item>

        <Form.Item
          name="email"
          label="이메일 (선택)"
          rules={[
            { type: 'email', message: '올바른 이메일 형식이 아닙니다' },
          ]}
        >
          <Input
            ref={emailInputRef}
            placeholder="예: example@email.com"
            onKeyDown={(e) => handleKeyDown(e, birthDateInputRef)}
          />
        </Form.Item>

        <Form.Item name="birthDate" label="생년월일">
          <Input
            ref={birthDateInputRef}
            placeholder="630201 → 1963-02-01"
            maxLength={6}
          />
        </Form.Item>
        <Space style={{ marginTop: -16, marginBottom: 24 }}>
          <Button
            size="small"
            onClick={() => form.setFieldsValue({ birthDate: dayjs().subtract(10, 'year').format('YYMMDD') })}
          >
            10년 전
          </Button>
          <Button
            size="small"
            onClick={() => form.setFieldsValue({ birthDate: dayjs().subtract(20, 'year').format('YYMMDD') })}
          >
            20년 전
          </Button>
          <Button
            size="small"
            onClick={() => form.setFieldsValue({ birthDate: dayjs().subtract(30, 'year').format('YYMMDD') })}
          >
            30년 전
          </Button>
          <Button
            size="small"
            onClick={() => form.setFieldsValue({ birthDate: dayjs().subtract(40, 'year').format('YYMMDD') })}
          >
            40년 전
          </Button>
        </Space>

        {!student && (
          <>
            <Form.Item name="courseId" label="수강 강좌 (선택)">
              <Select
                placeholder="강좌를 선택하세요"
                allowClear
                showSearch
                optionFilterProp="children"
              >
                {availableCourses.map((course) => (
                  <Option key={course.id} value={course.id}>
                    {course.name} (₩{course.fee.toLocaleString()})
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) => prevValues.courseId !== currentValues.courseId}
            >
              {({ getFieldValue }) =>
                getFieldValue('courseId') ? (
                  <Form.Item name="paidAmount" label="납부 금액" initialValue={0}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Space wrap>
                        <Button size="small" onClick={() => form.setFieldsValue({ paidAmount: 20000 })}>
                          2만원
                        </Button>
                        <Button size="small" onClick={() => form.setFieldsValue({ paidAmount: 30000 })}>
                          3만원
                        </Button>
                        <Button size="small" onClick={() => form.setFieldsValue({ paidAmount: 40000 })}>
                          4만원
                        </Button>
                        <Button size="small" onClick={() => form.setFieldsValue({ paidAmount: 60000 })}>
                          6만원
                        </Button>
                        <Button size="small" onClick={() => form.setFieldsValue({ paidAmount: 90000 })}>
                          9만원
                        </Button>
                      </Space>
                    </Space>
                  </Form.Item>
                ) : null
              }
            </Form.Item>
          </>
        )}

        <Form.Item name="address" label="주소">
          <Input placeholder="예: 서울시 강남구" />
        </Form.Item>

        <Form.Item name="notes" label="메모">
          <TextArea rows={3} placeholder="추가 정보를 입력하세요" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default StudentForm;
