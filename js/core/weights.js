// 기준 편집·가중치 입력 규칙 — PRD F5-2, F6-1~F6-4, F8-2
// 동행인 가중치 저장 형태 (스키마 v3):
//   weights[memberId] = {
//     mode: 'simple' | 'ahp',
//     raw: { [criterionId]: 0~10 },          // 단순 모드 슬라이더
//     pairs: { 'a|b': 값 },                   // AHP 판단. 키는 id를 정렬한 쌍, 값 = "a가 b보다 몇 배 중요"
//     judged: ['a|b', ...],                   // 사용자가 비교한(또는 채운) 쌍
//     touched: boolean,                       // 단순 모드를 한 번이라도 조정했는지
//   }
// 가중치 벡터·CR은 저장하지 않고 selectors.js에서 입력값으로 계산한다.

import { MAX_CRITERIA, DEFAULT_SIMPLE_WEIGHT, newId, defaultMemberWeights } from './schema.js';
import { sliderToPairwise, snapToSaaty, normalizeWeights, ahpConsistency, mostInconsistentPair } from './mcdm.js';

export const MIN_CRITERIA = 2;

const OK = { ok: true };
const fail = (error) => ({ ok: false, error });
const clean = (s) => String(s ?? '').trim();

/** 쌍 키: id를 정렬해 순서와 무관하게 하나로 */
export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** 키에 저장된 값을 (a, b) 방향의 값으로: a[a][b] */
export function pairValue(pairs, a, b) {
  const v = pairs?.[pairKey(a, b)];
  if (v == null) return 1;
  return a < b ? v : 1 / v;
}

/** 동행인 가중치 객체 (옛 데이터에 빠진 필드 채우기) */
export function memberWeightsEntry(data, memberId) {
  const w = (data.weights[memberId] ??= defaultMemberWeights(data.criteria));
  w.raw ??= {};
  w.pairs ??= {};
  w.judged ??= [];
  return w;
}

// ── 기준 편집 (F5-2) ─────────────────────────────────────

export function addCriterion(data, name) {
  const n = clean(name);
  if (!n) return fail('nameRequired');
  if (data.criteria.length >= MAX_CRITERIA) return fail('max');
  if (data.criteria.some((c) => c.name === n)) return fail('duplicate');
  const id = `k-${newId().slice(0, 8)}`;
  data.criteria.push({ id, name: n, type: 'qualitative', direction: 'higher_better' });
  for (const m of data.members) memberWeightsEntry(data, m.id).raw[id] = DEFAULT_SIMPLE_WEIGHT;
  return { ok: true, id };
}

export function renameCriterion(data, id, name) {
  const n = clean(name);
  if (!n) return fail('nameRequired');
  if (data.criteria.some((c) => c.id !== id && c.name === n)) return fail('duplicate');
  const c = data.criteria.find((x) => x.id === id);
  if (c) c.name = n;
  return OK;
}

/** 기준과 그 기준이 들어간 단순 가중치·쌍대비교·점수를 함께 지운다 */
export function removeCriterion(data, id) {
  if (data.criteria.length <= MIN_CRITERIA) return fail('min');
  data.criteria = data.criteria.filter((c) => c.id !== id);
  const touches = (key) => key.split('|').includes(id);
  for (const m of data.members) {
    const w = memberWeightsEntry(data, m.id);
    delete w.raw[id];
    for (const key of Object.keys(w.pairs)) if (touches(key)) delete w.pairs[key];
    w.judged = w.judged.filter((key) => !touches(key));
  }
  for (const row of Object.values(data.scores)) delete row[id];
  return OK;
}

// ── 가중치 입력 ──────────────────────────────────────────

export function setWeightMode(data, memberId, mode) {
  memberWeightsEntry(data, memberId).mode = mode;
  return OK;
}

/** 단순 모드 슬라이더 0~10 (F6-1) */
export function setRawWeight(data, memberId, criterionId, value) {
  const w = memberWeightsEntry(data, memberId);
  w.raw[criterionId] = Math.min(10, Math.max(0, Math.round(Number(value) || 0)));
  w.touched = true;
  return OK;
}

/**
 * AHP 판단 (F6-2). slider: −8~8, 음수면 왼쪽(a)이 |v|+1배, 양수면 오른쪽(b)이 v+1배.
 */
export function setPairJudgment(data, memberId, a, b, slider) {
  const w = memberWeightsEntry(data, memberId);
  const valueAB = sliderToPairwise(Number(slider));
  const key = pairKey(a, b);
  w.pairs[key] = a < b ? valueAB : 1 / valueAB;
  if (!w.judged.includes(key)) w.judged.push(key);
  return OK;
}

/** 아직 비교하지 않은 쌍을 단순 모드 슬라이더 값의 비율로 채운다 (F6-4) */
export function fillRemainingPairs(data, memberId) {
  const w = memberWeightsEntry(data, memberId);
  const crit = data.criteria;
  const vec = normalizeWeights(crit.map((c) => w.raw[c.id] ?? DEFAULT_SIMPLE_WEIGHT));
  for (let i = 0; i < crit.length; i++) {
    for (let j = i + 1; j < crit.length; j++) {
      const [a, b] = [crit[i].id, crit[j].id];
      const key = pairKey(a, b);
      if (w.judged.includes(key)) continue;
      const ratio = vec[i] === vec[j] ? 1 : vec[j] === 0 ? 9 : vec[i] / vec[j];
      const valueAB = snapToSaaty(ratio);
      w.pairs[key] = a < b ? valueAB : 1 / valueAB;
      w.judged.push(key);
    }
  }
  return OK;
}

/** 현재 기준 순서로 쌍대비교 행렬 만들기 (비교 안 한 쌍은 1 = 같음) */
export function buildMatrix(criteria, w) {
  return criteria.map((ci) => criteria.map((cj) => (ci.id === cj.id ? 1 : pairValue(w?.pairs, ci.id, cj.id))));
}

/** CR ≥ 0.1일 때 가장 모순되는 비교와 제안값(id로). 없으면 null */
export function inconsistencyOf(criteria, w) {
  if (criteria.length < 3) return null;
  const m = buildMatrix(criteria, w);
  if (ahpConsistency(m).cr < 0.1) return null;
  const p = mostInconsistentPair(m);
  return { a: criteria[p.i].id, b: criteria[p.j].id, current: p.current, suggested: p.suggested, crAfter: p.crAfter };
}

/** 가장 모순되는 비교를 제안값으로 바꾸기 (F6-3 안내의 "제안대로 바꾸기") */
export function applySuggestion(data, memberId) {
  const w = memberWeightsEntry(data, memberId);
  const s = inconsistencyOf(data.criteria, w);
  if (!s) return fail('none');
  const key = pairKey(s.a, s.b);
  w.pairs[key] = s.a < s.b ? s.suggested : 1 / s.suggested;
  if (!w.judged.includes(key)) w.judged.push(key);
  return OK;
}
