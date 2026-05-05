# 엑셀 임포트 + AI 챗봇 기능 설계

**날짜:** 2026-05-06
**상태:** Draft
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
1. 조직이 보유한 엑셀 파일을 업로드하면 수강생/납입 정보를 자동으로 추가
2. 자연어 질의로 수강생 데이터 조회·요약 (예: "민준이 결제 언제 했더라?")

### 핵심 제약
- 60대 이상 사용자가 다수 — 직관성/큰 글씨/단순 UX 필수
- 수강생 데이터(이름·전화·결제)에 개인정보 포함 → **외부 전송 불가**
- 운영자가 사용량 기반 클라우드 비용·API 키 관리 부담을 지지 않음
- 사용 PC는 8GB RAM Windows가 일반 (16GB 미보장)

### 목표
- 엑셀 임포트와 AI 챗봇을 **한 번에** 출시
- 풀로컬 LLM, 온디맨드 다운로드, 외부 전송 0
- 모든 사용 PC에서 엑셀 임포트는 동작, 챗봇은 사양 게이트
- 매핑/요약/조회 답변 정확성 우선 (할루시네이션 방지)

## 결정 요약

| 항목 | 결정 |
|---|---|
| 엑셀 양식 | 자유 양식, 단 **표준 헤더 사전 매칭만 허용** |
| 매핑 방식 | 룰 기반 + 동의어 사전 + 조직별 캐시 |
| 매칭 실패 시 | **업로드 거부**, 표준 양식 다운로드 안내, 매칭 결과 표시 |
| 수동 매핑 UI | 없음 |
| 임베딩 모델 | 사용하지 않음 |
| 챗봇 모델 | Qwen 2.5 3B Instruct Q4 (~2GB) |
| 챗봇 패턴 | Function Calling (도구 카탈로그) |
| 배포 | 풀로컬, 온디맨드 다운로드, 외부 전송 0 |
| 런타임 | node-llama-cpp (Electron 메인 프로세스) |
| 사양 적응 | RAM/디스크 진단 후 분기 + 안내 |
| 출시 | 엑셀 임포트 + 챗봇 동시 |

## 아키텍처

```
┌────────────────────────────────────────────────────────┐
│  TutorMate Electron App                                  │
│                                                          │
│  Renderer (React)                                        │
│  ┌──────────────────┐    ┌──────────────────┐           │
│  │ 엑셀 임포트 페이지 │    │ AI 챗봇 페이지     │           │
│  └────────┬─────────┘    └────────┬─────────┘           │
│           │ IPC                    │ IPC                  │
│  ─────────┼────────────────────────┼─────────────────    │
│  Main (Node)                                             │
│  ┌────────▼─────────┐    ┌────────▼─────────┐           │
│  │ ExcelParser       │    │ AIRuntime         │           │
│  │ ColumnMapper      │    │ ActionDispatcher  │           │
│  │ DataNormalizer    │    │ ToolCatalog       │           │
│  └────────┬─────────┘    └────────┬─────────┘           │
│           │                        │                      │
│           ▼                        ▼                      │
│      Supabase                   Supabase                  │
│   (학생/납입 upsert)            (도구가 조회)              │
│                                                          │
│  ┌─────────────────────────────────────────────┐        │
│  │ ModelManager (Qwen 2.5 3B 다운로드/로드)     │        │
│  │ HardwareDiagnostic (RAM/디스크 진단)         │        │
│  │ LlamaRuntime (node-llama-cpp 래퍼)           │        │
│  └─────────────────────────────────────────────┘        │
└────────────────────────────────────────────────────────┘
```

### 패키지 배치

```
packages/core/src/
  excel/        ExcelParser, DataNormalizer, types
  mapping/      ColumnMapper, 동의어 사전, 매핑 캐시 store
  ai/           ActionDispatcher, ToolCatalog, 도구 시그니처

packages/electron-shared/src/ai/
  ModelManager.ts        모델 다운로드/로드/삭제
  HardwareDiagnostic.ts  RAM/디스크/CPU 진단
  LlamaRuntime.ts        node-llama-cpp 래퍼

apps/tutomate/src/pages/
  excel-import/   엑셀 업로드/미리보기/확정 페이지
  ai-chat/        챗봇 대화 페이지

apps/tutomate-q/  ...same...
```

