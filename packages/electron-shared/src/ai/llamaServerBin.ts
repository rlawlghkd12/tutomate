import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * llama-server 실행 파일 경로 결정.
 *
 * 우선순위:
 * 1. 환경변수 `LLAMA_SERVER_BIN` (개발자 override)
 * 2. `<aiBaseDir>/llama-bin/<platform>/llama-server[.exe]` (다운로드 받은 self-contained 빌드)
 *    aiBaseDir는 getAiBaseDir()로 결정 — 영문 사용자는 `%APPDATA%/<앱>/AI`,
 *    한글 사용자는 ASCII 보장 경로(`%PROGRAMDATA%/<앱>/AI`).
 * 3. process.resourcesPath/llama-bin/llama-server[.exe] (앱 패키지에 번들된 경우)
 * 4. PATH의 llama-server (dev mode — brew install)
 *
 * @returns 실행 가능한 경로 또는 null (없음)
 */
export function findLlamaServerBin(aiBaseDir: string, resourcesPath?: string): string | null {
  const exe = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';

  // 1. 환경변수
  const envBin = process.env.LLAMA_SERVER_BIN;
  if (envBin && fs.existsSync(envBin)) return envBin;

  // 2. AI base dir 안의 다운로드된 빌드
  const platform = detectPlatformDir();
  if (platform) {
    const userBin = path.join(aiBaseDir, 'llama-bin', platform, exe);
    if (fs.existsSync(userBin)) return userBin;
  }

  // 3. 앱 번들 (extraResources) — fetch-llama-server.sh가 platform 하위폴더로 넣으므로 동일 구조로 조회
  if (resourcesPath && platform) {
    const bundledBin = path.join(resourcesPath, 'llama-bin', platform, exe);
    if (fs.existsSync(bundledBin)) return bundledBin;
  }

  // 4. PATH
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const out = execSync(`${which} ${exe}`, { encoding: 'utf-8' }).split('\n')[0].trim();
    if (out && fs.existsSync(out)) return out;
  } catch {
    /* not in PATH */
  }

  return null;
}

/** llama.cpp release 자산 이름 매핑 (CPU 폴백 빌드) */
export function detectPlatformDir(): string | null {
  const { platform, arch } = process;
  if (platform === 'darwin' && arch === 'arm64') return 'mac-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'mac-x64';
  if (platform === 'win32' && arch === 'x64') return 'win-cpu-x64';
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  return null;
}

/** llama.cpp release zip 다운로드 URL (build number는 호환성 있는 안정 버전 고정). */
export const LLAMA_BIN_RELEASE = 'b9030';

export function llamaBinDownloadUrl(): string | null {
  const platform = detectPlatformDir();
  if (!platform) return null;
  // llama.cpp 릴리스 자산: Windows는 .zip, macOS/Linux는 .tar.gz
  // 예: llama-b9030-bin-macos-arm64.tar.gz / llama-b9030-bin-win-cpu-x64.zip
  const platformAsset = (
    {
      'mac-arm64': 'macos-arm64',
      'mac-x64': 'macos-x64',
      'win-cpu-x64': 'win-cpu-x64',
      'linux-x64': 'ubuntu-x64',
    } as Record<string, string>
  )[platform];
  if (!platformAsset) return null;
  const ext = platform.startsWith('win') ? 'zip' : 'tar.gz';
  return `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_BIN_RELEASE}/llama-${LLAMA_BIN_RELEASE}-bin-${platformAsset}.${ext}`;
}
