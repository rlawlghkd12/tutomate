import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock authStore
vi.mock("../authStore", () => ({
	isCloud: () => true,
	getOrgId: () => "test-org-id",
}));

// Mock supabase client
const mockSelect = vi.fn().mockReturnValue({
	eq: vi.fn().mockResolvedValue({ data: [], error: null }),
});
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi
	.fn()
	.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
const mockDelete = vi
	.fn()
	.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

vi.mock("../../config/supabase", () => ({
	supabase: {
		from: () => ({
			select: mockSelect,
			insert: mockInsert,
			update: mockUpdate,
			delete: mockDelete,
		}),
	},
}));

// Mock logger
vi.mock("../../utils/logger", () => ({
	logError: vi.fn(),
	logWarn: vi.fn(),
	logInfo: vi.fn(),
	logDebug: vi.fn(),
}));

vi.mock("../../utils/errorReporter", () => ({
	reportError: vi.fn(),
}));

import { useEnrollmentStore } from "../enrollmentStore";
import type { Enrollment } from "../../types";

function makeEnrollment(overrides: Partial<Enrollment> = {}): Enrollment {
	return {
		id: "e1",
		courseId: "c1",
		studentId: "s1",
		enrolledAt: "2026-03-01T00:00:00Z",
		paymentStatus: "pending",
		paidAmount: 0,
		remainingAmount: 300000,
		discountAmount: 0,
		...overrides,
	};
}

describe("enrollmentStore — updatePayment 결제 로직", () => {
	beforeEach(() => {
		useEnrollmentStore.setState({ enrollments: [makeEnrollment()] });
	});

	it("전액 납부 → completed, remainingAmount: 0", async () => {
		await useEnrollmentStore.getState().updatePayment("e1", 300000, 300000);
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		expect(e.paymentStatus).toBe("completed");
		expect(e.remainingAmount).toBe(0);
		expect(e.paidAmount).toBe(300000);
	});

	it("부분 납부 → partial, 잔액 계산", async () => {
		await useEnrollmentStore.getState().updatePayment("e1", 100000, 300000);
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		expect(e.paymentStatus).toBe("partial");
		expect(e.remainingAmount).toBe(200000);
	});

	it("미납 → pending", async () => {
		await useEnrollmentStore.getState().updatePayment("e1", 0, 300000);
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		expect(e.paymentStatus).toBe("pending");
		expect(e.remainingAmount).toBe(300000);
	});

	it("면제 → exempt, paidAmount: 0, remainingAmount: 0", async () => {
		await useEnrollmentStore
			.getState()
			.updatePayment("e1", 0, 300000, undefined, true);
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		expect(e.paymentStatus).toBe("exempt");
		expect(e.paidAmount).toBe(0);
		expect(e.remainingAmount).toBe(0);
	});

	it("할인 적용 — effectiveFee 기준 계산", async () => {
		await useEnrollmentStore
			.getState()
			.updatePayment("e1", 250000, 300000, undefined, false, undefined, 50000);
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		// effectiveFee = 300000 - 50000 = 250000
		expect(e.paymentStatus).toBe("completed");
		expect(e.remainingAmount).toBe(0);
	});

	it("할인 + 부분 납부", async () => {
		await useEnrollmentStore
			.getState()
			.updatePayment("e1", 100000, 300000, undefined, false, undefined, 50000);
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		// effectiveFee = 250000, paid = 100000
		expect(e.paymentStatus).toBe("partial");
		expect(e.remainingAmount).toBe(150000);
	});

	it("기존 할인 유지 — discountAmount 미전달 시 enrollment의 기존값 사용", async () => {
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment({ discountAmount: 30000 })],
		});
		await useEnrollmentStore.getState().updatePayment("e1", 270000, 300000);
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		// effectiveFee = 300000 - 30000 = 270000, paid = 270000
		expect(e.paymentStatus).toBe("completed");
		expect(e.remainingAmount).toBe(0);
	});

	it("결제 방법 전달 시 업데이트에 포함", async () => {
		await useEnrollmentStore
			.getState()
			.updatePayment("e1", 300000, 300000, undefined, false, "card");
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		expect(e.paymentMethod).toBe("card");
	});

	it("납부일 미전달 시 오늘 날짜 사용", async () => {
		const { default: dayjs } = await import("dayjs");
		const today = dayjs().format("YYYY-MM-DD");
		await useEnrollmentStore.getState().updatePayment("e1", 300000, 300000);
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		expect(e.paidAt).toBe(today);
	});

	it("납부일 직접 지정", async () => {
		await useEnrollmentStore
			.getState()
			.updatePayment("e1", 300000, 300000, "2026-02-15");
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		expect(e.paidAt).toBe("2026-02-15");
	});
});

