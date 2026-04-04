import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { Enrollment, PaymentMethod } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Separator } from '../ui/separator';
import { toast } from 'sonner';
// cn is available from ../../lib/utils if needed

const bulkPaymentSchema = z.object({
  fixedAmount: z.number().min(0, '0원 이상이어야 합니다').optional(),
  ratio: z.number().min(0, '0 이상이어야 합니다').max(100, '100 이하여야 합니다').optional(),
});

type BulkPaymentFormValues = z.infer<typeof bulkPaymentSchema>;

interface BulkPaymentFormProps {
  visible: boolean;
  onClose: () => void;
  enrollments: Enrollment[];
  courseFee: number;
}

const BulkPaymentForm: React.FC<BulkPaymentFormProps> = ({
  visible,
  onClose,
  enrollments,
  courseFee,
}) => {
  const { updatePayment } = useEnrollmentStore();
  const [paymentType, setPaymentType] = useState<'fixed' | 'ratio'>('fixed');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  const form = useForm<BulkPaymentFormValues>({
    resolver: zodResolver(bulkPaymentSchema),
    defaultValues: {
      fixedAmount: 0,
      ratio: 0,
    },
  });

  const totalSelectedStudents = enrollments.length;
  const totalExpectedAmount = totalSelectedStudents * courseFee;
  const totalCurrentPaid = enrollments.reduce((sum, e) => sum + e.paidAmount, 0);
  const totalRemaining = totalExpectedAmount - totalCurrentPaid;

  const watchedFixedAmount = form.watch('fixedAmount') || 0;
  const watchedRatio = form.watch('ratio') || 0;

  const previewPerStudent =
    paymentType === 'fixed'
      ? watchedFixedAmount
      : Math.floor((courseFee * watchedRatio) / 100);
  const previewTotal = totalSelectedStudents * previewPerStudent;

  const handleSubmit = async () => {
    const isValid = await form.trigger();
    if (!isValid) return;

    const values = form.getValues();

    try {
      let amountPerStudent = 0;
      if (paymentType === 'fixed') {
        amountPerStudent = values.fixedAmount || 0;
      } else {
        const ratio = values.ratio || 0;
        amountPerStudent = Math.floor((courseFee * ratio) / 100);
      }

      // 각 수강생에게 납부 금액 추가
      for (const enrollment of enrollments) {
        const newPaidAmount = enrollment.paidAmount + amountPerStudent;
        await updatePayment(enrollment.id, newPaidAmount, courseFee, undefined, false, paymentMethod);
      }

      toast.success(`${totalSelectedStudents}명의 납부 정보가 업데이트되었습니다.`);
      form.reset();
      onClose();
    } catch (error) {
      console.error('일괄 납부 처리 실패:', error);
      toast.error('일괄 납부 처리에 실패했습니다.');
    }
  };

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>일괄 납부 처리</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 요약 정보 */}
          <div className="rounded-md bg-muted/50 p-3 space-y-1">
            <div className="flex justify-between">
              <span>선택된 수강생:</span>
              <strong>{totalSelectedStudents}명</strong>
            </div>
            <div className="flex justify-between">
              <span>총 예상 금액:</span>
              <strong>{totalExpectedAmount.toLocaleString()}</strong>
            </div>
            <div className="flex justify-between">
              <span>현재 총 납부액:</span>
              <strong>{totalCurrentPaid.toLocaleString()}</strong>
            </div>
            <div className="flex justify-between">
              <span>총 잔여 금액:</span>
              <strong className="text-destructive">{totalRemaining.toLocaleString()}</strong>
            </div>
          </div>

          <Separator />

          {/* 납부 방식 */}
          <div className="space-y-2">
            <Label>납부 방식</Label>
            <RadioGroup
              value={paymentType}
              onValueChange={(v) => setPaymentType(v as 'fixed' | 'ratio')}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="fixed" id="type-fixed" />
                <Label htmlFor="type-fixed" className="cursor-pointer text-base">고정 금액</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ratio" id="type-ratio" />
                <Label htmlFor="type-ratio" className="cursor-pointer text-base">비율</Label>
              </div>
            </RadioGroup>
          </div>

          {paymentType === 'fixed' ? (
            <div className="space-y-2">
              <Label htmlFor="fixedAmount">1인당 납부 금액</Label>
              <Controller
                control={form.control}
                name="fixedAmount"
                render={({ field }) => (
                  <Input
                    id="fixedAmount"
                    type="number"
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    min={0}
                    placeholder="예: 100000"
                    className="text-base"
                  />
                )}
              />
              {form.formState.errors.fixedAmount && (
                <p className="text-sm text-destructive">{form.formState.errors.fixedAmount.message}</p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => form.setValue('fixedAmount', Math.floor(courseFee / 2))}
                >
                  절반 ({Math.floor(courseFee / 2).toLocaleString()})
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => form.setValue('fixedAmount', courseFee)}
                >
                  전액 ({courseFee.toLocaleString()})
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="ratio">납부 비율 (%)</Label>
              <Controller
                control={form.control}
                name="ratio"
                render={({ field }) => (
                  <Input
                    id="ratio"
                    type="number"
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    min={0}
                    max={100}
                    placeholder="예: 50"
                    className="text-base"
                  />
                )}
              />
              {form.formState.errors.ratio && (
                <p className="text-sm text-destructive">{form.formState.errors.ratio.message}</p>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => form.setValue('ratio', 25)}>
                  25%
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => form.setValue('ratio', 50)}>
                  50%
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => form.setValue('ratio', 100)}>
                  100%
                </Button>
              </div>
            </div>
          )}

          {/* 납부 방법 */}
          <div className="space-y-2">
            <Label>납부 방법</Label>
            <RadioGroup
              value={paymentMethod ?? 'none'}
              onValueChange={(v) => setPaymentMethod(v === 'none' ? undefined : v as PaymentMethod)}
              className="flex gap-2"
            >
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="none" id="method-none" />
                <Label htmlFor="method-none" className="cursor-pointer text-base">미지정</Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="cash" id="method-cash" />
                <Label htmlFor="method-cash" className="cursor-pointer text-base">현금</Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="card" id="method-card" />
                <Label htmlFor="method-card" className="cursor-pointer text-base">카드</Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="transfer" id="method-transfer" />
                <Label htmlFor="method-transfer" className="cursor-pointer text-base">계좌이체</Label>
              </div>
            </RadioGroup>
          </div>

          {/* 미리보기 */}
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 space-y-1">
            <strong>미리보기</strong>
            <div>1인당 납부액: {previewPerStudent.toLocaleString()}</div>
            <div>총 납부액: {previewTotal.toLocaleString()}</div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} className="text-base px-6 py-3">
            취소
          </Button>
          <Button type="button" onClick={handleSubmit} className="text-base px-6 py-3">
            적용
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkPaymentForm;
