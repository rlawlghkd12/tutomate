import { create } from 'zustand';
import type { Student, StudentFormData } from '../types';
import {
  addToStorage,
  updateInStorage,
  deleteFromStorage,
  loadData,
  STORAGE_KEYS,
} from '../utils/storage';
import dayjs from 'dayjs';

interface StudentStore {
  students: Student[];
  loadStudents: () => Promise<void>;
  addStudent: (studentData: StudentFormData) => Student;
  updateStudent: (id: string, studentData: Partial<Student>) => void;
  deleteStudent: (id: string) => void;
  getStudentById: (id: string) => Student | undefined;
}

export const useStudentStore = create<StudentStore>((set, get) => ({
  students: [],

  loadStudents: async () => {
    const students = await loadData<Student>(STORAGE_KEYS.STUDENTS);
    set({ students });
  },

  addStudent: (studentData: StudentFormData) => {
    const newStudent: Student = {
      ...studentData,
      id: crypto.randomUUID(),
      createdAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString(),
    };
    const students = addToStorage(STORAGE_KEYS.STUDENTS, newStudent);
    set({ students });
    return newStudent;
  },

  updateStudent: (id: string, studentData: Partial<Student>) => {
    const students = updateInStorage(STORAGE_KEYS.STUDENTS, id, {
      ...studentData,
      updatedAt: dayjs().toISOString(),
    });
    set({ students });
  },

  deleteStudent: (id: string) => {
    const students = deleteFromStorage<Student>(STORAGE_KEYS.STUDENTS, id);
    set({ students });
  },

  getStudentById: (id: string) => {
    const { students } = get();
    return students.find((student) => student.id === id);
  },
}));
