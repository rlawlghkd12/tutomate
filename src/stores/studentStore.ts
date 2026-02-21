import { create } from 'zustand';
import type { Student, StudentFormData } from '../types';
import {
  addToStorage,
  updateInStorage,
  deleteFromStorage,
  loadData,
  STORAGE_KEYS,
} from '../utils/storage';
import { isCloud, getOrgId } from './authStore';
import { supabaseLoadData, supabaseInsert, supabaseUpdate, supabaseDelete } from '../utils/supabaseStorage';
import { mapStudentFromDb, mapStudentToDb, mapStudentUpdateToDb } from '../utils/fieldMapper';
import type { StudentRow } from '../utils/fieldMapper';
import { logError } from '../utils/logger';
import dayjs from 'dayjs';

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
    if (isCloud()) {
      try {
        const rows = await supabaseLoadData<StudentRow>('students');
        set({ students: rows.map(mapStudentFromDb) });
      } catch (error) {
        logError('Failed to load students from cloud', { error });
      }
    } else {
      const students = await loadData<Student>(STORAGE_KEYS.STUDENTS);
      set({ students });
    }
  },

  addStudent: async (studentData: StudentFormData) => {
    const newStudent: Student = {
      ...studentData,
      id: crypto.randomUUID(),
      createdAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString(),
    };

    if (isCloud()) {
      const orgId = getOrgId();
      if (!orgId) return newStudent;
      try {
        await supabaseInsert('students', mapStudentToDb(newStudent, orgId));
        set({ students: [...get().students, newStudent] });
      } catch (error) {
        logError('Failed to add student to cloud', { error });
      }
    } else {
      const students = addToStorage(STORAGE_KEYS.STUDENTS, newStudent);
      set({ students });
    }

    return newStudent;
  },

  updateStudent: async (id: string, studentData: Partial<Student>) => {
    const updates = { ...studentData, updatedAt: dayjs().toISOString() };

    if (isCloud()) {
      try {
        await supabaseUpdate('students', id, mapStudentUpdateToDb(updates));
        const students = get().students.map((s) =>
          s.id === id ? { ...s, ...updates } : s,
        );
        set({ students });
      } catch (error) {
        logError('Failed to update student in cloud', { error });
      }
    } else {
      const students = updateInStorage(STORAGE_KEYS.STUDENTS, id, updates);
      set({ students });
    }
  },

  deleteStudent: async (id: string) => {
    if (isCloud()) {
      try {
        await supabaseDelete('students', id);
        set({ students: get().students.filter((s) => s.id !== id) });
      } catch (error) {
        logError('Failed to delete student from cloud', { error });
      }
    } else {
      const students = deleteFromStorage<Student>(STORAGE_KEYS.STUDENTS, id);
      set({ students });
    }
  },

  getStudentById: (id: string) => {
    const { students } = get();
    return students.find((student) => student.id === id);
  },
}));
