# TutoMate 기능 정의서

> 앱의 모든 사용자 기능을 정의합니다. 테스트 작성 시 이 문서를 기준으로 커버리지를 판단합니다.
> UI 프레임워크: shadcn/ui + Tailwind v4 (antd 완전 제거)
> 브랜드 컬러: #007aff
> 마지막 갱신: 2026-04-05

---

## 1. 앱 시작 / 인증

### 1.1 초기화 (자동)
- [ ] 앱 실행 시 `initialize()` 자동 호출
- [ ] 기존 Supabase 세션 복원 (`getSession()`) → 없으면 `signInAnonymously()`
- [ ] `user_organizations` 테이블에서 조직 연결 확인 → 있으면 orgId/plan 복원
- [ ] 조직 연결 없으면 자동으로 `create-trial-org` Edge Function 호출 (버튼 없음)
- [ ] 기기 ID: Electron → `getMachineId()` IPC, 웹 → `crypto.randomUUID()` + localStorage
- [ ] 기기 ID는 SHA-256 해시 처리 후 사용
- [ ] Supabase 미설정(환경변수 없음) 시 로컬 전용 모드 (오류 없음)
- [ ] 인증 완료 전 로딩 스피너 표시
- [ ] 인증 실패 시 에러 메시지 + 재시도

### 1.2 세션 관리
- [ ] `onAuthStateChange` 리스너: 모듈 로드 시 1회 등록
- [ ] 세션 만료(SIGNED_OUT) → `organizationId: null`, `isCloud: false` 초기화
- [ ] 토큰 갱신(SIGNED_IN) → 세션만 갱신, orgId 유지

### 1.3 체험판 제한
- [ ] 강좌 최대 **5개** (`maxCourses: 5`)
- [ ] 강좌당 수강생 최대 **10명** (`maxStudentsPerCourse: 10`)
- [ ] 관리자 탭 접근 불가
- [ ] 제한 초과 시 업그레이드 안내

---

## 2. 레이아웃 / 네비게이션

### 2.1 사이드바
- [ ] **너비 220px 고정**, 접힘 기능 없음
- [ ] 배경: `hsl(var(--muted))`, 우측 보더: `1px solid hsl(var(--border))`
- [ ] **상단 (height 52px)**: macOS 트래픽 라이트 영역 (`-webkit-app-region: drag`), 하단 정렬(`align-items: flex-end`)
  - [ ] 앱 아이콘 (24x24, borderRadius 6) + 조직명 (15px, fontWeight 700)
  - [ ] 조직명 기본값: `organizationName || 'TutorMate'`
  - [ ] 체험판일 때 "체험판" 배지 (경고색, 10px, 클릭 시 `/settings?tab=license` 이동)
- [ ] **메인 메뉴** (padding `0 12px`, gap 2px):
  - [ ] 대시보드 (LayoutDashboard 아이콘)
  - [ ] 강좌 관리 (BookOpen 아이콘)
  - [ ] 수강생 관리 (Users 아이콘)
  - [ ] 캘린더 (Calendar 아이콘)
  - [ ] 수익 관리 (DollarSign 아이콘)
- [ ] **하단 메뉴** (구분선 `borderTop: 1px solid hsl(var(--border))` 위에 배치):
  - [ ] 설정 (Settings 아이콘)
- [ ] 메뉴 아이템 스타일: 20x20 아이콘, 14px 텍스트, padding `12px 16px`, borderRadius 8
- [ ] 현재 페이지 메뉴 하이라이트: `background: hsl(var(--primary) / 0.1)`, `color: hsl(var(--primary))`, fontWeight 600
- [ ] 비활성 호버: `background: hsl(var(--accent))`, `color: hsl(var(--foreground))`
- [ ] 현재 경로 매칭: 정확 매칭 (`/`) 또는 첫 세그먼트 매칭 (`/courses/xxx` → `/courses`)

### 2.2 헤더
- [ ] **높이 52px**, 좌우 padding 20px
- [ ] 하단 보더: `1px solid hsl(var(--border))`
- [ ] `-webkit-app-region: drag` (타이틀 바 드래그 영역)
- [ ] **왼쪽**: 페이지 제목 (18px, fontWeight 700)
  - [ ] 라우트별 제목 매핑: `/` → 대시보드, `/courses` → 강좌 관리, `/students` → 수강생 관리, `/calendar` → 캘린더, `/revenue` → 수익 관리, `/settings` → 설정
  - [ ] `/courses/:id` 등 하위 경로 → 상위 페이지 제목 표시 (예: "강좌 관리")
- [ ] **오른쪽** (gap 4px, `-webkit-app-region: no-drag`):
  - [ ] 검색 버튼 (Search 아이콘, ghost variant, 32x32, title "검색 (Cmd+K)")
  - [ ] 알림 센터 (NotificationCenter 컴포넌트)

### 2.3 글로벌 검색
- [ ] `Cmd+K` (Mac) / `Ctrl+K` (Windows) → 검색 패널 열기
- [ ] `Escape` → 검색 패널 닫기
- [ ] **Spotlight 스타일 직접 구현** (CommandDialog 아닌 커스텀 렌더링):
  - [ ] 오버레이: `position: fixed`, `background: rgba(0,0,0,0.15)` (연한 오버레이)
  - [ ] 검색 패널: `position: fixed`, `top: 15%`, `left: 50%`, `translateX(-50%)`, width 600px, maxHeight 70vh
  - [ ] 패널 스타일: borderRadius 12, boxShadow `0 25px 60px rgba(0,0,0,0.25)`, border 1px
  - [ ] 오버레이 클릭 시 닫기
- [ ] 내부에 `Command` 컴포넌트 사용 (CommandInput, CommandList, CommandGroup, CommandItem)
- [ ] 검색 범위: **강좌 / 수강생 / 수강 신청** (설정 검색 없음)
- [ ] 검색어 미입력 시 안내 문구: "검색어를 입력하여 강좌, 수강생, 수강 신청을 검색하세요"
- [ ] 검색 결과 없음: "검색 결과가 없습니다"
- [ ] 결과 그룹별 표시: 강좌 / 수강생 / 수강 신청 (CommandGroup + CommandSeparator)
- [ ] 결과 항목: 아이콘 + 제목(font-medium) + 타입 Badge(secondary, 11px) + 매칭 필드명
  - [ ] 강좌 아이콘: BookOpen (primary 색상)
  - [ ] 수강생 아이콘: User (green-600 색상)
  - [ ] 수강 신청 아이콘: FileText (amber-600 색상)
