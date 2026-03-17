# ADR-002: Social OAuth Login (Google / Kakao / Naver)

**Status:** Draft
**Date:** 2026-03-18
**Deciders:** jrbr (TutorMate maintainer)

## Context

현재 TutorMate는 anonymous auth + device_id 방식으로 동작한다. 사용자 식별이 기기에 종속되어 있어 다중 기기 사용이 불가능하고, 기기 변경 시 데이터 접근이 어렵다. 소셜 로그인을 추가하여 사용자 계정 기반 인증을 지원한다.

### 현재 인증 플로우

```
App mount → getSession() → 세션 없으면 signInAnonymously()
→ user_organizations 조회 → 없으면 create-trial-org(device_id)
→ org 연결 완료 → loading: false
```

### 목표

- Google/Kakao/Naver OAuth 로그인 추가
- 기존 anonymous auth + device_id 플로우와 하위 호환 유지
- 다른 프로젝트에서 재사용 가능한 독립 OAuth 모듈

## Decision

### OAuth 플로우 (Electron)

```
1. 유저가 "Google로 시작" 클릭
2. 렌더러 → IPC → main process → shell.openExternal(authUrl)
3. 시스템 브라우저에서 OAuth 로그인
4. 완료 후 tutomate://auth/callback#access_token=...&refresh_token=... 으로 리다이렉트
5. Electron이 deep link 수신 → IPC로 렌더러에 전달
6. supabase.auth.setSession() → 세션 설정
7. create-trial-org(device_id) 호출 → 기존 org 연결
```

### 프로바이더별 차이

| 프로바이더 | 방식 | 비고 |
|-----------|------|------|
| Google | Supabase 네이티브 `signInWithOAuth` | 대시보드 설정만 |
| Kakao | Supabase 네이티브 `signInWithOAuth` | 대시보드 설정만 |
| Naver | Edge Function 직접 구현 | Supabase 미지원 |

**Naver 플로우:**
```
앱 → 네이버 OAuth 페이지
→ Edge Function /naver-auth/callback
→ 코드 교환 → 유저 생성/조회
→ Supabase verify URL 생성
→ tutomate://auth/callback 으로 리다이렉트
```

## 파일 구조

### 새로 생성

```
src/lib/oauth/                        # 재사용 가능한 OAuth 모듈
  index.ts                            # Public exports
  types.ts                            # 타입/인터페이스
  OAuthManager.ts                     # 메인 오케스트레이터
  providers/
    base.ts                           # SupabaseNativeProvider 베이스 클래스
    google.ts                         # Google (Supabase 네이티브)
    kakao.ts                          # Kakao (Supabase 네이티브)
    naver.ts                          # Naver (Edge Function)
  utils/
    deeplink.ts                       # deep link URL 파싱

electron/ipc/authHandler.ts           # OAuth IPC 핸들러

supabase/functions/naver-auth/index.ts  # Naver OAuth Edge Function
```

### 수정

| 파일 | 변경 |
|------|------|
| `electron/main.ts` | `tutomate://` 프로토콜 등록, `open-url`/`second-instance` deep link 처리 |
| `electron/preload.cjs` | `openOAuthUrl`, `onOAuthCallback` IPC 채널 추가 |
| `electron/preload.ts` | 동일 (소스 동기화) |
| `src/types/electron.d.ts` | OAuth IPC 타입 추가 |
| `src/stores/authStore.ts` | `signInWithOAuth`, `handleOAuthCallback` 메서드, `onAuthStateChange` 수정 |
| `src/App.tsx` | Welcome 모달에 OAuth 버튼, deep link 리스너 등록 |
| `src/pages/SettingsPage.tsx` | 계정 섹션에 소셜 로그인 상태 표시 |
| `electron-builder.yml` | `protocols` 섹션 추가 |
| `electron-builder-q.yml` | `protocols` 섹션 추가 |

## 구현 상세

### Phase 1: OAuth 모듈 코어

`src/lib/oauth/` — Electron/Supabase에 직접 의존하지 않는 순수 모듈

