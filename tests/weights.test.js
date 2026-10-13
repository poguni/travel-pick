// 기준 편집·가중치 입력 규칙과 계산 연결 — PRD F5, F6, F8-2·F8-4
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../js/core/schema.js';
import { addMember } from '../js/core/project.js';
import {
  pairKey,
  addCriterion,
  removeCriterion,
  renameCriterion,
  setWeightMode,
  setRawWeight,
  setPairJudgment,
  fillRemainingPairs,
  applySuggestion,
} from '../js/core/weights.js';
import { memberMatrix, memberWeights, groupWeights, memberStatus, criterionTones, pairList, sliderValueOf } from '../js/selectors.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `기대 ${b}, 실제 ${a}`);
const fresh = () => createProject({ id: 'p' });
const ids = (d) => d.criteria.map((c) => c.id);

describe('기준 편집 (F5-2)', () => {
  test('추가: 새 id, 모든 동행인 단순 가중치에 기본값 5', () => {
    const d = fresh();
    addMember(d, '배우자');
    const r = addCriterion(d, '대중교통');
    assert.equal(r.ok, true);
    assert.equal(d.criteria.length, 8);
    assert.equal(d.criteria.at(-1).name, '대중교통');
    for (const m of d.members) assert.equal(d.weights[m.id].raw[r.id], 5);
  });
  test('최대 9개, 이름 필수, 같은 이름 거부', () => {
    const d = fresh();
    addCriterion(d, 'A');
    addCriterion(d, 'B');
    assert.deepEqual(addCriterion(d, 'C'), { ok: false, error: 'max' });
    assert.deepEqual(addCriterion(fresh(), ' '), { ok: false, error: 'nameRequired' });
    assert.deepEqual(addCriterion(fresh(), '비용'), { ok: false, error: 'duplicate' });
  });
  test('삭제: 단순 가중치·쌍대비교·점수에서 함께 지운다, 최소 2개', () => {
    const d = fresh();
    setWeightMode(d, 'm1', 'ahp');
    setPairJudgment(d, 'm1', 'safety', 'cost', -2);
    setPairJudgment(d, 'm1', 'weather', 'food', 3);
    d.scores.c1 = { safety: { final: 8 }, food: { final: 6 } };
    removeCriterion(d, 'safety');
    const w = d.weights.m1;
    assert.equal(ids(d).includes('safety'), false);
    assert.equal(w.raw.safety, undefined);
    assert.deepEqual(Object.keys(w.pairs), [pairKey('weather', 'food')]);
    assert.deepEqual(w.judged, [pairKey('weather', 'food')]);
    assert.equal(d.scores.c1.safety, undefined);
    assert.ok(d.scores.c1.food);
    const two = fresh();
    while (two.criteria.length > 2) removeCriterion(two, two.criteria[0].id);
    assert.deepEqual(removeCriterion(two, two.criteria[0].id), { ok: false, error: 'min' });
  });
  test('이름 변경', () => {
    const d = fresh();
    renameCriterion(d, 'photo', ' 사진 ');
    assert.equal(d.criteria.find((c) => c.id === 'photo').name, '사진');
    assert.deepEqual(renameCriterion(d, 'photo', '비용'), { ok: false, error: 'duplicate' });
  });
});

describe('단순 모드 (F6-1)', () => {
  test('0~10 슬라이더 → 합 100%로 정규화, 입력하면 완료', () => {
    const d = fresh();
    assert.equal(memberStatus(d.criteria, d.weights.m1), 'waiting');
    setRawWeight(d, 'm1', 'safety', 10);
    setRawWeight(d, 'm1', 'cost', 0);
    const r = memberWeights(d.criteria, d.weights.m1);
    close(r.vector.reduce((a, b) => a + b), 1);
    close(r.vector[ids(d).indexOf('safety')], 10 / 35); // 안전 10 + 비용 0 + 나머지 5개 × 5
    assert.equal(r.vector[ids(d).indexOf('cost')], 0);
    assert.equal(r.cr, null);
    assert.equal(memberStatus(d.criteria, d.weights.m1), 'done');
  });
  test('0~10 밖의 값은 잘라낸다', () => {
    const d = fresh();
    setRawWeight(d, 'm1', 'food', 15);
    assert.equal(d.weights.m1.raw.food, 10);
  });
});

