import { useEffect, useState } from 'react';

interface Diagnostic {
  ramGB: number;
  diskGB: number;
  recommendation: 'ok' | 'warn' | 'block';
  tier: 'fast' | 'slow' | 'unsupported';
}

export function HardwareDiagnosticView() {
  const [d, setD] = useState<Diagnostic | null>(null);

  useEffect(() => {
    window.electronAPI.aiDiagnose().then(setD);
  }, []);

  if (!d) return <div className="text-base">진단 중…</div>;

  const msg =
    d.recommendation === 'ok' && d.tier === 'fast'
      ? '쾌적하게 사용 가능합니다.'
      : d.recommendation === 'ok' && d.tier === 'slow'
        ? '응답이 10~20초 걸릴 수 있어요.'
        : d.recommendation === 'warn'
          ? '성능이 낮거나 매우 느릴 수 있습니다.'
          : 'AI 챗봇을 사용할 수 없는 사양입니다. 직접 임포트만 가능합니다.';

  return (
    <div className="p-4 bg-muted rounded-xl text-foreground">
      <div className="text-base">
        RAM: {d.ramGB}GB · 디스크 여유: {d.diskGB}GB
      </div>
      <div className="text-base mt-1 text-muted-foreground">{msg}</div>
    </div>
  );
}
