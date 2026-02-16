import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Form, Input, Button, message, Row, Col, Select, InputNumber, Space, Tag, theme } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { Student, StudentFormData } from '../../types';
import { useStudentStore } from '../../stores/studentStore';
import { useCourseStore } from '../../stores/courseStore';
import { useEnrollmentStore } from '../../stores/enrollmentStore';

const { TextArea } = Input;
const { Option } = Select;
const { useToken } = theme;

interface CoursePayment {
  courseId: string;
  paidAmount: number;
  isExempt: boolean;
}

interface StudentFormProps {
  visible: boolean;
  onClose: () => void;
  student?: Student | null;
}

const StudentForm: React.FC<StudentFormProps> = ({ visible, onClose, student }) => {
  const { token } = useToken();
  const [form] = Form.useForm();
  const { addStudent, updateStudent } = useStudentStore();
  const { courses, getCourseById } = useCourseStore();
  const { enrollments, addEnrollment, deleteEnrollment, updateEnrollment } = useEnrollmentStore();
  const nameInputRef = useRef<any>(null);
  const phoneInputRef = useRef<any>(null);
  const emailInputRef = useRef<any>(null);
  const birthDateInputRef = useRef<any>(null);
  const addressInputRef = useRef<any>(null);
  const notesInputRef = useRef<any>(null);

  const [coursePayments, setCoursePayments] = useState<CoursePayment[]>([]);

  useEffect(() => {
    if (visible && student) {
      // 수정 모드: 기존 수강 강좌 및 납부 정보 가져오기
      const studentEnrollments = enrollments.filter(e => e.studentId === student.id);
      const payments = studentEnrollments.map(e => ({
        courseId: e.courseId,
        paidAmount: e.paidAmount,
        isExempt: e.paymentStatus === 'exempt',
      }));
      setCoursePayments(payments);
      form.setFieldsValue({
        ...student,
        birthDate: student.birthDate ? student.birthDate.replace(/-/g, '').slice(2) : undefined,
      });
    } else if (visible) {
      form.resetFields();
      setCoursePayments([]);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [visible, student, form, enrollments]);

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

  const handleAddCourse = (courseId: string) => {
    const course = getCourseById(courseId);
    if (course && !coursePayments.find(cp => cp.courseId === courseId)) {
      setCoursePayments([...coursePayments, { courseId, paidAmount: course.fee, isExempt: false }]);
    }
  };

  const handleRemoveCourse = useCallback((courseId: string) => {
    setCoursePayments(prev => prev.filter(cp => cp.courseId !== courseId));
  }, []);

  const handlePaymentChange = useCallback((courseId: string, paidAmount: number) => {
    setCoursePayments(prev => prev.map(cp =>
      cp.courseId === courseId ? { ...cp, paidAmount, isExempt: false } : cp
    ));
  }, []);

  const handleExemptToggle = useCallback((courseId: string) => {
    setCoursePayments(prev => prev.map(cp =>
      cp.courseId === courseId ? { ...cp, isExempt: !cp.isExempt, paidAmount: 0 } : cp
    ));
  }, []);

  const getPaymentStatus = (cp: CoursePayment, fee: number): 'pending' | 'partial' | 'completed' | 'exempt' => {
    if (cp.isExempt) return 'exempt';
    if (cp.paidAmount === 0) return 'pending';
    if (cp.paidAmount < fee) return 'partial';
    return 'completed';
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
        // 수정 모드
        updateStudent(student.id, formData);

        // 기존 enrollment와 비교하여 추가/삭제/수정
        const existingEnrollments = enrollments.filter(e => e.studentId === student.id);
        const newCourseIds = coursePayments.map(cp => cp.courseId);

        // 삭제할 enrollment
        existingEnrollments
          .filter(e => !newCourseIds.includes(e.courseId))
          .forEach(e => deleteEnrollment(e.id));

        // 추가 또는 수정할 enrollment
        coursePayments.forEach(cp => {
          const course = getCourseById(cp.courseId);
          if (!course) return;

          const existing = existingEnrollments.find(e => e.courseId === cp.courseId);
          const newStatus = getPaymentStatus(cp, course.fee);
          if (existing) {
            // 기존 enrollment 수정 (납부금액 또는 면제 상태가 변경된 경우)
            const existingIsExempt = existing.paymentStatus === 'exempt';
            if (existing.paidAmount !== cp.paidAmount || existingIsExempt !== cp.isExempt) {
              updateEnrollment(existing.id, {
                paidAmount: cp.isExempt ? 0 : cp.paidAmount,
                remainingAmount: cp.isExempt ? 0 : course.fee - cp.paidAmount,
                paymentStatus: newStatus,
              });
            }
          } else {
            // 새 enrollment 추가
            addEnrollment({
              studentId: student.id,
              courseId: cp.courseId,
              paidAmount: cp.isExempt ? 0 : cp.paidAmount,
              paymentStatus: newStatus,
            });
          }
        });

        message.success('수강생 정보가 수정되었습니다.');
        form.resetFields();
        setCoursePayments([]);
        onClose();
      } else {
        // 신규 등록
        const newStudent = addStudent(formData as StudentFormData);

        // 선택된 강좌에 enrollment 생성
        if (coursePayments.length > 0 && newStudent) {
          coursePayments.forEach(cp => {
            const course = getCourseById(cp.courseId);
            if (course) {
              addEnrollment({
                studentId: newStudent.id,
                courseId: cp.courseId,
                paidAmount: cp.isExempt ? 0 : cp.paidAmount,
                paymentStatus: getPaymentStatus(cp, course.fee),
              });
            }
          });
        }

        message.success('수강생이 등록되었습니다.');
        form.resetFields();
        setCoursePayments([]);
        setTimeout(() => {
          nameInputRef.current?.focus();
        }, 100);
      }
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  // 선택 가능한 강좌 (이미 선택된 것 제외)
  const availableCourses = courses.filter(course => {
    const isSelected = coursePayments.some(cp => cp.courseId === course.id);
    if (isSelected) return false;

    const count = enrollments.filter(e => e.courseId === course.id).length;
    const isFull = count >= course.maxStudents;

    // 수정 모드일 때 현재 학생이 이미 등록된 강좌는 표시
    const isCurrentlyEnrolled = student
      ? enrollments.some(e => e.courseId === course.id && e.studentId === student.id)
      : false;

    return !isFull || isCurrentlyEnrolled;
  });

  return (
    <Modal
      title={student ? '수강생 정보 수정' : '수강생 등록'}
      open={visible}
      onCancel={onClose}
      width={600}
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
                onPressEnter={() => phoneInputRef.current?.focus()}
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
                onPressEnter={() => emailInputRef.current?.focus()}
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
                onPressEnter={() => birthDateInputRef.current?.focus()}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="birthDate" label="생년월일">
              <Input
                ref={birthDateInputRef}
                placeholder="630201"
                maxLength={6}
                onPressEnter={() => addressInputRef.current?.focus()}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="address" label="주소">
          <Input
            ref={addressInputRef}
            placeholder="예: 서울시 강남구"
            onPressEnter={() => notesInputRef.current?.focus()}
          />
        </Form.Item>

        <Form.Item label="강좌 신청">
          <Select
            placeholder="강좌를 선택하세요"
            onChange={handleAddCourse}
            value={undefined}
            showSearch
            optionFilterProp="children"
          >
            {availableCourses.map(course => {
              const count = enrollments.filter(e => e.courseId === course.id).length;
              return (
                <Option key={course.id} value={course.id}>
                  {course.name} (₩{course.fee.toLocaleString()}) - {count}/{course.maxStudents}명
                </Option>
              );
            })}
          </Select>
        </Form.Item>

        {coursePayments.length > 0 && (
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: token.colorBgLayout, borderRadius: token.borderRadius }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>선택된 강좌</div>
            {coursePayments.map(cp => {
              const course = getCourseById(cp.courseId);
              if (!course) return null;
              return (
                <div key={cp.courseId} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div>{course.name}</div>
                    {cp.isExempt ? (
                      <Tag color="purple">면제</Tag>
                    ) : (
                      <Tag color="blue">₩{course.fee.toLocaleString()}</Tag>
                    )}
                  </div>
                  <InputNumber
                    value={cp.paidAmount}
                    onChange={(value) => handlePaymentChange(cp.courseId, value || 0)}
                    min={0}
                    max={course.fee}
                    formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(value) => (Number(value?.replace(/₩\s?|(,*)/g, '')) || 0) as any}
                    style={{ width: 140 }}
                    disabled={cp.isExempt}
                  />
                  <Space size="small">
                    <Button size="small" onClick={() => handlePaymentChange(cp.courseId, course.fee)} disabled={cp.isExempt}>
                      완납
                    </Button>
                    <Button size="small" onClick={() => handlePaymentChange(cp.courseId, 0)} disabled={cp.isExempt}>
                      미납
                    </Button>
                    <Button
                      size="small"
                      type={cp.isExempt ? 'primary' : 'default'}
                      danger={cp.isExempt}
                      onClick={() => handleExemptToggle(cp.courseId)}
                    >
                      면제
                    </Button>
                  </Space>
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveCourse(cp.courseId)}
                  />
                </div>
              );
            })}
            <div style={{ marginTop: 8, textAlign: 'right', color: token.colorTextSecondary }}>
              총 납부: ₩{coursePayments.filter(cp => !cp.isExempt).reduce((sum, cp) => sum + cp.paidAmount, 0).toLocaleString()}
              {coursePayments.some(cp => cp.isExempt) && ` (면제 ${coursePayments.filter(cp => cp.isExempt).length}건)`}
            </div>
          </div>
        )}

        <Form.Item name="notes" label="메모">
          <TextArea
            ref={notesInputRef}
            rows={2}
            placeholder="추가 정보를 입력하세요"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default StudentForm;