- [ ] 결과 하단 바: "{count}개의 결과" + "ESC 닫기" kbd 표시
- [ ] 결과 클릭 시 해당 페이지로 이동:
  - [ ] 강좌 → `/courses/{id}`
  - [ ] 수강생 → `/students`
  - [ ] 수강 신청 → `/revenue`

### 2.4 오프라인 감지
- [ ] 인터넷 연결 끊김 시 헤더 아래 경고 배너
  - [ ] Wifi 아이콘 + "인터넷에 연결되어 있지 않습니다"
  - [ ] 배경: `hsl(var(--warning) / 0.1)`, 하단 보더: `#fde68a`
- [ ] 배너 닫기(X) 클릭 시 세션 내 숨김 (`offlineDismissed` state)
- [ ] 재연결 시 배너 자동 제거, `offlineDismissed` 초기화

### 2.5 라우팅
- [ ] 존재하지 않는 경로 → 대시보드로 리다이렉트

---

## 3. 대시보드 (`/`)

### 3.1 통계 카드
- [ ] 강좌: 전체 강좌 수, 클릭 시 `/courses` 이동
- [ ] 수강생: 전체 수강생 수, 클릭 시 `/students` 이동
- [ ] 납부: 총 납부 금액 `₩{amount}원`, 클릭 시 `/revenue` 이동
- [ ] 납부율: `{percentage}%` (면제 건 제외 계산)
- [ ] 완납: `{count}건`
- [ ] 미납: `{count}건`

### 3.2 강좌 카드 섹션
- [ ] "전체 강좌 ({count})" 제목
- [ ] 강좌별 카드: 이름, 강사, 강의실, 수강 인원 진행바 `{current}/{max}`
- [ ] 카드 클릭 시 강좌 상세 이동
- [ ] "강좌 등록하기" 버튼 → 강좌 개설 모달

### 3.3 차트
- [ ] 강좌별 수익 막대 차트 (둥근 바, 인디고/에메랄드 색상)
- [ ] 납부 상태 도넛 차트 (완납/부분납부/미납/면제, 중앙에 퍼센트 표시)

### 3.4 알림 자동 생성
- [ ] 대시보드 진입 시 알림 자동 생성 (하루 1회, localStorage `lastNotificationGeneration` 체크)
- [ ] `payment_overdue`: 등록 후 30일 이상 미납/부분납부 수강생
- [ ] `payment_reminder`: 등록 후 7일/14일/21일째 미완납 수강생
- [ ] enrollments, students, courses 데이터 모두 있을 때만 실행

---

## 4. 강좌 관리 (`/courses`)

### 4.1 강좌 목록
- [ ] **탭 구분**: "현재 강좌 (N)" / "종료된 강좌 (N)" (endDate 기준 자동 분류)
- [ ] 종료된 강좌 행: `opacity-60` 처리
- [ ] 강좌명 옆 종료 Badge: `<Badge variant="secondary">종료</Badge>`
- [ ] 테이블 컬럼: No., 강좌 이름, **요일**, **시간**, 강의실, 강사, 강사 전화번호, 수강료, 수강 인원, 상태
  - [ ] **요일 컬럼** (width 80px): 요일을 "월 수 금" 형태로 표시, 없으면 "-"
  - [ ] **시간 컬럼** (width 100px): "09:00~12:00" 형태로 표시, 없으면 "-"
- [ ] 상태 태그 3종: "모집 중"(초록 bg-green-500) / "마감 임박"(주황 bg-orange-500, 80%~100%) / "정원 마감"(destructive, 100%)
- [ ] 강좌 이름 컬럼 정렬 (toggleSorting)
- [ ] 수강료 컬럼 정렬
- [ ] 수강 인원 컬럼 정렬 (enrollmentCount 기준)
- [ ] 강좌 이름 클릭 시 강좌 상세 이동 (`text-primary hover:underline`)
- [ ] 행 전체 클릭 시 강좌 상세 이동 (`cursor-pointer`)
- [ ] 수강료 `₩{fee.toLocaleString()}` 형식
- [ ] 수강 인원 `{current} / {max}` + Progress 바 (h-1.5, 100%이면 destructive 색상)
- [ ] 빈 상태: "등록된 강좌가 없습니다" / "종료된 강좌가 없습니다" / "검색 결과가 없습니다"

### 4.2 검색/필터
- [ ] 검색 필드 선택 (Select): 전체 / 강좌명 / 강의실 / 강사명 / 전화번호
- [ ] 검색 입력 (Input, paddingLeft 34px, Search 아이콘 오버레이)
- [ ] 선택 필드별 placeholder 동적 변경
- [ ] 실시간 검색 필터링

### 4.3 강좌 개설 (2단계 스텝 위자드)
- [ ] "강좌 개설" 버튼 클릭 → Dialog 모달 (max-w-700px, max-h-80vh, overflow-y-auto)
- [ ] **스텝 인디케이터**: 원형 번호(24x24) + 라벨, 현재 스텝 강조 (foreground 배경), 미도달 스텝 흐림 (border 배경)

#### Step 1: 기본 정보
- [ ] **필수 필드 (모두 필수)**: 강좌 이름, 강의실, 강사 이름, 강사 전화번호, 수강료, 최대 인원
- [ ] 2열 그리드 (`grid-cols-2 gap-4`)
- [ ] 강사 전화번호 자동 포맷 (`010-1234-5678`, formatPhone 함수)
- [ ] 수강료 프리셋 버튼: 2만원, 3만원, 5만원 (outline variant, sm size)
- [ ] 수강료 기본값: 30,000
- [ ] 최대 인원 프리셋 버튼: 15명, 20명, 25명, 30명, 35명
- [ ] 최대 인원 기본값: 20
- [ ] "다음" 버튼으로 Step 2 진행, "취소" 버튼으로 모달 닫기

