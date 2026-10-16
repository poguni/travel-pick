// 파생값: 입력 데이터 → 가중치·CR·상태 (DOM 없음, Node 테스트 대상)
// 앞 단계 값이 바뀌면 화면이 이 함수들을 다시 불러 자동으로 다시 계산된다 (PRD 3장).
import { normalizeWeights, ahpWeights, ahpConsistency, aggregateSimple, aggregateAIJ, pairwiseToSlider, weightedSum, rank, isNearTie, sensitivity } from './core/mcdm.js';
import { DEFAULT_SIMPLE_WEIGHT } from './core/schema.js';
import { mergeRecommendations, findCandidate, numericSpread } from './core/merge.js';
import { RESEARCH_ITEMS, researchStatus } from './core/research.js';
import { cellStats, SD_WARN } from './core/scores.js';
import { recommendKey } from './core/project.js';
import { buildMatrix, inconsistencyOf, pairKey, pairValue } from './core/weights.js';

export const memberMatrix = buildMatrix;

/** 기준 순서대로 비교할 쌍 목록 (i < j) */
export function pairList(criteria) {
  const out = [];
  for (let i = 0; i < criteria.length; i++) {
    for (let j = i + 1; j < criteria.length; j++) out.push({ a: criteria[i], b: criteria[j], key: pairKey(criteria[i].id, criteria[j].id) });
  }
  return out;
}

/** (a, b) 쌍의 슬라이더 위치 −8~8 (a가 왼쪽) */
export const sliderValueOf = (w, a, b) => pairwiseToSlider(pairValue(w?.pairs, a, b));

/**
 * 동행인 한 명의 가중치.
 * 반환: { mode, vector, cr, consistency, judged, total, inconsistent }
 */
export function memberWeights(criteria, w) {
  const mode = w?.mode ?? 'simple';
  const n = criteria.length;
  const total = (n * (n - 1)) / 2;
  const keys = new Set(pairList(criteria).map((p) => p.key));
  const judged = (w?.judged ?? []).filter((k) => keys.has(k)).length;
  if (mode === 'ahp') {
    const matrix = buildMatrix(criteria, w);
    const vector = ahpWeights(matrix);
    const consistency = ahpConsistency(matrix, vector);
    return { mode, vector, cr: consistency.cr, consistency, judged, total, inconsistent: inconsistencyOf(criteria, w), matrix };
  }
  const vector = normalizeWeights(criteria.map((c) => w?.raw?.[c.id] ?? DEFAULT_SIMPLE_WEIGHT));
  return { mode, vector, cr: null, consistency: null, judged, total, inconsistent: null };
}

/** 'done' | 'waiting' — 단순 모드는 한 번이라도 조정, AHP는 모든 쌍 비교 */
export function memberStatus(criteria, w) {
  if ((w?.mode ?? 'simple') === 'ahp') {
    const r = memberWeights(criteria, w);
    return r.judged >= r.total ? 'done' : 'waiting';
  }
  return w?.touched ? 'done' : 'waiting';
}

/**
 * 그룹 가중치 (F8-4). 모두 AHP면 판단의 가중 기하평균(AIJ) + 그룹 CR,
 * 단순 모드가 섞여 있으면 각자 가중치의 가중 산술평균.
 */
export function groupWeights(data) {
  const { criteria } = data;
  const members = data.members.map((m) => ({ id: m.id, name: m.name, influence: m.influence ?? 1, ...memberWeights(criteria, data.weights[m.id]) }));
  const influence = members.map((m) => m.influence);
  const usable = influence.some((v) => v > 0) ? influence : influence.map(() => 1);
  if (members.every((m) => m.mode === 'ahp')) {
    const matrix = aggregateAIJ(members.map((m) => m.matrix), usable);
    const vector = ahpWeights(matrix);
    const consistency = ahpConsistency(matrix, vector);
    return { method: 'aij', vector, cr: consistency.cr, consistency, members };
  }
  return { method: 'mean', vector: aggregateSimple(members.map((m) => m.vector), usable), cr: null, consistency: null, members };
}

