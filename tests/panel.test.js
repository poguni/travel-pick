// AI 최종 심사 — PRD F11, 5.4, 10장. Implementation Plan Phase 11
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../js/core/schema.js';
import { addCandidate, addMember } from '../js/core/project.js';
import { setScore } from '../js/core/scores.js';
import { RESEARCH_ITEMS } from '../js/core/research.js';
import { DEPTHS, panelKey, memberLabel, sanitizeOpinion, sanitizeResponses, sanitizeVerdict, saveRound, startPanel, toggleCheck, choose, markExported, panelView } from '../js/core/panel.js';
import { removeCandidate } from '../js/core/project.js';
import { stepsDone } from '../js/selectors.js';
import { panelContext, r1Messages, r2Messages, r3Messages, opinionSchema, responsesSchema, verdictSchema } from '../js/ai/prompts.js';
import { resultsFor, groupWeights, memberTopPicks } from '../js/selectors.js';
import { validate } from '../js/ai/json.js';

function project() {
  const d = createProject({ id: 'p', name: '가족여행' });
  addMember(d, '배우자');
  addCandidate(d, { name: '오키나와', country: '일본', code: 'OKA' });
  addCandidate(d, { name: '타이베이', country: '대만', code: 'TPE' });
  addCandidate(d, { name: '다낭', country: '베트남', code: 'DAD' });
  d.criteria.forEach((k) => {
    setScore(d, d.candidates[0].id, k.id, 8);
    setScore(d, d.candidates[1].id, k.id, 6);
    setScore(d, d.candidates[2].id, k.id, 5);
  });
  return d;
}

function context(d, anonymize = true) {
  const r = resultsFor(d);
  const label = memberLabel(d.members, anonymize);
  return panelContext(d, {
    criteria: d.criteria,
    vector: groupWeights(d).vector,
    totals: r.totals,
    ranking: r.ranking,
    nearTie: r.nearTie,
    picks: memberTopPicks(d).members.map((p) => ({ label: label(d.members.find((m) => m.id === p.id)), top: p.top })),
    itemDefs: RESEARCH_ITEMS.overseas,
  });
}

describe('심사 입력 (F11-1, 10장)', () => {
  test('후보 짧은 키, 계산 순위, 점수표, 가중치가 들어간다', () => {
    const d = project();
    const c = context(d);
    assert.equal(c.candMap.c1, d.candidates[0].id);
    assert.equal(c.keyOf[d.candidates[2].id], 'c3');
    assert.match(c.text, /c1: 오키나와 \(일본, OKA\) · 계산 80\.0점 \(1위\)/);
    assert.match(c.text, /계산 결과 \(가중합\): 1위 c1 오키나와 80\.0/);
    assert.match(c.text, /비용 14%/);
    assert.match(c.text, /c2 타이베이: 비용 6/);
  });
  test('구성원 N 옵션: 동행인 이름을 보내지 않는다', () => {
    const d = project();
    const anon = context(d, true).text;
    assert.match(anon, /구성원 1: c1 오키나와/);
    assert.match(anon, /구성원 2:/);
    assert.ok(!anon.includes('배우자'));
    assert.match(context(d, false).text, /배우자: c1/);
  });
  test('깊이별 라운드: 빠르게 R1+R3(4회) / 꼼꼼하게 R1+R2+R3(7회)', () => {
    assert.deepEqual(DEPTHS.fast.rounds, ['r1', 'r3']);
    assert.deepEqual(DEPTHS.thorough.rounds, ['r1', 'r2', 'r3']);
  });
});