#### Step 2: 일정 설정
- [ ] 일정 항상 표시 (체크박스 토글 없음)
- [ ] 3개 섹션 카드 (border, borderRadius 12, padding 16):
  - [ ] **기간**: 시작일/종료일 DatePicker (Popover + Calendar, ko locale), "~" 구분
  - [ ] **수업 요일**: 44x44 토글 버튼 (일~토), 선택 시 foreground 배경+반전 텍스트, borderRadius 10
    - [ ] 퀵 버튼 4종: "주중"(월~금), "주말"(일+토), "월수금", "화목" (outline variant, sm size)
  - [ ] **수업 시간**: 프리셋 3종 + time input
    - [ ] 프리셋: "오전반" (9:00~12:00), "오후반" (13:00~17:00), "저녁반" (18:00~21:00)
    - [ ] 프리셋 버튼: flex 1, borderRadius 10, 선택 시 foreground 배경+반전 텍스트, 서브 텍스트(11px, opacity 0.6)
    - [ ] 시작/종료 시간 `<input type="time">` (borderRadius 8, textAlign center, fontSize 15)
    - [ ] 기본값: 09:00 ~ 12:00
- [ ] 총 수업 회차 (InputNumber, 기본값 12)
- [ ] "이전" 버튼으로 Step 1 복귀, "생성" 버튼으로 제출
- [ ] **이중 클릭 방지**: `submitting` state, 제출 중 버튼 disabled
- [ ] "생성" 클릭 → 성공 토스트 "강좌가 생성되었습니다."
- [ ] 체험판: 강좌 5개 초과 시 생성 차단 + 경고 토스트

### 4.4 강좌 수정
- [ ] "수정" 클릭 → 기존 데이터 채워진 모달 (Step 1부터)
- [ ] schedule 데이터 있으면 Step 2에 기존 일정 채움 (startTime 5자리 슬라이스)
- [ ] 수정 후 "수정" 클릭 → 성공 토스트 "강좌가 수정되었습니다."

### 4.5 강좌 삭제
- [ ] "삭제" 클릭 → AlertDialog 확인 모달
- [ ] 수강생 있는 강좌: "수강생이 있는 강좌입니다!" 제목 + "{N}명의 수강생이 있습니다. 삭제 시 수강 기록도 함께 삭제됩니다."
- [ ] 수강생 없는 강좌: "강좌를 삭제하시겠습니까?" + 강좌명 표시
- [ ] 삭제 버튼: destructive 스타일
- [ ] 확인 → 강좌 + 관련 수강 등록 삭제
- [ ] 성공 토스트 "강좌가 삭제되었습니다."

---

## 5. 강좌 상세 (`/courses/:id`)

### 5.1 헤더
- [ ] **브레드크럼**: "강좌 관리" (클릭 시 `/courses`, 13px, muted-foreground, hover:underline) / 강좌명 (15px, font-semibold)
- [ ] **오른쪽 액션 버튼** (gap 1.5):
  - [ ] "내보내기" 버튼 (outline, sm, Download 아이콘, 수강생 없을 때 disabled)
  - [ ] "수정" 버튼 (outline, sm, Pencil 아이콘) → CourseForm 모달
  - [ ] "삭제" 버튼 (destructive, sm, Trash2 아이콘) → 삭제 확인 AlertDialog

### 5.2 통계바 + 일정 카드 (한 줄)
- [ ] **탭 없음** — 단일 뷰 (PaymentManagementTable)
- [ ] 통계 항목들을 flex 한 줄 (gap 2.5)로 표시, 각 카드 `flex-1 py-1.5 px-3 rounded-md border`:
  - [ ] 강사: `course.instructorName`
  - [ ] **일정**: 요일 + 시간 (예: "월수금 09:00~12:00"), 없으면 "-"
  - [ ] 강의실: `course.classroom`
  - [ ] 수강료: `₩{fee.toLocaleString()}`
  - [ ] 수강생: `{enrolled}/{maxStudents}`
  - [ ] 총 수익: `₩{totalRevenue.toLocaleString()}` (text-success)
  - [ ] 완납률: `{percentage}%` (100% → text-success, 그 외 text-error)
- [ ] 라벨(11px, muted-foreground) + 값(14px, font-semibold)

### 5.3 수강생 납부 관리 (PaymentManagementTable)
- [ ] **월별 납부 탭 제거** — PaymentManagementTable 단일 뷰로 통합
- [ ] 테이블: 체크박스, 이름, 전화번호, 납부 현황(Badge), 납부 금액, 잔여 금액, 할인, 납부 방법, 납부일자, 등록일, 작업
- [ ] 납부 현황 Badge: 미납(error), 부분납부(warning), 완납(success), 면제(purple)
- [ ] 이름 컬럼: 정렬 가능
- [ ] 납부 현황 컬럼: 필터 가능 (미납/부분납부/완납/면제)
- [ ] 납부 금액/잔여 금액/할인/납부일자/등록일 컬럼: 정렬 가능
- [ ] 납부 방법 컬럼: 필터 가능 (현금/카드/계좌이체)
- [ ] **행 선택** → "{count}명 선택됨" + "일괄 납부 처리" + "선택 해제" 버튼 (통계바와 같은 줄)
- [ ] "납부 관리" 버튼 → PaymentForm 모달
- [ ] withdrawn 상태 수강 등록은 목록에서 제외 (`paymentStatus !== 'withdrawn'`)

### 5.4 수강 철회 (소프트 딜리트)
- [ ] "제거" 대신 **"수강 철회"** 처리 (`withdrawEnrollment`)
- [ ] AlertDialog 확인: "수강 철회" 제목, "{N}명의 수강을 철회하시겠습니까? 납부 기록은 유지됩니다."
- [ ] 철회 시 `paymentStatus = 'withdrawn'` (소프트 딜리트, 레코드 보존)
- [ ] **납부 기록(paymentRecord) 보존** — 삭제하지 않음
- [ ] 성공 토스트: "{N}명의 수강이 철회되었습니다."

### 5.5 일괄 납부 처리
- [ ] 모달 상단: 선택 수강생 수, 총 예상 금액, 현재 총 납부액, 총 잔여 금액 요약
- [ ] 납부 방식: "고정 금액" 또는 "비율(%)" 라디오
- [ ] 고정 금액 빠른 버튼: "절반 (₩{half})", "전액 (₩{full})"
- [ ] 비율 빠른 버튼: 25%, 50%, 100%
- [ ] 납부 방법: 미지정 / 현금 / 카드 / 계좌이체
- [ ] 미리보기: 1인당 납부액 + 총 납부액 실시간 표시
- [ ] 적용 방식: 기존 납부액에 추가(+) (덮어쓰기 아님)

