import type { SmartCard } from '@tutomate/core';

type Props = Extract<SmartCard, { type: 'importResult' }>;

export function ImportResultCard({ added, duplicated, errors }: Props) {
  return (
    <div className="border-2 border-green-300 bg-green-50 rounded-2xl p-4">
      <div className="font-bold text-lg mb-1">완료</div>
      <div className="text-base">
        추가: {added}건 / 중복·누락: {duplicated}건 / 오류: {errors}건
      </div>
    </div>
  );
}