/**
 * 기준 색 톤 번호 1~7: 가중치가 클수록 밝은 톤(k1), 같은 가중치는 같은 톤, 8단계부터는 k7 (DESIGN.md 3장)
 */
export function criterionTones(vector) {
  const levels = [...new Set(vector.map((v) => Math.round(v * 1e6)))].sort((a, b) => b - a);
  return vector.map((v) => Math.min(7, levels.indexOf(Math.round(v * 1e6)) + 1));
}

// ── 점수·결과 (PRD F7-1, F8-5, F9) ──────────────────────

/** 후보 × 기준 최종 점수 행렬 (빈 칸 null) */
export function scoreMatrix(data) {
  return data.candidates.map((c) => data.criteria.map((k) => data.scores[c.id]?.[k.id]?.final ?? null));
}

export function scoreProgress(data) {
  const filled = scoreMatrix(data).flat().filter((v) => v != null).length;
  return { filled, total: data.candidates.length * data.criteria.length };
}

/** 가중치 벡터: memberId가 없으면 그룹 */
const vectorFor = (data, memberId) => (memberId ? memberWeights(data.criteria, data.weights[memberId]).vector : groupWeights(data).vector);

/**
 * 결과 (그룹 또는 동행인 한 명 기준).
 * ranking: 점수가 다 찬 후보만 [{ id, index, score, rank }], incomplete: 점수가 빈 후보 id
 * contributions[i][j]: 후보 i의 최종 점수 중 기준 j가 기여한 몫(0~100 척도)
 */
export function resultsFor(data, memberId = null) {
  const vector = vectorFor(data, memberId);
  const matrix = scoreMatrix(data);
  const totals = weightedSum(matrix, vector);
  const ranking = rank(totals)
    .filter((r) => r.score != null)
    .map((r) => ({ ...r, id: data.candidates[r.index].id }));
  const contributions = matrix.map((row) => row.map((s, j) => (s == null ? null : vector[j] * s * 10)));
  const nearTie = ranking.length >= 2 && isNearTie(ranking[0].score, ranking[1].score);
  const incomplete = data.candidates.filter((_, i) => totals[i] == null).map((c) => c.id);
  return { vector, matrix, totals, ranking, contributions, nearTie, incomplete };
}

/** 순위표 상태: 1위 유력, 1위와 5점 이내 경합, 그 밖 검토 */
export function candidateStatus(rankNo, gapFromLeader) {
  if (rankNo === 1) return 'lead';
  return gapFromLeader <= 5 ? 'contend' : 'review';
}

/**
 * 탑승객별 1위 (F8-5). mostDifferent: 자기 1위와 그룹 1위의 점수 차(자기 가중치 기준)가 가장 큰 사람
 */
export function memberTopPicks(data) {
  const group = resultsFor(data).ranking[0]?.id ?? null;
  const members = data.members.map((m) => {
    const r = resultsFor(data, m.id);
    const top = r.ranking[0]?.id ?? null;
    const own = (id) => r.totals[data.candidates.findIndex((c) => c.id === id)] ?? 0;
    return { id: m.id, name: m.name, top, gap: top && group ? own(top) - own(group) : 0 };
  });
  const worst = members.reduce((best, m) => (m.gap > (best?.gap ?? 0) ? m : best), null);
  return { group, members, mostDifferent: worst?.id ?? null };
}

/**
 * 민감도 (F9-4): 그룹 가중치에서 기준 하나를 움직일 때. 순위를 매길 후보가 2곳 미만이면 null.
 * up/down에 leaderId를 붙여 돌려준다.
 */
export function sensitivityFor(data, criterionIndex) {
  const r = resultsFor(data);
  if (r.ranking.length < 2) return null;
  const s = sensitivity(r.matrix, r.vector, criterionIndex);
  const idOf = (i) => data.candidates[i].id;
  return {
    ...s,
    criterion: data.criteria[criterionIndex],
    leaderId: idOf(r.ranking[0].index),
    up: s.up && { ...s.up, leaderId: idOf(s.up.leader) },
    down: s.down && { ...s.down, leaderId: idOf(s.down.leader) },
  };
}