describe('라운드 프롬프트 (F11-2~5, 5.4)', () => {
  test('R1은 다른 의견 없이, 계산 순위를 그대로 따르지 말라고 지시한다', () => {
    const m = r1Messages(context(project()), { today: '2026-10-14' });
    assert.match(m[0].content, /계산된 순위를 그대로 따르지 말고/);
    assert.ok(!m[1].content.includes('1라운드 의견'));
  });
  test('R2는 자기 의견을 빼고 다른 모델의 의견만 넣는다', () => {
    const d = project();
    const c = context(d);
    const ops = [
      { model: 'claude', first: d.candidates[0].id, second: d.candidates[1].id, reason: 'C이유', concerns: 'C우려' },
      { model: 'gemini', first: d.candidates[1].id, second: null, reason: 'G이유', concerns: '' },
    ];
    const m = r2Messages(c, 'claude', ops, { today: '2026-10-14' });
    assert.ok(!m[1].content.includes('C이유'));
    assert.match(m[1].content, /gemini: \[Gemini\] 1위 c2 · 이유: G이유/);
    assert.match(m[0].content, /target은 그 심사위원 키\(gemini\)/);
  });
  test('R3는 계산 1위 키를 주고, 다르면 이유를 반드시 쓰게 한다', () => {
    const d = project();
    const c = context(d);
    const m = r3Messages(c, [{ model: 'gpt', first: d.candidates[1].id, second: null, reason: 'r', concerns: '' }], [{ from: 'gpt', target: 'claude', stance: 'rebut', text: '반박 내용' }], { today: '2026-10-14', calcLeaderKey: 'c1' });
    assert.match(m[0].content, /계산 1위\(c1\)/);
    assert.match(m[0].content, /reasonIfDifferent에 이유를 2문장 이내로 반드시/);
    assert.match(m[1].content, /GPT → Claude \(반박\): 반박 내용/);
  });
  test('예시 응답이 세 스키마를 통과한다', () => {
    assert.deepEqual(validate({ first: 'c1', second: null, reason: 'r', concerns: 'c' }, opinionSchema().schema), []);
    assert.deepEqual(validate({ responses: [{ target: 'gpt', stance: 'agree', text: 't' }] }, responsesSchema().schema), []);
    const v = { markdown: 'm', summary: { chosen: 'c1', consensus: 3, matchesCalculation: true, agreements: [], openIssues: [], checklist: ['a'], reasonIfDifferent: null } };
    assert.deepEqual(validate(v, verdictSchema().schema), []);
    assert.ok(validate({ responses: [{ target: 'x', stance: 'agree', text: 't' }] }, responsesSchema().schema).length > 0);
  });
});

describe('응답 다듬기', () => {
  const map = { c1: 'A', c2: 'B' };
  test('R1: 모르는 키는 버리고, 2위가 1위와 같으면 없앤다', () => {
    assert.equal(sanitizeOpinion({ first: 'c9' }, map), null);
    assert.deepEqual(sanitizeOpinion({ first: 'c1', second: 'c1', reason: ' r ', concerns: 'c' }, map), { first: 'A', second: null, reason: 'r', concerns: 'c' });
  });
  test('R2: 자기 자신·모르는 모델·잘못된 태그는 버린다', () => {
    const r = sanitizeResponses({ responses: [{ target: 'claude', stance: 'agree', text: 'x' }, { target: 'gpt', stance: 'rebut', text: '반박' }, { target: 'gemini', stance: 'love', text: 'x' }, { target: 'gemini', stance: 'agree', text: ' ' }] }, 'claude', ['claude', 'gpt', 'gemini']);
    assert.deepEqual(r, [{ target: 'gpt', stance: 'rebut', text: '반박' }]);
  });
  test('R3: 합의 수는 0~심사위원 수로 자른다', () => {
    const v = sanitizeVerdict({ markdown: '**결론**', summary: { chosen: 'c2', consensus: 7, agreements: ['a', ''], openIssues: [], checklist: ['x'], reasonIfDifferent: ' 이유 ' } }, map, 3);
    assert.equal(v.chosen, 'B');
    assert.equal(v.consensus, 3);
    assert.deepEqual(v.agreements, ['a']);
    assert.equal(v.reasonIfDifferent, '이유');
    assert.equal(sanitizeVerdict({ summary: { chosen: 'zz' } }, map, 3), null);
  });
});

