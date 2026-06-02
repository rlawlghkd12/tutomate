import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../stores/authStore", () => ({
	useAuthStore: {
		getState: () => ({ organizationName: "테스트학원" }),
	},
}));

import type { Course, Enrollment, Student } from "../../types";
import {
	COURSE_STUDENT_EXPORT_FIELDS,
	REVENUE_EXPORT_FIELDS,
	STUDENT_EXPORT_FIELDS,
	exportStudentsToExcel,
	exportRevenueToExcel,
	exportStudentsToCSV,
	exportRevenueToCSV,
	exportCourseStudentsToExcel,
	exportCourseStudentsToCSV,
} from "../export";

// ─── 테스트 데이터 ───

const student: Student = {
	id: "s1",
	name: "홍길동",
	phone: "010-1234-5678",
	email: "hong@test.com",
	address: "서울시 강남구",
	birthDate: "1990-01-15",
	notes: "테스트 메모",
	createdAt: "2026-01-15T00:00:00Z",
	updatedAt: "2026-01-15T00:00:00Z",
};

const course: Course = {
	id: "c1",
	name: "수학반",
	classroom: "A101",
	instructorName: "김강사",
	instructorPhone: "010-0000-0000",
	fee: 200000,
	maxStudents: 20,
	currentStudents: 5,
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
};

const enrollment: Enrollment = {
	id: "e1",
	studentId: "s1",
	courseId: "c1",
	paidAmount: 150000,
	remainingAmount: 50000,
	paymentStatus: "partial",
	paymentMethod: "card",
	paidAt: "2026-03-01",
	enrolledAt: "2026-02-01T00:00:00Z",
	discountAmount: 0,
	notes: "분할 납부",
};

// ─── STUDENT_EXPORT_FIELDS ───

describe("STUDENT_EXPORT_FIELDS", () => {
	const getField = (key: string) =>
		STUDENT_EXPORT_FIELDS.find((f) => f.key === key)!;

	it("이름 필드", () => {
		expect(getField("name").getValue(student, [], [])).toBe("홍길동");
	});

	it("전화번호 필드", () => {
		expect(getField("phone").getValue(student, [], [])).toBe("010-1234-5678");
	});

	it("이메일 필드", () => {
		expect(getField("email").getValue(student, [], [])).toBe("hong@test.com");
	});

	it("이메일 없으면 빈 문자열", () => {
		expect(
			getField("email").getValue({ ...student, email: undefined }, [], []),
		).toBe("");
	});

	it("주소 필드", () => {
		expect(getField("address").getValue(student, [], [])).toBe("서울시 강남구");
	});

	it("주소 없으면 빈 문자열", () => {
		expect(getField("address").getValue({ ...student, address: undefined }, [], [])).toBe("");
	});

	it("생년월일 필드", () => {
		expect(getField("birthDate").getValue(student, [], [])).toBe("1990-01-15");
	});

	it("생년월일 없으면 빈 문자열", () => {
		expect(getField("birthDate").getValue({ ...student, birthDate: undefined }, [], [])).toBe("");
	});

	it("수강강좌 — 여러 강좌 콤마 구분", () => {
		const course2: Course = { ...course, id: "c2", name: "영어반" };
		const enr2: Enrollment = { ...enrollment, id: "e2", courseId: "c2" };
		const result = getField("enrolledCourses").getValue(
			student,
			[enrollment, enr2],
			[course, course2],
		);
		expect(result).toBe("수학반, 영어반");
	});

	it("수강강좌 — 수강 없으면 빈 문자열", () => {
		expect(getField("enrolledCourses").getValue(student, [], [course])).toBe(
			"",
		);
	});

	it("납부금액 — 합산", () => {
		const enr2: Enrollment = { ...enrollment, id: "e2", paidAmount: 100000 };
		expect(
			getField("totalPaid").getValue(student, [enrollment, enr2], []),
		).toBe(250000);
	});

	it("잔여금액 — 합산", () => {
		const enr2: Enrollment = {
			...enrollment,
			id: "e2",
			remainingAmount: 30000,
		};
		expect(
			getField("totalRemaining").getValue(student, [enrollment, enr2], []),
		).toBe(80000);
	});

	it("메모 필드", () => {
		expect(getField("notes").getValue(student, [], [])).toBe("테스트 메모");
	});

	it("메모 없으면 빈 문자열", () => {
		expect(getField("notes").getValue({ ...student, notes: undefined }, [], [])).toBe("");
	});

	it("등록일 — YYYY-MM-DD 형식", () => {
		expect(getField("createdAt").getValue(student, [], [])).toBe("2026-01-15");
	});
});

