#!/bin/bash
set -e

# 사용법: ./scripts/release-win.sh <버전>
VERSION=$1
if [ -z "$VERSION" ]; then
  echo "사용법: ./scripts/release-win.sh <버전>"
  exit 1
fi

echo "=== v$VERSION Win 릴리스 시작 ==="

# 0. CHANGELOG.md에서 릴리스 노트 추출
NOTES=$(awk "/^## $VERSION/{found=1; next} /^## [0-9]/{if(found) exit} found{print}" CHANGELOG.md)
if [ -z "$NOTES" ]; then
  echo "⚠ CHANGELOG.md에 $VERSION 항목이 없습니다. 먼저 작성하세요."
  exit 1
fi
echo "✓ 릴리스 노트 확인"

# 1. 버전 범프
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" apps/tutomate/package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" apps/tutomate-q/package.json
echo "✓ 버전 범프 → $VERSION"

# 2. 커밋 + 푸시
git add -A
git commit -m "chore: v$VERSION 버전 범프"
git push origin main
echo "✓ 커밋 + 푸시"

# 3. 빌드
echo "빌드 중..."
pnpm --filter @tutomate/app electron:build:win &
PID1=$!
pnpm --filter @tutomate/app-q electron:build:win &
PID2=$!
wait $PID1 $PID2
echo "✓ Win 빌드 완료"

# 4. 릴리스 생성 (CHANGELOG에서 읽은 노트 사용)
RELEASE_BODY=$(printf "## v$VERSION\n$NOTES")

gh release create "v$VERSION" --title "v$VERSION" --latest \
  --notes "$RELEASE_BODY" \
  --repo rlawlghkd12/tutomate

gh release create "q-v$VERSION" --title "Q v$VERSION" \
  --notes "$RELEASE_BODY" \
  --repo rlawlghkd12/tutomate

# 5. 아티팩트 업로드
gh release upload "v$VERSION" \
  "./apps/tutomate/release/TutorMate-Setup-$VERSION.exe" \
  "./apps/tutomate/release/TutorMate-Setup-$VERSION.exe.blockmap" \
  "./apps/tutomate/release/latest.yml" \
  --repo rlawlghkd12/tutomate --clobber

gh release upload "q-v$VERSION" \
  "./apps/tutomate-q/release/TutorMate-Q-Setup-$VERSION.exe" \
  "./apps/tutomate-q/release/TutorMate-Q-Setup-$VERSION.exe.blockmap" \
  "./apps/tutomate-q/release/q-latest.yml" \
  --repo rlawlghkd12/tutomate --clobber

# 6. Latest에 Q 메타파일
gh release upload "v$VERSION" \
  "./apps/tutomate-q/release/q-latest.yml" \
  "./apps/tutomate-q/release/TutorMate-Q-Setup-$VERSION.exe" \
  "./apps/tutomate-q/release/TutorMate-Q-Setup-$VERSION.exe.blockmap" \
  --repo rlawlghkd12/tutomate --clobber

echo ""
echo "=== v$VERSION 릴리스 완료 ==="
echo "  일반: https://github.com/rlawlghkd12/tutomate/releases/tag/v$VERSION"
echo "  Q:    https://github.com/rlawlghkd12/tutomate/releases/tag/q-v$VERSION"
echo ""
echo "릴리스 노트:"
echo "$RELEASE_BODY"
