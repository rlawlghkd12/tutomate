// 엑셀 임포트에 사용되는 표준 필드 정의 + 파싱/정규화 결과 타입

export type StandardField =
  | 'name' | 'phone' | 'parentPhone' | 'birthDate'
  | 'enrollmentDate' | 'paymentDate' | 'amount'
  | 'paymentMethod' | 'note' | 'className' | 'tuitionPlan';

export const STANDARD_FIELDS: StandardField[] = [
  'name', 'phone', 'parentPhone', 'birthDate',
  'enrollmentDate', 'paymentDate', 'amount',
  'paymentMethod', 'note', 'className', 'tuitionPlan',
];

export interface ParsedExcel {
  headers: string[];
  rows: Record<string, unknown>[];
}

export interface NormalizationError {
  field: StandardField;
  rawValue: unknown;
  message: string;
}

export interface NormalizedRow {
  data: Partial<Record<StandardField, string | number>>;
  errors: NormalizationError[];
}
