# ADR-002: Social OAuth Login (Google / Kakao / Naver)

**Status:** Draft
**Date:** 2026-03-18
**Updated:** 2026-03-31
**Deciders:** jrbr (TutorMate maintainer)

## Context

현재 TutorMate는 anonymous auth + device_id 방식으로 동작한다. 사용자 식별이 기기에 종속되어 있어 다중 기기 사용이 불가능하고, 기기 변경 시 데이터 접근이 어렵다. 소셜 로그인을 추가하여 사용자 계정 기반 인증을 지원한다.

### 현재 인증 플로우

```
App mount → getSession() → 세션 없으면 signInAnonymously()
→ user_organizations 조회 → 없으면 create-trial-org(device_id)
→ org 연결 완료 → loading: false
```

### 현재 onAuthStateChange (v0.4.4 기준)

```typescript
// packages/core/src/stores/authStore.ts (line 288-292)
// organizationId/plan/isCloud는 initialize()/activateCloud()/deactivateCloud()에서만 관리
if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.setState({ session });
  });
}
```

> **참고:** session null 시 org 상태를 초기화하지 않도록 v0.4.4에서 수정됨. OAuth 통합 시 이 기반 위에서 event 분기를 추가해야 함.

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
   (Q 앱: tutomate-q://auth/callback#...)
5. Electron이 deep link 수신 → IPC로 렌더러에 전달
6. supabase.auth.setSession() → 세션 설정
7. onAuthStateChange(SIGNED_IN) → initialize() → org 조회/생성
```

### Anonymous → OAuth 전환: linkIdentity 방식

Supabase의 `auth.linkIdentity()` API를 사용하여 **기존 anonymous 유저에 OAuth identity를 연결**한다.

```
Anonymous 유저 (user_id: abc) → Google OAuth linkIdentity
→ 같은 user_id(abc)에 Google identity 추가
→ user_organizations 매핑 그대로 유지
→ device_id swap 불필요
```

**장점:**
- `user_id`가 변경되지 않아 기존 `user_organizations`, RLS 정책 모두 그대로 동작
- `create-trial-org`의 device_id swap 로직에 의존하지 않음
- 단순하고 안전

**주의:**
- `linkIdentity()`는 현재 세션이 있어야 호출 가능. 세션 만료 후에는 새 유저로 생성됨 (섹션 11 참고).
- Supabase 대시보드에서 **Manual Linking 활성화** 필요: Authentication > Settings > `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED: true`
- **Naver는 linkIdentity 불가** — Supabase 네이티브 프로바이더가 아니므로 Edge Function 경유 시 별도 유저 생성됨 (Phase 4 참고).

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
→ Supabase admin으로 세션 토큰 발급
→ tutomate://auth/callback (또는 tutomate-q://) 으로 리다이렉트
```

> **참고:** `admin.auth.generateLink({ type: 'magiclink' })` 방식은 Supabase의 의도된 사용법이 아니므로, `admin.auth.createUser()` + `admin.auth.generateLink({ type: 'signup' })` 또는 Supabase Custom OIDC Provider 도입을 검토할 것.

## 파일 구조

### 새로 생성

```
packages/core/src/lib/oauth/              # 재사용 가능한 OAuth 모듈
  index.ts                                # Public exports
  types.ts                                # 타입/인터페이스
  OAuthManager.ts                         # 메인 오케스트레이터
  providers/
    base.ts                               # SupabaseNativeProvider 베이스 클래스
    google.ts                             # Google (Supabase 네이티브)
    kakao.ts                              # Kakao (Supabase 네이티브)
    naver.ts                              # Naver (Edge Function)
  utils/
    deeplink.ts                           # deep link URL 파싱

packages/electron-shared/src/ipc/authHandler.ts   # OAuth IPC 핸들러

supabase/functions/naver-auth/index.ts    # Naver OAuth Edge Function
```

### 수정

| 파일 | 변경 |
|------|------|
| `packages/electron-shared/src/main.ts` | 프로토콜 등록, `open-url`/`second-instance` deep link 처리 |
| `packages/electron-shared/src/preload.cjs` | `openOAuthUrl`, `onOAuthCallback` IPC 채널 추가 |
| `packages/electron-shared/src/preload.ts` | 동일 (소스 동기화) |
| `packages/core/src/types/electron.d.ts` | OAuth IPC 타입 추가 |
| `packages/core/src/stores/authStore.ts` | `signInWithOAuth`, `handleOAuthCallback` 메서드, `onAuthStateChange` 수정 |
| `apps/tutomate/src/App.tsx` | Welcome 모달에 OAuth 버튼, deep link 리스너 등록 |
| `apps/tutomate-q/src/App.tsx` | 동일 (tutomate와 동기화) |
| `apps/tutomate/src/pages/SettingsPage.tsx` | 계정 섹션에 소셜 로그인 상태 표시 |
| `apps/tutomate-q/src/pages/SettingsPage.tsx` | 동일 (tutomate와 동기화) |
| `apps/tutomate/electron-builder.yml` | `protocols` 섹션 추가 (`tutomate://`) |
| `apps/tutomate-q/electron-builder.yml` | `protocols` 섹션 추가 (`tutomate-q://`) |

## 구현 상세

### Phase 1: Electron Deep Link

> Deep link가 동작해야 OAuth 모듈 테스트가 가능하므로 가장 먼저 구현.

#### packages/electron-shared/src/main.ts 변경

```typescript
import { app, BrowserWindow, ipcMain, Menu, nativeImage } from 'electron';

// ─── 앱 스킴 결정 (appId 기반) ──────────────────
// tutomate 앱: 'tutomate', Q 앱: 'tutomate-q'
// electron-builder.yml의 appId로 구분
const APP_SCHEME = app.name.toLowerCase().includes('-q') ? 'tutomate-q' : 'tutomate';

// 프로토콜 등록 (app.ready 이전에 호출)
if (process.defaultApp) {
  // 개발 모드: electron 실행파일 경로 + 스크립트 경로 전달 필요
  app.setAsDefaultProtocolClient(APP_SCHEME, process.execPath, [
    path.resolve(process.argv[1])
  ]);
} else {
  app.setAsDefaultProtocolClient(APP_SCHEME);
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
  // deep link URL 추출 (argv에서 앱 스킴 찾기)
  const deepLinkUrl = argv.find(arg => arg.startsWith(`${APP_SCHEME}://`));
  if (deepLinkUrl && mainWindow) {
    mainWindow.webContents.send('oauth-callback', deepLinkUrl);
  }
});

