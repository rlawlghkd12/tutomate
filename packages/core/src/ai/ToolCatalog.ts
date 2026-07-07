import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolDefinition, ToolHandler } from './types';

// 각 도구는 다른 zod 스키마를 가지므로 ToolHandler<any> 컬렉션으로 처리
type AnyTool = ToolHandler<any>;

import { searchStudent } from './tools/searchStudent';
import { countStudents } from './tools/countStudents';
import { getStudent } from './tools/getStudent';
import { getPaymentHistory } from './tools/getPaymentHistory';
import { getCoursePayments } from './tools/getCoursePayments';
import { getUnpaidStudents } from './tools/getUnpaidStudents';
import { getEnrollment } from './tools/getEnrollment';
import { listClasses } from './tools/listClasses';
import { getClassRoster } from './tools/getClassRoster';
import { getMonthlySummary } from './tools/getMonthlySummary';
import { getRevenue } from './tools/getRevenue';
import { getStudentSummary } from './tools/getStudentSummary';
import { getOrgStats } from './tools/getOrgStats';
import { parseExcelHeaders } from './tools/parseExcelHeaders';
import { mapColumns } from './tools/mapColumns';
import { previewImport } from './tools/previewImport';
import { confirmImport } from './tools/confirmImport';
import { analyzeBankDeposits } from './tools/analyzeBankDeposits';
import { confirmBankDeposits } from './tools/confirmBankDeposits';

/** 챗봇이 호출 가능한 모든 도구 (조회 12 + 임포트 4 + 은행입금 2 = 18개). */
export const ALL_TOOLS: AnyTool[] = [
  searchStudent,
  countStudents,
  getStudent,
  getPaymentHistory,
  getCoursePayments,
  getUnpaidStudents,
  getEnrollment,
  listClasses,
  getClassRoster,
  getMonthlySummary,
  getRevenue,
  getStudentSummary,
  getOrgStats,
  parseExcelHeaders,
  mapColumns,
  previewImport,
  confirmImport,
  analyzeBankDeposits,
  confirmBankDeposits,
];

/**
 * JSONSchema 압축 — 토큰 절약:
 * - $schema URL 제거 (수십 토큰)
 * - additionalProperties:false 제거 (큰 의미 없음)
 * - default 값은 유지 (LLM이 알아야 함)
 */
function compressSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(compressSchema);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === '$schema') continue;
    if (k === 'additionalProperties' && v === false) continue;
    out[k] = compressSchema(v);
  }
  return out;
}

/** ToolHandler[] → LLM이 이해하는 ToolDefinition[] (zod → JSONSchema 변환 + 압축). */
export function toToolDefinitions(tools: AnyTool[]): ToolDefinition[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: compressSchema(zodToJsonSchema(t.schema, { target: 'jsonSchema7' })) as object,
  }));
}
