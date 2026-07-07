/**
 * PII 토큰화 볼트 — "유저는 실명, LLM은 토큰".
 *
 * 클라우드(OpenRouter) 전송 전에 학생 실명·전화·이메일·주소를 불투명 토큰으로 치환하고,
 * 화면 표시·툴 실행 시 다시 실명으로 복원한다. 매핑(볼트)은 프로세스 메모리에만 존재하며
 * 프록시·모델·프로바이더 어디에도 실명이 전달되지 않는다.
 *
 * 토큰 형식: ⟦S3⟧(학생명) ⟦T3⟧(전화) ⟦E3⟧(이메일) ⟦A3⟧(주소).
 * ⟦⟧(U+27E6/27E7)는 실제 데이터에 나타날 일이 없어 스트리밍 경계 판정·복원이 안전하다.
 * 모델이 토큰을 그대로 못 뱉어 복원 실패하면 사용자에게 토큰이 보일 뿐(실명 유출 아님) → 안전 열화.
 *
 * 한계(설계상): 유저가 처음 타이핑한 이름은 볼트에 없어 토큰화 못 함(동명이인·오타 포함).
 * 방어 심층화(볼트 + OpenRouter ZDR·무로깅 + 동의)로 보완. 상세는 MIGRATION 문서 §6-4.
 */

type PiiKind = 'S' | 'T' | 'E' | 'A';

const PHONE_RE = /01[0-9]-?\d{3,4}-?\d{4}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TOKEN_RE = /⟦[STEA]\d+⟧/g;

/** 학생(개인) 객체임을 시사하는 형제 키 — 이때 name/student_name 값을 사람 이름으로 본다. */
const STUDENT_MARKER_KEYS = ['phone', 'is_member', 'birth_date', 'student_name', 'guardian_phone'];
/** 강좌 객체 표식 — 이때 name은 강좌명(비PII)이라 토큰화하지 않는다. */
const COURSE_MARKER_KEYS = ['classroom', 'instructor', 'instructor_name', 'fee', 'max_students', 'schedule'];
/** 사람 이름을 담는 키. */
const NAME_KEYS = ['name', 'student_name', 'guardian_name'];

export interface PiiVault {
  /** 자유 텍스트에서 전화·이메일 + 볼트에 알려진 실명을 토큰으로 치환. (유저 입력·히스토리용) */
  tokenizeText(text: string): string;
  /** 툴 결과 JSON을 재귀적으로 토큰화 (학생 이름·전화·이메일·주소). (모델 컨텍스트용) */
  tokenizeObject<T>(value: T): T;
  /** 토큰을 실명으로 복원. (화면 표시용) */
  detokenizeText(text: string): string;
  /** 객체 내 문자열의 토큰을 실명으로 복원. (모델이 넘긴 툴 인자용) */
  detokenizeObject<T>(value: T): T;
  /** 스트리밍 토큰 복원기 — 조각 경계에서 미완성 토큰을 보류했다가 복원. */
  createStreamDetokenizer(): { push(chunk: string): string; flush(): string };
  /** 대화 세션 종료/전환 시 매핑 초기화. */
  reset(): void;
}

