# Ant Design → shadcn/ui 전환 설계

## 개요

Ant Design을 shadcn/ui로 전면 교체한다. 3개 앱(tutomate, tutomate-q, admin) 모두 대상. Big Bang 방식으로 한 번에 전환하고, antd를 완전히 제거한다.

## 전환 동기

- 디자인이 중국풍/기업용 → 모던하고 깔끔한 UI
- 커스터마이징 어려움 (테마, 스타일 오버라이드) → Tailwind 기반 완전한 제어
- 번들 사이즈 큼 → 필요한 컴포넌트만 복사
- DOM이 지저분함 → Radix 기반 시맨틱 DOM

## 사용자 특성

주요 사용자는 **60대 이상**이다. 모든 UI 설계에서:
- 아이콘만으로 불충분, **텍스트 라벨 필수**
- **큰 클릭 영역** (최소 padding 12px)
- 숨겨진 메뉴나 복잡한 인터랙션 피할 것
- 명확한 시각 계층과 큰 글씨 (기본 14px)

## 1. 인프라 세팅

### 1.1 Tailwind CSS 도입

- `tailwindcss` + `postcss` + `autoprefixer` 설치
- `packages/ui`에 `tailwind.config.ts` 생성
- 각 앱(`tutomate`, `tutomate-q`, `admin`)의 Vite config에 Tailwind 연동

### 1.2 shadcn/ui 초기화

- `packages/ui`에서 `npx shadcn@latest init`
- `components.json` 설정 (TypeScript, Lucide, CSS variables)
- 필요한 컴포넌트를 `packages/ui/src/components/ui/`에 설치

### 1.3 다크 모드

- `class` 전략 사용 (`<html class="dark">`)
- 기존 `settingsStore`의 theme 상태를 그대로 활용
- antd의 `ConfigProvider` + `algorithm` → class 토글로 교체

### 1.4 글꼴 크기 시스템

기존 `settingsStore`의 fontSize 설정을 CSS 변수 기반으로 전환한다.

- 설정 페이지에 **슬라이더**로 글꼴 크기 조절 (기존 select 대체)
- `<html>` 태그에 `--font-size-base` CSS 변수 설정
- Tailwind의 `text-*` 클래스가 이 변수를 참조하도록 config
- 범위: 12px ~ 20px (기본 14px)

### 1.5 한글 로케일

- antd의 `ko_KR` locale 제거
- 날짜: `dayjs` locale 설정 (이미 사용 중)
- UI 텍스트(확인/취소 등): 직접 한글로 작성

### 1.6 한글 IME 호환 POC

shadcn Input/Combobox에서 한글 입력 시 조합 중 이벤트(compositionstart/compositionend) 처리가 antd와 다를 수 있다. 인프라 단계에서 POC를 먼저 진행한다.

- 테스트 대상: Input, Combobox(검색 포함), Command(GlobalSearch)
- 조합 중 Enter 키 동작, 검색 필터링 타이밍
- 문제 발견 시 공통 wrapper로 해결

## 2. 컴포넌트 매핑

### 2.1 직접 교체 (1:1)

| antd | shadcn/ui | 비고 |
|------|-----------|------|
| Button | Button | variant 매핑 (primary→default, default→outline) |
| Input | Input | |
| InputNumber | Input type="number" | 커스텀 래퍼 필요 시 작성 |
| Select | Select / Combobox | search 기능은 Combobox |
| Checkbox | Checkbox | |
| Switch | Switch | |
| Radio | RadioGroup | |
| Modal | Dialog | open/onCancel → open/onOpenChange |
| Popconfirm | AlertDialog | 확인/취소 패턴 |
| Tooltip | Tooltip | |
| Tabs | Tabs | |
| Badge | Badge | |
| Alert | Alert | |
| Progress | Progress | |
| Dropdown | DropdownMenu | |
| Card | Card | |
| Divider | Separator | |

### 2.2 패턴 변경 필요

| antd | shadcn/ui | 변경사항 |
|------|-----------|---------|
| Form + Form.Item | Form (RHF + Zod) | useForm() → RHF useForm(), rules → Zod schema |
| Table | DataTable (TanStack Table) | columns API 재작성 |
| DatePicker | DatePicker (react-day-picker) | dayjs 연동 |
| TimePicker | 커스텀 TimePicker | shadcn 기본 없음, 직접 구현 |
| message.success/error | Toast (sonner) | static call → toast() |
| Modal.confirm | AlertDialog | static call → 컴포넌트 방식 |
| notification | Toast (sonner) | 통합 |
| Layout/Sider/Header | 직접 구현 | Tailwind flex |
| Menu | 직접 구현 | 사이드바 네비게이션 |
| ConfigProvider | ThemeProvider | class 기반 다크모드 |