### 5.6 내보내기
- [ ] Dialog 모달 (max-w-320px)
- [ ] 제목: "수강생 내보내기"
- [ ] 전체 선택 체크박스 + "{선택수}/{전체수}" 카운트
- [ ] 필드 선택: 이름, 전화번호, 이메일, 주소, 생년월일, 납부 현황, 납부 금액, 할인 금액, 잔여 금액, 납부 방법, 납부일자, 등록일, 메모
- [ ] 선택된 필드 `bg-primary/10`, 미선택 `hover:bg-muted`
- [ ] Excel / CSV 버튼 (FileSpreadsheet/FileText 아이콘)
- [ ] 성공 토스트: "Excel/CSV 파일이 다운로드되었습니다."

---

## 6. 수강생 관리 (`/students`)

### 6.1 수강생 목록
- [ ] 테이블 컬럼: No., 이름, 회원/비회원(appConfig.enableMemberFeature 시), 전화번호, 강좌(Badge), 메모(Tooltip), 작업
- [ ] 강좌 Badge 클릭 → 해당 강좌 상세 이동 (`/courses/{id}`)
- [ ] 강좌 없는 수강생: "-" (muted-foreground/50)
- [ ] 메모: 최대 200px 말줄임, Tooltip으로 전체 내용 표시
- [ ] 이름 컬럼: 정렬 가능 (ArrowUpDown 아이콘)
- [ ] 이름 클릭 → StudentForm 수정 모달 열기 (`text-primary hover:underline`)
- [ ] **작업 컬럼**: "수강 신청" 버튼 (outline, sm, BookOpen 아이콘) → EnrollmentForm 모달
- [ ] 빈 상태: "등록된 수강생이 없습니다" / "검색 결과가 없습니다"
- [ ] 필터링 후 인덱스 재부여 (1부터)

### 6.2 검색/필터
- [ ] 검색 필드 선택 (Select, width 110): 전체 / 이름 / 전화번호 / 강좌 / 메모
- [ ] 검색 입력 (Input, paddingLeft 34px, Search 아이콘 오버레이, maxWidth 300)
- [ ] 선택 필드별 placeholder 동적 변경
- [ ] 실시간 검색 필터링

### 6.3 수강생 등록 (기본 정보만)
- [ ] "수강생 등록" 버튼 → Dialog 모달 (max-w-560px, max-h-90vh)
- [ ] **필수 필드**: 이름, 전화번호
- [ ] **선택 필드**: 생년월일(6자리), 주소(appConfig.hideAddressField 시 숨김), 메모
- [ ] **회원/비회원 토글**: Switch (appConfig.enableMemberFeature 시 표시)
- [ ] **강좌 신청 기능 없음** — 기본 정보만 등록, 강좌 신청은 별도 EnrollmentForm에서 처리
- [ ] 이름 자동완성 (Popover + Command, 기존 수강생, 최대 8건, 이름+전화번호 표시)
  - [ ] 등록 모드(student 미전달)에서만 Combobox 표시
  - [ ] 수정 모드(student 전달)에서는 일반 Input 표시
- [ ] 자동완성 선택 → 기존 수강생 정보 자동 로드
- [ ] 자동완성 선택 시 Alert 배너: "기존 수강생 '{이름}' ({전화번호})의 정보를 수정합니다."
  - [ ] 배너 닫기(X) → 자동완성 취소 + 폼 초기화
- [ ] 자동완성 선택 시 토스트: "기존 수강생 '{이름}'님의 정보를 불러왔습니다."
- [ ] 전화번호 자동 포맷 (`010-1234-5678`, formatPhone 함수, 최대 13자)
- [ ] 생년월일 파싱: `630201` → `1963-02-01` (parseBirthDate, 30 이하 → 2000년대)
- [ ] 동일 이름+전화번호 중복 시 경고 토스트: "동일한 이름과 전화번호의 수강생이 이미 있습니다."
- [ ] 성공 토스트: "수강생이 등록되었습니다."
- [ ] **신규 등록 후 모달 미닫힘**, 이름 필드 포커스 유지 (연속 등록)
- [ ] **이중 클릭 방지**: `submitting` state, 제출 중 버튼 disabled
- [ ] Enter 키로 다음 필드 포커스 이동 (이름→전화번호→생년월일→주소→메모)
- [ ] 메모에서 Shift 없이 Enter → 폼 제출

### 6.4 수강생 수정
- [ ] 이름 클릭 → 기존 데이터 채워진 모달 (StudentForm, student prop 전달)
- [ ] 성공 토스트: "수강생 정보가 수정되었습니다."

### 6.5 수강생 삭제
- [ ] 수정 모달 내 "삭제" 버튼 (destructive variant, DialogFooter 왼쪽 정렬)
- [ ] AlertDialog 확인: "수강생을 삭제하시겠습니까?" + 수강생 이름 표시
- [ ] 확인 → 수강생 + 관련 수강 등록 삭제
- [ ] 성공 토스트: "수강생이 삭제되었습니다."

### 6.6 내보내기
- [ ] 모달 제목: "수강생 내보내기"
- [ ] 필드: 이름, 전화번호, 이메일, 주소, 생년월일, 수강강좌, 납부금액, 잔여금액, 메모, 등록일
- [ ] 기본 선택: 이름, 전화번호, 수강강좌, 납부금액, 잔여금액
- [ ] 합계 행 자동 추가 (납부금액, 잔여금액)
- [ ] Excel 파일명: `수강생_명단_{YYYYMMDD_HHmmss}.xlsx`
- [ ] CSV 파일명: `수강생_명단_{YYYYMMDD_HHmmss}.csv`
- [ ] 상단에 조직명과 기준 날짜 헤더 행 포함

---

## 7. 수강 등록 (EnrollmentForm)

