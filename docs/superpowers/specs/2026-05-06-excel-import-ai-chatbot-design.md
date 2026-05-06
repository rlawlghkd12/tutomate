# AI 챗봇 (엑셀 임포트 통합) 기능 설계

**날짜:** 2026-05-06
**상태:** Draft (v2: 챗봇 통합 UX로 갱신)
**범위:** apps/tutomate, apps/tutomate-q (공용), packages/core, packages/electron-shared

## 배경 및 목표

### 대상 사용자
TutorMate는 "학원" 한정이 아니라 **수강생·강사·프로그램을 관리하는 모든 조직**을 대상으로 한다.
- 학원 (입시/어학/예체능)
- 공방, 교습소, 개인 과외
- 평생교육원, 문화센터
- 코딩 부트캠프, 직업 훈련 기관
- 1인 강사 운영 형태 포함

이 문서에서 편의상 "학원/원생/수강료" 같은 용어를 사용하지만, 실제로는 위 도메인 전반에 적용된다. UI 카피·메시지는 더 일반적인 표현(수강생/교습/수업료 등)을 우선 사용한다.

### 사용자 요청
1. 자연어 질의로 수강생 데이터 조회·요약 (예: "민준이 결제 언제 했더라?")
2. 엑셀 파일을 챗봇에 첨부해 "이거 추가해줘" 한 번으로 수강생/납입 정보 자동 임포트

### 핵심 UX 결정
**엑셀 임포트는 별도 페이지가 아니라 챗봇의 한 도구다.** 사용자는 챗봇 대화에서 파일을 첨부(드래그 또는 클립)하고 자연어로 지시하면 챗봇이 처리·미리보기·확정까지 안내한다.

이유:
- 60대 사용자에게 "말로 시키는 한 곳"이 메뉴 항해보다 직관적
- 임포트 결과를 그 자리에서 자연어로 설명·요약 가능
- 동일 대화 안에서 후속 질문 가능 ("방금 추가한 학생들 다음 달 수업료 얼마지?")

### 핵심 제약
- 60대 이상 사용자가 다수 — 직관성/큰 글씨/단순 UX 필수
- 수강생 데이터(이름·전화·결제)에 개인정보 포함 → **외부 전송 불가**
- 운영자가 사용량 기반 클라우드 비용·API 키 관리 부담을 지지 않음
- 사용 PC는 8GB RAM Windows가 일반 (16GB 미보장)

### 목표
- 챗봇 (엑셀 임포트 도구 포함) **한 번에** 출시
- 풀로컬 LLM, 온디맨드 다운로드, 외부 전송 0
- AI 미설치 PC에서도 폴백: 챗봇 메뉴 비활성, 임포트는 직접 도구 호출 폼으로 가능
- 매핑/요약/조회 답변 정확성 우선 (할루시네이션 방지)

## 결정 요약

| 항목 | 결정 |
|---|---|
| 사용자 진입점 | **AI 챗봇 단일 페이지** (엑셀 별도 페이지 없음) |
| 엑셀 첨부 방식 | 챗봇 입력 영역에 파일 첨부 (드래그 + 클립 버튼) |
| 엑셀 양식 | 자유 양식, 단 **표준 헤더 사전 매칭만 허용** |
| 매핑 방식 | 룰 기반 + 동의어 사전 + 조직별 캐시 |
| 매칭 실패 시 | 챗봇이 안내 + 표준 양식 다운로드 링크 카드 |
| 수동 매핑 UI | 없음 |
| 임베딩 모델 | 사용하지 않음 |
| 챗봇 모델 | **Qwen 3.5 4B Instruct Q4_K_M (~2.74GB)** — TAU2 agentic 27 (동급 최강) |
| 챗봇 패턴 | Function Calling (도구 카탈로그, 임포트 도구 포함) |
| 미리보기/확정 | 챗봇 메시지 내 "스마트 카드"(테이블/버튼)로 노출 |
| 배포 | 풀로컬, 온디맨드 다운로드, 외부 전송 0 |
| 런타임 | node-llama-cpp (Electron 메인 프로세스) |
| 사양 적응 | RAM/디스크 진단 후 분기 + 안내 |
| AI 미설치 폴백 | 사양 미달/미설치: 챗봇 비활성, "엑셀 직접 임포트" 폼 폴백 (도구 직접 실행) |