// mainWindow 생성 직후: pending URL 전달
mainWindow.webContents.once('did-finish-load', () => {
  if (pendingDeepLinkUrl) {
    mainWindow!.webContents.send('oauth-callback', pendingDeepLinkUrl);
    pendingDeepLinkUrl = null;
  }
});
```

#### packages/electron-shared/src/ipc/authHandler.ts (신규)

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
      '.supabase.co',       // Supabase auth endpoint
    ];
    if (!allowed.some(domain => parsed.hostname.endsWith(domain))) {
      throw new Error(`Unauthorized OAuth URL: ${parsed.hostname}`);
    }
    await shell.openExternal(url);
  });
}
```

#### apps/tutomate/electron-builder.yml 추가

```yaml
protocols:
  - name: TutorMate
    schemes:
      - tutomate
```

#### apps/tutomate-q/electron-builder.yml 추가

```yaml
protocols:
  - name: TutorMate Q
    schemes:
      - tutomate-q
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

#### packages/core/src/types/electron.d.ts 추가

```typescript
openOAuthUrl(url: string): Promise<void>;
onOAuthCallback(callback: (url: string) => void): () => void;
```

### Phase 2: OAuth 모듈 코어

`packages/core/src/lib/oauth/` — Electron/Supabase에 직접 의존하지 않는 순수 모듈

- **types.ts**: `IOAuthProvider`, `OAuthConfig`, `OAuthCallbackResult` 등
- **utils/deeplink.ts**: callback URL에서 토큰/코드/에러 파싱 (`URL` / `URLSearchParams` 기반)
- **providers/base.ts**: Supabase 네이티브 프로바이더 베이스 (`signInWithOAuth` + `skipBrowserRedirect: true`)
- **providers/google.ts, kakao.ts**: 베이스 상속, 스코프 설정만
- **providers/naver.ts**: 네이버 OAuth URL 직접 생성
- **OAuthManager.ts**: 프로바이더 관리, `getAuthUrl()`, `handleCallback()`
- **index.ts**: 전체 export

### Phase 3: authStore 통합

#### 핵심 변경: onAuthStateChange 수정

현재 코드는 event 타입을 무시하고 session만 업데이트한다. OAuth 로그인 시 `SIGNED_IN` 이벤트에서 org를 재조회해야 한다.

```typescript
// 변경 전 (v0.4.4 현재)
supabase.auth.onAuthStateChange((_event, session) => {
  useAuthStore.setState({ session });
});

