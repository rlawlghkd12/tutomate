import { Plus } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import {
	CourseRevenueChart, PaymentStatusChart, Button,
	Card, CardContent, CardHeader, CardTitle, Progress, PageEnter,
} from "@tutomate/ui";
import {
	useCourseStore,
	useEnrollmentStore,
	useMonthlyPaymentStore,
	useStudentStore,
	generateAllNotifications,
	isActiveEnrollment,
	getCurrentQuarter,
} from "@tutomate/core";

const DashboardPage: React.FC = () => {
	const navigate = useNavigate();
	const { courses, loadCourses } = useCourseStore();
	const { students, loadStudents } = useStudentStore();
	const { enrollments, loadEnrollments } = useEnrollmentStore();
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const loadData = async () => {
			await Promise.all([loadCourses(), loadStudents(), loadEnrollments()]);
			setLoading(false);
		};
		loadData().then(async () => {
			const allEnrollments = useEnrollmentStore.getState().enrollments;
			const students = useStudentStore.getState().students;
			const courses = useCourseStore.getState().courses;
			// 현재 분기 enrollment만 알림 생성
			const q = getCurrentQuarter();
			const enrollments = allEnrollments.filter(
				(e) => isActiveEnrollment(e) && (e.quarter === q || !e.quarter),
			);
			if (enrollments.length > 0 && students.length > 0 && courses.length > 0) {
				generateAllNotifications(enrollments, students, courses);
			}

			const { payments, loadPayments, addPayment } =
				useMonthlyPaymentStore.getState();
			if (payments.length === 0) await loadPayments();
			const currentPayments = useMonthlyPaymentStore.getState().payments;
			for (const enrollment of enrollments) {
				const month = enrollment.enrolledAt
					? enrollment.enrolledAt.slice(0, 7)
					: dayjs().format("YYYY-MM");
				const hasPayment = currentPayments.some(
					(p) => p.enrollmentId === enrollment.id && p.month === month,
				);
				if (!hasPayment) {
					await addPayment(
						enrollment.id,
						month,
						enrollment.paidAmount || 0,
						enrollment.paymentMethod,
						enrollment.paidAt || undefined,
					);
				}
			}
		});
	}, [loadCourses, loadStudents, loadEnrollments]);

	const currentQuarter = getCurrentQuarter();
	// 분기 전체 (withdrawn 포함 — 환불이 수익에 차감되어야 함)
	const quarterAll = enrollments.filter(
		(e) => e.quarter === currentQuarter || !e.quarter,
	);
	// 수익 집계용 (exempt 제외, withdrawn 포함하여 환불 차감 반영)
	const quarterRevenue = quarterAll.filter((e) => e.paymentStatus !== "exempt");
	// 활성 수강생 (완납/미납 카운트 및 예상수익/차트용)
	const quarterActive = quarterRevenue.filter((e) => e.paymentStatus !== "withdrawn");

	const totalCourses = courses.length;
	const totalStudents = students.length;

	const completedPayments = quarterActive.filter(
		(e) => e.paymentStatus === "completed",
	).length;
	const pendingPayments = quarterActive.filter(
		(e) => e.paymentStatus === "pending",
	).length;

	// 총 수익: withdrawn 포함 — 환불 금액(음수 paidAmount) 차감됨
	const totalRevenue = quarterRevenue.reduce(
		(sum, enrollment) => sum + enrollment.paidAmount,
		0,
	);

	// 예상수익: active만 (포기 학생은 기대 수익에서 제외)
	const expectedRevenue = quarterActive.reduce((sum, enrollment) => {
		const course = courses.find((c) => c.id === enrollment.courseId);
		return sum + (course?.fee || 0);
	}, 0);

	const paymentRate =
		expectedRevenue > 0 ? (totalRevenue / expectedRevenue) * 100 : 0;

	if (loading) {
		return (
			<PageEnter>
				<div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
					{Array.from({ length: 6 }).map((_, i) => (
						<div key={i} style={{ borderRadius: 8, border: '1px solid hsl(var(--border))', padding: 12 }}>
							<div style={{ height: 12, width: '50%', borderRadius: 4, background: 'hsl(var(--muted))', animation: 'skeleton-pulse 1.5s ease-in-out infinite', marginBottom: 8 }} />
							<div style={{ height: 24, width: '60%', borderRadius: 4, background: 'hsl(var(--muted))', animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
						</div>
					))}
				</div>
				<div className="grid md:grid-cols-[2fr_1fr] gap-4" style={{ marginTop: 16 }}>
					<div style={{ height: 250, borderRadius: 8, background: 'hsl(var(--muted))', animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
					<div style={{ height: 250, borderRadius: 8, background: 'hsl(var(--muted))', animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
				</div>
				<div style={{ height: 300, borderRadius: 8, background: 'hsl(var(--muted))', animation: 'skeleton-pulse 1.5s ease-in-out infinite', marginTop: 16 }} />
			</PageEnter>
		);
	}

	return (
		<PageEnter>
			{/* 상단 통계 */}
			<div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
				<Card className="cursor-pointer card-interactive" onClick={() => navigate("/courses")}>
					<CardContent className="p-4">
						<p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">강좌</p>
						<p className="text-3xl font-bold tabular-nums text-foreground" style={{ letterSpacing: '-0.02em' }}>{totalCourses}</p>
					</CardContent>
				</Card>
				<Card className="cursor-pointer card-interactive" onClick={() => navigate("/students")}>
					<CardContent className="p-4">
						<p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">수강생</p>
						{totalStudents === 0 ? (
							<div className="flex items-center gap-1.5 text-sm text-primary font-medium mt-1">
								<Plus className="h-4 w-4" />
								<span>등록하기</span>
							</div>
						) : (
							<p className="text-3xl font-bold tabular-nums text-foreground" style={{ letterSpacing: '-0.02em' }}>{totalStudents}</p>
						)}
					</CardContent>
				</Card>
				<Card className="cursor-pointer card-interactive" onClick={() => navigate("/revenue")}>
					<CardContent className="p-4">
						<p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">납부</p>
						<p className="text-2xl font-bold tabular-nums text-foreground" style={{ letterSpacing: '-0.02em' }}>
							{totalRevenue.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-0.5">원</span>
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">납부율</p>
						<p className={`text-3xl font-bold tabular-nums ${paymentRate >= 80 ? 'text-success' : 'text-warning'}`} style={{ letterSpacing: '-0.02em' }}>
							{paymentRate.toFixed(0)}<span className="text-sm font-normal text-muted-foreground ml-0.5">%</span>
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">완납</p>
						<p className="text-3xl font-bold tabular-nums text-success" style={{ letterSpacing: '-0.02em' }}>
							{completedPayments}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">미납</p>
						<p className="text-3xl font-bold tabular-nums text-error" style={{ letterSpacing: '-0.02em' }}>
							{pendingPayments}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
						</p>
					</CardContent>
				</Card>
			</div>

			{/* 전체 강좌 */}
			<Card className="mt-4">
				<CardHeader className="p-4 pb-2">
					<CardTitle className="text-sm">전체 강좌 ({totalCourses})</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-2">
					{courses.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
							<p className="mb-4">등록된 강좌가 없습니다</p>
							<Button onClick={() => navigate("/courses")}>
								<Plus className="h-4 w-4" />
								강좌 등록하기
							</Button>
						</div>
					) : (
						<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
							{courses.map((course) => {
								// 정원 표시는 strict 분기 매칭 (null-quarter legacy 제외)
								const currentStudents = enrollments.filter(
									(e) => isActiveEnrollment(e) && e.courseId === course.id && e.quarter === currentQuarter,
								).length;
								const percentage = (currentStudents / course.maxStudents) * 100;
								return (
									<Card
										key={course.id}
										className="cursor-pointer hover:shadow-md transition-shadow"
										onClick={() => navigate(`/courses/${course.id}`)}
									>
										<CardContent className="p-3">
											<div className="font-semibold text-sm mb-1">
												{course.name}
											</div>
											<div className="text-xs text-muted-foreground mb-2">
												{course.instructorName} · {course.classroom}
											</div>
											<div className="flex items-center gap-2">
												<Progress
													value={Math.min(percentage, 100)}
													className="flex-1 h-1.5"
												/>
												<span className="text-xs text-muted-foreground whitespace-nowrap">
													{currentStudents}/{course.maxStudents}
												</span>
											</div>
										</CardContent>
									</Card>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>

			{/* 차트 */}
			<div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3 mt-4">
				<Card>
					<CardHeader className="p-4 pb-2">
						<CardTitle className="text-sm">강좌별 수익</CardTitle>
					</CardHeader>
					<CardContent className="p-4 pt-2">
						<CourseRevenueChart enrollments={quarterRevenue} courses={courses} />
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="p-4 pb-2">
						<CardTitle className="text-sm">납부 상태</CardTitle>
					</CardHeader>
					<CardContent className="p-4 pt-2">
						<PaymentStatusChart enrollments={quarterActive} />
					</CardContent>
				</Card>
			</div>
		</PageEnter>
	);
};

export default DashboardPage;
