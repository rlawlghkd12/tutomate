import { describe, it, expect } from 'vitest';
import { createPiiVault, tokenizeOutgoingMessages } from '../piiVault';

describe('piiVault', () => {
  it('학생 객체의 이름·전화는 토큰화한다', () => {
    const v = createPiiVault();
    const out = v.tokenizeObject({ students: [{ id: 'u1', name: '김철수', phone: '010-1234-5678' }] }) as any;
    expect(out.students[0].name).toMatch(/⟦S\d+⟧/);
    expect(out.students[0].phone).toMatch(/⟦T\d+⟧/);
    expect(out.students[0].id).toBe('u1'); // id는 그대로
  });

  it('강좌 객체의 name(강좌명)은 토큰화하지 않는다', () => {
    const v = createPiiVault();
    const out = v.tokenizeObject({
      classes: [{ id: 'c1', name: '수학 A반', instructor: '박선생', classroom: '201호' }],
    }) as any;
    expect(out.classes[0].name).toBe('수학 A반');
  });

  it('같은 실명은 같은 토큰으로 일관 매핑된다', () => {
    const v = createPiiVault();
    const a = v.tokenizeObject({ name: '김철수', phone: '010-1111-2222' }) as any;
    const b = v.tokenizeObject({ student_name: '김철수', phone: '010-9999-8888' }) as any;
    expect(a.name).toBe(b.student_name);
  });

  it('detokenizeObject로 토큰 인자를 실명으로 복원한다', () => {
    const v = createPiiVault();
    const tok = v.tokenizeObject({ name: '이영희', phone: '010-1234-5678' }) as any;
    const restored = v.detokenizeObject({ studentName: tok.name, tel: tok.phone }) as any;
    expect(restored.studentName).toBe('이영희');
    expect(restored.tel).toBe('010-1234-5678');
  });

  it('tokenizeText는 볼트에 알려진 실명과 연락처를 치환한다', () => {
    const v = createPiiVault();
    v.tokenizeObject({ name: '김철수', phone: '010-1234-5678' }); // 볼트에 등록
    const out = v.tokenizeText('김철수 학생 미납이야? 010-1234-5678 로 연락해줘');
    expect(out).not.toContain('김철수');
    expect(out).not.toContain('010-1234-5678');
    expect(v.detokenizeText(out)).toContain('김철수');
  });

  it('볼트에 없는 이름은 토큰화하지 못한다(설계상 한계)', () => {
    const v = createPiiVault();
    const out = v.tokenizeText('처음보는 이름 홍길동');
    expect(out).toContain('홍길동');
  });

  it('스트리밍 복원: 토큰이 조각으로 나뉘어도 복원한다', () => {
    const v = createPiiVault();
    const tok = v.tokenizeObject({ name: '김철수', phone: '010-1234-5678' }) as any;
    const token: string = tok.name; // 예: ⟦S1⟧
    const d = v.createStreamDetokenizer();
    let out = '';
    // 토큰을 중간에서 쪼갬
    out += d.push('안녕 ');
    out += d.push(token.slice(0, 2));
    out += d.push(token.slice(2));
    out += d.push('님');
    out += d.flush();
    expect(out).toBe('안녕 김철수님');
  });

  it('이메일은 자유 텍스트에서 토큰화하고 복원한다', () => {
    const v = createPiiVault();
    const out = v.tokenizeText('연락은 hong@example.com 으로 주세요');
    expect(out).not.toContain('hong@example.com');
    expect(out).toMatch(/⟦E\d+⟧/);
    expect(v.detokenizeText(out)).toContain('hong@example.com');
  });

  it('같은 이메일은 같은 토큰으로 일관 매핑된다', () => {
    const v = createPiiVault();
    const a = v.tokenizeText('a@x.com');
    const b = v.tokenizeText('메일 a@x.com 재확인');
    const tokenA = a.match(/⟦E\d+⟧/)?.[0];
    expect(tokenA).toBeDefined();
    expect(b).toContain(tokenA!);
  });

  it('학생 객체의 email·address를 토큰화한다', () => {
    const v = createPiiVault();
    const out = v.tokenizeObject({
      students: [{ id: 'u1', name: '김철수', phone: '010-1234-5678', email: 'kim@ex.com', address: '서울시 강남구' }],
    }) as any;
    const s = out.students[0];
    expect(s.email).toMatch(/⟦E\d+⟧/);
    expect(s.address).toMatch(/⟦A\d+⟧/);
    // 복원 라운드트립
    const back = v.detokenizeObject(s) as any;
    expect(back.email).toBe('kim@ex.com');
    expect(back.address).toBe('서울시 강남구');
  });

  it('reset은 매핑을 초기화한다', () => {
    const v = createPiiVault();
    v.tokenizeObject({ name: '김철수', phone: '010-1234-5678' });
    v.reset();
    const out = v.tokenizeText('김철수');
    expect(out).toContain('김철수'); // 초기화되어 더 이상 치환 안 됨
  });
});

describe('tokenizeOutgoingMessages (H4)', () => {
  // 볼트에 실명을 미리 등록해 tokenizeText가 치환할 수 있게 하는 헬퍼
  function vaultWith(name: string) {
    const v = createPiiVault();
    v.tokenizeObject({ name, phone: '010-0000-0000' }); // name→⟦S1⟧ 등록
    return v;
  }

  it('enabled=false면 원본 배열을 그대로(동일 참조) 반환한다', () => {
    const v = createPiiVault();
    const msgs = [{ role: 'user', content: '김철수 미납?' }];
    const out = tokenizeOutgoingMessages(msgs, v, false);
    expect(out).toBe(msgs); // 로컬 백엔드: 토큰화 안 함
  });

  it('enabled=true면 user/assistant content의 실명·전화를 토큰으로 치환한다', () => {
    const v = vaultWith('김철수');
    const out = tokenizeOutgoingMessages(
      [{ role: 'user', content: '김철수 010-1234-5678 확인' }],
      v,
      true,
    );
    expect(out[0].content).not.toContain('김철수');
    expect(out[0].content).not.toContain('010-1234-5678');
    expect(out[0].content).toMatch(/⟦S\d+⟧/);
    expect(out[0].content).toMatch(/⟦T\d+⟧/);
  });

  it('system 메시지는 토큰화하지 않는다(프롬프트 훼손 방지)', () => {
    const v = vaultWith('김철수');
    const out = tokenizeOutgoingMessages(
      [
        { role: 'system', content: '너는 김철수를 도와라' },
        { role: 'user', content: '김철수 확인' },
      ],
      v,
      true,
    );
    expect(out[0].content).toBe('너는 김철수를 도와라'); // system 원본 유지
    expect(out[1].content).not.toContain('김철수'); // user는 치환
  });

  it('원본 메시지 객체를 변형하지 않는다(불변)', () => {
    const v = vaultWith('김철수');
    const msgs = [{ role: 'user', content: '김철수' }];
    const out = tokenizeOutgoingMessages(msgs, v, true);
    expect(msgs[0].content).toBe('김철수'); // 원본 그대로
    expect(out[0]).not.toBe(msgs[0]); // 새 객체
  });

  it('문자열이 아닌 content(null 등)는 건드리지 않는다', () => {
    const v = vaultWith('김철수');
    const out = tokenizeOutgoingMessages(
      [{ role: 'assistant', content: null as unknown as string }],
      v,
      true,
    );
    expect(out[0].content).toBeNull();
  });
});
