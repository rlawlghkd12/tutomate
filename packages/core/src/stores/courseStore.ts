import dayjs from "dayjs";
import { create } from "zustand";
import type { Course, CourseFormData } from "../types";
import { createDataHelper } from "../utils/dataHelper";
import type { CourseRow } from "../utils/fieldMapper";
import {
	mapCourseFromDb,
	mapCourseToDb,
	mapCourseUpdateToDb,
} from "../utils/fieldMapper";

const helper = createDataHelper<Course, CourseRow>({
	table: "courses",
	fromDb: mapCourseFromDb,
	toDb: mapCourseToDb,
	updateToDb: mapCourseUpdateToDb,
});

interface CourseStore {
	courses: Course[];
	loadCourses: () => Promise<void>;
	invalidate: () => void;
	addCourse: (courseData: CourseFormData) => Promise<void>;
	updateCourse: (id: string, courseData: Partial<Course>) => Promise<void>;
	deleteCourse: (id: string) => Promise<void>;
	getCourseById: (id: string) => Course | undefined;
	incrementCurrentStudents: (id: string) => Promise<void>;
	decrementCurrentStudents: (id: string) => Promise<void>;
}

export const useCourseStore = create<CourseStore>((set, get) => ({
	courses: [],

	loadCourses: async () => {
		try {
			const courses = await helper.load();
			set({ courses });
		} catch {
			// 로드 실패 시 기존 데이터 유지
		}
	},

	/** stale 마킹 — 다음 loadCourses()에서 서버 재조회 */
	invalidate: () => helper.invalidate(),

	addCourse: async (courseData: CourseFormData) => {
		const newCourse: Course = {
			...courseData,
			id: crypto.randomUUID(),
			currentStudents: 0,
			createdAt: dayjs().toISOString(),
			updatedAt: dayjs().toISOString(),
		};

		try {
			await helper.add(newCourse);
		} catch {
			// 서버 저장 실패 — 로컬에만 추가 (새로고침 시 사라질 수 있음)
		}
		set({ courses: [...get().courses, newCourse] });
	},

	updateCourse: async (id: string, courseData: Partial<Course>) => {
		const updates = { ...courseData, updatedAt: dayjs().toISOString() };

		try {
			await helper.update(id, updates);
		} catch {
			// 서버 저장 실패 — 로컬에만 반영
		}
		const courses = get().courses.map((c) =>
			c.id === id ? { ...c, ...updates } : c,
		);
		set({ courses });
	},

	deleteCourse: async (id: string) => {
		const courses = await helper.remove(id, get().courses);
		set({ courses });
	},

	getCourseById: (id: string) => {
		return get().courses.find((course) => course.id === id);
	},

	incrementCurrentStudents: async (id: string) => {
		const course = get().getCourseById(id);
		if (course && course.currentStudents < course.maxStudents) {
			await get().updateCourse(id, {
				currentStudents: course.currentStudents + 1,
			});
		}
	},

	decrementCurrentStudents: async (id: string) => {
		const course = get().getCourseById(id);
		if (course && course.currentStudents > 0) {
			await get().updateCourse(id, {
				currentStudents: course.currentStudents - 1,
			});
		}
	},
}));
