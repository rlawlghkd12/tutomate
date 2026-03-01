import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Form, Input, Button, message, Row, Col, Select, InputNumber, Tag, AutoComplete, Alert, Radio, theme } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { Student, StudentFormData, PaymentMethod } from '../../types';
import { useStudentStore } from '../../stores/studentStore';
import { useCourseStore } from '../../stores/courseStore';
import { useEnrollmentStore } from '../../stores/enrollmentStore';
import { useLicenseStore } from '../../stores/licenseStore';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;
const { useToken } = theme;

interface CoursePayment {
  courseId: string;
  paidAmount: number;
  isExempt: boolean;
  paymentMethod?: PaymentMethod;
  discountAmount: number;
}

interface StudentFormProps {
  visible: boolean;
  onClose: () => void;
  student?: Student | null;
}

const StudentForm: React.FC<StudentFormProps> = ({ visible, onClose, student }) => {
  const { token } = useToken();
  const [form] = Form.useForm();
  const { addStudent, updateStudent, students } = useStudentStore();
  const { courses, getCourseById } = useCourseStore();
  const { enrollments, addEnrollment, deleteEnrollment, updateEnrollment } = useEnrollmentStore();
  const { getPlan, getLimit } = useLicenseStore();
  const nameInputRef = useRef<any>(null);
  const phoneInputRef = useRef<any>(null);
  const birthDateInputRef = useRef<any>(null);
  const addressInputRef = useRef<any>(null);
  const notesInputRef = useRef<any>(null);

  const [coursePayments, setCoursePayments] = useState<CoursePayment[]>([]);
  const [courseSelectKey, setCourseSelectKey] = useState(0);
  const [nameSearch, setNameSearch] = useState('');
  const [selectedExistingStudent, setSelectedExistingStudent] = useState<Student | null>(null);
  const [savedCoursePayments, setSavedCoursePayments] = useState<CoursePayment[]>([]);

  // 현재 편집 중인 수강생 (props로 받은 것 또는 자동완성으로 선택한 것)
  const editingStudent = student || selectedExistingStudent;

  useEffect(() => {
    if (visible && student) {
      // 수정 모드: 기존 수강 강좌 및 납부 정보 가져오기
      const studentEnrollments = enrollments.filter(e => e.studentId === student.id);
      const payments = studentEnrollments.map(e => ({
        courseId: e.courseId,
        paidAmount: e.paidAmount,
        isExempt: e.paymentStatus === 'exempt',
        paymentMethod: e.paymentMethod,
        discountAmount: e.discountAmount ?? 0,
      }));
      setCoursePayments(payments);
      setSelectedExistingStudent(null);
      setNameSearch('');
      form.setFieldsValue({
        ...student,
        birthDate: student.birthDate ? student.birthDate.replace(/-/g, '').slice(2) : undefined,
      });
    } else if (visible) {
      form.resetFields();
      setCoursePayments([]);
      setSelectedExistingStudent(null);
      setNameSearch('');
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [visible, student, form, enrollments]);

  // 이름 자동완성 옵션
  const nameOptions = useMemo(() => {
    if (student || !nameSearch || nameSearch.length < 1) return [];
    const search = nameSearch.toLowerCase();
    return students
      .filter(s => s.name.toLowerCase().includes(search))
      .slice(0, 8)
      .map(s => ({
        value: s.name,
        key: s.id,
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{s.name}</span>
            <span style={{ color: token.colorTextSecondary }}>{s.phone}</span>
          </div>
        ),
      }));
  }, [students, nameSearch, student, token]);

  // 기존 수강생 선택 시
  const handleNameSelect = (_value: string, option: { key?: string }) => {
    const existing = students.find(s => s.id === option.key);
    if (!existing) return;

    setSelectedExistingStudent(existing);
    setSavedCoursePayments(coursePayments);

    // 폼에 기존 정보 채우기
    form.setFieldsValue({
      name: existing.name,
      phone: existing.phone,
      birthDate: existing.birthDate ? existing.birthDate.replace(/-/g, '').slice(2) : undefined,
      address: existing.address || '',
      notes: existing.notes || '',
    });

    // 기존 수강 정보 로드
    const studentEnrollments = enrollments.filter(e => e.studentId === existing.id);
    setCoursePayments(studentEnrollments.map(e => ({
      courseId: e.courseId,
      paidAmount: e.paidAmount,
      isExempt: e.paymentStatus === 'exempt',
      paymentMethod: e.paymentMethod,
      discountAmount: e.discountAmount ?? 0,
    })));

    message.info(`기존 수강생 "${existing.name}"님의 정보를 불러왔습니다.`);
    phoneInputRef.current?.focus();
  };

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
      setCoursePayments([...coursePayments, { courseId, paidAmount: course.fee, isExempt: false, discountAmount: 0 }]);
    }
    setCourseSelectKey(k => k + 1);
  };

  const handleRemoveCourse = useCallback((courseId: string) => {
    setCoursePayments(prev => prev.filter(cp => cp.courseId !== courseId));
    setCourseSelectKey(k => k + 1);
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

  const handlePaymentMethodChange = useCallback((courseId: string, method: PaymentMethod) => {
    setCoursePayments(prev => prev.map(cp =>
      cp.courseId === courseId ? { ...cp, paymentMethod: method } : cp
    ));
  }, []);

  const handleDiscountChange = useCallback((courseId: string, discount: number) => {
    setCoursePayments(prev => prev.map(cp => {
      if (cp.courseId !== courseId) return cp;
      return { ...cp, discountAmount: discount };
    }));
  }, []);

  const getPaymentStatus = (cp: CoursePayment, fee: number): 'pending' | 'partial' | 'completed' | 'exempt' => {
    if (cp.isExempt) return 'exempt';
    const effectiveFee = fee - (cp.discountAmount || 0);
    if (cp.paidAmount === 0) return 'pending';
    if (cp.paidAmount < effectiveFee) return 'partial';
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

      if (editingStudent) {
        // 수정 모드 (props 또는 자동완성으로 선택한 기존 수강생)
        await updateStudent(editingStudent.id, formData);

        const existingEnrollments = enrollments.filter(e => e.studentId === editingStudent.id);
        const newCourseIds = coursePayments.map(cp => cp.courseId);

        // 삭제할 enrollment
        for (const e of existingEnrollments.filter(e => !newCourseIds.includes(e.courseId))) {
          await deleteEnrollment(e.id);
        }

        // 추가 또는 수정할 enrollment
        for (const cp of coursePayments) {
          const course = getCourseById(cp.courseId);
          if (!course) continue;

          const existing = existingEnrollments.find(e => e.courseId === cp.courseId);
          const newStatus = getPaymentStatus(cp, course.fee);
          const effectiveFee = course.fee - (cp.discountAmount || 0);
          if (existing) {
            const existingIsExempt = existing.paymentStatus === 'exempt';
            if (existing.paidAmount !== cp.paidAmount || existingIsExempt !== cp.isExempt ||
                existing.paymentMethod !== cp.paymentMethod || (existing.discountAmount ?? 0) !== cp.discountAmount) {
              const hasPaid = !cp.isExempt && cp.paidAmount > 0;
              await updateEnrollment(existing.id, {
                paidAmount: cp.isExempt ? 0 : cp.paidAmount,
                remainingAmount: cp.isExempt ? 0 : effectiveFee - cp.paidAmount,
                paymentStatus: newStatus,
                paidAt: hasPaid ? dayjs().format('YYYY-MM-DD') : undefined,
                paymentMethod: cp.paymentMethod,
                discountAmount: cp.discountAmount,
              });
            }
          } else {
            const hasPaidNew = !cp.isExempt && cp.paidAmount > 0;
            await addEnrollment({
              studentId: editingStudent.id,
              courseId: cp.courseId,
              paidAmount: cp.isExempt ? 0 : cp.paidAmount,
              paymentStatus: newStatus,
              paidAt: hasPaidNew ? dayjs().format('YYYY-MM-DD') : undefined,
              paymentMethod: cp.paymentMethod,
              discountAmount: cp.discountAmount,
            });
          }
        }

        message.success('수강생 정보가 수정되었습니다.');
        form.resetFields();
        setCoursePayments([]);
        setSelectedExistingStudent(null);
        setNameSearch('');
        onClose();
      } else {
        // 신규 등록 — 동일 이름+전화번호 중복 체크
        const duplicate = students.find(
          s => s.name === values.name && s.phone === values.phone
        );
        if (duplicate) {
          message.warning('동일한 이름과 전화번호의 수강생이 이미 있습니다. 위 목록에서 선택해주세요.');
          return;
        }

        const newStudent = await addStudent(formData as StudentFormData);

        if (coursePayments.length > 0 && newStudent) {
          for (const cp of coursePayments) {
            const course = getCourseById(cp.courseId);
            if (course) {
              const hasPaidInit = !cp.isExempt && cp.paidAmount > 0;
              await addEnrollment({
                studentId: newStudent.id,
                courseId: cp.courseId,
                paidAmount: cp.isExempt ? 0 : cp.paidAmount,
                paymentStatus: getPaymentStatus(cp, course.fee),
                paidAt: hasPaidInit ? dayjs().format('YYYY-MM-DD') : undefined,
                paymentMethod: cp.paymentMethod,
                discountAmount: cp.discountAmount,
              });
            }
          }
        }

        message.success('수강생이 등록되었습니다.');
        form.resetFields();
        setCoursePayments([]);
        setSelectedExistingStudent(null);
        setNameSearch('');
        setTimeout(() => {
          nameInputRef.current?.focus();
        }, 100);
      }
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  // 강좌 상태 확인 함수
  const getCourseStatus = (courseId: string) => {
    const isSelected = coursePayments.some(cp => cp.courseId === courseId);
    const count = enrollments.filter(e => e.courseId === courseId).length;
    const course = getCourseById(courseId);
    if (!course) return { isDisabled: true, label: '' };

    const maxStudentsLimit = getPlan() === 'trial' ? getLimit('maxStudentsPerCourse') : course.maxStudents;
    const effectiveMax = Math.min(course.maxStudents, maxStudentsLimit);
    const isFull = count >= effectiveMax;

    return {
      isSelected,
      isFull: isFull && !isSelected,
      isDisabled: isSelected || isFull,
      count,
    };
  };

  return (
    <Modal
      title={editingStudent ? '수강생 정보 수정' : '수강생 등록'}
      open={visible}
      onCancel={onClose}
      width={640}
      style={{ top: 40, paddingBottom: 40 }}
      footer={[
        <Button key="cancel" onClick={onClose}>
          취소
        </Button>,
        <Button key="submit" type="primary" onClick={handleSubmit}>
          {editingStudent ? '수정' : '등록'}
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        {selectedExistingStudent && (
          <Alert
            message={`기존 수강생 "${selectedExistingStudent.name}" (${selectedExistingStudent.phone})의 정보를 수정합니다.`}
            type="info"
            showIcon
            closable
            onClose={() => {
              setSelectedExistingStudent(null);
              setCoursePayments(savedCoursePayments);
              setSavedCoursePayments([]);
              form.resetFields();
              setNameSearch('');
            }}
            style={{ marginBottom: 16 }}
          />
        )}

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="name"
              label="이름"
              rules={[{ required: true, message: '이름을 입력하세요' }]}
            >
              <AutoComplete
                options={nameOptions}
                onSearch={setNameSearch}
                onSelect={handleNameSelect}
              >
                <Input
                  ref={nameInputRef}
                  placeholder="예: 김철수"
                  onPressEnter={() => phoneInputRef.current?.focus()}
                />
              </AutoComplete>
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
                onPressEnter={() => birthDateInputRef.current?.focus()}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
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
            key={courseSelectKey}
            placeholder="강좌를 선택하세요"
            onChange={handleAddCourse}
            showSearch
            optionFilterProp="label"
          >
            {courses.map(course => {
              const status = getCourseStatus(course.id);
              const count = status.count ?? enrollments.filter(e => e.courseId === course.id).length;
              const label = `${course.name} (₩${course.fee.toLocaleString()}) - ${count}/${course.maxStudents}명`;
              return (
                <Option
                  key={course.id}
                  value={course.id}
                  disabled={status.isDisabled}
                  label={label}
                >
                  <span style={status.isSelected ? { textDecoration: 'line-through', color: token.colorTextQuaternary } : undefined}>
                    {label}
                    {status.isSelected && ' [선택됨]'}
                    {status.isFull && ' [정원 마감]'}
                  </span>
                </Option>
              );
            })}
          </Select>
        </Form.Item>

        {coursePayments.length > 0 && (
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: token.colorFillQuaternary, borderRadius: token.borderRadius }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>선택된 강좌</div>
            {coursePayments.map(cp => {
              const course = getCourseById(cp.courseId);
              if (!course) return null;
              const effectiveFee = course.fee - (cp.discountAmount || 0);
              return (
                <div key={cp.courseId} style={{ marginBottom: 12, padding: 10, backgroundColor: token.colorBgContainer, borderRadius: token.borderRadius, border: `1px solid ${token.colorBorderSecondary}` }}>
                  {/* 1행: 강좌명 + 금액 + 삭제 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{course.name}</span>
                      {cp.isExempt ? (
                        <Tag color="purple" style={{ marginLeft: 8 }}>면제</Tag>
                      ) : cp.discountAmount > 0 ? (
                        <>
                          <Tag color="blue" style={{ marginLeft: 8 }}>₩{effectiveFee.toLocaleString()}</Tag>
                          <span style={{ fontSize: 11, color: token.colorTextSecondary }}>(정가 ₩{course.fee.toLocaleString()})</span>
                        </>
                      ) : (
                        <Tag color="blue" style={{ marginLeft: 8 }}>₩{course.fee.toLocaleString()}</Tag>
                      )}
                    </div>
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleRemoveCourse(cp.courseId)} />
                  </div>

                  {/* 2행: 납부 금액 + 완납/미납 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: token.colorTextSecondary, minWidth: 32 }}>납부</span>
                    <InputNumber
                      value={cp.paidAmount}
                      onChange={(value) => handlePaymentChange(cp.courseId, value || 0)}
                      min={0}
                      max={effectiveFee}
                      size="small"
                      formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={(value) => (Number(value?.replace(/₩\s?|(,*)/g, '')) || 0) as any}
                      style={{ width: 130 }}
                      disabled={cp.isExempt}
                    />
                    <Button size="small" onClick={() => handlePaymentChange(cp.courseId, effectiveFee)} disabled={cp.isExempt}>완납</Button>
                    <Button size="small" onClick={() => handlePaymentChange(cp.courseId, 0)} disabled={cp.isExempt}>미납</Button>
                  </div>

                  {/* 3행: 할인 + 면제 + 납부방법 (통일된 레이아웃) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: token.colorTextSecondary, minWidth: 32 }}>할인</span>
                    <InputNumber
                      value={cp.discountAmount}
                      onChange={(value) => handleDiscountChange(cp.courseId, value || 0)}
                      min={0}
                      max={course.fee}
                      size="small"
                      formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={(value) => (Number(value?.replace(/₩\s?|(,*)/g, '')) || 0) as any}
                      style={{ width: 130 }}
                      disabled={cp.isExempt}
                    />
                    <Button
                      size="small"
                      type={cp.isExempt ? 'primary' : 'default'}
                      danger={cp.isExempt}
                      onClick={() => handleExemptToggle(cp.courseId)}
                    >
                      면제
                    </Button>
                    <div style={{ marginLeft: 'auto' }}>
                      <Radio.Group
                        size="small"
                        value={cp.paymentMethod}
                        onChange={(e) => handlePaymentMethodChange(cp.courseId, e.target.value)}
                        disabled={cp.isExempt}
                      >
                        <Radio.Button value="cash">현금</Radio.Button>
                        <Radio.Button value="card">카드</Radio.Button>
                        <Radio.Button value="transfer">이체</Radio.Button>
                      </Radio.Group>
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 8, textAlign: 'right', color: token.colorTextSecondary, fontSize: 13 }}>
              총 납부: ₩{coursePayments.filter(cp => !cp.isExempt).reduce((sum, cp) => sum + cp.paidAmount, 0).toLocaleString()}
              {coursePayments.some(cp => cp.discountAmount > 0) && ` (할인 ₩${coursePayments.reduce((sum, cp) => sum + (cp.discountAmount || 0), 0).toLocaleString()})`}
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
