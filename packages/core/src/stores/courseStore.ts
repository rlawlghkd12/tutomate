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
import { handleError, showErrorMessage } from "../utils/errors";

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
	addCourse: (courseData: CourseFormData) => Promise<boolean>;
	updateCourse: (id: string, courseData: Partial<Course>) => Promise<boolean>;
	deleteCourse: (id: string) => Promise<boolean>;
	getCourseById: (id: string) => Course | undefined;
	incrementCurrentStudents: (id: string) => Promise<void>;
	decrementCurrentStudents: (id: string) => Promise<void>;
}

export const useCourseStore = create<CourseStore>((set, get) => ({
	courses: [],

	loadCourses: async () => {
		const result = await helper.load();
		if (result.status === "ok" || result.status === "cached") {
			set({ courses: result.data });
		}
		if (result.status === "cached") {
			showErrorMessage("오프라인 상태입니다. 저장된 데이터를 표시합니다.");
		}
		if (result.status === "error") {
			handleError(result.error);
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
		const error = await helper.add(newCourse);
		if (error) {
			handleError(error);
			return false;
		}
		set({ courses: [...get().courses, newCourse] });
		return true;
	},

	updateCourse: async (id: string, courseData: Partial<Course>) => {
		const updates = { ...courseData, updatedAt: dayjs().toISOString() };
		const error = await helper.update(id, updates);
		if (error) {
			handleError(error);
			return false;
		}
		set({
			courses: get().courses.map((c) =>
				c.id === id ? { ...c, ...updates } : c,
			),
		});
		return true;
	},

	deleteCourse: async (id: string) => {
		const error = await helper.remove(id);
		if (error) {
			handleError(error);
			return false;
		}
		set({ courses: get().courses.filter((c) => c.id !== id) });
		return true;
	},

	getCourseById: (id: string) => get().courses.find((c) => c.id === id),

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