/** 현재 가중치에서 가장 가까운 역전 지점이 있는 기준 (결과 화면 기본 선택) */
export function closestSensitivity(data) {
  let best = null;
  data.criteria.forEach((_, j) => {
    const s = sensitivityFor(data, j);
    if (!s) return;
    for (const p of [s.up, s.down]) {
      if (!p) continue;
      const distance = Math.abs(p.at - s.current);
      if (!best || distance < best.distance - 1e-12) best = { criterionIndex: j, distance };
    }
  });
  return best;
}

/** RouteNav 단계 완료 판정 (자료 수집·AI 심사·내보내기는 각 Phase에서 채움) */
export function stepsDone(data) {
  const p = data.project;
  const scored = data.candidates.length >= 2 && scoreProgress(data).filled === scoreProgress(data).total;
  const weightsDone = data.members.every((m) => memberStatus(data.criteria, data.weights[m.id]) === 'done');
  return {
    conditions: data.candidates.length > 0 || p.period.mode !== 'undecided' || p.budgetPerPerson != null || p.interests.length > 0,
    candidates: data.candidates.length >= 2,
    research: data.candidates.length > 0 && data.candidates.every((c) => researchProgressOf(data, c).done > 0 || Object.keys(data.research[c.id]?.confirmed ?? {}).length > 0),
    weights: weightsDone,
    scores: scored,
    results: scored,
    panel: Boolean(data.decision?.chosen),
    export: Boolean(data.decision?.exportedAt),
  };
}

const AI_MODELS = ['claude', 'gpt', 'gemini'];

/**
 * AI 추천 화면용 (F2-4). 저장된 모델별 목록을 합쳐 공통 추천 순으로, 이미 담은 후보는 candidate로 표시.
 * 반환: null(아직 추천 안 받음) 또는 { items, models: data.recommend.byModel, stale(조건이 바뀜), at }
 */
export function recommendView(data) {
  const rec = data.recommend;
  if (!rec) return null;
  const tripType = data.project.tripType;
  const byModel = Object.fromEntries(Object.entries(rec.byModel).map(([m, r]) => [m, r.items]));
  const items = mergeRecommendations(byModel, tripType, AI_MODELS.filter((m) => m in byModel)).map((item) => ({ ...item, candidate: findCandidate(data.candidates, item, tripType) }));
  return { items, models: rec.byModel, stale: rec.key !== recommendKey(data.project), at: rec.at };
}

// ── 자료 수집 (F4) ───────────────────────────────────────

/** 후보 하나의 모델별 조사 상태 { status: { 모델: done|stale|failed|none }, done, failed } */
function researchProgressOf(data, candidate, models = AI_MODELS) {
  const status = Object.fromEntries(models.map((m) => [m, researchStatus(data, candidate, m)]));
  const vals = Object.values(status);
  return { status, done: vals.filter((v) => v === 'done').length, failed: vals.filter((v) => v === 'failed').length };
}

/**
 * 자료 수집 진행 (F4-6·7). models: 지금 쓸 수 있는 모델 키.
 * pending: 아직 지금 조건으로 조사하지 않은 후보·모델(캐시 적중은 제외), failed: 실패한 후보·모델
 */
export function researchProgress(data, models) {
  const perCandidate = data.candidates.map((c) => ({ candidate: c, ...researchProgressOf(data, c, models) }));
  const pick = (want) => perCandidate.map((p) => ({ candidateId: p.candidate.id, models: models.filter((m) => want(p.status[m])) })).filter((t) => t.models.length);
  const count = (targets) => targets.reduce((n, t) => n + t.models.length, 0);
  const pending = pick((st) => st !== 'done');
  const failed = pick((st) => st === 'failed');
  return { perCandidate, pending, failed, pendingCalls: count(pending), failedCalls: count(failed), doneCandidates: perCandidate.filter((p) => p.done > 0).length };
}

const latest = (list) => list.filter(Boolean).sort().at(-1) ?? null;

/**
 * 후보 하나의 조사 카드들 (F4-2~5). 이전 조건(stale) 결과도 보여 주되 표시한다.
 * 반환: { status, entries: { 모델: 저장된 결과 }, items: [{ def, models: { 모델: 항목 }, stale: Set, spread, sources, needsCheck, asOf, confirmed, note }] }
 */