**경계 근거:**
- AI 런타임은 네이티브 바이너리(node-llama-cpp) → Electron 메인 프로세스 전용 → `electron-shared`
- 도구 정의·매핑 로직·엑셀 파싱은 OS 무관 순수 로직 → `packages/core`
- 두 앱(일반/Q)이 동일 기능을 공유

## 컴포넌트 상세

### ExcelParser (`packages/core/src/excel`)
- 입력: `.xlsx` / `.xls` 파일 버퍼
- 출력: `{ headers: string[], rows: Record<string, string>[] }`
- 첫 시트 사용. 첫 행을 헤더로 인식.
- 의존: `xlsx` (sheetjs)
- 실패 케이스: 파일 파손, 빈 시트, 헤더 행 없음 → 명확한 에러 메시지

### ColumnMapper (`packages/core/src/mapping`)

표준 필드 (수강 관리 도메인 공통):
- `name`, `phone`, `parentPhone`, `birthDate`, `enrollmentDate`,
  `paymentDate`, `amount`, `paymentMethod`, `note`,
  `className` (수강반/클래스), `tuitionPlan` (수강 과정/프로그램)

매핑 알고리즘:
1. 헤더 정규화: 공백/괄호/특수문자 제거, 소문자화
2. **조직별 캐시 조회** (`mapping_profiles` 테이블, key = sha1(정규화 헤더 시퀀스))
   - HIT → 즉시 적용, 끝
3. **동의어 사전 매칭**:
   - 정확 일치 → 매핑 확정
   - 부분 일치(포함) → 매핑 확정
   - 미매칭 컬럼 발생 → 4단계로
4. **업로드 거부**: 미매칭 컬럼 1개라도 있으면 실패. 매칭 결과 표시 + 표준 양식 다운로드 안내.
5. 모든 컬럼 매칭 성공 + 첫 매칭(캐시 MISS) 시 캐시 저장.

동의어 사전 (예시):
```typescript
const SYNONYMS: Record<StandardField, string[]> = {
  name:        ['이름', '학생명', '성명', '원생명', '수강생명', '아이이름', '회원명', '교습생', 'name', 'student', 'member'],
  phone:       ['전화', '연락처', '핸드폰', '휴대폰', '전화번호', 'phone', 'tel', 'mobile'],
  parentPhone: ['보호자', '학부모', '학부모연락처', '보호자전화', '엄마번호', '아빠번호'],
  birthDate:   ['생년월일', '생일', '생년', '출생일'],
  enrollmentDate: ['등록일', '등록일자', '입회일', '가입일', '시작일'],
  paymentDate: ['납부일', '결제일', '입금일', '납입일', '수납일', '결제일자', '납부일자'],
  amount:      ['금액', '수강료', '납부액', '결제금액', '학원비', '원비', '수업료', '교습비', '강습료', '회비'],
  paymentMethod: ['결제수단', '납부방법', '결제방법', '결제유형'],
  note:        ['비고', '메모', '특이사항', '참고'],
  className:   ['반', '수강반', '클래스', '강의명', '강좌명', '수업명'],
  tuitionPlan: ['과정', '수강과정', '코스', '프로그램', '강좌'],
}
```

매핑 캐시 (Supabase):
```sql
create table mapping_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  signature text not null,        -- 정규화 헤더 시퀀스의 sha1
  mapping jsonb not null,         -- { "학생명": "name", ... }
  created_at timestamptz default now(),
  unique (org_id, signature)
);
```

### DataNormalizer (`packages/core/src/excel`)

룰 기반 정규화 (LLM 사용 안 함):
- **전화**: 모든 비숫자 제거 → `^010\d{8}$` 형태 검증, 위반 시 에러 표시
- **날짜**: `YYYY-MM-DD` / `YYYY.MM.DD` / `YYYY/MM/DD` / `YY.MM.DD` / `M월 D일` 등 → ISO 변환
- **금액**: 콤마/원/₩ 제거, 한글(만/천) 처리 → 정수
- **이름**: 양끝 공백 제거, 내부 다중 공백 단일화

정규화 실패 행은 미리보기에서 빨강 표시. 사용자가 일괄 업로드 전에 엑셀에서 직접 수정 후 재업로드 (앱 내 행 편집 UI 없음).

### AIRuntime (`packages/electron-shared/src/ai`)

