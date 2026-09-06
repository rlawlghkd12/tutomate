import type { SmartCard } from '@tutomate/core';

type Props = Extract<SmartCard, { type: 'importResult' }>;

export function ImportResultCard({ added, duplicated, errors, unmatched }: Props) {
  return (
    <div className="border-2 border-emerald-500/40 bg-emerald-500/10 rounded-2xl p-4 text-foreground">
      <div className="font-bold text-lg mb-1">완료</div>
      <div className="text-base text-muted-foreground">
        추가: <span className="text-foreground font-semibold">{added}</span>건 ·
        중복 제외: <span className="text-foreground font-semibold">{duplicated}</span>건
        {typeof unmatched === 'number' && unmatched > 0 && (
          <>
            {' '}· 미매칭: <span className="text-foreground font-semibold">{unmatched}</span>건
          </>
        )}{' '}
        · 오류: <span className="text-foreground font-semibold">{errors}</span>건
      </div>
    </div>
  );
}
