import { create } from 'zustand';
import type { Student, StudentFormData } from '../types';
import { isCloud } from './authStore';
import { createDataHelper } from '../utils/dataHelper';
import { mapStudentFromDb, mapStudentToDb, mapStudentUpdateToDb } from '../utils/fieldMapper';
import type { StudentRow } from '../utils/fieldMapper';
import dayjs from 'dayjs';

const helper = createDataHelper<Student, StudentRow>({
  table: 'students',
  fromDb: mapStudentFromDb,
  toDb: mapStudentToDb,
  updateToDb: mapStudentUpdateToDb,
});

interface StudentStore {
  students: Student[];
  loadStudents: () => Promise<void>;
  addStudent: (studentData: StudentFormData) => Promise<Student>;
  updateStudent: (id: string, studentData: Partial<Student>) => Promise<void>;
  deleteStudent: (id: string) => Promise<void>;
  getStudentById: (id: string) => Student | undefined;
}

export const useStudentStore = create<StudentStore>((set, get) => ({
  students: [],

  loadStudents: async () => {
    const students = await helper.load();
    set({ students });
  },

  addStudent: async (studentData: StudentFormData) => {
    const newStudent: Student = {
      ...studentData,
      id: crypto.randomUUID(),
      createdAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString(),
    };

    if (isCloud()) {
      await helper.add(newStudent);
      set({ students: [...get().students, newStudent] });
    } else {
      const students = await helper.add(newStudent);
      set({ students });
    }

    return newStudent;
  },

  updateStudent: async (id: string, studentData: Partial<Student>) => {
    const updates = { ...studentData, updatedAt: dayjs().toISOString() };

    if (isCloud()) {
      await helper.update(id, updates);
      const students = get().students.map((s) =>
        s.id === id ? { ...s, ...updates } : s,
      );
      set({ students });
    } else {
      const students = await helper.update(id, updates);
      set({ students });
    }
  },

  deleteStudent: async (id: string) => {
    const students = await helper.remove(id, get().students);
    set({ students });
  },

  getStudentById: (id: string) => {
    return get().students.find((student) => student.id === id);
  },
}));