### 7.1 독립 수강 등록
- [ ] **수강생 목록 "수강 신청" 버튼 클릭** → EnrollmentForm Dialog 모달
- [ ] 모달 제목: "강좌 신청" (18px, fontWeight 700)
- [ ] 제목 아래 수강생 이름 표시 (14px, muted-foreground)
- [ ] **강좌 선택** (Select, 필수):
  - [ ] 드롭다운 항목: `{name} (₩{fee}) - {count}/{max}명`
  - [ ] 이미 수강 중인 강좌: 취소선 + "[수강중]", disabled
  - [ ] 정원 마감 강좌: "[정원 마감]", disabled
  - [ ] 체험판: 강좌당 수강생 수 제한 반영 (`Math.min(maxStudents, trialLimit)`)
- [ ] 이미 등록된 강좌 신청 시: "이미 등록된 강좌입니다." 에러 토스트
- [ ] 정원 마감 강좌 신청 시: "강좌 정원이 마감되었습니다." 에러 토스트
- [ ] 성공 토스트: "강좌 신청이 완료되었습니다."
- [ ] **이중 클릭 방지**: `submitting` state, 제출 중 버튼 disabled

### 7.2 납부 설정
- [ ] 강좌 선택 후 납부 섹션 표시 (조건부 렌더링)
- [ ] **"할인 적용" 토글 버튼** (Button, outline ↔ default variant):
  - [ ] 토글 ON → 할인 금액 입력 필드 슬라이드 표시 (`slide-enter` 애니메이션)
  - [ ] 토글 OFF → 할인 금액 0으로 초기화
  - [ ] 면제 상태에서 disabled
- [ ] 할인 금액 입력 (0 ~ 수강료, number input)
- [ ] 할인 적용 시 초록 텍스트: "할인 적용 수강료: ₩{effectiveFee}"
- [ ] **"면제 처리" 버튼** (Button, outline ↔ destructive variant):
  - [ ] 면제 활성화 시 destructive 스타일, 텍스트 "면제 해제"
  - [ ] 면제 비활성화 시 outline 스타일, 텍스트 "면제 처리"
- [ ] 면제 시 안내 (slide-enter 애니메이션): "면제 처리됩니다. 수익에 포함되지 않습니다." (accent 배경, borderRadius 8)
- [ ] 면제 시 납부 금액 0, 모든 금액 입력 disabled
- [ ] **납부 금액** (0 ~ effectiveFee, number input, fontSize 15)
- [ ] 빠른 입력 버튼: "완납", "절반"(Math.floor(effectiveFee / 2)), "미납"(0) (outline variant, sm size)
- [ ] **납부 방법**: 버튼 그룹 (Button, 3개 flex 1, 선택 시 default, 미선택 시 outline)
  - [ ] 현금(cash), 카드(card), 계좌이체(transfer)
  - [ ] **기본값: cash** (폼 리셋 시 paymentMethod: "cash")
  - [ ] **필수 필드** (z.enum으로 required)
  - [ ] 면제 시 disabled
- [ ] 메모 (Textarea, 2 rows)
- [ ] 모달 열릴 때 `showDiscount` 리셋

### 7.3 납부 상태 자동 계산
- [ ] `paidAmount == 0` → "미납" (pending)
- [ ] `0 < paidAmount < effectiveFee` → "부분납부" (partial)
- [ ] `paidAmount >= effectiveFee` → "완납" (completed)
- [ ] 면제 → "면제" (exempt)
- [ ] `effectiveFee = courseFee - discountAmount`

### 7.4 납부 기록 생성
- [ ] 등록 완료 시 `addEnrollment` 호출
- [ ] `paidAmount > 0`이면 `addPayment` (paymentRecordStore) 호출
- [ ] 분기 시스템 활성화 시 (`appConfig.enableQuarterSystem`) `quarter` 필드 포함 ("YYYY-QN" 형식)
- [ ] 회원(isMember)인 경우 면제 기본값 true

---

## 8. 납부 관리 (PaymentForm)

### 8.1 납부 관리 모달
- [ ] 강좌 상세 또는 수익 관리에서 "납부 관리"/"납부 처리" 클릭
- [ ] 면제: 보라색 태그 + "이 수강은 수강료가 면제되었습니다."
- [ ] 비면제: 수강료 / 납부 금액 / 잔여 금액 3열 표시

### 8.2 납부 수정
- [ ] 할인 금액 수정 → "할인 적용 수강료: ₩{effectiveFee}" 실시간 표시
- [ ] 납부 금액 (0 ~ effectiveFee)
- [ ] 빠른 입력: "절반", "잔액 전액"
- [ ] 납부일 선택 (DatePicker)
- [ ] 납부 방법: 현금/카드/계좌이체
- [ ] 변경 후 잔여 금액 실시간 표시 (하단)

### 8.3 면제 처리
- [ ] "면제" Popconfirm: "정말 수강료를 면제 처리하시겠습니까? 면제된 금액은 수익에 포함되지 않습니다."
- [ ] "면제 취소" Popconfirm: "면제를 취소하시겠습니까? 납부 상태가 미납으로 변경됩니다."
- [ ] 면제 시 모든 금액/방법 입력 disabled

### 8.4 저장
- [ ] "저장" → 납부 상태 자동 계산 + 업데이트
- [ ] 면제 상태에서 "저장" 버튼 disabled

---

## 9. 수익 관리 (`/revenue`)

> 레이아웃 순서: 필터 → 통계 카드 → 납부 상태 카드 → 탭

### 9.1 필터 (최상단 Card)
- [ ] 기간 선택: 시작일/종료일 date input + 빠른 선택 버튼 (전체, 이번 달, 지난 달, 올해)
  - [ ] 활성 빠른 선택: default variant, 비활성: outline variant
- [ ] 결제 상태: 빠른 선택 버튼 (전체, 미납만, 미완납, 완납만)
- [ ] "내보내기" 버튼 (outline, Download 아이콘, 필터 우측)
- [ ] 필터 적용 시 하단 요약: 날짜 범위 + 결제 상태 + 필터된 건수 (13px, muted-foreground)

### 9.2 통계 카드 (1행, grid-cols-4)
- [ ] 총 수익: `₩{value}원` (text-success, DollarSign 아이콘)
- [ ] 예상 총 수익: `₩{value}원` (text-primary, DollarSign 아이콘)
- [ ] 총 미수금: `₩{value}원` (text-error, AlertTriangle 아이콘, 0이면 text-success)
- [ ] 수익률: `{percentage}%` (EXEMPT_COLOR, CheckCircle 아이콘)

