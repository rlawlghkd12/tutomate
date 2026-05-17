import dayjs from "dayjs";
import { create } from "zustand";
import type { Student, StudentFormData } from "../types";
import { createDataHelper } from "../utils/dataHelper";
import type { StudentRow } from "../utils/fieldMapper";
import {
	mapStudentFromDb,
	mapStudentToDb,
	mapStudentUpdateToDb,
} from "../utils/fieldMapper";
import { handleError, showErrorMessage } from "../utils/errors";
import { logEvent } from "../utils/eventLogger";

const helper = createDataHelper<Student, StudentRow>({
	table: "students",
	fromDb: mapStudentFromDb,
	toDb: mapStudentToDb,
	updateToDb: mapStudentUpdateToDb,
});

interface StudentStore {
	students: Student[];
	loadStudents: () => Promise<void>;
	invalidate: () => void;
	addStudent: (studentData: StudentFormData) => Promise<Student | null>;
	updateStudent: (id: string, studentData: Partial<Student>) => Promise<boolean>;
	deleteStudent: (id: string) => Promise<boolean>;
	getStudentById: (id: string) => Student | undefined;
}

export const useStudentStore = create<StudentStore>((set, get) => ({
	students: [],

	loadStudents: async () => {
		const result = await helper.load();
		if (result.status === "ok" || result.status === "cached") {
			set({ students: result.data });
		}
		if (result.status === "cached") {
			showErrorMessage("오프라인 상태입니다. 저장된 데이터를 표시합니다.");
		}
		if (result.status === "error") {
			handleError(result.error);
		}
	},

	invalidate: () => helper.invalidate(),

	addStudent: async (studentData: StudentFormData) => {
		const newStudent: Student = {
			...studentData,
			id: crypto.randomUUID(),
			createdAt: dayjs().toISOString(),
			updatedAt: dayjs().toISOString(),
		};
		const error = await helper.add(newStudent);
		if (error) {
			handleError(error);
			return null;
		}
		set({ students: [...get().students, newStudent] });
		await logEvent({
			eventType: 'student.add',
			entityType: 'student',
			entityId: newStudent.id,
			entityLabel: newStudent.name,
			after: { name: newStudent.name, phone: newStudent.phone, isMember: newStudent.isMember },
		});
		return newStudent;
	},

	updateStudent: async (id: string, studentData: Partial<Student>) => {
		const before = get().students.find((s) => s.id === id);
		const updates = { ...studentData, updatedAt: dayjs().toISOString() };
		const error = await helper.update(id, updates);
		if (error) {
			handleError(error);
			return false;
		}
		set({
			students: get().students.map((s) =>
				s.id === id ? { ...s, ...updates } : s,
			),
		});
		if (before) {
			const changedKeys = (Object.keys(studentData) as (keyof Student)[])
				.filter((k) => k !== 'updatedAt' && before[k] !== studentData[k]);
			if (changedKeys.length > 0) {
				const b: Partial<Student> = {};
				const a: Partial<Student> = {};
				for (const k of changedKeys) {
					(b as any)[k] = before[k];
					(a as any)[k] = studentData[k];
				}
				await logEvent({
					eventType: 'student.update',
					entityType: 'student',
					entityId: id,
					entityLabel: before.name,
					before: b,
					after: a,
				});
			}
		}
		return true;
	},

	deleteStudent: async (id: string) => {
		const before = get().students.find((s) => s.id === id);
		const error = await helper.remove(id);
		if (error) {
			handleError(error);
			return false;
		}
		set({ students: get().students.filter((s) => s.id !== id) });
		if (before) {
			await logEvent({
				eventType: 'student.delete',
				entityType: 'student',
				entityId: id,
				entityLabel: before.name,
				before: { name: before.name, phone: before.phone },
			});
		}
		return true;
	},

	getStudentById: (id: string) => get().students.find((s) => s.id === id),
}));
