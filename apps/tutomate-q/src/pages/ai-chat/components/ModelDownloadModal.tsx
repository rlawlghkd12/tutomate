import { useEffect, useRef, useState } from 'react';
import { HardwareDiagnosticView } from './HardwareDiagnosticView';

interface Props {
  onInstalled: () => void;
  onSkip: () => void;
}

type Phase = 'idle' | 'engine' | 'model' | 'installing';

const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  engine: 'AI 엔진 받는 중',
  model: 'AI 모델 받는 중 (약 2.9GB)',
  installing: '설치 중',
};

export function ModelDownloadModal({ onInstalled, onSkip }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<string | null>(null);

  useEffect(() => {
    const onEngine = window.electronAPI.onAiEngineDownloadEvent((e: any) => {
      if (e.type === 'progress') setProgress({ received: e.received, total: e.total });
      else if (e.type === 'extracting') { setProgress(null); setPhase('installing'); }
      else if (e.type === 'error') { errorRef.current = e.message; setError(e.message); }
    });
    const onModel = window.electronAPI.onAiDownloadEvent((e: any) => {
      if (e.type === 'progress') setProgress({ received: e.received, total: e.total });
      else if (e.type === 'verifying') { setProgress(null); setPhase('installing'); }
      else if (e.type === 'error') { errorRef.current = e.message; setError(e.message); }
    });
    return () => { onEngine(); onModel(); };
  }, []);

  const start = async () => {
    setError(null);
    errorRef.current = null;
    setBusy(true);
    try {
      const needs = await window.electronAPI.aiNeeds();
      if (!needs.engineInstalled) {
        setPhase('engine');
        setProgress(null);
        await window.electronAPI.aiDownloadEngine();
        if (errorRef.current) return;
      }
      if (!needs.modelInstalled) {
        setPhase('model');
        setProgress(null);
        await window.electronAPI.aiDownload();
        if (errorRef.current) return;
      }
      onInstalled();
    } finally {
      setBusy(false);
    }
  };

  const pct = progress && progress.total ? Math.round((progress.received / progress.total) * 100) : 0;

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">AI 어시스턴트 준비</h1>
      <p className="text-lg">
        AI 엔진과 모델(약 2.9GB)을 한 번 받아두면 인터넷 없이 사용할 수 있어요. 설치 파일에는
        포함돼 있지 않아 처음 한 번만 내려받습니다.
      </p>
      <HardwareDiagnosticView />

      {busy && (
        <div>
          <div className="text-base font-medium mb-1">
            {PHASE_LABEL[phase] || '준비 중'}
            {phase === 'installing' ? '…' : ''}
          </div>
          {progress ? (
            <>
              <div className="bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1 text-base">
                {pct}% ({(progress.received / 1e9).toFixed(2)}GB)
              </div>
            </>
          ) : (
            <div className="text-base text-muted-foreground">잠시만 기다려 주세요…</div>
          )}
        </div>
      )}
      {error && <div className="text-red-700 text-base">{error}</div>}

      <div className="flex gap-3">
        <button
          onClick={start}
          disabled={busy}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl text-lg disabled:opacity-50"
        >
          {busy ? '받는 중…' : error ? '다시 시도' : '지금 받기'}
        </button>
        <button
          onClick={onSkip}
          disabled={busy}
          className="bg-secondary text-secondary-foreground border border-border px-6 py-3 rounded-xl text-lg disabled:opacity-50 hover:bg-accent"
        >
          나중에
        </button>
      </div>
    </div>
  );
}
