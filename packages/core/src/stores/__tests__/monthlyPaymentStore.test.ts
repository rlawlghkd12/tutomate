import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../authStore", () => ({
	isCloud: () => true,
	getOrgId: () => "test-org-id",
}));

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

vi.mock("../../utils/logger", () => ({
	logError: vi.fn(),
	logWarn: vi.fn(),
	logInfo: vi.fn(),
	logDebug: vi.fn(),
}));

vi.mock("../../utils/errors", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../utils/errors")>();
	return {
		...actual,
		handleError: vi.fn(),
	};
});

import type { MonthlyPayment } from "../../types";
import { useMonthlyPaymentStore } from "../monthlyPaymentStore";
import { handleError } from "../../utils/errors";

function makePayment(overrides: Partial<MonthlyPayment> = {}): MonthlyPayment {
	return {
		id: "p1",
		enrollmentId: "e1",
		month: "2026-03",
		amount: 200000,
		status: "paid",
		paidAt: "2026-03-01",
		createdAt: "2026-03-01T00:00:00Z",
		...overrides,
	};
}

describe("monthlyPaymentStore", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useMonthlyPaymentStore.setState({ payments: [] });
	});

	// ── addPayment ──

	describe("addPayment", () => {
		it("납부 추가 → state에 반영, 생성된 payment 반환", async () => {
			const result = await useMonthlyPaymentStore
				.getState()
				.addPayment("e1", "2026-03", 200000, "card", "2026-03-01");

			expect(result).not.toBeNull();
			expect(result!.enrollmentId).toBe("e1");
			expect(result!.month).toBe("2026-03");
			expect(result!.amount).toBe(200000);
			expect(result!.status).toBe("paid");
			expect(result!.paymentMethod).toBe("card");
			expect(useMonthlyPaymentStore.getState().payments).toHaveLength(1);
		});

		it("금액 0 → status pending, paidAt undefined", async () => {
			const result = await useMonthlyPaymentStore
				.getState()
				.addPayment("e1", "2026-03", 0);

			expect(result).not.toBeNull();
			expect(result!.status).toBe("pending");
			expect(result!.paidAt).toBeUndefined();
		});

		it("금액 > 0이고 paidAt 미전달 → 오늘 날짜 자동 설정", async () => {
			const result = await useMonthlyPaymentStore
				.getState()
				.addPayment("e1", "2026-03", 100000);

			expect(result).not.toBeNull();
			expect(result!.paidAt).toBeTruthy();
			expect(result!.status).toBe("paid");
		});

		it("메모 포함 추가", async () => {
			const result = await useMonthlyPaymentStore
				.getState()
				.addPayment("e1", "2026-03", 200000, undefined, undefined, "현금 수납");

			expect(result).not.toBeNull();
			expect(result!.notes).toBe("현금 수납");
		});

		it("서버 실패 시 null 반환, 로컬 state 변경 없음", async () => {
			mockInsert.mockResolvedValueOnce({ error: { message: "insert failed" } });

			const result = await useMonthlyPaymentStore
				.getState()
				.addPayment("e1", "2026-03", 200000, "card");

			expect(result).toBeNull();
			expect(useMonthlyPaymentStore.getState().payments).toHaveLength(0);
			expect(handleError).toHaveBeenCalled();
		});
	});

	// ── updatePayment ──

	describe("updatePayment", () => {
		it("납부 금액 변경 → true 반환", async () => {
			const payment = makePayment();
			useMonthlyPaymentStore.setState({ payments: [payment] });

			const result = await useMonthlyPaymentStore
				.getState()
				.updatePayment("p1", { amount: 150000 });

			expect(result).toBe(true);
			const updated = useMonthlyPaymentStore.getState().payments[0];
			expect(updated.amount).toBe(150000);
			expect(updated.enrollmentId).toBe("e1"); // 다른 필드 유지
		});

		it("서버 실패 시 false 반환, 로컬 state 변경 없음", async () => {
			const payment = makePayment({ id: "p1", amount: 200000 });
			useMonthlyPaymentStore.setState({ payments: [payment] });

			mockUpdate.mockReturnValueOnce({
				eq: vi.fn().mockResolvedValue({ error: { message: "update failed" } }),
			});

			const result = await useMonthlyPaymentStore
				.getState()
				.updatePayment("p1", { amount: 150000 });

			expect(result).toBe(false);
			expect(useMonthlyPaymentStore.getState().payments[0].amount).toBe(200000);
			expect(handleError).toHaveBeenCalled();
		});
	});

	// ── deletePayment ──

	describe("deletePayment", () => {
		it("납부 삭제 → state에서 제거, true 반환", async () => {
			const p1 = makePayment({ id: "p1" });
			const p2 = makePayment({ id: "p2", month: "2026-04" });
			useMonthlyPaymentStore.setState({ payments: [p1, p2] });

			const result = await useMonthlyPaymentStore.getState().deletePayment("p1");

			expect(result).toBe(true);
			const payments = useMonthlyPaymentStore.getState().payments;
			expect(payments).toHaveLength(1);
			expect(payments[0].id).toBe("p2");
		});

		it("서버 삭제 실패 시 false 반환, 로컬 state 변경 없음", async () => {
			const p1 = makePayment({ id: "p-fail" });
			useMonthlyPaymentStore.setState({ payments: [p1] });

			mockDelete.mockReturnValueOnce({
				eq: vi.fn().mockResolvedValue({ error: { message: "delete failed" } }),
			});

			const result = await useMonthlyPaymentStore
				.getState()
				.deletePayment("p-fail");

			expect(result).toBe(false);
			expect(useMonthlyPaymentStore.getState().payments).toHaveLength(1);
			expect(handleError).toHaveBeenCalled();
		});
	});

	// ── deletePaymentsByEnrollmentId ──

	describe("deletePaymentsByEnrollmentId", () => {
		it("해당 enrollment의 모든 납부 삭제", async () => {
			const payments = [
				makePayment({ id: "p1", enrollmentId: "e1", month: "2026-01" }),
				makePayment({ id: "p2", enrollmentId: "e1", month: "2026-02" }),
				makePayment({ id: "p3", enrollmentId: "e2", month: "2026-01" }),
			];
			useMonthlyPaymentStore.setState({ payments });

			await useMonthlyPaymentStore
				.getState()
				.deletePaymentsByEnrollmentId("e1");

			const remaining = useMonthlyPaymentStore.getState().payments;
			expect(remaining).toHaveLength(1);
			expect(remaining[0].id).toBe("p3");
		});

		it("해당 enrollment 없으면 변경 없음", async () => {
			const payments = [makePayment({ id: "p1", enrollmentId: "e1" })];
			useMonthlyPaymentStore.setState({ payments });

			await useMonthlyPaymentStore
				.getState()
				.deletePaymentsByEnrollmentId("e999");

			expect(useMonthlyPaymentStore.getState().payments).toHaveLength(1);
		});
	});

	// ── 쿼리 메서드 ──

	describe("getPaymentsByEnrollmentId", () => {
		it("enrollmentId로 필터 + month 정렬", () => {
			const payments = [
				makePayment({ id: "p1", enrollmentId: "e1", month: "2026-03" }),
				makePayment({ id: "p2", enrollmentId: "e1", month: "2026-01" }),
				makePayment({ id: "p3", enrollmentId: "e2", month: "2026-02" }),
			];
			useMonthlyPaymentStore.setState({ payments });

			const result = useMonthlyPaymentStore
				.getState()
				.getPaymentsByEnrollmentId("e1");
			expect(result).toHaveLength(2);
			expect(result[0].month).toBe("2026-01");
			expect(result[1].month).toBe("2026-03");
		});
	});

	describe("getPaymentsByEnrollmentId — 빈 결과", () => {
		it("없는 enrollmentId → 빈 배열", () => {
			useMonthlyPaymentStore.setState({
				payments: [makePayment({ id: "p1", enrollmentId: "e1" })],
			});
			expect(
				useMonthlyPaymentStore.getState().getPaymentsByEnrollmentId("e999"),
			).toEqual([]);
		});
	});

	describe("addPayment 중복 방지 확인", () => {
		it("같은 month, enrollmentId로 두 번 추가 가능 (중복 방지 없음)", async () => {
			await useMonthlyPaymentStore
				.getState()
				.addPayment("e1", "2026-03", 200000);
			await useMonthlyPaymentStore
				.getState()
				.addPayment("e1", "2026-03", 150000);

			const payments = useMonthlyPaymentStore.getState().payments;
			expect(payments).toHaveLength(2);
		});
	});

	describe("updatePayment — 존재하지 않는 id", () => {
		it("없는 id 업데이트 → 기존 데이터 유지", async () => {
			useMonthlyPaymentStore.setState({
				payments: [makePayment()],
			});

			const result = await useMonthlyPaymentStore
				.getState()
				.updatePayment("p999", { amount: 100000 });

			expect(result).toBe(true);
			expect(useMonthlyPaymentStore.getState().payments).toHaveLength(1);
			expect(useMonthlyPaymentStore.getState().payments[0].amount).toBe(200000);
		});
	});

	describe("getPaymentsByMonth", () => {
		it("월별 필터", () => {
			const payments = [
				makePayment({ id: "p1", month: "2026-03" }),
				makePayment({ id: "p2", month: "2026-04" }),
				makePayment({ id: "p3", month: "2026-03" }),
			];
			useMonthlyPaymentStore.setState({ payments });

			const result = useMonthlyPaymentStore
				.getState()
				.getPaymentsByMonth("2026-03");
			expect(result).toHaveLength(2);
		});
	});

	// ── loadPayments ──

	describe("loadPayments", () => {
		it("빈 state에서 빈 배열 유지", async () => {
			await useMonthlyPaymentStore.getState().loadPayments();
			expect(useMonthlyPaymentStore.getState().payments).toEqual([]);
		});

		it("서버 에러 시 기존 payments 유지, handleError 호출", async () => {
			const existing = [makePayment({ id: "existing" })];
			useMonthlyPaymentStore.setState({ payments: existing });

			useMonthlyPaymentStore.getState().invalidate();

			mockSelect.mockReturnValueOnce({
				data: null,
				error: { message: "fail" },
			});

			await useMonthlyPaymentStore.getState().loadPayments();

			expect(useMonthlyPaymentStore.getState().payments).toEqual(existing);
			expect(handleError).toHaveBeenCalled();
		});

		it("서버 성공 시 payments 갱신", async () => {
			useMonthlyPaymentStore.getState().invalidate();

			mockSelect.mockReturnValueOnce({
				data: [
					{
						id: "p-loaded",
						organization_id: "org1",
						enrollment_id: "e1",
						month: "2026-03",
						amount: 200000,
						status: "paid",
						paid_at: "2026-03-01",
						payment_method: "card",
						notes: null,
						created_at: "2026-03-01T00:00:00Z",
					},
				],
				error: null,
			});

			await useMonthlyPaymentStore.getState().loadPayments();

			const payments = useMonthlyPaymentStore.getState().payments;
			expect(payments).toHaveLength(1);
			expect(payments[0].id).toBe("p-loaded");
		});
	});

	// ── invalidate ──

	it("invalidate — 호출 시 에러 없음", () => {
		expect(
			() => useMonthlyPaymentStore.getState().invalidate(),
		).not.toThrow();
	});

	// ── loadPayments — cached branch ──

	it("loadPayments — 캐시 폴백 시 showErrorMessage 호출", async () => {
		localStorage.setItem(
			"cache_monthly_payments",
			JSON.stringify([
				{
					id: "p-cached",
					organization_id: "org1",
					enrollment_id: "e1",
					month: "2026-03",
					amount: 100000,
					status: "paid",
					paid_at: "2026-03-01",
					payment_method: "card",
					notes: null,
					created_at: "2026-03-01T00:00:00Z",
				},
			]),
		);

		useMonthlyPaymentStore.getState().invalidate();

		mockSelect.mockReturnValueOnce({
			data: null,
			error: { message: "network error" },
		});

		await useMonthlyPaymentStore.getState().loadPayments();

		const payments = useMonthlyPaymentStore.getState().payments;
		expect(payments).toHaveLength(1);
		expect(payments[0].id).toBe("p-cached");
	});

	// ── deletePaymentsByEnrollmentId — 부분 실패 ──

	it("deletePaymentsByEnrollmentId — 일부 삭제 실패 시 성공한 것만 state에서 제거", async () => {
		const p1 = makePayment({ id: "p1", enrollmentId: "e1", month: "2026-01" });
		const p2 = makePayment({ id: "p2", enrollmentId: "e1", month: "2026-02" });
		useMonthlyPaymentStore.setState({ payments: [p1, p2] });

		// 첫 번째 삭제 성공, 두 번째 삭제 실패
		mockDelete
			.mockReturnValueOnce({
				eq: vi.fn().mockResolvedValue({ error: null }),
			})
			.mockReturnValueOnce({
				eq: vi.fn().mockResolvedValue({ error: { message: "delete failed" } }),
			});

		await useMonthlyPaymentStore
			.getState()
			.deletePaymentsByEnrollmentId("e1");

		const remaining = useMonthlyPaymentStore.getState().payments;
		// p1은 삭제 성공, p2는 실패하여 남음
		expect(remaining).toHaveLength(1);
		expect(remaining[0].id).toBe("p2");
	});
});