## 시나리오 (UX 흐름 요약)

### A. 결제 조회 챗봇
```
사용자: "민준이 결제 언제 했더라?"
LLM   : (도구 호출) searchStudent(name="민준") → getPaymentHistory(...)
LLM   : "김민준 학생은 2025년 4월 15일에 5만원 결제하셨어요." (출처 카드)
```

### B. 엑셀 임포트 (성공)
```
사용자: [엑셀 파일 첨부] "이거 결제 내역 추가해줘"
LLM   : (도구) parseExcelHeaders(fileId) → mapColumns(headers)
LLM   : (도구) previewImport(fileId, mapping)
UI    : 챗봇 메시지에 미리보기 카드 (행 5개 표시 + "전체 N행" + [확정] [취소] 버튼)
사용자: [확정] 버튼 클릭
LLM   : (도구) confirmImport(fileId)
LLM   : "32명의 결제 내역을 추가했어요." (요약 카드: 추가 N건 / 중복 N건 / 오류 N건)
```

### C. 엑셀 임포트 (매칭 실패)
```
사용자: [엑셀 파일 첨부] "이거 추가해줘"
LLM   : (도구) parseExcelHeaders → mapColumns
LLM   : "엑셀의 일부 컬럼을 인식하지 못했어요. ✓ 인식: 이름, 연락처
        ✗ 인식 안 됨: 결제일자, 등록일.
        표준 양식대로 작성해 다시 첨부해주세요."
UI    : [표준 양식 다운로드] 버튼 카드
```

### D. AI 미설치 폴백
- 챗봇 메뉴 진입 → 모델 미설치 → 다운로드 모달 (사양 진단 + 진행률)
- 사용자가 "나중에" 선택 시: 화면 하단에 "엑셀 직접 임포트" 미니 폼 노출 → 파일 첨부 → 도구가 챗봇 우회로 직접 실행 (대화는 없음, 미리보기 카드만 표시)

## 아키텍처

```
┌────────────────────────────────────────────────────────┐
│  TutorMate Electron App                                  │
│                                                          │
│  Renderer (React)                                        │
│  ┌────────────────────────────────────────────┐         │
│  │ AI 챗봇 페이지                              │         │
│  │  - 메시지 리스트 (텍스트 + 스마트 카드)     │         │
│  │  - 입력창 (텍스트 + 파일 첨부)              │         │
│  │  - 모델 다운로드 모달                       │         │
│  │  - 폴백: 직접 임포트 미니 폼               │         │
│  └─────────────┬──────────────────────────────┘         │
│                │ IPC                                     │
│  ──────────────┼─────────────────────────────────       │
│  Main (Node)                                             │
│  ┌─────────────▼──────────────────────────────┐         │
│  │ AIRuntime (LlamaRuntime + 도구 라우팅)      │         │
│  │  - chat(messages, tools)                    │         │
│  │  - tool_call → ActionDispatcher             │         │
│  └─────────────┬──────────────────────────────┘         │
│                ▼                                         │
│  ┌─────────────────────────────────────────────┐        │
│  │ ActionDispatcher (Zod 검증)                  │        │
│  │  - 일반 도구: searchStudent / getPayments .. │        │
│  │  - 임포트 도구: parseExcelHeaders / map.. /  │        │
│  │    previewImport / confirmImport             │        │
│  └─────────────┬──────────────────────────────┘        │
│                ▼                                         │
│  ┌──────────────────┐ ┌────────────────────────┐        │
│  │ ExcelParser /    │ │ Supabase (조회/UPSERT) │        │
│  │ ColumnMapper /   │ └────────────────────────┘        │
│  │ DataNormalizer   │                                    │
│  └──────────────────┘                                    │
│                                                          │
│  ┌─────────────────────────────────────────────┐        │
│  │ ModelManager / HardwareDiagnostic            │        │
│  │ FileStash (첨부 파일 임시 저장 + fileId)     │        │
│  └─────────────────────────────────────────────┘        │
└────────────────────────────────────────────────────────┘
```

### 패키지 배치

