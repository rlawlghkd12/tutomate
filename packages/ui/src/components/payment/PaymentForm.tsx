import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Banknote, CreditCard, Building2 } from 'lucide-react';
import type { Enrollment, PaymentMethod } from '@tutomate/core';
import { useEnrollmentStore, useStudentStore, PaymentMethodEnum } from '@tutomate/core';
import dayjs from 'dayjs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
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
  const { getStudentById } = useStudentStore();
  const [discountAmount, setDiscountAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const paymentSchema = z.object({
    paidAmount: z
      .number({ message: '납부 금액을 입력하세요' })
      .min(0)
      .max(courseFee - discountAmount, '수강료를 초과할 수 없습니다'),
    paidAt: z.string().min(1, '납부일을 선택하세요'),
    paymentMethod: z.enum(['transfer', 'card', 'cash'] as const, { message: '납부 방법을 선택하세요' }),
    discountAmount: z.number().min(0).max(courseFee).default(0),
    notes: z.string().optional(),
  });

  type PaymentFormData = z.infer<typeof paymentSchema>;

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    register,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema) as any,
    defaultValues: {
      paidAmount: 0,
      paidAt: dayjs().format('YYYY-MM-DD'),
      paymentMethod: PaymentMethodEnum.TRANSFER,
      discountAmount: 0,
      notes: '',
    },
  });

  const watchedPaidAmount = watch('paidAmount');

  useEffect(() => {
    if (visible && enrollment) {
      const discount = enrollment.discountAmount ?? 0;
      setDiscountAmount(discount);
      reset({
        paidAmount: enrollment.paidAmount,
        paidAt: enrollment.paidAt ? enrollment.paidAt : dayjs().format('YYYY-MM-DD'),
        paymentMethod: enrollment.paymentMethod || PaymentMethodEnum.TRANSFER,
        discountAmount: discount,
        notes: '',
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

      await updatePayment(
        enrollment.id,
        values.paidAmount,
        courseFee,
        values.paidAt,
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
  const studentName = getStudentById(enrollment.studentId)?.name ?? '';
  const currentPaidAmount = watchedPaidAmount ?? enrollment.paidAmount;
  const remainingAmount = Math.max(0, effectiveFee - currentPaidAmount);

  return (
    <Dialog open={visible} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base">
            <span className="text-primary">{studentName}</span>님의 납부기록
          </DialogTitle>
          <DialogDescription className="sr-only">납부 정보를 입력합니다</DialogDescription>
        </DialogHeader>

        {isExempt ? (
          <>
            <div className="mt-4 rounded-xl border p-4 flex items-center gap-2">
              <Badge variant="secondary">면제</Badge>
              <span className="text-sm">이 수강은 수강료가 면제되었습니다.</span>
            </div>
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={onClose} className="text-base px-6">닫기</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" className="text-base px-6">면제 취소</Button>
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
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* 요약 박스 — 수강료 / 할인 인라인 / 납부할 금액 */}
            <div className="mt-4 rounded-xl border p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">수강료</span>
                <span className="text-sm font-semibold">{'\u20A9'}{courseFee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">할인</span>
                <Controller
                  control={control}
                  name="discountAmount"
                  render={({ field }) => (
                    <Input
                      type="number"
                      min={0}
                      max={courseFee}
                      step={5000}
                      value={field.value || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        field.onChange(val);
                        setDiscountAmount(val);
                      }}
                      placeholder="0"
                      className="h-7 w-[110px] text-right text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  )}
                />
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm font-semibold">납부할 금액</span>
                <span className={`text-base font-bold ${remainingAmount > 0 ? 'text-destructive' : 'text-success'}`}>
                  {'\u20A9'}{effectiveFee.toLocaleString()}
                </span>
              </div>
            </div>

            {/* 납부 금액 — 빠른선택 버튼 + 직접 입력 */}
            <div className="mt-5 space-y-2">
              <Label>납부 금액 <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { label: '완납', amount: effectiveFee },
                  { label: '절반', amount: Math.floor(effectiveFee / 2) },
                  { label: '미납', amount: 0 },
                ] as const).map((opt) => {
                  const isActive = watchedPaidAmount === opt.amount;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setValue('paidAmount', opt.amount)}
                      className={`py-3 rounded-lg border text-center transition-all cursor-pointer ${
                        isActive
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border hover:border-foreground/30'
                      }`}
                    >
                      <div className="text-sm font-semibold">{opt.label}</div>
                      <div className={`text-xs mt-0.5 ${isActive ? 'opacity-60' : 'text-muted-foreground'}`}>
                        {'\u20A9'}{opt.amount.toLocaleString()}
                      </div>
                    </button>
                  );
                })}
              </div>
              <Controller
                control={control}
                name="paidAmount"
                render={({ field }) => (
                  <Input
                    type="number"
                    min={0}
                    max={effectiveFee}
                    step={5000}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                    className="text-center text-xl font-bold h-12 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                )}
              />
              {errors.paidAmount && (
                <p className="text-sm text-destructive">{errors.paidAmount.message}</p>
              )}
            </div>

            {/* 납부 방법 — 아이콘 버튼 */}
            <div className="mt-5 space-y-2">
              <Label>납부 방법</Label>
              <Controller
                control={control}
                name="paymentMethod"
                render={({ field }) => (
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { v: 'cash', l: '현금', Icon: Banknote },
                      { v: 'card', l: '카드', Icon: CreditCard },
                      { v: 'transfer', l: '계좌이체', Icon: Building2 },
                    ] as const).map((m) => {
                      const isActive = field.value === m.v;
                      return (
                        <button
                          key={m.v}
                          type="button"
                          onClick={() => field.onChange(m.v)}
                          className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-all cursor-pointer ${
                            isActive
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-foreground/30'
                          }`}
                        >
                          <m.Icon className={`h-6 w-6 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                          <span className={`text-sm font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>{m.l}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              />
              {errors.paymentMethod && (
                <p className="text-sm text-destructive">{errors.paymentMethod.message}</p>
              )}
            </div>

            {/* 납부일 + 메모 */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="payment-form-paidAt">납부일 <span className="text-destructive">*</span></Label>
                <Controller
                  control={control}
                  name="paidAt"
                  render={({ field }) => (
                    <Input id="payment-form-paidAt" type="date" value={field.value} onChange={(e) => field.onChange(e.target.value)} />
                  )}
                />
                {errors.paidAt && (
                  <p className="text-xs text-destructive">{errors.paidAt.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-form-notes">메모</Label>
                <Input id="payment-form-notes" placeholder="선택 사항" {...register('notes')} />
              </div>
            </div>

            <DialogFooter className="mt-5">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive" className="text-base px-6">면제</Button>
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
              <Button type="button" variant="outline" onClick={onClose} className="text-base px-6">취소</Button>
              <Button type="submit" disabled={submitting} className="text-base px-6">저장</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PaymentForm;
