import type { SmartCard } from '@tutomate/core';
import { Check, X } from 'lucide-react';

type Props = Extract<SmartCard, { type: 'mappingError' }>;

export function MappingErrorCard({ matched, unmatched }: Props) {
  return (
    <div className="border-2 border-amber-500/40 bg-amber-500/10 rounded-2xl p-4 text-foreground">
      <div className="font-bold text-lg mb-2">엑셀 컬럼 일부를 인식하지 못했어요</div>
      <div className="text-base mb-1 flex items-center gap-1.5">
        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
        인식: {matched.length > 0 ? matched.join(', ') : '(없음)'}
      </div>
      <div className="text-base text-destructive mb-3 flex items-center gap-1.5">
        <X className="h-4 w-4 shrink-0" />
        인식 안 됨: {unmatched.join(', ')}
      </div>
      <a
        href="/templates/tutomate-import-template.xlsx"
        download
        className="inline-block bg-amber-500 text-amber-50 px-5 py-2 rounded-xl text-base hover:bg-amber-600"
      >
        표준 양식 다운로드
      </a>
    </div>
  );
}