- **types.ts**: `IOAuthProvider`, `OAuthConfig`, `OAuthCallbackResult` 등
- **utils/deeplink.ts**: callback URL에서 토큰/코드/에러 파싱 (`URL` / `URLSearchParams` 기반)
- **providers/base.ts**: Supabase 네이티브 프로바이더 베이스 (`signInWithOAuth` + `skipBrowserRedirect: true`)
- **providers/google.ts, kakao.ts**: 베이스 상속, 스코프 설정만
- **providers/naver.ts**: 네이버 OAuth URL 직접 생성
- **OAuthManager.ts**: 프로바이더 관리, `getAuthUrl()`, `handleCallback()`
- **index.ts**: 전체 export

### Phase 2: Electron Deep Link

#### electron/main.ts 변경

```typescript
// 프로토콜 등록 (app.ready 이전에 호출)
if (process.defaultApp) {
  // 개발 모드: electron 실행파일 경로 + 스크립트 경로 전달 필요
  app.setAsDefaultProtocolClient('tutomate', process.execPath, [
    path.resolve(process.argv[1])
  ]);
} else {
  app.setAsDefaultProtocolClient('tutomate');
}

// pending URL: 앱이 아직 ready 되지 않았을 때 수신한 deep link 보관
let pendingDeepLinkUrl: string | null = null;

// macOS: open-url 이벤트
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('oauth-callback', url);
  } else {
    pendingDeepLinkUrl = url;
  }
});

// Windows/Linux: second-instance 이벤트 수정
app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  // deep link URL 추출 (argv에서 tutomate:// 스킴 찾기)
  const deepLinkUrl = argv.find(arg => arg.startsWith('tutomate://'));
  if (deepLinkUrl && mainWindow) {
    mainWindow.webContents.send('oauth-callback', deepLinkUrl);
  }
});

// mainWindow 생성 직후: pending URL 전달
mainWindow.webContents.once('did-finish-load', () => {
  if (pendingDeepLinkUrl) {
    mainWindow.webContents.send('oauth-callback', pendingDeepLinkUrl);
    pendingDeepLinkUrl = null;
  }
});
```

#### electron/ipc/authHandler.ts (신규)

```typescript
import { ipcMain, shell } from 'electron';

export function registerAuthHandlers() {
  ipcMain.handle('oauth-open-external', async (_event, url: string) => {
    // URL 검증: 허용된 도메인만 열기
    const parsed = new URL(url);
    const allowed = [
      'accounts.google.com',
      'kauth.kakao.com',
      'nid.naver.com',
      // Supabase auth URL
    ];
    if (!allowed.some(domain => parsed.hostname.endsWith(domain))) {
      throw new Error(`Unauthorized OAuth URL: ${parsed.hostname}`);
    }
    await shell.openExternal(url);
  });
}
```

#### electron-builder.yml 추가

```yaml
protocols:
  - name: TutorMate
    schemes:
      - tutomate
```

#### preload 추가 (cjs + ts 동기화)

```typescript
openOAuthUrl: (url) => ipcRenderer.invoke('oauth-open-external', url),
onOAuthCallback: (callback) => {
  const handler = (_event, url) => callback(url);
  ipcRenderer.on('oauth-callback', handler);
  return () => ipcRenderer.removeListener('oauth-callback', handler);
},
```

#### src/types/electron.d.ts 추가

```typescript
openOAuthUrl(url: string): Promise<void>;
onOAuthCallback(callback: (url: string) => void): () => void;
```

### Phase 3: authStore 통합

#### 핵심 변경: onAuthStateChange 수정

**현재 문제:** `onAuthStateChange`에서 session이 non-null일 때 `session` 필드만 업데이트하고, `organizationId`를 다시 조회하지 않음. OAuth로 새 유저가 로그인하면 `organizationId`가 stale 상태가 됨.

```typescript
// 변경 전 (현재)
supabase.auth.onAuthStateChange((_event, session) => {
  if (session === null) {
    useAuthStore.setState({ session: null, organizationId: null, plan: null, isCloud: false });
  } else {
    useAuthStore.setState({ session });
  }
});

// 변경 후
supabase.auth.onAuthStateChange((event, session) => {
  if (session === null) {
    useAuthStore.setState({ session: null, organizationId: null, plan: null, isCloud: false });
  } else if (event === 'SIGNED_IN') {
    // OAuth 로그인 등 새 세션 시작 시 org 재조회
    useAuthStore.setState({ session });
    useAuthStore.getState().initialize();
  } else {
    // TOKEN_REFRESHED 등
    useAuthStore.setState({ session });
  }
});
```