### 2.3 Tailwind로 대체

| antd | Tailwind | 사용 횟수 |
|------|----------|----------|
| Space | `flex gap-*` | 66곳 |
| Col | `grid grid-cols-*` | 65곳 |
| Row | `flex` 또는 `grid` | 31곳 |
| Empty | 커스텀 Empty 컴포넌트 | 26곳 |
| Typography.Text | `<span>` + Tailwind | 18곳 |

### 2.4 아이콘 매핑

@ant-design/icons (24개) → lucide-react 전환.

| @ant-design/icons | lucide-react |
|-------------------|-------------|
| DeleteOutlined | Trash2 |
| SearchOutlined | Search |
| UserOutlined | User |
| DollarOutlined | DollarSign |
| CalendarOutlined | Calendar |
| BookOutlined | BookOpen |
| SettingOutlined | Settings |
| ReloadOutlined | RefreshCw |
| WarningOutlined | AlertTriangle |
| LockOutlined | Lock |
| BellOutlined | Bell |
| MenuFoldOutlined | PanelLeftClose |
| MenuUnfoldOutlined | PanelLeftOpen |
| DashboardOutlined | LayoutDashboard |
| RightOutlined | ChevronRight |
| WifiOutlined | Wifi |
| 기타 | 1:1 대응 |

### 2.5 Toast 전환 전략 (44곳)

- `sonner` 패키지 설치, `<Toaster />` 를 앱 루트에 추가
- `message.success('텍스트')` → `toast.success('텍스트')`
- `message.error('텍스트')` → `toast.error('텍스트')`
- `message.warning('텍스트')` → `toast.warning('텍스트')`
- `message.info('텍스트')` → `toast.info('텍스트')`
- antd `notification` API도 sonner로 통합

## 3. 레이아웃 리디자인

### 3.1 메인 앱 (tutomate, tutomate-q)

**사이드바:**
- 너비: 220px 고정 (접힘 없음)
- 상단: 앱 로고 + 조직명 + 플랜 상태
- 메뉴: 아이콘 + 텍스트 라벨, 14px, padding 12px (큰 클릭 영역)
- 하단: 설정 메뉴 분리 (구분선)

**헤더:**
- 높이: 52px
- 좌측: 페이지 제목 (18px, bold) — breadcrumb 제거
- 우측: 검색 버튼 (⌘K) + 알림 아이콘

**콘텐츠:**
- padding: 20px
- 배경: 테마 기반 CSS 변수

**반응형:**
- Electron 앱 최소 창 너비 제한 (1024px)
- 사이드바 항상 표시
- 나중에 웹 지원 시 반응형 추가 (Tailwind breakpoint 기반으로 쉽게 확장 가능)

### 3.2 Admin 앱

기존 antd Layout + Sider (200px) + inline Menu 구조를 리디자인한다.

- 메인 앱과 동일한 사이드바 패턴 적용 (220px, 아이콘+텍스트)
- Admin 전용 메뉴 항목: 대시보드, 조직 관리, 라이선스, 사용자
- 헤더: 페이지 제목 + 관리자 식별 표시
- 공통 레이아웃 컴포넌트를 packages/ui에서 공유, 메뉴 항목만 앱별로 다르게

## 4. 난이도 높은 컴포넌트 설계

### 4.1 MonthlyPaymentTable (가장 복잡)

현재: antd Table + 인라인 InputNumber/Select/DatePicker + Popconfirm

전환:
- TanStack Table로 컬럼 정의
- 인라인 편집: 셀 클릭 시 해당 셀만 editable 상태로 전환 (controlled state)
- InputNumber → `<Input type="number" />` + blur/Enter 이벤트
- 인라인 Select → shadcn Select (Popover 기반)
- 인라인 DatePicker → shadcn DatePicker (react-day-picker + dayjs)
- Popconfirm → AlertDialog
- 상단 통계 영역: Tailwind grid로 카드 배치

### 4.2 StudentForm (복잡한 폼)

