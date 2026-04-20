import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Enrollment, PaymentMethod } from '@tutomate/core';
import { useEnrollmentStore, PaymentMethodEnum } from '@tutomate/core';
import dayjs from 'dayjs';
import { cn } from '../../lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';

interface PaymentFormProps {
  visible: boolean;
  onClose: () => void;
  enrollment: Enrollment | null;
  courseFee: number;
}

const PaymentForm: React.FC<PaymentFormProps> = ({
  visible,
  onClose,
  enrollment,
  courseFee,
}) => {
  const { updatePayment } = useEnrollmentStore();
  const [discountAmount, setDiscountAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const paymentSchema = z.object({
    paidAmount: z
      .number({ message: '납부 금액을 입력하세요' })
      .min(0)
      .max(courseFee - discountAmount, '수강료를 초과할 수 없습니다'),
    paidAt: z.date({ message: '납부일을 선택하세요' }),
    paymentMethod: z.enum(['transfer', 'card', 'cash'] as const, { message: '납부 방법을 선택하세요' }),
    discountAmount: z.number().min(0).max(courseFee).default(0),
  });

  type PaymentFormData = z.infer<typeof paymentSchema>;

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema) as any,
    defaultValues: {
      paidAmount: 0,
      paidAt: new Date(),
      paymentMethod: PaymentMethodEnum.TRANSFER,
      discountAmount: 0,
    },
  });

  const watchedPaidAmount = watch('paidAmount');

  useEffect(() => {
    if (visible && enrollment) {
      const discount = enrollment.discountAmount ?? 0;
      setDiscountAmount(discount);
      reset({
        paidAmount: enrollment.paidAmount,
        paidAt: enrollment.paidAt ? new Date(enrollment.paidAt) : new Date(),
        paymentMethod: enrollment.paymentMethod || PaymentMethodEnum.TRANSFER,
        discountAmount: discount,
      });
    }
  }, [visible, enrollment, reset]);

  const effectiveFee = courseFee - discountAmount;

  const onSubmit = async (values: PaymentFormData) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (!enrollment) {
        toast.error('수강 정보를 찾을 수 없습니다.');
        return;
      }

      const paidAt = values.paidAt
        ? dayjs(values.paidAt).format('YYYY-MM-DD')
        : undefined;
      await updatePayment(
        enrollment.id,
        values.paidAmount,
        courseFee,
        paidAt,
        false,
        values.paymentMethod as PaymentMethod,
        values.discountAmount ?? 0,
      );
      toast.success('납부 정보가 업데이트되었습니다.');
      reset();
      onClose();
    } catch (error) {
      console.error('Validation failed:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExempt = async () => {
    if (!enrollment) return;
    await updatePayment(enrollment.id, 0, courseFee, dayjs().format('YYYY-MM-DD'), true);
    toast.success('수강료가 면제 처리되었습니다.');
    reset();
    onClose();
  };

  const handleCancelExempt = async () => {
    if (!enrollment) return;
    await updatePayment(enrollment.id, 0, courseFee, undefined);
    toast.success('면제가 취소되었습니다.');
    reset();
    onClose();
  };

  if (!enrollment) {
    return null;
  }

  const isExempt = enrollment.paymentStatus === 'exempt';
  const currentPaidAmount = watchedPaidAmount ?? enrollment.paidAmount;
  const remainingAmount = effectiveFee - currentPaidAmount;

  return (
    <Dialog open={visible} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>납부 관리</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
        {/* 현재 상태 요약 */}
        <div className="rounded-xl border p-4">
          {isExempt ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">면제</Badge>
              <span>이 수강은 수강료가 면제되었습니다.</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">수강료</div>
                <div className="text-sm font-semibold mt-0.5">₩{courseFee.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">납부 금액</div>
                <div className="text-sm font-semibold mt-0.5 text-success">₩{enrollment.paidAmount.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">잔여 금액</div>
                <div className={cn('text-sm font-semibold mt-0.5', enrollment.remainingAmount > 0 ? 'text-error' : 'text-success')}>
                  ₩{enrollment.remainingAmount.toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* 할인 */}
          <div className="space-y-2">
            <Label htmlFor="discountAmount">할인 금액</Label>
            <Controller
              name="discountAmount"
              control={control}
              render={({ field }) => (
                <Input
                  id="discountAmount"
                  type="number"
                  step={5000}
                  min={0}
                  max={courseFee}
                  placeholder="0원이면 할인 없음"
                  disabled={isExempt}
                  value={field.value ?? ''}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    field.onChange(val);
                    setDiscountAmount(val);
                  }}
                />
              )}
            />
          </div>
          {discountAmount > 0 && (
            <p className="-mt-2 text-xs text-success">
              할인 적용 수강료: ₩{effectiveFee.toLocaleString()} (₩{courseFee.toLocaleString()} - ₩{discountAmount.toLocaleString()})
            </p>
          )}

          <Separator className="my-2" />

          {/* 납부 금액 + 납부일 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paidAmount">납부 금액</Label>
              <Controller
                name="paidAmount"
                control={control}
                render={({ field }) => (
                  <Input
                    id="paidAmount"
                    type="number"
                    step={5000}
                    min={0}
                    max={effectiveFee}
                    placeholder="납부 금액 입력"
                    disabled={isExempt}
                    value={field.value ?? ''}
                    onChange={(e) => {
                      field.onChange(Number(e.target.value) || 0);
                      trigger('paidAmount');
                    }}
                  />
                )}
              />
              {errors.paidAmount && (
                <p className="text-xs text-destructive">{errors.paidAmount.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>납부일</Label>
              <Controller
                name="paidAt"
                control={control}
                render={({ field }) => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={isExempt}
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value
                          ? format(field.value, 'yyyy-MM-dd', { locale: ko })
                          : '납부일 선택'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={(date: Date | undefined) => field.onChange(date)}
                        locale={ko}
                      />
                    </PopoverContent>
                  </Popover>
                )}
              />
              {errors.paidAt && (
                <p className="text-xs text-destructive">{errors.paidAt.message}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isExempt}
              onClick={() => {
                setValue('paidAmount', Math.floor(effectiveFee / 2));
                trigger('paidAmount');
              }}
            >
              절반
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isExempt}
              onClick={() => {
                setValue('paidAmount', effectiveFee);
                trigger('paidAmount');
              }}
            >
              잔액 전액
            </Button>
          </div>

          {/* 납부 방법 */}
          <div className="space-y-2">
            <Label>납부 방법</Label>
            <Controller
              name="paymentMethod"
              control={control}
              render={({ field }) => (
                <Select
                  disabled={isExempt}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="납부 방법 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">계좌이체</SelectItem>
                    <SelectItem value="card">카드</SelectItem>
                    <SelectItem value="cash">현금</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {errors.paymentMethod && (
              <p className="text-xs text-destructive">{errors.paymentMethod.message}</p>
            )}
          </div>

          {/* 변경 후 잔여 금액 */}
          {!isExempt && (
            <div className="rounded-xl border px-4 py-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">변경 후 잔여 금액</span>
              <span className={cn('text-sm font-semibold', remainingAmount > 0 ? 'text-error' : 'text-success')}>
                ₩{remainingAmount.toLocaleString()}
              </span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {isExempt ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline">면제 취소</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>면제 취소</AlertDialogTitle>
                    <AlertDialogDescription>
                      면제를 취소하시겠습니까? 납부 상태가 미납으로 변경됩니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>닫기</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancelExempt}>
                      취소하기
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive">면제</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>수강료 면제</AlertDialogTitle>
                    <AlertDialogDescription>
                      정말 수강료를 면제 처리하시겠습니까? 면제된 금액은 수익에 포함되지 않습니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={handleExempt}>
                      면제
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={submitting || isExempt}>
              저장
            </Button>
          </DialogFooter>
        </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentForm;