// 변경 후
supabase.auth.onAuthStateChange((event, session) => {
  useAuthStore.setState({ session });

  if (event === 'SIGNED_IN' && session) {
    // OAuth 로그인 등 새 세션 시작 시 org 재조회
    useAuthStore.getState().initialize();
  }
});
```

**주의:**
- `initialize()` 내부에서 `signInAnonymously()`를 호출하면 무한 루프 발생 가능. `initialize()` 시작 시 세션이 이미 있으면 anonymous 로그인을 스킵하는 가드가 필요.
- `initialize()` 동시 호출 방지 가드 필수 — `onAuthStateChange(SIGNED_IN)` + 정상 mount에서 동시 호출 시 `create-trial-org`가 2번 호출될 수 있음:

```typescript
initialize: async () => {
  if (get().loading) return; // 동시 호출 방지
  set({ loading: true });
  // ...
}
```

#### 새 메서드

```typescript
signInWithOAuth: async (provider: 'google' | 'kakao' | 'naver') => {
  set({ loading: true });

  const currentSession = useAuthStore.getState().session;

  if (currentSession) {
    // Anonymous 세션이 있으면 linkIdentity로 OAuth 연결
    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo: `${APP_SCHEME}://auth/callback`,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (isElectron() && data.url) {
      await window.electronAPI.openOAuthUrl(data.url);
    }
  } else {
    // 세션 없으면 새 OAuth 로그인
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${APP_SCHEME}://auth/callback`,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (isElectron() && data.url) {
      await window.electronAPI.openOAuthUrl(data.url);
    }
  }

  // localStorage에 마지막 로그인 방식 저장 (세션 만료 복구용)
  localStorage.setItem('tutomate_last_auth_provider', provider);
},

handleOAuthCallback: async (callbackUrl: string) => {
  const url = new URL(callbackUrl);
  const params = new URLSearchParams(url.hash.slice(1)); // #access_token=...
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const error = params.get('error');

  if (error) throw new Error(params.get('error_description') || error);
  if (!accessToken || !refreshToken) throw new Error('Missing tokens in callback');

  await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  // onAuthStateChange → SIGNED_IN → initialize() 자동 호출
},
```

### Phase 4: Naver Edge Function

`supabase/functions/naver-auth/index.ts`

1. `/callback` 엔드포인트: 네이버 auth code + state 수신
2. **state 파라미터 검증** (CSRF 방지)
3. 네이버 API로 토큰 교환 (`client_secret`은 서버에만)
4. 네이버 프로필 API로 유저 정보 조회
5. Supabase admin API로 유저 생성/조회 (`admin.auth.createUser` or `admin.auth.getUserByEmail`)
6. `admin.auth.generateLink({ type: 'signup' })` → verify URL 생성
7. 앱 스킴 (`tutomate://` 또는 `tutomate-q://`)으로 리다이렉트

**환경변수:**
- Supabase secrets: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
- 프론트: `VITE_NAVER_CLIENT_ID` (OAuth URL 생성용)

