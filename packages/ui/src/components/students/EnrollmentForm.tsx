import type React from "react";
import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import dayjs from "dayjs";
import { useCourseStore } from "@tutomate/core";
import { useEnrollmentStore } from "@tutomate/core";
import { useLicenseStore } from "@tutomate/core";
import { useMonthlyPaymentStore } from "@tutomate/core";
import { appConfig } from "@tutomate/core";
import type { EnrollmentFormData, Student } from "@tutomate/core";
import {
	getCurrentQuarter,
	getQuarterMonths,
	quarterMonthToYYYYMM,
} from "@tutomate/core";
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
import { Checkbox } from "../ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

const enrollmentFormSchema = z.object({
	courseId: z.string().min(1, "강좌를 선택하세요"),
	discountAmount: z.number().min(0),
	paidAmount: z.number().min(0, "납부 금액을 입력하세요"),
	paymentMethod: z.enum(["cash", "card", "transfer"]).optional(),
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
	const { addEnrollment, enrollments } = useEnrollmentStore();
	const { addPayment } = useMonthlyPaymentStore();
	const { courses, getCourseById } = useCourseStore();
	const { getPlan, getLimit } = useLicenseStore();
	const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
	const [discountAmount, setDiscountAmount] = useState(0);
	const [isExempt, setIsExempt] = useState(false);
	const [enrolledMonths, setEnrolledMonths] = useState<number[]>([]);

	const currentQuarter = getCurrentQuarter();
	const quarterMonths = getQuarterMonths(currentQuarter);

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
			paymentMethod: undefined,
			notes: "",
		},
	});

	useEffect(() => {
		if (visible) {
			form.reset({
				courseId: "",
				discountAmount: 0,
				paidAmount: 0,
				paymentMethod: undefined,
				notes: "",
			});
			setSelectedCourseId(null);
			setDiscountAmount(0);
			setIsExempt(student?.isMember ? true : false);
			setEnrolledMonths(appConfig.enableQuarterSystem ? [...quarterMonths] : []);
		}
	}, [visible, form, student]);

	const handleSubmit = async (values: EnrollmentFormValues) => {
		if (!student) {
			toast.error("수강생 정보가 없습니다.");
			return;
		}

		const course = getCourseById(values.courseId);
		if (!course) {
			toast.error("강좌 정보를 찾을 수 없습니다.");
			return;
		}

		// 중복 등록 체크
		const alreadyEnrolled = enrollments.some(
			(e) => e.studentId === student.id && e.courseId === values.courseId,
		);
		if (alreadyEnrolled) {
			toast.error("이미 등록된 강좌입니다.");
			return;
		}

		const currentEnrollmentCount = enrollments.filter(
			(e) => e.courseId === values.courseId,
		).length;
		if (currentEnrollmentCount >= course.maxStudents) {
			toast.error("강좌 정원이 마감되었습니다.");
			return;
		}

		// 체험판 강좌당 수강생 수 제한 체크
		if (getPlan() === "trial") {
			const maxStudentsPerCourse = getLimit("maxStudentsPerCourse");
			if (currentEnrollmentCount >= maxStudentsPerCourse) {
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

		const enrollmentData: EnrollmentFormData = {
			courseId: values.courseId,
			studentId: student.id,
			paymentStatus,
			paidAmount,
			paidAt:
				paidAmount > 0 || isExempt ? dayjs().format("YYYY-MM-DD") : undefined,
			paymentMethod: values.paymentMethod,
			discountAmount: discount,
			notes: values.notes,
			...(appConfig.enableQuarterSystem && {
				quarter: currentQuarter,
				enrolledMonths,
			}),
		};

		await addEnrollment(enrollmentData);

		// 월별 납부 레코드 자동 생성
		const newEnrollment = useEnrollmentStore
			.getState()
			.enrollments.find(
				(e) => e.studentId === student.id && e.courseId === values.courseId,
			);
		if (newEnrollment) {
			if (appConfig.enableQuarterSystem && enrolledMonths.length > 0) {
				// 분기 시스템: 등록월별로 monthly_payments 생성
				const perMonth = Math.floor(paidAmount / enrolledMonths.length);
				const remainder = paidAmount % enrolledMonths.length;
				for (let i = 0; i < enrolledMonths.length; i++) {
					const month = enrolledMonths[i];
					const yyyymm = quarterMonthToYYYYMM(currentQuarter, month);
					const amt = i === 0 ? perMonth + remainder : perMonth;
					await addPayment(
						newEnrollment.id,
						yyyymm,
						amt,
						values.paymentMethod,
						amt > 0 ? dayjs().format("YYYY-MM-DD") : undefined,
					);
				}
			} else {
				const currentMonth = dayjs().format("YYYY-MM");
				await addPayment(
					newEnrollment.id,
					currentMonth,
					paidAmount,
					values.paymentMethod,
					paidAmount > 0 ? dayjs().format("YYYY-MM-DD") : undefined,
				);
			}
		}

		toast.success("강좌 신청이 완료되었습니다.");

		form.reset();
		setSelectedCourseId(null);
		setDiscountAmount(0);
		setIsExempt(false);
		setEnrolledMonths([]);
		onClose();
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

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-[520px] max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>강좌 신청 - {student?.name || ""}</DialogTitle>
				</DialogHeader>

				<form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
					{/* 강좌 선택 */}
					<div className="space-y-2">
						<Label htmlFor="courseId">강좌 선택</Label>
						<Controller
							control={form.control}
							name="courseId"
							render={({ field }) => (
								<Select
									onValueChange={(value) => {
										field.onChange(value);
										handleCourseChange(value);
									}}
									value={field.value}
								>
									<SelectTrigger id="courseId" className="text-base">
										<SelectValue placeholder="강좌를 선택하세요" />
									</SelectTrigger>
									<SelectContent>
										{courses.map((course) => {
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
													e.courseId === course.id,
											);
											const isDisabled = isFull || isEnrolled;
											const label = `${course.name} (₩${course.fee.toLocaleString()}) - ${currentCount}/${course.maxStudents}명`;
											return (
												<SelectItem
													key={course.id}
													value={course.id}
													disabled={isDisabled}
												>
													<span
														className={cn(
															isEnrolled && "line-through text-muted-foreground",
														)}
													>
														{label}
														{isEnrolled && " [수강중]"}
														{isFull && !isEnrolled && " [정원 마감]"}
													</span>
												</SelectItem>
											);
										})}
									</SelectContent>
								</Select>
							)}
						/>
						{form.formState.errors.courseId && (
							<p className="text-sm text-red-500">
								{form.formState.errors.courseId.message}
							</p>
						)}
					</div>

					{selectedCourseId && appConfig.enableQuarterSystem && (
						<div className="space-y-2">
							<Label>수강등록월</Label>
							<div className="flex flex-wrap gap-3">
								{quarterMonths.map((m: number) => (
									<div key={m} className="flex items-center space-x-2">
										<Checkbox
											id={`month-${m}`}
											checked={enrolledMonths.includes(m)}
											onCheckedChange={(checked) => {
												if (checked) {
													setEnrolledMonths([...enrolledMonths, m]);
												} else {
													setEnrolledMonths(
														enrolledMonths.filter((v) => v !== m),
													);
												}
											}}
										/>
										<Label
											htmlFor={`month-${m}`}
											className="text-base cursor-pointer"
										>
											{m}월
										</Label>
									</div>
								))}
							</div>
						</div>
					)}

					{selectedCourseId && (
						<>
							{/* 할인 + 면제 */}
							<div className="grid grid-cols-[1fr_auto] gap-4 items-end">
								<div className="space-y-2">
									<Label htmlFor="discountAmount">할인 금액</Label>
									<Controller
										control={form.control}
										name="discountAmount"
										render={({ field }) => (
											<Input
												id="discountAmount"
												type="number"
												value={field.value}
												onChange={(e) => {
													const val = Number(e.target.value) || 0;
													field.onChange(val);
													handleDiscountChange(val);
												}}
												min={0}
												max={courseFee}
												placeholder="0"
												disabled={isExempt}
												className="text-base"
											/>
										)}
									/>
								</div>
								<Button
									type="button"
									variant={isExempt ? "destructive" : "outline"}
									onClick={handleExemptToggle}
								>
									{isExempt ? "면제 해제" : "면제"}
								</Button>
							</div>

							{discountAmount > 0 && !isExempt && (
								<p className="-mt-2 text-xs text-green-600">
									할인 적용 수강료: ₩{effectiveFee.toLocaleString()}
								</p>
							)}

							{isExempt && (
								<div className="-mt-2 rounded-md bg-yellow-50 p-2 text-xs text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
									면제 처리됩니다. 수익에 포함되지 않습니다.
								</div>
							)}

							{/* 납부 금액 */}
							<div className="space-y-2">
								<Label htmlFor="paidAmount">납부 금액</Label>
								<Controller
									control={form.control}
									name="paidAmount"
									render={({ field }) => (
										<Input
											id="paidAmount"
											type="number"
											value={field.value}
											onChange={(e) =>
												field.onChange(Number(e.target.value) || 0)
											}
											min={0}
											max={effectiveFee}
											placeholder="30000"
											disabled={isExempt}
											className="text-base"
										/>
									)}
								/>
								{form.formState.errors.paidAmount && (
									<p className="text-sm text-red-500">
										{form.formState.errors.paidAmount.message}
									</p>
								)}
							</div>

							<div className="flex gap-2">
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
							<div className="space-y-2">
								<Label>납부 방법</Label>
								<Controller
									control={form.control}
									name="paymentMethod"
									render={({ field }) => (
										<RadioGroup
											onValueChange={field.onChange}
											value={field.value}
											disabled={isExempt}
											className="flex gap-4"
										>
											<div className="flex items-center space-x-2">
												<RadioGroupItem value="cash" id="payment-cash" />
												<Label
													htmlFor="payment-cash"
													className="text-base cursor-pointer"
												>
													현금
												</Label>
											</div>
											<div className="flex items-center space-x-2">
												<RadioGroupItem value="card" id="payment-card" />
												<Label
													htmlFor="payment-card"
													className="text-base cursor-pointer"
												>
													카드
												</Label>
											</div>
											<div className="flex items-center space-x-2">
												<RadioGroupItem
													value="transfer"
													id="payment-transfer"
												/>
												<Label
													htmlFor="payment-transfer"
													className="text-base cursor-pointer"
												>
													계좌이체
												</Label>
											</div>
										</RadioGroup>
									)}
								/>
							</div>
						</>
					)}

					<div className="space-y-2">
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
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							className="text-base px-6 py-3"
						>
							취소
						</Button>
						<Button type="submit" className="text-base px-6 py-3">
							신청
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};

export default EnrollmentForm;