### 9.3 납부 상태 카드 (2행, grid-cols-4)
- [ ] 완납: `{count}건` (text-success, CheckCircle 아이콘)
- [ ] 부분납부: `{count}건` (text-warning, Clock 아이콘)
- [ ] 미납: `{count}건` (text-error, AlertTriangle 아이콘)
- [ ] 면제: `{count}건` (EXEMPT_COLOR)

### 9.4 강좌별 수익 탭
- [ ] 테이블: 강좌명, 수강생 수, 수익, 예상 수익, 미수금, 완납률
- [ ] 미수금: 양수 시 text-error, 0 시 text-success

### 9.5 미납자 관리 탭
- [ ] 탭 라벨: `미납자 관리 ({count})`
- [ ] 테이블: 수강생, 전화번호, 강좌, 수강료, 납부 상태(Badge), 납부 금액, 납부일, 납부 방법, 할인, 잔여 금액, 작업
- [ ] 납부 상태 Badge: pending(error "미납"), partial(warning "부분납부"), completed(success "완납"), exempt(purple "면제")
- [ ] 납부 방법: `PAYMENT_METHOD_LABELS` 맵으로 표시
- [ ] "납부 처리" 버튼 (link variant) → PaymentForm 모달

### 9.6 분기별 수익 현황 탭
- [ ] 탭 라벨: Calendar 아이콘 + "분기별 수익 현황"
- [ ] **분기 선택기** (Select, width 140):
  - [ ] `getQuarterOptions()` 기반 드롭다운 (예: "2026년 1분기")
  - [ ] 기본값: `getCurrentQuarter()` (현재 분기)
  - [ ] "이번 분기" 빠른 이동 버튼 (outline, sm)
- [ ] **우측 요약** (text-sm, gap 6):
  - [ ] 분기 수익: text-success
  - [ ] 예상: font-semibold
  - [ ] 수납률: 100% 미만이면 text-error, 그 외 text-success
- [ ] 테이블: 강좌명, 수강생, 납부(text-success), 미납(양수 시 text-error), 분기 수익, 예상 수익, 수납률
- [ ] 수납률 색상: 100%↑ text-success, 50~100% text-warning, 50% 미만 text-error
- [ ] 수강생이 있는 강좌만 표시 (`.filter(d => d.studentCount > 0)`)
- [ ] 데이터 없음: "데이터가 없습니다"

### 9.7 내보내기
- [ ] Dialog 모달 (max-w-320px)
- [ ] 제목: "수익 현황 내보내기"
- [ ] 전체 선택 체크박스 + "{선택수}/{전체수}" 카운트
- [ ] 필드: `REVENUE_EXPORT_FIELDS` 기반 (강좌명, 수강생, 전화번호, 수강료, 할인금액, 납부금액, 잔여금액, 납부상태, 납부방법, 등록일, 메모)
- [ ] 기본 선택: 강좌명, 수강생, 수강료, 납부금액, 잔여금액, 납부상태
- [ ] Excel / CSV 버튼 (FileSpreadsheet/FileText 아이콘)

---

## 10. 캘린더 (`/calendar`)

### 10.1 월간 캘린더
- [ ] 페이지 제목: "캘린더" (헤더에 표시)
- [ ] "오늘" 버튼 → 현재 월 이동
- [ ] "< 이전" / "다음 >" 월 이동 버튼
- [ ] 현재 표시: "YYYY년 MM월" 형식
- [ ] 년도 Select 드롭다운 (예: 2026)
- [ ] 월 Select 드롭다운 (예: 3월)
- [ ] 월/년 뷰 전환 Segmented 버튼 (월 | 년)
- [ ] 강좌 일정 기반 셀 표시 (startDate ~ endDate, daysOfWeek, holidays 제외)
- [ ] 셀에 수업 시간 + 강좌 이름 표시
- [ ] 셀에 강의실 + 수강 인원 (count/max) 표시
- [ ] **강좌 카드 색상**: 연한 배경 (info/destructive 8%), 텍스트 가시성 개선
- [ ] 정원 상태 색상: 여유(info), 마감(destructive)
- [ ] 종료일(endDate) 있으면 이후 미표시, 없으면 무기한

### 10.2 날짜 클릭 모달
- [ ] 제목: "YYYY년 MM월 DD일 (ddd) 강좌 목록"
- [ ] 강좌별 카드: 강의실, 강사, 수업시간~종료시간, 수강료
- [ ] 강좌 일정 상세: 시작일, 총 회차, 수업 요일
- [ ] 강좌 없는 날짜 클릭 시 모달 미표시

---

## 11. 설정 (`/settings`)

### 11.1 페이지 구조
- [ ] max-width 1000px
- [ ] **5개 섹션 그룹핑**, 각 섹션에 lucide 아이콘 + 제목(15px, fontWeight 700) + 설명(12px, muted-foreground):
  1. **계정** (KeyRound 아이콘): "로그인 및 라이선스 관리"
  2. **학원 정보** (Building2 아이콘): "헤더와 백업에 표시되는 이름"
  3. **화면 설정** (Palette 아이콘): "앱 모양 변경"
  4. **알림 / 보안** (Bell 아이콘): "알림과 잠금 설정"
  5. **앱 정보** (Info 아이콘)
- [ ] 각 섹션 카드: border 1px, borderRadius 12, padding `4px 20px`
- [ ] 섹션 간 간격: marginTop 32

### 11.2 계정 섹션
- [ ] **로그인 계정**: 이메일 표시 + 인증 방식 Badge (provider별 색상) + "로그아웃" 버튼 (destructive)
  - [ ] 인증 방식 Badge: green(success) / blue(info) / orange(warning) / secondary
- [ ] **현재 플랜**: 플랜 설명 + 플랜 Badge + 라이선스 키 표시/관리
  - [ ] 체험판: "강좌 N개, 강좌당 수강생 N명 제한" + warning Badge "체험판" + "라이선스 활성화" 버튼
  - [ ] Basic/Admin: "모든 기능을 제한 없이 사용 가능" + success/error Badge
  - [ ] 키 마스킹: 앞 9자 + `****-****`
  - [ ] 키 표시/숨김 토글 (Eye/EyeOff 아이콘, ghost variant)
  - [ ] 키 복사 버튼 (Copy 아이콘) + 토스트 "키가 복사되었습니다."

