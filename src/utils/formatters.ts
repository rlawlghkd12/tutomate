/**
 * 전화번호 자동 포맷
 * 01012345678 → 010-1234-5678
 */
export function formatPhone(raw: string): string {
	const digits = raw.replace(/[^0-9]/g, "");
	if (digits.length <= 3) return digits;
	if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
	if (digits.length <= 11)
		return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
	return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

/**
 * 생년월일 6자리 → YYYY-MM-DD
 * 630201 → 1963-02-01
 * 250315 → 2025-03-15 (≤30은 2000년대)
 */
export function parseBirthDate(value: string): string | undefined {
	if (!value) return undefined;
	const digits = value.replace(/[^0-9]/g, "");
	if (digits.length !== 6) return undefined;

	const yy = parseInt(digits.slice(0, 2), 10);
	const mm = digits.slice(2, 4);
	const dd = digits.slice(4, 6);
	const year = yy >= 0 && yy <= 30 ? 2000 + yy : 1900 + yy;

	return `${year}-${mm}-${dd}`;
}
// trigger
// trigger
