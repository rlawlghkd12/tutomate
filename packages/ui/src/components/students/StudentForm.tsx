import { Trash2, X, Info, ChevronsUpDown } from "lucide-react";
import dayjs from "dayjs";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCourseStore } from "@tutomate/core";
import { useEnrollmentStore } from "@tutomate/core";
import { useLicenseStore } from "@tutomate/core";
import { usePaymentRecordStore } from "@tutomate/core";
import { useStudentStore } from "@tutomate/core";
import type { PaymentMethod, Student, StudentFormData } from "@tutomate/core";
import { formatPhone, parseBirthDate } from "@tutomate/core";
import { appConfig } from "@tutomate/core";
import {
	getCurrentQuarter,
} from "@tutomate/core";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "../ui/dialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../ui/alert-dialog";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "../ui/popover";
import {
	Command,
	CommandInput,
	CommandList,
	CommandItem,
	CommandEmpty,
} from "../ui/command";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

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

const studentFormSchema = z.object({
	name: z.string().min(1, "이름을 입력하세요"),
	phone: z.string().min(1, "전화번호를 입력하세요"),
	birthDate: z.string().optional(),
	address: z.string().optional(),
	notes: z.string().optional(),
	isMember: z.boolean(),
});

type StudentFormValues = z.infer<typeof studentFormSchema>;

