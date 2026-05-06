import type { SmartCard } from '@tutomate/core';

type Props = Extract<SmartCard, { type: 'mappingError' }>;

export function MappingErrorCard({ matched, unmatched }: Props) {
  return (
    <div className="border-2 border-amber-300 bg-amber-50 rounded-2xl p-4">
      <div className="font-bold text-lg mb-2">엑셀 컬럼 일부를 인식하지 못했어요</div>
      <div className="text-base mb-1">
        ✓ 인식: {matched.length > 0 ? matched.join(', ') : '(없음)'}
      </div>
      <div className="text-base text-red-700 mb-3">
        ✗ 인식 안 됨: {unmatched.join(', ')}
      </div>
      <a
        href="/templates/tutomate-import-template.xlsx"
        download
        className="inline-block bg-amber-600 text-white px-5 py-2 rounded-xl text-base"
      >
        표준 양식 다운로드
      </a>
    </div>
  );
}
