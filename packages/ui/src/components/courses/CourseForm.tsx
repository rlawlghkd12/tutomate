import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import dayjs from 'dayjs';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { Course, CourseFormData } from '@tutomate/core';
import { useCourseStore } from '@tutomate/core';
import { useLicenseStore } from '@tutomate/core';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Separator } from '../ui/separator';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '../ui/calendar';

const DAYS_OF_WEEK = [
  { label: '일', value: 0 },
  { label: '월', value: 1 },
  { label: '화', value: 2 },
  { label: '수', value: 3 },
  { label: '목', value: 4 },
  { label: '금', value: 5 },
  { label: '토', value: 6 },
];

const courseFormSchema = z.object({
  name: z.string().min(1, '강좌 이름을 입력하세요'),
  classroom: z.string().min(1, '강의실을 입력하세요'),
  instructorName: z.string().min(1, '강사 이름을 입력하세요'),
  instructorPhone: z.string().min(1, '강사 전화번호를 입력하세요'),
  fee: z.number().min(0, '수강료를 입력하세요'),
  maxStudents: z.number().min(1, '최소 1명 이상이어야 합니다'),
  schedule_startDate: z.date().optional(),
  schedule_endDate: z.date().optional(),
  schedule_daysOfWeek: z.array(z.number()),
  schedule_startTime: z.string().optional(),
  schedule_endTime: z.string().optional(),
  schedule_totalSessions: z.number().optional(),
});

type CourseFormValues = z.infer<typeof courseFormSchema>;

interface CourseFormProps {
  visible: boolean;
  onClose: () => void;
  course?: Course | null;
}

const formatPhone = (value: string) => {
  const v = value.replace(/[^0-9]/g, '');
  if (v.length <= 3) return v;
  if (v.length <= 7) return `${v.slice(0, 3)}-${v.slice(3)}`;
  if (v.length <= 11) return `${v.slice(0, 3)}-${v.slice(3, 7)}-${v.slice(7)}`;
  return `${v.slice(0, 3)}-${v.slice(3, 7)}-${v.slice(7, 11)}`;
};

