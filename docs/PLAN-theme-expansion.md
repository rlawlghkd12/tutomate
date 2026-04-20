# PLAN — 테마 확장 (Light/Dark → 다중 테마)

- **Intent**: feature
- **Slug**: `theme-expansion`
- **Complexity**: **MODERATE** (3 phases, 10 tasks, 기존 CSS+UI 확장)
- **Doc sync**: local
- **Template Foundation**: none (기존 shadcn + Tailwind CSS 변수 체계 확장)

---

## 1. 배경 (Why)

- 현재 테마는 `'light' | 'dark'` 2종류 토글만 존재
- 60대 이상 운영자/수강생 시야 편차 크고 선호도 다양
- **시력 약한 사용자**: 고대비 테마 필요 (WCAG AAA)
- **장시간 사용자**: 눈 피로 덜한 세피아/크림톤 선호
- **감성 선호**: 밝은 포인트 색(민트/로즈 등) 원하는 사용자
- 앱 자체 디자인 기조(Apple 미니멀)는 유지하되 **색 온도/대비만 변주**

## 2. 목표 (Goal)

1. 테마를 **enum 2개 → 카탈로그 기반** 으로 확장 (6~8종)
2. **시스템 자동** 옵션 (prefers-color-scheme 추적)
3. 설정 페이지에 **테마 갤러리** 표시 (시안 미리보기)
4. 기존 모든 컴포넌트 무수정 — CSS 변수만 교체되어 동작
5. 사용자별 선호 영구 저장 (`useSettingsStore`)

## 3. 현재 구조

### 3.1 데이터
```ts
// packages/core/src/stores/settingsStore.ts
export type Theme = 'light' | 'dark';
const settingsStore = { theme: 'light', setTheme(t) {...} }
```

### 3.2 CSS
```css
/* packages/ui/src/index.css */
:root {        /* light */
  --background: 0 0% 100%;
  --foreground: 240 2% 11%;
  /* ... 20+ HSL 토큰 */
}
.dark {        /* dark */
  --background: 0 0% 8%;
  /* ... 같은 토큰 override */
}
```

### 3.3 적용
```tsx
// App.tsx
document.documentElement.setAttribute('data-theme', theme);
document.documentElement.classList.toggle('dark', theme === 'dark');
```

---

## 4. 새 설계

### 4.1 데이터 모델 (확장 가능한 카탈로그)

```ts
// packages/core/src/config/themes.ts (신규)
export interface ThemeDefinition {
  id: string;                    // 'light', 'dark', 'sepia', ...
  label: string;                 // 'Light', '다크', '세피아', ...
  mode: 'light' | 'dark';        // base mode (어두운지 밝은지)
  description?: string;          // 설명 (설정 UI용)
  preview: {                     // 갤러리 미리보기 색
    bg: string;
    fg: string;
    accent: string;
  };
}

export const THEMES: ThemeDefinition[] = [
  { id: 'system', label: '시스템 설정', mode: 'light', description: 'OS 설정을 따릅니다' },
  { id: 'light', label: '라이트', mode: 'light', preview: { bg: '#ffffff', fg: '#1c1c1e', accent: '#1c1c1e' } },
  { id: 'dark', label: '다크', mode: 'dark', preview: { bg: '#141414', fg: '#e6e6e6', accent: '#e6e6e6' } },
  { id: 'sepia', label: '세피아', mode: 'light', description: '눈 편한 크림톤', preview: { bg: '#f4ecd8', fg: '#3e2f1f', accent: '#8b5a2b' } },
  { id: 'high-contrast', label: '고대비', mode: 'light', description: 'WCAG AAA 대비 — 시력 약한 분께 권장', preview: { bg: '#ffffff', fg: '#000000', accent: '#0040a0' } },
  { id: 'mint', label: '민트', mode: 'light', preview: { bg: '#f0faf6', fg: '#0f3d2a', accent: '#00a57b' } },
  { id: 'rose', label: '로즈', mode: 'light', preview: { bg: '#fff5f6', fg: '#3d1f23', accent: '#d1527a' } },
  { id: 'slate', label: '슬레이트', mode: 'dark', preview: { bg: '#1a1f2e', fg: '#d0d6e0', accent: '#7dd3fc' } },
];

export type ThemeId = typeof THEMES[number]['id'];
```

