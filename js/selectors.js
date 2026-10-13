// 파생값: 입력 데이터 → 가중치·CR·상태 (DOM 없음, Node 테스트 대상)
// 앞 단계 값이 바뀌면 화면이 이 함수들을 다시 불러 자동으로 다시 계산된다 (PRD 3장).
import { normalizeWeights, ahpWeights, ahpConsistency, aggregateSimple, aggregateAIJ, pairwiseToSlider, weightedSum, rank, isNearTie, sensitivity } from './core/mcdm.js';
import { DEFAULT_SIMPLE_WEIGHT } from './core/schema.js';
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
    research: Object.keys(data.research ?? {}).length > 0,
    weights: weightsDone,
    scores: scored,
    results: scored,
    panel: Boolean(data.decision?.chosen),
    export: false,
  };
}