const CourseForm: React.FC<CourseFormProps> = ({ visible: open, onClose, course }) => {
  const { addCourse, updateCourse, courses } = useCourseStore();
  const { getPlan, getLimit } = useLicenseStore();
  const [enableSchedule, setEnableSchedule] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

	const [submitting, setSubmitting] = useState(false);
  const form = useForm<CourseFormValues>({
    resolver: zodResolver(courseFormSchema),
    defaultValues: {
      name: '',
      classroom: '',
      instructorName: '',
      instructorPhone: '',
      fee: 30000,
      maxStudents: 20,
      schedule_daysOfWeek: [],
      schedule_startTime: '09:00',
      schedule_endTime: '12:00',
      schedule_totalSessions: 12,
    },
  });

  useEffect(() => {
    if (open && course) {
      if (course.schedule) {
        setEnableSchedule(true);
        form.reset({
          name: course.name,
          classroom: course.classroom,
          instructorName: course.instructorName,
          instructorPhone: course.instructorPhone,
          fee: course.fee,
          maxStudents: course.maxStudents,
          schedule_startDate: course.schedule.startDate ? dayjs(course.schedule.startDate).toDate() : undefined,
          schedule_endDate: course.schedule.endDate ? dayjs(course.schedule.endDate).toDate() : undefined,
          schedule_daysOfWeek: course.schedule.daysOfWeek,
          schedule_startTime: course.schedule.startTime?.slice(0, 5) ?? '09:00',
          schedule_endTime: course.schedule.endTime?.slice(0, 5) ?? '12:00',
          schedule_totalSessions: course.schedule.totalSessions ?? 12,
        });
      } else {
        form.reset({
          name: course.name,
          classroom: course.classroom,
          instructorName: course.instructorName,
          instructorPhone: course.instructorPhone,
          fee: course.fee,
          maxStudents: course.maxStudents,
          schedule_daysOfWeek: [],
        });
      }
    } else if (open) {
      form.reset({
        name: '',
        classroom: '',
        instructorName: '',
        instructorPhone: '',
        fee: 30000,
        maxStudents: 20,
        schedule_daysOfWeek: [],
        schedule_startTime: '09:00',
        schedule_endTime: '12:00',
        schedule_totalSessions: 12,
      });
      setEnableSchedule(false);
      setStep(1);
    }
  }, [open, course, form]);

  const onSubmit = async (values: CourseFormValues) => {
		if (submitting) return;
		setSubmitting(true);
		try {
    const courseData: CourseFormData = {
      name: values.name,
      classroom: values.classroom,
      instructorName: values.instructorName,
      instructorPhone: values.instructorPhone,
      fee: values.fee,
      maxStudents: values.maxStudents,
    };

    if (enableSchedule && values.schedule_startDate) {
      courseData.schedule = {
        startDate: dayjs(values.schedule_startDate).format('YYYY-MM-DD'),
        ...(values.schedule_endDate ? { endDate: dayjs(values.schedule_endDate).format('YYYY-MM-DD') } : {}),
        daysOfWeek: values.schedule_daysOfWeek || [],
        startTime: `${values.schedule_startTime}:00`,
        endTime: `${values.schedule_endTime}:00`,
        totalSessions: values.schedule_totalSessions || 0,
        holidays: [],
      };
    }

    try {
      if (course) {
        await updateCourse(course.id, courseData);
        toast.success('강좌가 수정되었습니다.');
      } else {
        if (getPlan() === 'trial') {
          const maxCourses = getLimit('maxCourses');
          if (courses.length >= maxCourses) {
            toast.warning(`체험판은 최대 ${maxCourses}개 강좌까지 생성 가능합니다. 설정에서 라이선스를 활성화하세요.`);
            return;
          }
        }
        await addCourse(courseData);
        toast.success('강좌가 생성되었습니다.');
      }

      form.reset();
      setEnableSchedule(false);
      onClose();
    } catch {
      toast.error('강좌 저장에 실패했습니다.');
    }
  } finally {
			setSubmitting(false);
		}
	};

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{course ? '강좌 수정' : '강좌 개설'}</DialogTitle>
        </DialogHeader>

        {/* 스텝 인디케이터 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>1</div>
          <span style={{ fontSize: 13, fontWeight: step === 1 ? 600 : 400, color: step === 1 ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>기본 정보</span>
          <div style={{ width: 30, height: 1, background: 'hsl(var(--border))' }} />
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: step === 2 ? 'hsl(var(--foreground))' : 'hsl(var(--border))', color: step === 2 ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>2</div>
          <span style={{ fontSize: 13, fontWeight: step === 2 ? 600 : 400, color: step === 2 ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>일정 설정</span>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {step === 1 && (<>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">강좌 이름</Label>
              <Input
                id="name"
                {...form.register('name')}
                placeholder="예: 요가 초급"
                className="text-base"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="classroom">강의실</Label>
              <Input
                id="classroom"
                {...form.register('classroom')}
                placeholder="예: A동 301호"
                className="text-base"
              />
              {form.formState.errors.classroom && (
                <p className="text-sm text-red-500">{form.formState.errors.classroom.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="instructorName">강사 이름</Label>
              <Input
                id="instructorName"
                {...form.register('instructorName')}
                placeholder="예: 홍길동"
                className="text-base"
              />
              {form.formState.errors.instructorName && (
                <p className="text-sm text-red-500">{form.formState.errors.instructorName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="instructorPhone">강사 전화번호</Label>
              <Input
                id="instructorPhone"
                {...form.register('instructorPhone')}
                placeholder="01012341234"
                maxLength={13}
                onChange={(e) => {
                  form.setValue('instructorPhone', formatPhone(e.target.value));
                }}
                className="text-base"
              />
              {form.formState.errors.instructorPhone && (
                <p className="text-sm text-red-500">{form.formState.errors.instructorPhone.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fee">수강료</Label>
              <Controller
                control={form.control}
                name="fee"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Input
                      id="fee"
                      type="number"
                      value={field.value}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      placeholder="30000"
                      className="text-base"
                    />
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => form.setValue('fee', 20000)}>2만원</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => form.setValue('fee', 30000)}>3만원</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => form.setValue('fee', 50000)}>5만원</Button>
                    </div>
                  </div>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxStudents">최대 인원</Label>
              <Controller
                control={form.control}
                name="maxStudents"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Input
                      id="maxStudents"
                      type="number"
                      value={field.value}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      placeholder="20"
                      className="text-base"
                      min={1}
                    />
                    <div className="flex flex-wrap gap-1">
                      {[15, 20, 25, 30, 35].map((n) => (
                        <Button key={n} type="button" variant="outline" size="sm" onClick={() => form.setValue('maxStudents', n)}>{n}명</Button>
                      ))}
                    </div>
                  </div>
                )}
              />
            </div>
          </div>

          </>)}

          {step === 2 && (<>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 📅 기간 */}
              <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📅</span> 기간
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Controller control={form.control} name="schedule_startDate"
                    render={({ field }) => (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" style={{ flex: 1, justifyContent: 'flex-start', fontSize: 14, fontWeight: 400 }}>
                            <CalendarIcon style={{ width: 16, height: 16, marginRight: 8 }} />
                            {field.value ? format(field.value, 'PPP') : '시작일 선택'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} locale={ko} initialFocus />
                        </PopoverContent>
                      </Popover>
                    )}
                  />
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>~</span>
                  <Controller control={form.control} name="schedule_endDate"
                    render={({ field }) => (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" style={{ flex: 1, justifyContent: 'flex-start', fontSize: 14, fontWeight: 400 }}>
                            <CalendarIcon style={{ width: 16, height: 16, marginRight: 8 }} />
                            {field.value ? format(field.value, 'PPP') : '종료일 선택'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} locale={ko} initialFocus />
                        </PopoverContent>
                      </Popover>
                    )}
                  />
                </div>
              </div>

              {/* 📆 요일 */}
              <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📆</span> 수업 요일
                </div>
                <Controller control={form.control} name="schedule_daysOfWeek"
                  render={({ field }) => (
                    <div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                        {DAYS_OF_WEEK.map((day) => {
                          const isOn = field.value?.includes(day.value);
                          return (
                            <button key={day.value} type="button"
                              onClick={() => {
                                const newVal = isOn
                                  ? field.value.filter((v: number) => v !== day.value)
                                  : [...field.value, day.value];
                                field.onChange(newVal);
                              }}
                              style={{
                                width: 44, height: 44, borderRadius: 10,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 15, fontWeight: 500, cursor: 'pointer',
                                border: isOn ? '1.5px solid hsl(var(--foreground))' : '1.5px solid hsl(var(--border))',
                                background: isOn ? 'hsl(var(--foreground))' : 'transparent',
                                color: isOn ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))',
                                transition: 'all 0.15s',
                              }}
                            >
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button type="button" variant="outline" size="sm" onClick={() => field.onChange([1, 2, 3, 4, 5])}>주중</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => field.onChange([0, 6])}>주말</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => field.onChange([1, 3, 5])}>월수금</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => field.onChange([2, 4])}>화목</Button>
                      </div>
                    </div>
                  )}
                />
              </div>

              {/* 🕐 시간 */}
              <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🕐</span> 수업 시간
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {[
                    { label: '오전반', sub: '9:00~12:00', start: '09:00', end: '12:00' },
                    { label: '오후반', sub: '13:00~17:00', start: '13:00', end: '17:00' },
                    { label: '저녁반', sub: '18:00~21:00', start: '18:00', end: '21:00' },
                  ].map((preset) => {
                    const isActive = form.watch('schedule_startTime') === preset.start && form.watch('schedule_endTime') === preset.end;
                    return (
                      <button key={preset.label} type="button"
                        onClick={() => { form.setValue('schedule_startTime', preset.start); form.setValue('schedule_endTime', preset.end); }}
                        style={{
                          flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                          textAlign: 'center', transition: 'all 0.15s',
                          border: isActive ? '1.5px solid hsl(var(--foreground))' : '1.5px solid hsl(var(--border))',
                          background: isActive ? 'hsl(var(--foreground))' : 'transparent',
                          color: isActive ? 'hsl(var(--background))' : 'hsl(var(--foreground))',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{preset.label}</div>
                        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{preset.sub}</div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Controller control={form.control} name="schedule_startTime"
                    render={({ field }) => (
                      <input type="time" value={field.value || '09:00'} onChange={(e) => field.onChange(e.target.value)}
                        style={{ flex: 1, border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '10px', fontSize: 15, textAlign: 'center', background: 'transparent', color: 'hsl(var(--foreground))' }} />
                    )} />
                  <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 16 }}>~</span>
                  <Controller control={form.control} name="schedule_endTime"
                    render={({ field }) => (
                      <input type="time" value={field.value || '12:00'} onChange={(e) => field.onChange(e.target.value)}
                        style={{ flex: 1, border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '10px', fontSize: 15, textAlign: 'center', background: 'transparent', color: 'hsl(var(--foreground))' }} />
                    )} />
                </div>
              </div>

              {/* 총 회차 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Label htmlFor="schedule_totalSessions" style={{ whiteSpace: 'nowrap' }}>총 수업 회차</Label>
                <Controller control={form.control} name="schedule_totalSessions"
                  render={({ field }) => (
                    <Input id="schedule_totalSessions" type="number" value={field.value ?? ''} onChange={(e) => field.onChange(Number(e.target.value))} placeholder="12" min={1} style={{ width: 100, fontSize: 15 }} />
                  )} />
                <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>회</span>
              </div>
            </div>
          </>)}

          <DialogFooter style={{ marginTop: 8 }}>
            {step === 1 ? (
              <>
                <Button type="button" variant="outline" onClick={onClose} style={{ fontSize: 14, padding: '10px 24px' }}>
                  취소
                </Button>
                <Button type="button" onClick={() => setStep(2)} style={{ fontSize: 14, padding: '10px 24px' }}>
                  다음
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setStep(1)} style={{ fontSize: 14, padding: '10px 24px' }}>
                  이전
                </Button>
                <Button type="submit" disabled={submitting} style={{ fontSize: 14, padding: '10px 24px' }}>
                  {course ? '수정' : '생성'}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CourseForm;