> **중요:** Naver는 Supabase 네이티브 프로바이더가 아니므로 `linkIdentity()`를 쓸 수 없다.
>
> **Naver 로그인 시 유저 전환 플로우:**
> 1. 기존 anonymous 세션이 있어도 Edge Function에서 `admin.createUser()` → 새 user_id 생성
> 2. 새 user_id에는 `user_organizations` 매핑이 없음
> 3. `create-trial-org(device_id)` 호출 → device_id로 기존 org 식별 불가 (새 유저이므로)
> 4. 새 trial org 생성됨 → **기존 데이터 접근 불가**
>
> **해결 방안:** `create-trial-org` Edge Function에 device_id 기반 org 이전 로직 추가:
> - 새 유저가 `create-trial-org(device_id)` 호출 시, 해당 device_id로 이미 연결된 org가 있으면
> - 기존 유저의 연결을 해제하고 새 유저에게 org를 이전 (기존 device_id swap 로직 확장)
>
> 또는 1차 출시에서 **Naver를 제외**하고 Google/Kakao만 지원 (둘 다 `linkIdentity` 사용 가능). Naver는 향후 Supabase Custom OIDC Provider 지원 시 전환 검토.

### Phase 5: UI

#### Welcome 모달 (apps/tutomate/src/App.tsx, apps/tutomate-q/src/App.tsx)

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

#### Settings 라이선스 탭 (apps/tutomate/src/pages/SettingsPage.tsx, apps/tutomate-q/src/pages/SettingsPage.tsx)

로그인 상태 표시: 이메일, 프로바이더 아이콘, 로그아웃 버튼

#### Deep Link 리스너 등록 (App.tsx)

```typescript
useEffect(() => {
  if (!isElectron()) return;
  const removeListener = window.electronAPI.onOAuthCallback((url) => {
    useAuthStore.getState().handleOAuthCallback(url).catch(handleError);
  });
  return removeListener;
}, []);
```

### Phase 6: 설정 & 테스트

**Supabase 대시보드:**
- Authentication > Providers: Google, Kakao 활성화
- Authentication > URL Configuration: Redirect URLs에 추가:
  - `tutomate://auth/callback`
  - `tutomate-q://auth/callback`

> **참고:** Supabase가 커스텀 스킴(`tutomate://`)을 Redirect URL로 허용하는지 사전 확인 필요. 불가 시 대안: `http://localhost:{임시포트}/auth/callback` + Electron 로컬 서버 방식.

**테스트:**
- `open "tutomate://auth/callback#access_token=test&refresh_token=test"` (deep link 수신 확인)
- 각 프로바이더 로그인 → 기존 org 데이터 유지 확인
- anonymous → OAuth 전환 시 `linkIdentity`로 user_id 유지 확인
- 세션 만료 후 재로그인 플로우 확인

## 보완 필요 사항

### 1. Anonymous → OAuth 유저 전환 시 세션 교체 문제 (Critical)

`linkIdentity()` 호출 시 브라우저가 열리고, 콜백으로 돌아올 때 `SIGNED_IN` 이벤트가 발생한다. 이 과정에서 UI가 깜빡이거나 잠깐 로딩 상태로 보일 수 있음.

**해결 방안:** `signInWithOAuth` 호출 시 `loading: true` 설정. `onAuthStateChange(SIGNED_IN)` → `initialize()` 완료 후 `loading: false`.

### 2. initialize() 무한 루프 방지 (Critical)

`onAuthStateChange(SIGNED_IN)` → `initialize()` → `signInAnonymously()` → `onAuthStateChange(SIGNED_IN)` 무한 루프 가능.

**해결 방안:** `initialize()` 시작 시 `getSession()`으로 세션 존재 여부 확인. 세션이 이미 있으면 anonymous 로그인 스킵하고 바로 org 조회로 진입.

```typescript
// initialize() 내부
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  // 세션 있음 → anonymous 스킵, org 조회로 직행
} else {
  await supabase.auth.signInAnonymously();
}
```

### 3. tutomate-q 딥링크 스킴 충돌 방지 (Critical)

두 앱이 같은 기기에 설치될 수 있으므로 반드시 다른 스킴을 사용해야 한다.

