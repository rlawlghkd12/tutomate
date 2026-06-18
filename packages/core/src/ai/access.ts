/** AI 어시스턴트 노출 대상 조직 (내부 관리용) */
const AI_ENABLED_ORG_IDS = new Set([
  '85a37f47-7c4e-4c70-842d-379fd184d8a5',
  'c41c7046-5698-4a46-a407-f638d3301b5e',
]);

export function isAiChatEnabled(organizationId: string | null | undefined): boolean {
  return !!organizationId && AI_ENABLED_ORG_IDS.has(organizationId);
}
