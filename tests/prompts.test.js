// AI 후보 추천 프롬프트·결과 기록 — PRD F2, 5.4. Implementation Plan Phase 8
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../js/core/schema.js';
import { setExclude, recommendKey, saveRecommendResults, addRecommended, updatePeriod, setPeriodMode } from '../js/core/project.js';
import { recommendRequest, recommendSchema, conditionSummary } from '../js/ai/prompts.js';
import { validate } from '../js/ai/json.js';

const fresh = (tripType) => createProject({ id: 'p', tripType });
const props = (project) => Object.keys(recommendSchema(project).schema.properties.destinations.items.properties);

describe('추천 프롬프트 (F2-1, 5.4)', () => {
  test('해외: 공항 코드·국가를 묻고, 국내: 시·도만 묻는다', () => {
    assert.ok(props(fresh('overseas').project).includes('code'));
    assert.ok(props(fresh('overseas').project).includes('country'));
    const d = props(fresh('domestic').project);
    assert.ok(d.includes('region'));
    assert.ok(!d.includes('code') && !d.includes('country'));
  });
  test('시기·기간이 미정일 때만 추천 시기·적정 일정을 묻는다 (F2-7)', () => {
    const d = fresh('overseas');
    assert.ok(props(d.project).includes('recommendedMonth'));
    assert.ok(props(d.project).includes('recommendedNights'));
    setPeriodMode(d, 'month');
    updatePeriod(d, { nights: 4 });
    assert.ok(!props(d.project).includes('recommendedMonth'));
    assert.ok(!props(d.project).includes('recommendedNights'));
    const m = recommendRequest(d.project, { models: ['claude'], today: '2026-10-14' }).calls[0].messages[0].content;
    assert.ok(!m.includes('recommendedMonth'));
  });
  test('조건 요약에 미정·가족 세부 형태·예산이 들어간다', () => {
    const d = fresh('domestic');
    d.project.companion = { type: 'family', familyDetail: 'with_kids' };
    d.project.travelers = 4;
    d.project.budgetPerPerson = 500000;
    const s = conditionSummary(d.project);
    assert.match(s, /국내 여행/);
    assert.match(s, /시기: 미정/);
    assert.match(s, /가족\(아이 동반\), 4명/);
    assert.match(s, /50만 원/);
  });
  test('요청: 모델마다 같은 프롬프트, 웹 검색, 제외 조건 포함', () => {
    const d = fresh('overseas');
    setExclude(d, '  도쿄, 오사카는 가 봄 ');
    const r = recommendRequest(d.project, { models: ['claude', 'gpt', 'gemini'], today: '2026-10-14' });
    assert.equal(r.feature, 'recommend');
    assert.equal(r.calls.length, 3);
    assert.ok(r.calls.every((c) => c.webSearch && c.messages === r.calls[0].messages));
    assert.match(r.calls[0].messages[1].content, /제외 조건: 도쿄, 오사카는 가 봄/);
    assert.match(r.calls[0].messages[0].content, /2026-10-14/);
  });
  test('예시 응답이 스키마 검증을 통과한다', () => {
    const d = fresh('overseas');
    const sample = {
      destinations: [
        { name: '오키나와', nameEn: 'Okinawa', country: '일본', code: 'OKA', travel: '직항 2h 15m', reason: '…', trendEvidence: [], sources: [], tags: ['휴양'], motif: 'sea', recommendedMonth: 2, recommendedSeason: null, periodReason: '…', recommendedNights: 3, overBudgetRisk: false },
      ],
    };
    assert.deepEqual(validate(sample, recommendSchema(d.project).schema), []);
  });
});

describe('추천 캐시 키', () => {
  test('추천에 영향을 주는 조건이 바뀌면 키가 바뀐다', () => {
    const d = fresh('overseas');
    const k = recommendKey(d.project);
    d.project.name = '이름만 변경';
    assert.equal(recommendKey(d.project), k);
    d.project.interests = ['사진'];
    assert.notEqual(recommendKey(d.project), k);
    const k2 = recommendKey(d.project);
    setExclude(d, '도쿄');
    assert.notEqual(recommendKey(d.project), k2);
  });
  test('관심사 순서는 상관없다', () => {
    const a = fresh('overseas');
    const b = fresh('overseas');
    a.project.interests = ['사진', '음식'];
    b.project.interests = ['음식', '사진'];
    assert.equal(recommendKey(a.project), recommendKey(b.project));
  });
});

describe('추천 결과 기록과 담기', () => {
  const ok = (model, names) => ({ model, ok: true, value: { destinations: names.map((name) => ({ name, country: '일본', code: null })) }, citations: [{ url: 'u' }], usd: 0.01 });
  test('새 실행은 덮어쓰고, 실패한 모델만 다시 시도하면 그 모델만 바뀐다', () => {
    const d = fresh('overseas');
    saveRecommendResults(d, [ok('claude', ['삿포로']), { model: 'gpt', ok: false, error: { kind: 'timeout' }, raw: null, usd: null }], { key: 'k', at: 't1' });
    assert.equal(d.recommend.byModel.claude.items[0].name, '삿포로');
    assert.equal(d.recommend.byModel.gpt.status, 'failed');
    saveRecommendResults(d, [ok('gpt', ['후쿠오카'])], { key: 'k', at: 't2' });
    assert.equal(d.recommend.byModel.claude.items[0].name, '삿포로', '다른 모델은 그대로');
    assert.equal(d.recommend.byModel.gpt.items[0].name, '후쿠오카');
    saveRecommendResults(d, [ok('gpt', ['나하'])], { key: 'k2', at: 't3' });
    assert.deepEqual(Object.keys(d.recommend.byModel), ['gpt'], '조건이 바뀌면 이전 결과를 버린다');
  });
  test('담기: AI 출처로, 미정 프로젝트면 추천 시기·일정을 plannedPeriod·plannedNights로 (F2-7)', () => {
    const d = fresh('overseas');
    const r = addRecommended(d, { name: '오키나와', country: '일본', region: null, code: 'OKA', plannedPeriod: { month: 2 }, plannedNights: 3 });
    assert.ok(r.ok);
    const c = d.candidates[0];
    assert.equal(c.source, 'ai');
    assert.equal(c.code, 'OKA');
    assert.deepEqual(c.plannedPeriod, { month: 2 });
    assert.equal(c.plannedNights, 3);
  });
  test('담기: 시기·기간이 정해진 프로젝트에서는 추천 시기·일정을 저장하지 않는다', () => {
    const d = fresh('domestic');
    setPeriodMode(d, 'season');
    updatePeriod(d, { nights: 2 });
    addRecommended(d, { name: '강릉', country: null, region: '강원', code: null, plannedPeriod: { season: 'autumn' }, plannedNights: 1 });
    assert.equal(d.candidates[0].plannedPeriod, null);
    assert.equal(d.candidates[0].plannedNights, null);
    assert.equal(d.candidates[0].region, '강원');
  });
});