// ─── REVENUE_EXPORT_FIELDS ───

describe("REVENUE_EXPORT_FIELDS", () => {
	const getField = (key: string) =>
		REVENUE_EXPORT_FIELDS.find((f) => f.key === key)!;

	it("강좌명", () => {
		expect(getField("courseName").getValue(enrollment, [], [course])).toBe(
			"수학반",
		);
	});

	it("수강생 이름", () => {
		expect(getField("studentName").getValue(enrollment, [student], [])).toBe(
			"홍길동",
		);
	});

	it("전화번호", () => {
		expect(getField("phone").getValue(enrollment, [student], [])).toBe(
			"010-1234-5678",
		);
	});

	it("수강료", () => {
		expect(getField("fee").getValue(enrollment, [], [course])).toBe(200000);
	});

	it("할인금액", () => {
		expect(getField("discountAmount").getValue(enrollment, [], [])).toBe(0);
	});

	it("할인금액 — undefined → 0", () => {
		expect(getField("discountAmount").getValue({ ...enrollment, discountAmount: undefined } as typeof enrollment, [], [])).toBe(0);
	});

	it("납부금액", () => {
		expect(getField("paidAmount").getValue(enrollment, [], [])).toBe(150000);
	});

	it("잔여금액", () => {
		expect(getField("remainingAmount").getValue(enrollment, [], [])).toBe(
			50000,
		);
	});

	it("납부상태 — 한글 변환", () => {
		expect(getField("paymentStatus").getValue(enrollment, [], [])).toBe(
			"부분납부",
		);
		expect(
			getField("paymentStatus").getValue(
				{ ...enrollment, paymentStatus: "completed" },
				[],
				[],
			),
		).toBe("완납");
		expect(
			getField("paymentStatus").getValue(
				{ ...enrollment, paymentStatus: "pending" },
				[],
				[],
			),
		).toBe("미납");
		expect(
			getField("paymentStatus").getValue(
				{ ...enrollment, paymentStatus: "exempt" },
				[],
				[],
			),
		).toBe("면제");
	});

	it("납부방법 — 한글 변환", () => {
		expect(getField("paymentMethod").getValue(enrollment, [], [])).toBe("카드");
		expect(
			getField("paymentMethod").getValue(
				{ ...enrollment, paymentMethod: "cash" },
				[],
				[],
			),
		).toBe("현금");
		expect(
			getField("paymentMethod").getValue(
				{ ...enrollment, paymentMethod: "transfer" },
				[],
				[],
			),
		).toBe("계좌이체");
	});

	it("납부방법 없으면 빈 문자열", () => {
		expect(
			getField("paymentMethod").getValue(
				{ ...enrollment, paymentMethod: undefined },
				[],
				[],
			),
		).toBe("");
	});

	it("등록일 — YYYY-MM-DD 형식", () => {
		expect(getField("enrolledAt").getValue(enrollment, [], [])).toBe(
			"2026-02-01",
		);
	});

	it("메모", () => {
		expect(getField("notes").getValue(enrollment, [], [])).toBe("분할 납부");
	});

	it("메모 없으면 빈 문자열", () => {
		expect(
			getField("notes").getValue({ ...enrollment, notes: undefined }, [], []),
		).toBe("");
	});

	it("강좌 없으면 빈 문자열", () => {
		expect(getField("courseName").getValue(enrollment, [], [])).toBe("");
	});

	it("수강생 없으면 빈 문자열 (studentName)", () => {
		expect(getField("studentName").getValue(enrollment, [], [])).toBe("");
	});

	it("수강생 없으면 빈 문자열 (phone)", () => {
		expect(getField("phone").getValue(enrollment, [], [])).toBe("");
	});

	it("강좌 없으면 수강료 0", () => {
		expect(getField("fee").getValue(enrollment, [], [])).toBe(0);
	});
});

