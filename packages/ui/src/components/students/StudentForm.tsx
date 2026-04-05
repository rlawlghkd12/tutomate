import { X, Info } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useStudentStore, useEnrollmentStore, useCourseStore } from "@tutomate/core";
import type { Student, StudentFormData } from "@tutomate/core";
import { formatPhone, parseBirthDate, isCourseEnded, PaymentStatus } from "@tutomate/core";
import { appConfig } from "@tutomate/core";

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
import { toast } from "sonner";
import { cn } from "../../lib/utils";

interface StudentFormProps {
	visible: boolean;
	onClose: () => void;
	student?: Student | null;
	hideDelete?: boolean;
	onCreated?: (student: Student) => void;
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
	hideDelete,
	onCreated,
}) => {
	const [submitting, setSubmitting] = useState(false);
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
	const nameInputRef = useRef<HTMLInputElement>(null);
	const phoneInputRef = useRef<HTMLInputElement>(null);
	const birthDateInputRef = useRef<HTMLInputElement>(null);
	const addressInputRef = useRef<HTMLInputElement>(null);
	const notesInputRef = useRef<HTMLTextAreaElement>(null);

	const nameRegister = form.register("name");
	const birthDateRegister = form.register("birthDate");
	const addressRegister = form.register("address");
	const notesRegister = form.register("notes");

	const [nameSearch, setNameSearch] = useState("");
	const [nameComboboxOpen, setNameComboboxOpen] = useState(false);
	const [highlightedIndex, setHighlightedIndex] = useState(-1);
	const [selectedExistingStudent, setSelectedExistingStudent] =
		useState<Student | null>(null);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	// 현재 편집 중인 수강생 (props로 받은 것 또는 자동완성으로 선택한 것)
	const editingStudent = student || selectedExistingStudent;

	useEffect(() => {
		if (visible && student) {
			// 수정 모드
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
			setSelectedExistingStudent(null);
			setNameSearch("");
			setTimeout(() => {
				nameInputRef.current?.focus();
			}, 100);
		}
	}, [visible, student, form]);

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
		setNameComboboxOpen(false);
		setNameSearch(existing.name);

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

		toast.info(`기존 수강생 "${existing.name}"님의 정보를 불러왔습니다.`);
		phoneInputRef.current?.focus();
	};

	const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		form.setValue("phone", formatPhone(e.target.value));
	};

	const handleSubmit = async () => {
		if (submitting) return;
		setSubmitting(true);
		try {
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

				toast.success("수강생 정보가 수정되었습니다.");
				form.reset();
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

				await addStudent(formData as StudentFormData);

				const createdStudent = useStudentStore.getState().students.find(
					(s) => s.name === formData.name && s.phone === formData.phone,
				);

				if (onCreated && createdStudent) {
					toast.success(`"${createdStudent.name}" 등록 완료`);
					onCreated(createdStudent);
					onClose();
				} else {
					toast.success("수강생이 등록되었습니다.");
				}
				form.reset();
				setSelectedExistingStudent(null);
				setNameSearch("");
			}
		} catch (error) {
			console.error("Validation failed:", error);
		}
	} finally {
			setSubmitting(false);
		}
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
				<DialogContent className="max-h-[90vh] overflow-y-auto" style={{ width: '70vw', maxWidth: 900 }}>
					<DialogHeader style={{ marginBottom: 12 }}>
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
						<div className={cn("grid gap-3", appConfig.enableMemberFeature ? "grid-cols-[1fr_1fr_140px_auto]" : "grid-cols-[1fr_1fr_140px]", "items-end")}>
							<div className="space-y-1.5">
								<Label htmlFor="name">이름</Label>
								{student ? (
									<Input
										id="name"
										{...nameRegister}
										ref={(el: HTMLInputElement | null) => { nameRegister.ref(el); nameInputRef.current = el; }}
										placeholder="이름"
										className="text-base"
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												phoneInputRef.current?.focus();
											}
										}}
									/>
								) : (
									<div style={{ position: 'relative' }}>
										<Input
											id="name"
											placeholder="이름"
											className="text-base"
											value={nameSearch}
											onChange={(e) => {
												setNameSearch(e.target.value);
												form.setValue("name", e.target.value);
												setNameComboboxOpen(e.target.value.length > 0);
												setHighlightedIndex(-1);
											}}
											onFocus={() => { if (nameSearch.length > 0) setNameComboboxOpen(true); }}
											onKeyDown={(e) => {
												if (e.key === "ArrowDown") {
													e.preventDefault();
													setHighlightedIndex((prev) => Math.min(prev + 1, nameOptions.length - 1));
												} else if (e.key === "ArrowUp") {
													e.preventDefault();
													setHighlightedIndex((prev) => Math.max(prev - 1, 0));
												} else if (e.key === "Enter") {
													e.preventDefault();
													if (highlightedIndex >= 0 && nameOptions[highlightedIndex]) {
														handleNameSelect(nameOptions[highlightedIndex].key);
														setNameComboboxOpen(false);
													} else {
														setNameComboboxOpen(false);
														phoneInputRef.current?.focus();
													}
													setHighlightedIndex(-1);
												} else if (e.key === "Tab") {
													setNameComboboxOpen(false);
													setHighlightedIndex(-1);
												} else if (e.key === "Escape") {
													setNameComboboxOpen(false);
													setHighlightedIndex(-1);
												}
											}}
											autoComplete="off"
										/>
										{nameComboboxOpen && nameOptions.length > 0 && (
											<div style={{
												position: 'absolute', top: '100%', left: 0, zIndex: 50, width: 'auto', minWidth: '100%',
												marginTop: 4, borderRadius: 8, border: '1px solid hsl(var(--border))',
												background: 'hsl(var(--popover))', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
												maxHeight: 200, overflowY: 'auto',
											}}>
												{nameOptions.map((opt, idx) => (
													<button
														key={opt.key}
														type="button"
														style={{
															width: '100%', padding: '8px 12px', border: 'none',
															background: idx === highlightedIndex ? 'hsl(var(--accent))' : 'transparent',
															cursor: 'pointer', textAlign: 'left',
															fontSize: '0.93rem', display: 'flex', gap: 16, whiteSpace: 'nowrap',
														}}
														onMouseDown={(e) => e.preventDefault()}
														onClick={() => { handleNameSelect(opt.key); setNameComboboxOpen(false); setHighlightedIndex(-1); }}
														onMouseEnter={() => setHighlightedIndex(idx)}
													>
														<span>{opt.value}</span>
														<span style={{ color: 'hsl(var(--muted-foreground))' }}>{opt.phone}</span>
													</button>
												))}
											</div>
										)}
									</div>
								)}
								{form.formState.errors.name && (
									<p style={{ fontSize: '0.93rem', color: 'hsl(var(--destructive))' }}>{form.formState.errors.name.message}</p>
								)}
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="phone">전화번호</Label>
								<Input
									id="phone"
									ref={phoneInputRef}
									value={form.watch("phone")}
									onChange={handlePhoneChange}
									placeholder="01000000000"
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
									<p style={{ fontSize: '0.93rem', color: 'hsl(var(--destructive))' }}>{form.formState.errors.phone.message}</p>
								)}
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="birthDate">생년월일</Label>
								<Input
									id="birthDate"
									{...birthDateRegister}
									ref={(el: HTMLInputElement | null) => { birthDateRegister.ref(el); birthDateInputRef.current = el; }}
									placeholder="6자리 입력"
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
													onCheckedChange={field.onChange}
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
									placeholder="주소를 입력해주세요"
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
					</div>

					{editingStudent && <EnrollmentHistory studentId={editingStudent.id} />}

					<DialogFooter style={{ marginTop: 20 }} className={cn(editingStudent ? "justify-between" : "justify-end", "sm:justify-between")}>
						{editingStudent && !hideDelete && (
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

function EnrollmentHistory({ studentId }: { studentId: string }) {
	const { enrollments } = useEnrollmentStore();
	const { courses } = useCourseStore();

	const history = enrollments
		.filter((e) => e.studentId === studentId)
		.sort((a, b) => (b.enrolledAt || '').localeCompare(a.enrolledAt || ''));

	if (history.length === 0) return null;

	const statusLabel: Record<string, { text: string; color: string }> = {
		pending: { text: '미납', color: 'hsl(var(--destructive))' },
		partial: { text: '부분납부', color: 'hsl(var(--warning))' },
		completed: { text: '완납', color: 'hsl(var(--success))' },
		exempt: { text: '면제', color: 'hsl(var(--info))' },
		withdrawn: { text: '철회', color: 'hsl(var(--muted-foreground))' },
	};

	// 분기별 그룹핑
	const grouped = new Map<string, typeof history>();
	for (const e of history) {
		const key = e.quarter || '미지정';
		if (!grouped.has(key)) grouped.set(key, []);
		grouped.get(key)!.push(e);
	}
	// 최신 분기 먼저
	const sortedGroups = [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0]));

	const quarterLabel = (q: string) => {
		if (q === '미지정') return '분기 미지정';
		const [year, qNum] = q.split('-');
		return `${year}년 ${qNum.replace('Q', '')}분기`;
	};

	return (
		<div style={{ marginTop: 16, borderTop: '1px solid hsl(var(--border))', paddingTop: 16 }}>
			<div style={{ fontSize: '0.93rem', fontWeight: 600, marginBottom: 8 }}>수강 이력</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 220, overflowY: 'auto' }}>
				{sortedGroups.map(([quarter, items]) => (
					<div key={quarter}>
						<div style={{ fontSize: '0.79rem', fontWeight: 600, color: 'hsl(var(--primary))', marginBottom: 4 }}>{quarterLabel(quarter)}</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
							{items.map((e) => {
								const course = courses.find((c) => c.id === e.courseId);
								const status = statusLabel[e.paymentStatus] || { text: e.paymentStatus, color: 'inherit' };
								const ended = course ? isCourseEnded(course) : false;
								return (
									<div key={e.id} style={{
										display: 'flex', justifyContent: 'space-between', alignItems: 'center',
										padding: '6px 10px', borderRadius: 6,
										background: e.paymentStatus === PaymentStatus.WITHDRAWN ? 'hsl(var(--muted) / 0.5)' : 'hsl(var(--muted) / 0.3)',
										opacity: e.paymentStatus === PaymentStatus.WITHDRAWN ? 0.6 : 1,
									}}>
										<div>
											<div style={{ fontSize: '0.86rem', fontWeight: 500, textDecoration: e.paymentStatus === PaymentStatus.WITHDRAWN ? 'line-through' : undefined }}>
												{course?.name || '삭제된 강좌'}
												{ended && <span style={{ fontSize: '0.71rem', color: 'hsl(var(--muted-foreground))', marginLeft: 4 }}>종료</span>}
											</div>
											<div style={{ fontSize: '0.71rem', color: 'hsl(var(--muted-foreground))' }}>
												{e.enrolledAt?.slice(0, 10) || '-'}
											</div>
										</div>
										<div style={{ textAlign: 'right' }}>
											<div style={{ fontSize: '0.79rem', fontWeight: 600, color: status.color }}>{status.text}</div>
											{e.paymentStatus !== PaymentStatus.WITHDRAWN && e.paymentStatus !== 'exempt' && (
												<div style={{ fontSize: '0.71rem', color: 'hsl(var(--muted-foreground))' }}>₩{e.paidAmount.toLocaleString()}</div>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export default StudentForm;