```
packages/core/src/
  excel/
    types.ts              표준 필드/매핑/임포트 결과 타입
    ExcelParser.ts        xlsx 버퍼 → headers + rows
    DataNormalizer.ts     룰 기반 정규화
    index.ts
    __tests__/
  mapping/
    synonyms.ts           동의어 사전
    ColumnMapper.ts       룰 매칭
    mappingCacheStore.ts  Supabase mapping_profiles CRUD
    index.ts
    __tests__/
  ai/
    types.ts              Tool / ChatMessage / ToolCall 타입
    ToolCatalog.ts        도구 정의 (조회 + 임포트)
    ActionDispatcher.ts   도구 실행 + Zod 검증
    tools/
      searchStudent.ts
      getStudent.ts
      getPaymentHistory.ts
      getUnpaidStudents.ts
      getAttendance.ts
      getEnrollment.ts
      listClasses.ts
      getClassRoster.ts
      getMonthlySummary.ts
      getStudentSummary.ts
      parseExcelHeaders.ts
      mapColumns.ts
      previewImport.ts
      confirmImport.ts
    index.ts
    __tests__/

packages/electron-shared/src/ai/
  HardwareDiagnostic.ts   RAM/디스크 진단
  ModelManager.ts         다운로드/로드/삭제/재개
  LlamaRuntime.ts         node-llama-cpp 래퍼
  FileStash.ts            첨부 파일 임시 저장 (fileId 발급, TTL)
  index.ts

apps/tutomate/electron/    (없으면 신규 생성)
  ipc/
    aiHandler.ts          IPC 등록 (ai:status / diagnose / download / chat / cancel)
    fileStashHandler.ts   IPC: file-stash:save (Renderer 첨부 → fileId)

apps/tutomate/src/pages/ai-chat/
  AiChatPage.tsx
  components/
    ChatWindow.tsx
    MessageBubble.tsx
    SmartCard/
      ImportPreviewCard.tsx
      ImportResultCard.tsx
      MappingErrorCard.tsx
      SourceLinkCard.tsx
    ChatInput.tsx                    (텍스트 + 파일 첨부)
    ModelDownloadModal.tsx
    HardwareDiagnosticView.tsx
    DirectImportFallback.tsx         (AI 비활성 폴백 폼)

apps/tutomate-q/  ...same...

supabase/migrations/
  YYYYMMDDHHMMSS_mapping_profiles.sql

public/templates/
  tutomate-import-template.xlsx       (정적 템플릿 파일)
```

## 컴포넌트 상세

### ExcelParser (`packages/core/src/excel/ExcelParser.ts`)
- 입력: 파일 버퍼 (Uint8Array)
- 출력: `{ headers: string[]; rows: Record<string, unknown>[] }`
- 첫 시트 사용. 첫 행을 헤더로 인식.
- 의존: `xlsx` (sheetjs)
- 실패: 파일 파손/빈 시트/헤더 행 없음 → 명확한 에러

### DataNormalizer (`packages/core/src/excel/DataNormalizer.ts`)
룰 기반 정규화 (LLM 미사용):
- **전화**: 비숫자 제거 → `^010\d{8}$` 검증, 위반 시 에러
- **날짜**: `YYYY-MM-DD` / `YYYY.MM.DD` / `YY.MM.DD` / `M월 D일` 등 → ISO 변환
- **금액**: 콤마/원/₩ 제거, 한글(만/천) 처리 → 정수
- **이름**: 양끝 공백 제거, 내부 다중 공백 단일화

각 행에 정규화 실패 컬럼 정보 포함 (UI에서 빨강 표시).

### ColumnMapper (`packages/core/src/mapping/ColumnMapper.ts`)

표준 필드:
- `name`, `phone`, `parentPhone`, `birthDate`, `enrollmentDate`,
  `paymentDate`, `amount`, `paymentMethod`, `note`,
  `className`, `tuitionPlan`

알고리즘:
1. 헤더 정규화: 공백/괄호/특수문자 제거, 소문자화
2. **조직별 캐시 조회**(`mapping_profiles`, key=sha1(정규화 헤더 시퀀스))
   - HIT → 즉시 적용
3. **동의어 사전 매칭**: 정확 일치 → 부분 일치(포함)
4. 미매칭 컬럼 1개라도 → **거부** (호출자가 안내)
5. 모든 컬럼 매칭 + 캐시 MISS → 캐시 저장

