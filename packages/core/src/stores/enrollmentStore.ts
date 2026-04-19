import dayjs from "dayjs";
import { create } from "zustand";
import { isActiveEnrollment } from "../types";
import type { Enrollment, EnrollmentFormData, PaymentMethod } from "../types";
import { createDataHelper } from "../utils/dataHelper";
import type { EnrollmentRow } from "../utils/fieldMapper";
import {
	mapEnrollmentFromDb,
	mapEnrollmentToDb,
	mapEnrollmentUpdateToDb,
} from "../utils/fieldMapper";
import { handleError, showErrorMessage } from "../utils/errors";
import { logEvent } from "../utils/eventLogger";
import { useStudentStore } from "./studentStore";
import { useCourseStore } from "./courseStore";

const helper = createDataHelper<Enrollment, EnrollmentRow>({
	table: "enrollments",
	fromDb: mapEnrollmentFromDb,
	toDb: mapEnrollmentToDb,
	updateToDb: mapEnrollmentUpdateToDb,
});

interface EnrollmentStore {
	enrollments: Enrollment[];
	loadEnrollments: () => Promise<void>;
	invalidate: () => void;
	addEnrollment: (enrollmentData: EnrollmentFormData) => Promise<boolean>;
	updateEnrollment: (
		id: string,
		enrollmentData: Partial<Enrollment>,
	) => Promise<boolean>;
	deleteEnrollment: (id: string) => Promise<boolean>;
	withdrawEnrollment: (id: string) => Promise<boolean>;
	getEnrollmentById: (id: string) => Enrollment | undefined;
	getEnrollmentsByCourseId: (courseId: string) => Enrollment[];
	getEnrollmentsByStudentId: (studentId: string) => Enrollment[];
	getEnrollmentCountByCourseId: (courseId: string) => number;
	updatePayment: (
		id: string,
		paidAmount: number,
		totalFee: number,
		paidAt?: string,
		isExempt?: boolean,
		paymentMethod?: PaymentMethod,
		discountAmount?: number,
	) => Promise<void>;
}