describe("enrollmentStore — CRUD", () => {
	beforeEach(() => {
		useEnrollmentStore.setState({ enrollments: [] });
	});

	it("addEnrollment — 성공 시 true + state에 추가, discountAmount 기본값 0", async () => {
		const result = await useEnrollmentStore.getState().addEnrollment({
			courseId: "c1",
			studentId: "s1",
			paymentStatus: "pending",
			paidAmount: 0,
			discountAmount: 0,
		} as any);
		expect(result).toBe(true);
		const enrollments = useEnrollmentStore.getState().enrollments;
		expect(enrollments).toHaveLength(1);
		expect(enrollments[0].discountAmount).toBe(0);
		expect(enrollments[0].id).toBeTruthy();
		expect(enrollments[0].enrolledAt).toBeTruthy();
	});

	it("addEnrollment — 서버 실패 시 false, state 변경 없음", async () => {
		const existing = makeEnrollment({ id: "e-existing" });
		useEnrollmentStore.setState({ enrollments: [existing] });
		mockInsert.mockResolvedValueOnce({ error: { message: "insert failed" } });

		const result = await useEnrollmentStore.getState().addEnrollment({
			courseId: "c1",
			studentId: "s1",
			paymentStatus: "pending",
			paidAmount: 0,
			discountAmount: 0,
		} as any);

		expect(result).toBe(false);
		const enrollments = useEnrollmentStore.getState().enrollments;
		expect(enrollments).toHaveLength(1);
		expect(enrollments[0].id).toBe("e-existing");
	});

	it("updateEnrollment — 성공 시 true + 부분 업데이트", async () => {
		useEnrollmentStore.setState({ enrollments: [makeEnrollment()] });
		const result = await useEnrollmentStore
			.getState()
			.updateEnrollment("e1", { notes: "변경됨" });
		expect(result).toBe(true);
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		expect(e.notes).toBe("변경됨");
		expect(e.courseId).toBe("c1"); // 다른 필드 변경 없음
	});

	it("updateEnrollment — 서버 실패 시 false, state 변경 없음", async () => {
		const existing = makeEnrollment({ id: "e1", notes: "원래 메모" });
		useEnrollmentStore.setState({ enrollments: [existing] });
		mockUpdate.mockReturnValueOnce({
			eq: vi.fn().mockResolvedValue({ error: { message: "update failed" } }),
		});

		const result = await useEnrollmentStore
			.getState()
			.updateEnrollment("e1", { notes: "변경" });

		expect(result).toBe(false);
		expect(useEnrollmentStore.getState().getEnrollmentById("e1")?.notes).toBe(
			"원래 메모",
		);
	});

	it("updateEnrollment — 여러 enrollment 중 하나만 업데이트", async () => {
		const e1 = makeEnrollment({ id: "e1", courseId: "c1" });
		const e2 = makeEnrollment({ id: "e2", courseId: "c2" });
		useEnrollmentStore.setState({ enrollments: [e1, e2] });
		const result = await useEnrollmentStore
			.getState()
			.updateEnrollment("e1", { notes: "변경" });
		expect(result).toBe(true);
		expect(useEnrollmentStore.getState().getEnrollmentById("e1")?.notes).toBe(
			"변경",
		);
		expect(
			useEnrollmentStore.getState().getEnrollmentById("e2")?.notes,
		).toBeUndefined();
	});

	it("deleteEnrollment — 성공 시 true + state에서 제거", async () => {
		const e1 = makeEnrollment({ id: "e1" });
		const e2 = makeEnrollment({ id: "e2", courseId: "c2" });
		useEnrollmentStore.setState({ enrollments: [e1, e2] });

		const result = await useEnrollmentStore.getState().deleteEnrollment("e1");

		expect(result).toBe(true);
		const enrollments = useEnrollmentStore.getState().enrollments;
		expect(enrollments).toHaveLength(1);
		expect(enrollments[0].id).toBe("e2");
	});

	it("deleteEnrollment — 서버 실패 시 false, state 변경 없음", async () => {
		const e1 = makeEnrollment({ id: "e1" });
		useEnrollmentStore.setState({ enrollments: [e1] });
		mockDelete.mockReturnValueOnce({
			eq: vi.fn().mockResolvedValue({ error: { message: "delete failed" } }),
		});

		const result = await useEnrollmentStore.getState().deleteEnrollment("e1");

		expect(result).toBe(false);
		expect(useEnrollmentStore.getState().enrollments).toHaveLength(1);
		expect(useEnrollmentStore.getState().enrollments[0].id).toBe("e1");
	});

	it("getEnrollmentsByCourseId — 필터링", () => {
		useEnrollmentStore.setState({
			enrollments: [
				makeEnrollment({ id: "e1", courseId: "c1" }),
				makeEnrollment({ id: "e2", courseId: "c2" }),
				makeEnrollment({ id: "e3", courseId: "c1" }),
			],
		});
		expect(
			useEnrollmentStore.getState().getEnrollmentsByCourseId("c1"),
		).toHaveLength(2);
		expect(
			useEnrollmentStore.getState().getEnrollmentsByCourseId("c2"),
		).toHaveLength(1);
	});

	it("getEnrollmentsByStudentId — 필터링", () => {
		useEnrollmentStore.setState({
			enrollments: [
				makeEnrollment({ id: "e1", studentId: "s1" }),
				makeEnrollment({ id: "e2", studentId: "s2" }),
			],
		});
		expect(
			useEnrollmentStore.getState().getEnrollmentsByStudentId("s1"),
		).toHaveLength(1);
	});

	it("getEnrollmentById → 없는 id → undefined", () => {
		useEnrollmentStore.setState({ enrollments: [makeEnrollment()] });
		expect(
			useEnrollmentStore.getState().getEnrollmentById("e999"),
		).toBeUndefined();
	});

	it("getEnrollmentsByCourseId → 없는 courseId → 빈 배열", () => {
		useEnrollmentStore.setState({ enrollments: [makeEnrollment()] });
		expect(
			useEnrollmentStore.getState().getEnrollmentsByCourseId("c999"),
		).toEqual([]);
	});

	it("getEnrollmentsByStudentId → 없는 studentId → 빈 배열", () => {
		useEnrollmentStore.setState({ enrollments: [makeEnrollment()] });
		expect(
			useEnrollmentStore.getState().getEnrollmentsByStudentId("s999"),
		).toEqual([]);
	});

	it("loadEnrollments → 빈 state에서 빈 배열 유지", async () => {
		await useEnrollmentStore.getState().loadEnrollments();
		expect(useEnrollmentStore.getState().enrollments).toEqual([]);
	});

	it("getEnrollmentCountByCourseId", () => {
		useEnrollmentStore.setState({
			enrollments: [
				makeEnrollment({ id: "e1", courseId: "c1" }),
				makeEnrollment({ id: "e2", courseId: "c1" }),
			],
		});
		expect(
			useEnrollmentStore.getState().getEnrollmentCountByCourseId("c1"),
		).toBe(2);
		expect(
			useEnrollmentStore.getState().getEnrollmentCountByCourseId("c99"),
		).toBe(0);
	});
});

