import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolDefinition, ToolHandler } from './types';

// 각 도구는 다른 zod 스키마를 가지므로 ToolHandler<any> 컬렉션으로 처리
type AnyTool = ToolHandler<any>;

import { searchStudent } from './tools/searchStudent';
import { getStudent } from './tools/getStudent';
import { getPaymentHistory } from './tools/getPaymentHistory';
import { getUnpaidStudents } from './tools/getUnpaidStudents';
import { getAttendance } from './tools/getAttendance';
import { getEnrollment } from './tools/getEnrollment';
import { listClasses } from './tools/listClasses';
import { getClassRoster } from './tools/getClassRoster';
import { getMonthlySummary } from './tools/getMonthlySummary';
import { getStudentSummary } from './tools/getStudentSummary';
import { getOrgStats } from './tools/getOrgStats';
import { parseExcelHeaders } from './tools/parseExcelHeaders';
import { mapColumns } from './tools/mapColumns';
import { previewImport } from './tools/previewImport';
import { confirmImport } from './tools/confirmImport';

/** 챗봇이 호출 가능한 모든 도구 (조회 10 + 임포트 4 = 14개). */
export const ALL_TOOLS: AnyTool[] = [
  searchStudent,
  getStudent,
  getPaymentHistory,
  getUnpaidStudents,
  getAttendance,
  getEnrollment,
  listClasses,
  getClassRoster,
  getMonthlySummary,
  getStudentSummary,
  getOrgStats,
  parseExcelHeaders,
  mapColumns,
  previewImport,
  confirmImport,
];

/** ToolHandler[] → LLM이 이해하는 ToolDefinition[] (zod → JSONSchema 변환). */
export function toToolDefinitions(tools: AnyTool[]): ToolDefinition[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: zodToJsonSchema(t.schema, { target: 'jsonSchema7' }),
  }));
}
