import type React from 'react';
import { Calendar } from 'lucide-react';
import { getQuarterLabel } from '@tutomate/core';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

export const EXPORT_SCOPE_ALL = 'all';

interface ExportQuarterScopeProps {
  /** 선택된 범위: 'all'(전체 분기) 또는 "2026-Q2" 형식의 분기 */
  value: string;
  onChange: (value: string) => void;
  /**
   * 드롭다운 모드용 분기 옵션. 전달하면 분기를 직접 고르는 셀렉트로 렌더되고,
   * 생략하면 currentQuarter 기준 "이번 분기 / 전체 분기" 토글로 렌더된다.
   */
  quarters?: { value: string; label: string }[];
  /** 토글 모드에서 "이번 분기" 버튼이 가리킬 분기 (드롭다운 모드면 무시) */
  currentQuarter?: string;
  /** 안내 문구에 쓸 대상 명칭. 수익/정산 화면에서는 "수익 정보" 등으로 바꾼다. */
  noun?: string;
}

/**
 * 내보내기 모달에서 어느 분기를 내보낼지 고르는 컨트롤.
 * 시니어 사용자 기준으로 글씨를 크게, 안내 문구를 명확히 둔다.
 */
export const ExportQuarterScope: React.FC<ExportQuarterScopeProps> = ({
  value,
  onChange,
  quarters,
  currentQuarter,
  noun = '수강 정보',
}) => {
  const isAll = value === EXPORT_SCOPE_ALL;

  return (
    <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Calendar className="h-4 w-4 text-primary" />
        내보낼 분기
      </div>

      {quarters ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-10 w-full text-base">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EXPORT_SCOPE_ALL} className="text-base">
              전체 분기 (모든 기간)
            </SelectItem>
            {quarters.map((q) => (
              <SelectItem key={q.value} value={q.value} className="text-base tabular-nums">
                {q.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="inline-flex w-full gap-1 rounded-md border border-border bg-background p-0.5">
          <button
            type="button"
            onClick={() => currentQuarter && onChange(currentQuarter)}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              !isAll ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {currentQuarter ? getQuarterLabel(currentQuarter) : '이번 분기'}
          </button>
          <button
            type="button"
            onClick={() => onChange(EXPORT_SCOPE_ALL)}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              isAll ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            전체 분기
          </button>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        {isAll
          ? `모든 기간의 ${noun}를 내보냅니다.`
          : `${getQuarterLabel(quarters ? value : currentQuarter ?? value)} ${noun}만 내보냅니다.`}
      </p>
    </div>
  );
};

export default ExportQuarterScope;
