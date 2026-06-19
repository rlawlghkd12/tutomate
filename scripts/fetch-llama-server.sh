#!/usr/bin/env bash
# llama-server 바이너리 다운로드 — 패키징 직전 실행.
# 결과: apps/tutomate{,-q}/build/llama-bin/<platform>/llama-server[.exe]

set -euo pipefail

RELEASE="b9030"
BASE_URL="https://github.com/ggml-org/llama.cpp/releases/download/${RELEASE}"

# 어떤 플랫폼을 받을지 — 인자로 받기, 기본은 현 OS
TARGETS=("$@")
if [[ ${#TARGETS[@]} -eq 0 ]]; then
  case "$(uname -s)" in
    Darwin)
      if [[ "$(uname -m)" == "arm64" ]]; then TARGETS=("mac-arm64"); else TARGETS=("mac-x64"); fi
      ;;
    Linux) TARGETS=("linux-x64") ;;
    *) echo "지원되지 않는 OS: $(uname -s)"; exit 1 ;;
  esac
fi

# 플랫폼 → 자산 이름
declare -A ASSET=(
  ["mac-arm64"]="macos-arm64"
  ["mac-x64"]="macos-x64"
  ["win-cpu-x64"]="win-cpu-x64"
  ["win-vulkan-x64"]="win-vulkan-x64"
  ["linux-x64"]="ubuntu-x64"
)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMPDIR="$(mktemp -d)"
trap "rm -rf $TMPDIR" EXIT

for app_dir in apps/tutomate apps/tutomate-q; do
  for plat in "${TARGETS[@]}"; do
    asset="${ASSET[$plat]:-}"
    if [[ -z "$asset" ]]; then
      echo "[skip] 알 수 없는 플랫폼: $plat"
      continue
    fi
    out_dir="$ROOT/$app_dir/build/llama-bin/$plat"
    mkdir -p "$out_dir"

    if [[ -f "$out_dir/llama-server" || -f "$out_dir/llama-server.exe" ]]; then
      echo "[skip] $app_dir/$plat — 이미 있음"
      continue
    fi

    # Windows 자산은 .zip, macOS/Linux는 .tar.gz
    if [[ "$plat" == win-* ]]; then ext="zip"; else ext="tar.gz"; fi
    url="${BASE_URL}/llama-${RELEASE}-bin-${asset}.${ext}"
    archive="$TMPDIR/${plat}.${ext}"
    echo "[download] $plat: $url"
    curl -fL "$url" -o "$archive"
    echo "[extract] → $out_dir"
    mkdir -p "$TMPDIR/${plat}-extracted"
    if [[ "$ext" == "zip" ]]; then
      unzip -q -o "$archive" -d "$TMPDIR/${plat}-extracted"
    else
      tar -xzf "$archive" -C "$TMPDIR/${plat}-extracted"
    fi

    # 압축 풀린 폴더 안에서 llama-server 위치 찾아 복사 (구조가 빌드별로 다를 수 있음)
    found=$(find "$TMPDIR/${plat}-extracted" -name "llama-server*" -type f | head -1)
    if [[ -z "$found" ]]; then
      echo "[error] llama-server 바이너리 못 찾음 in $url"
      exit 1
    fi
    bin_dir="$(dirname "$found")"
    cp -R "$bin_dir"/* "$out_dir/"
    chmod +x "$out_dir"/llama-server* 2>/dev/null || true
    echo "[ok] $app_dir/$plat"
  done
done

echo ""
echo "완료. 다음 사용:"
echo "  ./scripts/fetch-llama-server.sh mac-arm64        # 단일 플랫폼"
echo "  ./scripts/fetch-llama-server.sh win-cpu-x64       # Win CPU"
echo "  ./scripts/fetch-llama-server.sh mac-arm64 win-cpu-x64  # 여러 플랫폼"