**주의:** `initialize()` 내부에서 `signInAnonymously()`를 호출하면 무한 루프 발생 가능. `initialize()`에 세션이 이미 있으면 anonymous 로그인을 스킵하는 가드가 필요.

#### 새 메서드

```typescript
signInWithOAuth: async (provider: 'google' | 'kakao' | 'naver') => {
  const manager = new OAuthManager(supabase);
  const { url } = await manager.getAuthUrl(provider);
  if (isElectron()) {
    await window.electronAPI.openOAuthUrl(url);
  } else {
    window.location.href = url;
  }
},

handleOAuthCallback: async (callbackUrl: string) => {
  const manager = new OAuthManager(supabase);
  const result = manager.parseCallback(callbackUrl);
  if (result.error) throw new Error(result.error);

  await supabase.auth.setSession({
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
  });
  // onAuthStateChange → SIGNED_IN → initialize() 자동 호출
  // → create-trial-org(device_id) → 기존 org 연결
},
```

### Phase 4: Naver Edge Function

`supabase/functions/naver-auth/index.ts`

1. `/callback` 엔드포인트: 네이버 auth code + state 수신
2. **state 파라미터 검증** (CSRF 방지)
3. 네이버 API로 토큰 교환 (`client_secret`은 서버에만)
4. 네이버 프로필 API로 유저 정보 조회
5. Supabase admin API로 유저 생성/조회 (`admin.auth.createUser` or `admin.auth.getUserByEmail`)
6. `admin.auth.generateLink({ type: 'magiclink' })` → verify URL 생성
7. verify URL에 `redirect_to=tutomate://auth/callback` 추가하여 리다이렉트

**환경변수:**
- Supabase secrets: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
- 프론트: `VITE_NAVER_CLIENT_ID` (OAuth URL 생성용)

### Phase 5: UI

#### Welcome 모달 (App.tsx)

```
┌─────────────────────────────┐
│  [라이선스 키 입력]           │
│                             │
│  ─── 또는 소셜 로그인 ───    │
│                             │
│  [G  Google로 시작]  (흰색)  │
│  [K  카카오로 시작]  (#FEE500)│
│  [N  네이버로 시작]  (#03C75A)│
│                             │
│  ─────────────────          │
│  [체험판으로 시작]            │
└─────────────────────────────┘
```

#### Settings 라이선스 탭

로그인 상태 표시: 이메일, 프로바이더 아이콘, 로그아웃 버튼

### Phase 6: 설정 & 테스트

**Supabase 대시보드:**
- Authentication > Providers: Google, Kakao 활성화
- Authentication > URL Configuration: `tutomate://auth/callback` 을 Redirect URLs에 추가

**테스트:**
- `open "tutomate://auth/callback#access_token=test&refresh_token=test"` (deep link 수신 확인)
- 각 프로바이더 로그인 → 기존 org 데이터 유지 확인
- anonymous → OAuth 전환 시 device_id 기반 org 재연결 확인

## 보완 필요 사항

### 1. Anonymous → OAuth 유저 전환 시 세션 교체 문제 (Critical)

OAuth 로그인 시 기존 anonymous 세션이 사라진다. 현재 `onAuthStateChange`에서 `session === null` → 상태 초기화가 먼저 발생한 후 새 세션이 설정될 수 있다. 이 순간 UI가 깜빡이거나 잠깐 로그아웃 상태로 보일 수 있음.

**해결 방안:** `handleOAuthCallback`에서 `setSession()` 호출 전에 loading 상태를 true로 설정하고, `onAuthStateChange`에서 `SIGNED_IN` 이벤트 처리 완료 후 loading을 해제한다.

### 2. initialize() 무한 루프 방지 (Critical)

`onAuthStateChange(SIGNED_IN)` → `initialize()` → `signInAnonymously()` → `onAuthStateChange(SIGNED_IN)` 무한 루프 가능.

**해결 방안:** `initialize()` 시작 시 `getSession()`으로 세션 존재 여부 확인. 세션이 이미 있으면 anonymous 로그인 스킵하고 바로 org 조회로 진입.

### 3. 개발 모드 Deep Link 등록 (Important)

