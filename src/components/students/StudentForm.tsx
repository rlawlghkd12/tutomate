import React, { useEffect, useRef } from 'react';
import { Modal, Form, Input, Button, message, Row, Col } from 'antd';
import type { Student, StudentFormData } from '../../types';
import { useStudentStore } from '../../stores/studentStore';

const { TextArea } = Input;

interface StudentFormProps {
  visible: boolean;
  onClose: () => void;
  student?: Student | null;
}

const StudentForm: React.FC<StudentFormProps> = ({ visible, onClose, student }) => {
  const [form] = Form.useForm();
  const { addStudent, updateStudent } = useStudentStore();
  const nameInputRef = useRef<any>(null);
  const phoneInputRef = useRef<any>(null);
  const emailInputRef = useRef<any>(null);
  const birthDateInputRef = useRef<any>(null);

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
        addStudent(formData as StudentFormData);
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
        <Row gutter={16}>
          <Col span={12}>
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
          </Col>
          <Col span={12}>
            <Form.Item
              name="phone"
              label="전화번호"
              rules={[{ required: true, message: '전화번호를 입력하세요' }]}
            >
              <Input
                ref={phoneInputRef}
                placeholder="01012341234"
                onChange={handlePhoneChange}
                maxLength={13}
                onKeyDown={(e) => handleKeyDown(e, emailInputRef)}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="email"
              label="이메일"
              rules={[
                { type: 'email', message: '올바른 이메일 형식이 아닙니다' },
              ]}
            >
              <Input
                ref={emailInputRef}
                placeholder="example@email.com"
                onKeyDown={(e) => handleKeyDown(e, birthDateInputRef)}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="birthDate" label="생년월일">
              <Input
                ref={birthDateInputRef}
                placeholder="630201"
                maxLength={6}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="address" label="주소">
          <Input placeholder="예: 서울시 강남구" />
        </Form.Item>

        <Form.Item name="notes" label="메모">
          <TextArea rows={2} placeholder="추가 정보를 입력하세요" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default StudentForm;
