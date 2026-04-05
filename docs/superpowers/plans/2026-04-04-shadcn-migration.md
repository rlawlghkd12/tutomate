# Ant Design → shadcn/ui 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ant Design을 shadcn/ui로 전면 교체 — 3개 앱(tutomate, tutomate-q, admin) 모두 대상. Big Bang 방식.

**Architecture:** Tailwind CSS + shadcn/ui (Radix 기반) + sonner (toast) + cmdk (command palette) + TanStack Table + React Hook Form + Zod. 공통 UI 컴포넌트는 `packages/ui/src/components/ui/`에 배치. 앱별 레이아웃은 기존 위치 유지.

**Tech Stack:** tailwindcss 4.x, @tailwindcss/vite, shadcn/ui, lucide-react, sonner, cmdk, @tanstack/react-table, react-hook-form, @hookform/resolvers, zod, class-variance-authority, clsx, tailwind-merge, react-day-picker

---

## File Structure

### 신규 생성 — 인프라

| 파일 | 역할 |
|------|------|
| `packages/ui/src/lib/utils.ts` | `cn()` 헬퍼 (clsx + tailwind-merge) |
| `packages/ui/src/components/ui/*.tsx` | shadcn 기본 컴포넌트 (Button, Input, Dialog, Select 등) |
| `packages/ui/src/components/ui/sonner.tsx` | Toast (Toaster) 컴포넌트 |
| `packages/ui/components.json` | shadcn/ui 설정 |
| `packages/ui/tailwind.config.ts` | Tailwind 설정 (CSS 변수, 다크모드) |
| `packages/ui/postcss.config.js` | PostCSS 설정 |

### 수정 대상 — 앱 진입점

| 파일 | 변경 |
|------|------|
| `apps/tutomate/vite.config.ts` | Tailwind Vite 플러그인 추가 |
| `apps/tutomate-q/vite.config.ts` | 동일 |
| `apps/admin/vite.config.ts` | 동일 |
| `apps/tutomate/src/App.tsx` | ConfigProvider → ThemeProvider, antd 임포트 제거 |
| `apps/tutomate-q/src/App.tsx` | 동일 |
| `apps/admin/src/App.tsx` | 동일 |
| `packages/ui/src/index.css` | antd 오버라이드 → Tailwind base + CSS 변수 |

### 수정 대상 — 컴포넌트 (22개)

| 파일 | 주요 변경 |
|------|----------|
| `packages/ui/src/components/common/Layout.tsx` | antd Layout/Sider/Header → Tailwind flex |
| `packages/ui/src/components/common/Navigation.tsx` | antd Menu → 커스텀 사이드바 |
| `packages/ui/src/components/common/ErrorBoundary.tsx` | antd Result/Button → shadcn Button + Tailwind |
| `packages/ui/src/components/common/LockScreen.tsx` | antd Input/Button/Typography → shadcn |
| `packages/ui/src/components/common/LicenseKeyInput.tsx` | antd Input/Space → shadcn Input + Tailwind |
| `packages/ui/src/components/common/UpdateChecker.tsx` | antd Modal/Progress → shadcn Dialog/Progress |
| `packages/ui/src/components/search/GlobalSearch.tsx` | antd Modal/Input/List → cmdk Command |
| `packages/ui/src/components/notification/NotificationCenter.tsx` | antd Dropdown/List/Badge → shadcn Popover |
| `packages/ui/src/components/courses/CourseForm.tsx` | antd Form → RHF + Zod + shadcn |
| `packages/ui/src/components/courses/CourseList.tsx` | antd Table → TanStack Table |
| `packages/ui/src/components/students/StudentForm.tsx` | antd Form → RHF + Zod + shadcn |
| `packages/ui/src/components/students/StudentList.tsx` | antd Table → TanStack Table |
| `packages/ui/src/components/students/EnrollmentForm.tsx` | antd Form → RHF + Zod + shadcn |
| `packages/ui/src/components/payment/PaymentForm.tsx` | antd Form → RHF + Zod + shadcn |
| `packages/ui/src/components/payment/BulkPaymentForm.tsx` | antd Modal/Form → shadcn Dialog + RHF |
| `packages/ui/src/components/payment/MonthlyPaymentTable.tsx` | antd Table + 인라인 편집 → TanStack Table |
| `packages/ui/src/components/payment/PaymentManagementTable.tsx` | antd Table → TanStack Table |
| `packages/ui/src/components/charts/CourseRevenueChart.tsx` | antd Empty → 커스텀 Empty |
| `packages/ui/src/components/charts/PaymentStatusChart.tsx` | antd Empty → 커스텀 Empty |
| `packages/ui/src/components/charts/MonthlyRevenueChart.tsx` | recharts 유지, 래퍼 스타일만 |
| `packages/ui/src/components/settings/AdminTab.tsx` | antd Card/Table/Select → shadcn |
| `packages/ui/src/components/backup/AutoBackupScheduler.tsx` | antd Card/Switch/InputNumber → shadcn |

---

## Task 1: Tailwind CSS + shadcn/ui 인프라 설치

**Files:**
- Create: `packages/ui/tailwind.config.ts`
- Create: `packages/ui/postcss.config.js`
- Create: `packages/ui/components.json`
- Create: `packages/ui/src/lib/utils.ts`
- Modify: `packages/ui/package.json`
- Modify: `apps/tutomate/vite.config.ts`
- Modify: `apps/tutomate-q/vite.config.ts`
- Modify: `apps/admin/vite.config.ts`

