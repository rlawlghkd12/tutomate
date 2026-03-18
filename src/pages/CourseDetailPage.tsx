import {
	Button,
	Checkbox,
	Modal,
	message,
	Popconfirm,
	Space,
	Table,
	Tabs,
	Tag,
	Typography,
	theme,
} from "antd";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const { useToken } = theme;

import {
	CalendarOutlined,
	CheckCircleOutlined,
	DollarOutlined,
	DownloadOutlined,
	FileExcelOutlined,
	FileTextOutlined,
	TeamOutlined,
	UserOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import BulkPaymentForm from "../components/payment/BulkPaymentForm";
import MonthlyPaymentTable from "../components/payment/MonthlyPaymentTable";
import PaymentForm from "../components/payment/PaymentForm";
import { useCourseStore } from "../stores/courseStore";
import { useEnrollmentStore } from "../stores/enrollmentStore";
import { useMonthlyPaymentStore } from "../stores/monthlyPaymentStore";
import { useStudentStore } from "../stores/studentStore";
import type { Enrollment } from "../types";
import {
	COURSE_STUDENT_EXPORT_FIELDS,
	exportCourseStudentsToCSV,
	exportCourseStudentsToExcel,
} from "../utils/export";

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
	const { getCourseById, loadCourses } = useCourseStore();
	const { loadStudents, getStudentById } = useStudentStore();
	const { enrollments, loadEnrollments, deleteEnrollment } =
		useEnrollmentStore();
	const { loadPayments } = useMonthlyPaymentStore();

	const [selectedEnrollment, setSelectedEnrollment] =
		useState<Enrollment | null>(null);
	const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
	const [isBulkPaymentModalVisible, setIsBulkPaymentModalVisible] =
		useState(false);
	const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
	const [isExportModalVisible, setIsExportModalVisible] = useState(false);
	const [selectedExportFields, setSelectedExportFields] = useState<string[]>(
		DEFAULT_EXPORT_FIELDS,
	);

	const [activeTab, setActiveTab] = useState<string>("students");

	useEffect(() => {
		loadCourses();
		loadStudents();
		loadEnrollments();
		loadPayments();
	}, [loadCourses, loadStudents, loadEnrollments, loadPayments]);

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
	const expectedRevenue = nonExemptEnrollments.length * course.fee;
	const completedPayments = courseEnrollments.filter(
		(e) => e.paymentStatus === "completed",
	).length;

	const handleRemoveStudent = async (enrollmentId: string) => {
		await deleteEnrollment(enrollmentId);
		message.success("수강생이 제거되었습니다.");
	};

	const handlePaymentEdit = (enrollment: Enrollment) => {
		setSelectedEnrollment(enrollment);
		setIsPaymentModalVisible(true);
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
			render: (_, record) => record.student?.name || "-",
			sorter: (a, b) =>
				(a.student?.name || "").localeCompare(b.student?.name || ""),
		},
		{
			title: "전화번호",
			key: "phone",
			render: (_, record) => record.student?.phone || "-",
		},
		{
			title: "이번달",
			key: "monthlyStatus",
			render: (_, record) => {
				if (record.paymentStatus === "exempt") {
					return <Tag color="purple">면제</Tag>;
				}
				const currentMonth = dayjs().format("YYYY-MM");
				const monthlyPayment = useMonthlyPaymentStore
					.getState()
					.payments.find(
						(p) => p.enrollmentId === record.id && p.month === currentMonth,
					);
				if (monthlyPayment && monthlyPayment.status === "paid") {
					return <Tag color="green">납부</Tag>;
				}
				return <Tag color="red">미납</Tag>;
			},
			filters: [
				{ text: "납부", value: "paid" },
				{ text: "미납", value: "unpaid" },
				{ text: "면제", value: "exempt" },
			],
			onFilter: (value, record) => {
				if (value === "exempt") return record.paymentStatus === "exempt";
				const currentMonth = dayjs().format("YYYY-MM");
				const mp = useMonthlyPaymentStore
					.getState()
					.payments.find(
						(p) => p.enrollmentId === record.id && p.month === currentMonth,
					);
				if (value === "paid") return mp?.status === "paid";
				return !mp || mp.status !== "paid";
			},
		},
		{
			title: "등록일",
			key: "enrolledAt",
			render: (_, record) => new Date(record.enrolledAt).toLocaleDateString(),
			sorter: (a, b) =>
				new Date(a.enrolledAt).getTime() - new Date(b.enrolledAt).getTime(),
		},
		{
			title: "작업",
			key: "action",
			render: (_, record) => (
				<Space size="small">
					<Button type="link" onClick={() => handlePaymentEdit(record)}>
						납부 관리
					</Button>
					<Popconfirm
						title="정말 이 수강생을 제거하시겠습니까?"
						onConfirm={() => handleRemoveStudent(record.id)}
						okText="제거"
						cancelText="취소"
					>
						<Button type="link" danger>
							제거
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	const selectedEnrollments = enrolledStudents.filter((student) =>
		selectedRowKeys.includes(student.id),
	);

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
					marginBottom: 8,
				}}
			>
				<Space size={4}>
					<Button
						type="link"
						onClick={() => navigate("/courses")}
						style={{
							padding: 0,
							fontSize: 16,
							color: token.colorTextSecondary,
						}}
					>
						강좌 관리
					</Button>
					<span style={{ color: token.colorTextQuaternary, fontSize: 14 }}>
						/
					</span>
					<Typography.Title level={4} style={{ margin: 0 }}>
						{course.name}
					</Typography.Title>
				</Space>
				<Button
					icon={<DownloadOutlined />}
					onClick={() => setIsExportModalVisible(true)}
					disabled={courseEnrollments.length === 0}
				>
					내보내기
				</Button>
			</div>

			{/* 부가 정보 한 줄로 */}
			<Space
				split={<span style={{ color: token.colorBorder }}>·</span>}
				style={{ marginBottom: 24 }}
			>
				<span>강사: {course.instructorName}</span>
				<span>강의실: {course.classroom}</span>
				<span>수강료: ₩{course.fee.toLocaleString()}</span>
				<span>
					정원: {courseEnrollments.length}/{course.maxStudents}명
				</span>
			</Space>

			<div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
				{[
					{
						label: "수강생",
						value: `${courseEnrollments.length}/${course.maxStudents}`,
						icon: <UserOutlined />,
					},
					{
						label: "총 수익",
						value: `₩${totalRevenue.toLocaleString()}`,
						icon: <DollarOutlined />,
						color: token.colorSuccess,
					},
					{
						label: "예상 수익",
						value: `₩${expectedRevenue.toLocaleString()}`,
						icon: <DollarOutlined />,
					},
					{
						label: "완납률",
						value: `${nonExemptEnrollments.length > 0 ? ((completedPayments / nonExemptEnrollments.length) * 100).toFixed(1) : "0.0"}%`,
						icon: <CheckCircleOutlined />,
						color:
							nonExemptEnrollments.length > 0 &&
							completedPayments === nonExemptEnrollments.length
								? token.colorSuccess
								: token.colorError,
					},
				].map((item) => (
					<div
						key={item.label}
						style={{
							flex: 1,
							padding: "8px 14px",
							borderRadius: token.borderRadius,
							border: `1px solid ${token.colorBorderSecondary}`,
						}}
					>
						<div style={{ fontSize: 11, color: token.colorTextSecondary }}>
							{item.label}
						</div>
						<div
							style={{
								fontSize: 16,
								fontWeight: 600,
								color: item.color,
								marginTop: 2,
							}}
						>
							{item.icon} {item.value}
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
								{selectedRowKeys.length > 0 && (
									<div
										style={{
											marginBottom: 16,
											padding: 12,
											backgroundColor: token.colorInfoBg,
											borderRadius: 4,
										}}
									>
										<Space>
											<span>{selectedRowKeys.length}명 선택됨</span>
											<Button
												type="primary"
												onClick={() => setIsBulkPaymentModalVisible(true)}
											>
												일괄 납부 처리
											</Button>
											<Button onClick={() => setSelectedRowKeys([])}>
												선택 해제
											</Button>
										</Space>
									</div>
								)}
								<Table
									columns={columns}
									dataSource={enrolledStudents}
									rowKey="id"
									pagination={false}
									size="small"
									rowSelection={rowSelection}
								/>
							</>
						),
					},
					{
						key: "monthly",
						label: (
							<span>
								<CalendarOutlined /> 월별 납부
							</span>
						),
						children: (
							<MonthlyPaymentTable
								courseId={id}
								courseFee={course.fee}
								enrollments={courseEnrollments}
							/>
						),
					},
				]}
			/>

			<PaymentForm
				visible={isPaymentModalVisible}
				onClose={() => {
					setIsPaymentModalVisible(false);
					setSelectedEnrollment(null);
				}}
				enrollment={selectedEnrollment}
				courseFee={course.fee}
			/>

			<BulkPaymentForm
				visible={isBulkPaymentModalVisible}
				onClose={() => {
					setIsBulkPaymentModalVisible(false);
					setSelectedRowKeys([]);
				}}
				enrollments={selectedEnrollments}
				courseFee={course.fee}
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
		</div>
	);
};

export default CourseDetailPage;