describe('AHP 모드 (F6-2, F6-3)', () => {
  test('쌍 키는 순서와 무관, 저장값은 키 앞쪽 기준 기준', () => {
    assert.equal(pairKey('safety', 'cost'), pairKey('cost', 'safety'));
    const d = fresh();
    setWeightMode(d, 'm1', 'ahp');
    setPairJudgment(d, 'm1', 'safety', 'cost', -2); // 왼쪽(안전)이 3배
    const m = memberMatrix(d.criteria, d.weights.m1);
    const [s, c] = [ids(d).indexOf('safety'), ids(d).indexOf('cost')];
    close(m[s][c], 3);
    close(m[c][s], 1 / 3);
    assert.equal(sliderValueOf(d.weights.m1, 'safety', 'cost'), -2);
    assert.equal(sliderValueOf(d.weights.m1, 'cost', 'safety'), 2);
  });
  test('같음(0)으로 되돌려도 비교한 것으로 센다, 진행률', () => {
    const d = fresh();
    setWeightMode(d, 'm1', 'ahp');
    setPairJudgment(d, 'm1', 'cost', 'weather', 0);
    const r = memberWeights(d.criteria, d.weights.m1);
    assert.equal(r.judged, 1);
    assert.equal(r.total, 21);
    assert.equal(memberStatus(d.criteria, d.weights.m1), 'waiting');
  });
  test('비교 목록은 기준 순서대로 n(n−1)/2개', () => {
    const d = fresh();
    const list = pairList(d.criteria);
    assert.equal(list.length, 21);
    assert.deepEqual([list[0].a.id, list[0].b.id], ['cost', 'weather']);
    assert.deepEqual([list[20].a.id, list[20].b.id], ['safety', 'hygiene']);
  });
  test('슬라이더 값으로 나머지 채우기 (F6-4): 이미 비교한 쌍은 그대로, 다 채우면 완료', () => {
    const d = fresh();
    setRawWeight(d, 'm1', 'safety', 10);
    setRawWeight(d, 'm1', 'distance', 2);
    setWeightMode(d, 'm1', 'ahp');
    setPairJudgment(d, 'm1', 'safety', 'cost', 4); // 비용이 5배 (일부러 단순 값과 반대)
    fillRemainingPairs(d, 'm1');
    const w = d.weights.m1;
    assert.equal(sliderValueOf(w, 'safety', 'cost'), 4, '직접 비교한 값 유지');
    assert.equal(sliderValueOf(w, 'safety', 'distance'), -4, '10/2 = 5배 → 왼쪽 5배');
    assert.equal(memberStatus(d.criteria, w), 'done');
  });
  test('모순되는 비교를 찾아 id로 알려 주고, 제안대로 바꾸면 CR이 내려간다', () => {
    const d = fresh();
    for (const c of d.criteria) setRawWeight(d, 'm1', c.id, { cost: 9, weather: 7, distance: 3, food: 5, photo: 4, safety: 10, hygiene: 6 }[c.id]);
    setWeightMode(d, 'm1', 'ahp');
    fillRemainingPairs(d, 'm1');
    setPairJudgment(d, 'm1', 'safety', 'distance', 8); // 거리가 9배라는 모순된 판단
    const before = memberWeights(d.criteria, d.weights.m1);
    assert.ok(before.cr >= 0.1, `CR ${before.cr}`);
    assert.deepEqual([before.inconsistent.a, before.inconsistent.b].sort(), ['distance', 'safety']);
    applySuggestion(d, 'm1');
    const after = memberWeights(d.criteria, d.weights.m1);
    close(after.cr, before.inconsistent.crAfter, 1e-9);
    assert.ok(after.cr < 0.1);
  });
  test('기준을 추가하면 새 쌍은 비교 전 상태(같음)로 시작', () => {
    const d = fresh();
    setWeightMode(d, 'm1', 'ahp');
    fillRemainingPairs(d, 'm1');
    const { id } = addCriterion(d, '대중교통');
    const r = memberWeights(d.criteria, d.weights.m1);
    assert.equal(r.total, 28);
    assert.equal(r.judged, 21);
    assert.equal(sliderValueOf(d.weights.m1, 'cost', id), 0);
  });
});

describe('그룹 가중치 (F8-4)', () => {
  test('모두 AHP면 AIJ, 그룹 CR도 계산', () => {
    const d = fresh();
    const b = addMember(d, '배우자').id;
    for (const m of ['m1', b]) setWeightMode(d, m, 'ahp');
    setPairJudgment(d, 'm1', 'cost', 'weather', -3); // 비용 4배
    setPairJudgment(d, b, 'cost', 'weather', 3); // 날씨 4배
    const g = groupWeights(d);
    assert.equal(g.method, 'aij');
    const [ci, wi] = [ids(d).indexOf('cost'), ids(d).indexOf('weather')];
    close(g.vector[ci], g.vector[wi]); // 반대 판단은 상쇄
    assert.ok(g.cr != null);
  });
  test('단순 모드가 섞이면 가중치 산술평균, CR 없음', () => {
    const d = fresh();
    const b = addMember(d, '배우자').id;
    setWeightMode(d, 'm1', 'ahp');
    const g = groupWeights(d);
    assert.equal(g.method, 'mean');
    assert.equal(g.cr, null);
    close(g.vector.reduce((x, y) => x + y), 1);
    assert.equal(g.members.length, 2);
    assert.equal(g.members[1].id, b);
  });
  test('영향력(발언권) 비중을 반영', () => {
    const d = fresh();
    const b = addMember(d, '배우자').id;
    setRawWeight(d, 'm1', 'cost', 10);
    d.members.find((m) => m.id === b).influence = 0;
    const g = groupWeights(d);
    const solo = memberWeights(d.criteria, d.weights.m1).vector;
    g.vector.forEach((v, i) => close(v, solo[i]));
  });
});

describe('기준 색 톤 (DESIGN 3장: 가중치 큰 순서로 k1~k7)', () => {
  test('가장 큰 가중치가 k1, 8번째부터는 k7', () => {
    const tones = criterionTones([0.1, 0.3, 0.05, 0.2, 0.02, 0.03, 0.15, 0.1, 0.05]);
    assert.equal(tones[1], 1);
    assert.equal(tones[3], 2);
    assert.equal(tones[6], 3);
    assert.ok(tones.every((t) => t >= 1 && t <= 7));
    assert.equal(tones[4], 7);
  });
  test('같은 가중치는 같은 톤', () => {
    assert.deepEqual(criterionTones([0.25, 0.25, 0.5]), [2, 2, 1]);
    assert.deepEqual(criterionTones([1 / 7, 1 / 7, 1 / 7]), [1, 1, 1]);
  });
});