`app.setAsDefaultProtocolClient`는 개발 모드에서 Electron 바이너리 경로가 다르다. `process.defaultApp` 체크로 분기 필요 (Phase 2에 반영 완료).

### 4. 앱 미로드 시 Deep Link 수신 (Important)

앱이 꺼진 상태에서 deep link로 실행되면 `mainWindow`가 아직 없다. pending URL을 저장하고 `did-finish-load` 후 전달 필요 (Phase 2에 반영 완료).

### 5. 복수 프로바이더 계정 연결 정책 (Medium)

사용자가 Google로 로그인 후 Kakao로 다시 로그인하면? 현재 설계에서는 별개의 Supabase 유저로 취급됨.

**옵션:**
- A) 별개 유저로 취급 (현재 설계, 단순)
- B) 동일 이메일 기반으로 자동 병합 (Supabase 설정: `Automatic Linking`)
- C) Settings에서 수동 계정 연결 UI 제공

**권장:** 1차 출시에서는 **Option A** (별개 유저). 추후 사용자 요구에 따라 B/C 검토. Supabase 대시보드에서 "Automatic Linking" 옵션만 켜면 동일 이메일은 자동 병합 가능.

### 6. Naver Edge Function 보안 (Medium)

- **state 파라미터**: CSRF 방지를 위해 프론트에서 랜덤 state 생성 → localStorage 저장 → 콜백에서 검증
- **토큰 노출 방지**: Naver access_token은 Edge Function 내부에서만 사용하고 클라이언트에 노출하지 않음
- **Rate limiting**: Edge Function에 rate limit 적용 고려

### 7. OAuth 실패 시 UX (Medium)

- 시스템 브라우저 열렸지만 사용자가 취소한 경우: 앱으로 돌아와도 아무 일도 일어나지 않음 → 타임아웃이나 안내 메시지 필요?
- 네트워크 오류: callback URL에 error 파라미터 → 에러 토스트 표시
- 이미 다른 org에 연결된 소셜 계정: `create-trial-org`가 기존 org 반환하므로 자연스럽게 처리됨

**권장:** 1차 출시에서는 에러 파라미터 파싱 + 토스트만. 타임아웃 불필요 (사용자가 브라우저에서 자유롭게 행동 가능).

### 8. Web 환경 지원 여부 (Low)

현재 설계는 Electron deep link 기반. 웹에서도 OAuth를 지원할 것인가?

**권장:** 현재 앱이 Electron 전용이므로 1차에서는 Electron만. 웹 지원 시 `redirectTo`를 웹 URL로 변경하고 `supabase.auth.getSessionFromUrl()` 사용.

### 9. electron-builder-q.yml 동기화 (Low)

Q 빌드에도 `protocols` 섹션 추가 필요. Phase 2에서 두 config 파일 모두 수정해야 함.

### 10. preload.cjs 수동 동기화 (Low)

현재 `preload.ts`(소스)와 `preload.cjs`(런타임)가 별도 파일로 관리됨. 하나 수정하면 다른 하나도 반드시 동기화 필요. 빌드 시 자동 생성하는 방안 검토.

### 11. Refresh Token 만료 후 세션 복구 (Critical)

**Supabase 설정:** Refresh Token Expiry = 604800초 (7일)

**문제:** refresh token 만료 후 `getSession()` → null → 현재 로직은 `signInAnonymously()` → 새 trial org 생성. OAuth 유저가 7일 후 돌아오면 기존 org에 접근 못하고 새 anonymous 세션으로 전환됨. device_id swap으로 org 자체는 복구되지만, OAuth 연결이 끊기고 anonymous로 돌아감.

**해결 방안:**

```typescript
// localStorage에 마지막 로그인 방식 저장
const LAST_AUTH_PROVIDER_KEY = 'tutomate_last_auth_provider';

// signInWithOAuth 성공 시
localStorage.setItem(LAST_AUTH_PROVIDER_KEY, provider); // 'google' | 'kakao' | 'naver'

// deactivateCloud (로그아웃) 시
localStorage.removeItem(LAST_AUTH_PROVIDER_KEY);
```

`initialize()` 분기 수정:

