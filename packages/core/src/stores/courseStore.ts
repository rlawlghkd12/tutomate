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
import { logEvent } from "../utils/eventLogger";

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
		await logEvent({
			eventType: 'course.add',
			entityType: 'course',
			entityId: newCourse.id,
			entityLabel: newCourse.name,
			after: {
				name: newCourse.name,
				fee: newCourse.fee,
				classroom: newCourse.classroom,
				instructorName: newCourse.instructorName,
				maxStudents: newCourse.maxStudents,
			},
		});
		return true;
	},

	updateCourse: async (id: string, courseData: Partial<Course>) => {
		const before = get().courses.find((c) => c.id === id);
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
		if (before) {
			const changedKeys = (Object.keys(courseData) as (keyof Course)[])
				.filter((k) => k !== 'updatedAt' && before[k] !== courseData[k]);
			// currentStudents는 내부 자동 증감이므로 로깅 노이즈 줄이기 위해 스킵
			const loggable = changedKeys.filter((k) => k !== 'currentStudents');
			if (loggable.length > 0) {
				const b: Partial<Course> = {};
				const a: Partial<Course> = {};
				for (const k of loggable) {
					(b as any)[k] = before[k];
					(a as any)[k] = courseData[k];
				}
				await logEvent({
					eventType: 'course.update',
					entityType: 'course',
					entityId: id,
					entityLabel: before.name,
					before: b,
					after: a,
				});
			}
		}
		return true;
	},

	deleteCourse: async (id: string) => {
		const before = get().courses.find((c) => c.id === id);
		const error = await helper.remove(id);
		if (error) {
			handleError(error);
			return false;
		}
		set({ courses: get().courses.filter((c) => c.id !== id) });
		if (before) {
			await logEvent({
				eventType: 'course.delete',
				entityType: 'course',
				entityId: id,
				entityLabel: before.name,
				before: { name: before.name, fee: before.fee },
			});
		}
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
