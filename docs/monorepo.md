# TutorMate 모노레포 구조

## 개요

TutorMate 일반 버전과 Q 버전의 기능 분기를 위해 pnpm workspace 기반 모노레포로 구성.
UI 컴포넌트와 비즈니스 로직은 공유 패키지로 추상화하고, 각 앱은 자체 페이지/라우팅/설정을 가진다.

## 디렉토리 구조

```
tutomate/
├── pnpm-workspace.yaml
├── package.json                    # 루트 workspace 스크립트
├── tsconfig.base.json              # 공유 TypeScript 설정
├── .npmrc                          # shamefully-hoist=true
│
├── apps/
│   ├── tutomate/                   # 일반 버전 (@tutomate/app)
│   │   ├── package.json
│   │   ├── vite.config.ts          # electron-shared 참조, __APP_CONFIG__ 주입
│   │   ├── electron-builder.yml    # channel: latest
│   │   ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
│   │   ├── index.html
│   │   ├── .env
│   │   └── src/
│   │       ├── app.config.ts       # 앱별 설정값 (appName, deviceIdKey 등)
│   │       ├── main.tsx            # React 진입점
│   │       ├── App.tsx             # 라우팅, 레이아웃, 웰컴 모달
│   │       └── pages/             # 앱 전용 페이지 7개
│   │
│   └── tutomate-q/                 # Q 버전 (@tutomate/app-q)
│       ├── (동일 구조)
│       ├── electron-builder.yml    # channel: q-latest
│       └── src/
│           ├── app.config.ts       # Q 전용 설정 (appName: 'TutorMate Q' 등)
│           └── ...
│
├── packages/
│   ├── ui/                         # @tutomate/ui — 공유 UI 컴포넌트
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── components/         # 9개 카테고리, 21개 컴포넌트
│   │       ├── index.ts            # barrel export
│   │       └── index.css           # 공유 스타일
│   │
│   ├── core/                       # @tutomate/core — 공유 비즈니스 로직
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── stores/             # 9개 Zustand 스토어 + 테스트
│   │       ├── utils/              # 13개 유틸리티 + 테스트
│   │       ├── hooks/              # useAutoLock, useBackup
│   │       ├── types/              # 도메인 타입, Electron API 타입
│   │       ├── config/             # supabase, planLimits, appConfig, styles, version
│   │       └── index.ts            # barrel export
│   │
│   └── electron-shared/            # @tutomate/electron-shared — Electron 메인 프로세스
│       ├── package.json
│       ├── tsconfig.json
│       ├── build/                  # 앱 아이콘 (icns, ico, png)
│       └── src/
│           ├── main.ts             # Electron main process
│           ├── preload.cjs         # Preload script (CJS)
│           ├── updater.ts          # 자동 업데이트
│           └── ipc/                # IPC 핸들러 (file, backup, machineId, dialog)
│
├── e2e/                            # Playwright E2E 테스트
├── supabase/                       # Supabase Edge Functions, migrations
├── .github/workflows/build.yml     # CI/CD (pnpm, 태그 기반 분기)
└── docs/
```

## 패키지 의존 관계

```
@tutomate/ui ──depends──> @tutomate/core (stores, types 참조)

apps/tutomate   ──depends──> @tutomate/ui, @tutomate/core
apps/tutomate-q ──depends──> @tutomate/ui, @tutomate/core

@tutomate/electron-shared는 앱의 vite.config.ts에서 파일 경로로 참조
(workspace dependency가 아닌 entry point 경로 참조)
```

## 앱별 설정 주입

각 앱은 `src/app.config.ts`에서 설정을 정의하고, `vite.config.ts`의 `define`으로 주입한다.

