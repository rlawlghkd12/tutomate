import { Plus, ChevronDown, ChevronUp } from "lucide-react";
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
	useQuarterStore,
	generateAllNotifications,
	isActiveEnrollment,
	getCurrentQuarter,
} from "@tutomate/core";

// 데스크톱(lg) 6열 기준 2줄 = 12개. 그 이상이면 접기/펴기로 노출.
const COURSE_COLLAPSE_LIMIT = 12;

const DashboardPage: React.FC = () => {
	const navigate = useNavigate();
	const { courses, loadCourses } = useCourseStore();
	const { loadStudents } = useStudentStore();
	const { enrollments, loadEnrollments } = useEnrollmentStore();
	const [loading, setLoading] = useState(true);
	const [showAllCourses, setShowAllCourses] = useState(false);
	const selectedQuarter = useQuarterStore((s) => s.selectedQuarter);

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

	// 분기 전체 (withdrawn 포함 — 환불이 수익에 차감되어야 함)
	const quarterAll = enrollments.filter(
		(e) => e.quarter === selectedQuarter || !e.quarter,
	);
	// 수익 집계용 (exempt 제외, withdrawn 포함하여 환불 차감 반영)
	const quarterRevenue = quarterAll.filter((e) => e.paymentStatus !== "exempt");
	// 활성 수강생 (완납/미납 카운트 및 예상수익/차트용)
	const quarterActive = quarterRevenue.filter((e) => e.paymentStatus !== "withdrawn");
	// 수강생 수 = 면제 포함, 포기(withdrawn)만 제외 (면제는 수강비만 면제일 뿐 엄연한 수강생)
	const quarterEnrolled = quarterAll.filter((e) => e.paymentStatus !== "withdrawn");

	const totalCourses = courses.length;
	const totalStudents = new Set(quarterEnrolled.map((e) => e.studentId)).size;

	const completedPayments = quarterActive.filter(
		(e) => e.paymentStatus === "completed",
	).length;
	const partialPayments = quarterActive.filter(
		(e) => e.paymentStatus === "partial",
	).length;
	const pendingPayments = quarterActive.filter(
		(e) => e.paymentStatus === "pending",
	).length;

	// 총 수익: withdrawn 포함 — 환불 금액(음수 paidAmount) 차감됨
	const totalRevenue = quarterRevenue.reduce(
		(sum, enrollment) => sum + enrollment.paidAmount,
		0,
	);

	// 예상수익: active만 (포기 학생은 기대 수익에서 제외), 할인 반영
	const expectedRevenue = quarterActive.reduce((sum, enrollment) => {
		const course = courses.find((c) => c.id === enrollment.courseId);
		return sum + Math.max(0, (course?.fee || 0) - (enrollment.discountAmount ?? 0));
	}, 0);

	const paymentRate =
		expectedRevenue > 0 ? (totalRevenue / expectedRevenue) * 100 : 0;

	if (loading) {
		return (
			<PageEnter>
				<div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
					{Array.from({ length: 6 }).map((_, i) => (
						<div key={i} style={{ borderRadius: 8, border: '1px solid hsl(var(--border))', padding: 12 }}>
							<div style={{ height: 12, width: '50%', borderRadius: 4, background: 'hsl(var(--muted))', animation: 'skeleton-pulse 1.5s ease-in-out infinite', marginBottom: 8 }} />
							<div style={{ height: 24, width: '60%', borderRadius: 4, background: 'hsl(var(--muted))', animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
						</div>
					))}
				</div>
				<div className="grid md:grid-cols-[2fr_1fr] gap-2" style={{ marginTop: 16 }}>
					<div style={{ height: 250, borderRadius: 8, background: 'hsl(var(--muted))', animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
					<div style={{ height: 250, borderRadius: 8, background: 'hsl(var(--muted))', animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
				</div>
				<div style={{ height: 300, borderRadius: 8, background: 'hsl(var(--muted))', animation: 'skeleton-pulse 1.5s ease-in-out infinite', marginTop: 16 }} />
			</PageEnter>
		);
	}

	return (
		<PageEnter>
			{/* 상단 통계 — 핵심 3개 (가운데 납부액은 금액이라 더 넓게) */}
			<div className="grid grid-cols-1 sm:grid-cols-[1fr_1.6fr_1fr] gap-2">
				<Card className="cursor-pointer card-interactive" onClick={() => navigate("/students")}>
					<CardContent className="p-4">
						<p className="text-sm font-semibold text-muted-foreground mb-1">수강생</p>
						{totalStudents === 0 ? (
							<div className="flex items-center gap-1.5 text-base text-primary font-medium mt-1">
								<Plus className="h-5 w-5" />
								<span>등록하기</span>
							</div>
						) : (
							<p className="text-[2.1rem] leading-none font-bold tabular-nums text-foreground whitespace-nowrap" style={{ letterSpacing: '-0.03em' }}>
								{totalStudents}<span className="text-lg font-medium text-muted-foreground ml-1">명</span>
							</p>
						)}
					</CardContent>
				</Card>
				<Card className="cursor-pointer card-interactive" onClick={() => navigate("/revenue")}>
					<CardContent className="p-4">
						<p className="text-sm font-semibold text-muted-foreground mb-1">이번 분기 납부액</p>
						<p className="text-[2.1rem] leading-none font-bold tabular-nums text-foreground whitespace-nowrap" style={{ letterSpacing: '-0.03em' }}>
							{totalRevenue.toLocaleString()}<span className="text-lg font-medium text-muted-foreground ml-1">원</span>
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<p className="text-sm font-semibold text-muted-foreground mb-1">납부율</p>
						<p className="text-[2.1rem] leading-none font-bold tabular-nums text-foreground whitespace-nowrap" style={{ letterSpacing: '-0.03em' }}>
							{paymentRate.toFixed(0)}<span className="text-lg font-medium text-muted-foreground ml-1">%</span>
						</p>
					</CardContent>
				</Card>
			</div>

			{/* 보조 지표 — 한 줄 */}
			<Card className="mt-2">
				<CardContent className="flex items-stretch divide-x divide-border p-0">
					<button type="button" onClick={() => navigate("/courses")} className="flex-1 px-6 py-3.5 text-left transition-colors hover:bg-accent">
						<p className="text-sm font-semibold text-muted-foreground mb-1.5">강좌</p>
						<p className="text-xl font-bold tabular-nums text-foreground whitespace-nowrap">{totalCourses}<span className="text-base font-medium text-muted-foreground ml-1">개</span></p>
					</button>
					<div className="flex-1 px-6 py-3.5">
						<p className="text-sm font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
							<span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'hsl(142 64% 30%)' }} />완납
						</p>
						<p className="text-xl font-bold tabular-nums text-foreground whitespace-nowrap">{completedPayments}<span className="text-base font-medium text-muted-foreground ml-1">건</span></p>
					</div>
					<div className="flex-1 px-6 py-3.5">
						<p className="text-sm font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
							<span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'hsl(35 88% 35%)' }} />부분납부
						</p>
						<p className="text-xl font-bold tabular-nums text-foreground whitespace-nowrap">{partialPayments}<span className="text-base font-medium text-muted-foreground ml-1">건</span></p>
					</div>
					<div className="flex-1 px-6 py-3.5">
						<p className="text-sm font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
							<span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'hsl(0 72% 45%)' }} />미납
						</p>
						<p className="text-xl font-bold tabular-nums text-foreground whitespace-nowrap">{pendingPayments}<span className="text-base font-medium text-muted-foreground ml-1">건</span></p>
					</div>
				</CardContent>
			</Card>

			{/* 전체 강좌 */}
			<Card className="mt-2">
				<CardHeader className="p-4 pb-2">
					<CardTitle className="text-base">전체 강좌 ({totalCourses})</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-2">
					{courses.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
							<p className="mb-2">등록된 강좌가 없습니다</p>
							<Button onClick={() => navigate("/courses")}>
								<Plus className="h-4 w-4" />
								강좌 등록하기
							</Button>
						</div>
					) : (
						<>
							<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
								{(showAllCourses ? courses : courses.slice(0, COURSE_COLLAPSE_LIMIT)).map((course) => {
									// 정원 표시는 strict 분기 매칭 (null-quarter legacy 제외)
									const currentStudents = enrollments.filter(
										(e) => isActiveEnrollment(e) && e.courseId === course.id && e.quarter === selectedQuarter,
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
							{courses.length > COURSE_COLLAPSE_LIMIT && (
								<button
									type="button"
									onClick={() => setShowAllCourses((v) => !v)}
									className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								>
									{showAllCourses ? (
										<>접기 <ChevronUp className="h-4 w-4" /></>
									) : (
										<>강좌 {courses.length - COURSE_COLLAPSE_LIMIT}개 더 보기 <ChevronDown className="h-4 w-4" /></>
									)}
								</button>
							)}
						</>
					)}
				</CardContent>
			</Card>

			{/* 차트 */}
			<div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-2 mt-2">
				<Card>
					<CardHeader className="p-4 pb-2">
						<CardTitle className="text-base">강좌별 수익</CardTitle>
					</CardHeader>
					<CardContent className="p-4 pt-2">
						<CourseRevenueChart enrollments={quarterRevenue} courses={courses} />
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="p-4 pb-2">
						<CardTitle className="text-base">납부 상태</CardTitle>
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