동의어 사전 (도메인 중립):
```typescript
const SYNONYMS: Record<StandardField, string[]> = {
  name:           ['이름', '학생명', '성명', '원생명', '수강생명', '아이이름', '회원명', '교습생', 'name', 'student', 'member'],
  phone:          ['전화', '연락처', '핸드폰', '휴대폰', '전화번호', 'phone', 'tel', 'mobile'],
  parentPhone:    ['보호자', '학부모', '학부모연락처', '보호자전화', '엄마번호', '아빠번호'],
  birthDate:      ['생년월일', '생일', '생년', '출생일'],
  enrollmentDate: ['등록일', '등록일자', '입회일', '가입일', '시작일'],
  paymentDate:    ['납부일', '결제일', '입금일', '납입일', '수납일', '결제일자', '납부일자'],
  amount:         ['금액', '수강료', '납부액', '결제금액', '학원비', '원비', '수업료', '교습비', '강습료', '회비'],
  paymentMethod:  ['결제수단', '납부방법', '결제방법', '결제유형'],
  note:           ['비고', '메모', '특이사항', '참고'],
  className:      ['반', '수강반', '클래스', '강의명', '강좌명', '수업명'],
  tuitionPlan:    ['과정', '수강과정', '코스', '프로그램', '강좌'],
};
```

캐시 마이그레이션:
```sql
create table mapping_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  signature text not null,
  mapping jsonb not null,
  created_at timestamptz default now(),
  unique (org_id, signature)
);
```

### FileStash (`packages/electron-shared/src/ai/FileStash.ts`)
챗봇 도구 흐름에서 큰 파일을 LLM 컨텍스트에 넣지 않기 위한 임시 저장소.
- `save(buffer) → fileId` (UUID)
- `read(fileId) → buffer`
- `delete(fileId)` (자동 30분 TTL)
- 저장 위치: `userData/.stash/`

LLM에는 fileId(짧은 문자열)만 전달. 도구가 fileId로 실제 데이터 접근.

### ToolCatalog (`packages/core/src/ai/ToolCatalog.ts`)

**조회 도구 (10개)** + **임포트 도구 (4개)**:

| 이름 | 인자 | 설명 |
|---|---|---|
| `searchStudent` | name?, phone? | 부분 일치 검색 |
| `getStudent` | studentId | 수강생 상세 |
| `getPaymentHistory` | studentId, period?, limit? | 결제 이력 |
| `getUnpaidStudents` | month? | 미납자 |
| `getAttendance` | studentId, period? | 출석 기록 |
| `getEnrollment` | studentId | 수강 등록 |
| `listClasses` | studentId? | 반 목록 |
| `getClassRoster` | classId | 반 명단 |
| `getMonthlySummary` | month | 월간 매출/등록 요약 |
| `getStudentSummary` | studentId | 수강생 자연어 요약 |
| `parseExcelHeaders` | fileId | 헤더 + 샘플 3행 + 행 개수 |
| `mapColumns` | fileId, headers | 매핑 시도 결과 (성공 매핑 / 미매칭 컬럼) |
| `previewImport` | fileId, mapping | 정규화된 미리보기 (최대 50행 + 통계) |
| `confirmImport` | fileId, mapping, kind: 'students'\|'payments' | 실제 upsert + 결과 통계 |

각 도구는 Zod 스키마로 인자 검증. 검증 실패/존재하지 않는 도구는 `ActionDispatcher`가 차단.

### ActionDispatcher
- 도구명·인자 검증 → 실행 → 결과를 LLM 친화적 JSON으로 반환
- 라운드 한도 5회 (무한 루프 방지)
- 에러는 `{ error: { code, message } }` 형태로 LLM에 반환 (LLM이 사용자에게 풀어서 설명)

### 스마트 카드 (Renderer)

LLM은 텍스트 + 카드 메타를 같이 반환할 수 있다. 카드는 `tool_call` 결과를 UI가 렌더링하는 한정된 컴포넌트:

| 카드 | 입력 | 동작 |
|---|---|---|
| `MappingErrorCard` | { matched, unmatched } | 매칭/미매칭 컬럼 + [표준 양식 다운로드] 버튼 |
| `ImportPreviewCard` | { rows, total, errorRows } | 5행 미리보기 + [전체 보기] [확정] [취소] 버튼 |
| `ImportResultCard` | { added, duplicated, errors } | 결과 요약 |
| `SourceLinkCard` | { kind, id, label } | 클릭 시 원본 페이지 이동 (학생 상세 등) |

