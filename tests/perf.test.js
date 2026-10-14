// 성능 — PRD 10장 "AI 호출 외 모든 계산은 100ms 이내". 가장 큰 경우(후보 8 × 기준 9 × 동행인 4명 AHP)로 잰다.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../js/core/schema.js';
import { addCandidate, addMember, saveRecommendResults, recommendKey } from '../js/core/project.js';
import { addCriterion, setWeightMode, setPairJudgment } from '../js/core/weights.js';
import { setScore, saveScoreDraft } from '../js/core/scores.js';
import { saveResearchResults, researchKey, RESEARCH_ITEMS } from '../js/core/research.js';
import { resultsFor, groupWeights, closestSensitivity, consensusSummary, stepsDone, memberTopPicks, researchCards, recommendView } from '../js/selectors.js';
import { workbookSheets } from '../js/export/excel.js';
import { buildReport } from '../js/export/report.js';
import { pairList } from '../js/selectors.js';

function biggest() {
  const d = createProject({ id: 'p', name: '최대' });
  ['A', 'B', 'C'].forEach((n) => addMember(d, n));
  addCriterion(d, '교통');
  addCriterion(d, '축제');
  for (let i = 0; i < 8; i++) addCandidate(d, { name: `후보${i}`, country: '일본', code: `A${String.fromCharCode(65 + i)}A` });
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const m of d.members) {
    setWeightMode(d, m.id, 'ahp');
    for (const p of pairList(d.criteria)) setPairJudgment(d, m.id, p.a.id ?? p.a, p.b.id ?? p.b, Math.round(rnd() * 16 - 8));
  }
  d.candidates.forEach((c) => d.criteria.forEach((k) => setScore(d, c.id, k.id, 1 + Math.floor(rnd() * 10))));
  const items = Object.fromEntries(RESEARCH_ITEMS.overseas.map((def) => [def.id, { value: 'v', sources: ['https://x.com'], numeric: def.numeric ? { min: 100 * rnd(), max: 200 } : undefined }]));
  const res = [];
  for (const c of d.candidates) for (const model of ['claude', 'gpt', 'gemini']) res.push({ model, ok: true, meta: { candidateId: c.id }, value: { items }, citations: [] });
  saveResearchResults(d, res, { keys: Object.fromEntries(d.candidates.map((c) => [c.id, researchKey(d.project, c)])), at: 't' });
  const map = { c: Object.fromEntries(d.candidates.map((c, i) => [`c${i + 1}`, c.id])), k: Object.fromEntries(d.criteria.map((k, j) => [`k${j + 1}`, k.id])) };
  const scores = Object.keys(map.c).flatMap((c) => Object.keys(map.k).map((k) => ({ c, k, score: 1 + Math.floor(rnd() * 10), rationale: 'r' })));
  saveScoreDraft(d, ['claude', 'gpt', 'gemini'].map((model) => ({ model, ok: true, value: { scores } })), { key: 'k', at: 't', map });
  const dest = Array.from({ length: 8 }, (_, i) => ({ name: `추천${i}`, country: '일본' }));
  saveRecommendResults(d, ['claude', 'gpt', 'gemini'].map((model) => ({ model, ok: true, value: { destinations: dest } })), { key: recommendKey(d.project), at: 't' });
  return d;
}

/** 여러 번 재서 가장 빠른 값(첫 실행의 JIT 준비 시간 제외) */
function timeOf(fn, runs = 5) {
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    best = Math.min(best, performance.now() - t);
  }
  return best;
}

describe('계산 100ms 이내 (PRD 10장)', () => {
  const d = biggest();
  test('데이터가 실제로 최대 크기다', () => {
    assert.equal(d.candidates.length, 8);
    assert.equal(d.criteria.length, 9);
    assert.equal(d.members.length, 4);
    assert.equal(groupWeights(d).method, 'aij');
  });
  const cases = {
    '결과(가중합·순위)': () => resultsFor(d),
    '그룹 가중치(AIJ·CR)': () => groupWeights(d),
    '민감도(기준 9개 전부)': () => closestSensitivity(d),
    '동행인별 1위': () => memberTopPicks(d),
    '합의 수준': () => consensusSummary(d),
    '단계 완료 판정': () => stepsDone(d),
    '자료 카드(후보 8곳)': () => d.candidates.map((c) => researchCards(d, c)),
    '추천 합치기': () => recommendView(d),
    'Excel 시트 만들기': () => workbookSheets(d),
    '리포트 데이터': () => buildReport(d),
  };
  for (const [name, fn] of Object.entries(cases)) {
    test(name, () => {
      const ms = timeOf(fn);
      assert.ok(ms < 100, `${name}: ${ms.toFixed(1)}ms`);
    });
  }
});
