// 화면 표시 문자열 테스트 — DESIGN.md 6.1·6.2, PRD F1-5~F1-10
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  originLabel,
  periodShort,
  periodLong,
  durationText,
  companionText,
  familyDetailText,
  budgetText,
  projectSummaryLine,
  formatUsd,
  formatKrw,
  totalActualUsd,
} from '../js/ui/format.js';
import { createProject } from '../js/core/schema.js';
import { parseHash, ROUTES, STEPS } from '../js/router.js';

describe('출발지·시기 짧은 표시 (RouteNav)', () => {
  test('해외는 공항 코드, 모르는 공항은 이름 그대로, 국내는 도시명', () => {
    assert.equal(originLabel({ tripType: 'overseas', origin: '인천' }), 'ICN');
    assert.equal(originLabel({ tripType: 'overseas', origin: '김해' }), 'PUS');
    assert.equal(originLabel({ tripType: 'overseas', origin: '광주' }), '광주');
    assert.equal(originLabel({ tripType: 'domestic', origin: '서울' }), '서울');
  });
  test('시기: 월 FEB, 계절 가을, 날짜 02.06, 미정 TBD', () => {
    assert.equal(periodShort({ mode: 'month', month: 2 }), 'FEB');
    assert.equal(periodShort({ mode: 'season', season: 'autumn' }), '가을');
    assert.equal(periodShort({ mode: 'dates', startDate: '2027-02-06' }), '02.06');
    assert.equal(periodShort({ mode: 'undecided' }), 'TBD');
  });
  test('요약 줄: ICN · FEB · 4 PAX / 서울 · 가을 · 2 PAX', () => {
    const p = createProject({ tripType: 'overseas' });
    p.project.period = { mode: 'month', month: 2 };
    p.members = [1, 2, 3, 4].map((i) => ({ id: `m${i}`, name: `${i}` }));
    assert.equal(projectSummaryLine(p), 'ICN · FEB · 4 PAX');
    const d = createProject({ tripType: 'domestic' });
    d.project.period = { mode: 'season', season: 'autumn' };
    d.project.travelers = 2;
    assert.equal(projectSummaryLine(d), '서울 · 가을 · 2 PAX');
  });
});

describe('탑승권 정보 칸', () => {
  test('시기 긴 표시', () => {
    assert.equal(periodLong({ mode: 'month', month: 2 }), '2월');
    assert.equal(periodLong({ mode: 'season', season: 'winter' }), '겨울 (12~2월)');
    assert.equal(periodLong({ mode: 'dates', startDate: '2027-02-06' }), '2027.02.06');
    assert.equal(periodLong({ mode: 'undecided' }), '미정');
  });
  test('기간: N박 N+1일, 당일치기, 미정', () => {
    assert.equal(durationText({ nights: 5 }), '5박 6일');
    assert.equal(durationText({ nights: 0, dayTrip: true }), '당일치기');
    assert.equal(durationText({ nights: null }), '미정');
  });
  test('동행 형태와 가족 세부 형태', () => {
    assert.equal(companionText({ type: 'family', familyDetail: 'with_kids' }, 4), '가족 4명');
    assert.equal(companionText({ type: 'solo' }, 1), '혼자');
    assert.equal(companionText({ type: 'couple' }, 2), '연인·부부 2명');
    assert.equal(familyDetailText({ type: 'family', familyDetail: 'with_kids' }), '아이 동반');
    assert.equal(familyDetailText({ type: 'friends', familyDetail: 'with_kids' }), null);
  });
  test('1인 예산', () => {
    assert.equal(budgetText(1500000), '150만 원');
    assert.equal(budgetText(1234567), '123.5만 원');
    assert.equal(budgetText(null), '미정');
  });
});

describe('비용 표시', () => {
  test('USD·원화', () => {
    assert.equal(formatUsd(1.234), '$ 1.23');
    assert.equal(formatUsd(0.0456), '$ 0.046');
    assert.equal(formatUsd(0), '$ 0.00');
    assert.equal(formatKrw(1234.4), '약 1,234원');
  });
  test('실제 비용 합계', () => {
    assert.equal(totalActualUsd({ aiRuns: [{ actual: { usd: 0.5 } }, { actual: null }, { actual: { usd: 0.25 } }] }), 0.75);
    assert.equal(totalActualUsd(null), 0);
  });
});

describe('라우터', () => {
  test('해시 해석, 모르는 주소는 home', () => {
    assert.equal(parseHash('#/weights'), 'weights');
    assert.equal(parseHash('#/results?x=1'), 'results');
    assert.equal(parseHash(''), 'home');
    assert.equal(parseHash('#/없는곳'), 'home');
  });
  test('8단계 + home + settings', () => {
    assert.equal(STEPS.length, 8);
    assert.deepEqual(STEPS.map((s) => s.gate), ['01', '02', '03', '04', '05', '06', '07', '08']);
    assert.equal(ROUTES.length, 10);
  });
});
