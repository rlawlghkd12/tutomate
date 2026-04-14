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
				<DialogContent className="max-w-[580px]">
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
									form.reset();
									setNameSearch("");
								}}
							>
								<X className="h-4 w-4" />
							</button>
						</Alert>
					)}

					{/* 기본 정보 섹션 */}
					<div className="rounded-xl border p-4 space-y-3">
						<div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">기본 정보</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<Label htmlFor="name">이름</Label>
								{student ? (
									<Input
										id="name"
										{...nameRegister}
										ref={(el: HTMLInputElement | null) => { nameRegister.ref(el); nameInputRef.current = el; }}
										placeholder="이름"
										className="text-base"
										onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); phoneInputRef.current?.focus(); } }}
									/>
								) : (
									<div className="relative">
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
												if (e.key === "ArrowDown") { e.preventDefault(); setHighlightedIndex((prev) => Math.min(prev + 1, nameOptions.length - 1)); }
												else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightedIndex((prev) => Math.max(prev - 1, 0)); }
												else if (e.key === "Enter") { e.preventDefault(); if (highlightedIndex >= 0 && nameOptions[highlightedIndex]) { handleNameSelect(nameOptions[highlightedIndex].key); setNameComboboxOpen(false); } else { setNameComboboxOpen(false); phoneInputRef.current?.focus(); } setHighlightedIndex(-1); }
												else if (e.key === "Tab" || e.key === "Escape") { setNameComboboxOpen(false); setHighlightedIndex(-1); }
											}}
											autoComplete="off"
										/>
										{nameComboboxOpen && nameOptions.length > 0 && (
											<div className="absolute top-full left-0 z-50 min-w-full mt-1 rounded-lg border bg-popover shadow-lg max-h-[200px] overflow-y-auto">
												{nameOptions.map((opt, idx) => (
													<button key={opt.key} type="button"
														className={cn("w-full px-3 py-2 text-left text-sm flex gap-4 whitespace-nowrap", idx === highlightedIndex && "bg-accent")}
														onMouseDown={(e) => e.preventDefault()}
														onClick={() => { handleNameSelect(opt.key); setNameComboboxOpen(false); setHighlightedIndex(-1); }}
														onMouseEnter={() => setHighlightedIndex(idx)}
													>
														<span>{opt.value}</span>
														<span className="text-muted-foreground">{opt.phone}</span>
													</button>
												))}
											</div>
										)}
									</div>
								)}
								{form.formState.errors.name && (
									<p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
								)}
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="phone">전화번호</Label>
								<Input id="phone" ref={phoneInputRef} value={form.watch("phone")} onChange={handlePhoneChange}
									placeholder="01000000000" maxLength={13} className="text-base"
									onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); birthDateInputRef.current?.focus(); } }}
								/>
								{form.formState.errors.phone && (
									<p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
								)}
							</div>
						</div>

						{/* 회원 여부 (Q버전만) */}
						{appConfig.enableMemberFeature && (
							<Controller control={form.control} name="isMember"
								render={({ field }) => (
									<div className="flex justify-between items-center px-3 py-2.5 rounded-lg bg-muted/50">
										<span className="text-sm font-medium">회원 여부</span>
										<div className="flex items-center gap-2">
											<span className={cn("text-sm font-medium", field.value ? "text-primary" : "text-muted-foreground")}>
												{field.value ? "회원" : "비회원"}
											</span>
											<Switch id="isMember" checked={field.value} onCheckedChange={field.onChange} />
										</div>
									</div>
								)}
							/>
						)}
					</div>

					{/* 추가 정보 섹션 */}
					<div className="rounded-xl border p-4 space-y-3">
						<div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">추가 정보</div>
						<div className="grid grid-cols-[140px_1fr] gap-3">
							<div className="space-y-1.5">
								<Label htmlFor="birthDate">생년월일</Label>
								<Input id="birthDate" {...birthDateRegister}
									ref={(el: HTMLInputElement | null) => { birthDateRegister.ref(el); birthDateInputRef.current = el; }}
									placeholder="6자리" maxLength={6} className="text-base"
									onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addressInputRef.current?.focus(); } }}
								/>
							</div>
							{!appConfig.hideAddressField && (
								<div className="space-y-1.5">
									<Label htmlFor="address">주소</Label>
									<Input id="address" {...addressRegister}
										ref={(el: HTMLInputElement | null) => { addressRegister.ref(el); addressInputRef.current = el; }}
										placeholder="주소를 입력해주세요" className="text-base"
										onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); notesInputRef.current?.focus(); } }}
									/>
								</div>
							)}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="notes">메모</Label>
							<Input id="notes" {...notesRegister}
								ref={(el: HTMLInputElement | null) => { notesRegister.ref(el); (notesInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el; }}
								placeholder="추가 정보를 입력하세요" className="text-base"
								onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
							/>
						</div>
					</div>

					{editingStudent && <EnrollmentHistory studentId={editingStudent.id} />}

					<DialogFooter className={cn(editingStudent && !hideDelete ? "justify-between" : "justify-end")}>
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
	const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null);

	const history = enrollments
		.filter((e) => e.studentId === studentId)
		.sort((a, b) => (b.enrolledAt || '').localeCompare(a.enrolledAt || ''));

	if (history.length === 0) return null;

	const statusBadge: Record<string, { text: string; bg: string; color: string }> = {
		pending: { text: '미납', bg: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))' },
		partial: { text: '부분납부', bg: 'hsl(var(--warning) / 0.1)', color: 'hsl(var(--warning))' },
		completed: { text: '완납', bg: 'hsl(var(--success) / 0.1)', color: 'hsl(var(--success))' },
		exempt: { text: '면제', bg: 'hsl(var(--info) / 0.1)', color: 'hsl(var(--info))' },
		withdrawn: { text: '철회', bg: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
	};

	// 분기 목록 추출 (최신 먼저)
	const quarters = [...new Set(history.map((e) => e.quarter || '미지정'))].sort((a, b) => b.localeCompare(a));

	const quarterLabel = (q: string) => {
		if (q === '미지정') return '미지정';
		const [year, qNum] = q.split('-');
		return `${year.slice(2)}년 ${qNum.replace('Q', '')}분기`;
	};

	// 선택된 분기 (없으면 전체)
	const filtered = selectedQuarter
		? history.filter((e) => (e.quarter || '미지정') === selectedQuarter)
		: history;

	return (
		<div style={{ marginTop: 16, borderTop: '1px solid hsl(var(--border))', paddingTop: 16 }}>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
				<div style={{ fontSize: '0.93rem', fontWeight: 600 }}>수강 이력</div>
				<div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
					<button
						type="button"
						onClick={() => setSelectedQuarter(null)}
						style={{
							padding: '2px 10px', borderRadius: 12, border: 'none', cursor: 'pointer',
							fontSize: '0.71rem', fontWeight: 600,
							background: !selectedQuarter ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
							color: !selectedQuarter ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
						}}
					>전체</button>
					{quarters.map((q) => (
						<button
							key={q}
							type="button"
							onClick={() => setSelectedQuarter(q)}
							style={{
								padding: '2px 10px', borderRadius: 12, border: 'none', cursor: 'pointer',
								fontSize: '0.71rem', fontWeight: 600,
								background: selectedQuarter === q ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
								color: selectedQuarter === q ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
							}}
						>{quarterLabel(q)}</button>
					))}
				</div>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
				{filtered.map((e) => {
					const course = courses.find((c) => c.id === e.courseId);
					const status = statusBadge[e.paymentStatus] || { text: e.paymentStatus, bg: 'hsl(var(--muted))', color: 'inherit' };
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
							<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
								{e.paymentStatus !== PaymentStatus.WITHDRAWN && e.paymentStatus !== 'exempt' && (
									<span style={{ fontSize: '0.71rem', color: 'hsl(var(--muted-foreground))' }}>₩{e.paidAmount.toLocaleString()}</span>
								)}
								<span style={{
									fontSize: '0.79rem', fontWeight: 600, padding: '3px 10px', borderRadius: 10,
									background: status.bg, color: status.color,
								}}>{status.text}</span>
							</div>
						</div>
					);
				})}
				{filtered.length === 0 && (
					<div style={{ textAlign: 'center', padding: 16, color: 'hsl(var(--muted-foreground))', fontSize: '0.86rem' }}>
						해당 분기에 수강 이력이 없습니다
					</div>
				)}
			</div>
		</div>
	);
}

export default StudentForm;
