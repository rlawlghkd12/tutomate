# RISKS — 이벤트 로그 시스템

| ID | Risk | 영향도 | 가능성 | 완화 |
|----|------|--------|--------|------|
| R1 | 로깅 실패가 원 action을 실패시킴 | 🔴 High | 중 | `logEvent`를 try/catch로 감싸 best-effort 처리. 원 action의 성공/실패와 완전 분리 |
| R2 | payload JSON 크기 폭증 (특히 notes가 긴 경우) | 🟡 Medium | 중 | 변경된 필드만 before/after 포함. 긴 text field는 1KB로 truncate |
| R3 | 과거 데이터 소급 로깅 불가 | 🟡 Medium | 확정 | 시스템 도입 시점부터만 기록. `REQUIREMENTS.md`에 명시 |
| R4 | 매 action마다 +1 INSERT 성능 저하 | 🟡 Medium | 중 | Phase 1 배포 후 실측. 1회 INSERT 평균 30~80ms. 문제 시 batch queue 도입 (Phase 4 검토) |
| R5 | RLS 조회 성능 | 🟢 Low | 저 | `(organization_id, created_at desc)` 복합 인덱스. 월 5,000건 기준 100ms 이내 |
| R6 | actor_user_id가 누락된 system action 구분 불가 | 🟢 Low | 저 | `actor_label='system'` fallback. 추후 actor_type enum 도입 검토 |
| R7 | 민감정보(학생 이름/전화 등)가 payload에 들어가 유출 위험 | 🔴 High | 중 | RLS로 조직 격리. payload에 전화번호 등 민감 필드 포함 금지 원칙 (code review) |
| R8 | 이벤트 타입 명명 일관성 깨짐 (e.g. payment.add vs payment.create) | 🟢 Low | 중 | PLAN의 이벤트 카탈로그를 source of truth로 사용. TS 유니온 타입으로 강제 |
| R9 | 대량 bulk 작업 시 log 폭주 (e.g. 100명 일괄 완납 → payment.add 100건) | 🟡 Medium | 저 | bulk 이벤트 1건 + 개별 payment.add N건 모두 기록. N 큰 경우 summary event만 기록하는 옵션 검토 |
| R10 | event_logs.organization_id FK가 organization 삭제 시 CASCADE → 감사 로그 증발 | 🟡 Medium | 저 | CASCADE 유지 (조직 탈퇴시 데이터 정리). 백업 정책은 별도 |

## Rollback Plan

1차 배포 후 문제 발생 시:
- event_logs 테이블 유지 (읽기 전용으로만 사용)
- stores의 `logEvent` 호출을 환경변수 `VITE_ENABLE_AUDIT_LOG=false`로 간단히 비활성화
- 기존 로직은 건드리지 않았으므로 store 로직 회귀 없음

완전 롤백:
```sql
drop table if exists event_logs;
```
코드 쪽: git revert (Phase별 커밋 분리 권장).