| 앱 | 스킴 | electron-builder.yml |
|----|------|---------------------|
| TutorMate | `tutomate://` | `apps/tutomate/electron-builder.yml` |
| TutorMate Q | `tutomate-q://` | `apps/tutomate-q/electron-builder.yml` |

Supabase Redirect URLs에 두 스킴 모두 등록 필요.

### 4. 개발 모드 Deep Link 등록 (Important)

`app.setAsDefaultProtocolClient`는 개발 모드에서 Electron 바이너리 경로가 다르다. `process.defaultApp` 체크로 분기 필요 (Phase 1에 반영 완료).

### 5. 앱 미로드 시 Deep Link 수신 (Important)

앱이 꺼진 상태에서 deep link로 실행되면 `mainWindow`가 아직 없다. pending URL을 저장하고 `did-finish-load` 후 전달 필요 (Phase 1에 반영 완료).

### 6. 복수 프로바이더 계정 연결 정책 (Medium)

사용자가 Google로 로그인 후 Kakao로 다시 로그인하면? `linkIdentity`를 사용하므로 동일 유저에 여러 identity가 연결된다.

**옵션:**
- A) `linkIdentity`로 동일 유저에 여러 프로바이더 연결 (현재 설계)
- B) Settings에서 연결된 계정 목록 표시 + 해제 UI 제공

**권장:** 1차 출시에서는 **Option A**. Settings에서 연결된 프로바이더 목록만 표시하고, 해제 기능은 추후 검토.

### 7. Naver Edge Function 보안 (Medium)

- **state 파라미터**: CSRF 방지를 위해 프론트에서 랜덤 state 생성 → localStorage 저장 → 콜백에서 검증
- **토큰 노출 방지**: Naver access_token은 Edge Function 내부에서만 사용하고 클라이언트에 노출하지 않음
- **Rate limiting**: Edge Function에 rate limit 적용 고려

### 8. OAuth 실패 시 UX (Medium)

- 시스템 브라우저 열렸지만 사용자가 취소한 경우: 앱으로 돌아와도 아무 일도 일어나지 않음 → 타임아웃이나 안내 메시지 필요?
- 네트워크 오류: callback URL에 error 파라미터 → 에러 토스트 표시
- 이미 다른 org에 연결된 소셜 계정: `linkIdentity` 사용 시 동일 유저이므로 문제 없음

**권장:** 1차 출시에서는 에러 파라미터 파싱 + 토스트만. 타임아웃 불필요 (사용자가 브라우저에서 자유롭게 행동 가능).

### 9. Supabase Redirect URL 커스텀 스킴 (확인됨)

Supabase는 커스텀 스킴(`tutomate://auth/callback`)을 Redirect URL로 허용한다. **exact match 필요** — 와일드카드 불가. Supabase 대시보드에서 두 URL을 정확히 등록해야 함:
- `tutomate://auth/callback`
- `tutomate-q://auth/callback`

### 10. Web 환경 지원 여부 (Low)

현재 설계는 Electron deep link 기반. 웹에서도 OAuth를 지원할 것인가?

**권장:** 현재 앱이 Electron 전용이므로 1차에서는 Electron만. 웹 지원 시 `redirectTo`를 웹 URL로 변경하고 `supabase.auth.getSessionFromUrl()` 사용.

### 11. Refresh Token 만료 후 세션 복구 (Critical)

**Supabase 설정:** Refresh Token Expiry = 604800초 (7일)

**문제:** refresh token 만료 후 `getSession()` → null. 현재 로직은 `signInAnonymously()` → 새 anonymous 세션 생성. OAuth 유저가 7일 후 돌아오면 기존 org에 접근 못하고 새 anonymous 세션으로 전환됨.

> **참고:** 세션 만료 후에는 `linkIdentity`가 불가능하므로 (기존 anonymous 세션이 없으므로) 새 OAuth 로그인 시 새 유저가 생성됨. 이 경우 `create-trial-org`의 device_id 기반 org 연결로 폴백.

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

### 12. 오프라인 상태에서 토큰 갱신 실패 (Low)

앱 사용 중 네트워크 끊김 → access token 1시간 후 만료 → refresh 요청 실패.

