// AI 실행기 — PRD 3장(AI 단계는 비용 확인 창 먼저), F10-1·4, F12-1~3
// planRun: 호출 목록 → 모델별 예상 비용 / executeRun: 병렬 실행 → 결과 + aiRuns 기록
// 확인 창(UI)은 ui/components/costReceipt.js, 둘을 잇는 것은 main.js의 ctx.ai.run

import { estimateTokens, estimateCall, expectedOutTokens, summarizeEstimates, actualUsd } from '../core/cost.js';
import { chatJson } from './json.js';

/**
 * request: { feature, label, description, calls: [{ model: 'claude'|'gpt'|'gemini', messages, schema?, webSearch?, outTokens?, meta? }] }
 * 꺼 둔 모델과 슬러그가 없는 모델은 뺀다. 웹 검색은 설정이 켜져 있고 호출이 요구할 때만.
 */
export function planRun(request, settings, aiRuns = []) {
  const byKey = Object.fromEntries(settings.models.map((m) => [m.key, m]));
  const calls = request.calls
    .filter((c) => byKey[c.model]?.enabled && byKey[c.model]?.slug)
    .map((c, index) => {
      const m = byKey[c.model];
      const webSearch = Boolean(c.webSearch && settings.webSearch);
      const inTokens = estimateTokens(c.messages, settings.tokenRatio) + (c.schema ? estimateTokens(JSON.stringify(c.schema.schema), settings.tokenRatio) : 0);
      const outTokens = c.outTokens ?? expectedOutTokens(request.feature, c.model, aiRuns);
      return { ...c, index, slug: m.slug, name: m.name, webSearch, pricing: m.pricing, estimate: estimateCall({ inTokens, outTokens, pricing: m.pricing, webSearch }) };
    });
  return { ...request, calls, summary: summarizeEstimates(calls, { usdKrw: settings.usdKrw }) };
}

/**
 * plan을 실행한다. only: 확인 창에서 고른 모델 키(생략하면 전부).
 * onProgress(callIndex, 'running'|'done'|'failed', result?)
 * 반환: { results: [{ index, model, ok, value|content, citations, error, raw }], runs: aiRuns 항목들 }
 */
export async function executeRun(client, plan, { only, onProgress = () => {}, now = () => new Date(), runId = globalThis.crypto.randomUUID() } = {}) {
  const calls = plan.calls.filter((c) => !only || only.includes(c.model));
  const runs = [];
  const results = await Promise.all(
    calls.map(async (call, pos) => {
      onProgress(call.index, 'running');
      const req = { model: call.slug, messages: call.messages, webSearch: call.webSearch };
      const r = call.schema ? await chatJson(client, req, call.schema) : await client.chat(req);
      const usage = r.usage;
      runs[pos] = {
        id: globalThis.crypto.randomUUID(),
        runId,
        feature: plan.feature,
        model: call.model,
        modelSlug: call.slug,
        estimate: { inTokens: call.estimate.inTokens, outTokens: call.estimate.outTokens, usd: call.estimate.usd },
        actual: usage ? { inTokens: usage.inTokens, outTokens: usage.outTokens, usd: actualUsd({ prompt_tokens: usage.inTokens, completion_tokens: usage.outTokens, cost: usage.cost }, call.pricing) } : null,
        status: r.ok ? 'done' : 'failed',
        error: r.ok ? null : r.error.kind,
        at: now().toISOString(),
      };
      const result = { index: call.index, model: call.model, meta: call.meta, ok: r.ok, value: r.value, content: r.content, citations: r.citations ?? [], error: r.error, raw: r.raw, usd: runs[pos].actual?.usd ?? null };
      onProgress(call.index, r.ok ? 'done' : 'failed', result);
      return result;
    }),
  );
  return { results, runs };
}
