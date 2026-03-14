import { create } from 'zustand';
import type { Course, CourseFormData } from '../types';
import { isCloud } from './authStore';
import { createDataHelper } from '../utils/dataHelper';
import { mapCourseFromDb, mapCourseToDb, mapCourseUpdateToDb } from '../utils/fieldMapper';
import type { CourseRow } from '../utils/fieldMapper';
import dayjs from 'dayjs';

const helper = createDataHelper<Course, CourseRow>({
  table: 'courses',
  fromDb: mapCourseFromDb,
  toDb: mapCourseToDb,
  updateToDb: mapCourseUpdateToDb,
});

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
    const courses = await helper.load();
    set({ courses });
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
      await helper.add(newCourse);
      set({ courses: [...get().courses, newCourse] });
    } else {
      const courses = await helper.add(newCourse);
      set({ courses });
    }
  },

  updateCourse: async (id: string, courseData: Partial<Course>) => {
    const updates = { ...courseData, updatedAt: dayjs().toISOString() };

    if (isCloud()) {
      await helper.update(id, updates);
      const courses = get().courses.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      );
      set({ courses });
    } else {
      const courses = await helper.update(id, updates);
      set({ courses });
    }
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