export const useEnrollmentStore = create<EnrollmentStore>((set, get) => ({
	enrollments: [],

	loadEnrollments: async () => {
		const result = await helper.load();
		if (result.status === "ok" || result.status === "cached") {
			const enrollments = result.data.map((e) => ({
				...e,
				discountAmount: e.discountAmount ?? 0,
			}));
			set({ enrollments });
		}
		if (result.status === "cached") {
			showErrorMessage("오프라인 상태입니다. 저장된 데이터를 표시합니다.");
		}
		if (result.status === "error") {
			handleError(result.error);
		}
	},

	invalidate: () => helper.invalidate(),

	addEnrollment: async (enrollmentData: EnrollmentFormData) => {
		const remainingAmount = enrollmentData.courseId
			? 0
			: enrollmentData.paidAmount || 0;

		const newEnrollment: Enrollment = {
			...enrollmentData,
			id: crypto.randomUUID(),
			enrolledAt: dayjs().toISOString(),
			remainingAmount,
			discountAmount: enrollmentData.discountAmount ?? 0,
		};

		const error = await helper.add(newEnrollment);
		if (error) {
			handleError(error);
			return false;
		}
		set({ enrollments: [...get().enrollments, newEnrollment] });

		const student = useStudentStore.getState().getStudentById(newEnrollment.studentId);
		const course = useCourseStore.getState().getCourseById(newEnrollment.courseId);
		await logEvent({
			eventType: 'enrollment.add',
			entityType: 'enrollment',
			entityId: newEnrollment.id,
			entityLabel: student && course ? `${student.name} — ${course.name}` : undefined,
			after: {
				courseId: newEnrollment.courseId,
				studentId: newEnrollment.studentId,
				quarter: newEnrollment.quarter,
				paidAmount: newEnrollment.paidAmount,
				paymentStatus: newEnrollment.paymentStatus,
				discountAmount: newEnrollment.discountAmount,
			},
		});
		return true;
	},

	updateEnrollment: async (id: string, enrollmentData: Partial<Enrollment>) => {
		const before = get().enrollments.find((e) => e.id === id);
		const error = await helper.update(id, enrollmentData);
		if (error) {
			handleError(error);
			return false;
		}
		set({
			enrollments: get().enrollments.map((e) =>
				e.id === id ? { ...e, ...enrollmentData } : e,
			),
		});
		if (before) {
			const student = useStudentStore.getState().getStudentById(before.studentId);
			const course = useCourseStore.getState().getCourseById(before.courseId);
			// 변경된 필드만 diff로 로깅
			const changedKeys = (Object.keys(enrollmentData) as (keyof Enrollment)[])
				.filter((k) => before[k] !== enrollmentData[k]);
			if (changedKeys.length > 0) {
				const beforeChanged: Partial<Enrollment> = {};
				const afterChanged: Partial<Enrollment> = {};
				for (const k of changedKeys) {
					(beforeChanged as any)[k] = before[k];
					(afterChanged as any)[k] = enrollmentData[k];
				}
				await logEvent({
					eventType: 'enrollment.update',
					entityType: 'enrollment',
					entityId: id,
					entityLabel: student && course ? `${student.name} — ${course.name}` : undefined,
					before: beforeChanged,
					after: afterChanged,
				});
			}
		}
		return true;
	},

	deleteEnrollment: async (id: string) => {
		const before = get().enrollments.find((e) => e.id === id);
		const error = await helper.remove(id);
		if (error) {
			handleError(error);
			return false;
		}
		set({ enrollments: get().enrollments.filter((e) => e.id !== id) });
		if (before) {
			const student = useStudentStore.getState().getStudentById(before.studentId);
			const course = useCourseStore.getState().getCourseById(before.courseId);
			await logEvent({
				eventType: 'enrollment.delete',
				entityType: 'enrollment',
				entityId: id,
				entityLabel: student && course ? `${student.name} — ${course.name}` : undefined,
				before: {
					courseId: before.courseId,
					studentId: before.studentId,
					quarter: before.quarter,
					paidAmount: before.paidAmount,
					paymentStatus: before.paymentStatus,
				},
			});
		}
		return true;
	},

	withdrawEnrollment: async (id: string) => {
		const before = get().enrollments.find((e) => e.id === id);
		const result = await get().updateEnrollment(id, {
			paymentStatus: "withdrawn" as Enrollment["paymentStatus"],
		});
		if (result && before) {
			const student = useStudentStore.getState().getStudentById(before.studentId);
			const course = useCourseStore.getState().getCourseById(before.courseId);
			await logEvent({
				eventType: 'enrollment.withdraw',
				entityType: 'enrollment',
				entityId: id,
				entityLabel: student && course ? `${student.name} — ${course.name}` : undefined,
				before: { paymentStatus: before.paymentStatus },
				meta: { paidAmount: before.paidAmount },
			});
		}
		return result;
	},

	getEnrollmentById: (id: string) => {
		return get().enrollments.find((enrollment) => enrollment.id === id);
	},

	getEnrollmentsByCourseId: (courseId: string) => {
		return get().enrollments.filter(
			(enrollment) => enrollment.courseId === courseId,
		);
	},

	getEnrollmentsByStudentId: (studentId: string) => {
		return get().enrollments.filter(
			(enrollment) => enrollment.studentId === studentId,
		);
	},

	getEnrollmentCountByCourseId: (courseId: string) => {
		return get().enrollments.filter(
			(enrollment) =>
				enrollment.courseId === courseId && isActiveEnrollment(enrollment),
		).length;
	},

	updatePayment: async (
		id: string,
		paidAmount: number,
		totalFee: number,
		paidAt?: string,
		isExempt?: boolean,
		paymentMethod?: PaymentMethod,
		discountAmount?: number,
	) => {
		// 할인 적용된 실제 수강료
		const discount =
			discountAmount ?? get().getEnrollmentById(id)?.discountAmount ?? 0;
		const effectiveFee = totalFee - discount;

		if (isExempt) {
			const prevStatus = get().getEnrollmentById(id)?.paymentStatus;
			await get().updateEnrollment(id, {
				paidAmount: 0,
				remainingAmount: 0,
				paymentStatus: "exempt",
				paidAt: paidAt || dayjs().format("YYYY-MM-DD"),
				...(paymentMethod !== undefined && { paymentMethod }),
				...(discountAmount !== undefined && { discountAmount }),
			});
			if (prevStatus !== 'exempt') {
				await logEvent({
					eventType: 'enrollment.exempt',
					entityType: 'enrollment',
					entityId: id,
					meta: { previousStatus: prevStatus },
				});
			}
			return;
		}

		// 잔여금은 음수가 될 수 없음 (초과 납부도 잔여 0)
		const remainingAmount = Math.max(0, effectiveFee - paidAmount);
		let paymentStatus: "pending" | "partial" | "completed" = "pending";

		if (paidAmount <= 0) {
			paymentStatus = "pending";
		} else if (paidAmount < effectiveFee) {
			paymentStatus = "partial";
		} else {
			paymentStatus = "completed";
		}

		await get().updateEnrollment(id, {
			paidAmount,
			remainingAmount,
			paymentStatus,
			paidAt: paidAt || dayjs().format("YYYY-MM-DD"),
			...(paymentMethod !== undefined && { paymentMethod }),
			...(discountAmount !== undefined && { discountAmount }),
		});
	},
}));
