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

	it("addCourse → state에 추가, currentStudents 0 초기화", async () => {
		await useCourseStore.getState().addCourse({
			name: "영어",
			classroom: "B201",
			instructorName: "박강사",
			instructorPhone: "010-0000-0000",
			fee: 250000,
			maxStudents: 20,
		});
		const courses = useCourseStore.getState().courses;
		expect(courses).toHaveLength(1);
		expect(courses[0].currentStudents).toBe(0);
		expect(courses[0].name).toBe("영어");
		expect(courses[0].id).toBeTruthy();
		expect(courses[0].createdAt).toBeTruthy();
	});

	it("updateCourse → 부분 업데이트, 다른 필드 유지", async () => {
		useCourseStore.setState({ courses: [makeCourse()] });
		await useCourseStore
			.getState()
			.updateCourse("c1", { name: "고급수학", fee: 400000 });
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

	// ── 서버 실패 시 state 보호 ──

	it("addCourse — 서버 실패해도 로컬에 추가 (optimistic)", async () => {
		const existing = makeCourse({ id: "c1", name: "기존 강좌" });
		useCourseStore.setState({ courses: [existing] });
		mockInsert.mockResolvedValueOnce({ error: { message: "insert failed" } });

		await useCourseStore.getState().addCourse({
			name: "새 강좌",
			classroom: "B",
			instructorName: "강사",
			instructorPhone: "010-0000-0000",
			fee: 100000,
			maxStudents: 20,
		});

		// optimistic update: 서버 실패해도 로컬에 추가됨
		const courses = useCourseStore.getState().courses;
		expect(courses).toHaveLength(2);
		expect(courses[1].name).toBe("새 강좌");
	});

	it("updateCourse — 서버 실패해도 로컬 반영 (optimistic)", async () => {
		const existing = makeCourse({ id: "c1", name: "원래 이름" });
		useCourseStore.setState({ courses: [existing] });
		mockUpdate.mockReturnValueOnce({
			eq: vi.fn().mockResolvedValue({ error: { message: "update failed" } }),
		});

		await useCourseStore.getState().updateCourse("c1", { name: "변경 이름" });

		// optimistic update: 서버 실패해도 로컬에 반영됨
		expect(useCourseStore.getState().getCourseById("c1")?.name).toBe(
			"변경 이름",
		);
	});
});