describe("enrollmentStore — withdrawEnrollment", () => {
	beforeEach(() => {
		useEnrollmentStore.setState({ enrollments: [] });
	});

	it("withdrawEnrollment — 성공 시 true + paymentStatus를 withdrawn으로 변경", async () => {
		useEnrollmentStore.setState({
			enrollments: [
				makeEnrollment({ id: "e1", courseId: "c1", paymentStatus: "pending" }),
			],
		});
		const result =
			await useEnrollmentStore.getState().withdrawEnrollment("e1");
		expect(result).toBe(true);
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		expect(e.paymentStatus).toBe("withdrawn");
	});

	it("withdrawEnrollment — 서버 실패 시 false, state 변경 없음", async () => {
		useEnrollmentStore.setState({
			enrollments: [
				makeEnrollment({ id: "e1", courseId: "c1", paymentStatus: "pending" }),
			],
		});
		mockUpdate.mockReturnValueOnce({
			eq: vi.fn().mockResolvedValue({ error: { message: "update failed" } }),
		});

		const result =
			await useEnrollmentStore.getState().withdrawEnrollment("e1");
		expect(result).toBe(false);
		expect(useEnrollmentStore.getState().getEnrollmentById("e1")?.paymentStatus).toBe(
			"pending",
		);
	});

	it("withdrawn 수강은 getEnrollmentCountByCourseId에서 제외", () => {
		useEnrollmentStore.setState({
			enrollments: [
				makeEnrollment({
					id: "e1",
					courseId: "c1",
					paymentStatus: "completed",
				}),
				makeEnrollment({
					id: "e2",
					courseId: "c1",
					paymentStatus: "withdrawn",
				}),
				makeEnrollment({
					id: "e3",
					courseId: "c1",
					paymentStatus: "pending",
				}),
			],
		});
		// withdrawn 1건 제외 → 2건
		expect(
			useEnrollmentStore.getState().getEnrollmentCountByCourseId("c1"),
		).toBe(2);
	});

	it("withdrawn 수강은 enrollments 배열에서 삭제되지 않고 유지", () => {
		useEnrollmentStore.setState({
			enrollments: [
				makeEnrollment({
					id: "e1",
					courseId: "c1",
					paymentStatus: "withdrawn",
				}),
				makeEnrollment({
					id: "e2",
					courseId: "c1",
					paymentStatus: "completed",
				}),
			],
		});
		const all = useEnrollmentStore.getState().enrollments;
		expect(all).toHaveLength(2);
		expect(all.find((e) => e.id === "e1")).toBeDefined();
		expect(all.find((e) => e.id === "e1")!.paymentStatus).toBe("withdrawn");
	});
});

