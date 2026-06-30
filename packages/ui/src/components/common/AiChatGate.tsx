import { Navigate } from 'react-router-dom';
import { isAiChatEnabled, useAuthStore } from '@tutomate/core';

/** AI 어시스턴트 라우트 — admin 플랜이 아니면 조용히 대시보드로 이동 */
export function AiChatGate({ children }: { children: React.ReactNode }) {
  const plan = useAuthStore((s) => s.plan);
  if (!isAiChatEnabled(plan)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