- [ ] **Step 1: Tailwind + 유틸리티 의존성 설치**

```bash
cd /Users/kjh/dev/tutomate
pnpm --filter @tutomate/ui add tailwindcss @tailwindcss/vite postcss autoprefixer class-variance-authority clsx tailwind-merge lucide-react
```

- [ ] **Step 2: shadcn/ui 의존성 설치**

```bash
pnpm --filter @tutomate/ui add react-hook-form @hookform/resolvers zod sonner cmdk @tanstack/react-table react-day-picker
```

- [ ] **Step 3: cn() 유틸리티 생성**

```ts
// packages/ui/src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: tailwind.config.ts 생성**

```ts
// packages/ui/tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx}',
    '../../apps/tutomate/src/**/*.{ts,tsx}',
    '../../apps/tutomate-q/src/**/*.{ts,tsx}',
    '../../apps/admin/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontSize: {
        base: 'var(--font-size-base, 14px)',
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: postcss.config.js 생성**

```js
// packages/ui/postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: components.json 생성**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 7: 각 앱 vite.config.ts에 Tailwind 플러그인 추가**

`apps/tutomate/vite.config.ts`에 `@tailwindcss/vite` 플러그인 추가:

```ts
import tailwindcss from '@tailwindcss/vite';
// plugins 배열에 tailwindcss() 추가 (react() 바로 뒤)
```

`apps/tutomate-q/vite.config.ts`와 `apps/admin/vite.config.ts`에도 동일하게 추가.

- [ ] **Step 8: shadcn 기본 컴포넌트 설치**

```bash
cd /Users/kjh/dev/tutomate/packages/ui
npx shadcn@latest add button input label dialog alert-dialog select checkbox switch radio-group tabs badge alert progress separator tooltip dropdown-menu popover card textarea scroll-area command
```

> 설치 시 components.json 경로를 참조. `src/components/ui/` 하위에 파일 생성됨.

- [ ] **Step 9: 빌드 확인**

```bash
cd /Users/kjh/dev/tutomate && pnpm --filter @tutomate/app build 2>&1 | tail -5
```

Expected: 빌드 성공 (antd와 shadcn이 아직 공존하는 상태)

- [ ] **Step 10: 커밋**

```bash
git add packages/ui/tailwind.config.ts packages/ui/postcss.config.js packages/ui/components.json packages/ui/src/lib/utils.ts packages/ui/src/components/ui/ packages/ui/package.json apps/tutomate/vite.config.ts apps/tutomate-q/vite.config.ts apps/admin/vite.config.ts pnpm-lock.yaml
git commit -m "chore: Tailwind CSS + shadcn/ui 인프라 설치"
```

---

## Task 2: CSS 변수 시스템 + 다크모드 + 글꼴 크기 + Toast

**Files:**
- Modify: `packages/ui/src/index.css`
- Create: `packages/ui/src/components/ui/sonner.tsx` (shadcn add로 이미 가능)
- Modify: `packages/core/src/stores/settingsStore.ts` (fontSize를 CSS 변수로 반영)

- [ ] **Step 1: index.css를 Tailwind base + CSS 변수로 교체**

기존 118줄의 antd 오버라이드 CSS를 완전히 교체한다:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 3.9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 3.9%;
    --radius: 0.5rem;
    --font-size-base: 14px;
  }

  .dark {
    --background: 0 0% 3.9%;
    --foreground: 0 0% 98%;
    --card: 0 0% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 0 0% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 0 0% 9%;
    --secondary: 0 0% 14.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 14.9%;
    --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 14.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 14.9%;
    --input: 0 0% 14.9%;
    --ring: 0 0% 83.1%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    font-size: var(--font-size-base);
  }
  html, body {
    height: 100%;
    overflow: hidden;
  }
  #root {
    height: 100%;
  }
}

/* 스크롤바 */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 5px;
  border: 2px solid transparent;
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover { background-color: rgba(0, 0, 0, 0.35); }
::-webkit-scrollbar-corner { background: transparent; }

.dark ::-webkit-scrollbar-thumb { background-color: rgba(255, 255, 255, 0.12); }
.dark ::-webkit-scrollbar-thumb:hover { background-color: rgba(255, 255, 255, 0.25); }

/* 종료된 강좌 행 */
.ended-course-row td { opacity: 0.55; }
```

- [ ] **Step 2: settingsStore의 theme/fontSize를 HTML에 반영하는 로직 확인**

기존 App.tsx에서 `document.documentElement.setAttribute('data-theme', theme)` → `document.documentElement.classList.toggle('dark', theme === 'dark')` 로 변경이 필요하지만, 이는 Task 7 (앱 진입점 전환)에서 처리.

현재 단계에서는 settingsStore의 fontSize 반영을 CSS 변수 기반으로 전환한다:

```ts
// settingsStore.ts의 setFontSize() 안에서:
const fontSizeMap = { small: 12, medium: 14, large: 16, 'extra-large': 18 };
document.documentElement.style.setProperty('--font-size-base', `${fontSizeMap[size]}px`);
```

- [ ] **Step 3: sonner 설치 (Toast)**

```bash
cd /Users/kjh/dev/tutomate/packages/ui && npx shadcn@latest add sonner
```

- [ ] **Step 4: 커밋**

