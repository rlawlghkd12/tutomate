import { useEffect, useState } from 'react';
import { HardwareDiagnosticView } from './HardwareDiagnosticView';

interface Props {
  onInstalled: () => void;
  onSkip: () => void;
}

export function ModelDownloadModal({ onInstalled, onSkip }: Props) {
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    return window.electronAPI.onAiDownloadEvent((e: any) => {
      if (e.type === 'progress') {
        setProgress({ received: e.received, total: e.total });
      } else if (e.type === 'error') {
        setError(e.message);
        setDownloading(false);
      } else if (e.type === 'done') {
        onInstalled();
      }
    });
  }, [onInstalled]);

  const pct = progress
    ? Math.round((progress.received / progress.total) * 100)
    : 0;

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">AI 어시스턴트 준비</h1>
      <p className="text-lg">
        AI 모델 약 2.7GB를 한 번 다운로드하면 인터넷 없이 사용할 수 있어요.
      </p>
      <HardwareDiagnosticView />

      {progress && (
        <div>
          <div className="bg-gray-200 rounded-full h-3">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-base">
            {pct}% ({(progress.received / 1e9).toFixed(2)}GB)
          </div>
        </div>
      )}
      {error && <div className="text-red-700 text-base">{error}</div>}

      <div className="flex gap-3">
        <button
          onClick={() => {
            setError(null);
            setDownloading(true);
            window.electronAPI.aiDownload();
          }}
          disabled={downloading}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl text-lg disabled:opacity-50"
        >
          {downloading ? '다운로드 중…' : '지금 받기'}
        </button>
        <button
          onClick={onSkip}
          disabled={downloading}
          className="bg-secondary text-secondary-foreground border border-border px-6 py-3 rounded-xl text-lg disabled:opacity-50 hover:bg-accent"
        >
          나중에
        </button>
      </div>
    </div>
  );
}