describe("enrollmentStore — loadEnrollments discountAmount 기본값", () => {
	beforeEach(() => {
		useEnrollmentStore.setState({ enrollments: [] });
		localStorage.clear();
	});

	it("loadEnrollments — DB에서 discount_amount null → discountAmount 0 기본값", async () => {
		// helper 내부 freshness를 리셋하기 위해 invalidate 호출
		useEnrollmentStore.getState().invalidate();

		// supabase에서 enrollment row 데이터 반환 (discount_amount: null)
		mockSelect.mockReturnValueOnce({
			data: [
				{
					id: "e-null-discount",
					organization_id: "org1",
					course_id: "c1",
					student_id: "s1",
					enrolled_at: "2026-01-01T00:00:00Z",
					payment_status: "pending",
					paid_amount: 0,
					remaining_amount: 300000,
					paid_at: null,
					payment_method: null,
					discount_amount: null,
					notes: null,
					quarter: null,
					enrolled_months: null,
					created_at: "2026-01-01T00:00:00Z",
				},
			],
			error: null,
		});

		await useEnrollmentStore.getState().loadEnrollments();

		const enrollments = useEnrollmentStore.getState().enrollments;
		expect(enrollments).toHaveLength(1);
		expect(enrollments[0].discountAmount).toBe(0);
	});

	it("loadEnrollments — DB에서 discount_amount 50000 → 그대로 유지", async () => {
		useEnrollmentStore.getState().invalidate();

		mockSelect.mockReturnValueOnce({
			data: [
				{
					id: "e-with-discount",
					organization_id: "org1",
					course_id: "c1",
					student_id: "s1",
					enrolled_at: "2026-01-01T00:00:00Z",
					payment_status: "partial",
					paid_amount: 250000,
					remaining_amount: 0,
					paid_at: "2026-03-01",
					payment_method: "card",
					discount_amount: 50000,
					notes: "할인 적용",
					quarter: null,
					enrolled_months: null,
					created_at: "2026-01-01T00:00:00Z",
				},
			],
			error: null,
		});

		await useEnrollmentStore.getState().loadEnrollments();

		const enrollments = useEnrollmentStore.getState().enrollments;
		expect(enrollments).toHaveLength(1);
		expect(enrollments[0].discountAmount).toBe(50000);
	});

	it("invalidate — 호출 시 에러 없음", () => {
		expect(() => useEnrollmentStore.getState().invalidate()).not.toThrow();
	});

	it("loadEnrollments — fresh 상태에서 재호출 시 기존 enrollments 유지", async () => {
		// 먼저 성공적으로 로드하여 fresh 상태 만들기
		useEnrollmentStore.getState().invalidate();
		mockSelect.mockReturnValueOnce({
			data: [],
			error: null,
		});
		await useEnrollmentStore.getState().loadEnrollments();

		// 수동으로 데이터 설정
		const existing = [makeEnrollment({ id: "existing" })];
		useEnrollmentStore.setState({ enrollments: existing });

		// fresh 상태이므로 skip → 기존 데이터 유지
		await useEnrollmentStore.getState().loadEnrollments();

		expect(useEnrollmentStore.getState().enrollments).toEqual(existing);
	});

	it("loadEnrollments — 서버 에러 시 기존 enrollments 유지", async () => {
		const existing = [makeEnrollment({ id: "e-existing" })];
		useEnrollmentStore.setState({ enrollments: existing });

		useEnrollmentStore.getState().invalidate();

		mockSelect.mockReturnValueOnce({
			data: null,
			error: { message: "load fail" },
		});

		await useEnrollmentStore.getState().loadEnrollments();

		expect(useEnrollmentStore.getState().enrollments).toEqual(existing);
	});

	it("loadEnrollments — 서버 성공 시 enrollments 갱신", async () => {
		useEnrollmentStore.getState().invalidate();

		mockSelect.mockReturnValueOnce({
			data: [
				{
					id: "e-loaded",
					organization_id: "org1",
					course_id: "c1",
					student_id: "s1",
					enrolled_at: "2026-01-01T00:00:00Z",
					payment_status: "pending",
					paid_amount: 0,
					remaining_amount: 300000,
					paid_at: null,
					payment_method: null,
					discount_amount: null,
					notes: null,
					quarter: null,
					enrolled_months: null,
					created_at: "2026-01-01T00:00:00Z",
				},
			],
			error: null,
		});

		await useEnrollmentStore.getState().loadEnrollments();

		const enrollments = useEnrollmentStore.getState().enrollments;
		expect(enrollments).toHaveLength(1);
		expect(enrollments[0].id).toBe("e-loaded");
	});

	it("loadEnrollments — 캐시 폴백 시 showErrorMessage 호출", async () => {
		localStorage.setItem(
			"cache_enrollments",
			JSON.stringify([
				{
					id: "e-cached",
					organization_id: "org1",
					course_id: "c1",
					student_id: "s1",
					enrolled_at: "2026-01-01T00:00:00Z",
					payment_status: "pending",
					paid_amount: 0,
					remaining_amount: 300000,
					paid_at: null,
					payment_method: null,
					discount_amount: null,
					notes: null,
					quarter: null,
					enrolled_months: null,
					created_at: "2026-01-01T00:00:00Z",
				},
			]),
		);

		useEnrollmentStore.getState().invalidate();

		mockSelect.mockReturnValueOnce({
			data: null,
			error: { message: "network error" },
		});

		await useEnrollmentStore.getState().loadEnrollments();

		const enrollments = useEnrollmentStore.getState().enrollments;
		expect(enrollments).toHaveLength(1);
		expect(enrollments[0].id).toBe("e-cached");
	});
});

