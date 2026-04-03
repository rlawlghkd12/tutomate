import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
	Download,
	FileSpreadsheet,
	FileText,
	Pencil,
	Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { CourseForm, PaymentManagementTable } from "@tutomate/ui";
import {
	useCourseStore,
	useEnrollmentStore,
	usePaymentRecordStore,
	useStudentStore,
	COURSE_STUDENT_EXPORT_FIELDS,
	exportCourseStudentsToCSV,
	exportCourseStudentsToExcel,
} from "@tutomate/core";
// Enrollment type used internally by PaymentManagementTable
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";

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
	const { enrollments, loadEnrollments, deleteEnrollment } =
		useEnrollmentStore();
	const { loadRecords } = usePaymentRecordStore();

	const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
	const [isExportModalVisible, setIsExportModalVisible] = useState(false);
	const [selectedExportFields, setSelectedExportFields] = useState<string[]>(
		DEFAULT_EXPORT_FIELDS,
	);

	const [isCourseEditVisible, setIsCourseEditVisible] = useState(false);

	// Delete course AlertDialog state
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	// Remove student AlertDialog state
	const [removeStudentId, setRemoveStudentId] = useState<string | null>(null);

	useEffect(() => {
		loadCourses();
		loadStudents();
		loadEnrollments();
		loadRecords();
	}, [loadCourses, loadStudents, loadEnrollments, loadRecords]);

	const course = id ? getCourseById(id) : undefined;
	const courseEnrollments = enrollments.filter((e) => e.courseId === id);

	const enrolledStudents = useMemo(() => {
		return courseEnrollments.map((enrollment) => {
			const student = getStudentById(enrollment.studentId);
			return {
				...enrollment,
				student,
			};
		});
	}, [courseEnrollments, getStudentById]);

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

	const handleDeleteCourse = () => {
		if (!course) return;
		setDeleteDialogOpen(true);
	};

	const confirmDeleteCourse = async () => {
		if (!course) return;
		await deleteCourse(course.id);
		toast.success("강좌가 삭제되었습니다.");
		navigate("/courses");
	};

	const handleRemoveStudent = async (enrollmentId: string) => {
		await deleteEnrollment(enrollmentId);
		toast.success("수강생이 제거되었습니다.");
	};

	const handleExport = (type: "excel" | "csv") => {
		if (selectedExportFields.length === 0) {
			toast.warning("내보낼 필드를 1개 이상 선택해주세요.");
			return;
		}

		const data = enrolledStudents
			.filter((es) => es.student)
			.map((es) => ({ student: es.student!, enrollment: es as Enrollment }));

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

	if (!id || !course) {
		return <div>강좌를 찾을 수 없습니다.</div>;
	}

	const studentCount = getEnrollmentCountByCourseId(course.id);

	return (
		<div>
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
						<Download className="h-3.5 w-3.5" />
						내보내기
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setIsCourseEditVisible(true)}
					>
						<Pencil className="h-3.5 w-3.5" />
						수정
					</Button>
					<Button
						variant="destructive"
						size="sm"
						onClick={handleDeleteCourse}
					>
						<Trash2 className="h-3.5 w-3.5" />
						삭제
					</Button>
				</div>
			</div>

			{/* 부가 정보 + 통계 — 한 줄 */}
			<div className="flex gap-2.5 mb-3">
				{[
					{ label: "강사", value: course.instructorName },
					{ label: "강의실", value: course.classroom },
					{ label: "수강료", value: `\u20A9${course.fee.toLocaleString()}` },
					{ label: "수강생", value: `${courseEnrollments.length}/${course.maxStudents}` },
					{ label: "총 수익", value: `\u20A9${totalRevenue.toLocaleString()}`, colorClass: "text-success" },
					{ label: "완납률", value: `${nonExemptEnrollments.length > 0 ? ((completedPayments / nonExemptEnrollments.length) * 100).toFixed(1) : "0.0"}%`, colorClass: nonExemptEnrollments.length > 0 && completedPayments === nonExemptEnrollments.length ? "text-success" : "text-error" },
				].map((item) => (
					<div
						key={item.label}
						className="flex-1 py-1.5 px-3 rounded-md border border-border"
					>
						<div className="text-[11px] text-muted-foreground">
							{item.label}
						</div>
						<div
							className={`text-sm font-semibold mt-0.5 ${(item as any).colorClass || ''}`}
						>
							{item.value}
						</div>
					</div>
				))}
			</div>

			{/* 수강생 + 납부 통합 (PaymentManagementTable) */}
			<PaymentManagementTable
				courseId={id}
				courseFee={course.fee}
				enrollments={courseEnrollments}
				rowSelection={{
					selectedRowKeys,
					onChange: (keys) => setSelectedRowKeys(keys as string[]),
				}}
			/>

			{/* 내보내기 모달 */}
			<Dialog open={isExportModalVisible} onOpenChange={setIsExportModalVisible}>
				<DialogContent className="max-w-[320px]">
					<DialogHeader>
						<DialogTitle>수강생 내보내기</DialogTitle>
						<DialogDescription className="sr-only">내보낼 필드를 선택하세요</DialogDescription>
					</DialogHeader>

					<div className="flex justify-between items-center py-1 pb-2 border-b border-border mb-3">
						<label className="flex items-center gap-2 text-sm cursor-pointer">
							<Checkbox
								checked={isAllSelected ? true : selectedExportFields.length > 0 ? "indeterminate" : false}
								onCheckedChange={(checked) =>
									setSelectedExportFields(checked ? allFieldKeys : [])
								}
							/>
							전체 선택
						</label>
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
									className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer ${
										isChecked ? 'bg-primary/10' : 'hover:bg-muted'
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

			<CourseForm
				visible={isCourseEditVisible}
				onClose={() => setIsCourseEditVisible(false)}
				course={course}
			/>

			{/* Delete course AlertDialog */}
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
							onClick={confirmDeleteCourse}
						>
							삭제
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Remove student AlertDialog */}
			<AlertDialog open={!!removeStudentId} onOpenChange={(open) => { if (!open) setRemoveStudentId(null); }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>수강생 제거</AlertDialogTitle>
						<AlertDialogDescription>정말 이 수강생을 제거하시겠습니까?</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => {
								if (removeStudentId) {
									handleRemoveStudent(removeStudentId);
									setRemoveStudentId(null);
								}
							}}
						>
							제거
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
};

export default CourseDetailPage;
