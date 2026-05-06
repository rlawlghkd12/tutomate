# LLM Lab

TutorMate 챗봇용 로컬 LLM 모델 비교 도구.

## 사용법

```bash
# 첫 실행
pnpm install
pnpm --filter @tutomate/llm-lab dev

# 브라우저
http://localhost:5180
```

## 흐름

1. 좌측 모델 카드에서 [다운로드] 클릭 → 진행률 확인
2. 다운로드 완료된 모델의 [활성] 체크박스 켜기 (1~4개)
3. 우측 프롬프트 입력 (또는 프리셋 클릭)
4. 엑셀 첨부 시 [파일 선택] (선택)
5. [활성 모델로 실행] → 가로 패널에 동시 실행 결과 비교

각 패널 표시:
- 토큰 스트림
- 도구 호출 시퀀스 (이름/인자/결과/소요 ms)
- 메트릭 (총 시간, 첫 토큰, tok/s)

## 비교 모델 (`catalog.ts`)

- Qwen 2.5 3B (현 v0.7.0 후보)
- Qwen 3.5 4B (TAU2 27, 추천 후보)
- Gemma 4 E4B (네이티브 함수 호출)
- EXAONE 3.5 2.4B (한국어 특화)

## 데이터

- 모델: `tools/llm-lab/.data/models/`
- 첨부 파일: `tools/llm-lab/.data/stash/` (1시간 TTL)
- 도구: `mockTools.ts` 메모리 데이터 (학생 3명, 결제 3건)

## 도구 카탈로그

조회: `searchStudent`, `getPaymentHistory`, `getUnpaidStudents`, `getMonthlySummary`
임포트: `parseExcelHeaders`, `mapColumns`, `previewImport` — 본 앱과 동일 코드 (`@tutomate/core`에서 직접 import)

`confirmImport`는 Supabase 호출이 들어가서 lab에서는 제외.
