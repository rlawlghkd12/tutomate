interface Props {
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * 클라우드(OpenRouter) AI 사용 전 개인정보 처리 동의 모달.
 * 클라우드 백엔드일 때만 노출되며, 동의는 기기/사용자 단위로 1회 저장된다(재노출 없음).
 * 문구는 초안 — 실제 배포 전 개인정보/법무 검토 필요.
 */
export function AiCloudConsentModal({ onAccept, onDecline }: Props) {
  return (
    <div className="max-w-xl mx-auto p-6 space-y-5">
      <h1 className="text-2xl font-bold">AI 어시스턴트 개인정보 처리 안내</h1>

      <p className="text-base leading-relaxed">
        더 똑똑한 답변을 위해 AI 어시스턴트는 클라우드 AI 서비스를 이용해 답변을 생성합니다. 시작하기
        전에 아래 내용을 확인하고 동의해 주세요.
      </p>

      <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3 text-base leading-relaxed">
        <div>
          <div className="font-semibold mb-1">무엇이 전송되나요?</div>
          질문 내용과 답변에 필요한 조직 데이터(수강생·수납 정보 등)가 처리됩니다.
        </div>
        <div>
          <div className="font-semibold mb-1">개인정보는 어떻게 보호되나요?</div>
          이름·전화번호 같은 개인정보는 전송 전에 자동으로 <b>가명 토큰</b>으로 치환됩니다. AI 모델은
          토큰만 보고, 화면에는 실제 이름으로 복원해 보여드립니다. 또한 전송된 데이터는 <b>저장·학습에
          사용되지 않도록</b> 무보관(ZDR)·비학습 조건으로 처리됩니다.
        </div>
        <div>
          <div className="font-semibold mb-1">동의하지 않으면?</div>
          클라우드 AI 어시스턴트를 사용할 수 없습니다. 나머지 기능은 그대로 이용할 수 있어요.
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onAccept}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl text-lg hover:bg-blue-700"
        >
          동의하고 시작
        </button>
        <button
          onClick={onDecline}
          className="bg-secondary text-secondary-foreground border border-border px-6 py-3 rounded-xl text-lg hover:bg-accent"
        >
          동의하지 않음
        </button>
      </div>
    </div>
  );
}