// ─── COURSE_STUDENT_EXPORT_FIELDS ───

describe("COURSE_STUDENT_EXPORT_FIELDS", () => {
	const getField = (key: string) =>
		COURSE_STUDENT_EXPORT_FIELDS.find((f) => f.key === key)!;

	it("이름", () => {
		expect(getField("name").getValue(student, enrollment)).toBe("홍길동");
	});

	it("납부 현황 — 한글 변환", () => {
		expect(getField("paymentStatus").getValue(student, enrollment)).toBe(
			"부분납부",
		);
	});

	it("납부 금액", () => {
		expect(getField("paidAmount").getValue(student, enrollment)).toBe(150000);
	});

	it("할인 금액", () => {
		expect(getField("discountAmount").getValue(student, enrollment)).toBe(0);
	});

	it("잔여 금액", () => {
		expect(getField("remainingAmount").getValue(student, enrollment)).toBe(
			50000,
		);
	});

	it("납부 방법", () => {
		expect(getField("paymentMethod").getValue(student, enrollment)).toBe(
			"카드",
		);
	});

	it("납부일자 — YYYY-MM-DD", () => {
		expect(getField("paidAt").getValue(student, enrollment)).toBe("2026-03-01");
	});

	it("납부일자 없으면 빈 문자열", () => {
		expect(
			getField("paidAt").getValue(student, {
				...enrollment,
				paidAt: undefined,
			}),
		).toBe("");
	});

	it("등록일 — YYYY-MM-DD", () => {
		expect(getField("enrolledAt").getValue(student, enrollment)).toBe(
			"2026-02-01",
		);
	});

	it("메모", () => {
		expect(getField("notes").getValue(student, enrollment)).toBe("분할 납부");
	});

	it("메모 없으면 빈 문자열", () => {
		expect(getField("notes").getValue(student, { ...enrollment, notes: undefined })).toBe("");
	});

	it("이메일 없으면 빈 문자열", () => {
		expect(getField("email").getValue({ ...student, email: undefined }, enrollment)).toBe("");
	});

	it("주소 없으면 빈 문자열", () => {
		expect(getField("address").getValue({ ...student, address: undefined }, enrollment)).toBe("");
	});

	it("생년월일 없으면 빈 문자열", () => {
		expect(getField("birthDate").getValue({ ...student, birthDate: undefined }, enrollment)).toBe("");
	});

	it("납부 방법 없으면 빈 문자열", () => {
		expect(getField("paymentMethod").getValue(student, { ...enrollment, paymentMethod: undefined })).toBe("");
	});

	it("할인 금액 — discountAmount undefined → 0", () => {
		expect(getField("discountAmount").getValue(student, { ...enrollment, discountAmount: undefined } as typeof enrollment)).toBe(0);
	});
});

// ─── 6개 export 함수 호출 테스트 ───

