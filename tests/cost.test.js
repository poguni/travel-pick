// 비용 추정·기록 — PRD F12, 5.7
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokens,
  pricingFromApi,
  estimateCall,
  expectedOutTokens,
  summarizeEstimates,
  actualUsd,
  lastRunDelta,
  costTotals,
  OUT_DEFAULTS,
} from '../js/core/cost.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `기대 ${b}, 실제 ${a}`);
const RATIO = { ko: 0.8, other: 0.25 };
// 100만 토큰당 입력 $2, 출력 $10, 검색 1회 $0.01
const PRICE = { prompt: 2e-6, completion: 1e-5, webSearch: 0.01 };

describe('토큰 추정 (5.7-1)', () => {
  test('한글은 글자당 0.8, 그 밖(영문·숫자·공백·기호)은 글자당 0.25, 올림', () => {
    assert.equal(estimateTokens('가나다라마', RATIO), 4); // 5 × 0.8
    assert.equal(estimateTokens('abcdefgh', RATIO), 2); // 8 × 0.25
    assert.equal(estimateTokens('강릉 2박', RATIO), Math.ceil(3 * 0.8 + 2 * 0.25));
    assert.equal(estimateTokens('', RATIO), 0);
  });
  test('메시지 배열도 받는다 (역할·구분 비용 메시지당 4토큰)', () => {
    const msgs = [{ role: 'system', content: 'abcd' }, { role: 'user', content: '가나' }];
    assert.equal(estimateTokens(msgs, RATIO), 1 + 4 + 2 + 4);
  });
});

describe('단가 (모델 목록 API)', () => {
  test('토큰당 USD 문자열 → 숫자, web_search 없으면 0', () => {
    assert.deepEqual(pricingFromApi({ prompt: '0.000002', completion: '0.00001', web_search: '0.01' }), PRICE);
    assert.deepEqual(pricingFromApi({ prompt: '0.0000001', completion: '0.0000005' }), { prompt: 1e-7, completion: 5e-7, webSearch: 0 });
    assert.equal(pricingFromApi(null), null);
  });
});

describe('호출 1회 예상 비용 (5.7-3·4)', () => {
  test('입력 × 입력 단가 + 출력 × 출력 단가', () => {
    const e = estimateCall({ inTokens: 1000, outTokens: 1500, pricing: PRICE });
    close(e.usd, 1000 * 2e-6 + 1500 * 1e-5);
    assert.equal(e.webUsd, 0);
  });
  test('웹 검색이면 검색 1회 요금 + 검색 결과 분량의 입력 토큰을 더한다', () => {
    const e = estimateCall({ inTokens: 1000, outTokens: 1500, pricing: PRICE, webSearch: true, searchTokens: 2000 });
    assert.equal(e.inTokens, 3000);
    close(e.webUsd, 0.01);
    close(e.usd, 3000 * 2e-6 + 1500 * 1e-5 + 0.01);
  });
  test('단가를 모르면 usd는 null', () => {
    assert.equal(estimateCall({ inTokens: 10, outTokens: 10, pricing: null }).usd, null);
  });
});

describe('출력 토큰 예상 보정 (F12-5)', () => {
  const run = (feature, model, out, at) => ({ feature, model, status: 'done', actual: { outTokens: out }, at });
  test('기록이 없으면 기능별 기본값', () => {
    assert.equal(expectedOutTokens('research', 'claude', []), OUT_DEFAULTS.research);
    assert.equal(OUT_DEFAULTS.research, 1500);
    assert.equal(OUT_DEFAULTS.scores, 1000);
  });
  test('같은 기능·모델의 최근 실제 출력 평균 (최대 10개)', () => {
    const runs = [run('research', 'claude', 1000, '1'), run('research', 'claude', 2000, '2'), run('research', 'gpt', 9000, '3'), run('scores', 'claude', 50, '4')];
    assert.equal(expectedOutTokens('research', 'claude', runs), 1500);
  });
  test('같은 모델 기록이 없으면 같은 기능의 다른 모델 평균', () => {
    const runs = [run('research', 'gpt', 800, '1'), run('research', 'gemini', 1200, '2')];
    assert.equal(expectedOutTokens('research', 'claude', runs), 1000);
  });
  test('실패한 실행은 빼고, 최근 10개만', () => {
    const runs = Array.from({ length: 12 }, (_, i) => run('recommend', 'claude', i < 2 ? 100000 : 1000, String(i).padStart(2, '0')));
    runs.push({ feature: 'recommend', model: 'claude', status: 'failed', actual: null, at: '99' });
    assert.equal(expectedOutTokens('recommend', 'claude', runs), 1000);
  });
});

