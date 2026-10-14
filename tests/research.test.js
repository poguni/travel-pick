// 자료 수집 — PRD F4, 5.6. Implementation Plan Phase 9
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../js/core/schema.js';
import { addCandidate, setPeriodMode, updatePeriod, removeCandidate } from '../js/core/project.js';
import {
  RESEARCH_ITEMS,
  researchBasis,
  researchKey,
  sanitizeResearch,
  saveResearchResults,
  setConfirmed,
  setResearchNote,
  researchStatus,
} from '../js/core/research.js';
import { numericSpread, SPREAD_WARN } from '../js/core/merge.js';
import { researchRequest, researchSchema, basisText } from '../js/ai/prompts.js';
import { validate } from '../js/ai/json.js';

const ids = (t) => RESEARCH_ITEMS[t].map((d) => d.id);

function project(tripType = 'overseas') {
  const d = createProject({ id: 'p', tripType });
  addCandidate(d, { name: '오키나와', country: '일본', code: 'OKA', plannedPeriod: 'month:2', plannedNights: '3' });
  addCandidate(d, { name: '타이베이', country: '대만', code: 'TPE' });
  return d;
}

describe('조사 항목 (F4-1)', () => {
  test('국내에는 비자·여행경보·항공 항목이 없고 이동 항목이 있다', () => {
    assert.ok(ids('overseas').includes('visa'));
    assert.ok(ids('overseas').includes('flightPrice'));
    const dom = ids('domestic');
    assert.ok(!dom.some((id) => /visa|flight/i.test(id)));
    assert.ok(dom.includes('transportTime') && dom.includes('transportCost'));
    assert.ok(dom.includes('safety') && dom.includes('hygiene'));
  });
  test('스키마도 국내/해외로 나뉜다', () => {
    const keys = (t) => Object.keys(researchSchema(RESEARCH_ITEMS[t]).schema.properties.items.properties);
    assert.deepEqual(keys('overseas'), ids('overseas'));
    assert.deepEqual(keys('domestic'), ids('domestic'));
  });
});

describe('조사 기준 시기 (F4-1, F1-11)', () => {
  test('프로젝트 시기가 미정이면 후보의 추천 시기·일정', () => {
    const d = project();
    const b = researchBasis(d.project, d.candidates[0]);
    assert.deepEqual(b.period, { month: 2 });
    assert.equal(b.nights, 3);
    assert.deepEqual(basisText(b), { when: '2월 (후보의 추천 시기)', nights: '3박 4일 (후보의 적정 일정)' });
    assert.match(basisText(researchBasis(d.project, d.candidates[1])).when, /^미정/);
  });
  test('프로젝트 시기가 정해지면 그 값을 쓴다', () => {
    const d = project();
    setPeriodMode(d, 'season');
    updatePeriod(d, { season: 'autumn', nights: 4 });
    const b = researchBasis(d.project, d.candidates[0]);
    assert.deepEqual(b.period, { season: 'autumn' });
    assert.equal(b.nights, 4);
  });
  test('캐시 키: 시기가 같으면 같고, 바뀌면 다르다 (F4-6)', () => {
    const d = project();
    const k = researchKey(d.project, d.candidates[0]);
    d.project.name = '다른 이름';
    assert.equal(researchKey(d.project, d.candidates[0]), k);
    d.candidates[0].plannedPeriod = { month: 3 };
    assert.notEqual(researchKey(d.project, d.candidates[0]), k);
  });
});

describe('응답 다듬기 (F4-2·3)', () => {
  test('출처가 없으면 확인 필요, 잘못된 URL·숫자는 버린다', () => {
    const items = sanitizeResearch(
      {
        items: {
          weather: { value: '최저 12℃', summary: '', sources: [], asOf: null, needsCheck: false },
          flightPrice: { value: '왕복 35~45만 원', summary: 's', sources: ['https://a.com', 'x'], asOf: '2026-09', needsCheck: false, numeric: { min: 450000, max: 350000 } },
          visa: { value: '', sources: [] },
          lodging: { value: '1박 10만 원', sources: ['https://b.com'], numeric: { min: -1, max: 'x' } },
          unknownItem: { value: 'x' },
        },
      },
      'overseas',
    );
    assert.equal(items.weather.needsCheck, true);
    assert.deepEqual(items.flightPrice.sources, ['https://a.com']);
    assert.equal(items.flightPrice.needsCheck, false);
    assert.deepEqual(items.flightPrice.numeric, { min: 350000, max: 450000 }, '뒤집힌 범위는 바로잡는다');
    assert.equal(items.visa, undefined, '빈 값은 빠진다');
    assert.equal(items.lodging.numeric, null);
    assert.equal(items.unknownItem, undefined);
    assert.equal(items.weather.numeric, null, '수치 항목이 아니면 numeric 없음');
  });
});

describe('모델 간 수치 차이 (F4-4, 30% 기준)', () => {
  test('가운데 값 기준 (최대 − 최소) / 평균', () => {
    const r = numericSpread({ claude: { min: 300000, max: 400000 }, gpt: { min: 400000, max: 500000 }, gemini: null });
    assert.equal(r.count, 2);
    assert.deepEqual(r.mids, { claude: 350000, gpt: 450000 });
    assert.ok(Math.abs(r.spread - 100000 / 400000) < 1e-9);
    assert.equal(r.warn, false, '25%는 강조하지 않는다');
  });
  test('30% 이상이면 강조, 정확히 30%도 포함', () => {
    assert.equal(SPREAD_WARN, 0.3);
    assert.equal(numericSpread({ a: { min: 100, max: 100 }, b: { min: 200, max: 200 } }).warn, true);
    const exact = numericSpread({ a: { min: 85, max: 85 }, b: { min: 115, max: 115 } }); // (115-85)/100
    assert.ok(Math.abs(exact.spread - 0.3) < 1e-9);
    assert.equal(exact.warn, true);
  });
  test('값이 1개 이하면 비교하지 않는다', () => {
    assert.deepEqual(numericSpread({ a: { min: 1, max: 2 }, b: null }), { count: 1, mids: { a: 1.5 }, spread: null, warn: false });
  });
});

