#!/usr/bin/env bash
# Visual C++ 2015-2022 x64 재배포 패키지를 NSIS 인스톨러 번들용으로 받아둔다.
# 대상: packages/electron-shared/build/vc_redist.x64.exe
# 호출 시점: Windows 빌드 직전 (apps/*/package.json electron:build:win prefix).
# 이미 받아둔 게 있고 정상 크기면 skip — 매 빌드마다 25MB 재다운로드 방지.

set -euo pipefail

URL="https://aka.ms/vs/17/release/vc_redist.x64.exe"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/packages/electron-shared/build"
OUT="$OUT_DIR/vc_redist.x64.exe"

mkdir -p "$OUT_DIR"

# 사이즈 25MB 근처면 정상으로 간주 (Microsoft 영구 URL 자산이라 변동 거의 없음)
if [[ -f "$OUT" ]]; then
  size=$(wc -c < "$OUT" | tr -d ' ')
  if [[ "$size" -ge 20000000 ]]; then
    echo "[skip] vc_redist.x64.exe — 이미 있음 ($((size / 1024 / 1024))MB)"
    exit 0
  fi
  echo "[warn] 기존 vc_redist.x64.exe 크기 이상 ($size bytes) — 다시 받기"
  rm -f "$OUT"
fi

echo "[download] $URL → $OUT"
curl -fL --retry 3 "$URL" -o "$OUT"
size=$(wc -c < "$OUT" | tr -d ' ')
echo "[ok] vc_redist.x64.exe ($((size / 1024 / 1024))MB)"