**해결 방안:** Supabase 클라이언트가 자동으로 재시도함. 네트워크 복구 후 다음 API 호출 시 자동 갱신. 별도 구현 불필요.

### 13. preload.cjs 수동 동기화 (Low)

현재 `preload.ts`(소스)와 `preload.cjs`(런타임)가 별도 파일로 관리됨. 하나 수정하면 다른 하나도 반드시 동기화 필요. 빌드 시 자동 생성하는 방안 검토.

## 하위 호환

- 기존 anonymous auth + device_id 플로우 **그대로 유지**
- OAuth 로그인 시 `linkIdentity()`로 기존 anonymous 유저에 identity 추가 → user_id 불변, org 매핑 유지
- 세션 만료 후 새 OAuth 로그인 시 device_id 기반 org 재연결로 폴백 (기존 edge function 활용)
- RLS 정책 변경 불필요 (`auth.uid()` → `user_organizations` 조회 동일)
- 라이선스 키 활성화 플로우 변경 불필요
- `activate-license` edge function에서도 `device_id` 기반 org 조회가 동작하므로 OAuth 유저도 라이선스 활성화 가능

## 구현 순서

1. Phase 1: Electron deep link 설정 (테스트 가능한 인프라 먼저)
2. Phase 2: OAuth 모듈 코어 (`packages/core/src/lib/oauth/`)
3. Phase 3: authStore 통합 + `onAuthStateChange` 수정
4. Phase 4: Naver Edge Function
5. Phase 5: UI (Welcome 모달 + Settings) — 양쪽 앱 모두
6. Phase 6: Supabase 대시보드 설정 + 테스트

## Action Items

### 수동 설정 (개발 전 선행 필요)

- [ ] Supabase Redirect URLs에 `tutomate://auth/callback` 허용 여부 확인 (확인됨: 커스텀 스킴 지원, exact match 필요)
- [ ] Supabase 대시보드 — Authentication > Settings > Manual Linking 활성화 (`GOTRUE_SECURITY_MANUAL_LINKING_ENABLED: true`)
- [ ] Google Cloud Console — OAuth 2.0 클라이언트 ID 생성 (승인된 리디렉션 URI에 Supabase callback URL 추가)
- [ ] Kakao Developers — 앱 생성 + 카카오 로그인 활성화 + Redirect URI 등록
- [ ] Naver Developers — 앱 생성 + 네아로 API 등록 + Callback URL 등록
- [ ] Supabase 대시보드 — Authentication > Providers > Google 활성화 (client ID/secret 입력)
- [ ] Supabase 대시보드 — Authentication > Providers > Kakao 활성화 (REST API 키 입력)
- [ ] Supabase 대시보드 — Authentication > URL Configuration > Redirect URLs에 `tutomate://auth/callback`, `tutomate-q://auth/callback` 추가
- [ ] Supabase secrets 설정 — `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
- [ ] `.env` — `VITE_NAVER_CLIENT_ID` 추가

### 개발

- [ ] Phase 1: Electron deep link + IPC + 프로토콜 등록
- [ ] Phase 2: OAuth 모듈 코어 구현
- [ ] Phase 3: authStore OAuth 통합 + onAuthStateChange 수정
- [ ] Phase 3: authStore에 sessionExpired/lastProvider 상태 추가 + 세션 만료 재로그인 플로우
- [ ] Phase 4: Naver Edge Function 구현 및 배포
- [ ] Phase 5: Welcome 모달 OAuth 버튼 + Settings 계정 표시 (tutomate + tutomate-q 양쪽)

### 테스트

- [ ] Deep link 수신 테스트 (`open "tutomate://auth/callback#..."`)
- [ ] tutomate-q Deep link 수신 테스트 (`open "tutomate-q://auth/callback#..."`)
- [ ] 각 프로바이더 로그인 E2E 테스트
- [ ] Anonymous → OAuth 전환 시 linkIdentity로 user_id 유지 확인
- [ ] 세션 만료 후 재로그인 플로우 확인
- [ ] 두 앱 동시 설치 시 딥링크 충돌 없음 확인