### 11.3 라이선스 활성화 모달
- [ ] Dialog, 제목: "라이선스 활성화"
- [ ] 설명: "키를 직접 입력하거나 전체 붙여넣기 하세요"
- [ ] LicenseKeyInput 컴포넌트: 4칸 자동 이동, 백스페이스 → 이전 칸, 붙여넣기 자동 분배
- [ ] "활성화" 버튼 (full width, activating 중 Loader2 spinner)
- [ ] 키 형식: `TMKH-XXXX-XXXX-XXXX` (Basic) / `TMKA-XXXX-XXXX-XXXX` (Admin)
- [ ] 에러 처리:
  - [ ] `invalid_format` → "유효하지 않은 형식입니다."
  - [ ] `network_error` → "서버에 연결할 수 없습니다. 인터넷 연결을 확인하세요."
  - [ ] `max_seats_reached` → "이 라이선스의 최대 사용자 수에 도달했습니다."
  - [ ] 기타 → "유효하지 않은 라이선스 키입니다."
- [ ] 조직 변경 시 데이터 이전 확인 AlertDialog
- [ ] 문의처 표시: `appConfig.contactInfo`

### 11.4 학원 정보 섹션
- [ ] 이름 입력 (Input, width 240px) + "저장" 버튼 (Save 아이콘)
- [ ] 체험판: 이름 필드 disabled, "라이선스 활성화 후 변경 가능" 안내
- [ ] 저장 버튼: 이름 미변경 시 disabled
- [ ] 클라우드 시 Supabase organizations 테이블 함께 업데이트
- [ ] 저장 실패 시 이전 값 롤백 + 에러 토스트

### 11.5 화면 설정 섹션
- [ ] **다크 모드**: Switch 토글 + "켜짐/꺼짐" 라벨, 설명 "앱의 테마를 변경합니다"
  - [ ] 다크모드 텍스트 87% opacity
- [ ] **텍스트 크기**: 7단계 슬라이더 (range input)
  - [ ] 7단계: xs(11px, "아주 작게") / small(12px, "작게") / medium(14px, "보통") / large(16px, "크게") / xl(18px, "매우 크게") / xxl(20px, "특대") / xxxl(22px, "최대")
  - [ ] 슬라이더 양 끝에 "가" 글자 크기 미리보기 (11px / 18px)
  - [ ] 현재 선택 라벨 + px 값 우측 표시 (예: "보통 (14px)")
  - [ ] `accentColor: hsl(var(--foreground))`

### 11.6 알림 / 보안 섹션
- [ ] **알림**: Switch 토글 + "켜짐/꺼짐" 라벨
  - [ ] 활성화 시: "앱 내 알림이 활성화되어 있습니다"
  - [ ] 비활성화 시: "알림이 비활성화되어 있습니다"
- [ ] **화면 잠금 사용**: Switch 토글
  - [ ] 활성화 시: "화면 잠금이 활성화되어 있습니다"
  - [ ] 비활성화 시: "자리를 비울 때 화면을 잠급니다"
  - [ ] 켜짐 시 (PIN 미설정): PIN 설정 모달 자동 표시
- [ ] **잠금 활성화 시 추가 설정** (조건부 표시, borderTop 구분선):
  - [ ] PIN 설정: "4~6자리 숫자 PIN" + "PIN 변경" 버튼 (outline, Lock 아이콘)
  - [ ] 자동 잠금: Select (사용 안 함/1분/3분/5분/10분/30분/1시간/2시간/6시간/24시간)
  - [ ] 지금 잠금: "화면을 즉시 잠급니다" + "잠금" 버튼 (outline, Lock 아이콘)

### 11.7 화면 잠금 상세
- [ ] PIN 설정 Dialog (max-w-sm):
  - [ ] 3단계: verify(기존 확인) → new(새 PIN) → confirm(확인)
  - [ ] PIN 입력: type="password", maxLength 6, text-xl, tracking-[8px]
  - [ ] PIN 4~6자리 숫자, 4자리 미만 시 버튼 disabled
  - [ ] PIN 불일치: "PIN이 일치하지 않습니다." 에러 메시지
  - [ ] 기존 PIN 불일치: "기존 PIN이 올바르지 않습니다." 에러 메시지
  - [ ] 설정 완료: 토스트 "PIN이 설정되었습니다."
- [ ] 잠금 화면:
  - [ ] PIN 4~6자리 입력 → 해제 (4자리 미만 시 버튼 disabled)
  - [ ] 실패 메시지: "PIN이 올바르지 않습니다. ({시도}/{최대})"
  - [ ] 5회 실패 → 30초 잠금: "{MAX_ATTEMPTS}회 실패. {남은초}초 후 다시 시도하세요."
  - [ ] 잠금 중 입력 필드 disabled
  - [ ] 잘못된 PIN 흔들림(shake) 애니메이션

### 11.8 앱 정보 섹션
- [ ] 버전: "{APP_NAME} v{APP_VERSION}" + 최신 버전 시 success Badge "최신 버전"
- [ ] "업데이트 확인" 버튼 (outline, checkingUpdate 중 Loader2 spinner)
- [ ] 새 버전 발견 시: "새 버전" success Badge + 버전 번호 + 변경 사항 (HTML 렌더링)
- [ ] "다운로드 및 설치" 버튼 → 다운로드 중 Progress 바 + 퍼센트 표시
- [ ] 다운로드 완료 → "업데이트 다운로드 완료" AlertDialog: "설치 및 재시작" / "나중에"

### 11.9 관리자 섹션 (Admin 전용)
- [ ] `currentPlan === 'admin'`일 때만 표시
- [ ] Card 컴포넌트, max-w-1000px, padding 24px
- [ ] AdminTab 컴포넌트: 라이선스 키 생성, 라이선스 목록, 조직 목록 + 사용량 통계, DEV 도구

### 11.10 로그아웃
- [ ] AlertDialog: "로그아웃" 제목, "로그아웃하면 로그인 화면으로 돌아갑니다." 설명
- [ ] 확인 → `deactivateCloud()` 호출 + 토스트 "로그아웃되었습니다."

