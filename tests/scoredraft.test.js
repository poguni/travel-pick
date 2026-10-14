// AI 점수 초안·합의 수준·Excel 내보내기 — PRD F7-2~4, F10-3, F13-3·7. Implementation Plan Phase 10
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { createProject, criterionInfo } from '../js/core/schema.js';
import { addCandidate, addMember, saveRecommendResults, recommendKey } from '../js/core/project.js';
import { setScore, saveScoreDraft, applyDraft, draftOverwrites, draftValue, cellStats, scoreDraftKey, SD_WARN } from '../js/core/scores.js';
import { RESEARCH_ITEMS, saveResearchResults, researchKey, setConfirmed, researchBasis } from '../js/core/research.js';
import { scoreRequest, evidenceLines } from '../js/ai/prompts.js';
import { validate } from '../js/ai/json.js';
import { consensusSummary } from '../js/selectors.js';
import { workbookSheets, toWorkbook } from '../js/export/excel.js';
import { exportFileName } from '../js/ui/download.js';

function project() {
  const d = createProject({ id: 'p', name: '설 연휴 가족여행' });
  addCandidate(d, { name: '오키나와', country: '일본', code: 'OKA', plannedPeriod: 'month:2' });
  addCandidate(d, { name: '타이베이', country: '대만', code: 'TPE' });
  return d;
}

const map = (d) => ({ c: { c1: d.candidates[0].id, c2: d.candidates[1].id }, k: Object.fromEntries(d.criteria.map((k, j) => [`k${j + 1}`, k.id])) });
const draft = (model, rows) => ({ model, ok: true, value: { scores: rows.map(([c, k, score, rationale = '근거']) => ({ c, k, score, rationale })) }, usd: 0.01 });

describe('점수 초안 기록 (F7-2)', () => {
  test('짧은 키를 실제 id로 되돌리고, 최종 점수는 건드리지 않는다', () => {
    const d = project();
    const [a, b] = d.candidates;
    setScore(d, a.id, 'cost', 4);
    saveScoreDraft(d, [draft('claude', [['c1', 'k1', 8, '저렴'], ['c2', 'k1', 6], ['c9', 'k1', 5], ['c1', 'k99', 5], ['c1', 'k2', 11.4]])], { key: scoreDraftKey(d), at: 't', map: map(d) });
    assert.equal(d.scores[a.id].cost.ai.claude, 8);
    assert.equal(d.scores[a.id].cost.rationale.claude, '저렴');
    assert.equal(d.scores[a.id].cost.final, 4, '사용자가 확정한 점수는 그대로');
    assert.equal(d.scores[b.id].cost.ai.claude, 6);
    assert.equal(d.scores[a.id].weather.ai.claude, 10, '범위를 넘으면 1~10으로');
    assert.equal(d.scoreDraft.byModel.claude.count, 3, '모르는 키는 버린다');
  });
  test('다시 실행하면 그 모델의 이전 점수를 지우고, 실패는 상태만 남긴다', () => {
    const d = project();
    const a = d.candidates[0];
    saveScoreDraft(d, [draft('claude', [['c1', 'k1', 8], ['c1', 'k2', 7]]), draft('gpt', [['c1', 'k1', 5]])], { key: 'k', at: 't1', map: map(d) });
    saveScoreDraft(d, [draft('claude', [['c1', 'k1', 6]]), { model: 'gemini', ok: false, error: { kind: 'timeout' }, raw: null }], { key: 'k', at: 't2', map: map(d) });
    assert.equal(d.scores[a.id].cost.ai.claude, 6);
    assert.equal(d.scores[a.id].weather.ai?.claude, undefined, '이전 실행의 칸은 지워진다');
    assert.equal(d.scores[a.id].cost.ai.gpt, 5, '다른 모델은 그대로');
    assert.equal(d.scoreDraft.byModel.gemini.status, 'failed');
  });
});

