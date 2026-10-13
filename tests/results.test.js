// 점수·결과·단계 판정 — PRD F7-1, F8-5, F9, 6.5
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../js/core/schema.js';
import { addCandidate, addMember } from '../js/core/project.js';
import { setRawWeight, removeCriterion } from '../js/core/weights.js';
import { setScore, fillEmptyScores } from '../js/core/scores.js';
import { scoreMatrix, resultsFor, memberTopPicks, sensitivityFor, closestSensitivity, candidateStatus, stepsDone, scoreProgress } from '../js/selectors.js';
import { josa, josaRo } from '../js/ui/format.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `기대 ${b}, 실제 ${a}`);

/** 기준 2개(비용·안전)만 남긴 국내 프로젝트 + 후보 A, B */
function twoByTwo() {
  const d = createProject({ id: 'p', tripType: 'domestic' });
  for (const c of [...d.criteria]) if (!['cost', 'safety'].includes(c.id)) removeCriterion(d, c.id);
  const a = addCandidate(d, { name: '강릉' }).id;
  const b = addCandidate(d, { name: '경주' }).id;
  return { d, a, b };
}

describe('점수 입력 (F7-1)', () => {
  test('1~10 정수로 정리, 비우면 지운다', () => {
    const { d, a } = twoByTwo();
    setScore(d, a, 'cost', 7.6);
    assert.equal(d.scores[a].cost.final, 8);
    setScore(d, a, 'cost', 0);
    assert.equal(d.scores[a].cost.final, 1);
    setScore(d, a, 'cost', 99);
    assert.equal(d.scores[a].cost.final, 10);
    setScore(d, a, 'cost', '');
    assert.equal(d.scores[a].cost?.final, undefined);
  });
  test('AI 점수 등 다른 필드는 지우지 않는다', () => {
    const { d, a } = twoByTwo();
    d.scores[a] = { cost: { final: 5, ai: { claude: 7 } } };
    setScore(d, a, 'cost', '');
    assert.deepEqual(d.scores[a].cost, { ai: { claude: 7 } });
  });
  test('점수 행렬·진행률·빈 칸 채우기', () => {
    const { d, a, b } = twoByTwo();
    setScore(d, a, 'cost', 6);
    assert.deepEqual(scoreMatrix(d), [[6, null], [null, null]]);
    assert.deepEqual(scoreProgress(d), { filled: 1, total: 4 });
    fillEmptyScores(d, 5);
    assert.deepEqual(scoreMatrix(d), [[6, 5], [5, 5]]);
    assert.equal(d.scores[b].safety.final, 5);
  });
});

describe('결과 (F9-1, F9-3, F9-5)', () => {
  const setup = () => {
    const { d, a, b } = twoByTwo();
    setRawWeight(d, 'm1', 'cost', 6);
    setRawWeight(d, 'm1', 'safety', 4); // 비용 60%, 안전 40%
    setScore(d, a, 'cost', 10);
    setScore(d, a, 'safety', 2);
    setScore(d, b, 'cost', 4);
    setScore(d, b, 'safety', 8);
    return { d, a, b };
  };
  test('그룹 기준 점수·순위·기여도', () => {
    const { d, a, b } = setup();
    const r = resultsFor(d);
    close(r.totals[0], 68);
    close(r.totals[1], 56);
    assert.deepEqual(r.ranking.map((x) => x.id), [a, b]);
    close(r.contributions[0][0], 60); // 0.6 × 10 × 10
    close(r.contributions[0][1], 8);
    assert.equal(r.nearTie, false);
    assert.deepEqual(r.incomplete, []);
  });
  test('점수가 빈 후보는 순위에서 빼고 따로 알려 준다', () => {
    const { d, a, b } = setup();
    setScore(d, b, 'safety', '');
    const r = resultsFor(d);
    assert.deepEqual(r.ranking.map((x) => x.id), [a]);
    assert.deepEqual(r.incomplete, [b]);
  });
  test('동행인별 결과와 사실상 동점', () => {
    const { d, a, b } = setup();
    const m2 = addMember(d, '배우자').id;
    setRawWeight(d, m2, 'cost', 4);
    setRawWeight(d, m2, 'safety', 6); // A = 52, B = 64
    const r2 = resultsFor(d, m2);
    assert.deepEqual(r2.ranking.map((x) => x.id), [b, a]);
    // 그룹(평균 50:50): A 60, B 60 → 동점
    const g = resultsFor(d);
    assert.equal(g.nearTie, true);
  });
  test('후보 상태: 1위 유력, 5점 이내 경합, 그 밖 검토', () => {
    assert.equal(candidateStatus(1, 0), 'lead');
    assert.equal(candidateStatus(2, 4.9), 'contend');
    assert.equal(candidateStatus(3, 8), 'review');
  });
});

