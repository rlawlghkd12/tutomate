# 자동 업데이트 시스템 설정 가이드

## 1. 업데이트 서명 키 생성

보안을 위해 업데이트는 반드시 서명되어야 합니다.

### 키 생성 명령어

```bash
# Tauri CLI를 사용하여 키 생성
npm run tauri signer generate -- -w ~/.tauri/student-management.key
```

이 명령어는 두 가지를 생성합니다:
- **개인 키**: `~/.tauri/student-management.key` (절대 공유하지 마세요!)
- **공개 키**: 터미널에 출력됩니다

### 공개 키 설정

1. 터미널에 출력된 공개 키를 복사합니다
2. `src-tauri/tauri.conf.json` 파일을 엽니다
3. `plugins.updater.pubkey` 값을 공개 키로 교체합니다:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "여기에_공개키_붙여넣기"
    }
  }
}
```

## 2. GitHub 설정

### GitHub Secrets 설정

GitHub 저장소 설정에서 다음 Secret을 추가합니다:

1. **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

2. 다음 Secret 추가:
   - Name: `TAURI_SIGNING_PRIVATE_KEY`
   - Value: `~/.tauri/student-management.key` 파일의 내용 전체 복사

```bash
# macOS/Linux에서 키 내용 확인
cat ~/.tauri/student-management.key

# Windows에서
type %USERPROFILE%\.tauri\student-management.key
```

### GitHub Repository 설정

`tauri.conf.json`의 업데이트 엔드포인트를 실제 GitHub 저장소로 교체:

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/사용자명/저장소명/releases/latest/download/latest.json"
      ]
    }
  }
}
```

예: `https://github.com/johndoe/student-management/releases/latest/download/latest.json`

## 3. 버전 업데이트 프로세스

### 새 버전 릴리스 방법

1. **버전 번호 업데이트**

```bash
# package.json과 tauri.conf.json 버전 업데이트
# 예: 0.1.0 → 0.2.0
```

`package.json`:
```json
{
  "version": "0.2.0"
}
```

`src-tauri/tauri.conf.json`:
```json
{
  "version": "0.2.0"
}
```

2. **변경 사항 커밋**

```bash
git add .
git commit -m "Release v0.2.0"
```

3. **태그 생성 및 푸시**

```bash
# 태그 생성
git tag v0.2.0

# 태그 푸시 (GitHub Actions가 자동으로 빌드 시작)
git push origin v0.2.0
```

4. **GitHub Actions가 자동으로**:
   - macOS와 Windows 빌드 생성
   - 서명된 업데이트 파일 생성
   - GitHub Release 생성
   - `latest.json` 파일 생성 및 업로드

## 4. 버전 관리 규칙 (Semantic Versioning)

버전 형식: `MAJOR.MINOR.PATCH` (예: `1.2.3`)

- **MAJOR** (1.0.0): 하위 호환성이 없는 큰 변경
- **MINOR** (0.1.0): 새로운 기능 추가 (하위 호환)
- **PATCH** (0.0.1): 버그 수정

예시:
- `0.1.0` → `0.1.1`: 버그 수정
- `0.1.1` → `0.2.0`: 새 기능 추가
- `0.2.0` → `1.0.0`: 메이저 변경

## 5. 업데이트 작동 방식

1. 앱이 시작되면 자동으로 업데이트 확인 (1시간마다)
2. 새 버전이 있으면 사용자에게 알림
3. 사용자가 "업데이트" 클릭
4. 백그라운드에서 다운로드 및 설치
5. 설치 완료 후 앱 재시작

## 6. 문제 해결

### 업데이트 확인이 안 될 때

1. 인터넷 연결 확인
2. GitHub Release가 정상적으로 생성되었는지 확인
3. `latest.json` 파일이 릴리스에 포함되어 있는지 확인
4. 로그 파일 확인: `~/Library/Logs/com.student-management.app/app.log`

### 서명 오류

- 공개 키가 `tauri.conf.json`에 올바르게 설정되었는지 확인
- GitHub Secret에 개인 키가 올바르게 설정되었는지 확인

## 7. 테스트

로컬에서 업데이트 테스트:

```bash
# 1. 현재 버전 빌드 (예: 0.1.0)
npm run tauri:build

# 2. 앱 설치 및 실행

# 3. 버전 업데이트 (예: 0.2.0)
# package.json과 tauri.conf.json 수정

# 4. 새 버전 빌드
npm run tauri:build

# 5. GitHub에 릴리스 생성

# 6. 이전 버전 앱에서 업데이트 확인
```

## 참고 자료

- [Tauri Updater 공식 문서](https://tauri.app/v1/guides/distribution/updater)
- [Semantic Versioning](https://semver.org/lang/ko/)
