import type { SmartCard } from '@tutomate/core';

type Props = Extract<SmartCard, { type: 'importUndoResult' }>;

export function ImportUndoResultCard({ undone, skipped, blocked, failed }: Props) {
  return (
    <div className="border-2 border-border bg-muted/40 rounded-2xl p-4 text-foreground">
      <div className="font-bold text-lg mb-1">되돌리기 완료</div>
      <div className="text-base text-muted-foreground">
        되돌림: <span className="text-foreground font-semibold">{undone}</span>건
        {skipped > 0 && (
          <> · 이미 취소됨: <span className="text-foreground font-semibold">{skipped}</span>건</>
        )}
        {blocked > 0 && (
          <> · 되돌릴 수 없음: <span className="text-destructive font-semibold">{blocked}</span>건</>
        )}
        {failed > 0 && (
          <> · 실패: <span className="text-destructive font-semibold">{failed}</span>건</>
        )}
      </div>
      {blocked > 0 && (
        <div className="mt-2 text-sm text-muted-foreground">
          환불이 걸린 수강 등은 안전을 위해 되돌리지 않았어요. 필요하면 수동으로 정리해주세요.
        </div>
      )}
    </div>
  );
}
