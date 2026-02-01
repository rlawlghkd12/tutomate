import { create } from 'zustand';
import type { Attendance, AttendanceFormData } from '../types';
import {
  addToStorage,
  updateInStorage,
  deleteFromStorage,
  loadData,
  STORAGE_KEYS,
} from '../utils/storage';

interface AttendanceStore {
  attendances: Attendance[];
  loadAttendances: () => Promise<void>;
  addAttendance: (attendanceData: AttendanceFormData) => void;
  updateAttendance: (id: string, attendanceData: Partial<Attendance>) => void;
  deleteAttendance: (id: string) => void;
  getAttendanceById: (id: string) => Attendance | undefined;
  getAttendancesByCourseId: (courseId: string) => Attendance[];
  getAttendancesByStudentId: (studentId: string) => Attendance[];
  getAttendanceByDate: (courseId: string, studentId: string, date: string) => Attendance | undefined;
  markAttendance: (courseId: string, studentId: string, date: string, status: 'present' | 'absent' | 'late', notes?: string) => void;
}

export const useAttendanceStore = create<AttendanceStore>((set, get) => ({
  attendances: [],

  loadAttendances: async () => {
    const attendances = await loadData<Attendance>(STORAGE_KEYS.ATTENDANCES);
    set({ attendances });
  },

  addAttendance: (attendanceData: AttendanceFormData) => {
    const newAttendance: Attendance = {
      ...attendanceData,
      id: crypto.randomUUID(),
    };
    const attendances = addToStorage(STORAGE_KEYS.ATTENDANCES, newAttendance);
    set({ attendances });
  },

  updateAttendance: (id: string, attendanceData: Partial<Attendance>) => {
    const attendances = updateInStorage(STORAGE_KEYS.ATTENDANCES, id, attendanceData);
    set({ attendances });
  },

  deleteAttendance: (id: string) => {
    const attendances = deleteFromStorage<Attendance>(STORAGE_KEYS.ATTENDANCES, id);
    set({ attendances });
  },

  getAttendanceById: (id: string) => {
    const { attendances } = get();
    return attendances.find((attendance) => attendance.id === id);
  },

  getAttendancesByCourseId: (courseId: string) => {
    const { attendances } = get();
    return attendances.filter((attendance) => attendance.courseId === courseId);
  },

  getAttendancesByStudentId: (studentId: string) => {
    const { attendances } = get();
    return attendances.filter((attendance) => attendance.studentId === studentId);
  },

  getAttendanceByDate: (courseId: string, studentId: string, date: string) => {
    const { attendances } = get();
    return attendances.find(
      (attendance) =>
        attendance.courseId === courseId &&
        attendance.studentId === studentId &&
        attendance.date === date
    );
  },

  markAttendance: (
    courseId: string,
    studentId: string,
    date: string,
    status: 'present' | 'absent' | 'late',
    notes?: string
  ) => {
    const existing = get().getAttendanceByDate(courseId, studentId, date);

    if (existing) {
      // 이미 존재하면 업데이트
      get().updateAttendance(existing.id, { status, notes });
    } else {
      // 없으면 새로 추가
      get().addAttendance({
        courseId,
        studentId,
        date,
        status,
        notes,
      });
    }
  },
}));
