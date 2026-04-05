import type React from "react";
import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import dayjs from "dayjs";
import { useCourseStore } from "@tutomate/core";
import { useEnrollmentStore } from "@tutomate/core";
import { useLicenseStore } from "@tutomate/core";
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
import { Textarea } from "../ui/textarea";
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
	const { getPlan, getLimit } = useLicenseStore();
	const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [step, setStep] = useState(1);
	const [courseSearch, setCourseSearch] = useState("");
	const [discountAmount, setDiscountAmount] = useState(0);
	const [isExempt, setIsExempt] = useState(false);

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

		if (getPlan() === "trial") {
			const maxStudentsPerCourse = getLimit("maxStudentsPerCourse");
			if (activeEnrollmentCount >= maxStudentsPerCourse) {
				toast.warning(
					`체험판은 강좌당 최대 ${maxStudentsPerCourse}명까지 등록 가능합니다. 설정에서 라이선스를 활성화하세요.`,
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
				paidAt: paidAmount > 0 || isExempt ? dayjs().format("YYYY-MM-DD") : undefined,
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
				paidAt: paidAmount > 0 || isExempt ? dayjs().format("YYYY-MM-DD") : undefined,
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

	const [showDiscount, setShowDiscount] = useState(false);

	// 할인 토글 리셋
	useEffect(() => {
		if (visible) { setShowDiscount(false); setStep(1); setCourseSearch(""); }
	}, [visible]);

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle style={{ fontSize: '1.29rem', fontWeight: 700, marginBottom: 0 }}>수강 신청 <span style={{ fontWeight: 400, color: 'hsl(var(--muted-foreground))' }}>· {student?.name}</span></DialogTitle>
				</DialogHeader>

				{/* 스텝 인디케이터 */}
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 8 }}>
					<div style={{ width: 24, height: 24, borderRadius: '50%', background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.86rem', fontWeight: 700 }}>1</div>
					<span style={{ fontSize: '0.93rem', fontWeight: step === 1 ? 600 : 400, color: step === 1 ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>강좌 선택</span>
					<span style={{ color: 'hsl(var(--border))' }}>—</span>
					<div style={{ width: 24, height: 24, borderRadius: '50%', background: step === 2 ? 'hsl(var(--foreground))' : 'hsl(var(--border))', color: step === 2 ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.86rem', fontWeight: 700 }}>2</div>
					<span style={{ fontSize: '0.93rem', fontWeight: step === 2 ? 600 : 400, color: step === 2 ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>납부 정보</span>
				</div>

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
												(e) => e.courseId === course.id,
											).length;
											const trialLimit =
												getPlan() === "trial"
													? getLimit("maxStudentsPerCourse")
													: Infinity;
											const effectiveMax = Math.min(course.maxStudents, trialLimit);
											const isFull = currentCount >= effectiveMax;
											const isEnrolled = enrollments.some(
												(e) =>
													e.studentId === student?.id &&
													e.courseId === course.id &&
													isActiveEnrollment(e),
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
						<Button type="button" variant="outline" onClick={onClose} style={{ fontSize: '1rem', padding: "10px 24px" }}>취소</Button>
						<Button type="button" onClick={() => { if (!form.getValues('courseId')) { form.setError('courseId', { message: '강좌를 선택하세요' }); return; } setStep(2); }} style={{ fontSize: '1rem', padding: "10px 24px" }}>다음</Button>
					</DialogFooter>
				</>
				)}

				{step === 2 && (
				<>
							{/* 할인 / 면제 */}
							<div style={{ display: 'flex', gap: 8 }}>
								<Button type="button" variant={showDiscount ? "default" : "outline"} size="sm" style={{ fontSize: '0.93rem', padding: '6px 14px' }}
									onClick={() => { setShowDiscount(!showDiscount); if (showDiscount) { form.setValue('discountAmount', 0); setDiscountAmount(0); } }}
									disabled={isExempt}>
									할인 적용
								</Button>
								<Button type="button" variant={isExempt ? "destructive" : "outline"} size="sm" style={{ fontSize: '0.93rem', padding: '6px 14px' }}
									onClick={handleExemptToggle}>
									{isExempt ? "면제 해제" : "면제 처리"}
								</Button>
							</div>

							{showDiscount && !isExempt && (
							<div className="slide-enter">
								<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
									<Label htmlFor="discountAmount">할인 금액 (원)</Label>
									<Controller control={form.control} name="discountAmount"
										render={({ field }) => (
											<Input id="discountAmount" type="number" value={field.value}
												onChange={(e) => { const val = Number(e.target.value) || 0; field.onChange(val); handleDiscountChange(val); }}
												min={0} max={courseFee} placeholder="0" style={{ fontSize: '1.07rem' }} />
										)} />
									{discountAmount > 0 && (
										<p style={{ fontSize: '0.93rem', color: 'hsl(var(--success))', margin: 0 }}>할인 적용 수강료: ₩{effectiveFee.toLocaleString()}</p>
									)}
								</div>
							</div>
						)}

						{isExempt && (
							<div className="slide-enter" style={{ borderRadius: 8, background: 'hsl(var(--accent))', padding: '10px 12px', fontSize: '0.93rem', color: "hsl(var(--foreground))" }}>
									면제 처리됩니다. 수익에 포함되지 않습니다.
							</div>
						)}

						{/* 납부 금액 */}
						<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
							<Label htmlFor="paidAmount">납부 금액</Label>
							<Controller control={form.control} name="paidAmount"
								render={({ field }) => (
									<Input id="paidAmount" type="number" value={field.value}
										onChange={(e) => field.onChange(Number(e.target.value) || 0)}
										min={0} max={effectiveFee} placeholder="30000"
										disabled={isExempt} style={{ fontSize: '1.07rem' }} />
								)} />
							{form.formState.errors.paidAmount && (
								<p style={{ fontSize: '0.93rem', color: 'hsl(var(--destructive))' }}>{form.formState.errors.paidAmount.message}</p>
							)}
						</div>

							<div style={{ display: "flex", gap: 8 }}>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => form.setValue("paidAmount", effectiveFee)}
									disabled={isExempt}
								>
									완납
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() =>
										form.setValue(
											"paidAmount",
											Math.floor(effectiveFee / 2),
										)
									}
									disabled={isExempt}
								>
									절반
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => form.setValue("paidAmount", 0)}
									disabled={isExempt}
								>
									미납
								</Button>
							</div>

							{/* 납부 방법 */}
							<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
								<Label>납부 방법</Label>
								<Controller control={form.control} name="paymentMethod"
									render={({ field }) => (
										<div style={{ display: "flex", gap: 6 }}>
											{([{ v: "cash", l: "현금" }, { v: "card", l: "카드" }, { v: "transfer", l: "계좌이체" }] as const).map((m) => (
												<Button key={m.v} type="button"
													variant={field.value === m.v ? "default" : "outline"}
													size="sm" style={{ fontSize: '1rem', padding: '8px 16px', flex: '1 0 auto' }}
													disabled={isExempt}
													onClick={() => field.onChange(m.v)}>
													{m.l}
												</Button>
											))}
										</div>
									)} />
							</div>

					<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
						<Label htmlFor="notes">메모</Label>
						<Textarea
							id="notes"
							{...form.register("notes")}
							rows={2}
							placeholder="추가 정보를 입력하세요"
							className="text-base"
						/>
					</div>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setStep(1)} style={{ fontSize: '1rem', padding: "10px 24px" }}>이전</Button>
						<Button type="submit" disabled={submitting} style={{ fontSize: '1rem', padding: "10px 24px" }}>신청</Button>
					</DialogFooter>
				</>
				)}

				</form>
			</DialogContent>
		</Dialog>
	);
};

export default EnrollmentForm;