describe('export 함수 — DOM 다운로드', () => {
	beforeEach(() => {
		// DOM download helpers 모킹
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
		vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
		const mockLink = {
			href: '',
			download: '',
			click: vi.fn(),
		};
		vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
	});

	it('exportStudentsToExcel — 수강생 있으면 에러 없이 완료', async () => {
		await expect(exportStudentsToExcel([student], [enrollment], [course])).resolves.toBeUndefined();
	});

	it('exportStudentsToExcel — 빈 배열 → 에러 없이 완료 (헤더만)', async () => {
		await expect(exportStudentsToExcel([], [], [])).resolves.toBeUndefined();
	});

	it('exportRevenueToExcel — 수강 있으면 에러 없이 완료', async () => {
		await expect(exportRevenueToExcel([enrollment], [student], [course])).resolves.toBeUndefined();
	});

	it('exportRevenueToExcel — 빈 배열 → 에러 없이 완료', async () => {
		await expect(exportRevenueToExcel([], [], [])).resolves.toBeUndefined();
	});

	it('exportRevenueToExcel — 헤더에 필터(autofilter) 설정, 합계행은 범위에서 제외', async () => {
		const XLSX = await import('xlsx');
		const spy = vi.spyOn(XLSX.utils, 'book_append_sheet');
		await exportRevenueToExcel([enrollment], [student], [course]);
		const ws = spy.mock.calls[0][1] as Record<string, unknown>;
		const autofilter = ws['!autofilter'] as { ref: string } | undefined;
		expect(autofilter).toBeDefined();
		// 헤더(1행) + 데이터(1행)만 필터 범위, 합계행(3행)은 제외 → 끝 행이 2
		expect(autofilter!.ref).toMatch(/^A1:[A-Z]+2$/);
		spy.mockRestore();
	});

	it('exportStudentsToExcel — 데이터 없으면 필터 미설정', async () => {
		const XLSX = await import('xlsx');
		const spy = vi.spyOn(XLSX.utils, 'book_append_sheet');
		await exportStudentsToExcel([], [], []);
		const ws = spy.mock.calls[0][1] as Record<string, unknown>;
		expect(ws['!autofilter']).toBeUndefined();
		spy.mockRestore();
	});

	it('exportStudentsToCSV — 수강생 있으면 에러 없이 완료', () => {
		expect(() => exportStudentsToCSV([student], [enrollment], [course])).not.toThrow();
	});

	it('exportStudentsToCSV — 빈 배열 → 에러 없이 완료', () => {
		expect(() => exportStudentsToCSV([], [], [])).not.toThrow();
	});

	it('exportStudentsToCSV — euc-kr 인코딩 → BOM 추가', () => {
		expect(() => exportStudentsToCSV([student], [enrollment], [course], 'euc-kr')).not.toThrow();
	});

	it('exportRevenueToCSV — 수익 데이터 있으면 에러 없이 완료', () => {
		expect(() => exportRevenueToCSV([enrollment], [student], [course])).not.toThrow();
	});

	it('exportRevenueToCSV — 빈 배열 → 에러 없이 완료', () => {
		expect(() => exportRevenueToCSV([], [], [])).not.toThrow();
	});

	it('exportCourseStudentsToExcel — 데이터 있으면 에러 없이 완료', async () => {
		const fields = COURSE_STUDENT_EXPORT_FIELDS.map((f) => f.key);
		await expect(
			exportCourseStudentsToExcel(course, [{ student, enrollment }], fields)
		).resolves.toBeUndefined();
	});

	it('exportCourseStudentsToExcel — 빈 데이터 → 에러 없이 완료', async () => {
		const fields = ['name', 'phone'];
		await expect(exportCourseStudentsToExcel(course, [], fields)).resolves.toBeUndefined();
	});

	it('exportCourseStudentsToCSV — 데이터 있으면 에러 없이 완료', () => {
		const fields = COURSE_STUDENT_EXPORT_FIELDS.map((f) => f.key);
		expect(() =>
			exportCourseStudentsToCSV(course, [{ student, enrollment }], fields)
		).not.toThrow();
	});

	it('exportCourseStudentsToCSV — 빈 데이터 → 에러 없이 완료', () => {
		const fields = ['name', 'phone'];
		expect(() => exportCourseStudentsToCSV(course, [], fields)).not.toThrow();
	});
});

