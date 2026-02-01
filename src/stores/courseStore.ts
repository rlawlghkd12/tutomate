import { create } from 'zustand';
import type { Course, CourseFormData } from '../types';
import {
  addToStorage,
  updateInStorage,
  deleteFromStorage,
  loadData,
  STORAGE_KEYS,
} from '../utils/storage';
import dayjs from 'dayjs';

interface CourseStore {
  courses: Course[];
  loadCourses: () => Promise<void>;
  addCourse: (courseData: CourseFormData) => void;
  updateCourse: (id: string, courseData: Partial<Course>) => void;
  deleteCourse: (id: string) => void;
  getCourseById: (id: string) => Course | undefined;
  incrementCurrentStudents: (id: string) => void;
  decrementCurrentStudents: (id: string) => void;
}

export const useCourseStore = create<CourseStore>((set, get) => ({
  courses: [],

  loadCourses: async () => {
    const courses = await loadData<Course>(STORAGE_KEYS.COURSES);
    set({ courses });
  },

  addCourse: (courseData: CourseFormData) => {
    const newCourse: Course = {
      ...courseData,
      id: crypto.randomUUID(),
      currentStudents: 0,
      createdAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString(),
    };
    const courses = addToStorage(STORAGE_KEYS.COURSES, newCourse);
    set({ courses });
  },

  updateCourse: (id: string, courseData: Partial<Course>) => {
    const courses = updateInStorage(STORAGE_KEYS.COURSES, id, {
      ...courseData,
      updatedAt: dayjs().toISOString(),
    });
    set({ courses });
  },

  deleteCourse: (id: string) => {
    const courses = deleteFromStorage<Course>(STORAGE_KEYS.COURSES, id);
    set({ courses });
  },

  getCourseById: (id: string) => {
    const { courses } = get();
    return courses.find((course) => course.id === id);
  },

  incrementCurrentStudents: (id: string) => {
    const course = get().getCourseById(id);
    if (course && course.currentStudents < course.maxStudents) {
      get().updateCourse(id, {
        currentStudents: course.currentStudents + 1,
      });
    }
  },

  decrementCurrentStudents: (id: string) => {
    const course = get().getCourseById(id);
    if (course && course.currentStudents > 0) {
      get().updateCourse(id, {
        currentStudents: course.currentStudents - 1,
      });
    }
  },
}));
