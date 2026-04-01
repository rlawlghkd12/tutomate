import {
	Button,
	Checkbox,
	Modal,
	message,
	Popconfirm,
	Select,
	Space,
	Table,
	Tabs,
	Tag,
	Tooltip,
	theme,
} from "antd";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const { useToken } = theme;

import {
	CalendarOutlined,
	DeleteOutlined,
	DownloadOutlined,
	EditOutlined,
	FileExcelOutlined,
	FileTextOutlined,
	TeamOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { CourseForm, PaymentManagementTable, StudentForm } from "@tutomate/ui";
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
	const { token } = useToken();
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

	const [activeTab, setActiveTab] = useState<string>("students");
	const [selectedQuarter, setSelectedQuarter] = useState<string>(getCurrentQuarter());
	const [isCourseEditVisible, setIsCourseEditVisible] = useState(false);
	const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
	const [isStudentEditVisible, setIsStudentEditVisible] = useState(false);

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
		const studentCount = getEnrollmentCountByCourseId(course.id);
		Modal.confirm({
			title: studentCount > 0 ? "수강생이 있는 강좌입니다!" : "강좌를 삭제하시겠습니까?",
			content: studentCount > 0
				? `"${course.name}" 강좌에 ${studentCount}명의 수강생이 있습니다. 삭제 시 수강 기록도 함께 삭제됩니다.`
				: `"${course.name}" 강좌를 삭제합니다.`,
			okText: "삭제",
			okType: "danger",
			cancelText: "취소",
			async onOk() {
				await deleteCourse(course.id);
				message.success("강좌가 삭제되었습니다.");
				navigate("/courses");
			},
		});
	};

	const handleRemoveStudents = async (enrollmentIds: string[]) => {
		for (const id of enrollmentIds) {
			await deleteEnrollment(id);
		}
		setSelectedRowKeys([]);
		message.success(`${enrollmentIds.length}명의 수강생이 제거되었습니다.`);
	};

	const handleExport = (type: "excel" | "csv") => {
		if (selectedExportFields.length === 0) {
			message.warning("내보낼 필드를 1개 이상 선택해주세요.");
			return;
		}

		const data = enrolledStudents
			.filter((es) => es.student)
			.map((es) => ({ student: es.student!, enrollment: es as Enrollment }));

		if (data.length === 0) {
			message.warning("내보낼 수강생이 없습니다.");
			return;
		}

		if (!course) return;
		try {
			if (type === "excel") {
				exportCourseStudentsToExcel(course, data, selectedExportFields);
				message.success("Excel 파일이 다운로드되었습니다.");
			} else {
				exportCourseStudentsToCSV(course, data, selectedExportFields);
				message.success("CSV 파일이 다운로드되었습니다.");
			}
			setIsExportModalVisible(false);
		} catch {
			message.error("내보내기에 실패했습니다.");
		}
	};

	const allFieldKeys = COURSE_STUDENT_EXPORT_FIELDS.map((f) => f.key);
	const isAllSelected = selectedExportFields.length === allFieldKeys.length;

	const columns: ColumnsType<(typeof enrolledStudents)[0]> = [
		{
			title: "이름",
			key: "name",
			width: 80,
			render: (_, record) => record.student ? (
				<a
					onClick={() => {
						setSelectedStudent(record.student!);
						setIsStudentEditVisible(true);
					}}
					style={{ whiteSpace: "nowrap" }}
				>
					{record.student.name}
				</a>
			) : "-",
			sorter: (a, b) =>
				(a.student?.name || "").localeCompare(b.student?.name || ""),
		},
		{
			title: "전화번호",
			key: "phone",
			width: 120,
			render: (_, record) => (
				<span style={{ whiteSpace: "nowrap" }}>{record.student?.phone || "-"}</span>
			),
		},
		...(appConfig.enableMemberFeature
			? [
					{
						title: "회원",
						key: "isMember",
						width: 60,
						render: (_: unknown, record: (typeof enrolledStudents)[0]) =>
							record.student?.isMember ? (
								<Tag color="blue">회원</Tag>
							) : (
								<Tag>비회원</Tag>
							),
						filters: [
							{ text: "회원", value: true },
							{ text: "비회원", value: false },
						],
						onFilter: (value: unknown, record: (typeof enrolledStudents)[0]) =>
							(record.student?.isMember ?? false) === value,
					},
				] as ColumnsType<(typeof enrolledStudents)[0]>
			: []),
		...(appConfig.enableQuarterSystem
			? [
					{
						title: "등록월",
						key: "enrolledMonths",
						width: 110,
						render: (_: unknown, record: (typeof enrolledStudents)[0]) =>
							record.enrolledMonths?.length ? (
								<Space size={4}>
									{record.enrolledMonths.map((m: number) => (
										<Tag key={m} style={{ margin: 0 }}>{m}월</Tag>
									))}
								</Space>
							) : (
								"-"
							),
					},
				] as ColumnsType<(typeof enrolledStudents)[0]>
			: []),
		{
			title: "메모",
			key: "notes",
			ellipsis: { showTitle: false },
			render: (_, record) => record.notes ? (
				<Tooltip title={record.notes} placement="topLeft">
					<span>{record.notes}</span>
				</Tooltip>
			) : "-",
		},
	];

	const rowSelection = {
		selectedRowKeys,
		onChange: (newSelectedRowKeys: React.Key[]) => {
			setSelectedRowKeys(newSelectedRowKeys);
		},
	};

	if (!id || !course) {
		return <div>강좌를 찾을 수 없습니다.</div>;
	}

	return (
		<div>
			{/* 브레드크럼 + 내보내기 */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 6,
				}}
			>
				<div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
					<a
						onClick={() => navigate("/courses")}
						style={{ fontSize: 13, color: token.colorTextSecondary, cursor: "pointer" }}
					>
						강좌 관리
					</a>
					<span style={{ color: token.colorTextQuaternary, fontSize: 12 }}>/</span>
					<span style={{ fontSize: 15, fontWeight: 600 }}>{course.name}</span>
				</div>
				<Space size="small">
					<Button
						size="small"
						icon={<DownloadOutlined />}
						onClick={() => setIsExportModalVisible(true)}
						disabled={courseEnrollments.length === 0}
					>
						내보내기
					</Button>
					<Button
						size="small"
						icon={<EditOutlined />}
						onClick={() => setIsCourseEditVisible(true)}
					>
						수정
					</Button>
					<Button
						size="small"
						danger
						icon={<DeleteOutlined />}
						onClick={handleDeleteCourse}
					>
						삭제
					</Button>
				</Space>
			</div>

			{/* 부가 정보 + 통계 — 한 줄 */}
			<div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
				{[
					{ label: "강사", value: course.instructorName },
					{ label: "강의실", value: course.classroom },
					{ label: "수강료", value: `₩${course.fee.toLocaleString()}` },
					{ label: "수강생", value: `${courseEnrollments.length}/${course.maxStudents}` },
					{ label: "총 수익", value: `₩${totalRevenue.toLocaleString()}`, color: token.colorSuccess },
					{ label: "완납률", value: `${nonExemptEnrollments.length > 0 ? ((completedPayments / nonExemptEnrollments.length) * 100).toFixed(1) : "0.0"}%`, color: nonExemptEnrollments.length > 0 && completedPayments === nonExemptEnrollments.length ? token.colorSuccess : token.colorError },
				].map((item) => (
					<div
						key={item.label}
						style={{
							flex: 1,
							padding: "6px 12px",
							borderRadius: token.borderRadius,
							border: `1px solid ${token.colorBorderSecondary}`,
						}}
					>
						<div style={{ fontSize: 11, color: token.colorTextSecondary }}>
							{item.label}
						</div>
						<div
							style={{
								fontSize: 14,
								fontWeight: 600,
								color: (item as any).color,
								marginTop: 1,
							}}
						>
							{item.value}
						</div>
					</div>
				))}
			</div>

			<Tabs
				activeKey={activeTab}
				onChange={setActiveTab}
				items={[
					{
						key: "students",
						label: (
							<span>
								<TeamOutlined /> 수강생 관리
							</span>
						),
						children: (
							<>
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
									<div>
										{appConfig.enableQuarterSystem && (
											<Select
												value={selectedQuarter}
												onChange={setSelectedQuarter}
												style={{ width: 180 }}
												options={getQuarterOptions()}
											/>
										)}
									</div>
									{selectedRowKeys.length > 0 && (
										<Space>
											<span style={{ fontSize: 13, color: token.colorTextSecondary }}>{selectedRowKeys.length}명 선택됨</span>
											<Popconfirm
												title={`${selectedRowKeys.length}명의 수강생을 제거하시겠습니까?`}
												onConfirm={() => handleRemoveStudents(selectedRowKeys as string[])}
												okText="제거"
												okType="danger"
												cancelText="취소"
											>
												<Button size="small" danger>
													선택 제거
												</Button>
											</Popconfirm>
											<Button size="small" onClick={() => setSelectedRowKeys([])}>
												선택 해제
											</Button>
										</Space>
									)}
								</div>
								<Table
									columns={columns}
									dataSource={enrolledStudents}
									rowKey="id"
									pagination={false}
									size="small"
									rowSelection={rowSelection}
									tableLayout="fixed"
								/>
							</>
						),
					},
					{
						key: "payments",
						label: (
							<span>
								<CalendarOutlined /> 납부 관리
							</span>
						),
						children: (
							<PaymentManagementTable
								courseId={id}
								courseFee={course.fee}
								enrollments={courseEnrollments}
							/>
						),
					},
				]}
			/>

			{/* 내보내기 모달 */}
			<Modal
				title="수강생 내보내기"
				open={isExportModalVisible}
				onCancel={() => setIsExportModalVisible(false)}
				width={320}
				styles={{ body: { paddingBottom: 24 } }}
				footer={null}
			>
				<div
					style={{
						padding: "4px 0 8px",
						borderBottom: `1px solid ${token.colorBorderSecondary}`,
						marginBottom: 12,
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<Checkbox
						checked={isAllSelected}
						indeterminate={selectedExportFields.length > 0 && !isAllSelected}
						onChange={(e) =>
							setSelectedExportFields(e.target.checked ? allFieldKeys : [])
						}
					>
						전체 선택
					</Checkbox>
					<span style={{ fontSize: 12, color: token.colorTextTertiary }}>
						{selectedExportFields.length}/{allFieldKeys.length}
					</span>
				</div>

				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 2,
						marginBottom: 16,
					}}
				>
					{COURSE_STUDENT_EXPORT_FIELDS.map((field) => {
						const isChecked = selectedExportFields.includes(field.key);
						return (
							// biome-ignore lint/a11y/useSemanticElements: styled checkbox wrapper
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
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									padding: "6px 8px",
									borderRadius: token.borderRadius,
									cursor: "pointer",
									background: isChecked ? token.colorPrimaryBg : "transparent",
								}}
							>
								<Checkbox checked={isChecked} />
								<span style={{ fontSize: 13 }}>{field.label}</span>
							</div>
						);
					})}
				</div>

				<div style={{ display: "flex", gap: 8 }}>
					<Button
						type="primary"
						icon={<FileExcelOutlined />}
						onClick={() => handleExport("excel")}
						block
					>
						Excel
					</Button>
					<Button
						icon={<FileTextOutlined />}
						onClick={() => handleExport("csv")}
						block
					>
						CSV
					</Button>
				</div>
			</Modal>

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