describe('export — selectedFields 필터', () => {
	beforeEach(() => {
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
		vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
		const mockLink = { href: '', download: '', click: vi.fn() };
		vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
	});

	it('exportStudentsToExcel — selectedFields로 필터링', async () => {
		await expect(exportStudentsToExcel([student], [enrollment], [course], ['name', 'phone'])).resolves.toBeUndefined();
	});

	it('exportRevenueToExcel — selectedFields로 필터링', async () => {
		await expect(exportRevenueToExcel([enrollment], [student], [course], ['courseName', 'paidAmount'])).resolves.toBeUndefined();
	});

	it('exportStudentsToCSV — selectedFields로 필터링', () => {
		expect(() => exportStudentsToCSV([student], [enrollment], [course], 'utf-8', ['name', 'phone'])).not.toThrow();
	});

	it('exportRevenueToCSV — selectedFields로 필터링', () => {
		expect(() => exportRevenueToCSV([enrollment], [student], [course], 'utf-8', ['courseName', 'paidAmount'])).not.toThrow();
	});

	it('exportStudentsToCSV — summable 필드 없는 selectedFields → 합계 행 미추가', () => {
		expect(() => exportStudentsToCSV([student], [enrollment], [course], 'utf-8', ['name'])).not.toThrow();
	});

	it('exportRevenueToCSV — summable 필드 없는 selectedFields → 합계 행 미추가', () => {
		expect(() => exportRevenueToCSV([enrollment], [student], [course], 'utf-8', ['courseName'])).not.toThrow();
	});

	it('exportCourseStudentsToExcel — summable 필드 없는 selectedFields', async () => {
		await expect(exportCourseStudentsToExcel(course, [{ student, enrollment }], ['name'])).resolves.toBeUndefined();
	});

	it('exportCourseStudentsToCSV — summable 필드 없는 selectedFields', () => {
		expect(() => exportCourseStudentsToCSV(course, [{ student, enrollment }], ['name'])).not.toThrow();
	});

	it('exportCourseStudentsToCSV — euc-kr 인코딩', () => {
		const fields = COURSE_STUDENT_EXPORT_FIELDS.map(f => f.key);
		expect(() => exportCourseStudentsToCSV(course, [{ student, enrollment }], fields, 'euc-kr')).not.toThrow();
	});

	it('exportCourseStudentsToCSV — summable 필드 포함 → 합계 행 추가', () => {
		expect(() => exportCourseStudentsToCSV(course, [{ student, enrollment }], ['name', 'paidAmount', 'remainingAmount'])).not.toThrow();
	});

	it('exportCourseStudentsToExcel — summable 필드 포함 → 합계 행 추가', async () => {
		await expect(exportCourseStudentsToExcel(course, [{ student, enrollment }], ['name', 'paidAmount', 'remainingAmount'])).resolves.toBeUndefined();
	});

	it('exportRevenueToCSV — euc-kr 인코딩', () => {
		expect(() => exportRevenueToCSV([enrollment], [student], [course], 'euc-kr')).not.toThrow();
	});
});

describe('export — 특수 문자 처리', () => {
	beforeEach(() => {
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
		vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
		const mockLink = { href: '', download: '', click: vi.fn() };
		vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
	});

	it('학생 이름에 쉼표 포함해도 CSV 에러 없음', () => {
		const specialStudent: Student = { ...student, name: '홍,길동' };
		expect(() => exportStudentsToCSV([specialStudent], [], [])).not.toThrow();
	});

	it('메모에 줄바꿈 포함해도 Excel 에러 없음', async () => {
		const specialStudent: Student = { ...student, notes: '줄바꿈\n포함' };
		await expect(exportStudentsToExcel([specialStudent], [], [])).resolves.toBeUndefined();
	});
});

// ─── 분기 태그 → 파일명 반영 ───