export function researchCards(data, candidate) {
  const slot = data.research[candidate.id] ?? {};
  const { status } = researchProgressOf(data, candidate);
  const usable = AI_MODELS.filter((m) => status[m] === 'done' || status[m] === 'stale');
  const items = RESEARCH_ITEMS[data.project.tripType].map((def) => {
    const models = Object.fromEntries(usable.filter((m) => slot[m].items[def.id]).map((m) => [m, slot[m].items[def.id]]));
    const list = Object.values(models);
    // 수치 비교는 지금 조건의 결과끼리만
    const current = Object.fromEntries(Object.entries(models).filter(([m]) => status[m] === 'done').map(([m, it]) => [m, it.numeric]));
    return {
      def,
      models,
      stale: new Set(Object.keys(models).filter((m) => status[m] === 'stale')),
      spread: def.numeric ? numericSpread(current) : null,
      sources: [...new Set(list.flatMap((i) => i.sources))],
      needsCheck: list.length > 0 && list.some((i) => i.needsCheck),
      asOf: latest(list.map((i) => i.asOf)),
      confirmed: slot.confirmed?.[def.id] ?? '',
      note: slot.notes?.[def.id] ?? '',
    };
  });
  return { status, entries: Object.fromEntries(AI_MODELS.map((m) => [m, slot[m] ?? null])), items };
}

// ── 합의 수준 (F10-3, PRD 6.6) ───────────────────────────

const LEVELS = ['low', 'mid', 'high'];
const level = (v, mid, high, higherIsBetter = true) => (v == null ? null : higherIsBetter ? (v >= high ? 'high' : v >= mid ? 'mid' : 'low') : v <= high ? 'high' : v <= mid ? 'mid' : 'low');

/**
 * 세 지표로 본 AI 합의 수준. 각 지표는 데이터가 없으면 level null.
 * - recommend: 2개 이상 모델이 함께 추천한 곳의 비율 (높을수록 합의)
 * - numeric: 자료 수집 수치 항목 중 모델 간 차이 30% 이상인 비율 (낮을수록 합의)
 * - scores: AI 점수 칸의 평균 표준편차, 2 이상인 칸 수 (낮을수록 합의)
 * overall: 있는 지표 수준의 평균(내림)
 */
export function consensusSummary(data) {
  const rec = recommendView(data);
  const recDone = rec ? Object.values(rec.models).filter((r) => r.status === 'done').length : 0;
  const shared = rec ? rec.items.filter((i) => i.count >= 2).length : 0;
  const recRatio = rec && recDone >= 2 && rec.items.length ? shared / rec.items.length : null;

  let compared = 0;
  let diverged = 0;
  for (const c of data.candidates) {
    for (const item of researchCards(data, c).items) {
      if (item.spread?.count >= 2) {
        compared++;
        if (item.spread.warn) diverged++;
      }
    }
  }
  const numRatio = compared ? diverged / compared : null;

  const sds = [];
  for (const c of data.candidates) {
    for (const k of data.criteria) {
      const st = cellStats(data.scores[c.id]?.[k.id]);
      if (st.count >= 2) sds.push(st.sd);
    }
  }
  const meanSd = sds.length ? sds.reduce((a, b) => a + b, 0) / sds.length : null;

  const metrics = {
    recommend: { ratio: recRatio, shared, total: rec?.items.length ?? 0, level: level(recRatio, 0.25, 0.5) },
    numeric: { ratio: numRatio, compared, diverged, level: level(numRatio, 0.3, 0.1, false) },
    scores: { meanSd, cells: sds.length, highSd: sds.filter((v) => v >= SD_WARN).length, level: level(meanSd, 1.5, 1, false) },
  };
  const present = Object.values(metrics).map((m) => m.level).filter(Boolean);
  const overall = present.length ? LEVELS[Math.floor(present.reduce((a, l) => a + LEVELS.indexOf(l), 0) / present.length)] : null;
  return { ...metrics, overall };
}