LLM 응답 프로토콜: 일반 텍스트 메시지 + 선택적 `cards: Card[]` 메타필드 (별도 도구 호출이 아니라 마지막 응답 시 부착).

### AIRuntime / ModelManager / HardwareDiagnostic

상태:
- `not_installed` / `downloading` / `loading` / `ready` / `disabled` (사양 미달)

IPC API:
- `ai:status() → state`
- `ai:diagnose() → { ramGB, diskGB, recommendation: 'ok'|'warn'|'block' }`
- `ai:download() → 진행률 이벤트 스트림`
- `ai:chat(messages) → 토큰 스트림 + tool_call 이벤트 + cards`
- `ai:cancel()`
- `ai:uninstall()`
- `file-stash:save(arrayBuffer) → { fileId }`

사양 분기:
Qwen 3.5 4B (Q4) 메모리 점유: 모델 ~3GB + KV cache ~1GB + OS/앱 ~2GB.

| RAM | 디스크 | 동작 |
|---|---|---|
| 16GB+ | 4GB+ | ok / fast (쾌적, 응답 수 초) |
| 8GB | 4GB+ | ok / slow ("응답 15~30초 가능, 다른 앱 종료 권장" 안내) |
| 6~7GB | 3GB+ | warn ("성능이 낮거나 매우 느릴 수 있습니다, 그래도 사용?") |
| <6GB | <3GB | block (챗봇 비활성, **직접 임포트 폴백**만 노출) |

## 데이터 흐름

### 챗봇 일반 응답
1. 사용자 입력 → 메시지 추가
2. AIRuntime.chat(messages, tools) 호출
3. LLM 응답: `tool_call` → ActionDispatcher → 결과 다시 LLM
4. (반복, 최대 5라운드)
5. 최종 텍스트 + 선택적 카드 메타 → 메시지 리스트에 표시

### 챗봇 임포트
1. 사용자가 파일 첨부 → Renderer가 FileStash 저장 (`fileId` 받음)
2. 사용자 메시지에 `[file:<fileId>]` 첨부 메타 포함
3. LLM은 `parseExcelHeaders(fileId)` 호출 → 헤더+샘플 받음
4. LLM이 `mapColumns(fileId, headers)` 호출
   - 매칭 실패 → LLM이 `MappingErrorCard` 메타로 응답
   - 성공 → LLM이 `previewImport` 호출 → `ImportPreviewCard` 메타로 응답
5. 사용자가 카드의 [확정] 버튼 클릭 → Renderer가 chat에 `confirmImport(...)` 시스템 메시지 주입
6. LLM이 `confirmImport`를 호출 → 결과 → `ImportResultCard` 메타로 응답

### 직접 임포트 폴백 (AI 비활성 PC)
1. 사용자가 폴백 폼에서 파일 선택 → FileStash 저장
2. Renderer가 IPC로 `directImport:run(fileId)` 호출 (LLM 우회)
3. 메인 프로세스가 `parseExcelHeaders → mapColumns → previewImport`를 직접 실행
4. 매핑 실패 → 폴백 폼에 카드 그대로 표시
5. 성공 → 미리보기 카드 → [확정] → `confirmImport`

## 에러 처리

| 시나리오 | 대응 |
|---|---|
| 파일 첨부 실패 | "파일을 읽을 수 없어요. 다시 시도해주세요." |
| 엑셀 헤더 없음/파손 | LLM 응답: "첫 행을 헤더로 인식할 수 없어요" |
| 미매칭 컬럼 존재 | `MappingErrorCard` (인식/미인식 + 다운로드 버튼) |
| 정규화 실패 행 | 미리보기 카드에서 빨강 표시 + 카운트 |
| Supabase upsert 실패 | 트랜잭션 롤백, 결과 카드에 실패 행 다운로드 링크 |
| LLM 도구 호출 환각 | ActionDispatcher 차단 → 폴백 응답 |
| LLM 도구 인자 누락 | LLM에 1회 재질의 |
| 도구 라운드 5회 초과 | 강제 종료 + "복잡한 질문이라 답변하기 어려워요" |
| 모델 미설치 + 챗봇 진입 | 다운로드 모달 (사양 진단 + 진행률) |
| 모델 다운로드 끊김 | 재개 다운로드 |
| 챗봇 응답 60초 초과 | 진행 표시기 + 취소 버튼, 60초 후 자동 취소 |
| 사양 미달(block) | 챗봇 비활성, 직접 임포트 폴백 폼 노출 |

