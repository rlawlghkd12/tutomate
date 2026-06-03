import dayjs from "dayjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock notificationStore — 묵은 알림 정리(prune) 검증을 위해 stateful 하게 구성
let mockNotifications: Array<{
	id: string;
	type: string;
	relatedType?: string;
	relatedId?: string;
}> = [];
const mockAddNotification = vi.fn();
const mockDeleteNotification = vi.fn((id: string) => {
	mockNotifications = mockNotifications.filter((n) => n.id !== id);
});
vi.mock("../../stores/notificationStore", () => ({
	useNotificationStore: {
		getState: () => ({
			addNotification: mockAddNotification,
			deleteNotification: mockDeleteNotification,
			notifications: mockNotifications,
		}),
	},
}));

import type { Course, Enrollment, Student } from "../../types";
import {
	generateAllNotifications,
	generatePaymentOverdueNotifications,
	generatePaymentReminderNotifications,
	prunePaidPaymentNotifications,
} from "../notificationGenerator";

// ─── 테스트 데이터 ───

const student: Student = {
	id: "s1",
	name: "홍길동",
	phone: "010-1234-5678",
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
};

const course: Course = {
	id: "c1",
	name: "수학반",
	classroom: "A",
	instructorName: "김강사",
	instructorPhone: "010-0000-0000",
	fee: 200000,
	maxStudents: 20,
	currentStudents: 5,
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
};

function makeEnrollment(overrides: Partial<Enrollment> = {}): Enrollment {
	return {
		id: "e1",
		studentId: "s1",
		courseId: "c1",
		paidAmount: 0,
		remainingAmount: 200000,
		paymentStatus: "pending",
		enrolledAt: dayjs().subtract(35, "day").toISOString(),
		discountAmount: 0,
		...overrides,
	};
}

