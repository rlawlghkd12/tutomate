import { Download, Pencil, Trash2, FileSpreadsheet, FileText } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
	Button,
	Dialog, DialogContent, DialogHeader, DialogTitle,
	AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
	AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
	Checkbox, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
	CourseForm, PaymentManagementTable, StudentForm,
} from "@tutomate/ui";
import { useCourseStore } from "@tutomate/core";
import { useEnrollmentStore } from "@tutomate/core";
import { usePaymentRecordStore } from "@tutomate/core";
import { useStudentStore } from "@tutomate/core";
import { appConfig } from "@tutomate/core";
import type { Enrollment, Student } from "@tutomate/core";
import {
	COURSE_STUDENT_EXPORT_FIELDS,
	exportCourseStudentsToCSV,
	exportCourseStudentsToExcel,
	getCurrentQuarter,
	getQuarterOptions,
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
	const { getCourseById, loadCourses, deleteCourse } = useCourseStore();
	const { getEnrollmentCountByCourseId } = useEnrollmentStore();
	const { loadStudents, getStudentById } = useStudentStore();
	const { enrollments, loadEnrollments, withdrawEnrollment } =
		useEnrollmentStore();
	const { loadRecords } = usePaymentRecordStore();

	const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
	const [isExportModalVisible, setIsExportModalVisible] = useState(false);
	const [selectedExportFields, setSelectedExportFields] = useState<string[]>(
		DEFAULT_EXPORT_FIELDS,
	);

	const [selectedQuarter, setSelectedQuarter] = useState<string>(getCurrentQuarter());
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
	const courseEnrollments = appConfig.enableQuarterSystem
		? enrollments.filter((e) => e.courseId === id && (e.quarter === selectedQuarter || !e.quarter))
		: enrollments.filter((e) => e.courseId === id);

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

	const handleRemoveStudents = async (enrollmentIds: string[]) => {
		for (const id of enrollmentIds) {
			await withdrawEnrollment(id);
		}
		setSelectedRowKeys([]);
		toast.success(`${enrollmentIds.length}명의 수강이 철회되었습니다.`);
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

	const studentCount = course ? getEnrollmentCountByCourseId(course.id) : 0;

	if (!id || !course) {
		return <div>강좌를 찾을 수 없습니다.</div>;
	}

	return (
		<div className="page-enter">
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
					{ label: "수강생", value: `${courseEnrollments.length}/${course.maxStudents}` },
					{ label: "총 수익", value: `₩${totalRevenue.toLocaleString()}`, colorClass: "text-green-600 dark:text-green-400" },
					{
						label: "완납률",
						value: `${nonExemptEnrollments.length > 0 ? ((completedPayments / nonExemptEnrollments.length) * 100).toFixed(1) : "0.0"}%`,
						colorClass: nonExemptEnrollments.length > 0 && completedPayments === nonExemptEnrollments.length
							? "text-green-600 dark:text-green-400"
							: "text-red-600 dark:text-red-400",
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

			{/* 분기 선택 + 선택 제거 */}
			<div className="flex justify-between items-center mb-3">
				<div>
					{appConfig.enableQuarterSystem && (
						<Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
							<SelectTrigger className="w-[180px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{getQuarterOptions().map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</div>
				{selectedRowKeys.length > 0 && (
					<div className="flex items-center gap-2">
						<span className="text-[13px] text-muted-foreground">{selectedRowKeys.length}명 선택됨</span>
						<Button
							variant="destructive"
							size="sm"
							onClick={() => setRemoveStudentsDialogOpen(true)}
						>
							선택 제거
						</Button>
						<Button variant="outline" size="sm" onClick={() => setSelectedRowKeys([])}>
							선택 해제
						</Button>
					</div>
				)}
			</div>

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
				onStudentClick={(studentId) => {
					const student = getStudentById(studentId);
					if (student) {
						setSelectedStudent(student);
						setIsStudentEditVisible(true);
					}
				}}
				rowSelection={{
					selectedRowKeys,
					onChange: (keys) => setSelectedRowKeys(keys),
				}}
			/>

			{/* 내보내기 모달 */}
			<Dialog open={isExportModalVisible} onOpenChange={setIsExportModalVisible}>
				<DialogContent className="max-w-[320px]">
					<DialogHeader>
						<DialogTitle>수강생 내보내기</DialogTitle>
					</DialogHeader>

					<div className="flex justify-between items-center py-1 pb-2 border-b mb-3">
						<div className="flex items-center gap-2">
							<Checkbox
								checked={isAllSelected}
								onCheckedChange={(checked) =>
									setSelectedExportFields(checked ? allFieldKeys : [])
								}
							/>
							<span className="text-sm">전체 선택</span>
						</div>
						<span className="text-xs text-muted-foreground">
							{selectedExportFields.length}/{allFieldKeys.length}
						</span>
					</div>

					<div className="flex flex-col gap-0.5 mb-4">
						{COURSE_STUDENT_EXPORT_FIELDS.map((field) => {
							const isChecked = selectedExportFields.includes(field.key);
							return (
								<div
									role="checkbox"
									aria-checked={isChecked}
									tabIndex={0}
									key={field.key}
									onClick={() => {
										setSelectedExportFields((prev) =>
											isChecked
												? prev.filter((k: string) => k !== field.key)
												: [...prev, field.key],
										);
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											setSelectedExportFields((prev) =>
												isChecked
													? prev.filter((k: string) => k !== field.key)
													: [...prev, field.key],
											);
										}
									}}
									className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${
										isChecked ? 'bg-primary/10' : 'hover:bg-accent'
									}`}
								>
									<Checkbox checked={isChecked} />
									<span className="text-[13px]">{field.label}</span>
								</div>
							);
						})}
					</div>

					<div className="flex gap-2">
						<Button
							className="flex-1"
							onClick={() => handleExport("excel")}
						>
							<FileSpreadsheet className="h-4 w-4" />
							Excel
						</Button>
						<Button
							variant="outline"
							className="flex-1"
							onClick={() => handleExport("csv")}
						>
							<FileText className="h-4 w-4" />
							CSV
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
			/>

			<CourseForm
				visible={isCourseEditVisible}
				onClose={() => setIsCourseEditVisible(false)}
				course={course}
			/>
		</div>
	);
};

export default CourseDetailPage;
