// 토큰·비용 추정과 기록 — PRD F12, 5.7. 비용 상한은 두지 않고 보여 주기만 한다.

/** 기능별 출력 토큰 기본값 (5.7-2). 실행 기록이 쌓이면 실제 평균으로 바뀐다 (F12-5) */
export const OUT_DEFAULTS = { recommend: 2000, research: 1500, scores: 1000, panel: 800, chair: 1500, test: 60 };

/** 웹 검색 결과가 입력에 더해지는 분량 추정 (검색 1회당) */
export const SEARCH_RESULT_TOKENS = 2500;

/** 메시지마다 붙는 역할·구분 토큰 */
const MESSAGE_OVERHEAD = 4;

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/g;

/**
 * 토큰 수 추정 (5.7-1). text: 문자열 또는 [{ role, content }]
 * ratio: { ko: 한글 1글자당 토큰, other: 그 밖 1글자당 토큰 } — 설정값
 */
export function estimateTokens(text, ratio) {
  if (Array.isArray(text)) {
    return text.reduce((sum, m) => sum + estimateTokens(m.content ?? '', ratio) + MESSAGE_OVERHEAD, 0);
  }
  const s = String(text ?? '');
  const ko = (s.match(HANGUL) ?? []).length;
  return Math.ceil(ko * ratio.ko + (s.length - ko) * ratio.other);
}

/** 모델 목록 API의 pricing(토큰당 USD 문자열) → 숫자 */
export function pricingFromApi(p) {
  if (!p) return null;
  return { prompt: Number(p.prompt) || 0, completion: Number(p.completion) || 0, webSearch: Number(p.web_search) || 0 };
}

/**
 * 호출 1회 예상 (5.7-3·4).
 * webSearch면 검색 1회 요금과 검색 결과 분량(searchTokens)만큼 입력 토큰을 더한다.
 */
export function estimateCall({ inTokens, outTokens, pricing, webSearch = false, searchTokens = SEARCH_RESULT_TOKENS }) {
  const input = inTokens + (webSearch ? searchTokens : 0);
  if (!pricing) return { inTokens: input, outTokens, usd: null, webUsd: null };
  const webUsd = webSearch ? pricing.webSearch : 0;
  return { inTokens: input, outTokens, usd: input * pricing.prompt + outTokens * pricing.completion + webUsd, webUsd };
}

/**
 * 출력 토큰 예상 (F12-5): 같은 기능·모델의 최근 실제 출력 평균(최대 10개),
 * 없으면 같은 기능의 다른 모델 평균, 그것도 없으면 기본값.
 */
export function expectedOutTokens(feature, model, aiRuns = []) {
  const done = aiRuns.filter((r) => r.feature === feature && r.status === 'done' && r.actual?.outTokens != null);
  const avg = (runs) => {
    const recent = [...runs].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10);
    return recent.length ? Math.round(recent.reduce((s, r) => s + r.actual.outTokens, 0) / recent.length) : null;
  };
  return avg(done.filter((r) => r.model === model)) ?? avg(done) ?? OUT_DEFAULTS[feature] ?? 1000;
}

/**
 * 확인 창 표 (F12-1·2). calls: [{ model, estimate }]. enabled: 이번 실행에 쓸 모델 키(생략 시 전부)
 * 끈 모델도 byModel에는 남기고 total에서만 뺀다.
 */
export function summarizeEstimates(calls, { usdKrw, enabled } = {}) {
  const byModel = {};
  const total = { calls: 0, inTokens: 0, outTokens: 0, usd: 0, webUsd: 0, unknownPrice: false };
  for (const c of calls) {
    const m = (byModel[c.model] ??= { calls: 0, inTokens: 0, outTokens: 0, usd: 0, webUsd: 0 });
    const e = c.estimate;
    m.calls += 1;
    m.inTokens += e.inTokens;
    m.outTokens += e.outTokens;
    m.usd = e.usd == null || m.usd == null ? null : m.usd + e.usd;
    m.webUsd += e.webUsd ?? 0;
    if (enabled && !enabled.includes(c.model)) continue;
    total.calls += 1;
    total.inTokens += e.inTokens;
    total.outTokens += e.outTokens;
    if (e.usd == null) total.unknownPrice = true;
    else total.usd += e.usd;
    total.webUsd += e.webUsd ?? 0;
  }
  total.krw = usdKrw ? total.usd * usdKrw : null;
  return { byModel, total };
}

/** 실제 비용 (F12-3): usage.cost(실제 청구액) 우선, 없으면 토큰 × 단가 */
export function actualUsd(usage, pricing) {
  if (usage?.cost != null) return Number(usage.cost);
  if (!pricing) return null;
  return (usage?.prompt_tokens ?? 0) * pricing.prompt + (usage?.completion_tokens ?? 0) * pricing.completion;
}

/** 가장 최근 같은 기능 실행 묶음(runId)의 (실제 − 예상) / 예상. 기록이 없으면 null */
export function lastRunDelta(aiRuns, feature) {
  const runs = aiRuns.filter((r) => r.feature === feature && r.status === 'done' && r.estimate?.usd && r.actual?.usd != null);
  if (!runs.length) return null;
  const lastAt = runs.reduce((m, r) => (String(r.at) > m ? String(r.at) : m), '');
  const lastId = runs.find((r) => String(r.at) === lastAt).runId;
  const group = runs.filter((r) => r.runId === lastId);
  const est = group.reduce((s, r) => s + r.estimate.usd, 0);
  const act = group.reduce((s, r) => s + r.actual.usd, 0);
  return (act - est) / est;
}

/** 누적 비용 (F12-4): 모델별·기능별 실제 비용 합계 */
export function costTotals(aiRuns = []) {
  const byModel = {};
  const byFeature = {};
  let total = 0;
  for (const r of aiRuns) {
    const usd = r.actual?.usd ?? 0;
    total += usd;
    byModel[r.model] = (byModel[r.model] ?? 0) + usd;
    byFeature[r.feature] = (byFeature[r.feature] ?? 0) + usd;
  }
  return { total, byModel, byFeature, calls: aiRuns.length };
}
