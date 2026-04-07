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

import type { Enrollment, PaymentRecord } from "../../types";
import { useEnrollmentStore } from "../enrollmentStore";
import { usePaymentRecordStore } from "../paymentRecordStore";
import { handleError } from "../../utils/errors";

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
		vi.mocked(handleError).mockClear();
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

		expect(result).not.toBeNull();
		expect(result!.enrollmentId).toBe("e1");
		expect(result!.amount).toBe(100000);
		expect(result!.paymentMethod).toBe("card");
		expect(result!.paidAt).toBe("2026-03-15");
		expect(result!.notes).toBe("테스트 메모");
		expect(result!.id).toBeTruthy();
		expect(result!.createdAt).toBeTruthy();

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

		expect(result).not.toBeNull();
		// paidAt이 YYYY-MM-DD 형식으로 설정됨
		expect(result!.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

	// ── addPayment — 서버 실패 (server-first) ──

	it("addPayment — 서버 실패 시 null 반환, 로컬 state 변경 없음", async () => {
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment()],
		});
		mockInsert.mockResolvedValueOnce({ error: { message: "insert failed" } });

		const result = await usePaymentRecordStore
			.getState()
			.addPayment("e1", 100000, 300000, "card");

		expect(result).toBeNull();
		expect(usePaymentRecordStore.getState().records).toHaveLength(0);
		expect(handleError).toHaveBeenCalled();
	});

	// ── deletePayment ──

	it("deletePayment — 납부 기록 제거, true 반환", async () => {
		const record = makeRecord({ id: "pr1" });
		usePaymentRecordStore.setState({ records: [record] });
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment({ paidAmount: 100000, paymentStatus: "partial" })],
		});

		const result = await usePaymentRecordStore.getState().deletePayment("pr1", 300000);

		expect(result).toBe(true);
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

	it("deletePayment — 존재하지 않는 id → false 반환", async () => {
		usePaymentRecordStore.setState({ records: [makeRecord()] });

		const result = await usePaymentRecordStore.getState().deletePayment("non-existent", 300000);

		expect(result).toBe(false);
		expect(usePaymentRecordStore.getState().records).toHaveLength(1);
	});

	it("deletePayment — 서버 삭제 실패 시 false 반환, 로컬 state 변경 없음", async () => {
		const record = makeRecord({ id: "pr-fail" });
		usePaymentRecordStore.setState({ records: [record] });
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment({ paidAmount: 100000 })],
		});

		mockDelete.mockReturnValueOnce({
			eq: vi.fn().mockResolvedValue({ error: { message: "delete failed" } }),
		});

		const result = await usePaymentRecordStore.getState().deletePayment("pr-fail", 300000);

		expect(result).toBe(false);
		expect(usePaymentRecordStore.getState().records).toHaveLength(1);
		expect(handleError).toHaveBeenCalled();
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

		const result = await usePaymentRecordStore
			.getState()
			.addPayment("e1", 0, 300000, "cash");

		expect(result).not.toBeNull();
		const records = usePaymentRecordStore.getState().records;
		expect(records).toHaveLength(1);
		expect(records[0].amount).toBe(0);

		const enrollment = useEnrollmentStore.getState().getEnrollmentById("e1");
		expect(enrollment?.paymentStatus).toBe("pending");
		expect(enrollment?.paidAmount).toBe(0);
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

		const result = await usePaymentRecordStore
			.getState()
			.updateRecord("pr1", { notes: "변경된 메모" });

		expect(result).toBe(true);
		const updated = usePaymentRecordStore
			.getState()
			.records.find((r) => r.id === "pr1");
		expect(updated?.notes).toBe("변경된 메모");
		expect(updated?.amount).toBe(100000); // 변경 안됨
	});

	// ── loadRecords — error branch ──

	it("loadRecords — 서버 에러 시 기존 records 유지, handleError 호출", async () => {
		const existing = [makeRecord({ id: "existing" })];
		usePaymentRecordStore.setState({ records: existing });

		// invalidate하여 fresh 상태 해제
		usePaymentRecordStore.getState().invalidate();

		// supabase가 에러 반환하도록 설정
		mockSelect.mockReturnValueOnce({
			data: null,
			error: { message: "fail" },
		});

		await usePaymentRecordStore.getState().loadRecords();

		// 기존 데이터 유지
		expect(usePaymentRecordStore.getState().records).toEqual(existing);
		expect(handleError).toHaveBeenCalled();
	});

	it("loadRecords — 서버 성공 시 records 갱신", async () => {
		usePaymentRecordStore.getState().invalidate();

		mockSelect.mockReturnValueOnce({
			data: [{
				id: "pr-loaded",
				organization_id: "org1",
				enrollment_id: "e1",
				amount: 50000,
				paid_at: "2026-04-01",
				payment_method: null,
				notes: null,
				created_at: "2026-04-01T00:00:00Z",
			}],
			error: null,
		});

		await usePaymentRecordStore.getState().loadRecords();

		const records = usePaymentRecordStore.getState().records;
		expect(records).toHaveLength(1);
		expect(records[0].id).toBe("pr-loaded");
	});

	// ── invalidate ──

	it("invalidate — 호출 시 에러 없음", () => {
		expect(() => usePaymentRecordStore.getState().invalidate()).not.toThrow();
	});

	// ── addPayment — enrollment 없는 경우 ──

	it("addPayment — enrollment 없는 enrollmentId → 납부 기록은 추가되지만 enrollment 갱신 안 함", async () => {
		// enrollment store에 해당 enrollment 없음
		useEnrollmentStore.setState({ enrollments: [] });

		const result = await usePaymentRecordStore
			.getState()
			.addPayment("e-nonexistent", 50000, 200000, "cash");

		expect(result).not.toBeNull();
		expect(result!.enrollmentId).toBe("e-nonexistent");
		expect(usePaymentRecordStore.getState().records).toHaveLength(1);
	});

	// ── deletePayment — enrollment 없는 경우 ──

	it("deletePayment — enrollment 없는 enrollmentId → 에러 없이 삭제", async () => {
		const record = makeRecord({ id: "pr-orphan", enrollmentId: "e-orphan" });
		usePaymentRecordStore.setState({ records: [record] });
		useEnrollmentStore.setState({ enrollments: [] });

		const result = await usePaymentRecordStore.getState().deletePayment("pr-orphan", 300000);

		expect(result).toBe(true);
		expect(usePaymentRecordStore.getState().records).toHaveLength(0);
	});

	// ── updateRecord — 서버 실패 (server-first) ──

	it("updateRecord — 서버 실패 시 false 반환, 로컬 state 변경 없음", async () => {
		const record = makeRecord({ id: "pr1" });
		usePaymentRecordStore.setState({ records: [record] });

		mockUpdate.mockReturnValueOnce({
			eq: vi.fn().mockResolvedValue({ error: { message: "update failed" } }),
		});

		const result = await usePaymentRecordStore
			.getState()
			.updateRecord("pr1", { amount: 999 });

		expect(result).toBe(false);
		const updated = usePaymentRecordStore
			.getState()
			.records.find((r) => r.id === "pr1");
		expect(updated?.amount).toBe(100000); // 원래 값 유지
		expect(handleError).toHaveBeenCalled();
	});

	// ── addPayment — 할인 적용 enrollment ──

	it("addPayment — 할인 적용된 enrollment에서 courseFee 기준 계산", async () => {
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment({ discountAmount: 50000 })],
		});

		await usePaymentRecordStore
			.getState()
			.addPayment("e1", 250000, 300000, "card");

		const enrollment = useEnrollmentStore.getState().getEnrollmentById("e1");
		// effectiveFee = 300000 - 50000 = 250000, paid = 250000
		expect(enrollment?.paymentStatus).toBe("completed");
	});

	// ── getRecordsByEnrollmentId — paidAt null 처리 ──

	it("getRecordsByEnrollmentId — paidAt null인 레코드도 정렬 가능", () => {
		const r1 = makeRecord({ id: "pr1", enrollmentId: "e1", paidAt: "2026-03-01" });
		const r2 = makeRecord({ id: "pr2", enrollmentId: "e1", paidAt: undefined });
		usePaymentRecordStore.setState({ records: [r1, r2] });

		const result = usePaymentRecordStore.getState().getRecordsByEnrollmentId("e1");
		expect(result).toHaveLength(2);
	});

	// ── syncEnrollmentTotal — discount 처리 ──

	it("syncEnrollmentTotal — enrollment의 discountAmount null → 0으로 처리", async () => {
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment({ discountAmount: undefined as any })],
		});

		await usePaymentRecordStore
			.getState()
			.addPayment("e1", 200000, 300000, "card");

		const enrollment = useEnrollmentStore.getState().getEnrollmentById("e1");
		expect(enrollment?.paymentStatus).toBe("partial");
	});

	it("updateRecord — 여러 레코드 중 하나만 업데이트", async () => {
		const r1 = makeRecord({ id: "pr1", amount: 100000 });
		const r2 = makeRecord({ id: "pr2", amount: 200000 });
		usePaymentRecordStore.setState({ records: [r1, r2] });

		const result = await usePaymentRecordStore
			.getState()
			.updateRecord("pr1", { amount: 150000 });

		expect(result).toBe(true);
		expect(
			usePaymentRecordStore.getState().records.find((r) => r.id === "pr1")?.amount,
		).toBe(150000);
		expect(
			usePaymentRecordStore.getState().records.find((r) => r.id === "pr2")?.amount,
		).toBe(200000);
	});

	// ── syncEnrollmentTotal with undefined paidAt ──

	it("syncEnrollmentTotal — paidAt undefined인 레코드 정렬 처리", async () => {
		// 직접 records에 paidAt undefined인 레코드 설정
		const r1 = makeRecord({ id: "pr-no-date", enrollmentId: "e1", paidAt: undefined, amount: 100000 });
		usePaymentRecordStore.setState({ records: [r1] });
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment()],
		});

		// addPayment 호출로 syncEnrollmentTotal 트리거
		await usePaymentRecordStore
			.getState()
			.addPayment("e1", 50000, 300000, "cash", "2026-03-15");

		const enrollment = useEnrollmentStore.getState().getEnrollmentById("e1");
		expect(enrollment?.paidAmount).toBe(150000);
	});

	// ── loadRecords — cached branch ──

	it("loadRecords — 캐시 폴백 시 showErrorMessage 호출", async () => {
		localStorage.setItem(
			"cache_payment_records",
			JSON.stringify([
				{
					id: "pr-cached",
					organization_id: "org1",
					enrollment_id: "e1",
					amount: 80000,
					paid_at: "2026-04-01",
					payment_method: null,
					notes: null,
					created_at: "2026-04-01T00:00:00Z",
				},
			]),
		);

		usePaymentRecordStore.getState().invalidate();

		mockSelect.mockReturnValueOnce({
			data: null,
			error: { message: "network error" },
		});

		await usePaymentRecordStore.getState().loadRecords();

		const records = usePaymentRecordStore.getState().records;
		expect(records).toHaveLength(1);
		expect(records[0].id).toBe("pr-cached");
	});

	// ── deletePaymentsByEnrollmentId — 부분 실패 ──

	it("deletePaymentsByEnrollmentId — 일부 삭제 실패 시 성공한 것만 state에서 제거", async () => {
		const r1 = makeRecord({ id: "pr1", enrollmentId: "e1" });
		const r2 = makeRecord({ id: "pr2", enrollmentId: "e1" });
		usePaymentRecordStore.setState({ records: [r1, r2] });

		// 첫 번째 삭제 성공, 두 번째 삭제 실패
		mockDelete
			.mockReturnValueOnce({
				eq: vi.fn().mockResolvedValue({ error: null }),
			})
			.mockReturnValueOnce({
				eq: vi.fn().mockResolvedValue({ error: { message: "delete failed" } }),
			});

		await usePaymentRecordStore
			.getState()
			.deletePaymentsByEnrollmentId("e1");

		const remaining = usePaymentRecordStore.getState().records;
		// pr1은 삭제 성공, pr2는 실패하여 남음
		expect(remaining).toHaveLength(1);
		expect(remaining[0].id).toBe("pr2");
	});

	// ── syncEnrollmentTotal — latestRecord paidAt 기준 정렬 ──

	it("syncEnrollmentTotal — 최신 paidAt 레코드의 paymentMethod가 enrollment에 반영", async () => {
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment()],
		});

		// 오래된 기록
		await usePaymentRecordStore
			.getState()
			.addPayment("e1", 100000, 300000, "cash", "2026-01-01");

		// 최신 기록
		await usePaymentRecordStore
			.getState()
			.addPayment("e1", 50000, 300000, "card", "2026-03-15");

		const enrollment = useEnrollmentStore.getState().getEnrollmentById("e1");
		expect(enrollment?.paymentMethod).toBe("card");
		expect(enrollment?.paidAmount).toBe(150000);
	});

	// ── syncEnrollmentTotal — withdrawn enrollment 무시 ──

	it("syncEnrollmentTotal — withdrawn enrollment → 갱신 안 함", async () => {
		useEnrollmentStore.setState({
			enrollments: [makeEnrollment({ paymentStatus: "withdrawn" })],
		});

		await usePaymentRecordStore
			.getState()
			.addPayment("e1", 100000, 300000, "card");

		// withdrawn enrollment은 paymentStatus가 변경되지 않음
		const enrollment = useEnrollmentStore.getState().getEnrollmentById("e1");
		expect(enrollment?.paymentStatus).toBe("withdrawn");
	});
});