describe('셀 통계와 적용 (F7-3·4)', () => {
  test('평균·표준편차, 2 이상이면 강조 대상', () => {
    const st = cellStats({ ai: { claude: 9, gpt: 5, gemini: 4 } });
    assert.equal(st.count, 3);
    assert.equal(st.mean, 6);
    assert.ok(st.sd >= SD_WARN);
    assert.equal(cellStats(undefined).count, 0);
  });
  test('AI 평균 적용·특정 모델 적용·칸 하나만 적용, 덮어쓰기 칸 수', () => {
    const d = project();
    const [a, b] = d.candidates;
    saveScoreDraft(d, [draft('claude', [['c1', 'k1', 8], ['c2', 'k1', 3]]), draft('gpt', [['c1', 'k1', 7], ['c2', 'k1', 4]])], { key: 'k', at: 't', map: map(d) });
    setScore(d, a.id, 'cost', 2);
    assert.equal(draftValue(d.scores[a.id].cost, 'avg'), 8, '7.5는 반올림');
    assert.equal(draftOverwrites(d, 'avg'), 1);
    assert.equal(applyDraft(d, 'avg').changed, 2);
    assert.equal(d.scores[a.id].cost.final, 8);
    assert.equal(d.scores[b.id].cost.final, 4);
    applyDraft(d, 'gpt', { candidateId: a.id, criterionId: 'cost' });
    assert.equal(d.scores[a.id].cost.final, 7);
    assert.equal(d.scores[b.id].cost.final, 4, '다른 칸은 그대로');
    assert.equal(applyDraft(d, 'gemini').changed, 0, '점수가 없는 모델은 바꾸지 않는다');
  });
});

describe('점수 초안 프롬프트 (F7-2, 5.4)', () => {
  test('확정값을 우선 근거로, 확정값이 있으면 AI 조사 값은 뺀다', () => {
    const d = project();
    const a = d.candidates[0];
    saveResearchResults(d, [{ model: 'claude', ok: true, meta: { candidateId: a.id }, value: { items: { flightPrice: { value: '왕복 50만 원', sources: ['https://x.com'] }, weather: { value: '맑음', sources: ['https://x.com'] } } }, citations: [] }], { keys: { [a.id]: researchKey(d.project, a) }, at: 't' });
    setConfirmed(d, a.id, 'flightPrice', '왕복 40만 원');
    const lines = evidenceLines(d.research[a.id], RESEARCH_ITEMS.overseas).join('\n');
    assert.match(lines, /항공권: \[확정\] 왕복 40만 원/);
    assert.ok(!lines.includes('50만'));
    assert.match(lines, /날씨: \[AI 조사\] 맑음/);
  });
  test('후보·기준 짧은 키 지도, 조사 없는 후보 표시, 스키마 통과', () => {
    const d = project();
    const criteria = d.criteria.map((k) => ({ ...k, info: criterionInfo(k, 'overseas') }));
    const { request, map: m } = scoreRequest(d, { models: ['claude', 'gpt'], today: '2026-10-14', criteria, itemDefs: RESEARCH_ITEMS.overseas, basisOf: (c) => String(researchBasis(d.project, c).period?.month ?? '미정') });
    assert.equal(request.feature, 'scores');
    assert.equal(request.calls.length, 2);
    assert.ok(request.calls.every((c) => c.webSearch === false));
    assert.equal(m.c.c2, d.candidates[1].id);
    assert.equal(m.k.k1, 'cost');
    const user = request.calls[0].messages[1].content;
    assert.match(user, /c1: 오키나와 \(일본, OKA\)/);
    assert.match(user, /조사 자료 없음/);
    assert.match(request.calls[0].messages[0].content, /\[확정\] 값은/);
    assert.deepEqual(validate({ scores: [{ c: 'c1', k: 'k1', score: 7, rationale: 'x' }] }, request.calls[0].schema.schema), []);
  });
});

describe('합의 수준 (F10-3)', () => {
  test('데이터가 없으면 모두 null', () => {
    const s = consensusSummary(project());
    assert.equal(s.overall, null);
    assert.equal(s.recommend.level, null);
  });
  test('추천 중복도·수치 차이·점수 표준편차', () => {
    const d = project();
    const [a, b] = d.candidates;
    const rec = (model, names) => ({ model, ok: true, value: { destinations: names.map((name) => ({ name, country: '일본' })) } });
    saveRecommendResults(d, [rec('claude', ['삿포로', '후쿠오카']), rec('gpt', ['삿포로', '나고야'])], { key: recommendKey(d.project), at: 't' });
    const item = (min, max) => ({ value: 'v', sources: ['https://x.com'], numeric: { min, max } });
    const res = (model, c, price) => ({ model, ok: true, meta: { candidateId: c.id }, value: { items: { flightPrice: item(price, price), lodging: item(100, 100) } }, citations: [] });
    const keys = { [a.id]: researchKey(d.project, a), [b.id]: researchKey(d.project, b) };
    saveResearchResults(d, [res('claude', a, 100), res('gpt', a, 200), res('claude', b, 100), res('gpt', b, 105)], { keys, at: 't' });
    saveScoreDraft(d, [draft('claude', [['c1', 'k1', 9], ['c2', 'k1', 5]]), draft('gpt', [['c1', 'k1', 3], ['c2', 'k1', 5]])], { key: 'k', at: 't', map: map(d) });
    const s = consensusSummary(d);
    assert.equal(s.recommend.shared, 1);
    assert.equal(s.recommend.total, 3);
    assert.equal(s.recommend.level, 'mid', '1/3 ≈ 33%');
    assert.equal(s.numeric.compared, 4);
    assert.equal(s.numeric.diverged, 1);
    assert.equal(s.numeric.level, 'mid', '25%');
    assert.equal(s.scores.cells, 2);
    assert.equal(s.scores.highSd, 1);
    assert.equal(s.scores.meanSd, 1.5);
    assert.equal(s.scores.level, 'mid');
    assert.equal(s.overall, 'mid');
  });
});

