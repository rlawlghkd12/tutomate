import React, { useEffect } from 'react';
import { Modal, Form, Input, DatePicker, Button, message, Space } from 'antd';
import type { Student, StudentFormData } from '../../types';
import { useStudentStore } from '../../stores/studentStore';
import dayjs from 'dayjs';

const { TextArea } = Input;

interface StudentFormProps {
  visible: boolean;
  onClose: () => void;
  student?: Student | null;
}

const StudentForm: React.FC<StudentFormProps> = ({ visible, onClose, student }) => {
  const [form] = Form.useForm();
  const { addStudent, updateStudent } = useStudentStore();

  useEffect(() => {
    if (visible && student) {
      form.setFieldsValue({
        ...student,
        birthDate: student.birthDate ? dayjs(student.birthDate) : undefined,
      });
    } else if (visible) {
      form.resetFields();
    }
  }, [visible, student, form]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, ''); // 숫자만 추출
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

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const formData = {
        ...values,
        birthDate: values.birthDate ? values.birthDate.format('YYYY-MM-DD') : undefined,
      };

      if (student) {
        updateStudent(student.id, formData);
        message.success('수강생 정보가 수정되었습니다.');
      } else {
        addStudent(formData as StudentFormData);
        message.success('수강생이 등록되었습니다.');
      }

      form.resetFields();
      onClose();
    } catch (error) {
      console.error('Validation failed:', error);
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
          <Input placeholder="예: 김철수" />
        </Form.Item>

        <Form.Item
          name="phone"
          label="전화번호"
          rules={[{ required: true, message: '전화번호를 입력하세요' }]}
        >
          <Input
            placeholder="예: 010-1234-5678"
            onChange={handlePhoneChange}
            maxLength={13}
          />
        </Form.Item>

        <Form.Item
          name="email"
          label="이메일"
          rules={[
            { required: true, message: '이메일을 입력하세요' },
            { type: 'email', message: '올바른 이메일 형식이 아닙니다' },
          ]}
        >
          <Input placeholder="예: example@email.com" />
        </Form.Item>

        <Form.Item name="birthDate" label="생년월일">
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>
        <Space style={{ marginTop: -16, marginBottom: 24 }}>
          <Button
            size="small"
            onClick={() => form.setFieldsValue({ birthDate: dayjs().subtract(10, 'year') })}
          >
            10년 전
          </Button>
          <Button
            size="small"
            onClick={() => form.setFieldsValue({ birthDate: dayjs().subtract(20, 'year') })}
          >
            20년 전
          </Button>
          <Button
            size="small"
            onClick={() => form.setFieldsValue({ birthDate: dayjs().subtract(30, 'year') })}
          >
            30년 전
          </Button>
          <Button
            size="small"
            onClick={() => form.setFieldsValue({ birthDate: dayjs().subtract(40, 'year') })}
          >
            40년 전
          </Button>
        </Space>

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