## 모델 운영

- **호스팅**: Hugging Face 직접 다운로드 (`unsloth/Qwen3.5-4B-GGUF` / `Qwen3.5-4B-Q4_K_M.gguf`)
- **저장**: Electron `userData/AI/qwen3.5-4b-q4_k_m.gguf`
- **선정 근거**: lab 비교 검증 결과 — TAU2 agentic 27 (Gemma 4 E4B 7 대비 4배), 한국어 자연스러움 무난, 도구 호출 chat template fix 적용. 다중 도구 호출·합성 조건 시나리오에서 안정적
- **무결성**: 다운로드 후 sha256 검증
- **업데이트 정책**: 출시 시점 모델 버전 고정. 향후 별도 결정.
- **삭제**: 설정 > AI 기능에서 "AI 모델 제거"

## 테스트 전략

| 레이어 | 검증 | 비용 |
|---|---|---|
| ExcelParser | 다양한 양식(.xlsx/.xls/한글헤더/병합셀/빈 행) → JSON | 빠름 |
| ColumnMapper | 동의어 사전, 미매칭 검출, 캐시 HIT/MISS | 빠름 |
| DataNormalizer | 전화 12종, 날짜 8종, 금액 한글/콤마/통화 | 빠름 |
| ActionDispatcher | 각 도구 단위, 잘못된 인자, 권한 없는 데이터 | 빠름 |
| FileStash | save/read/TTL/cleanup | 빠름 |
| HardwareDiagnostic | RAM/디스크 모킹별 분기 | 빠름 |
| ModelManager | 다운로드 진행률, 재개, 무결성 검증 | 중간 |
| LLM 통합 (스모크) | 골든 Q&A 50쌍 → 도구 호출 시퀀스 검증 | 비쌈 (실제 모델) |
| 매핑 캐시 학습 | 첫 임포트 → 캐시 → 두 번째 자동 적용 | 빠름 |
| 직접 임포트 폴백 | LLM 우회 경로 종단 테스트 | 빠름 |

골든 데이터셋:
- **양식 30개**: 실제 사용 조직(학원/공방/교습소 등) 엑셀 변형. 매핑 회귀.
- **챗봇 Q&A 50쌍**: 자연 질문 + 호출되어야 할 도구 시퀀스 (조회 + 임포트 모두).

## 구현 단계 (한 번에 출시)

1. AI 인프라: `node-llama-cpp` 통합, ModelManager, HardwareDiagnostic, IPC 채널
2. ExcelParser + 양식 30개 골든셋
3. 동의어 사전 + ColumnMapper + `mapping_profiles` 마이그레이션
4. DataNormalizer + 룰셋 + 정규화 테스트
5. FileStash (첨부 파일 임시 저장)
6. ToolCatalog + ActionDispatcher (조회 10 + 임포트 4 = 14개 도구)
7. AIRuntime: tool_call 라운드 + 카드 메타 프로토콜
8. 챗봇 UI: 메시지 리스트 + 입력창(파일 첨부) + 스마트 카드 4종
9. 모델 다운로드 UX (사양 진단 + 진행률 모달)
10. 직접 임포트 폴백 폼
11. 통합 테스트 + 골든 회귀
12. 베타 → 릴리스

## 미해결 / 추후 결정

- **모델 업그레이드 정책**: Qwen 2.5 → 3.0 시 자동 vs 수동
- **도구 카탈로그 v2**: 출시 후 사용 패턴 보고 추가 도구 결정
- **다국어**: 현재 한국어 전용
- **챗봇 히스토리 영속화**: 조직별 / 사용자별 / 세션 한정 — 미정
- **표준 양식 템플릿 파일**: 컬럼 순서/예시 데이터 디자인 필요
- **카드 메타 프로토콜 직렬화**: 모델 출력에서 카드 추출 방식 (전용 토큰 vs JSON 후처리) — 구현 시 결정
