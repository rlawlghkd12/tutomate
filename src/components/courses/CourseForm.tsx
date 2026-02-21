import React, { useEffect, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Button,
  message,
  DatePicker,
  TimePicker,
  Checkbox,
  Divider,
  Space,
  Typography,
  Row,
  Col,
} from 'antd';
import type { Course, CourseFormData } from '../../types';
import { useCourseStore } from '../../stores/courseStore';
import { useLicenseStore } from '../../stores/licenseStore';
import dayjs from 'dayjs';

const { Text } = Typography;

interface CourseFormProps {
  visible: boolean;
  onClose: () => void;
  course?: Course | null;
}

const CourseForm: React.FC<CourseFormProps> = ({ visible, onClose, course }) => {
  const [form] = Form.useForm();
  const { addCourse, updateCourse, courses } = useCourseStore();
  const { getPlan, getLimit } = useLicenseStore();
  const [enableSchedule, setEnableSchedule] = useState(false);

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

    form.setFieldsValue({ instructorPhone: formattedValue });
  };

  useEffect(() => {
    if (visible && course) {
      // schedule이 있으면 필드 설정
      if (course.schedule) {
        setEnableSchedule(true);
        form.setFieldsValue({
          ...course,
          schedule_startDate: dayjs(course.schedule.startDate),
          schedule_daysOfWeek: course.schedule.daysOfWeek,
          schedule_startTime: dayjs(course.schedule.startTime, 'HH:mm'),
          schedule_endTime: dayjs(course.schedule.endTime, 'HH:mm'),
          schedule_totalSessions: course.schedule.totalSessions,
        });
      } else {
        form.setFieldsValue(course);
      }
    } else if (visible) {
      form.resetFields();
      setEnableSchedule(false);
    }
  }, [visible, course, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      // schedule 데이터 구성
      let courseData: any = {
        name: values.name,
        classroom: values.classroom,
        instructorName: values.instructorName,
        instructorPhone: values.instructorPhone,
        fee: values.fee,
        maxStudents: values.maxStudents,
      };

      if (enableSchedule && values.schedule_startDate) {
        courseData.schedule = {
          startDate: values.schedule_startDate.format('YYYY-MM-DD'),
          daysOfWeek: values.schedule_daysOfWeek || [],
          startTime: values.schedule_startTime.format('HH:mm'),
          endTime: values.schedule_endTime.format('HH:mm'),
          totalSessions: values.schedule_totalSessions || 0,
          holidays: [],
        };
      }

      if (course) {
        updateCourse(course.id, courseData);
        message.success('강좌가 수정되었습니다.');
      } else {
        // 체험판 강좌 수 제한 체크
        if (getPlan() === 'trial') {
          const maxCourses = getLimit('maxCourses');
          if (courses.length >= maxCourses) {
            message.warning(`체험판은 최대 ${maxCourses}개 강좌까지 생성 가능합니다. 설정에서 라이선스를 활성화하세요.`);
            return;
          }
        }
        addCourse(courseData as CourseFormData);
        message.success('강좌가 생성되었습니다.');
      }

      form.resetFields();
      setEnableSchedule(false);
      onClose();
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  return (
    <Modal
      title={course ? '강좌 수정' : '강좌 개설'}
      open={visible}
      onCancel={onClose}
      width={700}
      centered
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      footer={[
        <Button key="cancel" onClick={onClose}>
          취소
        </Button>,
        <Button key="submit" type="primary" onClick={handleSubmit}>
          {course ? '수정' : '생성'}
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="name"
              label="강좌 이름"
              rules={[{ required: true, message: '강좌 이름을 입력하세요' }]}
            >
              <Input placeholder="예: 요가 초급" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="classroom"
              label="강의실"
              rules={[{ required: true, message: '강의실을 입력하세요' }]}
            >
              <Input placeholder="예: A동 301호" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="instructorName"
              label="강사 이름"
              rules={[{ required: true, message: '강사 이름을 입력하세요' }]}
            >
              <Input placeholder="예: 홍길동" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="instructorPhone"
              label="강사 전화번호"
              rules={[{ required: true, message: '강사 전화번호를 입력하세요' }]}
            >
              <Input
                placeholder="01012341234"
                onChange={handlePhoneChange}
                maxLength={13}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="fee"
              label="수강료"
              rules={[{ required: true, message: '수강료를 입력하세요' }]}
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
          <Col span={12}>
            <Form.Item
              name="maxStudents"
              label="최대 인원"
              rules={[
                { required: true, message: '최대 인원을 입력하세요' },
                { type: 'number', min: 1, message: '최소 1명 이상이어야 합니다' },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={1}
                placeholder="20"
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Space wrap>
              <Button size="small" onClick={() => form.setFieldsValue({ fee: 20000 })}>2만원</Button>
              <Button size="small" onClick={() => form.setFieldsValue({ fee: 30000 })}>3만원</Button>
              <Button size="small" onClick={() => form.setFieldsValue({ fee: 50000 })}>5만원</Button>
            </Space>
          </Col>
          <Col span={12}>
            <Space wrap>
              <Button size="small" onClick={() => form.setFieldsValue({ maxStudents: 15 })}>15명</Button>
              <Button size="small" onClick={() => form.setFieldsValue({ maxStudents: 20 })}>20명</Button>
              <Button size="small" onClick={() => form.setFieldsValue({ maxStudents: 25 })}>25명</Button>
              <Button size="small" onClick={() => form.setFieldsValue({ maxStudents: 30 })}>30명</Button>
              <Button size="small" onClick={() => form.setFieldsValue({ maxStudents: 35 })}>35명</Button>
            </Space>
          </Col>
        </Row>

        {/* 강좌 일정 섹션 */}
        <Divider />
        <Checkbox
          checked={enableSchedule}
          onChange={(e) => setEnableSchedule(e.target.checked)}
          style={{ marginBottom: 16 }}
        >
          강좌 일정 설정
        </Checkbox>

        {enableSchedule && (
          <div style={{ marginTop: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {/* 시작일 */}
              <Form.Item
                name="schedule_startDate"
                label="시작일"
                rules={enableSchedule ? [{ required: true, message: '시작일을 선택하세요' }] : []}
                style={{ marginBottom: 0 }}
              >
                <DatePicker placeholder="시작일" style={{ width: '100%' }} />
              </Form.Item>

              {/* 수업 요일 */}
              <Form.Item
                name="schedule_daysOfWeek"
                label="수업 요일"
                rules={enableSchedule ? [{ required: true, message: '수업 요일을 선택하세요' }] : []}
              >
                <div>
                  <Checkbox.Group
                    options={[
                      { label: '일', value: 0 },
                      { label: '월', value: 1 },
                      { label: '화', value: 2 },
                      { label: '수', value: 3 },
                      { label: '목', value: 4 },
                      { label: '금', value: 5 },
                      { label: '토', value: 6 },
                    ]}
                  />
                  <Space style={{ marginTop: 8 }}>
                    <Button
                      size="small"
                      onClick={() => form.setFieldsValue({ schedule_daysOfWeek: [1, 2, 3, 4, 5] })}
                    >
                      주중
                    </Button>
                    <Button
                      size="small"
                      onClick={() => form.setFieldsValue({ schedule_daysOfWeek: [0, 6] })}
                    >
                      주말
                    </Button>
                    <Button
                      size="small"
                      onClick={() => form.setFieldsValue({ schedule_daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })}
                    >
                      전체
                    </Button>
                  </Space>
                </div>
              </Form.Item>

              {/* 수업 시간 */}
              <div>
                <Space style={{ width: '100%' }}>
                  <Form.Item
                    name="schedule_startTime"
                    label="시작 시간"
                    rules={enableSchedule ? [{ required: true, message: '시작 시간을 선택하세요' }] : []}
                    style={{ marginBottom: 0 }}
                  >
                    <TimePicker format="HH:mm" placeholder="09:00" />
                  </Form.Item>
                  <Form.Item
                    name="schedule_endTime"
                    label="종료 시간"
                    rules={enableSchedule ? [{ required: true, message: '종료 시간을 선택하세요' }] : []}
                    style={{ marginBottom: 0 }}
                  >
                    <TimePicker format="HH:mm" placeholder="12:00" />
                  </Form.Item>
                </Space>
                <Space style={{ marginTop: 8 }}>
                  <Button
                    size="small"
                    onClick={() => {
                      form.setFieldsValue({
                        schedule_startTime: dayjs('09:00', 'HH:mm'),
                        schedule_endTime: dayjs('12:00', 'HH:mm'),
                      });
                    }}
                  >
                    오전반 (9-12시)
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      form.setFieldsValue({
                        schedule_startTime: dayjs('13:00', 'HH:mm'),
                        schedule_endTime: dayjs('17:00', 'HH:mm'),
                      });
                    }}
                  >
                    오후반 (13-17시)
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      form.setFieldsValue({
                        schedule_startTime: dayjs('18:00', 'HH:mm'),
                        schedule_endTime: dayjs('21:00', 'HH:mm'),
                      });
                    }}
                  >
                    저녁반 (18-21시)
                  </Button>
                </Space>
              </div>

              {/* 총 회차 */}
              <Form.Item
                name="schedule_totalSessions"
                label="총 수업 회차"
                rules={enableSchedule ? [{ required: true, message: '총 회차를 입력하세요' }] : []}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={1}
                  placeholder="예: 12"
                  addonAfter="회"
                />
              </Form.Item>

              <Text type="secondary" style={{ fontSize: 12 }}>
                * 실제 수업 날짜는 시작일, 수업 요일, 총 회차를 기준으로 자동 생성됩니다.
              </Text>
            </Space>
          </div>
        )}
      </Form>
    </Modal>
  );
};

export default CourseForm;
