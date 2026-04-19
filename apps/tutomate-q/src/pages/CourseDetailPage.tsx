import { Download, Pencil, Trash2, FileSpreadsheet, FileText } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import dayjs from "dayjs";
import {
	Button,
	Dialog, DialogContent, DialogHeader, DialogTitle,
	AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
	AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
	CourseForm, PaymentManagementTable, StudentForm, PageEnter,
} from "@tutomate/ui";
import { useCourseStore } from "@tutomate/core";
import { useEnrollmentStore } from "@tutomate/core";
import { usePaymentRecordStore } from "@tutomate/core";
import { useStudentStore } from "@tutomate/core";
import { appConfig, isActiveEnrollment } from "@tutomate/core";
import type { Enrollment, Student, EnrollmentFormData } from "@tutomate/core";
import {
	COURSE_STUDENT_EXPORT_FIELDS,
	exportCourseStudentsToCSV,
	exportCourseStudentsToExcel,
	getCurrentQuarter,
} from "@tutomate/core";

const DEFAULT_EXPORT_FIELDS = [
	"name",
	"phone",
	"email",
	"paymentStatus",
	"paidAmount",
];

const CourseDetailPage: React.FC = () => {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { getCourseById, loadCourses, deleteCourse } = useCourseStore();
	const { loadStudents, getStudentById } = useStudentStore();
	const { enrollments, loadEnrollments, withdrawEnrollment, addEnrollment } =
		useEnrollmentStore();
	const { loadRecords, addPayment } = usePaymentRecordStore();

	const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
	const [isExportModalVisible, setIsExportModalVisible] = useState(false);
	const [selectedExportFields, setSelectedExportFields] = useState<string[]>(
		DEFAULT_EXPORT_FIELDS,
	);
	const [dragIdx, setDragIdx] = useState<number | null>(null);
	const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

	const selectedQuarter = searchParams.get('q') || getCurrentQuarter();
	const [isCourseEditVisible, setIsCourseEditVisible] = useState(false);
	const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
	const [isStudentEditVisible, setIsStudentEditVisible] = useState(false);

	// Delete confirmation dialogs
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [removeStudentsDialogOpen, setRemoveStudentsDialogOpen] = useState(false);

	useEffect(() => {
		loadCourses();
		loadStudents();
		loadEnrollments();
		loadRecords();
	}, [loadCourses, loadStudents, loadEnrollments, loadRecords]);

	const course = id ? getCourseById(id) : undefined;
	// 분기 시스템: 해당 분기 수강생만 (strict 매칭 — 분기 미지정 legacy 제외)
	const courseEnrollments = appConfig.enableQuarterSystem && selectedQuarter
		? enrollments.filter((e) => e.courseId === id && isActiveEnrollment(e) && e.quarter === selectedQuarter)
		: enrollments.filter((e) => e.courseId === id && isActiveEnrollment(e));

	// 분기 미지정 legacy 수강생 (별도 표시용)
	const legacyEnrollments = useMemo(
		() => appConfig.enableQuarterSystem && selectedQuarter
			? enrollments.filter((e) => e.courseId === id && isActiveEnrollment(e) && !e.quarter)
			: [],
		[enrollments, id, selectedQuarter],
	);

	const allCourseEnrollments = useMemo(
		() => enrollments.filter((e) => e.courseId === id),
		[enrollments, id],
	);

	const handleImportFromQuarter = useCallback(async (studentIds: string[], quarter: string) => {
		// 이미 해당 분기에 등록된 수강생 제외 (중복 방지)
		const existingStudentIds = new Set(
			enrollments
				.filter((e) => e.courseId === id && e.quarter === quarter && isActiveEnrollment(e))
				.map((e) => e.studentId)
		);
		const newStudentIds = studentIds.filter((sid) => !existingStudentIds.has(sid));
		const skippedCount = studentIds.length - newStudentIds.length;

		for (const studentId of newStudentIds) {
			await addEnrollment({
				courseId: id!,
				studentId,
				paymentStatus: 'pending',
				paidAmount: 0,
				discountAmount: 0,
				quarter,
			} as EnrollmentFormData);
		}

		if (skippedCount > 0) {
			toast.success(`${newStudentIds.length}명을 가져왔습니다. (${skippedCount}명은 이미 등록됨)`);
		} else {
			toast.success(`${newStudentIds.length}명의 수강생을 가져왔습니다.`);
		}
	}, [id, addEnrollment, enrollments]);

	const nonExemptEnrollments = courseEnrollments.filter(
		(e) => e.paymentStatus !== "exempt",
	);
	const totalRevenue = nonExemptEnrollments.reduce(
		(sum, e) => sum + e.paidAmount,
		0,
	);
	const completedPayments = courseEnrollments.filter(
		(e) => e.paymentStatus === "completed",
	).length;

	const handleDeleteCourse = async () => {
		if (!course) return;
		await deleteCourse(course.id);
		toast.success("강좌가 삭제되었습니다.");
		navigate("/courses");
	};

	const handleRemoveStudents = async (enrollmentIds: string[], refundAmount?: number) => {
		for (const id of enrollmentIds) {
			// 철회 전에 원본 paymentMethod 캡처 (환불 record에 동일 수단 사용)
			const originalEnrollment = enrollments.find((e) => e.id === id);
			const originalMethod = originalEnrollment?.paymentMethod;
			await withdrawEnrollment(id);
			if (refundAmount && refundAmount > 0) {
				await addPayment(
					id,
					-refundAmount,
					course?.fee || 0,
					originalMethod,
					dayjs().format("YYYY-MM-DD"),
					'수강 철회 환불',
				);
			}
		}
		setSelectedRowKeys([]);
		await loadEnrollments();
		await loadRecords();
		const refundMsg = refundAmount ? ` (환불 ₩${refundAmount.toLocaleString()})` : '';
		toast.success(`${enrollmentIds.length}명의 수강이 철회되었습니다.${refundMsg}`);
	};

	const handleExport = (type: "excel" | "csv") => {
		if (selectedExportFields.length === 0) {
			toast.warning("내보낼 필드를 1개 이상 선택해주세요.");
			return;
		}

		const data = courseEnrollments
			.map((e) => ({ student: getStudentById(e.studentId), enrollment: e }))
			.filter((es): es is { student: NonNullable<typeof es.student>; enrollment: Enrollment } => !!es.student);

		if (data.length === 0) {
			toast.warning("내보낼 수강생이 없습니다.");
			return;
		}

		if (!course) return;
		try {
			if (type === "excel") {
				exportCourseStudentsToExcel(course, data, selectedExportFields);
				toast.success("Excel 파일이 다운로드되었습니다.");
			} else {
				exportCourseStudentsToCSV(course, data, selectedExportFields);
				toast.success("CSV 파일이 다운로드되었습니다.");
			}
			setIsExportModalVisible(false);
		} catch {
			toast.error("내보내기에 실패했습니다.");
		}
	};

	const allFieldKeys = COURSE_STUDENT_EXPORT_FIELDS.map((f) => f.key);
	const isAllSelected = selectedExportFields.length === allFieldKeys.length;

	const studentCount = courseEnrollments.length;

	if (!id || !course) {
		return <div>강좌를 찾을 수 없습니다.</div>;
	}

	return (
		<PageEnter>
			{/* 브레드크럼 + 내보내기 */}
			<div className="flex items-center justify-between mb-1.5">
				<div className="flex items-baseline gap-1.5">
					<a
						onClick={() => navigate("/courses")}
						className="text-[13px] text-muted-foreground cursor-pointer hover:underline"
					>
						강좌 관리
					</a>
					<span className="text-muted-foreground/50 text-xs">/</span>
					<span className="text-[15px] font-semibold">{course.name}</span>
				</div>
				<div className="flex items-center gap-1.5">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setIsExportModalVisible(true)}
						disabled={courseEnrollments.length === 0}
					>
						<Download className="h-4 w-4" />
						내보내기
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setIsCourseEditVisible(true)}
					>
						<Pencil className="h-4 w-4" />
						수정
					</Button>
					<Button
						variant="destructive"
						size="sm"
						onClick={() => setDeleteDialogOpen(true)}
					>
						<Trash2 className="h-4 w-4" />
						삭제
					</Button>
				</div>
			</div>

			{/* Delete course dialog */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{studentCount > 0 ? "수강생이 있는 강좌입니다!" : "강좌를 삭제하시겠습니까?"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{studentCount > 0
								? `"${course.name}" 강좌에 ${studentCount}명의 수강생이 있습니다. 삭제 시 수강 기록도 함께 삭제됩니다.`
								: `"${course.name}" 강좌를 삭제합니다.`}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={handleDeleteCourse}
						>
							삭제
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* 부가 정보 + 통계 */}
			<div className="flex gap-2.5 mb-3">
				{[
					{ label: "강사", value: course.instructorName },
					{ label: "강의실", value: course.classroom },
					{ label: "수강료", value: `₩${course.fee.toLocaleString()}` },
					{
						label: "수강생",
						value: `${courseEnrollments.length}/${course.maxStudents}`,
						colorClass: courseEnrollments.length >= course.maxStudents ? "text-error" : "",
					},
					{ label: "총 수익", value: `₩${totalRevenue.toLocaleString()}`, colorClass: "text-success" },
					{
						label: "완납률",
						value: `${nonExemptEnrollments.length > 0 ? ((completedPayments / nonExemptEnrollments.length) * 100).toFixed(1) : "0.0"}%`,
						colorClass: nonExemptEnrollments.length > 0 && completedPayments === nonExemptEnrollments.length
							? "text-success"
							: "text-error",
					},
				].map((item) => (
					<div
						key={item.label}
						className="flex-1 px-3 py-1.5 rounded-md border"
					>
						<div className="text-[11px] text-muted-foreground">
							{item.label}
						</div>
						<div className={`text-sm font-semibold mt-0.5 ${(item as any).colorClass || ''}`}>
							{item.value}
						</div>
					</div>
				))}
			</div>

			{/* 분기 미지정 legacy 수강생 안내 */}
			{legacyEnrollments.length > 0 && (
				<div className="mb-3 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-[13px] text-warning flex items-center gap-2">
					<span>⚠</span>
					<span>분기 미지정 수강생 {legacyEnrollments.length}명이 있습니다. 이 인원은 현재 분기 정원에 포함되지 않습니다.</span>
				</div>
			)}

			{/* Remove students dialog */}
			<AlertDialog open={removeStudentsDialogOpen} onOpenChange={setRemoveStudentsDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>수강생 제거</AlertDialogTitle>
						<AlertDialogDescription>
							{selectedRowKeys.length}명의 수강생을 제거하시겠습니까?
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => handleRemoveStudents(selectedRowKeys as string[])}
						>
							제거
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<PaymentManagementTable
				courseId={id}
				courseFee={course.fee}
				enrollments={courseEnrollments}
				showMemberColumn
				selectedQuarter={selectedQuarter}
				allEnrollments={allCourseEnrollments}
				onImportFromQuarter={handleImportFromQuarter}
				onStudentClick={(studentId) => {
					const student = getStudentById(studentId);
					if (student) {
						setSelectedStudent(student);
						setIsStudentEditVisible(true);
					}
				}}
				onRemoveEnrollments={handleRemoveStudents}
				rowSelection={{
					selectedRowKeys,
					onChange: (keys) => setSelectedRowKeys(keys),
				}}
			/>

			{/* 내보내기 모달 */}
			<Dialog open={isExportModalVisible} onOpenChange={setIsExportModalVisible}>
				<DialogContent className="max-w-[680px]">
					<DialogHeader>
						<DialogTitle>수강생 내보내기</DialogTitle>
					</DialogHeader>

					<div style={{ marginTop: 8 }}>
						<div className="flex justify-between items-center mb-3">
							<button type="button" className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
								onClick={() => setSelectedExportFields(isAllSelected ? [] : allFieldKeys)}>
								{isAllSelected ? '선택 해제' : '전체 선택'}
							</button>
							<span className="text-xs text-muted-foreground">{selectedExportFields.length}개 선택 · 드래그로 순서 변경</span>
						</div>

						<div className="flex flex-wrap gap-2 mb-4">
							{COURSE_STUDENT_EXPORT_FIELDS.map((field) => {
								const isChecked = selectedExportFields.includes(field.key);
								return (
									<button key={field.key} type="button"
										onClick={() => setSelectedExportFields((prev) => isChecked ? prev.filter((k) => k !== field.key) : [...prev, field.key])}
										className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors cursor-pointer ${
											isChecked ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30'
										}`}>
										{field.label}
									</button>
								);
							})}
						</div>

						{selectedExportFields.length > 0 && (
							<div className="flex flex-wrap gap-1.5 mb-4 p-3 rounded-lg bg-muted/30 border border-dashed border-border">
								{selectedExportFields.map((key, idx) => {
									const field = COURSE_STUDENT_EXPORT_FIELDS.find((f) => f.key === key);
									if (!field) return null;
									const isDragging = dragIdx === idx;
									const showLeftBar = dragOverIdx === idx && dragIdx !== null && dragIdx > idx;
									const showRightBar = dragOverIdx === idx && dragIdx !== null && dragIdx < idx;
									return (
										<span key={key} draggable
											onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(idx)); setDragIdx(idx); }}
											onDragOver={(e) => { e.preventDefault(); if (dragOverIdx !== idx) setDragOverIdx(idx); }}
											onDrop={(e) => { e.preventDefault(); const fromIdx = Number(e.dataTransfer.getData('text/plain')); setDragIdx(null); setDragOverIdx(null); if (fromIdx === idx) return; setSelectedExportFields((prev) => { const next = [...prev]; const [moved] = next.splice(fromIdx, 1); next.splice(idx, 0, moved); return next; }); }}
											onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
											className={`relative px-2.5 py-1 rounded-md text-xs font-medium border cursor-grab active:cursor-grabbing select-none transition-opacity duration-150 ${isDragging ? 'opacity-20' : 'bg-background'}`}>
											{showLeftBar && <span className="absolute -left-1.5 top-0 bottom-0 w-0.5 bg-primary rounded-full" />}
											{field.label}
											{showRightBar && <span className="absolute -right-1.5 top-0 bottom-0 w-0.5 bg-primary rounded-full" />}
										</span>
									);
								})}
							</div>
						)}

						{selectedExportFields.length > 0 && courseEnrollments.length > 0 && (
							<div className="rounded-lg border overflow-hidden mb-4">
								<div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2 bg-muted/30">미리보기</div>
								<div className="overflow-x-auto">
									<table className="w-full text-xs">
										<thead><tr className="border-b bg-muted/20">
											{selectedExportFields.map((key) => { const f = COURSE_STUDENT_EXPORT_FIELDS.find((x) => x.key === key); return <th key={key} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{f?.label}</th>; })}
										</tr></thead>
										<tbody>
											{courseEnrollments.slice(0, 3).map((enrollment) => {
												const student = getStudentById(enrollment.studentId);
												if (!student) return null;
												return (
													<tr key={enrollment.id} className="border-b last:border-0">
														{selectedExportFields.map((key) => { const f = COURSE_STUDENT_EXPORT_FIELDS.find((x) => x.key === key); const val = f ? f.getValue(student, enrollment) : ''; return <td key={key} className="px-3 py-2 whitespace-nowrap truncate max-w-[150px]">{val || '-'}</td>; })}
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>
							</div>
						)}
					</div>

					<div className="flex gap-2">
						<Button className="flex-1" onClick={() => handleExport("excel")} disabled={selectedExportFields.length === 0}>
							<FileSpreadsheet className="h-4 w-4" />Excel
						</Button>
						<Button variant="outline" className="flex-1" onClick={() => handleExport("csv")} disabled={selectedExportFields.length === 0}>
							<FileText className="h-4 w-4" />CSV
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<StudentForm
				visible={isStudentEditVisible}
				onClose={() => {
					setIsStudentEditVisible(false);
					setSelectedStudent(null);
				}}
				student={selectedStudent}
				hideDelete
			/>

			<CourseForm
				visible={isCourseEditVisible}
				onClose={() => setIsCourseEditVisible(false)}
				course={course}
			/>
		</PageEnter>
	);
};

export default CourseDetailPage;