---

## 12. 알림 시스템

### 12.1 알림 관리
- [ ] 타입: `payment_overdue`(납부 기한 경과), `payment_reminder`(납부 안내), `info`(일반)
- [ ] 우선순위: high→"긴급"(빨강 태그), medium→"중요"(주황), low→"일반"(파랑)
- [ ] 읽지 않은 알림: 굵은 글씨(strong) + 헤더 카운트 배지
- [ ] 알림 클릭 → 읽음 처리
- [ ] 개별 삭제
- [ ] 전체 삭제
- [ ] 빈 상태: "새로운 알림이 없습니다"

### 12.2 알림 저장
- [ ] localStorage 영속 저장
- [ ] 손상된 JSON → 빈 배열 폴백
- [ ] 상대 시간 표시 (방금 전, N분 전, N시간 전...)

---

## 13. 자동 업데이트

- [ ] 60분 간격 백그라운드 업데이트 체크
- [ ] 새 버전 발견 시 알림
- [ ] "이 버전 건너뛰기" → localStorage 저장, 재알림 안 함
- [ ] 다운로드 진행률 바
- [ ] "설치 후 재시작" 확인 모달

### 13.1 강제 업데이트
- [ ] GitHub Release body에 `[FORCE]` 태그 포함 시 강제 업데이트
- [ ] 모달 제목: "필수 업데이트" + 빨간 "필수" 태그
- [ ] 경고 배너: "이 업데이트는 필수입니다. 업데이트 후 앱을 사용할 수 있습니다."
- [ ] 모달 닫기 불가 (closable=false, maskClosable=false, keyboard=false)
- [ ] "이 버전 건너뛰기" 버튼 숨김
- [ ] skippedVersion 체크 무시 (이전에 건너뛴 버전이어도 강제 표시)
- [ ] 버튼 텍스트: "지금 업데이트 (필수)" (danger 스타일)
- [ ] `[FORCE]` 태그는 변경 사항 표시에서 자동 제거

---

## 14. Electron IPC API

- [ ] `getAppVersion` — semver 형식 반환
- [ ] `getMachineId` — 비어있지 않은 문자열
- [ ] `saveData` / `loadData` — 키-값 저장/로드 왕복
- [ ] `loadData` 존재하지 않는 키 → `'[]'` (빈 배열 JSON 문자열)
- [ ] `listBackups` — 배열 반환
- [ ] `createBackup` / `restoreBackup` / `deleteBackup`
- [ ] `importBackup` / `exportBackupFile`
- [ ] `openExternal` — 외부 URL 열기
- [ ] `showOpenDialog` — 파일 열기 다이얼로그
- [ ] `showSaveDialog` — 파일 저장 다이얼로그
- [ ] `relaunch` — 앱 재시작
- [ ] `checkForUpdates` / `downloadUpdate` / `installUpdate`

---

## 15. 데이터 무결성

### 15.1 수강 철회 (소프트 딜리트)
- [ ] `withdrawEnrollment(id)` → `paymentStatus = 'withdrawn'` 업데이트 (레코드 삭제 안 함)
- [ ] withdrawn 상태의 수강 등록은 강좌 상세 목록에서 필터링 (`e.paymentStatus !== 'withdrawn'`)
- [ ] **납부 기록(PaymentRecord) 보존** — 수강 철회 시에도 삭제하지 않음
- [ ] Enrollment 타입 paymentStatus: `'pending' | 'partial' | 'completed' | 'exempt' | 'withdrawn'`

### 15.2 연쇄 삭제
- [ ] 강좌 삭제 → 관련 수강 등록 함께 삭제
- [ ] 수강생 삭제 → 관련 수강 등록 함께 삭제

### 15.3 에러 복원력
- [ ] 데이터 로드 실패 시 기존 데이터 유지 (빈 배열 초기화 방지)
- [ ] 데이터 추가/수정 실패 시 로컬 state 미반영 (throw → set() 미도달)
- [ ] orgId 없을 때 insert 차단 (throw)
- [ ] Supabase 연결 실패 시 에러 throw (silent fail 방지)

### 15.4 동시성
- [ ] 납부 금액 변경 → enrollment paidAmount 동기화

### 15.5 ErrorBoundary
- [ ] React 렌더링 오류 시 전체 화면 에러 UI: "문제가 발생했습니다"
- [ ] "다시 시도" + "페이지 새로고침" 버튼
- [ ] DEV 모드에서만 스택 트레이스 표시

---

## 16. 키보드 단축키

- [ ] `Cmd+K` / `Ctrl+K` → 글로벌 검색 토글
- [ ] `Escape` → 모달/검색 닫기
- [ ] `Enter` → 폼 제출 (메모 제외, Shift+Enter는 줄바꿈)
- [ ] 폼 필드 간 `Enter` → 다음 필드 포커스 이동

---

## 17. 반응형 / UI / 전역 스타일

### 17.1 UI 프레임워크
- [ ] **shadcn/ui + Tailwind v4** (antd 완전 제거)
- [ ] 브랜드 컬러: `#007aff`
- [ ] 다크모드 텍스트 87% opacity

### 17.2 사이드바
- [ ] **220px 고정**, 접힘 기능 없음 (반응형 접힘 제거)

### 17.3 금액/날짜 형식
- [ ] 금액: `₩{value.toLocaleString()}` 통일
- [ ] 날짜: `YYYY-MM-DD` 또는 locale string

### 17.4 토스트
- [ ] sonner 기반 토스트
- [ ] 성공(success), 경고(warning), 에러(error), 정보(info)

### 17.5 폼 공통
- [ ] **모든 폼 이중 클릭 방지**: `submitting` state + 제출 중 버튼 disabled
- [ ] **모달 높이 transition**: 콘텐츠 변경 시 부드러운 높이 변화
- [ ] **slide-enter 애니메이션**: 조건부 표시 요소에 적용 (할인 입력, 면제 안내 등)

### 17.6 납부 방법
- [ ] **모든 곳에서 필수** 필드 (라디오 → 버튼 그룹)
- [ ] **기본값: cash** (현금)
- [ ] 3가지: 현금(cash), 카드(card), 계좌이체(transfer)
