import type { ChatMessage, SmartCard } from '@tutomate/core';
import { Check, Loader2 } from 'lucide-react';
import { MappingErrorCard } from './SmartCard/MappingErrorCard';
import { ImportPreviewCard } from './SmartCard/ImportPreviewCard';
import { ImportResultCard } from './SmartCard/ImportResultCard';
import { SourceLinkCard } from './SmartCard/SourceLinkCard';
import { Markdown } from './Markdown';

export type ToolActivity = { name: string; status: 'running' | 'done' };

export type DisplayMessage = ChatMessage & {
  cards?: SmartCard[];
  tools?: ToolActivity[];
};

// 도구 이름 → 사용자에게 보일 한글 라벨 (AI가 무슨 작업을 하는지 직관적으로)
const TOOL_LABELS: Record<string, string> = {
  getMonthlySummary: '월별 수익 조회',
  getOrgStats: '전체 통계 조회',
  getClassRoster: '수강생 명단 조회',
  getEnrollment: '수강 등록 조회',
  getPaymentHistory: '결제 내역 조회',
  getStudent: '학생 정보 조회',
  getStudentSummary: '학생 요약 조회',
  getUnpaidStudents: '미납자 조회',
  listClasses: '강좌 목록 조회',
  searchStudent: '학생 검색',
  parseExcelHeaders: '엑셀 항목 읽기',
  mapColumns: '엑셀 항목 매칭',
  previewImport: '가져오기 미리보기',
  confirmImport: '가져오기 확정',
};

const toolLabel = (name: string) => TOOL_LABELS[name] ?? name;

interface Props {
  message: DisplayMessage;
  onConfirmPreview: (card: Extract<SmartCard, { type: 'importPreview' }>) => void;
  onCancelPreview: () => void;
}

function renderCard(
  c: SmartCard,
  onConfirm: Props['onConfirmPreview'],
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
    case 'sourceLink':
      return <SourceLinkCard {...c} />;
  }
}

export function MessageBubble({ message, onConfirmPreview, onCancelPreview }: Props) {
  const isUser = message.role === 'user';
  return (
    <div className={`max-w-2xl ${isUser ? 'ml-auto' : ''}`}>
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
                {t.status === 'running' ? ' 중…' : ' 완료'}
              </span>
            </div>
          ))}
        </div>
      )}
      {message.content && (
        <div
          className={`rounded-2xl px-5 py-3 text-lg ${
            isUser
              ? 'whitespace-pre-wrap bg-primary text-primary-foreground'
              : 'bg-muted text-foreground'
          }`}
        >
          {isUser ? message.content : <Markdown>{message.content}</Markdown>}
        </div>
      )}
      {message.attachments?.map((a, i) => (
        <div key={i} className="text-sm text-muted-foreground mt-1">
          📎 {a.name}
        </div>
      ))}
      {message.cards?.map((c, i) => (
        <div key={i} className="mt-2">
          {renderCard(c, onConfirmPreview, onCancelPreview)}
        </div>
      ))}
    </div>
  );
}
