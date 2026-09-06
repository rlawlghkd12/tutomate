import { describe, it, expect } from 'vitest';
import { filterBankDuplicates, type BankDedupCandidate } from '../bankDedup';

const auto = (enrollment_id: string, paid_at: string, amount: number): BankDedupCandidate => ({
  enrollment_id,
  paid_at,
  amount,
  userConfirmed: false,
});

describe('filterBankDuplicates', () => {
  it('완납 후 다른 달의 중복 이체(같은 금액)는 자동 저장에서 제외 (핵심 버그)', () => {
    // e1: 수강료 30만, 이미 7/5에 30만 완납. 9/10에 또 30만 입금(중복 이체) → 제외.
    const existing = [{ enrollmentId: 'e1', paidAt: '2026-07-05', amount: 300000 }];
    const fees = new Map([['e1', 300000]]);
    const out = filterBankDuplicates([auto('e1', '2026-09-10', 300000)], existing, fees);
    expect(out).toHaveLength(0);
  });

  it('정상 분납(합계 ≤ 수강료)은 통과', () => {
    // e1: 수강료 30만, 7/5에 15만 납부. 8/5에 15만 추가 분납 → 통과.
    const existing = [{ enrollmentId: 'e1', paidAt: '2026-07-05', amount: 150000 }];
    const fees = new Map([['e1', 300000]]);
    const out = filterBankDuplicates([auto('e1', '2026-08-05', 150000)], existing, fees);
    expect(out).toHaveLength(1);
  });

  it('같은 파일 안 중복(완납 초과)도 앞 건 저장분을 누적해 제외', () => {
    // 기존 결제 없음. 같은 파일에 30만 두 건이 다른 날로 들어옴(재이체) → 첫 건만 저장.
    const fees = new Map([['e1', 300000]]);
    const out = filterBankDuplicates(
      [auto('e1', '2026-07-05', 300000), auto('e1', '2026-08-05', 300000)],
      [],
      fees,
    );
    expect(out).toHaveLength(1);
    expect(out[0].paid_at).toBe('2026-07-05');
  });

  it('정확중복(같은 날·금액) 재업로드는 제외', () => {
    const existing = [{ enrollmentId: 'e1', paidAt: '2026-07-05', amount: 300000 }];
    const fees = new Map([['e1', 300000]]);
    const out = filterBankDuplicates([auto('e1', '2026-07-05', 300000)], existing, fees);
    expect(out).toHaveLength(0);
  });

  it('사용자가 직접 확인한 건은 완납이어도 항상 저장(의식적 선택)', () => {
    const existing = [{ enrollmentId: 'e1', paidAt: '2026-07-05', amount: 300000 }];
    const fees = new Map([['e1', 300000]]);
    const confirmed: BankDedupCandidate = { enrollment_id: 'e1', paid_at: '2026-09-10', amount: 300000, userConfirmed: true };
    const out = filterBankDuplicates([confirmed], existing, fees);
    expect(out).toHaveLength(1);
  });

  it("'전체 추천대로'(viaRecommend) 건은 확인 아님 → 중복 검사 적용", () => {
    const existing = [{ enrollmentId: 'e1', paidAt: '2026-07-05', amount: 300000 }];
    const fees = new Map([['e1', 300000]]);
    const rec: BankDedupCandidate = { enrollment_id: 'e1', paid_at: '2026-09-10', amount: 300000, userConfirmed: true, viaRecommend: true };
    const out = filterBankDuplicates([rec], existing, fees);
    expect(out).toHaveLength(0);
  });

  it('수강료를 모르면(완납검사 생략) 정상 납부를 막지 않는다', () => {
    // fee 미지정 → periodComplete/overpay 검사 생략, exact/month만 적용.
    const existing = [{ enrollmentId: 'e1', paidAt: '2026-07-05', amount: 300000 }];
    const out = filterBankDuplicates([auto('e1', '2026-09-10', 300000)], existing, new Map());
    expect(out).toHaveLength(1); // 완납 정보를 몰라 통과(안전망은 exact/month뿐)
  });

  it("완납 등록의 환불(음수)은 '전체 추천대로'여도 완납판정으로 막지 않는다", () => {
    // e1: 30만 완납 상태. 환불 -5만이 viaRecommend로 들어옴 → 완납이라고 버리면 안 됨(잔액 감소 거래).
    const existing = [{ enrollmentId: 'e1', paidAt: '2026-07-05', amount: 300000 }];
    const fees = new Map([['e1', 300000]]);
    const refund: BankDedupCandidate = {
      enrollment_id: 'e1',
      paid_at: '2026-09-15',
      amount: -50000,
      userConfirmed: true,
      viaRecommend: true,
    };
    const out = filterBankDuplicates([refund], existing, fees);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(-50000);
  });

  it('DB의 같은 달·같은 금액(수동입력)과 겹치면 제외', () => {
    // 7월에 수동입력 15만이 이미 있음. 자동매칭도 7월 15만(다른 날) → 같은 달 재업로드로 제외.
    const existing = [{ enrollmentId: 'e1', paidAt: '2026-07-03', amount: 150000 }];
    const fees = new Map([['e1', 300000]]);
    const out = filterBankDuplicates([auto('e1', '2026-07-20', 150000)], existing, fees);
    expect(out).toHaveLength(0);
  });
});