```bash
git add packages/ui/src/index.css packages/ui/src/components/ui/sonner.tsx packages/core/src/stores/settingsStore.ts
git commit -m "feat: CSS 변수 시스템 + 다크모드 + 글꼴 크기 + sonner toast"
```

---

## Task 3: 레이아웃 쉘 — 사이드바 + 헤더

**Files:**
- Modify: `packages/ui/src/components/common/Layout.tsx`
- Modify: `packages/ui/src/components/common/Navigation.tsx`

- [ ] **Step 1: Navigation.tsx → Tailwind 사이드바 네비게이션으로 전환**

antd `Menu` 컴포넌트를 제거하고, Tailwind로 직접 구현한다.

```tsx
// packages/ui/src/components/common/Navigation.tsx
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, User, Calendar, DollarSign, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

interface NavigationProps {
  collapsed?: boolean;
}

const menuItems = [
  { key: '/', icon: LayoutDashboard, label: '대시보드' },
  { key: '/courses', icon: BookOpen, label: '강좌 관리' },
  { key: '/students', icon: User, label: '수강생 관리' },
  { key: '/calendar', icon: Calendar, label: '캘린더' },
  { key: '/revenue', icon: DollarSign, label: '수익 관리' },
  { key: '/settings', icon: Settings, label: '설정' },
];

const Navigation: React.FC<NavigationProps> = ({ collapsed = false }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/') return '/';
    return '/' + path.split('/').filter(Boolean)[0];
  };

  const selectedKey = getSelectedKey();

  return (
    <nav className="flex flex-col gap-1 px-2">
      {menuItems.map((item) => {
        const Icon = item.icon;
        const isActive = selectedKey === item.key;
        return (
          <button
            key={item.key}
            onClick={() => navigate(item.key)}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground',
              collapsed && 'justify-center px-2',
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </button>
        );
      })}
    </nav>
  );
};

export default Navigation;
```

- [ ] **Step 2: Layout.tsx → Tailwind flex 레이아웃으로 전환**

antd `Layout`, `Sider`, `Header`, `Content`를 모두 제거하고 Tailwind div로 대체한다.

핵심 구조:
```tsx
<div className="flex h-screen">
  {/* 사이드바 — 220px 고정 */}
  <aside className={cn(
    'fixed left-0 top-0 bottom-0 flex flex-col border-r bg-background transition-all duration-200',
    collapsed ? 'w-[60px]' : 'w-[180px]',
  )}>
    <div className="h-4" />
    <Navigation collapsed={collapsed} />
    {/* 하단: 체험판 태그 */}
  </aside>

  {/* 메인 영역 */}
  <div className={cn(
    'flex flex-1 flex-col transition-all duration-200',
    collapsed ? 'ml-[60px]' : 'ml-[180px]',
  )}>
    {/* 헤더 — 48px */}
    <header className="flex h-12 items-center justify-between border-b bg-background px-4">
      {/* 토글 + breadcrumb */}
      {/* NotificationCenter */}
    </header>

    {/* 오프라인 알림 */}

    {/* 콘텐츠 */}
    <main className="flex-1 overflow-y-auto overflow-x-hidden bg-background p-6">
      {children}
    </main>
  </div>
</div>
```

antd `theme.useToken()` 제거. CSS 변수 기반으로 색상 참조. `Alert` → 간단한 div + `AlertTriangle` 아이콘. `Tag` → shadcn `Badge`. `Button` → shadcn `Button`. 아이콘: `MenuFoldOutlined` → `PanelLeftClose`, `MenuUnfoldOutlined` → `PanelLeftOpen`, `RightOutlined` → `ChevronRight`, `WifiOutlined` → `Wifi`.

- [ ] **Step 3: 빌드 확인**

```bash
pnpm --filter @tutomate/app build 2>&1 | tail -5
```

> 이 시점에서 다른 컴포넌트들은 아직 antd를 사용하므로 antd를 아직 제거하지 않는다.

- [ ] **Step 4: 커밋**

```bash
git add packages/ui/src/components/common/Layout.tsx packages/ui/src/components/common/Navigation.tsx
git commit -m "feat: 레이아웃 쉘 Tailwind 전환 — 사이드바 + 헤더"
```

---

## Task 4: 공통 컴포넌트 전환 — ErrorBoundary, LockScreen, UpdateChecker, LicenseKeyInput

**Files:**
- Modify: `packages/ui/src/components/common/ErrorBoundary.tsx`
- Modify: `packages/ui/src/components/common/LockScreen.tsx`
- Modify: `packages/ui/src/components/common/UpdateChecker.tsx`
- Modify: `packages/ui/src/components/common/LicenseKeyInput.tsx`

- [ ] **Step 1: ErrorBoundary.tsx 전환**

antd `Result`, `Button` → shadcn `Button` + Tailwind 레이아웃. 기존 동작 100% 유지. `Result` 컴포넌트는 shadcn에 없으므로 div + 아이콘 + 텍스트로 직접 구현.