### 4.2 settingsStore 확장

```ts
// Before: Theme = 'light' | 'dark'
// After:
export type Theme = ThemeId;  // 문자열 확장 (legacy 값 자동 호환)

// 로드 시 하위 호환:
if (saved === 'light' || saved === 'dark') applyTheme(saved);
else if (THEMES.find(t => t.id === saved)) applyTheme(saved);
else applyTheme('system'); // fallback
```

### 4.3 CSS 구조

```css
/* packages/ui/src/index.css */
:root {                      /* 기본 = light */
  --background: 0 0% 100%; ...
}
[data-theme="dark"], .dark { /* 하위 호환 .dark 병행 */
  --background: 0 0% 8%; ...
}
[data-theme="sepia"] {
  --background: 40 40% 92%;
  --foreground: 30 40% 18%;
  --primary: 25 55% 35%;
  ...
}
[data-theme="high-contrast"] {
  --background: 0 0% 100%;
  --foreground: 0 0% 0%;
  --primary: 220 80% 35%;
  --border: 0 0% 30%;       /* 훨씬 진한 경계선 */
  --muted-foreground: 0 0% 20%; /* 기존 40% → 20% (대비 ↑) */
  ...
}
[data-theme="mint"]  { ... }
[data-theme="rose"]  { ... }
[data-theme="slate"] { ... }
```

### 4.4 적용 로직 (App.tsx)

```tsx
useEffect(() => {
  let active = theme;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    active = prefersDark ? 'dark' : 'light';
  }
  const def = THEMES.find(t => t.id === active);
  document.documentElement.setAttribute('data-theme', active);
  // 하위 호환: 다크 모드 클래스 유지
  document.documentElement.classList.toggle('dark', def?.mode === 'dark');
}, [theme]);

// system 모드면 OS 변경 감지
useEffect(() => {
  if (theme !== 'system') return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => { /* re-apply */ };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}, [theme]);
```

### 4.5 설정 UI (테마 갤러리)

```tsx
// apps/tutomate-q/src/pages/SettingsPage.tsx
<section>
  <h3>테마</h3>
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
    {THEMES.map(t => (
      <button
        key={t.id}
        onClick={() => setTheme(t.id)}
        className={cn(
          "rounded-xl border-2 p-3 text-left transition-all",
          theme === t.id ? "border-primary shadow-md" : "border-transparent hover:border-border"
        )}
      >
        <div className="h-16 rounded-md mb-2 flex" style={{ background: t.preview.bg }}>
          <div className="flex-1" />
          <div className="w-8 m-2 rounded" style={{ background: t.preview.accent }} />
        </div>
        <div className="font-medium">{t.label}</div>
        {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
      </button>
    ))}
  </div>
</section>
```

---

## 5. Implementation Roadmap

### Phase 1 — Core 구조 확장
| # | Task | 파일 | 비고 |
|---|------|------|------|
| 1.1 | `config/themes.ts` — THEME 카탈로그 정의 | `packages/core/src/config/themes.ts` | 신규 |
| 1.2 | settingsStore `Theme` 타입 확장 + 하위 호환 | `packages/core/src/stores/settingsStore.ts` | 수정 |
| 1.3 | index.ts export 추가 | `packages/core/src/index.ts` | 수정 |

### Phase 2 — CSS 테마 추가
| # | Task | 파일 | 비고 |
|---|------|------|------|
| 2.1 | `.dark` → `[data-theme="dark"], .dark` 병행 | `packages/ui/src/index.css` | 수정 |
| 2.2 | `sepia`, `high-contrast`, `mint`, `rose`, `slate` 5개 CSS block 추가 | 동일 | 수정 |
| 2.3 | 앱별 tutomate/globals.css에도 동일 (이중 관리) | `apps/tutomate/src/globals.css` | 수정 |

