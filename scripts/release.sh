#!/bin/bash
set -e

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 버전 확인
VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"

echo -e "${GREEN}=== TutorMate Release $TAG ===${NC}"

# 1. 버전 확인
echo -e "\n${YELLOW}[1/6] 버전 확인${NC}"
echo "package.json: $VERSION"
TAURI_VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
CONFIG_VERSION=$(node -p "require('./src/config/version.ts').match(/APP_VERSION = '(.+)'/)[1]" 2>/dev/null || echo "")

if [ "$VERSION" != "$TAURI_VERSION" ]; then
  echo -e "${RED}버전 불일치: package.json($VERSION) != tauri.conf.json($TAURI_VERSION)${NC}"
  exit 1
fi
echo -e "${GREEN}버전 일치 확인 완료${NC}"

# 2. macOS 빌드
echo -e "\n${YELLOW}[2/6] macOS 빌드${NC}"
RELEASE_DIR="release-files"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

echo "Building aarch64..."
pnpm run tauri:build -- --target aarch64-apple-darwin

echo "Building x86_64..."
pnpm run tauri:build -- --target x86_64-apple-darwin

# 파일 복사
cp src-tauri/target/aarch64-apple-darwin/release/bundle/macos/*.app.tar.gz "$RELEASE_DIR/TutorMate_${VERSION}_aarch64.app.tar.gz"
cp src-tauri/target/aarch64-apple-darwin/release/bundle/macos/*.app.tar.gz.sig "$RELEASE_DIR/TutorMate_${VERSION}_aarch64.app.tar.gz.sig" 2>/dev/null || true
cp src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg "$RELEASE_DIR/"

cp src-tauri/target/x86_64-apple-darwin/release/bundle/macos/*.app.tar.gz "$RELEASE_DIR/TutorMate_${VERSION}_x64.app.tar.gz"
cp src-tauri/target/x86_64-apple-darwin/release/bundle/macos/*.app.tar.gz.sig "$RELEASE_DIR/TutorMate_${VERSION}_x64.app.tar.gz.sig" 2>/dev/null || true
cp src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/*.dmg "$RELEASE_DIR/"

echo -e "${GREEN}macOS 빌드 완료${NC}"

# 3. Azure에서 Windows 빌드 다운로드 (수동 또는 API)
echo -e "\n${YELLOW}[3/6] Windows 빌드 확인${NC}"
echo "GitHub Actions에서 Windows 빌드를 다운로드하세요:"
echo "  https://github.com/rlawlghkd12/tutomate/actions"
echo ""
read -p "Windows 파일을 $RELEASE_DIR에 복사했나요? (y/n): " confirm
if [ "$confirm" != "y" ]; then
  echo "Windows 파일 복사 후 다시 실행하세요."
  exit 1
fi

# 4. latest.json 생성
echo -e "\n${YELLOW}[4/6] latest.json 생성${NC}"

MAC_AARCH64_SIG=""
MAC_X64_SIG=""
WIN_SIG=""

[ -f "$RELEASE_DIR/TutorMate_${VERSION}_aarch64.app.tar.gz.sig" ] && MAC_AARCH64_SIG=$(cat "$RELEASE_DIR/TutorMate_${VERSION}_aarch64.app.tar.gz.sig")
[ -f "$RELEASE_DIR/TutorMate_${VERSION}_x64.app.tar.gz.sig" ] && MAC_X64_SIG=$(cat "$RELEASE_DIR/TutorMate_${VERSION}_x64.app.tar.gz.sig")
[ -f "$RELEASE_DIR/"*".msi.sig" ] && WIN_SIG=$(cat "$RELEASE_DIR/"*".msi.sig")

cat > "$RELEASE_DIR/latest.json" << EOF
{
  "version": "$VERSION",
  "notes": "새로운 버전이 출시되었습니다.",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {
    "darwin-aarch64": {
      "signature": "$MAC_AARCH64_SIG",
      "url": "https://github.com/rlawlghkd12/tutomate/releases/download/$TAG/TutorMate_${VERSION}_aarch64.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "$MAC_X64_SIG",
      "url": "https://github.com/rlawlghkd12/tutomate/releases/download/$TAG/TutorMate_${VERSION}_x64.app.tar.gz"
    },
    "windows-x86_64": {
      "signature": "$WIN_SIG",
      "url": "https://github.com/rlawlghkd12/tutomate/releases/download/$TAG/TutorMate_${VERSION}_x64-setup.msi"
    }
  }
}
EOF

echo -e "${GREEN}latest.json 생성 완료${NC}"
cat "$RELEASE_DIR/latest.json"

# 5. 릴리즈 파일 확인
echo -e "\n${YELLOW}[5/6] 릴리즈 파일 확인${NC}"
ls -la "$RELEASE_DIR/"

# 6. GitHub 릴리즈 생성
echo -e "\n${YELLOW}[6/6] GitHub 릴리즈 생성${NC}"
read -p "릴리즈를 생성하시겠습니까? (y/n): " create_release

if [ "$create_release" = "y" ]; then
  # 태그 생성
  git tag -a "$TAG" -m "$TAG" 2>/dev/null || echo "태그가 이미 존재합니다"
  git push origin "$TAG" 2>/dev/null || true

  # 기존 릴리즈 삭제
  gh release delete "$TAG" --repo rlawlghkd12/tutomate --yes 2>/dev/null || true

  # 릴리즈 생성
  gh release create "$TAG" \
    --repo rlawlghkd12/tutomate \
    --title "수강생 관리 프로그램 $TAG" \
    --notes "새로운 버전이 출시되었습니다.

## 다운로드

### macOS
- Apple Silicon (M1/M2): TutorMate_${VERSION}_aarch64.dmg
- Intel Mac: TutorMate_${VERSION}_x64.dmg

### Windows
- TutorMate_${VERSION}_x64-setup.msi 또는 .exe" \
    "$RELEASE_DIR"/*

  echo -e "${GREEN}릴리즈 완료!${NC}"
  echo "https://github.com/rlawlghkd12/tutomate/releases/tag/$TAG"
fi
