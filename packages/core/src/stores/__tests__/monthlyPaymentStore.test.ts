import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../authStore", () => ({
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

import type { MonthlyPayment } from "../../types";
import { useMonthlyPaymentStore } from "../monthlyPaymentStore";

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

			expect(result.enrollmentId).toBe("e1");
			expect(result.month).toBe("2026-03");
			expect(result.amount).toBe(200000);
			expect(result.status).toBe("paid");
			expect(result.paymentMethod).toBe("card");
			expect(useMonthlyPaymentStore.getState().payments).toHaveLength(1);
		});

		it("금액 0 → status pending, paidAt undefined", async () => {
			const result = await useMonthlyPaymentStore
				.getState()
				.addPayment("e1", "2026-03", 0);

			expect(result.status).toBe("pending");
			expect(result.paidAt).toBeUndefined();
		});

		it("금액 > 0이고 paidAt 미전달 → 오늘 날짜 자동 설정", async () => {
			const result = await useMonthlyPaymentStore
				.getState()
				.addPayment("e1", "2026-03", 100000);

			expect(result.paidAt).toBeTruthy();
			expect(result.status).toBe("paid");
		});

		it("메모 포함 추가", async () => {
			const result = await useMonthlyPaymentStore
				.getState()
				.addPayment("e1", "2026-03", 200000, undefined, undefined, "현금 수납");

			expect(result.notes).toBe("현금 수납");
		});
	});

	// ── updatePayment ──

	describe("updatePayment", () => {
		it("납부 금액 변경", async () => {
			const payment = makePayment();
			useMonthlyPaymentStore.setState({ payments: [payment] });

			await useMonthlyPaymentStore
				.getState()
				.updatePayment("p1", { amount: 150000 });

			const updated = useMonthlyPaymentStore.getState().payments[0];
			expect(updated.amount).toBe(150000);
			expect(updated.enrollmentId).toBe("e1"); // 다른 필드 유지
		});
	});

	// ── deletePayment ──

	describe("deletePayment", () => {
		it("납부 삭제 → state에서 제거", async () => {
			const p1 = makePayment({ id: "p1" });
			const p2 = makePayment({ id: "p2", month: "2026-04" });
			useMonthlyPaymentStore.setState({ payments: [p1, p2] });

			await useMonthlyPaymentStore.getState().deletePayment("p1");

			const payments = useMonthlyPaymentStore.getState().payments;
			expect(payments).toHaveLength(1);
			expect(payments[0].id).toBe("p2");
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

			await useMonthlyPaymentStore
				.getState()
				.updatePayment("p999", { amount: 100000 });

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
});
