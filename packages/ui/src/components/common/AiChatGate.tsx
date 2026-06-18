import { Navigate } from 'react-router-dom';
import { isAiChatEnabled, useAuthStore } from '@tutomate/core';

/** AI 어시스턴트 라우트 — 허용 조직이 아니면 조용히 대시보드로 이동 */
export function AiChatGate({ children }: { children: React.ReactNode }) {
  const organizationId = useAuthStore((s) => s.organizationId);
  if (!isAiChatEnabled(organizationId)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
