import { Plus, Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import {
	CourseRevenueChart, PaymentStatusChart, Button,
	Card, CardContent, CardHeader, CardTitle, Progress,
} from "@tutomate/ui";
import {
	EXEMPT_COLOR,
	useCourseStore,
	useEnrollmentStore,
	useMonthlyPaymentStore,
	useStudentStore,
	generateAllNotifications,
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

	const completedPayments = enrollments.filter(
		(e) => e.paymentStatus === "completed",
	).length;
	const pendingPayments = enrollments.filter(
		(e) => e.paymentStatus === "pending",
	).length;

	const totalRevenue = enrollments
		.filter((e) => e.paymentStatus !== "exempt")
		.reduce((sum, enrollment) => {
			return sum + enrollment.paidAmount;
		}, 0);

	const expectedRevenue = enrollments
		.filter((e) => e.paymentStatus !== "exempt")
		.reduce((sum, enrollment) => {
			const course = courses.find((c) => c.id === enrollment.courseId);
			return sum + (course?.fee || 0);
		}, 0);

	const paymentRate =
		expectedRevenue > 0 ? (totalRevenue / expectedRevenue) * 100 : 0;

	if (loading) {
		return (
			<div className="flex items-center justify-center h-[400px]">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div>
			{/* 상단 통계 */}
			<div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
				<Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/courses")}>
					<CardContent className="p-3">
						<p className="text-xs text-muted-foreground">강좌</p>
						<p className="text-xl font-bold text-primary">{totalCourses}</p>
					</CardContent>
				</Card>
				<Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/students")}>
					<CardContent className="p-3">
						<p className="text-xs text-muted-foreground">수강생</p>
						<p className="text-xl font-bold text-green-600 dark:text-green-400">{totalStudents}</p>
					</CardContent>
				</Card>
				<Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/revenue")}>
					<CardContent className="p-3">
						<p className="text-xs text-muted-foreground">납부</p>
						<p className="text-xl font-bold" style={{ color: EXEMPT_COLOR }}>{totalRevenue.toLocaleString()}원</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-3">
						<p className="text-xs text-muted-foreground">납부율</p>
						<p className={`text-xl font-bold ${paymentRate >= 80 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
							{paymentRate.toFixed(0)}%
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-3">
						<p className="text-xs text-muted-foreground">완납</p>
						<p className="text-xl font-bold text-green-600 dark:text-green-400">{completedPayments}건</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-3">
						<p className="text-xs text-muted-foreground">미납</p>
						<p className="text-xl font-bold text-red-600 dark:text-red-400">{pendingPayments}건</p>
					</CardContent>
				</Card>
			</div>

			{/* 전체 강좌 */}
			<Card className="mt-4">
				<CardHeader className="p-4 pb-2">
					<CardTitle className="text-sm font-semibold">전체 강좌 ({totalCourses})</CardTitle>
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
								const currentStudents = enrollments.filter(
									(e) => e.courseId === course.id,
								).length;
								const percentage = (currentStudents / course.maxStudents) * 100;
								return (
									<Card
										key={course.id}
										className="cursor-pointer hover:shadow-md transition-shadow"
										onClick={() => navigate(`/courses/${course.id}`)}
									>
										<CardContent className="p-3">
											<div className="font-semibold text-sm mb-1 truncate">
												{course.name}
											</div>
											<div className="text-xs text-muted-foreground mb-2">
												{course.instructorName} · {course.classroom}
											</div>
											<div className="flex items-center gap-2">
												<Progress
													value={Math.min(percentage, 100)}
													className={`flex-1 h-2 ${percentage >= 100 ? '[&>div]:bg-destructive' : ''}`}
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
						<CardTitle className="text-sm font-semibold">강좌별 수익</CardTitle>
					</CardHeader>
					<CardContent className="p-4 pt-2">
						<CourseRevenueChart enrollments={enrollments} courses={courses} />
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="p-4 pb-2">
						<CardTitle className="text-sm font-semibold">납부 상태</CardTitle>
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