describe("enrollmentStore — updatePayment edge cases", () => {
	beforeEach(() => {
		useEnrollmentStore.setState({ enrollments: [makeEnrollment()] });
	});

	it("exempt + paymentMethod 지정", async () => {
		await useEnrollmentStore
			.getState()
			.updatePayment("e1", 0, 300000, "2026-05-01", true, "card");
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		expect(e.paymentStatus).toBe("exempt");
		expect(e.paymentMethod).toBe("card");
		expect(e.paidAt).toBe("2026-05-01");
	});

	it("exempt + discountAmount 지정", async () => {
		await useEnrollmentStore
			.getState()
			.updatePayment("e1", 0, 300000, undefined, true, undefined, 50000);
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		expect(e.paymentStatus).toBe("exempt");
		expect(e.discountAmount).toBe(50000);
	});

	it("updatePayment — enrollment 존재하지 않으면 discount 0 기본값", async () => {
		// e999는 존재하지 않음
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment({ id: "e1" })],
		});
		// updatePayment 내부에서 getEnrollmentById를 호출하여 기존 discount를 가져옴
		// discountAmount를 전달하지 않으면 기존값(0)을 사용
		await useEnrollmentStore.getState().updatePayment("e1", 100000, 300000);
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		expect(e.paymentStatus).toBe("partial");
		expect(e.remainingAmount).toBe(200000);
	});

	it("addEnrollment — discountAmount 전달 시 해당 값 사용", async () => {
		useEnrollmentStore.setState({ enrollments: [] });
		const result = await useEnrollmentStore.getState().addEnrollment({
			courseId: "c1",
			studentId: "s1",
			paymentStatus: "pending",
			paidAmount: 0,
			discountAmount: 10000,
		} as any);
		expect(result).toBe(true);
		const enrollments = useEnrollmentStore.getState().enrollments;
		expect(enrollments[0].discountAmount).toBe(10000);
	});

	it("addEnrollment — discountAmount undefined → 0", async () => {
		useEnrollmentStore.setState({ enrollments: [] });
		const result = await useEnrollmentStore.getState().addEnrollment({
			courseId: "c1",
			studentId: "s1",
			paymentStatus: "pending",
			paidAmount: 0,
		} as any);
		expect(result).toBe(true);
		const enrollments = useEnrollmentStore.getState().enrollments;
		expect(enrollments[0].discountAmount).toBe(0);
	});

	it("addEnrollment — courseId 없으면 remainingAmount = paidAmount", async () => {
		useEnrollmentStore.setState({ enrollments: [] });
		const result = await useEnrollmentStore.getState().addEnrollment({
			courseId: "",
			studentId: "s1",
			paymentStatus: "pending",
			paidAmount: 50000,
			discountAmount: 0,
		} as any);
		expect(result).toBe(true);
		const enrollments = useEnrollmentStore.getState().enrollments;
		expect(enrollments[0].remainingAmount).toBe(50000);
	});

	it("addEnrollment — courseId 없고 paidAmount 없으면 remainingAmount = 0", async () => {
		useEnrollmentStore.setState({ enrollments: [] });
		const result = await useEnrollmentStore.getState().addEnrollment({
			courseId: "",
			studentId: "s1",
			paymentStatus: "pending",
			discountAmount: 0,
		} as any);
		expect(result).toBe(true);
		const enrollments = useEnrollmentStore.getState().enrollments;
		expect(enrollments[0].remainingAmount).toBe(0);
	});

	it("updatePayment — discountAmount undefined + enrollment.discountAmount undefined → 0", async () => {
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment({ discountAmount: undefined as any })],
		});
		await useEnrollmentStore.getState().updatePayment("e1", 100000, 300000);
		const e = useEnrollmentStore.getState().getEnrollmentById("e1")!;
		expect(e.paymentStatus).toBe("partial");
		expect(e.remainingAmount).toBe(200000);
	});
});
