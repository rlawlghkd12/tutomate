import dayjs from "dayjs";
import { create } from "zustand";
import type { MonthlyPayment, PaymentMethod } from "../types";
import { createDataHelper } from "../utils/dataHelper";
import type { MonthlyPaymentRow } from "../utils/fieldMapper";
import {
	mapMonthlyPaymentFromDb,
	mapMonthlyPaymentToDb,
	mapMonthlyPaymentUpdateToDb,
} from "../utils/fieldMapper";
import { handleError } from "../utils/errors";
import { logError } from "../utils/logger";

const helper = createDataHelper<MonthlyPayment, MonthlyPaymentRow>({
	table: "monthly_payments",
	fromDb: mapMonthlyPaymentFromDb,
	toDb: mapMonthlyPaymentToDb,
	updateToDb: mapMonthlyPaymentUpdateToDb,
});

interface MonthlyPaymentStore {
	payments: MonthlyPayment[];
	loadPayments: () => Promise<void>;
	invalidate: () => void;
	getPaymentsByEnrollmentId: (enrollmentId: string) => MonthlyPayment[];
	getPaymentsByMonth: (month: string) => MonthlyPayment[];
	addPayment: (
		enrollmentId: string,
		month: string,
		amount: number,
		paymentMethod?: PaymentMethod,
		paidAt?: string,
		notes?: string,
	) => Promise<MonthlyPayment | null>;
	updatePayment: (
		id: string,
		updates: Partial<MonthlyPayment>,
	) => Promise<boolean>;
	deletePayment: (id: string) => Promise<boolean>;
	deletePaymentsByEnrollmentId: (enrollmentId: string) => Promise<void>;
}

export const useMonthlyPaymentStore = create<MonthlyPaymentStore>(
	(set, get) => ({
		payments: [],

		loadPayments: async () => {
			const result = await helper.load();
			if (result.status === "ok" || result.status === "cached") {
				set({ payments: result.data });
			}
			if (result.status === "error") {
				handleError(result.error);
			}
		},

		invalidate: () => helper.invalidate(),

		getPaymentsByEnrollmentId: (enrollmentId: string) =>
			get()
				.payments.filter((p) => p.enrollmentId === enrollmentId)
				.sort((a, b) => a.month.localeCompare(b.month)),

		getPaymentsByMonth: (month: string) =>
			get().payments.filter((p) => p.month === month),

		addPayment: async (
			enrollmentId,
			month,
			amount,
			paymentMethod?,
			paidAt?,
			notes?,
		) => {
			const newPayment: MonthlyPayment = {
				id: crypto.randomUUID(),
				enrollmentId,
				month,
				amount,
				paidAt:
					paidAt || (amount > 0 ? dayjs().format("YYYY-MM-DD") : undefined),
				paymentMethod,
				status: amount > 0 ? "paid" : "pending",
				notes,
				createdAt: dayjs().toISOString(),
			};
			const error = await helper.add(newPayment);
			if (error) {
				handleError(error);
				return null;
			}
			set({ payments: [...get().payments, newPayment] });
			return newPayment;
		},

		updatePayment: async (id, updates) => {
			const error = await helper.update(id, updates);
			if (error) {
				handleError(error);
				return false;
			}
			set({
				payments: get().payments.map((p) =>
					p.id === id ? { ...p, ...updates } : p,
				),
			});
			return true;
		},

		deletePayment: async (id) => {
			const error = await helper.remove(id);
			if (error) {
				handleError(error);
				return false;
			}
			set({ payments: get().payments.filter((p) => p.id !== id) });
			return true;
		},

		deletePaymentsByEnrollmentId: async (enrollmentId) => {
			const toDelete = get().payments.filter(
				(p) => p.enrollmentId === enrollmentId,
			);
			for (const payment of toDelete) {
				const error = await helper.remove(payment.id);
				if (error) {
					logError(`Failed to delete monthly payment ${payment.id}`, {
						error,
					});
				}
			}
			set({
				payments: get().payments.filter(
					(p) => p.enrollmentId !== enrollmentId,
				),
			});
		},
	}),
);
