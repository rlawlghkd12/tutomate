import type { ChatMessage, SmartCard, DepositSelection } from '@tutomate/core';
import { useEffect, useState } from 'react';
import { Check, Loader2, Paperclip } from 'lucide-react';
import { MappingErrorCard } from './SmartCard/MappingErrorCard';
import { ImportPreviewCard } from './SmartCard/ImportPreviewCard';
import { ImportResultCard } from './SmartCard/ImportResultCard';
import { SourceLinkCard } from './SmartCard/SourceLinkCard';
import { BankDepositPreviewCard } from './SmartCard/BankDepositPreviewCard';
import { BankDepositResultCard } from './SmartCard/BankDepositResultCard';
import { Markdown } from './Markdown';

export type ToolActivity = { name: string; status: 'running' | 'done' };

export type DisplayMessage = ChatMessage & {
  cards?: SmartCard[];
  tools?: ToolActivity[];
};

// 도구 이름 → 사용자에게 보일 한글 라벨 (AI가 무슨 작업을 하는지 직관적으로)
const TOOL_LABELS: Record<string, string> = {
  getMonthlySummary: '월별 결제 현황 조회',
  getRevenue: '매출 조회',
  getOrgStats: '전체 통계 조회',
  getClassRoster: '수강생 명단 조회',
  getEnrollment: '수강 등록 조회',
  getPaymentHistory: '결제 내역 조회',
  getCoursePayments: '강좌 결제 내역 조회',
  getStudent: '학생 정보 조회',
  getStudentSummary: '학생 요약 조회',
  getUnpaidStudents: '미납자 조회',
  listClasses: '강좌 목록 조회',
  searchStudent: '학생 검색',
  parseExcelHeaders: '엑셀 항목 읽기',
  mapColumns: '엑셀 항목 매칭',
  previewImport: '가져오기 미리보기',
  confirmImport: '가져오기 확정',
  analyzeBankDeposits: '은행 입금내역 분석',
  confirmBankDeposits: '입금 저장',
};

const toolLabel = (name: string) => TOOL_LABELS[name] ?? name;

// 진행 중 표시: . → .. → … 반복 애니메이션
function LoadingDots() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((v) => (v + 1) % 3), 450);
    return () => clearInterval(id);
  }, []);
  // 폭 고정으로 글자 흔들림 방지
  return <span className="inline-block w-[1.5em] text-left">{'.'.repeat(n + 1)}</span>;
}

interface Props {
  message: DisplayMessage;
  onConfirmPreview: (card: Extract<SmartCard, { type: 'importPreview' }>) => void;
  onConfirmBankDeposits: (
    card: Extract<SmartCard, { type: 'bankDepositPreview' }>,
    selections: DepositSelection[],
  ) => void;
  onCancelPreview: () => void;
}

function renderCard(
  c: SmartCard,
  onConfirm: Props['onConfirmPreview'],
  onConfirmBank: Props['onConfirmBankDeposits'],
  onCancel: Props['onCancelPreview'],
) {
  switch (c.type) {
    case 'mappingError':
      return <MappingErrorCard {...c} />;
    case 'importPreview':
      return (
        <ImportPreviewCard
          {...c}
          onConfirm={() => onConfirm(c)}
          onCancel={onCancel}
        />
      );
    case 'importResult':
      return <ImportResultCard {...c} />;
    case 'bankDepositPreview':
      return (
        <BankDepositPreviewCard
          {...c}
          onConfirm={(selections) => onConfirmBank(c, selections)}
          onCancel={onCancel}
        />
      );
    case 'bankDepositResult':
      return <BankDepositResultCard {...c} />;
    case 'sourceLink':
      return <SourceLinkCard {...c} />;
  }
}

export function MessageBubble({
  message,
  onConfirmPreview,
  onConfirmBankDeposits,
  onCancelPreview,
}: Props) {
  const isUser = message.role === 'user';
  return (
    <div className={`max-w-2xl w-fit ${isUser ? 'ml-auto' : ''}`}>
      {!isUser && message.tools && message.tools.length > 0 && (
        <div className="mb-1.5 flex flex-col gap-1">
          {message.tools.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-base text-muted-foreground">
              {t.status === 'running' ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Check className="h-4 w-4 shrink-0 text-green-600" />
              )}
              <span>
                {toolLabel(t.name)}
                {t.status === 'running' ? (
                  <>
                    {' 중'}
                    <LoadingDots />
                  </>
                ) : (
                  ' 완료'
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {message.content && (
        <div
          className={`rounded-2xl px-5 py-3 ${
            isUser
              ? 'whitespace-pre-wrap bg-primary text-primary-foreground'
              : 'text-lg bg-muted text-foreground'
          }`}
          // 사용자 말풍선은 설정 글자 크기에 따라 커지도록 (기본 대비 1.2배)
          style={isUser ? { fontSize: 'calc(var(--font-size-base-value, 14px) * 1.2)', lineHeight: 1.5 } : undefined}
        >
          {isUser ? message.content : <Markdown>{message.content}</Markdown>}
        </div>
      )}
      {message.attachments?.map((a, i) => (
        <div key={i} className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          {a.name}
        </div>
      ))}
      {message.cards?.map((c, i) => (
        <div key={i} className="mt-2">
          {renderCard(c, onConfirmPreview, onConfirmBankDeposits, onCancelPreview)}
        </div>
      ))}
    </div>
  );
}