export function createPiiVault(): PiiVault {
  let realToToken = new Map<string, string>();
  let tokenToReal = new Map<string, string>();
  const counters: Record<PiiKind, number> = { S: 0, T: 0, E: 0, A: 0 };

  function mint(kind: PiiKind, real: string): string {
    const trimmed = real.trim();
    if (!trimmed) return real;
    const existing = realToToken.get(trimmed);
    if (existing) return existing;
    counters[kind] += 1;
    const token = `⟦${kind}${counters[kind]}⟧`;
    realToToken.set(trimmed, token);
    tokenToReal.set(token, trimmed);
    return token;
  }

  function tokenizeContacts(s: string): string {
    return s
      .replace(PHONE_RE, (m) => mint('T', m))
      .replace(EMAIL_RE, (m) => mint('E', m));
  }

  function tokenizeText(text: string): string {
    if (!text) return text;
    let out = tokenizeContacts(text);
    // 볼트에 알려진 실명(사람)만 치환 — 긴 것부터 (부분 겹침 방지)
    const names = [...realToToken.keys()]
      .filter((real) => (realToToken.get(real) ?? '').startsWith('⟦S'))
      .sort((a, b) => b.length - a.length);
    for (const real of names) {
      if (!real) continue;
      out = out.split(real).join(realToToken.get(real)!);
    }
    return out;
  }

  function tokenizeObject<T>(value: T): T {
    return walkTokenize(value, false) as T;
  }

  function walkTokenize(value: unknown, parentIsStudent: boolean): unknown {
    if (typeof value === 'string') return tokenizeContacts(value);
    if (Array.isArray(value)) return value.map((v) => walkTokenize(v, parentIsStudent));
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      const isStudent =
        keys.some((k) => STUDENT_MARKER_KEYS.includes(k)) &&
        !keys.some((k) => COURSE_MARKER_KEYS.includes(k));
      const out: Record<string, unknown> = {};
      for (const k of keys) {
        const v = obj[k];
        if (typeof v === 'string' && NAME_KEYS.includes(k) && isStudent) {
          out[k] = mint('S', v);
        } else if (typeof v === 'string' && k === 'address') {
          out[k] = mint('A', v);
        } else {
          out[k] = walkTokenize(v, isStudent);
        }
      }
      return out;
    }
    return value;
  }

  function detokenizeText(text: string): string {
    if (!text) return text;
    return text.replace(TOKEN_RE, (t) => tokenToReal.get(t) ?? t);
  }

  function detokenizeObject<T>(value: T): T {
    return walkDetokenize(value) as T;
  }

  function walkDetokenize(value: unknown): unknown {
    if (typeof value === 'string') return detokenizeText(value);
    if (Array.isArray(value)) return value.map(walkDetokenize);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = walkDetokenize(v);
      }
      return out;
    }
    return value;
  }

  function createStreamDetokenizer() {
    let buf = '';
    return {
      push(chunk: string): string {
        buf += chunk;
        // 끝에 닫히지 않은 ⟦가 있으면 그 지점부터 보류 (다음 청크에서 완성될 수 있음)
        const lastOpen = buf.lastIndexOf('⟦');
        let safeEnd = buf.length;
        if (lastOpen !== -1 && buf.indexOf('⟧', lastOpen) === -1) safeEnd = lastOpen;
        const emit = buf.slice(0, safeEnd);
        buf = buf.slice(safeEnd);
        return detokenizeText(emit);
      },
      flush(): string {
        const out = detokenizeText(buf);
        buf = '';
        return out;
      },
    };
  }

  function reset(): void {
    realToToken = new Map();
    tokenToReal = new Map();
    counters.S = counters.T = counters.E = counters.A = 0;
  }

  return {
    tokenizeText,
    tokenizeObject,
    detokenizeText,
    detokenizeObject,
    createStreamDetokenizer,
    reset,
  };
}

/**
 * H4 — 클라우드로 나가는 대화 메시지의 실명·연락처를 토큰으로 치환.
 *
 * - `enabled=false`(로컬 백엔드)면 원본을 그대로 반환(토큰화 없음: 데이터가 기기를 안 벗어남).
 * - `system` 메시지는 앱이 만든 프롬프트라 PII가 없어 제외(토큰화 시 지시문이 훼손될 수 있음).
 * - 문자열 `content`만 치환. 원본 배열·객체는 변형하지 않고 새 배열을 반환(불변).
 *
 * 이 경로가 무너지면 실명이 클라우드로 유출되므로(마이그레이션의 핵심 프라이버시 보장),
 * aiHandler 인라인 대신 순수 함수로 분리해 단위 테스트로 고정한다.
 */
export function tokenizeOutgoingMessages<M extends { role: string; content?: unknown }>(
  messages: M[],
  vault: Pick<PiiVault, 'tokenizeText'>,
  enabled: boolean,
): M[] {
  if (!enabled) return messages;
  return messages.map((m) =>
    m.role !== 'system' && typeof m.content === 'string'
      ? { ...m, content: vault.tokenizeText(m.content) }
      : m,
  );
}