현재: antd Form + Form.Item + 동적 필드 + 수강 목록

전환:
- React Hook Form + Zod schema로 유효성 전체 정의
- Form.Item → FormField + FormItem + FormLabel + FormMessage (shadcn 패턴)
- 동적 수강 목록: RHF의 `useFieldArray`
- 전화번호 포맷팅: 기존 로직 유지, Input에 onChange 핸들러
- 납부 이력 표시: 별도 읽기 전용 영역

### 4.3 GlobalSearch (Cmd+K 모달)

현재: antd Modal + AutoComplete + 커스텀 검색

전환:
- shadcn Command (cmdk 기반) → Cmd+K 단축키 네이티브 지원
- CommandDialog + CommandInput + CommandList + CommandGroup
- 기존 검색 로직(`search.ts`)은 그대로 활용
- 카테고리별 그룹핑 (학생/과목/결제)은 CommandGroup으로 매핑

## 5. 전환 순서

### Phase 1: 기반 인프라
- Tailwind + shadcn/ui 설치 및 설정
- `packages/ui/src/components/ui/`에 shadcn 기본 컴포넌트 설치
- ThemeProvider 구성 (다크모드 + 글꼴 크기 CSS 변수)
- Toast 시스템 세팅 (sonner)
- 한글 IME POC
- `index.css` 교체 (antd 오버라이드 → Tailwind base)

### Phase 2: 레이아웃 쉘 (2개)
- `Layout` → Tailwind flex, 220px 사이드바
- `Navigation` → 커스텀 사이드바 네비게이션

이 시점에서 앱이 뜨고 네비게이션이 동작해야 함.

### Phase 3: 공통 컴포넌트 (5개)
- `ErrorBoundary` → 변경 최소 (React 기본 기능)
- `LockScreen` → Dialog + Input + Button
- `GlobalSearch` → Command (cmdk 기반)
- `NotificationCenter` → Popover + 커스텀 리스트
- `UpdateChecker` → Alert + Progress + Button

### Phase 4: 폼 컴포넌트 (5개)
- `CourseForm` → Form (RHF + Zod)
- `StudentForm` → Form (RHF + Zod), 가장 복잡
- `EnrollmentForm` → Form + Combobox
- `PaymentForm` → Form + DatePicker
- `BulkPaymentForm` → Form + Checkbox 그룹

### Phase 5: 테이블/리스트 (4개)
- `CourseList` → DataTable (TanStack Table) + Tabs
- `StudentList` → DataTable + 필터
- `MonthlyPaymentTable` → DataTable + 인라인 편집 (가장 복잡)
- `PaymentManagementTable` → DataTable + 필터

### Phase 6: 차트 (3개)
- `CourseRevenueChart` → recharts 유지, 래퍼 스타일만 변경
- `PaymentStatusChart` → 동일
- `MonthlyRevenueChart` → 동일

### Phase 7: 나머지 (3개)
- `LicenseKeyInput` → Input + Button
- `AdminTab` → Form + Switch + Slider (글꼴 크기)
- `AutoBackupScheduler` → Switch + Select

### Phase 8: 정리
- 3개 앱 진입점 전환 (ConfigProvider → ThemeProvider)
- Admin 앱 레이아웃 리디자인
- antd + @ant-design/icons 패키지 제거
- 미사용 CSS 정리
- Row/Col/Space → Tailwind flex/grid/gap 잔여분 정리 (Phase 2~7에서 해당 컴포넌트 전환 시 자연스럽게 처리되지만, 누락된 곳을 이 단계에서 일괄 정리)
- 빌드 확인

## 6. 신규 의존성

### 추가
- `tailwindcss`, `postcss`, `autoprefixer`
- `@tailwindcss/vite` (Vite 플러그인)
- `lucide-react`
- `react-hook-form`, `@hookform/resolvers`, `zod`
- `@tanstack/react-table`
- `react-day-picker`
- `sonner`
- `cmdk`
- `class-variance-authority`, `clsx`, `tailwind-merge` (shadcn 유틸리티)

### 제거
- `antd`
- `@ant-design/icons`

## 7. 제외 대상 (Out of Scope)

- 웹 버전 반응형 (나중에 웹 지원 시 별도 작업)
- 모바일 대응
- 새로운 기능 추가 (순수 UI 전환만)
- recharts 교체 (antd 무관, 그대로 유지)
