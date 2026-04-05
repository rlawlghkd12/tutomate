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

import type { Enrollment, PaymentRecord } from "../../types";
import { useEnrollmentStore } from "../enrollmentStore";
import { usePaymentRecordStore } from "../paymentRecordStore";

function makeRecord(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
	return {
		id: "pr1",
		enrollmentId: "e1",
		amount: 100000,
		paidAt: "2026-03-01",
		paymentMethod: "card",
		notes: undefined,
		createdAt: "2026-03-01T00:00:00Z",
		...overrides,
	};
}

function makeEnrollment(overrides: Partial<Enrollment> = {}): Enrollment {
	return {
		id: "e1",
		courseId: "c1",
		studentId: "s1",
		enrolledAt: "2026-01-01T00:00:00Z",
		paymentStatus: "pending",
		paidAmount: 0,
		remainingAmount: 300000,
		discountAmount: 0,
		...overrides,
	};
}

describe("paymentRecordStore", () => {
	beforeEach(() => {
		usePaymentRecordStore.setState({ records: [] });
		useEnrollmentStore.setState({ enrollments: [] });
	});

	// ── loadRecords ──

	it("loadRecords — 빈 state에서 빈 배열 유지", async () => {
		await usePaymentRecordStore.getState().loadRecords();
		expect(usePaymentRecordStore.getState().records).toEqual([]);
	});

	// ── addPayment ──

	it("addPayment — 올바른 필드로 납부 기록 생성", async () => {
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment()],
		});

		const result = await usePaymentRecordStore
			.getState()
			.addPayment("e1", 100000, 300000, "card", "2026-03-15", "테스트 메모");

		expect(result.enrollmentId).toBe("e1");
		expect(result.amount).toBe(100000);
		expect(result.paymentMethod).toBe("card");
		expect(result.paidAt).toBe("2026-03-15");
		expect(result.notes).toBe("테스트 메모");
		expect(result.id).toBeTruthy();
		expect(result.createdAt).toBeTruthy();

		const records = usePaymentRecordStore.getState().records;
		expect(records).toHaveLength(1);
		expect(records[0].enrollmentId).toBe("e1");
	});

	it("addPayment — paidAt 미지정 시 오늘 날짜 사용", async () => {
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment()],
		});

		const result = await usePaymentRecordStore
			.getState()
			.addPayment("e1", 100000, 300000);

		// paidAt이 YYYY-MM-DD 형식으로 설정됨
		expect(result.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("addPayment — enrollment paidAmount/paymentStatus 갱신", async () => {
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment()],
		});

		await usePaymentRecordStore
			.getState()
			.addPayment("e1", 100000, 300000, "card");

		const enrollment = useEnrollmentStore.getState().getEnrollmentById("e1");
		expect(enrollment?.paidAmount).toBe(100000);
		expect(enrollment?.paymentStatus).toBe("partial");
	});

	it("addPayment — 부분 납부 시 status 'partial'", async () => {
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment()],
		});

		await usePaymentRecordStore
			.getState()
			.addPayment("e1", 150000, 300000, "transfer");

		const enrollment = useEnrollmentStore.getState().getEnrollmentById("e1");
		expect(enrollment?.paymentStatus).toBe("partial");
		expect(enrollment?.paidAmount).toBe(150000);
		expect(enrollment?.remainingAmount).toBe(150000);
	});

	it("addPayment — 완납 시 status 'completed'", async () => {
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment()],
		});

		await usePaymentRecordStore
			.getState()
			.addPayment("e1", 300000, 300000, "card");

		const enrollment = useEnrollmentStore.getState().getEnrollmentById("e1");
		expect(enrollment?.paymentStatus).toBe("completed");
		expect(enrollment?.paidAmount).toBe(300000);
		expect(enrollment?.remainingAmount).toBe(0);
	});

	it("addPayment — 여러 번 납부 시 합산으로 enrollment 갱신", async () => {
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment()],
		});

		await usePaymentRecordStore
			.getState()
			.addPayment("e1", 100000, 300000, "card");
		await usePaymentRecordStore
			.getState()
			.addPayment("e1", 200000, 300000, "cash");

		const records = usePaymentRecordStore.getState().records;
		expect(records).toHaveLength(2);

		const enrollment = useEnrollmentStore.getState().getEnrollmentById("e1");
		expect(enrollment?.paidAmount).toBe(300000);
		expect(enrollment?.paymentStatus).toBe("completed");
	});

	// ── deletePayment ──

	it("deletePayment — 납부 기록 제거", async () => {
		const record = makeRecord({ id: "pr1" });
		usePaymentRecordStore.setState({ records: [record] });
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment({ paidAmount: 100000, paymentStatus: "partial" })],
		});

		await usePaymentRecordStore.getState().deletePayment("pr1", 300000);

		const records = usePaymentRecordStore.getState().records;
		expect(records).toHaveLength(0);
	});

	it("deletePayment — 삭제 후 enrollment paidAmount/status 재계산", async () => {
		const r1 = makeRecord({ id: "pr1", amount: 100000 });
		const r2 = makeRecord({ id: "pr2", amount: 150000, paidAt: "2026-03-10" });
		usePaymentRecordStore.setState({ records: [r1, r2] });
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment({ paidAmount: 250000, paymentStatus: "partial" })],
		});

		// pr1 삭제 → r2만 남음 → 합산 150000
		await usePaymentRecordStore.getState().deletePayment("pr1", 300000);

		const records = usePaymentRecordStore.getState().records;
		expect(records).toHaveLength(1);
		expect(records[0].id).toBe("pr2");

		const enrollment = useEnrollmentStore.getState().getEnrollmentById("e1");
		expect(enrollment?.paidAmount).toBe(150000);
		expect(enrollment?.paymentStatus).toBe("partial");
	});

	it("deletePayment — 모든 기록 삭제 시 enrollment pending 상태", async () => {
		const record = makeRecord({ id: "pr1", amount: 100000 });
		usePaymentRecordStore.setState({ records: [record] });
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment({ paidAmount: 100000, paymentStatus: "partial" })],
		});

		await usePaymentRecordStore.getState().deletePayment("pr1", 300000);

		const enrollment = useEnrollmentStore.getState().getEnrollmentById("e1");
		expect(enrollment?.paidAmount).toBe(0);
		expect(enrollment?.paymentStatus).toBe("pending");
	});

	it("deletePayment — 존재하지 않는 id → 에러 없이 무시", async () => {
		usePaymentRecordStore.setState({ records: [makeRecord()] });

		await usePaymentRecordStore.getState().deletePayment("non-existent", 300000);

		expect(usePaymentRecordStore.getState().records).toHaveLength(1);
	});

	// ── getRecordsByEnrollmentId ──

	it("getRecordsByEnrollmentId — enrollmentId 기준 필터", () => {
		const r1 = makeRecord({ id: "pr1", enrollmentId: "e1", paidAt: "2026-03-01" });
		const r2 = makeRecord({ id: "pr2", enrollmentId: "e2", paidAt: "2026-03-05" });
		const r3 = makeRecord({ id: "pr3", enrollmentId: "e1", paidAt: "2026-03-10" });
		usePaymentRecordStore.setState({ records: [r1, r2, r3] });

		const result = usePaymentRecordStore
			.getState()
			.getRecordsByEnrollmentId("e1");

		expect(result).toHaveLength(2);
		expect(result.every((r) => r.enrollmentId === "e1")).toBe(true);
	});

	it("getRecordsByEnrollmentId — paidAt 내림차순 정렬", () => {
		const r1 = makeRecord({ id: "pr1", enrollmentId: "e1", paidAt: "2026-03-01" });
		const r2 = makeRecord({ id: "pr2", enrollmentId: "e1", paidAt: "2026-03-15" });
		const r3 = makeRecord({ id: "pr3", enrollmentId: "e1", paidAt: "2026-03-10" });
		usePaymentRecordStore.setState({ records: [r1, r2, r3] });

		const result = usePaymentRecordStore
			.getState()
			.getRecordsByEnrollmentId("e1");

		expect(result[0].paidAt).toBe("2026-03-15");
		expect(result[1].paidAt).toBe("2026-03-10");
		expect(result[2].paidAt).toBe("2026-03-01");
	});

	it("getRecordsByEnrollmentId — 없는 enrollmentId → 빈 배열", () => {
		usePaymentRecordStore.setState({ records: [makeRecord()] });

		const result = usePaymentRecordStore
			.getState()
			.getRecordsByEnrollmentId("non-existent");

		expect(result).toEqual([]);
	});

	// ── Edge cases ──

	it("addPayment — 금액 0 → enrollment pending 상태 유지", async () => {
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment()],
		});

		await usePaymentRecordStore
			.getState()
			.addPayment("e1", 0, 300000, "cash");

		const records = usePaymentRecordStore.getState().records;
		expect(records).toHaveLength(1);
		expect(records[0].amount).toBe(0);

		const enrollment = useEnrollmentStore.getState().getEnrollmentById("e1");
		expect(enrollment?.paymentStatus).toBe("pending");
		expect(enrollment?.paidAmount).toBe(0);
	});

	it("addPayment — 서버 실패해도 로컬에 추가 (optimistic)", async () => {
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment()],
		});
		mockInsert.mockResolvedValueOnce({ error: { message: "insert failed" } });

		await usePaymentRecordStore
			.getState()
			.addPayment("e1", 100000, 300000, "card");

		const records = usePaymentRecordStore.getState().records;
		expect(records).toHaveLength(1);
		expect(records[0].amount).toBe(100000);
	});

	it("deletePaymentsByEnrollmentId — enrollmentId 기준 일괄 삭제", async () => {
		const r1 = makeRecord({ id: "pr1", enrollmentId: "e1" });
		const r2 = makeRecord({ id: "pr2", enrollmentId: "e2" });
		const r3 = makeRecord({ id: "pr3", enrollmentId: "e1" });
		usePaymentRecordStore.setState({ records: [r1, r2, r3] });

		await usePaymentRecordStore
			.getState()
			.deletePaymentsByEnrollmentId("e1");

		const records = usePaymentRecordStore.getState().records;
		expect(records).toHaveLength(1);
		expect(records[0].enrollmentId).toBe("e2");
	});

	it("updateRecord — 부분 업데이트, 다른 필드 유지", async () => {
		const record = makeRecord({ id: "pr1", amount: 100000, notes: "원래 메모" });
		usePaymentRecordStore.setState({ records: [record] });

		await usePaymentRecordStore
			.getState()
			.updateRecord("pr1", { notes: "변경된 메모" });

		const updated = usePaymentRecordStore
			.getState()
			.records.find((r) => r.id === "pr1");
		expect(updated?.notes).toBe("변경된 메모");
		expect(updated?.amount).toBe(100000); // 변경 안됨
	});
});
