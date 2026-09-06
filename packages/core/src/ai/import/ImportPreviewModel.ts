import type { DedupLevel } from '../dedup/DedupChecker';
import type { PrefilterCandidate } from '../matching/prefilter';

/**
 * 미리보기 행 통합 모델 — 파싱·매칭·중복 결과를 UI로 넘기는 단일 형태. 참고: DEV §6.
 * 은행/일반 흐름이 같은 모델을 쓰고, confirm은 included=true 행만 저장한다.
 */
export type RowDecision = 'include' | 'excluded' | 'needsConfirm';

/** 매칭 분류(프리뷰용 축약). needsEnrollment/split/refund 등 은행 전용 상태는 별도. */
export type PreviewMatchStatus = 'auto' | 'needsConfirm' | 'unmatched';

export interface ImportPreviewRow {
  rowIndex: number;
  payerName: string;
  amount: number;
  paidAt: string;
  memo?: string;

  /** 파일에 있던 결제수단(cash/card/transfer). 저장 시 사용, 없으면 cash */
  paymentMethod?: string;

  matchStatus: PreviewMatchStatus;
  enrollmentId?: string;
  studentName?: string;
  courseName?: string;
  /** 매칭된 수강 분기 "YYYY-QN" — 선납 등 기간 매칭 결과를 UI가 표시 */
  quarter?: string;
  /** 확인 필요 시 사용자에게 제시할 후보들 */
  candidates: PrefilterCandidate[];

  /** 중복 판정 결과 (none이면 중복 아님) */
  dedup: DedupLevel;

  /** 기본 처리 결정 (사용자가 토글 가능) */
  decision: RowDecision;
  /** 배지·툴팁용 한국어 사유(상세 문장) */
  reason: string;
  /** UI 칩용 짧은 태그 (예: '전화 일치', '같은 이름 2명', '지난 분기'). 한눈에 스캔용. */
  tags: string[];

  /** 사용자 최종 선택(기본값 = decision==='include'). confirm은 이 값으로 저장 여부 결정 */
  included: boolean;
}