상태:
- `not_installed` — 모델 미다운로드
- `downloading` — 다운로드 중 (진행률 노출)
- `loading` — 메모리 적재 중
- `ready` — 추론 가능
- `disabled` — 사양 미달로 비활성

API (IPC):
- `ai:status()` → 상태
- `ai:diagnose()` → `{ ram: GB, disk: GB, recommendation: 'ok'|'warn'|'block' }`
- `ai:download()` → 진행률 이벤트 스트림
- `ai:chat(messages, tools)` → 메시지 스트림 (응답 토큰 + tool_call)
- `ai:cancel()` → 진행 중 추론 취소
- `ai:uninstall()` → 모델 삭제

### ActionDispatcher + ToolCatalog (`packages/core/src/ai`)

도구 카탈로그 v1 (10개로 시작):

| 이름 | 인자 | 설명 |
|---|---|---|
| `searchStudent` | `name?: string, phone?: string` | 이름/전화 부분 일치 검색, 동명이인 다건 반환 |
| `getStudent` | `studentId: string` | 수강생 상세 |
| `getPaymentHistory` | `studentId: string, period?: 'month'\|'quarter'\|'year', limit?: number` | 결제 이력 |
| `getUnpaidStudents` | `month?: 'YYYY-MM'` | 해당 월 미납자 목록 |
| `getAttendance` | `studentId: string, period?: string` | 출석 기록 |
| `getEnrollment` | `studentId: string` | 수강 등록 정보 |
| `listClasses` | `studentId?: string` | 수강반/클래스 목록 |
| `getClassRoster` | `classId: string` | 반 수강생 명단 |
| `getMonthlySummary` | `month: 'YYYY-MM'` | 해당 월 매출/등록 요약 |
| `getStudentSummary` | `studentId: string` | 수강생 종합 요약 (자연어) |

각 도구는 Zod 스키마로 인자 검증. 검증 실패/존재하지 않는 도구 호출은 `ActionDispatcher`가 차단 후 LLM에 에러 응답.

### HardwareDiagnostic

```
ram >= 16GB && disk >= 5GB     → ok        (쾌적)
ram >= 8GB  && disk >= 3GB     → ok        ("응답 10~20초 걸릴 수 있어요" 안내)
ram >= 4GB  && disk >= 3GB     → warn      ("매우 느릴 수 있습니다, 그래도 사용?")
ram <  4GB  || disk <  2GB     → block     (AI 비활성, 엑셀 임포트만)
```

엑셀 임포트는 모든 사양에서 동작. 챗봇만 게이트.

## 데이터 흐름

### 엑셀 임포트

1. 사용자 파일 선택 → ExcelParser
2. ColumnMapper:
   - 캐시 조회 → HIT면 적용
   - MISS면 동의어 사전 매칭
   - 미매칭 컬럼 1개라도 있으면 → **거부 화면**
3. 매칭 성공 시:
   - DataNormalizer로 모든 행 정규화
   - 미리보기 (정규화 실패 행은 빨강)
4. 사용자 확정 → Supabase 트랜잭션 upsert (학생/납입기록)
5. 첫 매핑이면 `mapping_profiles`에 캐시 저장

### 챗봇

1. 사용자 메시지 → AIRuntime.chat(messages, tools)
2. LLM 응답:
   - `tool_call`이면 → ActionDispatcher가 인자 검증 → 도구 실행 → 결과 LLM에 반환 → 다시 LLM 호출
   - 텍스트면 → 사용자에게 스트리밍 표시
3. 도구 호출 라운드 최대 5회 제한 (무한 루프 방지)
4. 응답에 출처 데이터 메타 첨부 (학생 ID, 결제 기록 ID 등) → UI에서 클릭 시 원본으로 이동

## 에러 처리

