// OpenRouter 호출기 — PRD 5.1, 5.8 / docs/OpenRouter-Notes.md
// 시간 초과, 동시 호출 제한, 429·5xx·네트워크 오류 지수 백오프 재시도. API 키는 OpenRouter 외에는 보내지 않는다.

export const API_BASE = 'https://openrouter.ai/api/v1';

/** 재시도할 HTTP 상태 */
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);

const KIND_BY_STATUS = { 400: 'bad_request', 401: 'auth', 402: 'credits', 403: 'forbidden', 408: 'timeout', 429: 'rate' };
const kindOf = (status) => KIND_BY_STATUS[status] ?? (status >= 500 ? 'server' : 'bad_request');

/** 사용자에게 보여 줄 오류 문구 */
export const ERROR_TEXT = {
  no_key: 'API 키가 없어요. 설정에서 OpenRouter 키를 넣어 주세요.',
  auth: 'API 키가 맞지 않거나 사용 중지됐어요. 설정에서 키를 확인해 주세요.',
  credits: 'OpenRouter 크레딧이 부족해요. OpenRouter에서 충전한 뒤 다시 시도해 주세요.',
  forbidden: '요청이 차단됐어요(권한 또는 모더레이션).',
  rate: '요청이 몰려 잠시 막혔어요. 조금 뒤 다시 시도해 주세요.',
  server: '모델 제공사 쪽 문제로 응답을 받지 못했어요.',
  timeout: '응답이 너무 오래 걸려 중단했어요.',
  network: '인터넷 연결을 확인해 주세요.',
  bad_request: '요청 형식에 문제가 있어요.',
  invalid_json: 'AI 응답을 정해진 형식으로 읽지 못했어요.',
  skipped: '앞 라운드 결과가 없어 건너뛰었어요.',
};

/** 동시 실행 개수 제한 */
function semaphore(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    queue.shift()();
  };
  return async (task) => {
    await new Promise((resolve) => {
      queue.push(resolve);
      next();
    });
    try {
      return await task();
    } finally {
      active--;
      next();
    }
  };
}

/**
 * createClient({ getKey, fetch, referer, title, timeoutMs, maxConcurrent, retries, sleep })
 * 모든 메서드는 throw하지 않고 { ok: true, ... } 또는 { ok: false, error: { kind, status, message } }를 돌려준다.
 */
export function createClient({
  getKey,
  fetch = (...args) => globalThis.fetch(...args),
  referer = globalThis.location?.href?.split('#')[0],
  title = 'Travel Pick',
  timeoutMs = 90_000,
  maxConcurrent = 3,
  retries = 3,
  baseDelayMs = 1000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  const limit = semaphore(maxConcurrent);

  async function request(path, { method = 'GET', body, auth = true } = {}) {
    const key = auth ? getKey?.() : null;
    if (auth && !key) return { ok: false, error: { kind: 'no_key', message: ERROR_TEXT.no_key } };
    const headers = { 'Content-Type': 'application/json', 'X-Title': title };
    if (referer) headers['HTTP-Referer'] = referer;
    if (key) headers.Authorization = `Bearer ${key}`;

    let last;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let retryAfter = null;
      try {
        const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body && JSON.stringify(body), signal: controller.signal });
        const data = await res.json().catch(() => null);
        if (res.ok) return { ok: true, data };
        const kind = kindOf(res.status);
        last = { kind, status: res.status, message: data?.error?.message ?? ERROR_TEXT[kind] };
        if (!RETRY_STATUS.has(res.status)) return { ok: false, error: last };
        retryAfter = Number(res.headers?.get?.('retry-after')) || null;
      } catch (err) {
        const kind = err?.name === 'AbortError' ? 'timeout' : 'network';
        last = { kind, message: ERROR_TEXT[kind] };
      } finally {
        clearTimeout(timer);
      }
      if (attempt < retries) {
        await sleep(retryAfter ? retryAfter * 1000 : baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 250));
      }
    }
    return { ok: false, error: last };
  }

  return {
    /**
     * 채팅 호출. schema: { name, schema } 이면 JSON 스키마 출력 요청, webSearch면 웹 검색 플러그인.
     * 반환: { ok, content, citations: [{ url, title }], usage: { inTokens, outTokens, cost }, id, model }
     */
    chat({ model, messages, webSearch = false, schema, maxTokens, searchResults = 5 }) {
      return limit(async () => {
        const body = { model, messages };
        if (webSearch) body.plugins = [{ id: 'web', max_results: searchResults }];
        if (schema) body.response_format = { type: 'json_schema', json_schema: { name: schema.name, strict: false, schema: schema.schema } };
        if (maxTokens) body.max_tokens = maxTokens;
        const r = await request('/chat/completions', { method: 'POST', body });
        if (!r.ok) return r;
        const msg = r.data?.choices?.[0]?.message ?? {};
        const u = r.data?.usage ?? {};
        return {
          ok: true,
          id: r.data?.id,
          model: r.data?.model,
          content: msg.content ?? '',
          citations: (msg.annotations ?? []).filter((a) => a.type === 'url_citation').map((a) => ({ url: a.url_citation.url, title: a.url_citation.title })),
          usage: { inTokens: u.prompt_tokens ?? 0, outTokens: u.completion_tokens ?? 0, cost: u.cost ?? null },
        };
      });
    },

    /** 연결 테스트: 비용 없이 키 확인 (GET /key) */
    async checkKey() {
      const r = await request('/key');
      if (!r.ok) return r;
      const d = r.data?.data ?? {};
      return { ok: true, label: d.label ?? null, limit: d.limit ?? null, limitRemaining: d.limit_remaining ?? null, usage: d.usage ?? null, isFreeTier: Boolean(d.is_free_tier) };
    },

    /** 모델 목록과 단가 (키 필요 없음) */
    async listModels() {
      const r = await request('/models', { auth: false });
      if (!r.ok) return r;
      return {
        ok: true,
        models: (r.data?.data ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          contextLength: m.context_length ?? null,
          pricing: { prompt: Number(m.pricing?.prompt) || 0, completion: Number(m.pricing?.completion) || 0, webSearch: Number(m.pricing?.web_search) || 0 },
          supportsJson: (m.supported_parameters ?? []).includes('response_format'),
        })),
      };
    },
  };
}
