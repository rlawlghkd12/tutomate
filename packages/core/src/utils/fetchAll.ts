/**
 * Supabase(PostgREST) 조회를 한도 없이 끝까지 읽는 도우미.
 *
 * PostgREST는 한 요청에 서버 최대 행 수(Max rows)까지만 돌려주고 나머지는 말없이 버린다.
 * 조직 데이터가 그 한도를 넘으면 목록·집계·매칭이 조용히 틀어지므로, 테이블 전체나
 * 개수가 정해지지 않은 결과를 읽을 때는 이 도우미를 쓴다.
 *
 * 페이지 순서가 흔들리지 않도록 호출하는 쪽에서 `.order('id')`처럼 고유한 정렬을 꼭 건다.
 */

/** 한 번에 요청하는 행 수. 서버 최대 행 수보다 작거나 같아야 한다. */
export const FETCH_PAGE_SIZE = 1000;
/** `.in(col, ids)`에 한 번에 넣는 id 수. uuid 200개 ≈ URL 8KB로 프록시 한도 안쪽. */
export const IN_CHUNK_SIZE = 200;
/** 무한 루프 방지 상한 (1000행 × 500페이지 = 50만 행) */
export const MAX_FETCH_PAGES = 500;

export interface PageResult<T> {
	data: T[] | null;
	error: unknown;
}

export interface FetchAllResult<T> {
	data: T[];
	/** 첫 에러. 에러가 나면 data는 빈 배열 (부분 결과를 정답처럼 쓰지 않도록) */
	error: unknown | null;
	/** 페이지 상한에 걸려 멈췄는지 */
	truncated: boolean;
}

/**
 * 페이지 단위로 끝까지 읽는다.
 *
 * 서버 한도가 페이지 크기보다 작아도 빠지지 않도록, 받은 개수만큼 전진하고
 * 빈 페이지가 올 때까지 읽는다. 읽는 도중 행이 추가되어 경계 행이 두 번 오면
 * `id`가 있는 행은 한 번만 담는다.
 *
 * @example
 * const { data, error } = await fetchAllPages((from, to) =>
 *   supabase.from('students').select('id, name').order('id').range(from, to));
 */
export async function fetchAllPages<T>(
	fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
	pageSize: number = FETCH_PAGE_SIZE,
): Promise<FetchAllResult<T>> {
	const all: T[] = [];
	const seen = new Set<unknown>();
	let from = 0;

	for (let page = 0; page < MAX_FETCH_PAGES; page++) {
		const { data, error } = await fetchPage(from, from + pageSize - 1);
		if (error) return { data: [], error, truncated: false };

		const rows = data ?? [];
		if (rows.length === 0) return { data: all, error: null, truncated: false };

		for (const row of rows) {
			const id = (row as { id?: unknown } | null)?.id;
			if (id === undefined) {
				all.push(row);
			} else if (!seen.has(id)) {
				seen.add(id);
				all.push(row);
			}
		}
		from += rows.length;
	}

	return { data: all, error: null, truncated: true };
}

/**
 * 긴 id 목록을 나눠 `.in()` 조회하고 결과를 합친다. 각 묶음도 페이지 단위로 끝까지 읽는다.
 *
 * @example
 * const { data } = await fetchAllByIds(enrollmentIds, (chunk, from, to) =>
 *   supabase.from('payment_records').select('id, enrollment_id, amount')
 *     .in('enrollment_id', chunk).order('id').range(from, to));
 */
export async function fetchAllByIds<T>(
	ids: readonly string[],
	fetchPage: (chunk: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
	chunkSize: number = IN_CHUNK_SIZE,
): Promise<FetchAllResult<T>> {
	const unique = Array.from(new Set(ids));
	const all: T[] = [];
	let truncated = false;

	for (let i = 0; i < unique.length; i += chunkSize) {
		const chunk = unique.slice(i, i + chunkSize);
		const res = await fetchAllPages<T>((from, to) => fetchPage(chunk, from, to));
		if (res.error) return { data: [], error: res.error, truncated: false };
		all.push(...res.data);
		truncated = truncated || res.truncated;
	}

	return { data: all, error: null, truncated };
}

/** fetchAll 결과의 error(unknown)를 사람이 읽을 메시지로 */
export function errorMessage(error: unknown): string {
	if (error && typeof error === 'object' && 'message' in error) {
		return String((error as { message: unknown }).message);
	}
	return String(error);
}
