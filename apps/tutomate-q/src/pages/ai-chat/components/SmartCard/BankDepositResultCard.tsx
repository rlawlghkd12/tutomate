import type { SmartCard } from '@tutomate/core';

type Props = Extract<SmartCard, { type: 'bankDepositResult' }>;

export function BankDepositResultCard({ saved, skipped, failed, enrolled }: Props) {
  return (
    <div className="border-2 border-success-subtle bg-success-subtle rounded-2xl p-4 text-foreground">
      <div className="text-lg font-bold text-success">입금 {saved}건 저장 완료</div>
      {!!enrolled && enrolled > 0 && (
        <div className="text-base text-foreground mt-1">{enrolled}명을 강의에 새로 등록했어요.</div>
      )}
      {(skipped > 0 || failed > 0) && (
        <div className="text-base text-muted-foreground mt-1">
          {skipped > 0 && `이미 저장된 ${skipped}건은 건너뛰었어요.`}
          {failed > 0 && ` ${failed}건은 저장에 실패했어요.`}
        </div>
      )}
    </div>
  );
}
