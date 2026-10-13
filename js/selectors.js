// 파생값: 입력 데이터 → 가중치·CR·상태 (DOM 없음, Node 테스트 대상)
// 앞 단계 값이 바뀌면 화면이 이 함수들을 다시 불러 자동으로 다시 계산된다 (PRD 3장).
import { normalizeWeights, ahpWeights, ahpConsistency, aggregateSimple, aggregateAIJ, pairwiseToSlider } from './core/mcdm.js';
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