describe('결과 기록·상태·확정값', () => {
  const ok = (model, candidateId) => ({ model, ok: true, meta: { candidateId }, value: { items: { weather: { value: '맑음', sources: ['https://w.com'] } } }, citations: [], usd: 0.02 });
  const fail = (model, candidateId) => ({ model, ok: false, meta: { candidateId }, error: { kind: 'timeout' }, raw: null, usd: null });

  test('일부 실패해도 나머지는 기록되고, 실패분만 바뀐다', () => {
    const d = project();
    const [a, b] = d.candidates;
    const keys = { [a.id]: researchKey(d.project, a), [b.id]: researchKey(d.project, b) };
    saveResearchResults(d, [ok('claude', a.id), fail('gpt', a.id), ok('gemini', b.id)], { keys, at: 't1' });
    assert.equal(researchStatus(d, a, 'claude'), 'done');
    assert.equal(researchStatus(d, a, 'gpt'), 'failed');
    assert.equal(researchStatus(d, b, 'gemini'), 'done');
    assert.equal(researchStatus(d, b, 'claude'), 'none');
    saveResearchResults(d, [ok('gpt', a.id)], { keys, at: 't2' });
    assert.equal(researchStatus(d, a, 'gpt'), 'done');
    assert.equal(d.research[a.id].claude.at, 't1', '다른 모델 결과는 그대로');
  });
  test('조사 기준이 바뀌면 stale', () => {
    const d = project();
    const a = d.candidates[0];
    saveResearchResults(d, [ok('claude', a.id)], { keys: { [a.id]: researchKey(d.project, a) }, at: 't' });
    a.plannedPeriod = { season: 'winter' };
    assert.equal(researchStatus(d, a, 'claude'), 'stale');
  });
  test('실행 중에 지운 후보의 결과는 버린다', () => {
    const d = project();
    const a = d.candidates[0];
    removeCandidate(d, a.id);
    saveResearchResults(d, [ok('claude', a.id)], { keys: {}, at: 't' });
    assert.equal(d.research[a.id], undefined);
  });
  test('확정값·메모: 새 조사 결과가 덮어쓰지 않고, 비우면 지워진다 (F4-5)', () => {
    const d = project();
    const a = d.candidates[0];
    setConfirmed(d, a.id, 'flightPrice', ' 왕복 40만 원 ');
    setResearchNote(d, a.id, 'weather', '2월은 바람이 셈');
    saveResearchResults(d, [ok('claude', a.id)], { keys: { [a.id]: 'k' }, at: 't' });
    assert.equal(d.research[a.id].confirmed.flightPrice, '왕복 40만 원');
    assert.equal(d.research[a.id].notes.weather, '2월은 바람이 셈');
    setConfirmed(d, a.id, 'flightPrice', '  ');
    assert.equal('flightPrice' in d.research[a.id].confirmed, false);
  });
});

describe('조사 요청 (F10-1, F4-7)', () => {
  test('후보 × 선택한 모델만큼 호출, 후보 id가 meta에, 웹 검색 사용', () => {
    const d = project();
    const items = RESEARCH_ITEMS.overseas;
    const targets = d.candidates.map((c) => ({ candidate: c, models: c.name === '오키나와' ? ['claude', 'gpt', 'gemini'] : ['gemini'], basis: researchBasis(d.project, c) }));
    const r = researchRequest(d.project, targets, { items, today: '2026-10-14' });
    assert.equal(r.feature, 'research');
    assert.equal(r.calls.length, 4);
    assert.ok(r.calls.every((c) => c.webSearch && c.meta.candidateId));
    assert.match(r.calls[0].messages[1].content, /조사 기준 시기: 2월/);
    assert.match(r.calls[0].messages[0].content, /외교부/);
    assert.equal(r.label, '후보 2곳 자료 수집');
  });
  test('국내 프롬프트에는 비자 조사 항목이 없다', () => {
    const d = createProject({ id: 'p', tripType: 'domestic' });
    addCandidate(d, { name: '강릉', region: '강원' });
    const r = researchRequest(d.project, [{ candidate: d.candidates[0], models: ['claude'], basis: researchBasis(d.project, d.candidates[0]) }], { items: RESEARCH_ITEMS.domestic, today: '2026-10-14' });
    const sys = r.calls[0].messages[0].content;
    assert.ok(!/- visa:/.test(sys));
    assert.match(sys, /- transportTime:/);
    assert.match(sys, /기상청/);
  });
  test('예시 응답이 스키마 검증을 통과한다', () => {
    const items = RESEARCH_ITEMS.domestic;
    const sample = { items: Object.fromEntries(items.map((d) => [d.id, { value: 'v', summary: 's', sources: [], asOf: null, needsCheck: true, ...(d.numeric ? { numeric: { min: 1, max: 2 } } : {}) }])) };
    assert.deepEqual(validate(sample, researchSchema(items).schema), []);
  });
});
