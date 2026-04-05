import { Plus } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { CourseRevenueChart, PaymentStatusChart } from "@tutomate/ui";
import {
	EXEMPT_COLOR,
	useCourseStore,
	useEnrollmentStore,
	useMonthlyPaymentStore,
	useStudentStore,
	generateAllNotifications,
	isActiveEnrollment,
} from "@tutomate/core";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";

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
			const { enrollments, students, courses } = {
				enrollments: useEnrollmentStore.getState().enrollments,
				students: useStudentStore.getState().students,
				courses: useCourseStore.getState().courses,
			};
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

	const totalCourses = courses.length;
	const totalStudents = students.length;

	const { completedPayments, pendingPayments, totalRevenue, paymentRate } = useMemo(() => {
		const completed = enrollments.filter(
			(e) => isActiveEnrollment(e) && e.paymentStatus === "completed",
		).length;
		const pending = enrollments.filter(
			(e) => isActiveEnrollment(e) && e.paymentStatus === "pending",
		).length;

		const revenue = enrollments
			.filter((e) => isActiveEnrollment(e) && e.paymentStatus !== "exempt")
			.reduce((sum, enrollment) => {
				return sum + enrollment.paidAmount;
			}, 0);

		const expected = enrollments
			.filter((e) => isActiveEnrollment(e) && e.paymentStatus !== "exempt")
			.reduce((sum, enrollment) => {
				const course = courses.find((c) => c.id === enrollment.courseId);
				return sum + (course?.fee || 0);
			}, 0);

		const rate = expected > 0 ? (revenue / expected) * 100 : 0;

		return {
			completedPayments: completed,
			pendingPayments: pending,
			totalRevenue: revenue,
			expectedRevenue: expected,
			paymentRate: rate,
		};
	}, [enrollments, courses]);

	const enrollmentCountMap = useMemo(() => {
		const map = new Map<string, number>();
		for (const e of enrollments) {
			if (!isActiveEnrollment(e)) continue;
			map.set(e.courseId, (map.get(e.courseId) || 0) + 1);
		}
		return map;
	}, [enrollments]);

	if (loading) {
		return (
			<div className="page-enter">
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
			</div>
		);
	}

	return (
		<div className="page-enter">
			{/* 상단 통계 - 한 줄 */}
			<div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
				<Card
					className="cursor-pointer hover:shadow-md transition-shadow"
					onClick={() => navigate("/courses")}
				>
					<CardContent className="p-3">
						<p className="text-xs text-muted-foreground">강좌</p>
						<p className="text-xl font-bold text-primary">{totalCourses}</p>
					</CardContent>
				</Card>
				<Card
					className="cursor-pointer hover:shadow-md transition-shadow"
					onClick={() => navigate("/students")}
				>
					<CardContent className="p-3">
						<p className="text-xs text-muted-foreground">수강생</p>
						<p className="text-xl font-bold text-success">{totalStudents}</p>
					</CardContent>
				</Card>
				<Card
					className="cursor-pointer hover:shadow-md transition-shadow"
					onClick={() => navigate("/revenue")}
				>
					<CardContent className="p-3">
						<p className="text-xs text-muted-foreground">납부</p>
						<p className="text-xl font-bold" style={{ color: EXEMPT_COLOR }}>
							{totalRevenue.toLocaleString()}<span className="text-sm font-normal">원</span>
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-3">
						<p className="text-xs text-muted-foreground">납부율</p>
						<p className={`text-xl font-bold ${paymentRate >= 80 ? 'text-success' : 'text-warning'}`}>
							{paymentRate.toFixed(0)}<span className="text-sm font-normal">%</span>
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-3">
						<p className="text-xs text-muted-foreground">완납</p>
						<p className="text-xl font-bold text-success">
							{completedPayments}<span className="text-sm font-normal">건</span>
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-3">
						<p className="text-xs text-muted-foreground">미납</p>
						<p className="text-xl font-bold text-error">
							{pendingPayments}<span className="text-sm font-normal">건</span>
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
						<div className="text-center py-8 text-muted-foreground">
							<p className="mb-4">등록된 강좌가 없습니다</p>
							<Button onClick={() => navigate("/courses")}>
								<Plus className="h-4 w-4" />
								강좌 등록하기
							</Button>
						</div>
					) : (
						<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
							{courses.map((course) => {
								const currentStudents = enrollmentCountMap.get(course.id) || 0;
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
													indicatorClassName={percentage >= 100 ? 'bg-destructive' : ''}
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
						<CourseRevenueChart enrollments={enrollments} courses={courses} />
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="p-4 pb-2">
						<CardTitle className="text-sm">납부 상태</CardTitle>
					</CardHeader>
					<CardContent className="p-4 pt-2">
						<PaymentStatusChart enrollments={enrollments} />
					</CardContent>
				</Card>
			</div>
		</div>
	);
};

export default DashboardPage;