describe('탑승객별 1위 (F8-5)', () => {
  test('각자의 1위와 그룹과 차이가 가장 큰 사람', () => {
    const d = createProject({ id: 'p', tripType: 'domestic' });
    for (const c of [...d.criteria]) if (!['cost', 'safety'].includes(c.id)) removeCriterion(d, c.id);
    const a = addCandidate(d, { name: '강릉' }).id;
    const b = addCandidate(d, { name: '경주' }).id;
    const m2 = addMember(d, '배우자').id;
    const m3 = addMember(d, '첫째').id;
    setScore(d, a, 'cost', 10);
    setScore(d, a, 'safety', 4);
    setScore(d, b, 'cost', 4);
    setScore(d, b, 'safety', 9);
    setRawWeight(d, 'm1', 'cost', 9);
    setRawWeight(d, 'm1', 'safety', 1);
    setRawWeight(d, m2, 'cost', 8);
    setRawWeight(d, m2, 'safety', 2);
    setRawWeight(d, m3, 'cost', 0);
    setRawWeight(d, m3, 'safety', 10);
    const picks = memberTopPicks(d);
    assert.equal(picks.group, a);
    assert.deepEqual(picks.members.map((m) => m.top), [a, a, b]);
    assert.equal(picks.mostDifferent, m3);
  });
  test('모두 그룹과 같으면 표시하지 않는다', () => {
    const { d } = twoByTwo();
    setScore(d, d.candidates[0].id, 'cost', 9);
    setScore(d, d.candidates[0].id, 'safety', 9);
    setScore(d, d.candidates[1].id, 'cost', 1);
    setScore(d, d.candidates[1].id, 'safety', 1);
    addMember(d, '배우자');
    assert.equal(memberTopPicks(d).mostDifferent, null);
  });
});

describe('민감도 (F9-4, 6.5)', () => {
  test('그룹 가중치로 역전 지점, 가장 가까운 기준 고르기', () => {
    const { d, a, b } = twoByTwo();
    setRawWeight(d, 'm1', 'cost', 6);
    setRawWeight(d, 'm1', 'safety', 4);
    setScore(d, a, 'cost', 10);
    setScore(d, a, 'safety', 2);
    setScore(d, b, 'cost', 4);
    setScore(d, b, 'safety', 8);
    const s = sensitivityFor(d, 0); // 비용
    close(s.down.at, 0.5);
    assert.equal(s.down.leaderId, b);
    const best = closestSensitivity(d);
    assert.equal(best.criterionIndex, 0);
    close(best.distance, 0.1);
  });
  test('순위를 매길 후보가 2곳 미만이면 null', () => {
    const { d, a } = twoByTwo();
    setScore(d, a, 'cost', 5);
    setScore(d, a, 'safety', 5);
    assert.equal(sensitivityFor(d, 0), null);
  });
});

describe('단계 완료 판정 (RouteNav)', () => {
  test('조건 → 후보 2곳 → 가중치 → 점수', () => {
    const { d, a, b } = twoByTwo();
    let s = stepsDone(d);
    assert.equal(s.conditions, true, '후보가 있으면 조건은 지난 단계');
    assert.equal(s.candidates, true);
    assert.equal(s.weights, false);
    setRawWeight(d, 'm1', 'cost', 7);
    assert.equal(stepsDone(d).weights, true);
    assert.equal(stepsDone(d).scores, false);
    for (const c of [a, b]) for (const k of ['cost', 'safety']) setScore(d, c, k, 5);
    s = stepsDone(d);
    assert.equal(s.scores, true);
    assert.equal(s.results, true);
    assert.equal(s.research, false);
  });
  test('빈 새 프로젝트는 아무 단계도 끝나지 않았다', () => {
    const s = stepsDone(createProject());
    assert.ok(Object.values(s).every((v) => v === false));
  });
});

describe('조사 고르기 (화면 문장)', () => {
  test('받침 유무로 이/가, 와/과, 을/를', () => {
    assert.equal(josa('오키나와', '이', '가'), '오키나와가');
    assert.equal(josa('강릉', '이', '가'), '강릉이');
    assert.equal(josa('경주', '과', '와'), '경주와');
    assert.equal(josa('강릉', '과', '와'), '강릉과');
    assert.equal(josa('제주도', '을', '를'), '제주도를');
    assert.equal(josa('비용', '을', '를'), '비용을');
    assert.equal(josa('OKA', '이', '가'), 'OKA가', '한글이 아니면 받침 없는 쪽');
  });
  test('로/으로: ㄹ 받침은 로', () => {
    assert.equal(josaRo('타이베이'), '타이베이로');
    assert.equal(josaRo('강릉'), '강릉으로');
    assert.equal(josaRo('서울'), '서울로');
    assert.equal(josaRo('다낭'), '다낭으로');
  });
});
