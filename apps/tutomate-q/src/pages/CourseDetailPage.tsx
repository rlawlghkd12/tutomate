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
	theme,
} from "antd";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const { useToken } = theme;

import {
	CalendarOutlined,
	DownloadOutlined,
	FileExcelOutlined,
	FileTextOutlined,
	TeamOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { BulkPaymentForm, MonthlyPaymentTable, PaymentForm } from "@tutomate/ui";
import { useCourseStore } from "@tutomate/core";
import { useEnrollmentStore } from "@tutomate/core";
import { useMonthlyPaymentStore } from "@tutomate/core";
import { useStudentStore } from "@tutomate/core";
import { appConfig } from "@tutomate/core";
import type { Enrollment } from "@tutomate/core";
import {
	COURSE_STUDENT_EXPORT_FIELDS,
	exportCourseStudentsToCSV,
	exportCourseStudentsToExcel,
	getCurrentQuarter,
	getQuarterMonths,
	getQuarterOptions,
	quarterMonthToYYYYMM,
	PAYMENT_METHOD_LABELS,
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
	const { getCourseById, loadCourses } = useCourseStore();
	const { loadStudents, getStudentById } = useStudentStore();
	const { enrollments, loadEnrollments, deleteEnrollment } =
		useEnrollmentStore();
	const { payments, loadPayments } = useMonthlyPaymentStore();

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
	const [selectedQuarter, setSelectedQuarter] = useState<string>(getCurrentQuarter());

	useEffect(() => {
		loadCourses();
		loadStudents();
		loadEnrollments();
		loadPayments();
	}, [loadCourses, loadStudents, loadEnrollments, loadPayments]);

	const course = id ? getCourseById(id) : undefined;
	const courseEnrollments = appConfig.enableQuarterSystem
		? enrollments.filter((e) => e.courseId === id && e.quarter === selectedQuarter)
		: enrollments.filter((e) => e.courseId === id);

	const enrolledStudents = useMemo(() => {
		return courseEnrollments.map((enrollment) => {
			const student = getStudentById(enrollment.studentId);

			// 분기 시스템: 등록월 기반 납부 정보 계산
			let quarterTotalPaid = 0;
			let latestPayment: { paidAt?: string; paymentMethod?: string } | null = null;
			if (appConfig.enableQuarterSystem && enrollment.enrolledMonths?.length) {
				const enrolledYYYYMMs = enrollment.enrolledMonths.map(
					(m) => quarterMonthToYYYYMM(enrollment.quarter!, m),
				);
				const enrollmentPayments = payments
					.filter(
						(p) => p.enrollmentId === enrollment.id && enrolledYYYYMMs.includes(p.month),
					)
					.sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""));
				quarterTotalPaid = enrollmentPayments.reduce((sum, p) => sum + p.amount, 0);
				latestPayment = enrollmentPayments[0] || null;
			}

			return {
				...enrollment,
				student,
				quarterTotalPaid,
				latestPayment,
			};
		});
	}, [courseEnrollments, getStudentById, payments]);

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
			render: (_, record) => record.student?.name || "-",
			sorter: (a, b) =>
				(a.student?.name || "").localeCompare(b.student?.name || ""),
		},
		{
			title: "전화번호",
			key: "phone",
			render: (_, record) => record.student?.phone || "-",
		},
		...(appConfig.enableQuarterSystem
			? [
					{
						title: "회원",
						key: "isMember",
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
					{
						title: "수강등록월",
						key: "enrolledMonths",
						render: (_: unknown, record: (typeof enrolledStudents)[0]) =>
							record.enrolledMonths?.length ? (
								<Space size={4}>
									{record.enrolledMonths.map((m: number) => (
										<Tag key={m}>{m}월</Tag>
									))}
								</Space>
							) : (
								"-"
							),
					},
					{
						title: "납부금액",
						key: "quarterTotalPaid",
						render: (_: unknown, record: (typeof enrolledStudents)[0]) =>
							record.paymentStatus === "exempt" ? (
								<Tag color="purple">면제</Tag>
							) : (
								`₩${record.quarterTotalPaid.toLocaleString()}`
							),
						sorter: (a: (typeof enrolledStudents)[0], b: (typeof enrolledStudents)[0]) =>
							a.quarterTotalPaid - b.quarterTotalPaid,
					},
					{
						title: "납부방법",
						key: "paymentMethod",
						render: (_: unknown, record: (typeof enrolledStudents)[0]) =>
							record.latestPayment?.paymentMethod
								? PAYMENT_METHOD_LABELS[record.latestPayment.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] || "-"
								: "-",
					},
					{
						title: "납부일자",
						key: "paidAt",
						render: (_: unknown, record: (typeof enrolledStudents)[0]) =>
							record.latestPayment?.paidAt
								? dayjs(record.latestPayment.paidAt).format("YYYY-MM-DD")
								: "-",
					},
					{
						title: "메모",
						key: "notes",
						render: (_: unknown, record: (typeof enrolledStudents)[0]) => {
							const parts: string[] = [];
							if (record.discountAmount > 0)
								parts.push(`할인 ₩${record.discountAmount.toLocaleString()}`);
							if (record.notes) parts.push(record.notes);
							return parts.join(" / ") || "-";
						},
					},
				] as ColumnsType<(typeof enrolledStudents)[0]>
			: [
					{
						title: "이번달",
						key: "monthlyStatus",
						render: (_: unknown, record: (typeof enrolledStudents)[0]) => {
							if (record.paymentStatus === "exempt") {
								return <Tag color="purple">면제</Tag>;
							}
							const currentMonth = dayjs().format("YYYY-MM");
							const monthlyPayment = useMonthlyPaymentStore
								.getState()
								.payments.find(
									(p) =>
										p.enrollmentId === record.id &&
										p.month === currentMonth,
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
						onFilter: (value: unknown, record: (typeof enrolledStudents)[0]) => {
							if (value === "exempt")
								return record.paymentStatus === "exempt";
							const currentMonth = dayjs().format("YYYY-MM");
							const mp = useMonthlyPaymentStore
								.getState()
								.payments.find(
									(p) =>
										p.enrollmentId === record.id &&
										p.month === currentMonth,
								);
							if (value === "paid") return mp?.status === "paid";
							return !mp || mp.status !== "paid";
						},
					},
					{
						title: "등록일",
						key: "enrolledAt",
						render: (_: unknown, record: (typeof enrolledStudents)[0]) =>
							new Date(record.enrolledAt).toLocaleDateString(),
						sorter: (a: (typeof enrolledStudents)[0], b: (typeof enrolledStudents)[0]) =>
							new Date(a.enrolledAt).getTime() -
							new Date(b.enrolledAt).getTime(),
					},
				] as ColumnsType<(typeof enrolledStudents)[0]>),
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
				<Button
					size="small"
					icon={<DownloadOutlined />}
					onClick={() => setIsExportModalVisible(true)}
					disabled={courseEnrollments.length === 0}
				>
					내보내기
				</Button>
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
								{appConfig.enableQuarterSystem && (
									<div style={{ marginBottom: 12 }}>
										<Select
											value={selectedQuarter}
											onChange={setSelectedQuarter}
											style={{ width: 180 }}
											options={getQuarterOptions()}
										/>
									</div>
								)}
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
								key={appConfig.enableQuarterSystem ? selectedQuarter : undefined}
								courseId={id}
								courseFee={course.fee}
								enrollments={courseEnrollments}
								quarterMonths={appConfig.enableQuarterSystem
									? getQuarterMonths(selectedQuarter).map((m) => quarterMonthToYYYYMM(selectedQuarter, m))
									: undefined
								}
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
