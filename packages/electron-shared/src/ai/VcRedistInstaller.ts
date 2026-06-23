/**
 * Visual C++ 2015-2022 재배포 패키지 자동 체크/설치 (Windows 전용).
 *
 * 배경: llama-server.exe는 MSVCP140.dll / VCRUNTIME140.dll에 의존한다.
 * VC++ Redist가 없는 Windows(특히 새 설치본·VM)에서는 엔진을 띄우자마자
 * 0xC0000005(ACCESS_VIOLATION)로 즉사하며 stderr에 아무것도 못 남긴다.
 *
 * 동작:
 * - 레지스트리(HKLM\...\VC\Runtimes\x64\Installed=1)로 설치 확인
 * - 미설치 시 vc_redist.x64.exe 다운로드 → PowerShell `Start-Process -Verb RunAs`로
 *   /passive 설치 실행. UAC 프롬프트는 Windows 권한 모델상 우회 불가(1회 떠야 함).
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const VC_REDIST_URL = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
const REG_KEY = 'HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64';

export type VcRedistEvent =
  | { type: 'vcredist-check' }
  | { type: 'vcredist-progress'; received: number; total: number }
  | { type: 'vcredist-installing' }
  | { type: 'vcredist-done'; alreadyInstalled: boolean }
  | { type: 'vcredist-skipped'; reason: string }
  | { type: 'vcredist-error'; message: string };

/**
 * Windows 외 플랫폼이거나 VC++ 2015-2022 x64가 이미 깔려있으면 true.
 * 레지스트리 키가 없을 때만 fallback으로 DLL 존재 확인.
 */
export function isVcRedistInstalled(): boolean {
  if (process.platform !== 'win32') return true;
  try {
    const out = execSync(`reg query "${REG_KEY}" /v Installed`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (/Installed\s+REG_DWORD\s+0x1/i.test(out)) return true;
  } catch {
    /* 키 없음 → fallback */
  }
  const sysRoot = process.env.SystemRoot ?? 'C:\\Windows';
  return (
    fs.existsSync(path.join(sysRoot, 'System32', 'msvcp140.dll')) &&
    fs.existsSync(path.join(sysRoot, 'System32', 'vcruntime140.dll'))
  );
}

/**
 * VC++ Redist 설치 보장. 이미 깔려있으면 즉시 done 이벤트만 발사.
 * 미설치 시: 다운로드(진행률) → UAC 프롬프트 → /passive 설치 → 결과 보고.
 *
 * tmpRoot: 다운로드 임시 디렉토리를 만들 부모 경로 (보통 app.getPath('userData')).
 */
export async function ensureVcRedist(
  tmpRoot: string,
  onEvent: (e: VcRedistEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (process.platform !== 'win32') {
    onEvent({ type: 'vcredist-skipped', reason: 'non-windows' });
    return;
  }
  onEvent({ type: 'vcredist-check' });
  if (isVcRedistInstalled()) {
    onEvent({ type: 'vcredist-done', alreadyInstalled: true });
    return;
  }

  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(tmpRoot, 'vcredist-'));
  const exePath = path.join(tmpDir, 'vc_redist.x64.exe');
  try {
    const res = await fetch(VC_REDIST_URL, { signal, redirect: 'follow' });
    if (!res.ok) {
      throw new Error(
        'AI 엔진 실행에 필요한 윈도우 구성 요소를 받는 중 문제가 생겼어요. ' +
          '인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.',
      );
    }
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body) {
      throw new Error(
        'AI 엔진 실행에 필요한 윈도우 구성 요소를 받지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
    }
    let received = 0;
    const stream = Readable.fromWeb(res.body as never);
    stream.on('data', (chunk: Buffer) => {
      received += chunk.length;
      onEvent({ type: 'vcredist-progress', received, total });
    });
    await pipeline(stream, fs.createWriteStream(exePath));

    onEvent({ type: 'vcredist-installing' });
    const code = await runWithUac(exePath);

    // exit code 의미:
    //   0    = 성공
    //   1638 = 이미 동일 이상 버전 설치됨 (성공으로 처리)
    //   3010 = 성공, 재부팅 필요 (앱 재시작만으로 일반적으로 충분)
    //   1602 / 1223 = 사용자 취소(UAC 거부)
    if (code === 0 || code === 1638 || code === 3010) {
      onEvent({ type: 'vcredist-done', alreadyInstalled: code === 1638 });
      return;
    }
    if (code === 1602 || code === 1223) {
      throw new Error(
        'AI 엔진 준비가 중단됐어요. 권한 요청 창에서 "예"를 눌러야 AI를 사용할 수 있어요. ' +
          '다시 시도해 주세요.',
      );
    }
    // 사용자에게 코드값을 그대로 노출하지 않는다 — 로그(콘솔)에만 남기고 안내는 평이하게.
    console.error(`[VcRedistInstaller] 설치 실패 exit code: ${code}`);
    throw new Error(
      'AI 엔진 준비에 실패했어요. PC를 다시 켠 다음 한 번 더 시도해 주세요. ' +
        '계속 안 되면 고객센터에 문의해 주세요.',
    );
  } catch (e: any) {
    onEvent({ type: 'vcredist-error', message: e?.message ?? String(e) });
    throw e;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

/**
 * UAC 프롬프트를 띄워 관리자 권한으로 인스톨러 실행 후 exit code 반환.
 * PowerShell의 Start-Process -Verb RunAs를 사용 (Windows 표준).
 */
function runWithUac(exePath: string): Promise<number> {
  // PowerShell single-quoted string escape — '를 ''로 변환
  const escaped = exePath.replace(/'/g, "''");
  const psCmd =
    `$p = Start-Process -FilePath '${escaped}' ` +
    `-ArgumentList '/install','/passive','/norestart' ` +
    `-Verb RunAs -Wait -PassThru; ` +
    `Write-Output $p.ExitCode`;
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-Command', psCmd], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    ps.stdout.on('data', (d) => (stdout += d.toString()));
    ps.stderr.on('data', (d) => (stderr += d.toString()));
    ps.on('error', reject);
    ps.on('exit', (c) => {
      const parsed = parseInt(stdout.trim(), 10);
      if (Number.isFinite(parsed)) return resolve(parsed);
      // ExitCode를 못 읽었는데 powershell 자체가 0이 아니면 UAC 거부일 가능성 높다.
      // 사용자 친화적 메시지로 변환 — 기술적 코드/stderr는 콘솔에만.
      if (c !== 0) {
        console.error(
          `[VcRedistInstaller] PowerShell exit ${c}: ${stderr.trim().slice(0, 500)}`,
        );
        return reject(
          new Error(
            'AI 엔진 준비가 중단됐어요. 권한 요청 창에서 "예"를 눌러야 AI를 사용할 수 있어요. ' +
              '다시 시도해 주세요.',
          ),
        );
      }
      resolve(-1);
    });
  });
}
