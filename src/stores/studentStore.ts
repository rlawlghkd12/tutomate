import { create } from 'zustand';
import type { Student, StudentFormData } from '../types';

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
    try {
      const students = await helper.load();
      set({ students });
    } catch {
      // 로드 실패 시 기존 데이터 유지
    }
  },

  addStudent: async (studentData: StudentFormData) => {
    const newStudent: Student = {
      ...studentData,
      id: crypto.randomUUID(),
      createdAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString(),
    };

    await helper.add(newStudent);
    set({ students: [...get().students, newStudent] });

    return newStudent;
  },

  updateStudent: async (id: string, studentData: Partial<Student>) => {
    const updates = { ...studentData, updatedAt: dayjs().toISOString() };

    await helper.update(id, updates);
    const students = get().students.map((s) =>
      s.id === id ? { ...s, ...updates } : s,
    );
    set({ students });
  },

  deleteStudent: async (id: string) => {
    const students = await helper.remove(id, get().students);
    set({ students });
  },

  getStudentById: (id: string) => {
    return get().students.find((student) => student.id === id);
  },
}));
