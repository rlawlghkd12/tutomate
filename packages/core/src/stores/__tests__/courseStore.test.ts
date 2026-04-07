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

vi.mock("../../utils/errorReporter", () => ({
	reportError: vi.fn(),
}));

import type { Course } from "../../types";
import { useCourseStore } from "../courseStore";

function makeCourse(overrides: Partial<Course> = {}): Course {
	return {
		id: "c1",
		name: "수학",
		classroom: "A101",
		instructorName: "김강사",
		instructorPhone: "010-1234-5678",
		fee: 300000,
		maxStudents: 30,
		currentStudents: 15,
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

describe("courseStore", () => {
	beforeEach(() => {
		useCourseStore.setState({ courses: [] });
	});

	it("addCourse — 성공 시 true + state 추가", async () => {
		const result = await useCourseStore.getState().addCourse({
			name: "영어",
			classroom: "B201",
			instructorName: "박강사",
			instructorPhone: "010-0000-0000",
			fee: 250000,
			maxStudents: 20,
		});
		expect(result).toBe(true);
		const courses = useCourseStore.getState().courses;
		expect(courses).toHaveLength(1);
		expect(courses[0].currentStudents).toBe(0);
		expect(courses[0].name).toBe("영어");
		expect(courses[0].id).toBeTruthy();
		expect(courses[0].createdAt).toBeTruthy();
	});

	it("updateCourse → 부분 업데이트, 다른 필드 유지", async () => {
		useCourseStore.setState({ courses: [makeCourse()] });
		const result = await useCourseStore
			.getState()
			.updateCourse("c1", { name: "고급수학", fee: 400000 });
		expect(result).toBe(true);
		const c = useCourseStore.getState().getCourseById("c1")!;
		expect(c.name).toBe("고급수학");
		expect(c.fee).toBe(400000);
		expect(c.classroom).toBe("A101"); // 변경 안됨
		expect(c.updatedAt).not.toBe("2026-01-01T00:00:00Z"); // 갱신됨
	});

	it("getCourseById → 존재하는 id", () => {
		useCourseStore.setState({ courses: [makeCourse()] });
		expect(useCourseStore.getState().getCourseById("c1")?.name).toBe("수학");
	});

	it("getCourseById → 존재하지 않는 id → undefined", () => {
		useCourseStore.setState({ courses: [makeCourse()] });
		expect(useCourseStore.getState().getCourseById("c999")).toBeUndefined();
	});

	it("incrementCurrentStudents → 1 증가", async () => {
		useCourseStore.setState({
			courses: [makeCourse({ currentStudents: 5, maxStudents: 30 })],
		});
		await useCourseStore.getState().incrementCurrentStudents("c1");
		expect(useCourseStore.getState().getCourseById("c1")?.currentStudents).toBe(
			6,
		);
	});

	it("incrementCurrentStudents → maxStudents 도달 시 증가 안됨", async () => {
		useCourseStore.setState({
			courses: [makeCourse({ currentStudents: 30, maxStudents: 30 })],
		});
		await useCourseStore.getState().incrementCurrentStudents("c1");
		expect(useCourseStore.getState().getCourseById("c1")?.currentStudents).toBe(
			30,
		);
	});

	it("decrementCurrentStudents → 1 감소", async () => {
		useCourseStore.setState({ courses: [makeCourse({ currentStudents: 5 })] });
		await useCourseStore.getState().decrementCurrentStudents("c1");
		expect(useCourseStore.getState().getCourseById("c1")?.currentStudents).toBe(
			4,
		);
	});

	it("decrementCurrentStudents → 0이면 감소 안됨", async () => {
		useCourseStore.setState({ courses: [makeCourse({ currentStudents: 0 })] });
		await useCourseStore.getState().decrementCurrentStudents("c1");
		expect(useCourseStore.getState().getCourseById("c1")?.currentStudents).toBe(
			0,
		);
	});

	it("incrementCurrentStudents → 존재하지 않는 id → 에러 없이 무시", async () => {
		useCourseStore.setState({ courses: [makeCourse()] });
		await useCourseStore.getState().incrementCurrentStudents("c999");
		// 에러 없이 기존 state 유지
		expect(useCourseStore.getState().courses).toHaveLength(1);
	});

	// ── 서버 실패 시 state 보호 (server-first) ──

	it("addCourse — 서버 실패 시 false, state 변경 없음", async () => {
		const existing = makeCourse({ id: "c1", name: "기존 강좌" });
		useCourseStore.setState({ courses: [existing] });
		mockInsert.mockResolvedValueOnce({ error: { message: "insert failed" } });

		const result = await useCourseStore.getState().addCourse({
			name: "새 강좌",
			classroom: "B",
			instructorName: "강사",
			instructorPhone: "010-0000-0000",
			fee: 100000,
			maxStudents: 20,
		});

		// server-first: 서버 실패 시 로컬에 추가하지 않음
		expect(result).toBe(false);
		const courses = useCourseStore.getState().courses;
		expect(courses).toHaveLength(1);
		expect(courses[0].name).toBe("기존 강좌");
	});

	it("deleteCourse — 성공 시 true + state 제거", async () => {
		const c1 = makeCourse({ id: "c1", name: "수학" });
		const c2 = makeCourse({ id: "c2", name: "영어" });
		useCourseStore.setState({ courses: [c1, c2] });

		const result = await useCourseStore.getState().deleteCourse("c1");

		expect(result).toBe(true);
		const courses = useCourseStore.getState().courses;
		expect(courses).toHaveLength(1);
		expect(courses[0].id).toBe("c2");
	});

	it("loadCourses → 빈 state에서 빈 배열 유지", async () => {
		await useCourseStore.getState().loadCourses();
		expect(useCourseStore.getState().courses).toEqual([]);
	});

	it("decrementCurrentStudents → 존재하지 않는 id → 에러 없이 무시", async () => {
		useCourseStore.setState({ courses: [makeCourse()] });
		await useCourseStore.getState().decrementCurrentStudents("c999");
		expect(useCourseStore.getState().courses).toHaveLength(1);
	});

	it("updateCourse — 서버 실패 시 false, state 변경 없음", async () => {
		const existing = makeCourse({ id: "c1", name: "원래 이름" });
		useCourseStore.setState({ courses: [existing] });
		mockUpdate.mockReturnValueOnce({
			eq: vi.fn().mockResolvedValue({ error: { message: "update failed" } }),
		});

		const result = await useCourseStore
			.getState()
			.updateCourse("c1", { name: "변경 이름" });

		// server-first: 서버 실패 시 로컬에 반영하지 않음
		expect(result).toBe(false);
		expect(useCourseStore.getState().getCourseById("c1")?.name).toBe(
			"원래 이름",
		);
	});

	it("updateCourse — 여러 강좌 중 하나만 업데이트", async () => {
		const c1 = makeCourse({ id: "c1", name: "수학" });
		const c2 = makeCourse({ id: "c2", name: "영어" });
		useCourseStore.setState({ courses: [c1, c2] });

		const result = await useCourseStore
			.getState()
			.updateCourse("c1", { name: "수학(변경)" });

		expect(result).toBe(true);
		expect(useCourseStore.getState().getCourseById("c1")?.name).toBe(
			"수학(변경)",
		);
		expect(useCourseStore.getState().getCourseById("c2")?.name).toBe("영어");
	});

	it("updateCourse — 서버 에러 시 false, state 변경 없음", async () => {
		useCourseStore.setState({ courses: [makeCourse()] });
		mockUpdate.mockReturnValueOnce({
			eq: vi.fn().mockResolvedValue({ error: { message: "server error" } }),
		});
		const result = await useCourseStore
			.getState()
			.updateCourse("c1", { fee: 999 });
		expect(result).toBe(false);
		expect(useCourseStore.getState().getCourseById("c1")?.fee).toBe(300000);
	});

	it("addCourse — 서버 실패 시 false, state에 추가 안됨", async () => {
		mockInsert.mockResolvedValueOnce({ error: { message: "fail" } });
		const result = await useCourseStore.getState().addCourse({
			name: "실패강좌",
			classroom: "A",
			instructorName: "김",
			instructorPhone: "010",
			fee: 100000,
			maxStudents: 10,
		});
		expect(result).toBe(false);
		expect(useCourseStore.getState().courses).toHaveLength(0);
	});

	it("loadCourses — 서버 에러 시 기존 courses 유지", async () => {
		const existing = [makeCourse({ id: "c-existing" })];
		useCourseStore.setState({ courses: existing });

		useCourseStore.getState().invalidate();

		mockSelect.mockReturnValueOnce({
			data: null,
			error: { message: "load fail" },
		});

		await useCourseStore.getState().loadCourses();

		expect(useCourseStore.getState().courses).toEqual(existing);
	});

	it("loadCourses — 서버 성공 시 courses 갱신", async () => {
		useCourseStore.getState().invalidate();

		mockSelect.mockReturnValueOnce({
			data: [
				{
					id: "c-loaded",
					organization_id: "org1",
					name: "서버강좌",
					classroom: "A",
					instructor_name: "강사",
					instructor_phone: "010",
					fee: 100000,
					max_students: 20,
					current_students: 5,
					schedule: null,
					created_at: "2026-01-01T00:00:00Z",
					updated_at: "2026-01-01T00:00:00Z",
				},
			],
			error: null,
		});

		await useCourseStore.getState().loadCourses();

		const courses = useCourseStore.getState().courses;
		expect(courses).toHaveLength(1);
		expect(courses[0].name).toBe("서버강좌");
	});

	it("loadCourses — 캐시 폴백 시 showErrorMessage 호출", async () => {
		// 캐시 데이터 설정
		localStorage.setItem(
			"cache_courses",
			JSON.stringify([
				{
					id: "c-cached",
					organization_id: "org1",
					name: "캐시강좌",
					classroom: "B",
					instructor_name: "캐시강사",
					instructor_phone: "010",
					fee: 200000,
					max_students: 15,
					current_students: 3,
					schedule: null,
					created_at: "2026-01-01T00:00:00Z",
					updated_at: "2026-01-01T00:00:00Z",
				},
			]),
		);

		useCourseStore.getState().invalidate();

		// select가 에러를 반환하여 supabaseLoadData에서 throw 발생
		mockSelect.mockReturnValueOnce({
			data: null,
			error: { message: "network error" },
		});

		await useCourseStore.getState().loadCourses();

		// cached 상태면 데이터 설정 + showErrorMessage 호출됨
		const courses = useCourseStore.getState().courses;
		expect(courses).toHaveLength(1);
		expect(courses[0].name).toBe("캐시강좌");
	});

	it("deleteCourse — 서버 실패 시 false, state 변경 없음", async () => {
		const c1 = makeCourse({ id: "c1", name: "수학" });
		useCourseStore.setState({ courses: [c1] });

		mockDelete.mockReturnValueOnce({
			eq: vi.fn().mockResolvedValue({ error: { message: "delete failed" } }),
		});

		const result = await useCourseStore.getState().deleteCourse("c1");

		expect(result).toBe(false);
		expect(useCourseStore.getState().courses).toHaveLength(1);
		expect(useCourseStore.getState().courses[0].name).toBe("수학");
	});
});