const StudentForm: React.FC<StudentFormProps> = ({
	visible,
	onClose,
	student,
}) => {
	const form = useForm<StudentFormValues>({
		resolver: zodResolver(studentFormSchema),
		defaultValues: {
			name: "",
			phone: "",
			birthDate: "",
			address: "",
			notes: "",
			isMember: false,
		},
	});

	const { addStudent, updateStudent, deleteStudent, students } = useStudentStore();
	const { courses, getCourseById } = useCourseStore();
	const { enrollments, addEnrollment, deleteEnrollment, updateEnrollment } =
		useEnrollmentStore();
	const { getPlan, getLimit } = useLicenseStore();
	const { addPayment: addPaymentRecord } = usePaymentRecordStore();
	const nameInputRef = useRef<HTMLInputElement>(null);
	const phoneInputRef = useRef<HTMLInputElement>(null);
	const birthDateInputRef = useRef<HTMLInputElement>(null);
	const addressInputRef = useRef<HTMLInputElement>(null);
	const notesInputRef = useRef<HTMLTextAreaElement>(null);

	const nameRegister = form.register("name");
	const birthDateRegister = form.register("birthDate");
	const addressRegister = form.register("address");
	const notesRegister = form.register("notes");

	const [coursePayments, setCoursePayments] = useState<CoursePayment[]>([]);
	const [courseSelectKey, setCourseSelectKey] = useState(0);
	const [nameSearch, setNameSearch] = useState("");
	const [nameComboboxOpen, setNameComboboxOpen] = useState(false);
	const [selectedExistingStudent, setSelectedExistingStudent] =
		useState<Student | null>(null);
	const [savedCoursePayments, setSavedCoursePayments] = useState<
		CoursePayment[]
	>([]);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	// 현재 편집 중인 수강생 (props로 받은 것 또는 자동완성으로 선택한 것)
	const editingStudent = student || selectedExistingStudent;

	useEffect(() => {
		if (visible && student) {
			// 수정 모드: 기존 수강 강좌 및 납부 정보 가져오기
			const studentEnrollments = enrollments.filter(
				(e) => e.studentId === student.id,
			);
			const payments = studentEnrollments.map((e) => ({
				courseId: e.courseId,
				paidAmount: e.paidAmount,
				isExempt: e.paymentStatus === "exempt",
				paymentMethod: e.paymentMethod,
				discountAmount: e.discountAmount ?? 0,
			}));
			setCoursePayments(payments);
			setSelectedExistingStudent(null);
			setNameSearch("");
			form.reset({
				name: student.name,
				phone: student.phone,
				birthDate: student.birthDate
					? student.birthDate.replace(/-/g, "").slice(2)
					: "",
				address: student.address || "",
				notes: student.notes || "",
				isMember: student.isMember ?? false,
			});
		} else if (visible) {
			form.reset({
				name: "",
				phone: "",
				birthDate: "",
				address: "",
				notes: "",
				isMember: false,
			});
			setCoursePayments([]);
			setSelectedExistingStudent(null);
			setNameSearch("");
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
			.filter((s) => s.name.toLowerCase().includes(search))
			.slice(0, 8)
			.map((s) => ({
				value: s.name,
				key: s.id,
				phone: s.phone,
			}));
	}, [students, nameSearch, student]);

	// 기존 수강생 선택 시
	const handleNameSelect = (studentId: string) => {
		const existing = students.find((s) => s.id === studentId);
		if (!existing) return;

		setSelectedExistingStudent(existing);
		setSavedCoursePayments(coursePayments);
		setNameComboboxOpen(false);

		// 폼에 기존 정보 채우기
		form.reset({
			name: existing.name,
			phone: existing.phone,
			birthDate: existing.birthDate
				? existing.birthDate.replace(/-/g, "").slice(2)
				: "",
			address: existing.address || "",
			notes: existing.notes || "",
			isMember: existing.isMember ?? false,
		});

		// 기존 수강 정보 로드
		const studentEnrollments = enrollments.filter(
			(e) => e.studentId === existing.id,
		);
		setCoursePayments(
			studentEnrollments.map((e) => ({
				courseId: e.courseId,
				paidAmount: e.paidAmount,
				isExempt: e.paymentStatus === "exempt",
				paymentMethod: e.paymentMethod,
				discountAmount: e.discountAmount ?? 0,
			})),
		);

		toast.info(`기존 수강생 "${existing.name}"님의 정보를 불러왔습니다.`);
		phoneInputRef.current?.focus();
	};

	const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		form.setValue("phone", formatPhone(e.target.value));
	};

	const handleMemberChange = (checked: boolean) => {
		form.setValue("isMember", checked);
		setCoursePayments((prev) =>
			prev.map((cp) => ({
				...cp,
				isExempt: checked,
				paidAmount: checked ? 0 : cp.paidAmount,
			})),
		);
	};

	const handleAddCourse = (courseId: string) => {
		const course = getCourseById(courseId);
		if (course && !coursePayments.find((cp) => cp.courseId === courseId)) {
			const isMember = form.getValues("isMember");
			setCoursePayments([
				...coursePayments,
				{
					courseId,
					paidAmount: isMember ? 0 : course.fee,
					isExempt: !!isMember,
					discountAmount: 0,
				},
			]);
		}
		setCourseSelectKey((k) => k + 1);
	};

	const handleRemoveCourse = useCallback((courseId: string) => {
		setCoursePayments((prev) => prev.filter((cp) => cp.courseId !== courseId));
		setCourseSelectKey((k) => k + 1);
	}, []);

	const handlePaymentChange = useCallback(
		(courseId: string, paidAmount: number) => {
			setCoursePayments((prev) =>
				prev.map((cp) =>
					cp.courseId === courseId
						? { ...cp, paidAmount, isExempt: false }
						: cp,
				),
			);
		},
		[],
	);

	const handleExemptToggle = useCallback((courseId: string) => {
		setCoursePayments((prev) =>
			prev.map((cp) =>
				cp.courseId === courseId
					? { ...cp, isExempt: !cp.isExempt, paidAmount: 0 }
					: cp,
			),
		);
	}, []);

	const handlePaymentMethodChange = useCallback(
		(courseId: string, method: PaymentMethod) => {
			setCoursePayments((prev) =>
				prev.map((cp) =>
					cp.courseId === courseId ? { ...cp, paymentMethod: method } : cp,
				),
			);
		},
		[],
	);

	const handleDiscountChange = useCallback(
		(courseId: string, discount: number) => {
			setCoursePayments((prev) =>
				prev.map((cp) => {
					if (cp.courseId !== courseId) return cp;
					return { ...cp, discountAmount: discount };
				}),
			);
		},
		[],
	);

	const getPaymentStatus = (
		cp: CoursePayment,
		fee: number,
	): "pending" | "partial" | "completed" | "exempt" => {
		if (cp.isExempt) return "exempt";
		const effectiveFee = fee - (cp.discountAmount || 0);
		if (cp.paidAmount === 0) return "pending";
		if (cp.paidAmount < effectiveFee) return "partial";
		return "completed";
	};

	const handleSubmit = async () => {
		const isValid = await form.trigger();
		if (!isValid) return;

		try {
			const values = form.getValues();
			const birthDateParsed = parseBirthDate(values.birthDate ?? "");

			const formData = {
				...values,
				birthDate: birthDateParsed,
				isMember: values.isMember ?? false,
			};

			if (editingStudent) {
				// 수정 모드 (props 또는 자동완성으로 선택한 기존 수강생)
				await updateStudent(editingStudent.id, formData);

				const existingEnrollments = enrollments.filter(
					(e) => e.studentId === editingStudent.id,
				);
				const newCourseIds = coursePayments.map((cp) => cp.courseId);

				// 삭제할 enrollment
				for (const e of existingEnrollments.filter(
					(e) => !newCourseIds.includes(e.courseId),
				)) {
					await deleteEnrollment(e.id);
				}

				// 추가 또는 수정할 enrollment
				for (const cp of coursePayments) {
					const course = getCourseById(cp.courseId);
					if (!course) continue;

					const existing = existingEnrollments.find(
						(e) => e.courseId === cp.courseId,
					);
					const newStatus = getPaymentStatus(cp, course.fee);
					const effectiveFee = course.fee - (cp.discountAmount || 0);
					if (existing) {
						const existingIsExempt = existing.paymentStatus === "exempt";
						const needsQuarter = appConfig.enableQuarterSystem && !existing.quarter;
						if (
							existing.paidAmount !== cp.paidAmount ||
							existingIsExempt !== cp.isExempt ||
							existing.paymentMethod !== cp.paymentMethod ||
							(existing.discountAmount ?? 0) !== cp.discountAmount ||
							needsQuarter
						) {
							const hasPaid = !cp.isExempt && cp.paidAmount > 0;
							await updateEnrollment(existing.id, {
								paidAmount: cp.isExempt ? 0 : cp.paidAmount,
								remainingAmount: cp.isExempt ? 0 : effectiveFee - cp.paidAmount,
								paymentStatus: newStatus,
								paidAt: hasPaid ? dayjs().format("YYYY-MM-DD") : undefined,
								paymentMethod: cp.paymentMethod,
								discountAmount: cp.discountAmount,
								...(needsQuarter && {
									quarter: getCurrentQuarter(),
								}),
							});
						}
					} else {
						const hasPaidNew = !cp.isExempt && cp.paidAmount > 0;
						const currentQuarter = getCurrentQuarter();
						await addEnrollment({
							studentId: editingStudent.id,
							courseId: cp.courseId,
							paidAmount: cp.isExempt ? 0 : cp.paidAmount,
							paymentStatus: newStatus,
							paidAt: hasPaidNew ? dayjs().format("YYYY-MM-DD") : undefined,
							paymentMethod: cp.paymentMethod,
							discountAmount: cp.discountAmount,
							...(appConfig.enableQuarterSystem && {
								quarter: currentQuarter,
							}),
						});

						// 납부 레코드 생성
						const newEnr = useEnrollmentStore
							.getState()
							.enrollments.find(
								(e) =>
									e.studentId === editingStudent.id &&
									e.courseId === cp.courseId,
							);
						if (newEnr) {
							const paidAmt = cp.isExempt ? 0 : cp.paidAmount;
							if (paidAmt > 0) {
								await addPaymentRecord(
									newEnr.id,
									paidAmt,
									course.fee,
									cp.paymentMethod,
									dayjs().format("YYYY-MM-DD"),
								);
							}
						}
					}
				}

				toast.success("수강생 정보가 수정되었습니다.");
				form.reset();
				setCoursePayments([]);
				setSelectedExistingStudent(null);
				setNameSearch("");
				onClose();
			} else {
				// 신규 등록 — 동일 이름+전화번호 중복 체크
				const duplicate = students.find(
					(s) => s.name === values.name && s.phone === values.phone,
				);
				if (duplicate) {
					toast.warning(
						"동일한 이름과 전화번호의 수강생이 이미 있습니다. 위 목록에서 선택해주세요.",
					);
					return;
				}

				const newStudent = await addStudent(formData as StudentFormData);

				if (coursePayments.length > 0 && newStudent) {
					const currentQuarter = getCurrentQuarter();
					for (const cp of coursePayments) {
						const course = getCourseById(cp.courseId);
						if (course) {
							const hasPaidInit = !cp.isExempt && cp.paidAmount > 0;
							await addEnrollment({
								studentId: newStudent.id,
								courseId: cp.courseId,
								paidAmount: cp.isExempt ? 0 : cp.paidAmount,
								paymentStatus: getPaymentStatus(cp, course.fee),
								paidAt: hasPaidInit ? dayjs().format("YYYY-MM-DD") : undefined,
								paymentMethod: cp.paymentMethod,
								discountAmount: cp.discountAmount,
								...(appConfig.enableQuarterSystem && {
									quarter: currentQuarter,
								}),
							});

							// 납부 레코드 생성
							const newEnrollment = useEnrollmentStore
								.getState()
								.enrollments.find(
									(e) =>
										e.studentId === newStudent.id && e.courseId === cp.courseId,
								);
							if (newEnrollment) {
								const paidAmt = cp.isExempt ? 0 : cp.paidAmount;
								if (paidAmt > 0) {
									await addPaymentRecord(
										newEnrollment.id,
										paidAmt,
										course.fee,
										cp.paymentMethod,
										dayjs().format("YYYY-MM-DD"),
									);
								}
							}
						}
					}
				}

				toast.success("수강생이 등록되었습니다.");
				form.reset();
				setCoursePayments([]);
				setSelectedExistingStudent(null);
				setNameSearch("");
				setTimeout(() => {
					nameInputRef.current?.focus();
				}, 100);
			}
		} catch (error) {
			console.error("Validation failed:", error);
		}
	};

	// 강좌 상태 확인 함수
	const getCourseStatus = (courseId: string) => {
		const isSelected = coursePayments.some((cp) => cp.courseId === courseId);
		const count = enrollments.filter((e) => e.courseId === courseId).length;
		const course = getCourseById(courseId);
		if (!course) return { isDisabled: true, label: "" };

		const maxStudentsLimit =
			getPlan() === "trial"
				? getLimit("maxStudentsPerCourse")
				: course.maxStudents;
		const effectiveMax = Math.min(course.maxStudents, maxStudentsLimit);
		const isFull = count >= effectiveMax;

		return {
			isSelected,
			isFull: isFull && !isSelected,
			isDisabled: isSelected || isFull,
			count,
		};
	};

	const handleDelete = async () => {
		if (!editingStudent) return;
		await deleteStudent(editingStudent.id);
		toast.success("수강생이 삭제되었습니다.");
		setDeleteDialogOpen(false);
		onClose();
	};

	return (
		<>
			<Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
				<DialogContent className="max-w-[560px] max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							{editingStudent ? "수강생 정보 수정" : "수강생 등록"}
						</DialogTitle>
					</DialogHeader>

					{selectedExistingStudent && (
						<Alert className="relative">
							<Info className="h-4 w-4" />
							<AlertDescription className="pr-8">
								기존 수강생 "{selectedExistingStudent.name}" ({selectedExistingStudent.phone})의 정보를 수정합니다.
							</AlertDescription>
							<button
								type="button"
								className="absolute top-2 right-2 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
								onClick={() => {
									setSelectedExistingStudent(null);
									setCoursePayments(savedCoursePayments);
									setSavedCoursePayments([]);
									form.reset();
									setNameSearch("");
								}}
							>
								<X className="h-4 w-4" />
							</button>
						</Alert>
					)}

					<div className="space-y-3">
						{/* 기본 정보 */}
						<div className={cn("grid gap-3", appConfig.enableMemberFeature ? "grid-cols-[1fr_1fr_100px_auto]" : "grid-cols-[1fr_1fr_100px]", "items-end")}>
							<div className="space-y-1.5">
								<Label htmlFor="name">이름</Label>
								{student ? (
									<Input
										id="name"
										{...nameRegister}
										ref={(el: HTMLInputElement | null) => { nameRegister.ref(el); nameInputRef.current = el; }}
										placeholder="김철수"
										className="text-base"
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												phoneInputRef.current?.focus();
											}
										}}
									/>
								) : (
									<Popover open={nameComboboxOpen} onOpenChange={setNameComboboxOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={nameComboboxOpen}
												className={cn(
													"w-full justify-between text-base font-normal",
													!form.watch("name") && "text-muted-foreground"
												)}
											>
												{form.watch("name") || "김철수"}
												<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[240px] p-0" align="start">
											<Command shouldFilter={false}>
												<CommandInput
													placeholder="이름 검색..."
													value={nameSearch}
													onValueChange={(value) => {
														setNameSearch(value);
														form.setValue("name", value);
													}}
												/>
												<CommandList>
													{nameOptions.length === 0 && nameSearch.length > 0 && (
														<CommandEmpty>기존 수강생 없음</CommandEmpty>
													)}
													{nameOptions.map((opt) => (
														<CommandItem
															key={opt.key}
															value={opt.key}
															onSelect={() => handleNameSelect(opt.key)}
														>
															<div className="flex justify-between w-full">
																<span>{opt.value}</span>
																<span className="text-muted-foreground text-sm">{opt.phone}</span>
															</div>
														</CommandItem>
													))}
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								)}
								{form.formState.errors.name && (
									<p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
								)}
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="phone">전화번호</Label>
								<Input
									id="phone"
									ref={phoneInputRef}
									value={form.watch("phone")}
									onChange={handlePhoneChange}
									placeholder="01012341234"
									maxLength={13}
									className="text-base"
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											birthDateInputRef.current?.focus();
										}
									}}
								/>
								{form.formState.errors.phone && (
									<p className="text-sm text-red-500">{form.formState.errors.phone.message}</p>
								)}
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="birthDate">생년월일</Label>
								<Input
									id="birthDate"
									{...birthDateRegister}
									ref={(el: HTMLInputElement | null) => { birthDateRegister.ref(el); birthDateInputRef.current = el; }}
									placeholder="630201"
									maxLength={6}
									className="text-base"
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											addressInputRef.current?.focus();
										}
									}}
								/>
							</div>

							{appConfig.enableMemberFeature && (
								<div className="flex items-center gap-2 pb-0.5">
									<Controller
										control={form.control}
										name="isMember"
										render={({ field }) => (
											<div className="flex items-center gap-2">
												<Switch
													id="isMember"
													checked={field.value}
													onCheckedChange={(checked) => {
														field.onChange(checked);
														handleMemberChange(checked);
													}}
												/>
												<Label htmlFor="isMember" className="text-sm cursor-pointer whitespace-nowrap">
													{field.value ? "회원" : "비회원"}
												</Label>
											</div>
										)}
									/>
								</div>
							)}
						</div>

						{!appConfig.hideAddressField && (
							<div className="space-y-1.5">
								<Label htmlFor="address">주소</Label>
								<Input
									id="address"
									{...addressRegister}
									ref={(el: HTMLInputElement | null) => { addressRegister.ref(el); addressInputRef.current = el; }}
									placeholder="서울시 강남구"
									className="text-base"
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											notesInputRef.current?.focus();
										}
									}}
								/>
							</div>
						)}

						<div className="space-y-1.5">
							<Label htmlFor="notes">메모</Label>
							<Textarea
								id="notes"
								{...notesRegister}
								ref={(el: HTMLTextAreaElement | null) => { notesRegister.ref(el); (notesInputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el; }}
								rows={2}
								placeholder="추가 정보"
								className="text-base"
								onKeyDown={(e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										handleSubmit();
									}
								}}
							/>
						</div>

						{/* 구분선 */}
						<div className="border-t" />

						{/* 강좌 */}
						<div className="space-y-1.5">
							<Label>강좌 신청</Label>
							<Select
								key={courseSelectKey}
								onValueChange={handleAddCourse}
							>
								<SelectTrigger className="text-base">
									<SelectValue placeholder="강좌를 선택하세요" />
								</SelectTrigger>
								<SelectContent>
									{courses.map((course) => {
										const status = getCourseStatus(course.id);
										const count =
											status.count ??
											enrollments.filter((e) => e.courseId === course.id).length;
										const label = `${course.name} (${course.fee.toLocaleString()}원) - ${count}/${course.maxStudents}명`;
										return (
											<SelectItem
												key={course.id}
												value={course.id}
												disabled={status.isDisabled}
											>
												<span
													className={cn(
														status.isSelected && "line-through text-muted-foreground"
													)}
												>
													{label}
													{status.isSelected && " [선택됨]"}
													{status.isFull && " [정원 마감]"}
												</span>
											</SelectItem>
										);
									})}
								</SelectContent>
							</Select>
						</div>

						{coursePayments.length > 0 && (
							<div className="flex flex-col gap-2">
								{coursePayments.map((cp) => {
									const course = getCourseById(cp.courseId);
									if (!course) return null;
									const effectiveFee = course.fee - (cp.discountAmount || 0);
									return (
										<div
											key={cp.courseId}
											className="p-2.5 bg-muted/50 rounded-md border"
										>
											{/* 헤더: 강좌명 + 금액 + 삭제 */}
											<div className="flex items-center justify-between mb-1.5">
												<div className="flex items-center gap-1.5">
													<span className="font-semibold text-[13px]">{course.name}</span>
													{cp.isExempt ? (
														<Badge variant="secondary" className="bg-purple-100 text-purple-700">면제</Badge>
													) : cp.discountAmount > 0 ? (
														<>
															<Badge variant="secondary" className="bg-blue-100 text-blue-700">{effectiveFee.toLocaleString()}원</Badge>
															<span className="text-[11px] text-muted-foreground line-through">
																{course.fee.toLocaleString()}원
															</span>
														</>
													) : (
														<Badge variant="secondary" className="bg-blue-100 text-blue-700">{course.fee.toLocaleString()}원</Badge>
													)}
												</div>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="h-7 w-7 text-destructive hover:text-destructive"
													onClick={() => handleRemoveCourse(cp.courseId)}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>

											{/* 납부 */}
											<div className="flex items-center gap-1.5 mb-1.5">
												<span className="text-xs text-muted-foreground w-11">납부</span>
												<Input
													type="number"
													value={cp.paidAmount}
													onChange={(e) => handlePaymentChange(cp.courseId, Number(e.target.value) || 0)}
													min={0}
													max={effectiveFee}
													className="w-[120px] h-7 text-sm"
													disabled={cp.isExempt}
												/>
												<Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => handlePaymentChange(cp.courseId, effectiveFee)} disabled={cp.isExempt}>완납</Button>
												<Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => handlePaymentChange(cp.courseId, 0)} disabled={cp.isExempt}>미납</Button>
												<div className="ml-auto flex gap-0.5">
													{(["cash", "card", "transfer"] as PaymentMethod[]).map((method) => (
														<Button
															key={method}
															type="button"
															variant={cp.paymentMethod === method ? "default" : "outline"}
															size="sm"
															className="h-7 text-xs px-2"
															disabled={cp.isExempt}
															onClick={() => handlePaymentMethodChange(cp.courseId, method)}
														>
															{method === "cash" ? "현금" : method === "card" ? "카드" : "이체"}
														</Button>
													))}
												</div>
											</div>

											{/* 할인 + 면제 */}
											<div className="flex items-center gap-1.5">
												<span className="text-xs text-muted-foreground w-11">할인</span>
												<Input
													type="number"
													value={cp.discountAmount}
													onChange={(e) => handleDiscountChange(cp.courseId, Number(e.target.value) || 0)}
													min={0}
													max={course.fee}
													className="w-[120px] h-7 text-sm"
													disabled={cp.isExempt}
												/>
												<Button
													type="button"
													variant={cp.isExempt ? "destructive" : "outline"}
													size="sm"
													className="h-7 text-xs"
													onClick={() => handleExemptToggle(cp.courseId)}
												>
													면제
												</Button>
											</div>
										</div>
									);
								})}

								{/* 합계 */}
								<div className="text-right text-muted-foreground text-xs px-1 py-0.5">
									총 납부: {"\u20A9"}
									{coursePayments
										.filter((cp) => !cp.isExempt)
										.reduce((sum, cp) => sum + cp.paidAmount, 0)
										.toLocaleString()}
									{coursePayments.some((cp) => cp.discountAmount > 0) &&
										` (할인 \u20A9${coursePayments.reduce((sum, cp) => sum + (cp.discountAmount || 0), 0).toLocaleString()})`}
									{coursePayments.some((cp) => cp.isExempt) &&
										` (면제 ${coursePayments.filter((cp) => cp.isExempt).length}건)`}
								</div>
							</div>
						)}
					</div>

					<DialogFooter className={cn(editingStudent ? "justify-between" : "justify-end", "sm:justify-between")}>
						{editingStudent && (
							<Button
								type="button"
								variant="destructive"
								onClick={() => setDeleteDialogOpen(true)}
							>
								삭제
							</Button>
						)}
						<div className="flex gap-2">
							<Button type="button" variant="outline" onClick={onClose} className="text-base">
								취소
							</Button>
							<Button type="button" onClick={handleSubmit} className="text-base">
								{editingStudent ? "수정" : "등록"}
							</Button>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* 삭제 확인 다이얼로그 */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>수강생을 삭제하시겠습니까?</AlertDialogTitle>
						<AlertDialogDescription>
							"{editingStudent?.name}" 수강생을 삭제합니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={handleDelete}
						>
							삭제
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};

export default StudentForm;