describe('기록과 화면 정리 (F11-4·5)', () => {
  function run(chosenKey) {
    const d = project();
    const c = context(d);
    startPanel(d, { depth: 'fast', anonymized: true, chair: 'claude', key: panelKey(d, resultsFor(d).totals), at: 't0' });
    const op = (model, first) => ({ model, ok: true, value: { first, second: 'c2', reason: 'r', concerns: 'c' }, usd: 0.01 });
    saveRound(d, 'r1', [op('claude', 'c1'), op('gpt', 'c1'), { model: 'gemini', ok: false, error: { kind: 'timeout' }, raw: null }], (v) => sanitizeOpinion(v, c.candMap), { at: 't1' });
    const verdict = { markdown: 'm', summary: { chosen: chosenKey, consensus: null, agreements: ['a'], openIssues: ['o'], checklist: ['항공권 검색', '숙소 취소 기한'], reasonIfDifferent: chosenKey === 'c1' ? null : '아이 동반에 더 맞음' } };
    saveRound(d, 'r3', [{ model: 'claude', ok: true, value: verdict, usd: 0.02 }], (v) => sanitizeVerdict(v, c.candMap, 3), { at: 't2' });
    return d;
  }
  test('계산 결과와 일치: 앱이 계산 1위와 직접 비교한다', () => {
    const d = run('c1');
    const v = panelView(d.panel, resultsFor(d).ranking[0].id);
    assert.equal(v.opinions.length, 2, '실패한 모델은 빠진다');
    assert.equal(d.panel.rounds.r1.gemini.status, 'failed');
    assert.equal(v.verdict.matchesCalculation, true);
    assert.equal(v.verdict.consensus, 2, 'AI가 합의 수를 안 주면 R1에서 같은 1위를 고른 수');
  });
  test('계산 결과와 다름: 이유를 함께 보여 줄 수 있다', () => {
    const d = run('c2');
    const v = panelView(d.panel, resultsFor(d).ranking[0].id);
    assert.equal(v.verdict.matchesCalculation, false);
    assert.equal(v.verdict.reasonIfDifferent, '아이 동반에 더 맞음');
    assert.equal(v.verdict.chosen, d.candidates[1].id);
  });
  test('쓸 수 없는 응답은 invalid_json 실패, 건너뛴 호출은 skipped', () => {
    const d = run('c1');
    saveRound(d, 'r2', [{ model: 'gpt', ok: true, value: { nope: 1 } }, { model: 'gemini', ok: false, error: { kind: 'skipped' } }], () => null, { at: 't' });
    assert.equal(d.panel.rounds.r2.gpt.error, 'invalid_json');
    assert.equal(d.panel.rounds.r2.gemini.status, 'skipped');
  });
  test('체크리스트·최종 선택 저장, 점수가 바뀌면 키가 달라진다', () => {
    const d = run('c1');
    toggleCheck(d, 1, true);
    assert.equal(d.panel.checks[1], true);
    assert.ok(!d.panel.checks[0]);
    assert.equal(choose(d, d.candidates[1].id).ok, true);
    assert.equal(d.decision.chosen, d.candidates[1].id);
    assert.equal(choose(d, 'nope').ok, false);
    const before = d.panel.key;
    setScore(d, d.candidates[2].id, 'cost', 10);
    assert.notEqual(panelKey(d, resultsFor(d).totals), before);
  });
  test('내보내면 ⑧ 완료, 결정을 바꾸거나 고른 후보를 지우면 다시 미완료', () => {
    const d = run('c1');
    const [a, b] = d.candidates.map((c) => c.id);
    choose(d, a);
    assert.equal(stepsDone(d).export, false, '결정만으로는 내보내기 미완료');
    markExported(d, { at: '2026-10-17T00:00:00Z' });
    assert.equal(stepsDone(d).export, true);
    choose(d, a);
    assert.equal(stepsDone(d).export, true, '같은 후보를 다시 고르면 그대로');
    choose(d, b);
    assert.equal(stepsDone(d).export, false, '다른 후보로 바꾸면 리포트를 다시 내보내야 한다');
    markExported(d, { at: 't' });
    removeCandidate(d, b);
    assert.deepEqual([d.decision.chosen, stepsDone(d).export], [null, false]);
  });
});