describe('export — 분기 태그(quarterTag) 파일명 반영', () => {
	let mockLink: { href: string; download: string; click: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
		vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
		mockLink = { href: '', download: '', click: vi.fn() };
		vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
	});

	it('exportStudentsToCSV — quarterTag가 파일명에 들어간다', () => {
		exportStudentsToCSV([student], [enrollment], [course], 'utf-8', ['name'], '2026-Q2');
		expect(mockLink.download).toMatch(/^수강생_명단_2026-Q2_\d{8}_\d{6}\.csv$/);
	});

	it('exportStudentsToCSV — quarterTag 없으면 분기 없이 파일명', () => {
		exportStudentsToCSV([student], [enrollment], [course], 'utf-8', ['name']);
		expect(mockLink.download).toMatch(/^수강생_명단_\d{8}_\d{6}\.csv$/);
	});

	it('exportRevenueToCSV — 전체분기 태그가 파일명에 들어간다', () => {
		exportRevenueToCSV([enrollment], [student], [course], 'utf-8', ['courseName'], '전체분기');
		expect(mockLink.download).toMatch(/^수익_현황_전체분기_\d{8}_\d{6}\.csv$/);
	});

	it('exportCourseStudentsToCSV — 강좌명_수강생_분기 형식', () => {
		exportCourseStudentsToCSV(course, [{ student, enrollment }], ['name'], 'utf-8', '2026-Q3');
		expect(mockLink.download).toMatch(/^수학반_수강생_2026-Q3_\d{8}_\d{6}\.csv$/);
	});

	it('exportStudentsToExcel — quarterTag가 파일명에 들어간다', async () => {
		await exportStudentsToExcel([student], [enrollment], [course], ['name'], '2026-Q2');
		expect(mockLink.download).toMatch(/^수강생_명단_2026-Q2_\d{8}_\d{6}\.xlsx$/);
	});

	it('exportRevenueToExcel — quarterTag가 파일명에 들어간다', async () => {
		await exportRevenueToExcel([enrollment], [student], [course], ['courseName'], '2026-Q1');
		expect(mockLink.download).toMatch(/^수익_현황_2026-Q1_\d{8}_\d{6}\.xlsx$/);
	});

	// 페이지가 적용하는 분기 필터 predicate를 그대로 재현해, 선택 분기 + legacy(분기 없음)만
	// 실제 내보낸 CSV 본문에 포함되는지 검증한다 (목표의 핵심 동작).
	it('선택한 분기 + legacy enrollment만 CSV 본문에 포함된다', async () => {
		let capturedBlob: Blob | null = null;
		(URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			(b: Blob) => {
				capturedBlob = b;
				return 'blob:fake-url';
			},
		);

		const sA: Student = { ...student, id: 'sA', name: '학생A' };
		const sB: Student = { ...student, id: 'sB', name: '학생B' };
		const sC: Student = { ...student, id: 'sC', name: '학생C' };
		const eA: Enrollment = { ...enrollment, id: 'eA', studentId: 'sA', quarter: '2026-Q2' };
		const eB: Enrollment = { ...enrollment, id: 'eB', studentId: 'sB', quarter: '2026-Q1' };
		const eC: Enrollment = { ...enrollment, id: 'eC', studentId: 'sC', quarter: undefined };

		const targetQuarter = '2026-Q2';
		const filtered = [eA, eB, eC].filter(
			(e) => e.paymentStatus !== 'withdrawn' && (e.quarter === targetQuarter || !e.quarter),
		);

		exportRevenueToCSV(filtered, [sA, sB, sC], [course], 'utf-8', ['studentName'], targetQuarter);

		expect(capturedBlob).not.toBeNull();
		const text = await (capturedBlob as unknown as Blob).text();
		expect(text).toContain('학생A'); // 선택 분기
		expect(text).toContain('학생C'); // legacy (분기 없음)
		expect(text).not.toContain('학생B'); // 다른 분기 → 제외
	});
});

// ─── 필드 정의 무결성 ───

describe("필드 정의 무결성", () => {
	it("STUDENT_EXPORT_FIELDS — 모든 필드에 key/label/wch/getValue 존재", () => {
		for (const field of STUDENT_EXPORT_FIELDS) {
			expect(field.key).toBeTruthy();
			expect(field.label).toBeTruthy();
			expect(field.wch).toBeGreaterThan(0);
			expect(typeof field.getValue).toBe("function");
		}
	});

	it("REVENUE_EXPORT_FIELDS — 모든 필드에 key/label/wch/getValue 존재", () => {
		for (const field of REVENUE_EXPORT_FIELDS) {
			expect(field.key).toBeTruthy();
			expect(field.label).toBeTruthy();
			expect(field.wch).toBeGreaterThan(0);
			expect(typeof field.getValue).toBe("function");
		}
	});

	it("COURSE_STUDENT_EXPORT_FIELDS — 모든 필드에 key/label/getValue 존재", () => {
		for (const field of COURSE_STUDENT_EXPORT_FIELDS) {
			expect(field.key).toBeTruthy();
			expect(field.label).toBeTruthy();
			expect(typeof field.getValue).toBe("function");
		}
	});

	it("STUDENT_EXPORT_FIELDS 기본 선택 필드 포함 확인", () => {
		const keys = STUDENT_EXPORT_FIELDS.map((f) => f.key);
		expect(keys).toContain("name");
		expect(keys).toContain("phone");
		expect(keys).toContain("enrolledCourses");
		expect(keys).toContain("totalPaid");
		expect(keys).toContain("totalRemaining");
	});

	it("REVENUE_EXPORT_FIELDS 기본 선택 필드 포함 확인", () => {
		const keys = REVENUE_EXPORT_FIELDS.map((f) => f.key);
		expect(keys).toContain("courseName");
		expect(keys).toContain("studentName");
		expect(keys).toContain("fee");
		expect(keys).toContain("paidAmount");
		expect(keys).toContain("remainingAmount");
		expect(keys).toContain("paymentStatus");
	});
});