describe('Excel 내보내기 (F13-3·7)', () => {
  function full() {
    const d = project();
    addMember(d, '배우자');
    const [a, b] = d.candidates;
    d.criteria.forEach((k, j) => {
      setScore(d, a.id, k.id, 8 - (j % 3));
      setScore(d, b.id, k.id, 6);
    });
    saveScoreDraft(d, [draft('claude', [['c1', 'k1', 8, '저렴함']]), draft('gpt', [['c1', 'k1', 6]])], { key: 'k', at: 't', map: map(d) });
    setConfirmed(d, a.id, 'flightPrice', '왕복 40만 원');
    d.aiRuns.push({ id: 'r', feature: 'scores', model: 'claude', modelSlug: 'anthropic/claude-sonnet-5.5', status: 'done', estimate: { inTokens: 100, outTokens: 50, usd: 0.0123 }, actual: { inTokens: 90, outTokens: 40, usd: 0.0101 }, at: '2026-10-14T00:00:00Z' });
    return d;
  }

  test('xlsx로 쓰고 다시 읽으면 시트 6개와 주요 값이 맞다', () => {
    const d = full();
    const buf = XLSX.write(toWorkbook(XLSX, workbookSheets(d, { now: new Date('2026-10-14T09:00:00Z') })), { type: 'buffer', bookType: 'xlsx' });
    const wb = XLSX.read(buf, { type: 'buffer' });
    assert.deepEqual(wb.SheetNames, ['후보', '기준·가중치', '점수표', '결과 순위', '리서치 자료', 'AI 비용 기록']);
    const rows = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });

    const cand = rows('후보');
    assert.deepEqual(cand[0].slice(0, 2), ['프로젝트', '설 연휴 가족여행']);
    const head = cand.findIndex((r) => r[0] === '순번');
    assert.deepEqual(cand[head + 1].slice(0, 7), [1, '오키나와', '일본', 'OKA', '직접 추가', '2월', '미정']);

    const w = rows('기준·가중치');
    assert.deepEqual(w[0].slice(0, 5), ['기준', '설명', '그룹 (%)', '나 (%)', '배우자 (%)']);
    assert.equal(w.length >= 7 + 1 + 1 + 2 + 1, true);
    const sumGroup = w.slice(1, 8).reduce((s, r) => s + r[2], 0);
    assert.ok(Math.abs(sumGroup - 100) < 0.5, '그룹 가중치 합 100%');

    const sc = rows('점수표');
    assert.deepEqual(sc[1].slice(0, 9), ['오키나와', '비용', 8, 8, 6, '', 7, 1, '저렴함']);
    assert.equal(sc.length, 1 + 2 * 7);

    const res = rows('결과 순위');
    assert.deepEqual(res[1].slice(0, 2), [1, '오키나와']);
    assert.equal(res[2][1], '타이베이');

    const rs = rows('리서치 자료');
    assert.deepEqual(rs[1].slice(0, 3), ['오키나와', '항공권', '왕복 40만 원']);

    const cost = rows('AI 비용 기록');
    assert.equal(cost[1][1], '점수 초안');
    assert.equal(cost[1][10], 0.0101);
    assert.equal(cost.at(-1)[0], '합계');
  });

  test('API 키가 들어가지 않는다', () => {
    const d = full();
    const text = JSON.stringify(workbookSheets(d));
    assert.ok(!/sk-or|apikey|api_key/i.test(text));
  });

  test('파일 이름 규칙: TravelPick_<프로젝트명>_<YYYYMMDD>.xlsx', () => {
    assert.equal(exportFileName('설 연휴 가족여행', 'xlsx', new Date(2026, 9, 14)), 'TravelPick_설_연휴_가족여행_20261014.xlsx');
  });
});