### Phase 3 — 적용 + UI
| # | Task | 파일 | 비고 |
|---|------|------|------|
| 3.1 | App.tsx 테마 적용 로직 — system 모드 + matchMedia | `apps/tutomate-q/src/App.tsx`, `apps/tutomate/src/App.tsx` | 수정 |
| 3.2 | SettingsPage 테마 갤러리 컴포넌트 | `apps/tutomate-q/src/pages/SettingsPage.tsx` (+tutomate) | 수정 |
| 3.3 | 기존 light/dark 토글 UI 제거/대체 | 동일 | 수정 |
| 3.4 | 테마 전환 테스트 — 각 페이지 대비/가독성 확인 | manual QA | — |

### Total
- **Phases**: 3
- **Tasks**: 10
- **신규 파일**: 1 (themes.ts)
- **수정 파일**: 6~8개

---

## 6. 제안하는 테마 카탈로그 (8종)

| ID | 이름 | 모드 | 타겟 | 비고 |
|----|------|------|------|------|
| `system` | 시스템 설정 | 자동 | 모두 | OS 설정 따라감 |
| `light` | 라이트 | 밝음 | 기본 | 현재 기본 |
| `dark` | 다크 | 어둠 | 밤 작업 | 현재 유지 |
| `sepia` | 세피아 | 밝음 | 장시간 사용 | 크림톤, 눈 편함 |
| **`high-contrast`** | **고대비** | **밝음** | **시력 약한 60대** | **WCAG AAA 대비** |
| `mint` | 민트 | 밝음 | 감성 | 연두톤 포인트 |
| `rose` | 로즈 | 밝음 | 감성 | 핑크톤 포인트 |
| `slate` | 슬레이트 | 어둠 | 취향 | 회청색 다크 변종 |

> **60대 타겟 필수 고려**: `high-contrast` 가 가장 중요. 메모리 `user_target_audience` 기준.

---

## 7. 리스크

| ID | Risk | 완화 |
|----|------|------|
| R1 | 테마 추가 시 기존 컴포넌트에서 하드코딩된 색(`text-emerald-400` 등) 튀는 사이트 발견 | Phase 3 QA에서 각 테마로 전체 페이지 순회. RevenueBreakdownTooltip 등 CSS 토큰으로 바꾼 사례 참고 |
| R2 | `settings.theme` 하위 호환 — 구 버전 저장값 `'light'/'dark'` 그대로 유지해야 | 문자열 union 확장 + `THEMES.find` fallback |
| R3 | 테마 전환 시 flash (FOUC) | 이미 localStorage에서 즉시 load — 문제 없음. 확인 필요 |
| R4 | 차트(Recharts) 색상 — 테마별로 재매핑 필요 | 차트 색은 HSL 토큰 사용으로 이미 대부분 자동. PaymentStatusChart COLORS는 상수 → 테마별 조정 검토 |
| R5 | 테마 갤러리 미리보기 — 작은 칸에서도 구분되어야 | preview 색 bg/fg/accent 3색만 노출 |

---

## 8. Acceptance

- [ ] 설정 > 테마 섹션에서 8개 테마 갤러리 표시
- [ ] 각 테마 클릭 시 즉시 반영 (reload 불필요)
- [ ] `system` 선택 시 OS 다크모드 토글이 앱에 즉시 반영
- [ ] 새로고침/앱 재시작 후 선택 유지
- [ ] 기존 `light`/`dark` 저장 사용자 migration 문제 없음
- [ ] `high-contrast` 테마에서 60대 가독성 수동 확인 (텍스트 대비 ≥ 7:1)
- [ ] 다크 모드 기반 페이지(admin 포함) 모든 테마에서 붕괴 없음

---

## 9. Handoff

```json
{
  "skill": "da:plan",
  "status": "completed",
  "plan_file": "docs/PLAN-theme-expansion.md",
  "approval_status": "pending",
  "complexity_estimate": "MODERATE",
  "template_foundation": { "frontend_template": "none", "strategy": "zero-base" },
  "phase_count": 3,
  "total_tasks": 10
}
```
