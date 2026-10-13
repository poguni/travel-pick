// AI 호출 계층 (가짜 fetch) — PRD 5.1, 5.5, 5.8, F10-4, F12-3
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../js/ai/openrouter.js';
import { extractJson, validate, chatJson } from '../js/ai/json.js';
import { planRun, executeRun } from '../js/ai/runner.js';

const json = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});
const completion = (content, usage = { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 }, extra = {}) =>
  json(200, { id: 'gen-1', model: 'x', choices: [{ message: { content, annotations: extra.annotations } }], usage });

/** 응답 목록을 차례로 돌려주는 가짜 fetch. 받은 요청을 calls에 남긴다 */
function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    if (typeof r === 'function') return r(init);
    return r;
  };
  fn.calls = calls;
  return fn;
}
const noSleep = async () => {};
const client = (responses, opts = {}) => {
  const fetch = fakeFetch(responses);
  return { fetch, c: createClient({ getKey: () => 'sk-test', fetch, sleep: noSleep, referer: 'https://me.github.io/travelpick/', ...opts }) };
};

describe('OpenRouter 호출기 (5.1, 5.8)', () => {
  test('요청 형식: 엔드포인트, 헤더, 웹 검색 플러그인, JSON 스키마', async () => {
    const { fetch, c } = client([completion('{"a":1}')]);
    const r = await c.chat({ model: 'anthropic/claude-sonnet-5.5', messages: [{ role: 'user', content: 'hi' }], webSearch: true, schema: { name: 'x', schema: { type: 'object' } } });
    assert.equal(r.ok, true);
    const req = fetch.calls[0];
    assert.equal(req.url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(req.init.headers.Authorization, 'Bearer sk-test');
    assert.equal(req.init.headers['X-Title'], 'Travel Pick');
    assert.equal(req.init.headers['HTTP-Referer'], 'https://me.github.io/travelpick/');
    assert.deepEqual(req.body.plugins, [{ id: 'web', max_results: 5 }]);
    assert.equal(req.body.response_format.type, 'json_schema');
    assert.equal(req.body.model, 'anthropic/claude-sonnet-5.5');
  });
  test('응답: 본문, 출처(annotations), 사용량·실제 비용', async () => {
    const ann = [{ type: 'url_citation', url_citation: { url: 'https://a.kr', title: 'A' } }];
    const { c } = client([completion('안녕', { prompt_tokens: 120, completion_tokens: 30, cost: 0.0042 }, { annotations: ann })]);
    const r = await c.chat({ model: 'm', messages: [] });
    assert.equal(r.content, '안녕');
    assert.deepEqual(r.citations, [{ url: 'https://a.kr', title: 'A' }]);
    assert.deepEqual(r.usage, { inTokens: 120, outTokens: 30, cost: 0.0042 });
  });
  test('429는 지수 백오프로 재시도 후 성공 (Retry-After 존중)', async () => {
    const waits = [];
    const { fetch, c } = client([json(429, { error: { code: 429, message: 'slow' } }, { 'retry-after': '2' }), json(503, { error: { code: 503, message: 'down' } }), completion('ok')], { sleep: async (ms) => waits.push(ms) });
    const r = await c.chat({ model: 'm', messages: [] });
    assert.equal(r.ok, true);
    assert.equal(fetch.calls.length, 3);
    assert.equal(waits[0], 2000, 'Retry-After 2초');
    assert.ok(waits[1] >= 2000, '두 번째는 지수 증가');
  });
  test('재시도를 다 써도 안 되면 rate 오류', async () => {
    const busy = () => json(429, { error: { code: 429, message: 'slow' } });
    const { fetch, c } = client([busy(), busy(), busy(), busy()]);
    const r = await c.chat({ model: 'm', messages: [] });
    assert.deepEqual([r.ok, r.error.kind], [false, 'rate']);
    assert.equal(fetch.calls.length, 4, '처음 1회 + 재시도 3회');
  });
  test('401·402는 재시도하지 않고 종류를 알려 준다', async () => {
    const a = client([json(401, { error: { code: 401, message: 'bad key' } })]);
    assert.equal((await a.c.chat({ model: 'm', messages: [] })).error.kind, 'auth');
    assert.equal(a.fetch.calls.length, 1);
    const b = client([json(402, { error: { code: 402, message: 'no credit' } })]);
    assert.equal((await b.c.chat({ model: 'm', messages: [] })).error.kind, 'credits');
  });
  test('네트워크 오류도 재시도, 끝내 실패하면 network', async () => {
    const e = () => new TypeError('Failed to fetch');
    const { c } = client([e(), e(), e(), e()]);
    assert.equal((await c.chat({ model: 'm', messages: [] })).error.kind, 'network');
  });
  test('시간 초과', async () => {
    const hang = (init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    const { c } = client([hang, hang, hang, hang], { timeoutMs: 10 });
    const r = await c.chat({ model: 'm', messages: [] });
    assert.equal(r.error.kind, 'timeout');
  });
  test('키가 없으면 호출하지 않는다', async () => {
    const fetch = fakeFetch([]);
    const c = createClient({ getKey: () => null, fetch, sleep: noSleep });
    const r = await c.chat({ model: 'm', messages: [] });
    assert.equal(r.error.kind, 'no_key');
    assert.equal(fetch.calls.length, 0);
  });
  test('동시 호출은 최대 3개', async () => {
    let running = 0;
    let peak = 0;
    const slow = async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return completion('ok');
    };
    const { c } = client(Array.from({ length: 7 }, () => slow));
    await Promise.all(Array.from({ length: 7 }, () => c.chat({ model: 'm', messages: [] })));
    assert.equal(peak, 3);
  });
  test('키 확인 (GET /key)과 모델 목록', async () => {
    const { fetch, c } = client([
      json(200, { data: { label: 'tp', limit: 10, limit_remaining: 9.5, usage: 0.5, is_free_tier: false } }),
      json(200, { data: [{ id: 'openai/gpt-6-luna', name: 'OpenAI: GPT-6 Luna', context_length: 400000, pricing: { prompt: '0.0000001', completion: '0.0000005', web_search: '0.01' }, supported_parameters: ['response_format'] }] }),
    ]);
    const k = await c.checkKey();
    assert.deepEqual(k, { ok: true, label: 'tp', limit: 10, limitRemaining: 9.5, usage: 0.5, isFreeTier: false });
    assert.equal(fetch.calls[0].url, 'https://openrouter.ai/api/v1/key');
    const m = await c.listModels();
    assert.deepEqual(m.models[0], { id: 'openai/gpt-6-luna', name: 'OpenAI: GPT-6 Luna', contextLength: 400000, pricing: { prompt: 1e-7, completion: 5e-7, webSearch: 0.01 }, supportsJson: true });
  });
});

describe('JSON 응답 처리 (5.5)', () => {
  test('코드 블록·앞뒤 설명을 벗기고 JSON만 꺼낸다', () => {
    assert.deepEqual(extractJson('```json\n{"a": [1, 2]}\n```'), { ok: true, value: { a: [1, 2] } });
    assert.deepEqual(extractJson('결과입니다: [{"x":"}"}] 끝'), { ok: true, value: [{ x: '}' }] });
    assert.equal(extractJson('JSON 없음').ok, false);
  });
  const schema = {
    type: 'object',
    required: ['items'],
    properties: { items: { type: 'array', items: { type: 'object', required: ['name', 'score'], properties: { name: { type: 'string' }, score: { type: 'integer' }, note: { type: ['string', 'null'] }, level: { enum: ['low', 'high'] } } } } },
  };
  test('간단한 스키마 검증: 타입·필수·배열·열거·null 허용', () => {
    assert.deepEqual(validate({ items: [{ name: 'a', score: 3, note: null, level: 'low' }] }, schema), []);
    const errs = validate({ items: [{ name: 1, level: 'mid' }] }, schema);
    assert.ok(errs.some((e) => e.includes('items[0].score')));
    assert.ok(errs.some((e) => e.includes('items[0].name')));
    assert.ok(errs.some((e) => e.includes('items[0].level')));
    assert.ok(validate([], schema).length > 0);
  });
  test('검증 실패 → 오류를 붙여 1회 재요청 → 성공, 사용량은 합산', async () => {
    const { fetch, c } = client([completion('{"items":[{"name":"a"}]}'), completion('{"items":[{"name":"a","score":7}]}')]);
    const r = await chatJson(c, { model: 'm', messages: [{ role: 'user', content: 'q' }] }, { name: 's', schema });
    assert.equal(r.ok, true);
    assert.equal(r.value.items[0].score, 7);
    assert.equal(r.retried, true);
    assert.deepEqual(r.usage, { inTokens: 200, outTokens: 40, cost: 0.002 });
    const retryMsgs = fetch.calls[1].body.messages;
    assert.equal(retryMsgs.at(-1).role, 'user');
    assert.ok(retryMsgs.at(-1).content.includes('items[0].score'));
  });
  test('두 번 다 실패하면 원문을 돌려준다', async () => {
    const { c } = client([completion('죄송합니다'), completion('여전히 아님')]);
    const r = await chatJson(c, { model: 'm', messages: [] }, { name: 's', schema });
    assert.equal(r.ok, false);
    assert.equal(r.error.kind, 'invalid_json');
    assert.equal(r.raw, '여전히 아님');
  });
});

describe('실행기: 계획 → 실행 → 기록 (F10-1·4, F12)', () => {
  const settings = {
    models: [
      { key: 'claude', slug: 'anthropic/claude-sonnet-5.5', enabled: true, pricing: { prompt: 2e-6, completion: 1e-5, webSearch: 0.01 } },
      { key: 'gpt', slug: 'openai/gpt-6-luna', enabled: true, pricing: { prompt: 1e-7, completion: 5e-7, webSearch: 0.01 } },
      { key: 'gemini', slug: 'google/gemini-3.8-flash', enabled: false, pricing: { prompt: 7.5e-7, completion: 3.75e-6, webSearch: 0.014 } },
    ],
    webSearch: true,
    usdKrw: 1400,
    tokenRatio: { ko: 0.8, other: 0.25 },
  };
  const schema = { name: 's', schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } } };
  const messages = [{ role: 'user', content: '확인' }];

  test('계획: 꺼 둔 모델은 빼고, 모델마다 예상 토큰·비용', () => {
    const plan = planRun({ feature: 'test', label: '시험', calls: ['claude', 'gpt', 'gemini'].map((model) => ({ model, messages, schema })) }, settings, []);
    assert.deepEqual(plan.calls.map((c) => c.model), ['claude', 'gpt']);
    assert.equal(plan.calls[0].slug, 'anthropic/claude-sonnet-5.5');
    assert.ok(plan.calls[0].estimate.usd > plan.calls[1].estimate.usd);
    assert.equal(plan.summary.total.calls, 2);
  });
  test('웹 검색은 설정이 켜져 있고 호출이 요구할 때만', () => {
    const on = planRun({ feature: 'research', calls: [{ model: 'claude', messages, webSearch: true }] }, settings, []);
    assert.ok(on.calls[0].estimate.webUsd > 0);
    const off = planRun({ feature: 'research', calls: [{ model: 'claude', messages, webSearch: true }] }, { ...settings, webSearch: false }, []);
    assert.equal(off.calls[0].webSearch, false);
  });
  test('실행: 한 모델이 실패해도 나머지 결과를 돌려주고, 모두 aiRuns로 기록', async () => {
    const { c } = client([completion('{"ok":true}', { prompt_tokens: 10, completion_tokens: 5, cost: 0.0003 }), json(402, { error: { code: 402, message: 'no credit' } })]);
    const plan = planRun({ feature: 'test', calls: ['claude', 'gpt'].map((model) => ({ model, messages, schema })) }, settings, []);
    const progress = [];
    const out = await executeRun(c, plan, { onProgress: (i, status) => progress.push(`${i}:${status}`), now: () => new Date('2026-10-13T00:00:00Z'), runId: 'r1' });
    assert.equal(out.results[0].ok, true);
    assert.deepEqual(out.results[0].value, { ok: true });
    assert.equal(out.results[1].ok, false);
    assert.equal(out.results[1].error.kind, 'credits');
    assert.equal(out.runs.length, 2);
    assert.deepEqual(out.runs[0].actual, { inTokens: 10, outTokens: 5, usd: 0.0003 });
    assert.equal(out.runs[0].runId, 'r1');
    assert.equal(out.runs[0].status, 'done');
    assert.equal(out.runs[1].status, 'failed');
    assert.equal(out.runs[1].actual, null);
    assert.ok(progress.includes('0:running') && progress.includes('0:done') && progress.includes('1:failed'));
  });
  test('실행에서 고른 모델만 (확인 창 체크박스)', async () => {
    const { fetch, c } = client([completion('{"ok":true}')]);
    const plan = planRun({ feature: 'test', calls: ['claude', 'gpt'].map((model) => ({ model, messages, schema })) }, settings, []);
    const out = await executeRun(c, plan, { only: ['gpt'] });
    assert.equal(fetch.calls.length, 1);
    assert.equal(fetch.calls[0].body.model, 'openai/gpt-6-luna');
    assert.equal(out.results.length, 1);
  });
});