describe("notificationGenerator", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		mockNotifications = [];
	});

	// ── generatePaymentOverdueNotifications ──

	describe("generatePaymentOverdueNotifications", () => {
		it("30일 이상 미납 → overdue 알림 생성", () => {
			const enrollment = makeEnrollment({
				paymentStatus: "pending",
				enrolledAt: dayjs().subtract(35, "day").toISOString(),
			});

			generatePaymentOverdueNotifications([enrollment], [student], [course]);

			expect(mockAddNotification).toHaveBeenCalledTimes(1);
			expect(mockAddNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "payment_overdue",
					title: "납부 기한 경과",
					priority: "high",
					relatedId: "s1",
				}),
			);
		});

		it("부분납부도 30일 이상이면 overdue 알림", () => {
			const enrollment = makeEnrollment({
				paymentStatus: "partial",
				paidAmount: 100000,
				remainingAmount: 100000,
				enrolledAt: dayjs().subtract(31, "day").toISOString(),
			});

			generatePaymentOverdueNotifications([enrollment], [student], [course]);
			expect(mockAddNotification).toHaveBeenCalledTimes(1);
		});

		it("29일 미납 → 알림 미생성", () => {
			const enrollment = makeEnrollment({
				paymentStatus: "pending",
				enrolledAt: dayjs().subtract(29, "day").toISOString(),
			});

			generatePaymentOverdueNotifications([enrollment], [student], [course]);
			expect(mockAddNotification).not.toHaveBeenCalled();
		});

		it("완납 상태 → 알림 미생성", () => {
			const enrollment = makeEnrollment({
				paymentStatus: "completed",
				enrolledAt: dayjs().subtract(60, "day").toISOString(),
			});

			generatePaymentOverdueNotifications([enrollment], [student], [course]);
			expect(mockAddNotification).not.toHaveBeenCalled();
		});

		it("면제 상태 → 알림 미생성", () => {
			const enrollment = makeEnrollment({
				paymentStatus: "exempt",
				enrolledAt: dayjs().subtract(60, "day").toISOString(),
			});

			generatePaymentOverdueNotifications([enrollment], [student], [course]);
			expect(mockAddNotification).not.toHaveBeenCalled();
		});

		it("학생/강좌 못 찾으면 알림 미생성", () => {
			const enrollment = makeEnrollment({
				studentId: "unknown",
				enrolledAt: dayjs().subtract(35, "day").toISOString(),
			});

			generatePaymentOverdueNotifications([enrollment], [student], [course]);
			expect(mockAddNotification).not.toHaveBeenCalled();
		});
	});

	// ── generatePaymentReminderNotifications ──

	describe("generatePaymentReminderNotifications", () => {
		it.each([7, 14, 21])("등록 후 %d일째 미완납 → reminder 알림", (days) => {
			const enrollment = makeEnrollment({
				paymentStatus: "pending",
				enrolledAt: dayjs().subtract(days, "day").toISOString(),
			});

			generatePaymentReminderNotifications([enrollment], [student], [course]);

			expect(mockAddNotification).toHaveBeenCalledTimes(1);
			expect(mockAddNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "payment_reminder",
					title: "납부 안내",
					priority: "low",
				}),
			);
		});

		it("8일째 → 알림 미생성 (7/14/21만)", () => {
			const enrollment = makeEnrollment({
				paymentStatus: "pending",
				enrolledAt: dayjs().subtract(8, "day").toISOString(),
			});

			generatePaymentReminderNotifications([enrollment], [student], [course]);
			expect(mockAddNotification).not.toHaveBeenCalled();
		});

		it("완납 상태 → reminder 미생성", () => {
			const enrollment = makeEnrollment({
				paymentStatus: "completed",
				enrolledAt: dayjs().subtract(7, "day").toISOString(),
			});

			generatePaymentReminderNotifications([enrollment], [student], [course]);
			expect(mockAddNotification).not.toHaveBeenCalled();
		});
	});

	// ── 경계값 및 추가 케이스 ──

	describe('generatePaymentOverdueNotifications — 경계값', () => {
		it('정확히 30일째 → overdue 알림 생성 (경계 포함)', () => {
			const enrollment = makeEnrollment({
				paymentStatus: 'pending',
				enrolledAt: dayjs().subtract(30, 'day').toISOString(),
			});
			generatePaymentOverdueNotifications([enrollment], [student], [course]);
			expect(mockAddNotification).toHaveBeenCalledTimes(1);
		});

		it('빈 enrollment 목록 → 알림 없음', () => {
			generatePaymentOverdueNotifications([], [student], [course]);
			expect(mockAddNotification).not.toHaveBeenCalled();
		});

		it('모든 enrollment 완납 → 알림 없음', () => {
			const e1 = makeEnrollment({ paymentStatus: 'completed', enrolledAt: dayjs().subtract(60, 'day').toISOString() });
			const e2 = makeEnrollment({ id: 'e2', paymentStatus: 'completed', enrolledAt: dayjs().subtract(40, 'day').toISOString() });
			generatePaymentOverdueNotifications([e1, e2], [student], [course]);
			expect(mockAddNotification).not.toHaveBeenCalled();
		});

		it('1일 미납 → overdue 미생성 (30일 미만)', () => {
			const enrollment = makeEnrollment({
				paymentStatus: 'pending',
				enrolledAt: dayjs().subtract(1, 'day').toISOString(),
			});
			generatePaymentOverdueNotifications([enrollment], [student], [course]);
			expect(mockAddNotification).not.toHaveBeenCalled();
		});
	});

	describe('generatePaymentReminderNotifications — 경계값', () => {
		it('빈 enrollment 목록 → 알림 없음', () => {
			generatePaymentReminderNotifications([], [student], [course]);
			expect(mockAddNotification).not.toHaveBeenCalled();
		});

		it('모든 enrollment 완납 → reminder 없음', () => {
			const e1 = makeEnrollment({ paymentStatus: 'completed', enrolledAt: dayjs().subtract(7, 'day').toISOString() });
			const e2 = makeEnrollment({ id: 'e2', paymentStatus: 'completed', enrolledAt: dayjs().subtract(14, 'day').toISOString() });
			generatePaymentReminderNotifications([e1, e2], [student], [course]);
			expect(mockAddNotification).not.toHaveBeenCalled();
		});

		it('6일째 → reminder 미생성 (7/14/21만)', () => {
			const enrollment = makeEnrollment({
				paymentStatus: 'pending',
				enrolledAt: dayjs().subtract(6, 'day').toISOString(),
			});
			generatePaymentReminderNotifications([enrollment], [student], [course]);
			expect(mockAddNotification).not.toHaveBeenCalled();
		});

		it('면제 상태 → 완납이 아니므로 reminder 생성됨 (completed만 제외)', () => {
			const enrollment = makeEnrollment({
				paymentStatus: 'exempt',
				enrolledAt: dayjs().subtract(7, 'day').toISOString(),
			});
			generatePaymentReminderNotifications([enrollment], [student], [course]);
			// exempt은 completed가 아니므로 알림 생성
			expect(mockAddNotification).toHaveBeenCalledTimes(1);
		});
	});

	// ── generateAllNotifications ──

	describe("generateAllNotifications", () => {
		it("하루 첫 호출 → overdue + reminder 모두 실행", () => {
			const overdueEnrollment = makeEnrollment({
				id: "e1",
				paymentStatus: "pending",
				enrolledAt: dayjs().subtract(35, "day").toISOString(),
			});
			const reminderEnrollment = makeEnrollment({
				id: "e2",
				studentId: "s1",
				courseId: "c1",
				paymentStatus: "pending",
				enrolledAt: dayjs().subtract(7, "day").toISOString(),
			});

			generateAllNotifications(
				[overdueEnrollment, reminderEnrollment],
				[student],
				[course],
			);

			expect(mockAddNotification).toHaveBeenCalledTimes(2);
			expect(localStorage.getItem("lastNotificationGeneration")).toBe(
				dayjs().format("YYYY-MM-DD"),
			);
		});

		it("같은 날 두 번째 호출 → 스킵", () => {
			localStorage.setItem(
				"lastNotificationGeneration",
				dayjs().format("YYYY-MM-DD"),
			);

			const enrollment = makeEnrollment({
				paymentStatus: "pending",
				enrolledAt: dayjs().subtract(35, "day").toISOString(),
			});

			generateAllNotifications([enrollment], [student], [course]);
			expect(mockAddNotification).not.toHaveBeenCalled();
		});

		it("어제 생성 → 오늘 다시 실행", () => {
			localStorage.setItem(
				"lastNotificationGeneration",
				dayjs().subtract(1, "day").format("YYYY-MM-DD"),
			);

			const enrollment = makeEnrollment({
				paymentStatus: "pending",
				enrolledAt: dayjs().subtract(35, "day").toISOString(),
			});

			generateAllNotifications([enrollment], [student], [course]);
			expect(mockAddNotification).toHaveBeenCalled();
		});

		it("데이터 빈 배열 → 에러 없이 완료, localStorage 갱신", () => {
			generateAllNotifications([], [], []);
			expect(mockAddNotification).not.toHaveBeenCalled();
			expect(localStorage.getItem("lastNotificationGeneration")).toBe(
				dayjs().format("YYYY-MM-DD"),
			);
		});
	});

	// ── prunePaidPaymentNotifications ──

	describe("prunePaidPaymentNotifications", () => {
		it("완납된 학생의 묵은 납부 알림 삭제", () => {
			mockNotifications = [
				{ id: "n1", type: "payment_overdue", relatedType: "student", relatedId: "s1" },
			];
			const paid = makeEnrollment({ paymentStatus: "completed" });
			prunePaidPaymentNotifications([paid]);
			expect(mockDeleteNotification).toHaveBeenCalledWith("n1");
		});

		it("면제 학생의 납부 알림 삭제", () => {
			mockNotifications = [
				{ id: "n1", type: "payment_reminder", relatedType: "student", relatedId: "s1" },
			];
			prunePaidPaymentNotifications([makeEnrollment({ paymentStatus: "exempt" })]);
			expect(mockDeleteNotification).toHaveBeenCalledWith("n1");
		});

		it("아직 미납인 학생의 알림은 유지", () => {
			mockNotifications = [
				{ id: "n1", type: "payment_overdue", relatedType: "student", relatedId: "s1" },
			];
			prunePaidPaymentNotifications([makeEnrollment({ paymentStatus: "pending" })]);
			expect(mockDeleteNotification).not.toHaveBeenCalled();
		});

		it("부분 납부(partial)는 아직 미납이므로 유지", () => {
			mockNotifications = [
				{ id: "n1", type: "payment_overdue", relatedType: "student", relatedId: "s1" },
			];
			prunePaidPaymentNotifications([makeEnrollment({ paymentStatus: "partial" })]);
			expect(mockDeleteNotification).not.toHaveBeenCalled();
		});

		it("같은 학생이 수강 2개 중 1개라도 미납이면 유지", () => {
			mockNotifications = [
				{ id: "n1", type: "payment_overdue", relatedType: "student", relatedId: "s1" },
			];
			prunePaidPaymentNotifications([
				makeEnrollment({ id: "e1", paymentStatus: "completed" }),
				makeEnrollment({ id: "e2", paymentStatus: "pending" }),
			]);
			expect(mockDeleteNotification).not.toHaveBeenCalled();
		});

		it("납부 외(info) 알림은 건드리지 않음", () => {
			mockNotifications = [
				{ id: "n1", type: "info", relatedType: "student", relatedId: "s1" },
			];
			prunePaidPaymentNotifications([makeEnrollment({ paymentStatus: "completed" })]);
			expect(mockDeleteNotification).not.toHaveBeenCalled();
		});
	});

	// ── generatePaymentReminderNotifications — student/course 못 찾는 경우 ──

	describe("generatePaymentReminderNotifications — missing student/course", () => {
		it("student 없으면 알림 생성 안 함", () => {
			const enrollment = makeEnrollment({
				paymentStatus: "pending",
				enrolledAt: dayjs().subtract(7, "day").toISOString(),
				studentId: "s-missing",
			});

			generatePaymentReminderNotifications([enrollment], [student], [course]);
			expect(mockAddNotification).not.toHaveBeenCalled();
		});

		it("course 없으면 알림 생성 안 함", () => {
			const enrollment = makeEnrollment({
				paymentStatus: "pending",
				enrolledAt: dayjs().subtract(14, "day").toISOString(),
				courseId: "c-missing",
			});

			generatePaymentReminderNotifications([enrollment], [student], [course]);
			expect(mockAddNotification).not.toHaveBeenCalled();
		});
	});
});