```tsx
// 에러 fallback 영역
<div className="flex min-h-screen items-center justify-center p-5">
  <div className="text-center">
    <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
    <h2 className="mt-4 text-lg font-semibold">문제가 발생했습니다</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      예상치 못한 오류가 발생했습니다. 페이지를 새로고침하거나 다시 시도해주세요.
    </p>
    <div className="mt-6 flex justify-center gap-3">
      <Button onClick={this.handleReset}>다시 시도</Button>
      <Button variant="outline" onClick={() => window.location.reload()}>
        페이지 새로고침
      </Button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: LockScreen.tsx 전환**

antd `Input.Password`, `Button`, `Typography` → shadcn `Input`, `Button` + Tailwind. `LockOutlined` → `Lock` (lucide). shake 애니메이션은 Tailwind의 `animate-` 커스텀 또는 기존 인라인 `@keyframes` 유지.

- [ ] **Step 3: UpdateChecker.tsx 전환**

antd `Modal`, `Progress`, `Button`, `Typography`, `Space` → shadcn `Dialog`, `Progress`, `Button` + Tailwind.

- [ ] **Step 4: LicenseKeyInput.tsx 전환**

antd `Input`, `Space`, `Typography` → shadcn `Input` + Tailwind `flex gap-2`.

- [ ] **Step 5: 빌드 확인**

```bash
pnpm --filter @tutomate/app build 2>&1 | tail -5
```

- [ ] **Step 6: 커밋**

```bash
git add packages/ui/src/components/common/ErrorBoundary.tsx packages/ui/src/components/common/LockScreen.tsx packages/ui/src/components/common/UpdateChecker.tsx packages/ui/src/components/common/LicenseKeyInput.tsx
git commit -m "feat: 공통 컴포넌트 shadcn 전환 — ErrorBoundary, LockScreen, UpdateChecker, LicenseKeyInput"
```

---

## Task 5: GlobalSearch + NotificationCenter 전환

**Files:**
- Modify: `packages/ui/src/components/search/GlobalSearch.tsx`
- Modify: `packages/ui/src/components/notification/NotificationCenter.tsx`

- [ ] **Step 1: GlobalSearch.tsx → cmdk Command로 전환**

antd `Modal` + `Input` + `List` + `Select` → shadcn `CommandDialog` + `CommandInput` + `CommandList` + `CommandGroup` + `CommandItem`.

핵심 변경:
- `Modal` → `CommandDialog` (open/onOpenChange)
- 카테고리 필터(`Select`) → `CommandGroup`으로 자동 그룹핑
- 검색 결과 목록 → `CommandItem` (키보드 네비게이션 자동 지원)
- `Cmd+K` 단축키: `useGlobalSearch` hook은 유지, `CommandDialog`에 open 바인딩

```tsx
<CommandDialog open={visible} onOpenChange={(open) => !open && onClose()}>
  <CommandInput placeholder="강좌, 수강생, 수강 신청 검색..." />
  <CommandList>
    <CommandEmpty>검색 결과가 없습니다</CommandEmpty>
    <CommandGroup heading="강좌">
      {courseResults.map(r => (
        <CommandItem key={r.id} onSelect={() => handleSelect(r)}>
          <BookOpen className="mr-2 h-4 w-4" />
          {r.title}
        </CommandItem>
      ))}
    </CommandGroup>
    {/* student, enrollment 그룹도 동일 */}
  </CommandList>