describe('확인 창 요약 (F12-1·2)', () => {
  const calls = [
    { model: 'claude', estimate: { inTokens: 1000, outTokens: 1000, usd: 0.012, webUsd: 0.01 } },
    { model: 'claude', estimate: { inTokens: 1000, outTokens: 1000, usd: 0.012, webUsd: 0.01 } },
    { model: 'gpt', estimate: { inTokens: 500, outTokens: 200, usd: 0.0002, webUsd: 0 } },
  ];
  test('모델별 소계와 합계, 원화', () => {
    const s = summarizeEstimates(calls, { usdKrw: 1400 });
    assert.deepEqual(s.byModel.claude, { calls: 2, inTokens: 2000, outTokens: 2000, usd: 0.024, webUsd: 0.02 });
    assert.equal(s.total.calls, 3);
    close(s.total.usd, 0.0242);
    close(s.total.krw, 0.0242 * 1400);
  });
  test('체크를 끈 모델은 합계에서 뺀다', () => {
    const s = summarizeEstimates(calls, { usdKrw: 1400, enabled: ['gpt'] });
    assert.equal(s.total.calls, 1);
    close(s.total.usd, 0.0002);
    assert.ok(s.byModel.claude, '끈 모델도 표에는 남는다');
  });
});

describe('실제 비용 (F12-3)', () => {
  test('응답의 usage.cost를 우선', () => {
    close(actualUsd({ prompt_tokens: 1000, completion_tokens: 100, cost: 0.5 }, PRICE), 0.5);
  });
  test('cost가 없으면 토큰 × 단가', () => {
    close(actualUsd({ prompt_tokens: 1000, completion_tokens: 100 }, PRICE), 1000 * 2e-6 + 100 * 1e-5);
    assert.equal(actualUsd({ prompt_tokens: 1 }, null), null);
  });
});

describe('지난 실행 대비 (시안 06 "예상보다 실제가 6% 적었어요")', () => {
  test('가장 최근 같은 기능 실행 묶음의 (실제 − 예상) / 예상', () => {
    const runs = [
      { runId: 'a', feature: 'research', status: 'done', estimate: { usd: 1 }, actual: { usd: 2 }, at: '1' },
      { runId: 'b', feature: 'research', status: 'done', estimate: { usd: 0.5 }, actual: { usd: 0.45 }, at: '2' },
      { runId: 'b', feature: 'research', status: 'done', estimate: { usd: 0.5 }, actual: { usd: 0.49 }, at: '2' },
    ];
    close(lastRunDelta(runs, 'research'), (0.94 - 1) / 1, 1e-9);
    assert.equal(lastRunDelta(runs, 'scores'), null);
  });
});

describe('누적 비용 (F12-4)', () => {
  test('모델별·기능별 합계', () => {
    const runs = [
      { feature: 'research', model: 'claude', actual: { usd: 0.1 } },
      { feature: 'research', model: 'gpt', actual: { usd: 0.01 } },
      { feature: 'recommend', model: 'claude', actual: { usd: 0.05 } },
      { feature: 'recommend', model: 'gpt', actual: null },
    ];
    const t = costTotals(runs);
    close(t.total, 0.16);
    close(t.byModel.claude, 0.15);
    close(t.byFeature.research, 0.11);
    assert.equal(t.calls, 4);
  });
});