```typescript
const { data: { session } } = await supabase.auth.getSession();

if (session) {
  // 기존 세션 → org 조회로 진행
} else {
  const lastProvider = localStorage.getItem(LAST_AUTH_PROVIDER_KEY);
  if (lastProvider) {
    // OAuth 유저의 세션 만료 → 재로그인 유도
    set({ loading: false, sessionExpired: true, lastProvider });
    // UI에서 "세션이 만료되었습니다. [Google로 다시 로그인]" 표시
    return;
  }
  // 첫 방문 또는 anonymous 유저 → 기존 anonymous 플로우
  await supabase.auth.signInAnonymously();
}
```

**authStore 상태 추가:**
```typescript
sessionExpired: boolean;      // true면 재로그인 UI 표시
lastProvider: string | null;  // 만료된 세션의 프로바이더
```

**UI (App.tsx):** `sessionExpired === true`일 때 Welcome 모달 대신 "세션 만료" 모달 표시. 재로그인 버튼 클릭 → `signInWithOAuth(lastProvider)` → 성공 시 `sessionExpired: false`.

### 12. 오프라인 상태에서 토큰 갱신 실패 (Medium)

앱 사용 중 네트워크 끊김 → access token 1시간 후 만료 → refresh 요청 실패.

**해결 방안:** Supabase 클라이언트가 자동으로 재시도함. 네트워크 복구 후 다음 API 호출 시 자동 갱신. 별도 구현 불필요하지만, 오프라인 상태에서 Supabase API 호출 실패 시 적절한 에러 메시지 표시 필요 (기존 에러 핸들링으로 충분할 수 있음).

## 하위 호환

- 기존 anonymous auth + device_id 플로우 **그대로 유지**
- OAuth 로그인 후에도 `create-trial-org(device_id)` 호출 → 기존 org에 새 user_id 연결 (기존 edge function의 swap 로직 활용)
- RLS 정책 변경 불필요 (`auth.uid()` → `user_organizations` 조회 동일)
- 라이선스 키 활성화 플로우 변경 불필요
- `activate-license` edge function에서도 `device_id` 기반 org 조회가 동작하므로 OAuth 유저도 라이선스 활성화 가능

## 구현 순서

1. Phase 1: OAuth 모듈 코어 (`src/lib/oauth/`)
2. Phase 2: Electron deep link 설정
3. Phase 3: authStore 통합
4. Phase 4: Naver Edge Function
5. Phase 5: UI (Welcome 모달 + Settings)
6. Phase 6: Supabase 대시보드 설정 + 테스트

## Action Items

### 수동 설정 (개발 전 선행 필요)

- [ ] Google Cloud Console — OAuth 2.0 클라이언트 ID 생성 (승인된 리디렉션 URI에 Supabase callback URL 추가)
- [ ] Kakao Developers — 앱 생성 + 카카오 로그인 활성화 + Redirect URI 등록
- [ ] Naver Developers — 앱 생성 + 네아로 API 등록 + Callback URL 등록
- [ ] Supabase 대시보드 — Authentication > Providers > Google 활성화 (client ID/secret 입력)
- [ ] Supabase 대시보드 — Authentication > Providers > Kakao 활성화 (REST API 키 입력)
- [ ] Supabase 대시보드 — Authentication > URL Configuration > Redirect URLs에 `tutomate://auth/callback` 추가
- [ ] Supabase 대시보드 — Authentication > Settings > Refresh Token Expiry → `604800` (7일)
- [ ] Supabase secrets 설정 — `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
- [ ] `.env` — `VITE_NAVER_CLIENT_ID` 추가

### 개발

- [ ] Phase 1: OAuth 모듈 코어 구현
- [ ] Phase 2: Electron deep link + IPC
- [ ] Phase 3: authStore OAuth 통합 + onAuthStateChange 수정
- [ ] Phase 3: authStore에 sessionExpired/lastProvider 상태 추가 + 세션 만료 재로그인 플로우
- [ ] Phase 4: Naver Edge Function 구현 및 배포
- [ ] Phase 5: Welcome 모달 OAuth 버튼 + Settings 계정 표시

### 테스트

- [ ] Deep link 수신 테스트 (`open "tutomate://auth/callback#..."`)
- [ ] 각 프로바이더 로그인 E2E 테스트
- [ ] Anonymous → OAuth 전환 시 기존 org 데이터 유지 확인
- [ ] 세션 만료 후 재로그인 플로우 확인
