import type React from "react";
import { Banknote, CreditCard, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import dayjs from "dayjs";
import { useCourseStore } from "@tutomate/core";
import { useEnrollmentStore } from "@tutomate/core";
import { useAuthStore, PLAN_LIMITS } from "@tutomate/core";
import { usePaymentRecordStore } from "@tutomate/core";
import { appConfig, isActiveEnrollment, isCourseEnded, PaymentStatus, DAY_LABELS } from "@tutomate/core";
import type { EnrollmentFormData, Student } from "@tutomate/core";
import { getCurrentQuarter } from "@tutomate/core";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { toast } from "sonner";

const enrollmentFormSchema = z.object({
	courseId: z.string().min(1, "강좌를 선택하세요"),
	discountAmount: z.number().min(0),
	paidAmount: z.number().min(0, "납부 금액을 입력하세요"),
	paymentMethod: z.enum(["cash", "card", "transfer"], { error: "납부 방법을 선택하세요" }),
	notes: z.string().optional(),
});

type EnrollmentFormValues = z.infer<typeof enrollmentFormSchema>;

interface EnrollmentFormProps {
	visible: boolean;
	onClose: () => void;
	student: Student | null;
}

const EnrollmentForm: React.FC<EnrollmentFormProps> = ({
	visible,
	onClose,
	student,
}) => {
	const { addEnrollment, updateEnrollment, enrollments } = useEnrollmentStore();
	const { addPayment } = usePaymentRecordStore();
	const { courses, getCourseById } = useCourseStore();
	const plan = useAuthStore((s) => s.plan) || 'trial';
	const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [step, setStep] = useState(1);
	const [courseSearch, setCourseSearch] = useState("");
	const [discountAmount, setDiscountAmount] = useState(0);
	const [isExempt, setIsExempt] = useState(false);
	const [formPaidAt, setFormPaidAt] = useState(dayjs().format('YYYY-MM-DD'));

	const currentQuarter = getCurrentQuarter();

	const selectedCourse = selectedCourseId
		? getCourseById(selectedCourseId)
		: null;
	const courseFee = selectedCourse?.fee || 0;
	const effectiveFee = courseFee - discountAmount;

	const form = useForm<EnrollmentFormValues>({
		resolver: zodResolver(enrollmentFormSchema),
		defaultValues: {
			courseId: "",
			discountAmount: 0,
			paidAmount: 0,
			paymentMethod: "cash",
			notes: "",
		},
	});

	useEffect(() => {
		if (visible) {
			form.reset({
				courseId: "",
				discountAmount: 0,
				paidAmount: 0,
				paymentMethod: "cash",
				notes: "",
			});
			setSelectedCourseId(null);
			setDiscountAmount(0);
			setIsExempt(student?.isMember ? true : false);
		}
	}, [visible, form, student]);

	const handleSubmit = async (values: EnrollmentFormValues) => {
		if (submitting) return;
		setSubmitting(true);
		try {
		if (!student) {
			toast.error("수강생 정보가 없습니다.");
			return;
		}

		const course = getCourseById(values.courseId);
		if (!course) {
			toast.error("강좌 정보를 찾을 수 없습니다.");
			return;
		}

		// 활성 수강 중복 체크
		const alreadyEnrolled = enrollments.some(
			(e) => e.studentId === student.id && e.courseId === values.courseId && isActiveEnrollment(e),
		);
		if (alreadyEnrolled) {
			toast.error("이미 등록된 강좌입니다.");
			return;
		}

		const activeEnrollmentCount = enrollments.filter(
			(e) => e.courseId === values.courseId && isActiveEnrollment(e),
		).length;
		if (activeEnrollmentCount >= course.maxStudents) {
			toast.error("강좌 정원이 마감되었습니다.");
			return;
		}

		if (plan === "trial") {
			const maxStudentsPerCourse = PLAN_LIMITS.trial.maxStudentsPerCourse;
			if (activeEnrollmentCount >= maxStudentsPerCourse) {
				toast.warning(
					`체험판은 강좌당 최대 ${maxStudentsPerCourse}명까지 등록 가능합니다.`,
				);
				return;
			}
		}

		const paidAmount = isExempt ? 0 : values.paidAmount || 0;
		const discount = values.discountAmount || 0;
		const effFee = course.fee - discount;

		let paymentStatus: "pending" | "partial" | "completed" | "exempt" =
			"pending";
		if (isExempt) {
			paymentStatus = "exempt";
		} else if (paidAmount === 0) {
			paymentStatus = "pending";
		} else if (paidAmount < effFee) {
			paymentStatus = "partial";
		} else {
			paymentStatus = "completed";
		}

		// 철회된 기존 수강이 있으면 재활성화
		const withdrawnEnrollment = enrollments.find(
			(e) => e.studentId === student.id && e.courseId === values.courseId && e.paymentStatus === PaymentStatus.WITHDRAWN,
		);

		if (withdrawnEnrollment) {
			await updateEnrollment(withdrawnEnrollment.id, {
				paymentStatus,
				paidAmount,
				remainingAmount: effFee - paidAmount,
				paidAt: paidAmount > 0 || isExempt ? formPaidAt : undefined,
				paymentMethod: values.paymentMethod,
				discountAmount: discount,
				notes: values.notes,
				...(appConfig.enableQuarterSystem && { quarter: currentQuarter }),
			});

			if (paidAmount > 0) {
				await addPayment(
					withdrawnEnrollment.id,
					paidAmount,
					course.fee,
					values.paymentMethod,
					dayjs().format("YYYY-MM-DD"),
				);
			}
		} else {
			const enrollmentData: EnrollmentFormData = {
				courseId: values.courseId,
				studentId: student.id,
				paymentStatus,
				paidAmount,
				paidAt: paidAmount > 0 || isExempt ? formPaidAt : undefined,
				paymentMethod: values.paymentMethod,
				discountAmount: discount,
				notes: values.notes,
				...(appConfig.enableQuarterSystem && { quarter: currentQuarter }),
			};

			await addEnrollment(enrollmentData);

			const newEnrollment = useEnrollmentStore
				.getState()
				.enrollments.find(
					(e) => e.studentId === student.id && e.courseId === values.courseId && isActiveEnrollment(e),
				);
			if (newEnrollment && paidAmount > 0) {
				await addPayment(
					newEnrollment.id,
					paidAmount,
					course.fee,
					values.paymentMethod,
					dayjs().format("YYYY-MM-DD"),
				);
			}
		}

		toast.success("수강 신청이 완료되었습니다.");

		form.reset();
		setSelectedCourseId(null);
		setDiscountAmount(0);
		setIsExempt(false);
		onClose();
		} finally {
			setSubmitting(false);
		}
	};

	const handleCourseChange = (courseId: string) => {
		const course = getCourseById(courseId);
		setSelectedCourseId(courseId);
		setDiscountAmount(0);
		const memberExempt = !!student?.isMember;
		setIsExempt(memberExempt);
		if (course) {
			form.setValue("paidAmount", memberExempt ? 0 : course.fee);
			form.setValue("discountAmount", 0);
		}
	};

	const handleDiscountChange = (value: number) => {
		const discount = value || 0;
		setDiscountAmount(discount);
		// 할인 적용 후 납부금액이 할인된 수강료 초과하면 조정
		const currentPaid = form.getValues("paidAmount") || 0;
		const newEffectiveFee = courseFee - discount;
		if (currentPaid > newEffectiveFee) {
			form.setValue("paidAmount", newEffectiveFee);
		}
	};

	const handleExemptToggle = () => {
		const newExempt = !isExempt;
		setIsExempt(newExempt);
		if (newExempt) {
			form.setValue("paidAmount", 0);
		} else {
			form.setValue("paidAmount", effectiveFee);
		}
	};

	// 할인 토글 리셋
	useEffect(() => {
		if (visible) { setStep(1); setCourseSearch(""); }
	}, [visible]);

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<div className="flex items-center justify-between">
						<DialogTitle className="text-base">수강 신청 <span className="font-normal text-muted-foreground">· {student?.name}</span></DialogTitle>
						<div className="flex items-center gap-1.5 text-sm mr-6">
							<span className={step === 1 ? 'font-semibold' : 'text-muted-foreground'}>강좌 선택</span>
							<span className="text-muted-foreground/40">›</span>
							<span className={step === 2 ? 'font-semibold' : 'text-muted-foreground'}>납부</span>
						</div>
					</div>
				</DialogHeader>

				<form onSubmit={form.handleSubmit(handleSubmit)} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

				{step === 1 && (
				<>
					<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
						<Controller
							control={form.control}
							name="courseId"
							render={({ field }) => {
								const filtered = courses.filter((c) => !isCourseEnded(c) && c.name.toLowerCase().includes(courseSearch.toLowerCase()));
								return (
								<div>
									<Input
											placeholder="강좌명 검색..."
											value={courseSearch}
											onChange={(e) => setCourseSearch(e.target.value)}
											style={{ marginBottom: 8 }}
										/>
									<div style={{ minHeight: 360, maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
										{filtered.map((course) => {
											const currentCount = enrollments.filter(
												(e) => e.courseId === course.id && isActiveEnrollment(e) &&
													(!appConfig.enableQuarterSystem || e.quarter === currentQuarter || !e.quarter),
											).length;
											const trialLimit =
												plan === "trial"
													? PLAN_LIMITS.trial.maxStudentsPerCourse
													: Infinity;
											const effectiveMax = Math.min(course.maxStudents, trialLimit);
											const isFull = currentCount >= effectiveMax;
											const isEnrolled = enrollments.some(
												(e) =>
													e.studentId === student?.id &&
													e.courseId === course.id &&
													isActiveEnrollment(e) &&
													(!appConfig.enableQuarterSystem || e.quarter === currentQuarter || !e.quarter),
											);
											const isDisabled = isFull || isEnrolled;
											const isSelected = field.value === course.id;
											const schedule = course.schedule;
											const daysText = Array.isArray(schedule?.daysOfWeek) && schedule.daysOfWeek.length
												? schedule.daysOfWeek.sort((a: number, b: number) => a - b).map((d: number) => DAY_LABELS[d]).join(', ')
												: '';
											const timeText = schedule?.startTime && schedule?.endTime
												? `${schedule.startTime}~${schedule.endTime}` : '';
											const subText = [daysText, timeText].filter(Boolean).join(' · ');
											return (
												<button
													key={course.id}
													type="button"
													disabled={isDisabled}
													onClick={() => { field.onChange(course.id); handleCourseChange(course.id); }}
													style={{
														display: 'flex', alignItems: 'center', gap: 12,
														padding: '10px 12px', borderRadius: 8, border: 'none',
														background: isSelected ? 'hsl(var(--primary) / 0.06)' : 'transparent',
														cursor: isDisabled ? 'not-allowed' : 'pointer',
														opacity: isDisabled ? 0.5 : 1,
														textAlign: 'left', width: '100%',
														transition: 'background 0.1s',
													}}
												>
													<div style={{
														width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
														border: `2px solid ${isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
														background: isSelected ? 'hsl(var(--primary))' : 'transparent',
														boxShadow: isSelected ? 'inset 0 0 0 3px hsl(var(--background))' : 'none',
													}} />
													<span style={{ fontWeight: 600, fontSize: '0.93rem', flex: 1, textDecoration: isEnrolled ? 'line-through' : undefined }}>
														{course.name}
													</span>
													<span style={{ fontSize: '0.79rem', color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>
														{subText && `${subText} · `}₩{course.fee.toLocaleString()} · {currentCount}/{course.maxStudents}명
														{isEnrolled && ' · 수강중'}
														{isFull && !isEnrolled && ' · 마감'}
													</span>
												</button>
											);
										})}
										{filtered.length === 0 && (
											<div style={{ textAlign: 'center', padding: 16, color: 'hsl(var(--muted-foreground))', fontSize: '0.86rem' }}>
												검색 결과가 없습니다
											</div>
										)}
									</div>
								</div>
								);
							}}
						/>
						{form.formState.errors.courseId && (
							<p style={{ fontSize: '0.93rem', color: 'hsl(var(--destructive))' }}>
								{form.formState.errors.courseId.message}
							</p>
						)}
					</div>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose} className="text-base px-6">취소</Button>
						<Button type="button" onClick={() => { if (!form.getValues('courseId')) { form.setError('courseId', { message: '강좌를 선택하세요' }); return; } setStep(2); }} className="text-base px-6">다음 →</Button>
					</DialogFooter>
				</>
				)}

				{step === 2 && (
				<>
					{/* 요약 박스 (할인 인라인) */}
					<div className="rounded-xl border p-4 space-y-2">
						<div className="flex justify-between items-center">
							<span className="text-sm text-muted-foreground">수강료</span>
							<span className="text-sm font-semibold">₩{courseFee.toLocaleString()}</span>
						</div>
						<div className="flex justify-between items-center">
							<span className="text-sm text-muted-foreground">할인</span>
							<Controller control={form.control} name="discountAmount"
								render={({ field }) => (
									<Input type="number" min={0} max={courseFee} step={5000}
										value={field.value || ''}
										onChange={(e) => { const val = Number(e.target.value) || 0; field.onChange(val); handleDiscountChange(val); }}
										placeholder="0" disabled={isExempt}
										className="h-7 w-[110px] text-right text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
									/>
								)} />
						</div>
						<div className="flex justify-between items-center pt-2 border-t">
							<div className="flex items-center gap-2">
								<span className="text-sm font-semibold">납부할 금액</span>
								<button type="button" onClick={handleExemptToggle}
									className={`text-xs px-3 py-1 rounded-full border cursor-pointer transition-colors font-medium ${
										isExempt
											? 'border-destructive text-destructive hover:bg-destructive/10'
											: 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
									}`}
								>
									{isExempt ? '면제 해제' : '면제 처리'}
								</button>
							</div>
							{isExempt
								? <span className="text-base font-bold text-muted-foreground line-through">₩{effectiveFee.toLocaleString()}</span>
								: <span className="text-base font-bold text-destructive">₩{effectiveFee.toLocaleString()}</span>
							}
						</div>
					</div>

					{/* 납부 금액 — 카드 버튼 + 직접 입력 */}
					{!isExempt && (
					<div className="space-y-2">
						<Label>납부 금액</Label>
						<div className="grid grid-cols-3 gap-2">
							{([
								{ label: '완납', amount: effectiveFee },
								{ label: '절반', amount: Math.floor(effectiveFee / 2) },
								{ label: '미납', amount: 0 },
							] as const).map((opt) => {
								const isActive = form.watch('paidAmount') === opt.amount;
								return (
									<button key={opt.label} type="button"
										onClick={() => form.setValue('paidAmount', opt.amount)}
										className={`py-3 rounded-lg border text-center transition-all cursor-pointer ${
											isActive
												? 'border-foreground bg-foreground text-background'
												: 'border-border hover:border-foreground/30'
										}`}
									>
										<div className="text-sm font-semibold">{opt.label}</div>
										<div className={`text-xs mt-0.5 ${isActive ? 'opacity-60' : 'text-muted-foreground'}`}>₩{opt.amount.toLocaleString()}</div>
									</button>
								);
							})}
						</div>
						<Controller control={form.control} name="paidAmount"
							render={({ field }) => (
								<Input type="number" min={0} max={effectiveFee} step={5000}
									value={field.value}
									onChange={(e) => field.onChange(Number(e.target.value) || 0)}
									className="text-center text-xl font-bold h-12 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
								/>
							)} />
						{form.formState.errors.paidAmount && (
							<p className="text-sm text-destructive">{form.formState.errors.paidAmount.message}</p>
						)}
					</div>
					)}

					{/* 납부 방법 — 아이콘 버튼 */}
					{!isExempt && (
					<div className="space-y-2">
						<Label>납부 방법</Label>
						<Controller control={form.control} name="paymentMethod"
							render={({ field }) => (
								<div className="grid grid-cols-3 gap-2">
									{([
										{ v: 'cash', l: '현금', Icon: Banknote },
										{ v: 'card', l: '카드', Icon: CreditCard },
										{ v: 'transfer', l: '계좌이체', Icon: Building2 },
									] as const).map((m) => {
										const isActive = field.value === m.v;
										return (
											<button key={m.v} type="button"
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
							)} />
					</div>
					)}

					{/* 납부일 + 메모 */}
					{!isExempt && (
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="paidAt">납부일</Label>
							<Input id="paidAt" type="date" value={formPaidAt}
								onChange={(e) => setFormPaidAt(e.target.value)} />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="notes">메모</Label>
							<Input id="notes" {...form.register("notes")} placeholder="선택 사항" />
						</div>
					</div>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setStep(1)} className="text-base px-6">← 이전</Button>
						<Button type="submit" disabled={submitting} className="text-base px-6">신청</Button>
					</DialogFooter>
				</>
				)}

				</form>
			</DialogContent>
		</Dialog>
	);
};

export default EnrollmentForm;
