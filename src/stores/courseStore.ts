import { create } from 'zustand';
import type { Course, CourseFormData } from '../types';
import {
  addToStorage,
  updateInStorage,
  deleteFromStorage,
  loadData,
  STORAGE_KEYS,
} from '../utils/storage';
import { isCloud, getOrgId } from './authStore';
import { supabaseLoadData, supabaseInsert, supabaseUpdate, supabaseDelete } from '../utils/supabaseStorage';
import { mapCourseFromDb, mapCourseToDb, mapCourseUpdateToDb } from '../utils/fieldMapper';
import type { CourseRow } from '../utils/fieldMapper';
import { logError } from '../utils/logger';
import dayjs from 'dayjs';

interface CourseStore {
  courses: Course[];
  loadCourses: () => Promise<void>;
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
    if (isCloud()) {
      try {
        const rows = await supabaseLoadData<CourseRow>('courses');
        set({ courses: rows.map(mapCourseFromDb) });
      } catch (error) {
        logError('Failed to load courses from cloud', { error });
      }
    } else {
      const courses = await loadData<Course>(STORAGE_KEYS.COURSES);
      set({ courses });
    }
  },

  addCourse: async (courseData: CourseFormData) => {
    const newCourse: Course = {
      ...courseData,
      id: crypto.randomUUID(),
      currentStudents: 0,
      createdAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString(),
    };

    if (isCloud()) {
      const orgId = getOrgId();
      if (!orgId) return;
      try {
        await supabaseInsert('courses', mapCourseToDb(newCourse, orgId));
        set({ courses: [...get().courses, newCourse] });
      } catch (error) {
        logError('Failed to add course to cloud', { error });
      }
    } else {
      const courses = addToStorage(STORAGE_KEYS.COURSES, newCourse);
      set({ courses });
    }
  },

  updateCourse: async (id: string, courseData: Partial<Course>) => {
    const updates = { ...courseData, updatedAt: dayjs().toISOString() };

    if (isCloud()) {
      try {
        await supabaseUpdate('courses', id, mapCourseUpdateToDb(updates));
        const courses = get().courses.map((c) =>
          c.id === id ? { ...c, ...updates } : c,
        );
        set({ courses });
      } catch (error) {
        logError('Failed to update course in cloud', { error });
      }
    } else {
      const courses = updateInStorage(STORAGE_KEYS.COURSES, id, updates);
      set({ courses });
    }
  },

  deleteCourse: async (id: string) => {
    if (isCloud()) {
      try {
        await supabaseDelete('courses', id);
        set({ courses: get().courses.filter((c) => c.id !== id) });
      } catch (error) {
        logError('Failed to delete course from cloud', { error });
      }
    } else {
      const courses = deleteFromStorage<Course>(STORAGE_KEYS.COURSES, id);
      set({ courses });
    }
  },

  getCourseById: (id: string) => {
    const { courses } = get();
    return courses.find((course) => course.id === id);
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