| 시나리오 | 대응 |
|---|---|
| 엑셀 헤더 없음/파손 | "첫 행을 헤더로 인식할 수 없어요." 에러 |
| 미매칭 컬럼 존재 | 업로드 거부 화면: 인식/미인식 컬럼 표시 + 표준 양식 다운로드 |
| 정규화 실패 행 | 미리보기에서 빨강 표시, 행 단위 일괄 제외 옵션 |
| Supabase upsert 실패 | 트랜잭션 롤백, 실패 행 CSV 다운로드 |
| LLM 도구 호출 환각(없는 도구) | ActionDispatcher 차단 → "이해 못했어요, 다시 말씀해주세요" 폴백 |
| LLM 도구 인자 누락/타입 오류 | LLM에 1회 재질의, 실패 시 폴백 |
| 도구 호출 라운드 5회 초과 | 강제 종료 + "복잡한 질문이라 답변하기 어려워요" |
| AI 모델 미설치 + 챗봇 호출 | 다운로드 모달 (사양 진단 결과 + 진행률) |
| 모델 다운로드 끊김 | 재개 다운로드 |
| 챗봇 응답 60초 초과 | 진행 표시기 + 취소 버튼, 60초 후 자동 취소 |
| 사양 미달(block) PC | 챗봇 메뉴 비활성화 + 안내 |

## 모델 운영

- **모델 호스팅**: Hugging Face 직접 다운로드 (Qwen2.5-3B-Instruct GGUF Q4_K_M)
- **저장 위치**: Electron `userData` 폴더 (`/AI/qwen-2.5-3b-instruct-q4.gguf`)
- **무결성**: 다운로드 후 sha256 검증
- **업데이트 정책**: 앱 출시 시점 모델 버전 고정. 향후 업그레이드는 별도 릴리스에서 결정.
- **삭제**: 설정 > AI 기능에서 "AI 모델 제거" 버튼

## 테스트 전략

| 레이어 | 검증 | 비용 |
|---|---|---|
| ExcelParser | 다양한 양식(.xlsx/.xls/한글헤더/병합셀/빈 행) → JSON | 빠름 |
| ColumnMapper | 동의어 사전 매칭, 미매칭 검출, 조직별 캐시 HIT/MISS | 빠름 |
| DataNormalizer | 전화 12종, 날짜 8종, 금액 한글/콤마/통화 변형 | 빠름 |
| ActionDispatcher | 각 도구 단위, 잘못된 인자, 권한 없는 데이터 | 빠름 |
| HardwareDiagnostic | RAM/디스크 모킹별 분기 | 빠름 |
| ModelManager | 다운로드 진행률, 재개, 무결성 검증 | 중간 |
| LLM 통합 (스모크) | 골든 Q&A 50쌍 → 도구 호출 + 답변 정확도 | 비쌈 (실제 모델) |
| 매핑 캐시 학습 | 첫 업로드 → 캐시 → 두 번째 자동 적용 | 빠름 |

골든 데이터셋 (필수):
- **양식 30개**: 실제 사용 조직(학원/공방/교습소 등) 엑셀 변형. 매핑 회귀 테스트.
- **챗봇 Q&A 50쌍**: "민준이 결제 언제?" 같은 자연 질문 + 호출되어야 할 도구 시퀀스.

## 구현 단계

PR 시리즈 (모두 한 번에 출시):

1. AI 인프라 셋업: `node-llama-cpp` 통합, ModelManager, HardwareDiagnostic, IPC 채널
2. ExcelParser + 양식 30개 골든셋
3. 동의어 사전(다양한 도메인 용어 포함) + ColumnMapper + `mapping_profiles` 마이그레이션
4. DataNormalizer + 룰셋 + 정규화 테스트
5. 엑셀 임포트 UI: 업로드 → 매칭 결과 → 미리보기 → 확정 (60대 친화, 도메인 중립 카피)
6. 도구 카탈로그 10개 + ActionDispatcher (Zod 검증)
7. 챗봇 다운로드 UX: 사양 진단 모달 + 진행률
8. 챗봇 UI: 대화창 + 출처 표시 + 취소 버튼
9. 통합 테스트 + 골든 회귀
10. 베타 피드백 → 릴리스

## 미해결 / 추후 결정

- **모델 업그레이드 정책**: Qwen 2.5 → 3.0 출시 시 자동 업데이트 vs 수동
- **도구 카탈로그 v2**: 출시 후 사용 패턴 분석으로 추가 도구 결정 (예: 자동 미납 알림, 학습 진도 등)
- **다국어**: 현재 한국어 전용. 일본어/베트남어 사용 조직 요구 시 별도 검토.
- **챗봇 히스토리**: 대화 영속화 여부 (조직별 / 사용자별 / 세션 한정)
- **표준 양식 템플릿 파일**: 정확한 컬럼 순서/예시 데이터 디자인 필요
