import { X, Info, ChevronsUpDown } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useStudentStore } from "@tutomate/core";
import type { Student, StudentFormData } from "@tutomate/core";
import { formatPhone, parseBirthDate } from "@tutomate/core";
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

				toast.success("수강생이 등록되었습니다.");
				form.reset();
				setSelectedExistingStudent(null);
				setNameSearch("");
				setTimeout(() => {
					nameInputRef.current?.focus();
				}, 100);
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
									<p style={{ fontSize: 13, color: 'hsl(var(--destructive))' }}>{form.formState.errors.name.message}</p>
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
									<p style={{ fontSize: 13, color: 'hsl(var(--destructive))' }}>{form.formState.errors.phone.message}</p>
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
					</div>

					<DialogFooter style={{ marginTop: 20 }} className={cn(editingStudent ? "justify-between" : "justify-end", "sm:justify-between")}>
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
