import { supabase } from "../config/supabase";
import { AppError, ErrorType, ErrorCode } from "./errors";
import type { ErrorCodeType } from "./errors";
import { logError, logInfo } from "./logger";
import { reportError } from "./errorReporter";

type TableName = "courses" | "students" | "enrollments" | "monthly_payments" | "payment_records";

function toAppError(error: unknown, operation: string, table: string): AppError {
	if (error instanceof AppError) return error;

	const pgCode = (error as any)?.code;
	let code: ErrorCodeType;

	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		code = ErrorCode.NETWORK_OFFLINE;
	} else if (pgCode === '23505') {
		code = ErrorCode.DB_DUPLICATE;
	} else if (pgCode === '42501' || pgCode === '42503') {
		code = ErrorCode.DB_PERMISSION;
	} else if (pgCode === 'PGRST116') {
		code = ErrorCode.DB_NOT_FOUND;
	} else if (operation === 'load') {
		code = ErrorCode.DB_READ_FAILED;
	} else {
		code = ErrorCode.DB_WRITE_FAILED;
	}

	logError(`${operation} failed: ${table}`, { error, data: { code } });
	reportError(error instanceof Error ? error : new Error(String(error)));

	return new AppError({
		type: ErrorType.NETWORK_ERROR,
		message: `${operation} failed: ${table}`,
		code,
		originalError: error,
		component: 'supabaseStorage',
		action: operation,
	});
}

/**
 * Supabase에서 데이터 전체 로드
 */
export async function supabaseLoadData<T>(table: TableName): Promise<T[]> {
	if (!supabase) throw new Error("Supabase not configured");

	const { data, error } = await supabase.from(table).select("*");

	if (error) {
		throw toAppError(error, 'load', table);
	}

	logInfo(`Loaded ${data.length} items from Supabase: ${table}`);
	return data as T[];
}

/**
 * Supabase에 단일 항목 삽입
 */
export async function supabaseInsert<T extends object>(
	table: TableName,
	item: T,
): Promise<void> {
	if (!supabase) throw new Error("Supabase not configured");

	const { error } = await supabase
		.from(table)
		.insert(item as Record<string, unknown>);

	if (error) {
		throw toAppError(error, 'insert', table);
	}

	logInfo(`Inserted item into Supabase: ${table}`);
}

/**
 * Supabase에서 항목 업데이트
 */
export async function supabaseUpdate(
	table: TableName,
	id: string,
	updates: Record<string, unknown>,
): Promise<void> {
	if (!supabase) throw new Error("Supabase not configured");

	const { error } = await supabase.from(table).update(updates).eq("id", id);

	if (error) {
		throw toAppError(error, 'update', table);
	}

	logInfo(`Updated item in Supabase: ${table}`, { data: { id } });
}

/**
 * Supabase에서 항목 삭제
 */
export async function supabaseDelete(
	table: TableName,
	id: string,
): Promise<void> {
	if (!supabase) throw new Error("Supabase not configured");

	const { error } = await supabase.from(table).delete().eq("id", id);

	if (error) {
		throw toAppError(error, 'delete', table);
	}

	logInfo(`Deleted item from Supabase: ${table}`, { data: { id } });
}

/**
 * Supabase에 여러 항목 일괄 삽입 (마이그레이션용)
 */
export async function supabaseBulkInsert<T extends object>(
	table: TableName,
	items: T[],
): Promise<void> {
	if (!supabase) throw new Error("Supabase not configured");
	if (items.length === 0) return;

	const { error } = await supabase
		.from(table)
		.insert(items as Record<string, unknown>[]);

	if (error) {
		throw toAppError(error, 'bulkInsert', table);
	}

	logInfo(`Bulk inserted ${items.length} items into Supabase: ${table}`);
}
