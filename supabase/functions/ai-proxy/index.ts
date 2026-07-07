// ai-proxy — OpenRouter 스트리밍 relay (중앙 프록시)
//
// 역할:
// - Supabase JWT 검증(로그인 사용자만)
// - OPENROUTER_API_KEY를 서버에서 주입 (앱엔 키 없음)
// - 모델 allowlist + 기본 모델 강제
// - 비학습·무로깅(ZDR) 프로바이더 라우팅
// - OpenRouter /chat/completions 응답을 그대로 스트리밍 relay
//
// 사용량: 응답 스트림을 tee로 복제해 usage(토큰)를 파싱, ai_usage_logs에 org와 함께 기록.
// 월 한도: 활성 조직이 있으면 조직 누적(ai_usage_month_total_org), 없으면 사용자 누적으로 확인, 초과 시 402.
// TODO(Phase 1+): 플랜별 차등 한도(현재는 단일 env 캡), org당 rate limit(초당/분당).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { selectModel, pickActiveOrgId, usageFromDataLine, isRateLimited, summarizeUsage } from './logic.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// 관리자 설정(ai_admin_config.config JSON) — 모델·한도를 재배포 없이 제어.
// 워ム 아이솔레이트 내에서 짧게 캐시해 요청마다 DB를 읽지 않는다(콜드스타트마다 1회만).
let _cfgCache: { at: number; val: Record<string, unknown> } | null = null;
const CONFIG_TTL_MS = 30_000;
async function loadAdminConfig(
  adminClient: ReturnType<typeof createClient>,
): Promise<Record<string, unknown>> {
  if (_cfgCache && Date.now() - _cfgCache.at < CONFIG_TTL_MS) return _cfgCache.val;
  const { data } = await adminClient
    .from('ai_admin_config')
    .select('config')
    .eq('id', 'global')
    .maybeSingle();
  const val = ((data?.config as Record<string, unknown>) ?? {});
  _cfgCache = { at: Date.now(), val };
  return val;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
    const defaultModel = Deno.env.get('OPENROUTER_MODEL') || 'qwen/qwen3-30b-a3b';

    if (!openrouterKey) {
      return json({ error: 'openrouter_not_configured' }, 500);
    }

    // 1) 인증 — Supabase JWT 검증
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authError } = await adminClient.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authError || !user) return json({ error: 'unauthorized' }, 401);

    // 1-b) 사용자의 활성 조직 확인 — 사용량 로그·한도를 조직 단위로 집계하기 위함.
    //      활성(is_active) → owner → 첫 번째 순으로 authStore와 동일 규칙. 없으면 개인 단위로 폴백.
    const orgId = await resolveActiveOrg(adminClient, user.id);

    // 요청 본문 — 채팅/usage 조회 공용. 이후 단계에서 재사용하므로 여기서 1회만 파싱.
    const body = await req.json().catch(() => ({}));

    // 관리자 설정(DB) 로드 — 모델·한도를 재배포 없이 제어. 값 없으면 env/기본값 폴백.
    const cfg = await loadAdminConfig(adminClient);
    const monthlyCap = Number(cfg.monthlyTokenCap ?? Deno.env.get('AI_MONTHLY_TOKEN_CAP') ?? '5000000');
    const dailyMaxCalls = Number(cfg.dailyMaxCalls ?? 0);
    const effectiveDefaultModel =
      (typeof cfg.model === 'string' && cfg.model) || defaultModel;

    // 1-b') action:'usage' — 채팅 없이 이번 달 사용량 요약만 반환.
    //       한도(402)로 막지 않는다: 초과한 상태도 사용자가 확인할 수 있어야 하므로.
    //       OpenRouter를 호출하지 않아 토큰을 소비하지 않는다.
    if (body?.action === 'usage') {
      const { data: used } = orgId
        ? await adminClient.rpc('ai_usage_month_total_org', { p_org: orgId })
        : await adminClient.rpc('ai_usage_month_total', { p_user: user.id });
      const summary = summarizeUsage(typeof used === 'number' ? used : 0, monthlyCap, orgId ? 'org' : 'user');
      return json(summary, 200);
    }

    // 1-c) 월 사용량 한도 — 이번 달 누적 토큰이 캡 이상이면 차단(402).
    //      조직이 있으면 조직 합계로, 없으면 사용자 합계로 판정.
    if (monthlyCap > 0) {
      const { data: used } = orgId
        ? await adminClient.rpc('ai_usage_month_total_org', { p_org: orgId })
        : await adminClient.rpc('ai_usage_month_total', { p_user: user.id });
      if (typeof used === 'number' && used >= monthlyCap) {
        return json({ error: 'quota_exceeded', used, cap: monthlyCap, scope: orgId ? 'org' : 'user' }, 402);
      }
    }

    // 1-d) 분당 요청 rate limit — 남용 방지(429). 기본 비활성(0), env로 켠다.
    //      조직이 있으면 조직 단위, 없으면 사용자 단위로 최근 60초 완료 요청 수를 센다.
    const ratePerMin = Number(cfg.ratePerMin ?? Deno.env.get('AI_RATE_LIMIT_PER_MIN') ?? '0');
    if (ratePerMin > 0) {
      const { data: recent } = await adminClient.rpc('ai_usage_recent_count', {
        p_user: user.id,
        p_org: orgId,
        p_seconds: 60,
      });
      if (typeof recent === 'number' && isRateLimited(recent, ratePerMin)) {
        return json({ error: 'rate_limited', retryAfterSec: 60, scope: orgId ? 'org' : 'user' }, 429);
      }
    }

    // 1-e) 일일 호출 한도 (조직당, 없으면 사용자당 · Asia/Seoul 자정 기준) — 비용 폭주 방지.
    //      0/미설정이면 비활성. 오늘 호출 수가 한도 이상이면 429(daily_limit).
    if (dailyMaxCalls > 0) {
      const { data: today } = await adminClient.rpc('ai_usage_today_count_org', {
        p_org: orgId,
        p_user: user.id,
      });
      if (typeof today === 'number' && today >= dailyMaxCalls) {
        return json(
          { error: 'daily_limit', used: today, cap: dailyMaxCalls, scope: orgId ? 'org' : 'user' },
          429,
        );
      }
    }

    // 2) 모델 결정 (allowlist 강제) — 관리자 설정 모델을 기본값으로, 앱 A/B override(body.model) 우선.
    const model = selectModel(body.model, effectiveDefaultModel);

    // 3) OpenRouter 호출 — 비학습·무로깅 프로바이더만 라우팅
    //    data_collection:'deny' → 프롬프트를 저장/학습하는 프로바이더 배제.
    //    ZDR 강제는 OpenRouter 계정 privacy 설정(Zero Data Retention)과 함께 적용.
    const orResp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openrouterKey}`,
        'X-Title': 'TutorMate',
      },
      body: JSON.stringify({
        model,
        messages: body.messages,
        tools: body.tools,
        tool_choice: body.tool_choice ?? 'auto',
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: body.max_tokens ?? 2048,
        temperature: body.temperature ?? 0.3,
        provider: { data_collection: 'deny' },
      }),
    });

    if (!orResp.ok || !orResp.body) {
      const errText = await orResp.text().catch(() => '');
      return json({ error: 'openrouter_error', status: orResp.status, detail: errText.slice(0, 500) }, 502);
    }

    // 4) 스트리밍 relay + 사용량 기록 (tee로 복제: 한쪽은 클라이언트, 한쪽은 usage 파싱)
    const [toClient, toLog] = orResp.body.tee();
    const logTask = logUsage(adminClient, toLog, {
      userId: user.id,
      organizationId: orgId,
      model,
    }).catch((e) => console.error('[ai-proxy] usage 기록 실패:', e));
    // 응답 반환 후에도 백그라운드 작업이 끝나도록 (Supabase Edge Runtime)
    try {
      (globalThis as any).EdgeRuntime?.waitUntil?.(logTask);
    } catch { /* waitUntil 미지원 환경 무시 */ }

    return new Response(toClient, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (e) {
    return json({ error: 'internal', detail: String(e).slice(0, 500) }, 500);
  }
});

/** 사용자의 활성 조직 id를 반환 (없으면 null). 우선순위 규칙은 pickActiveOrgId(logic.ts). */
async function resolveActiveOrg(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await adminClient
    .from('user_organizations')
    .select('organization_id, role, is_active')
    .eq('user_id', userId);
  if (error) return null;
  return pickActiveOrgId(data as any);
}

/** SSE 스트림에서 usage(토큰)를 파싱해 ai_usage_logs에 1행 기록. */
async function logUsage(
  adminClient: ReturnType<typeof createClient>,
  stream: ReadableStream<Uint8Array>,
  meta: { userId: string; organizationId: string | null; model: string },
): Promise<void> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const u = usageFromDataLine(line);
      if (u) usage = u;
    }
  }
  if (!usage) return;
  await adminClient.from('ai_usage_logs').insert({
    user_id: meta.userId,
    organization_id: meta.organizationId,
    model: meta.model,
    prompt_tokens: usage.prompt_tokens ?? 0,
    completion_tokens: usage.completion_tokens ?? 0,
    total_tokens: usage.total_tokens ?? 0,
    cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    cost: usage.cost ?? 0,
  });
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
