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

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

          <Separator />

          <div className="flex items-center space-x-2">
            <Checkbox
              id="enableSchedule"
              checked={enableSchedule}
              onCheckedChange={(v) => setEnableSchedule(!!v)}
            />
            <Label htmlFor="enableSchedule" className="text-base cursor-pointer">강좌 일정 설정</Label>
          </div>

          {enableSchedule && (
            <div className="space-y-4 border rounded-lg p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>시작일</Label>
                  <Controller
                    control={form.control}
                    name="schedule_startDate"
                    render={({ field }) => (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal text-base',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, 'PPP') : '시작일 선택'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            locale={ko}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>종료일 (선택)</Label>
                  <Controller
                    control={form.control}
                    name="schedule_endDate"
                    render={({ field }) => (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal text-base',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, 'PPP') : '종료일 선택'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            locale={ko}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>수업 요일</Label>
                <Controller
                  control={form.control}
                  name="schedule_daysOfWeek"
                  render={({ field }) => (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map((day) => (
                          <div key={day.value} className="flex items-center space-x-2">
                            <Checkbox
                              id={`day-${day.value}`}
                              checked={field.value?.includes(day.value)}
                              onCheckedChange={(checked) => {
                                const newVal = checked
                                  ? [...field.value, day.value]
                                  : field.value.filter((v) => v !== day.value);
                                field.onChange(newVal);
                              }}
                            />
                            <Label htmlFor={`day-${day.value}`} className="text-base cursor-pointer">{day.label}</Label>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => field.onChange([1, 2, 3, 4, 5])}>주중</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => field.onChange([0, 6])}>주말</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => field.onChange([0, 1, 2, 3, 4, 5, 6])}>전체</Button>
                      </div>
                    </div>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>수업 시간</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="schedule_startTime">시작 시간</Label>
                    <Controller
                      control={form.control}
                      name="schedule_startTime"
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger id="schedule_startTime" className="text-base">
                            <SelectValue placeholder="09:00" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                              Array.from({ length: 4 }, (_, m) => m * 15).map((m) => {
                                const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                return <SelectItem key={time} value={time}>{time}</SelectItem>;
                              })
                            )).flat()}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="schedule_endTime">종료 시간</Label>
                    <Controller
                      control={form.control}
                      name="schedule_endTime"
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger id="schedule_endTime" className="text-base">
                            <SelectValue placeholder="12:00" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                              Array.from({ length: 4 }, (_, m) => m * 15).map((m) => {
                                const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                return <SelectItem key={time} value={time}>{time}</SelectItem>;
                              })
                            )).flat()}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => { form.setValue('schedule_startTime', '09:00'); form.setValue('schedule_endTime', '12:00'); }}>오전반 (9-12시)</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => { form.setValue('schedule_startTime', '13:00'); form.setValue('schedule_endTime', '17:00'); }}>오후반 (13-17시)</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => { form.setValue('schedule_startTime', '18:00'); form.setValue('schedule_endTime', '21:00'); }}>저녁반 (18-21시)</Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule_totalSessions">총 수업 회차</Label>
                <Controller
                  control={form.control}
                  name="schedule_totalSessions"
                  render={({ field }) => (
                    <Input
                      id="schedule_totalSessions"
                      type="number"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      placeholder="예: 12"
                      className="text-base"
                      min={1}
                    />
                  )}
                />
              </div>

              <p className="text-sm text-muted-foreground">
                * 실제 수업 날짜는 시작일, 수업 요일, 총 회차를 기준으로 자동 생성됩니다.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="text-base px-6 py-3">
              취소
            </Button>
            <Button type="submit" className="text-base px-6 py-3">{course ? '수정' : '생성'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CourseForm;
