import { supabase } from '../config/supabase';
import { AppError, ErrorType, errorHandler } from './errors';
import { logInfo, logError } from './logger';

type TableName = 'courses' | 'students' | 'enrollments';

/**
 * Supabase에서 데이터 전체 로드
 */
export async function supabaseLoadData<T>(table: TableName): Promise<T[]> {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase.from(table).select('*');

  if (error) {
    logError(`Supabase load error: ${table}`, { error });
    const appError = new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: `Failed to load from Supabase: ${table}`,
      originalError: error,
      component: 'supabaseStorage',
      action: 'supabaseLoadData',
    });
    errorHandler.handle(appError);
    return [];
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
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase.from(table).insert(item as Record<string, unknown>);

  if (error) {
    logError(`Supabase insert error: ${table}`, { error });
    throw new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: `Failed to insert into Supabase: ${table}`,
      originalError: error,
      component: 'supabaseStorage',
      action: 'supabaseInsert',
    });
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
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase.from(table).update(updates).eq('id', id);

  if (error) {
    logError(`Supabase update error: ${table}`, { error, data: { id } });
    throw new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: `Failed to update in Supabase: ${table}`,
      originalError: error,
      component: 'supabaseStorage',
      action: 'supabaseUpdate',
    });
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
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase.from(table).delete().eq('id', id);

  if (error) {
    logError(`Supabase delete error: ${table}`, { error, data: { id } });
    throw new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: `Failed to delete from Supabase: ${table}`,
      originalError: error,
      component: 'supabaseStorage',
      action: 'supabaseDelete',
    });
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
  if (!supabase) throw new Error('Supabase not configured');
  if (items.length === 0) return;

  const { error } = await supabase.from(table).insert(items as Record<string, unknown>[]);

  if (error) {
    logError(`Supabase bulk insert error: ${table}`, { error });
    throw new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: `Failed to bulk insert into Supabase: ${table}`,
      originalError: error,
      component: 'supabaseStorage',
      action: 'supabaseBulkInsert',
    });
  }

  logInfo(`Bulk inserted ${items.length} items into Supabase: ${table}`);
}