</CommandDialog>
```

기존 `searchField` 필터(전체/강좌/수강생/수강신청)는 `CommandGroup`으로 대체되므로 별도 Select 불필요. 단, 사용자가 카테고리 단독 검색을 원하는 경우를 위해 Command 상단에 필터 탭 추가를 고려 — 스펙에서 "카테고리별 그룹핑은 CommandGroup으로 매핑"이므로 일단 그룹핑만 적용.

- [ ] **Step 2: NotificationCenter.tsx → shadcn Popover로 전환**

antd `Badge` + `Dropdown` + `List` → shadcn `Popover` + `Button` + 커스텀 리스트.

- `Badge` → `Button` 위에 상대 위치 빨간 점 (Tailwind)
- `Dropdown` → `Popover` + `PopoverTrigger` + `PopoverContent`
- `List` → div 리스트 + `ScrollArea`
- 아이콘: `BellOutlined` → `Bell`, `CheckOutlined` → `Check`, `DeleteOutlined` → `Trash2`, `WarningOutlined` → `AlertTriangle`, `DollarOutlined` → `DollarSign`, `InfoCircleOutlined` → `Info`

- [ ] **Step 3: 빌드 확인**

```bash
pnpm --filter @tutomate/app build 2>&1 | tail -5
```

- [ ] **Step 4: 커밋**

```bash
git add packages/ui/src/components/search/GlobalSearch.tsx packages/ui/src/components/notification/NotificationCenter.tsx
git commit -m "feat: GlobalSearch(cmdk) + NotificationCenter(Popover) shadcn 전환"
```

---

## Task 6: 폼 컴포넌트 전환 — CourseForm, EnrollmentForm, PaymentForm, BulkPaymentForm

**Files:**
- Modify: `packages/ui/src/components/courses/CourseForm.tsx`
- Modify: `packages/ui/src/components/students/EnrollmentForm.tsx`
- Modify: `packages/ui/src/components/payment/PaymentForm.tsx`
- Modify: `packages/ui/src/components/payment/BulkPaymentForm.tsx`

- [ ] **Step 1: shadcn Form 컴포넌트 설치**

```bash
cd /Users/kjh/dev/tutomate/packages/ui && npx shadcn@latest add form
```

- [ ] **Step 2: CourseForm.tsx 전환**

antd `Modal` + `Form` + `Form.Item` + `Input` + `InputNumber` + `DatePicker` + `TimePicker` + `Checkbox` → shadcn `Dialog` + RHF `useForm` + Zod schema + shadcn `Form`/`FormField`/`FormItem`/`FormLabel`/`FormMessage` + shadcn `Input` + `react-day-picker`.

Zod schema 예시:
```ts
const courseSchema = z.object({
  name: z.string().min(1, '강좌명을 입력하세요'),
  fee: z.number().min(0, '수강료는 0 이상이어야 합니다'),
  maxStudents: z.number().min(1, '최소 1명'),
  days: z.array(z.number()).min(1, '요일을 선택하세요'),
  startTime: z.string().min(1, '시작 시간을 선택하세요'),
  endTime: z.string().min(1, '종료 시간을 선택하세요'),
  startDate: z.string().min(1, '시작일을 선택하세요'),
});
```

antd `TimePicker` → shadcn에 기본 없음. `<Input type="time" />` 사용 (HTML5 네이티브) — 60대 이상 사용자에게 직관적.

`message.success/error` → `toast.success/error` (sonner).

- [ ] **Step 3: EnrollmentForm.tsx 전환**

antd `Modal` + `Form` + `Select` → shadcn `Dialog` + RHF + Zod + shadcn `Select` (또는 Combobox for search).

학생/과목 선택에 검색이 필요하므로 `Command` (cmdk) 기반 Combobox 패턴 사용:
```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" role="combobox">
      {selectedStudent ? selectedStudent.name : '학생 선택...'}
    </Button>
  </PopoverTrigger>
  <PopoverContent>
    <Command>
      <CommandInput placeholder="학생 검색..." />
      <CommandList>
        {students.map(s => (
          <CommandItem key={s.id} onSelect={() => field.onChange(s.id)}>
            {s.name}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

- [ ] **Step 4: PaymentForm.tsx 전환**

antd `Modal` + `Form` + `InputNumber` + `DatePicker` + `Select` + `Popconfirm` → shadcn `Dialog` + RHF + Zod + shadcn 컴포넌트 + `AlertDialog` (삭제 확인).

`DatePicker` → `react-day-picker` + `Popover` 패턴 (shadcn date-picker 패턴).

- [ ] **Step 5: BulkPaymentForm.tsx 전환**

antd `Modal` + `Form` + `InputNumber` + `Radio` + `Divider` → shadcn `Dialog` + RHF + shadcn `RadioGroup` + `Separator`.

- [ ] **Step 6: 빌드 확인**

```bash
pnpm --filter @tutomate/app build 2>&1 | tail -5
```

- [ ] **Step 7: 커밋**

```bash
git add packages/ui/src/components/courses/CourseForm.tsx packages/ui/src/components/students/EnrollmentForm.tsx packages/ui/src/components/payment/PaymentForm.tsx packages/ui/src/components/payment/BulkPaymentForm.tsx
git commit -m "feat: 폼 컴포넌트 shadcn 전환 — CourseForm, EnrollmentForm, PaymentForm, BulkPaymentForm"
```

---

## Task 7: StudentForm 전환 (가장 복잡한 폼)

**Files:**
- Modify: `packages/ui/src/components/students/StudentForm.tsx`

별도 태스크로 분리 — 가장 복잡한 폼이며 동적 필드, 수강 목록, 납부 이력 표시가 포함.

- [ ] **Step 1: StudentForm 소스 전체 읽기**

`packages/ui/src/components/students/StudentForm.tsx` 전체를 읽고, 모든 antd 컴포넌트 사용처, 동적 필드 로직, 유효성 검증 규칙을 파악한다.

- [ ] **Step 2: Zod schema 정의**

```ts
const studentSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요'),
  phone: z.string().optional(),
  parentPhone: z.string().optional(),
  school: z.string().optional(),
  grade: z.number().optional(),
  birthDate: z.string().optional(),
  notes: z.string().optional(),
});
```

- [ ] **Step 3: 전환 구현**

- antd `Form` + `Form.Item` → RHF `useForm()` + Zod + shadcn `Form`
- antd `AutoComplete` → shadcn Combobox (Command + Popover)
- antd `Row`/`Col` → Tailwind `grid grid-cols-2 gap-4`
- antd `Switch` → shadcn `Switch`
- antd `Tag` → shadcn `Badge`
- antd `Alert` → shadcn `Alert`
- `DeleteOutlined` → `Trash2`
- `message.success/error` → `toast.success/error`
- 동적 수강 목록: RHF `useFieldArray` (필요 시)
- 납부 이력 표시: 읽기 전용 영역, Tailwind 스타일링
- 전화번호 포맷팅: `onChange` 핸들러에서 `formatPhone()` 호출 (기존 로직 유지)

- [ ] **Step 4: 빌드 확인**

```bash
pnpm --filter @tutomate/app build 2>&1 | tail -5
```

- [ ] **Step 5: 커밋**

```bash
git add packages/ui/src/components/students/StudentForm.tsx
git commit -m "feat: StudentForm shadcn 전환 — RHF + Zod + 동적 필드"
```

---

## Task 8: 테이블/리스트 컴포넌트 전환 — CourseList, StudentList

**Files:**
- Modify: `packages/ui/src/components/courses/CourseList.tsx`
- Modify: `packages/ui/src/components/students/StudentList.tsx`

- [ ] **Step 1: TanStack Table DataTable 공통 컴포넌트 생성**

shadcn의 data-table 패턴을 따라 `packages/ui/src/components/ui/data-table.tsx` 생성:

```tsx
// packages/ui/src/components/ui/data-table.tsx
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  // 추가 옵션: 검색, 필터, 페이지네이션 등
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                데이터가 없습니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: shadcn table 컴포넌트 설치**

```bash
cd /Users/kjh/dev/tutomate/packages/ui && npx shadcn@latest add table
```

- [ ] **Step 3: CourseList.tsx 전환**

antd `Table` + `Tag` + `Progress` + `Input` + `Select` + `Row`/`Col` + `Empty` + `Tabs` + `Badge` → TanStack Table `DataTable` + shadcn `Tabs` + shadcn `Badge` + shadcn `Input` + shadcn `Select` + Tailwind grid.

- `SearchOutlined` → `Search` (lucide)
- antd `Table` columns → TanStack `ColumnDef[]`
- `Table`의 `onRow` + `onClick` → `TableRow` onClick
- 빈 상태 → DataTable 내부 빈 행 또는 커스텀 Empty 컴포넌트

- [ ] **Step 4: StudentList.tsx 전환**

CourseList와 동일 패턴. antd `Table` + `Tooltip` → TanStack DataTable + shadcn `Tooltip`.

- [ ] **Step 5: 빌드 확인**

```bash
pnpm --filter @tutomate/app build 2>&1 | tail -5
```

- [ ] **Step 6: 커밋**

```bash
git add packages/ui/src/components/ui/data-table.tsx packages/ui/src/components/ui/table.tsx packages/ui/src/components/courses/CourseList.tsx packages/ui/src/components/students/StudentList.tsx
git commit -m "feat: CourseList, StudentList TanStack Table 전환"
```

---

## Task 9: 납부 테이블 전환 — MonthlyPaymentTable, PaymentManagementTable (가장 복잡)

**Files:**
- Modify: `packages/ui/src/components/payment/MonthlyPaymentTable.tsx`
- Modify: `packages/ui/src/components/payment/PaymentManagementTable.tsx`

- [ ] **Step 1: MonthlyPaymentTable 소스 전체 읽기**

가장 복잡한 컴포넌트. 인라인 편집(InputNumber, Select, DatePicker) + Popconfirm + 통계 영역 포함.

- [ ] **Step 2: MonthlyPaymentTable.tsx 전환**

핵심 변경:
- antd `Table` → TanStack Table
- 인라인 편집: 셀 클릭 시 해당 셀만 editable로 전환 (React state 관리)
  - `InputNumber` → `<Input type="number" />` + blur/Enter 이벤트
  - `Select` (납부방법) → shadcn `Select` in Popover
  - `DatePicker` → `react-day-picker` in Popover
- `Popconfirm` → shadcn `AlertDialog`
- 상단 통계: Tailwind `grid grid-cols-4 gap-4` + `Card`
- `CalendarOutlined` → `Calendar`
- `Tag` → `Badge`
- `message.success/error` → `toast.success/error`
- `Row`/`Col` → Tailwind grid/flex
- `Empty` → 커스텀 빈 상태

인라인 편집 패턴:
```tsx
// 셀 state 관리
const [editingCell, setEditingCell] = useState<{ rowId: string; column: string } | null>(null);

// 컬럼 정의에서 cell 렌더러
cell: ({ row }) => {
  const isEditing = editingCell?.rowId === row.id && editingCell?.column === 'amount';
  if (isEditing) {
    return (
      <Input
        type="number"
        defaultValue={row.original.amount}
        autoFocus
        onBlur={(e) => {
          handleSave(row.id, 'amount', Number(e.target.value));
          setEditingCell(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setEditingCell(null);
        }}
      />
    );
  }
  return (
    <span
      className="cursor-pointer hover:text-primary"
      onClick={() => setEditingCell({ rowId: row.id, column: 'amount' })}
    >
      {row.original.amount.toLocaleString()}원
    </span>
  );
},
```

- [ ] **Step 3: PaymentManagementTable.tsx 전환**

MonthlyPaymentTable보다 단순. antd `Table` + 필터 → TanStack DataTable + shadcn `Select` (필터).
`DeleteOutlined` → `Trash2`.

- [ ] **Step 4: 빌드 확인**

```bash
pnpm --filter @tutomate/app build 2>&1 | tail -5
```

- [ ] **Step 5: 커밋**

```bash
git add packages/ui/src/components/payment/MonthlyPaymentTable.tsx packages/ui/src/components/payment/PaymentManagementTable.tsx
git commit -m "feat: MonthlyPaymentTable, PaymentManagementTable TanStack Table 전환"
```

---

## Task 10: 차트 + 나머지 컴포넌트 전환

**Files:**
- Modify: `packages/ui/src/components/charts/CourseRevenueChart.tsx`
- Modify: `packages/ui/src/components/charts/PaymentStatusChart.tsx`
- Modify: `packages/ui/src/components/charts/MonthlyRevenueChart.tsx`
- Modify: `packages/ui/src/components/settings/AdminTab.tsx`
- Modify: `packages/ui/src/components/backup/AutoBackupScheduler.tsx`

- [ ] **Step 1: 커스텀 Empty 컴포넌트 생성**

antd `Empty`를 대체하는 간단한 공통 컴포넌트:

```tsx
// packages/ui/src/components/ui/empty.tsx
import { InboxIcon } from 'lucide-react';

interface EmptyProps {
  description?: string;
  className?: string;
}

export function Empty({ description = '데이터가 없습니다', className }: EmptyProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-10 text-muted-foreground', className)}>
      <InboxIcon className="h-10 w-10 mb-3 opacity-50" />
      <p className="text-sm">{description}</p>
    </div>
  );
}
```

- [ ] **Step 2: 차트 컴포넌트 전환 (3개)**

recharts는 그대로 유지. antd `Empty` → 커스텀 `Empty` 교체만 하면 됨.

- `CourseRevenueChart.tsx`: `import { Empty } from 'antd'` → `import { Empty } from '../ui/empty'`
- `PaymentStatusChart.tsx`: 동일
- `MonthlyRevenueChart.tsx`: antd 임포트 없으면 변경 불필요

- [ ] **Step 3: AdminTab.tsx 전환**

antd `Card` + `Space` + `Typography` + `Button` + `Table` + `Input` + `Select` + `Tag` + `message` + `Divider` → shadcn `Card` + shadcn `Button` + DataTable + shadcn `Input` + shadcn `Select` + `Badge` + `toast` + `Separator`.

`CopyOutlined` → `Copy`, `ReloadOutlined` → `RefreshCw`.

- [ ] **Step 4: AutoBackupScheduler.tsx 전환**

antd `Card` + `Switch` + `InputNumber` + `Space` + `Typography` + `message` + `Alert` → shadcn `Card` + shadcn `Switch` + shadcn `Input type="number"` + `toast` + shadcn `Alert`.

- [ ] **Step 5: 빌드 확인**

```bash
pnpm --filter @tutomate/app build 2>&1 | tail -5
```

- [ ] **Step 6: 커밋**

```bash
git add packages/ui/src/components/ui/empty.tsx packages/ui/src/components/charts/ packages/ui/src/components/settings/AdminTab.tsx packages/ui/src/components/backup/AutoBackupScheduler.tsx
git commit -m "feat: 차트(Empty), AdminTab, AutoBackupScheduler shadcn 전환"
```

---

## Task 11: 앱 진입점 전환 — App.tsx (3개 앱)

**Files:**
- Modify: `apps/tutomate/src/App.tsx`
- Modify: `apps/tutomate-q/src/App.tsx`
- Modify: `apps/admin/src/App.tsx`

- [ ] **Step 1: tutomate App.tsx 전환**

주요 변경:
1. `ConfigProvider` + `koKR` locale + `App as AntApp` 제거
2. `antdTheme.darkAlgorithm` → `document.documentElement.classList.toggle('dark')`
3. `Modal.confirm` → `AlertDialog` 컴포넌트 방식
4. `message.success/error/warning` → `toast.success/error/warning` (sonner)
5. `Spin` → Tailwind spinner 또는 lucide `Loader2` 아이콘 with animate-spin
6. antd `Button`, `Typography`, `Space`, `Modal` 임포트 제거
7. `<Toaster />` 추가 (sonner)

다크모드 전환:
```tsx
useEffect(() => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}, [theme]);
```

글꼴 크기:
```tsx
useEffect(() => {
  const fontSizeMap = { small: 12, medium: 14, large: 16, 'extra-large': 18 };
  document.documentElement.style.setProperty('--font-size-base', `${fontSizeMap[fontSize]}px`);
}, [fontSize]);
```

로그인 화면: antd `Button` + `Space` + `Typography` → shadcn `Button` + Tailwind flex + Tailwind text. 스타일은 Tailwind 클래스로 교체.

라이선스 모달: antd `Modal` → shadcn `Dialog` (open/footer/closable 매핑).

`Modal.confirm` (데이터 이전 확인):
```tsx
// antd Modal.confirm 패턴 → AlertDialog 컴포넌트 상태 관리
const [showMigrateDialog, setShowMigrateDialog] = useState(false);
const [migrateResolve, setMigrateResolve] = useState<((v: boolean) => void) | null>(null);

// 호출부
const migrate = await new Promise<boolean>((resolve) => {
  setMigrateResolve(() => resolve);
  setShowMigrateDialog(true);
});

// JSX
<AlertDialog open={showMigrateDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>기존 데이터 이전</AlertDialogTitle>
      <AlertDialogDescription>
        기존 데이터를 라이선스 계정으로 이전하시겠습니까?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => { migrateResolve?.(false); setShowMigrateDialog(false); }}>
        새로 시작
      </AlertDialogCancel>
      <AlertDialogAction onClick={() => { migrateResolve?.(true); setShowMigrateDialog(false); }}>
        이전
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 2: tutomate-q App.tsx 전환**

tutomate와 동일한 변경 적용. 두 앱의 App.tsx는 거의 동일하므로 같은 패턴.

- [ ] **Step 3: admin App.tsx 전환**

별도 구조:
- `ConfigProvider` + `AntApp` 제거
- `Layout` + `Sider` + `Menu` → Tailwind flex + 커스텀 사이드바 (Task 3과 유사하지만 Admin 전용 메뉴)
- `DashboardOutlined` → `LayoutDashboard`, `UserOutlined` → `User`, `KeyOutlined` → `Key`, `TeamOutlined` → `Users`, `LogoutOutlined` → `LogOut`
- `Spin` → Tailwind spinner
- 로그인 화면: tutomate와 동일 패턴

- [ ] **Step 4: 각 앱 main.tsx에서 antd import 정리**

`@tutomate/ui/src/index.css` 임포트는 유지 (Tailwind로 교체됨).

- [ ] **Step 5: 빌드 확인 (3개 앱 모두)**

```bash
pnpm --filter @tutomate/app build 2>&1 | tail -5
pnpm --filter @tutomate/app-q build 2>&1 | tail -5
cd /Users/kjh/dev/tutomate/apps/admin && pnpm build 2>&1 | tail -5
```

- [ ] **Step 6: 커밋**

```bash
git add apps/tutomate/src/App.tsx apps/tutomate-q/src/App.tsx apps/admin/src/App.tsx
git commit -m "feat: 3개 앱 진입점 shadcn 전환 — ConfigProvider 제거, 다크모드 class 전환"
```

---

## Task 12: antd 제거 + 최종 정리

**Files:**
- Modify: `packages/ui/package.json` (antd, @ant-design/icons 제거)
- Modify: `apps/tutomate/package.json` (antd 제거)
- Modify: `apps/tutomate-q/package.json` (antd 제거)
- Modify: `apps/admin/package.json` (antd 있으면 제거)
- Modify: `packages/ui/src/index.ts` (export 정리)
- Modify: `packages/core/src/__tests__/setup.ts` (antd mock 제거)
- Modify: `packages/core/src/config/styles.ts` (antd theme 참조 제거)

- [ ] **Step 1: antd 잔여 임포트 검색**

```bash
cd /Users/kjh/dev/tutomate
grep -r "from 'antd'" packages/ui/src/ apps/tutomate/src/ apps/tutomate-q/src/ apps/admin/src/ --include="*.tsx" --include="*.ts"
grep -r "from '@ant-design/icons'" packages/ui/src/ apps/tutomate/src/ apps/tutomate-q/src/ apps/admin/src/ --include="*.tsx" --include="*.ts"
```

Expected: 0 결과. 남아있으면 해당 파일 수정.

- [ ] **Step 2: antd locale 임포트 제거**

`import koKR from 'antd/locale/ko_KR'` — App.tsx에서 제거 확인.

- [ ] **Step 3: packages/core setup.ts에서 antd mock 제거**

```ts
// packages/core/src/__tests__/setup.ts
// vi.mock('antd', ...) 블록 제거
// errors.ts가 antd message를 직접 호출하는 부분이 있다면, toast로 교체 또는 UI 레이어 분리
```

> 주의: `packages/core/src/utils/errors.ts`가 antd `message`를 직접 임포트하고 있을 수 있다. 이 경우 errors.ts에서 antd 의존성을 제거하고, 에러 표시는 UI 레이어(store 또는 hook)에서 toast로 처리하도록 리팩토링.

- [ ] **Step 4: packages/core/src/config/styles.ts 정리**

`useChartColors()`와 `useChartTooltipStyle()`이 antd `theme.useToken()`을 사용하는지 확인. 사용한다면 CSS 변수 기반으로 교체.

- [ ] **Step 5: antd + @ant-design/icons 패키지 제거**

```bash
pnpm --filter @tutomate/ui remove antd @ant-design/icons
pnpm --filter @tutomate/app remove antd
pnpm --filter @tutomate/app-q remove antd
```

- [ ] **Step 6: packages/ui/src/index.ts export 정리**

불필요한 export 제거, 새로 추가된 컴포넌트(Empty, DataTable 등) export 추가.

- [ ] **Step 7: 전체 빌드 확인**

```bash
pnpm --filter @tutomate/app build 2>&1 | tail -10
pnpm --filter @tutomate/app-q build 2>&1 | tail -10
```

Expected: 빌드 성공, antd 관련 워닝/에러 없음

- [ ] **Step 8: dev 모드 확인**

```bash
pnpm dev
```

앱이 정상 기동되고, 사이드바/헤더/네비게이션/다크모드/글꼴 크기 조절이 동작하는지 확인.

- [ ] **Step 9: 번들 크기 비교**

```bash
pnpm --filter @tutomate/app build 2>&1 | grep "dist/"
```

antd 제거로 인한 번들 크기 감소 확인.

- [ ] **Step 10: 커밋**

```bash
git add -u
git add packages/ui/src/index.ts
git commit -m "chore: antd + @ant-design/icons 완전 제거, 최종 정리"
```

---

## Task 13: 한글 IME 호환 검증

**Files:**
- 필요 시 수정: shadcn Input, Command(Combobox) 컴포넌트

- [ ] **Step 1: IME 테스트 시나리오**

dev 모드에서 다음을 수동 테스트:
1. `Input` 컴포넌트: 한글 입력 → 조합 중 Enter → 조합 완료 후 submit
2. `Command` (GlobalSearch): 한글 입력 → 조합 중 검색 결과 업데이트 타이밍
3. `Combobox` (EnrollmentForm 학생 선택): 한글 검색 → 조합 완료 전 목록 필터링

- [ ] **Step 2: 문제 발견 시 래퍼 작성**

```tsx
// 예: compositionstart/compositionend 처리
const [isComposing, setIsComposing] = useState(false);

<Input
  onCompositionStart={() => setIsComposing(true)}
  onCompositionEnd={(e) => {
    setIsComposing(false);
    // 조합 완료 후 검색 트리거
    onChange(e.currentTarget.value);
  }}
  onChange={(e) => {
    if (!isComposing) onChange(e.target.value);
  }}
/>
```

- [ ] **Step 3: 문제 없으면 확인 기록, 문제 있으면 수정 후 커밋**

```bash
git add -u
git commit -m "fix: 한글 IME 호환 처리 (필요 시)"
```
