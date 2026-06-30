import { PlanTypeEnum } from '../config/planLimits';
import type { PlanType } from '../config/planLimits';

/** AI 어시스턴트 노출: 계정 플랜이 admin일 때만 */
export function isAiChatEnabled(plan: PlanType | string | null | undefined): boolean {
  return plan === PlanTypeEnum.ADMIN;
}
