# 버전 관리 및 릴리스 가이드

## 목차
1. [버전 번호 체계](#버전-번호-체계)
2. [릴리스 프로세스](#릴리스-프로세스)
3. [변경 로그 작성](#변경-로그-작성)
4. [자동 업데이트](#자동-업데이트)
5. [문제 해결](#문제-해결)

## 버전 번호 체계

이 프로젝트는 **Semantic Versioning 2.0.0**을 따릅니다.

### 형식: `MAJOR.MINOR.PATCH`

- **MAJOR** (예: `1.0.0` → `2.0.0`)
  - 하위 호환성이 깨지는 변경
  - 데이터 구조 변경
  - 주요 기능 재설계

- **MINOR** (예: `1.0.0` → `1.1.0`)
  - 새로운 기능 추가 (하위 호환 유지)
  - 기존 기능 개선
  - 새로운 UI 컴포넌트 추가

- **PATCH** (예: `1.0.0` → `1.0.1`)
  - 버그 수정
  - 성능 개선
  - 문서 업데이트

### 버전 예시

```
0.1.0 - 초기 릴리스
0.1.1 - 출석 체크 버그 수정
0.2.0 - 수익 관리 기능 추가
0.2.1 - 결제 계산 오류 수정
1.0.0 - 첫 안정 버전 출시
```

## 릴리스 프로세스

### 1단계: 준비

```bash
# 최신 코드 가져오기
git checkout master
git pull origin master

# 변경 사항 확인
git status
git log
```

### 2단계: 버전 업데이트

**수동으로 두 파일을 업데이트해야 합니다:**

#### `package.json`
```json
{
  "version": "0.2.0"
}
```

#### `src-tauri/tauri.conf.json`
```json
{
  "version": "0.2.0"
}
```

**중요**: 두 파일의 버전이 일치해야 합니다!

### 3단계: 변경 로그 업데이트

`CHANGELOG.md` 파일을 업데이트합니다:

```markdown
## [0.2.0] - 2024-01-15

### Added
- 수익 관리 기능 추가
- 결제 상태별 필터링

### Fixed
- 출석 체크 버그 수정

### Changed
- UI 개선
```

### 4단계: 커밋 및 태그

```bash
# 변경사항 커밋
git add package.json src-tauri/tauri.conf.json CHANGELOG.md
git commit -m "Release v0.2.0"

# 태그 생성
git tag -a v0.2.0 -m "Release v0.2.0"

# 푸시 (GitHub Actions가 자동으로 빌드 시작)
git push origin master
git push origin v0.2.0
```

### 5단계: 릴리스 확인

1. GitHub Actions 진행 상황 확인
   - [https://github.com/사용자명/저장소명/actions](https://github.com/사용자명/저장소명/actions)

2. 빌드 완료 후 Release 확인
   - [https://github.com/사용자명/저장소명/releases](https://github.com/사용자명/저장소명/releases)

3. 다음 파일들이 업로드되었는지 확인:
   - ✅ `latest.json` (자동 업데이트용)
   - ✅ `.dmg` 파일 (macOS)
   - ✅ `.exe` 또는 `.msi` (Windows)
   - ✅ `.sig` 파일들 (서명 파일)

## 변경 로그 작성

### CHANGELOG.md 형식

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- 앱 설정 기능

### Changed
- 로그인 화면 디자인 개선

### Fixed
- 데이터 저장 오류 수정

## [0.2.0] - 2024-01-15

### Added
- 수익 관리 기능
- Excel 내보내기

### Fixed
- 출석 체크 버그

## [0.1.0] - 2024-01-01

### Added
- 초기 릴리스
- 강좌 관리
- 수강생 관리
- 출석 체크
```

### 카테고리 설명

- **Added**: 새로운 기능
- **Changed**: 기존 기능 변경
- **Deprecated**: 곧 제거될 기능
- **Removed**: 제거된 기능
- **Fixed**: 버그 수정
- **Security**: 보안 관련 수정

## 자동 업데이트

### 작동 원리

1. 앱 실행 시 자동으로 업데이트 확인
2. GitHub Releases의 `latest.json` 파일 확인
3. 새 버전이 있으면 사용자에게 알림
4. 사용자 승인 후 다운로드 및 설치
5. 설치 완료 후 앱 재시작

### 업데이트 설정

사용자는 앱에서 다음을 설정할 수 있습니다:
- 자동 업데이트 확인 켜기/끄기
- 업데이트 확인 주기 (기본: 1시간)

### 업데이트 강제 (중요한 보안 업데이트)

긴급 업데이트가 필요한 경우:

1. 버전을 MAJOR 버전으로 올리기
2. Release 노트에 "긴급 업데이트" 명시
3. 사용자에게 별도 공지

## 문제 해결

### 태그를 잘못 생성한 경우

```bash
# 로컬 태그 삭제
git tag -d v0.2.0

# 원격 태그 삭제
git push origin :refs/tags/v0.2.0

# 다시 생성
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

### GitHub Actions 빌드 실패

1. Actions 탭에서 로그 확인
2. 일반적인 원인:
   - Node.js 버전 불일치
   - Rust 컴파일 오류
   - 서명 키 누락

3. 수정 후 태그 재푸시:
```bash
git tag -d v0.2.0
git push origin :refs/tags/v0.2.0
# 코드 수정 후
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

### Release가 생성되지 않는 경우

1. GitHub Token 권한 확인
2. Repository Settings → Actions → General
3. "Read and write permissions" 활성화 확인

## 빠른 참조

### 패치 릴리스 (버그 수정)
```bash
# 0.1.0 → 0.1.1
# 1. package.json, tauri.conf.json 버전 업데이트
# 2. CHANGELOG.md 업데이트
git add .
git commit -m "Release v0.1.1"
git tag -a v0.1.1 -m "Bug fixes"
git push origin master && git push origin v0.1.1
```

### 마이너 릴리스 (새 기능)
```bash
# 0.1.1 → 0.2.0
# 1. package.json, tauri.conf.json 버전 업데이트
# 2. CHANGELOG.md 업데이트
git add .
git commit -m "Release v0.2.0"
git tag -a v0.2.0 -m "New features"
git push origin master && git push origin v0.2.0
```

### 메이저 릴리스 (큰 변경)
```bash
# 0.2.0 → 1.0.0
# 1. package.json, tauri.conf.json 버전 업데이트
# 2. CHANGELOG.md 업데이트
# 3. 사용자에게 별도 공지
git add .
git commit -m "Release v1.0.0"
git tag -a v1.0.0 -m "Major release"
git push origin master && git push origin v1.0.0
```

## 체크리스트

릴리스 전 확인사항:

- [ ] 모든 테스트 통과
- [ ] `package.json` 버전 업데이트
- [ ] `src-tauri/tauri.conf.json` 버전 업데이트
- [ ] `CHANGELOG.md` 업데이트
- [ ] 변경사항 커밋
- [ ] 태그 생성 및 푸시
- [ ] GitHub Actions 빌드 성공 확인
- [ ] Release 생성 확인
- [ ] 다운로드 파일 테스트
- [ ] 자동 업데이트 테스트 (이전 버전에서)

## 참고 자료

- [Semantic Versioning](https://semver.org/lang/ko/)
- [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/)
- [Tauri Updater](https://tauri.app/v1/guides/distribution/updater)