```ts
// apps/tutomate/src/app.config.ts
export const appConfig = {
  appName: 'TutorMate',
  windowTitle: '수강생 관리 프로그램',
  defaultOrgName: '수강생 관리 프로그램',
  deviceIdKey: 'tutomate_device_id',
  licenseFormatHint: 'TMKH-XXXX-XXXX-XXXX',
  contactInfo: '010-3556-7586',
  welcomeTitle: 'TutorMate에 오신 것을 환영합니다!',
};

// apps/tutomate-q/src/app.config.ts
export const appConfig = {
  appName: 'TutorMate Q',
  windowTitle: 'TutorMate Q',
  defaultOrgName: 'TutorMate Q',
  deviceIdKey: 'tutomate_q_device_id',
  licenseFormatHint: 'TMQH-XXXX-XXXX-XXXX',
  contactInfo: '010-3556-7586',
  welcomeTitle: 'TutorMate Q에 오신 것을 환영합니다!',
};
```

```ts
// vite.config.ts (각 앱)
import { appConfig } from './src/app.config'

export default defineConfig({
  define: {
    __APP_CONFIG__: JSON.stringify(appConfig),
  },
  // ...
});
```

```ts
// packages/core/src/config/appConfig.ts (런타임에서 사용)
declare const __APP_CONFIG__: { ... };
export const appConfig = typeof __APP_CONFIG__ !== 'undefined' ? __APP_CONFIG__ : { /* fallback */ };
```

### appConfig 사용처

| 파일 | 사용 |
|------|------|
| `packages/core/src/config/version.ts` | `APP_NAME = appConfig.appName` |
| `packages/core/src/stores/settingsStore.ts` | `organizationName: appConfig.defaultOrgName` |
| `packages/core/src/stores/authStore.ts` | `localStorage key: appConfig.deviceIdKey` |
| `apps/*/src/App.tsx` | `welcomeTitle, contactInfo, licenseFormatHint` |

## 주요 커맨드

```bash
# 개발
pnpm dev              # 일반 버전 개발 서버 (port 5173)
pnpm dev:q            # Q 버전 개발 서버 (port 5174)

# 빌드
pnpm build            # 일반 버전 Vite 빌드
pnpm build:q          # Q 버전 Vite 빌드

# Electron 빌드
pnpm electron:build        # 일반 Mac+Win
pnpm electron:build:mac    # 일반 Mac only
pnpm electron:build:win    # 일반 Win only
pnpm electron:build:q      # Q Mac+Win
pnpm electron:build:q:mac  # Q Mac only
pnpm electron:build:q:win  # Q Win only

# 테스트
pnpm test             # 전체 단위 테스트 (234개, packages/core)
pnpm test:e2e         # E2E 테스트

# 기타
pnpm lint             # 전체 lint
pnpm install          # 의존성 설치
```

## CI/CD

`.github/workflows/build.yml`에서 태그 기반으로 빌드 대상을 결정한다.

- `v*` 태그 → 일반 버전 (`@tutomate/app`)
- `q-v*` 태그 → Q 버전 (`@tutomate/app-q`)
- `workflow_dispatch` → 수동으로 variant 선택

## 자동 업데이트 채널

```yaml
# apps/tutomate/electron-builder.yml
publish:
  provider: github
  owner: rlawlghkd12
  repo: tutomate
  channel: latest

# apps/tutomate-q/electron-builder.yml
publish:
  provider: github
  owner: rlawlghkd12
  repo: tutomate
  channel: q-latest
```

## Import 패턴

```tsx
// 앱에서 공유 패키지 사용
import { Layout, CourseForm, GlobalSearch } from '@tutomate/ui';
import { useCourseStore, useAuthStore, appConfig } from '@tutomate/core';
import type { Course, Enrollment } from '@tutomate/core';

// 앱 전용 페이지는 상대 경로
import DashboardPage from './pages/DashboardPage';
```

## Q 버전 분기 가이드

초기에는 두 앱의 pages/가 동일하지만, Q 버전에서 독자적으로:
- 새 페이지 추가 (예: 회원 관리)
- 기존 페이지 수정 (예: 수강생 폼에 필드 추가)
- 다른 라우팅 구성
- 공유 컴포넌트에 props로 분기가 필요하면 `@tutomate/ui`에 옵션 추가
