/**
 * 테스트용: supabase.from(t).select() mock의 반환값을 페이지 조회 체인
 * (`.order().range()`)에서도 쓸 수 있게 감싼다.
 *
 * 첫 페이지(range 시작 0)는 원래 반환값을, 이후 페이지는 빈 결과를 돌려준다.
 * select 반환값의 다른 메서드(eq 등)는 그대로 유지된다.
 */
export function withPaging<T extends object>(result: T) {
	const empty = { data: [], error: null };
	return Object.assign(Object.create(Object.getPrototypeOf(result) ?? null), result, {
		order: () => ({
			range: (from: number) => Promise.resolve(from === 0 ? result : empty),
		}),
	});
}
