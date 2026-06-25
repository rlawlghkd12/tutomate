/**
 * AI 데이터(모델 / llama-server 바이너리) 저장 위치 결정 + 마이그레이션.
 *
 * 배경: Windows에서 비ASCII(한글) 사용자명 경로(C:\Users\통도예술마을협동조합\...)는
 * llama-server.exe가 ANSI argv로 받아 fopen에서 실패한다. 단축 경로(8.3) 변환이
 * 1차 폴백이지만 NTFS 8.3 alias 비활성/PowerShell 차단 PC에서는 작동 못 한다.
 * 최종 안전망으로 AI 데이터를 ASCII가 보장되는 시스템 경로(%PROGRAMDATA%)로 옮긴다.
 *
 * 결정 규칙(Windows):
 * - userDataDir 자체가 ASCII면 기존 `userDataDir/AI` 유지 — 영문 사용자는 마이그레이션 0
 * - 비ASCII면 `%PROGRAMDATA%\<앱이름>\AI` 사용 — 항상 ASCII, 일반 사용자 권한으로 R/W 가능
 * - %PROGRAMDATA% 자체도 비ASCII이거나 없는 비정상 환경 → `C:\<앱이름>-AI` 드라이브 루트 폴백
 *
 * macOS/Linux: 항상 `userDataDir/AI` 유지 (해당 OS에 fopen 코드페이지 이슈 없음).
 */

import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line no-control-regex
const ASCII_ONLY = /^[\x00-\x7F]+$/;

/**
 * AI 데이터 베이스 디렉토리. 호출 측이 이 안에 모델·llama-bin·기타 캐시를 둔다.
 * appName은 충돌 회피용 (TutorMate / TutorMate Q 동시 설치 케이스).
 */
export function getAiBaseDir(userDataDir: string, appName: string): string {
  const legacy = path.join(userDataDir, 'AI');
  if (process.platform !== 'win32') return legacy;
  if (ASCII_ONLY.test(legacy)) return legacy;

  const programData = process.env.PROGRAMDATA;
  if (programData && ASCII_ONLY.test(programData)) {
    return path.join(programData, appName, 'AI');
  }
  // 폴백 — 시스템 드라이브 루트 (보통 C:). appName 공백 안전하게 - 로 치환.
  const sysDrive = process.env.SystemDrive ?? 'C:';
  return path.join(sysDrive + '\\', appName.replace(/\s+/g, '-') + '-AI');
}

/**
 * 기존 한글 경로(userDataDir/AI)에 있던 모델·엔진을 새 ASCII 경로로 일회성 이전.
 *
 * - oldDir==newDir이면 no-op (마이그레이션 불필요한 영문 사용자)
 * - 새 경로에 같은 이름이 이미 있으면 skip (재시작 안전)
 * - 동일 드라이브면 rename(즉시), 교차 드라이브면 copy + remove
 * - 한 파일 실패가 다음 파일 진행을 막지 않음 (best effort)
 *
 * 호출은 매니저 생성 직전 동기 1회. 3GB 모델 copy는 동일 드라이브 rename이라
 * 보통 수십~수백 ms 안에 끝난다.
 */
export function migrateLegacyAiData(oldDir: string, newDir: string): void {
  if (path.resolve(oldDir) === path.resolve(newDir)) return;
  if (!fs.existsSync(oldDir)) return;
  console.log(`[aiPaths] AI 데이터 이전: ${oldDir} → ${newDir}`);
  fs.mkdirSync(newDir, { recursive: true });
  let moved = 0;
  for (const entry of fs.readdirSync(oldDir, { withFileTypes: true })) {
    const src = path.join(oldDir, entry.name);
    const dst = path.join(newDir, entry.name);
    if (fs.existsSync(dst)) continue;
    try {
      fs.renameSync(src, dst);
      moved++;
    } catch {
      try {
        copyRecursive(src, dst);
        fs.rmSync(src, { recursive: true, force: true });
        moved++;
      } catch (e) {
        console.warn('[aiPaths] 이전 실패:', src, e);
      }
    }
  }
  console.log(`[aiPaths] 이전 완료: ${moved}개 엔트리`);
  // 빈 폴더면 정리 (best effort)
  try {
    if (fs.existsSync(oldDir) && fs.readdirSync(oldDir).length === 0) {
      fs.rmdirSync(oldDir);
    }
  } catch {
    /* 비어있지 않거나 권한 — 무시 */
  }
}

function copyRecursive(src: string, dst: string): void {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src)) {
      copyRecursive(path.join(src, e), path.join(dst, e));
    }
  } else {
    fs.copyFileSync(src, dst);
  }
}
