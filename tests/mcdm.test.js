// 계산 엔진 테스트 — PRD 6장, F6-3·F6-4, F9-5, DESIGN.md 6.11
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  RI_TABLE,
  normalizeWeights,
  normalizeMinMax,
  weightedSum,
  ahpWeights,
  ahpConsistency,
  mostInconsistentPair,
  snapToSaaty,
  sliderToPairwise,
  pairwiseToSlider,
  identityPairwise,
  setJudgment,
  fillPairwiseFromWeights,
  aggregateSimple,
  aggregateAIJ,
  rank,
  isNearTie,
  adjustWeights,
  sensitivity,
  disagreement,
} from '../js/core/mcdm.js';

const close = (actual, expected, eps = 1e-3, msg = '') =>
  assert.ok(Math.abs(actual - expected) <= eps, `${msg} 기대 ${expected}, 실제 ${actual}`);
const closeAll = (actual, expected, eps = 1e-3) => {
  assert.equal(actual.length, expected.length);
  expected.forEach((e, i) => close(actual[i], e, eps, `[${i}]`));
};

// 가중치 벡터에서 완전 일관 행렬 만들기 (a_ij = w_i / w_j)
const consistentFrom = (w) => w.map((wi) => w.map((wj) => wi / wj));

// 널리 인용되는 3×3 AHP 예제.
// 행 기하평균: (15)^(1/3), 1, (1/15)^(1/3) → 정규화 0.6370, 0.2583, 0.1047
// λmax ≈ 3.0385, CI ≈ 0.0193, CR = CI / 0.58 ≈ 0.0332 (손계산으로 확인)
const SAATY3 = [
  [1, 3, 5],
  [1 / 3, 1, 3],
  [1 / 5, 1 / 3, 1],
];

describe('가중치 정규화', () => {
  test('합이 1이 되도록 나눈다', () => {
    closeAll(normalizeWeights([7, 4, 0, 9]), [0.35, 0.2, 0, 0.45]);
  });
  test('모두 0이면 균등 배분', () => {
    closeAll(normalizeWeights([0, 0, 0, 0]), [0.25, 0.25, 0.25, 0.25]);
  });
});

describe('min-max 정규화 (6.1)', () => {
  test('클수록 좋음', () => {
    closeAll(normalizeMinMax([10, 20, 30]), [0, 0.5, 1]);
  });
  test('작을수록 좋음 (비용·비행시간)', () => {
    closeAll(normalizeMinMax([10, 20, 30], 'lower_better'), [1, 0.5, 0]);
  });
  test('모든 값이 같으면 0.5', () => {
    closeAll(normalizeMinMax([7, 7, 7]), [0.5, 0.5, 0.5]);
  });
  test('비어 있는 값(null)은 그대로 둔다', () => {
    const r = normalizeMinMax([10, null, 30]);
    assert.equal(r[1], null);
    closeAll([r[0], r[2]], [0, 1]);
  });
});

describe('가중합 (6.2)', () => {
  test('1~10점을 0~100으로 환산한다', () => {
    const scores = [
      [10, 2],
      [4, 8],
    ];
    closeAll(weightedSum(scores, [0.6, 0.4]), [68, 56]);
  });
  test('점수가 하나라도 비면 그 후보는 null', () => {
    const r = weightedSum([[5, null], [5, 5]], [0.5, 0.5]);
    assert.equal(r[0], null);
    close(r[1], 50);
  });
});

describe('AHP 가중치와 일관성 (6.3)', () => {
  test('3×3 예제: 가중치', () => {
    closeAll(ahpWeights(SAATY3), [0.637, 0.2583, 0.1047]);
  });
  test('3×3 예제: λmax, CI, RI, CR', () => {
    const c = ahpConsistency(SAATY3);
    close(c.lambdaMax, 3.0385);
    close(c.ci, 0.0193);
    assert.equal(c.ri, 0.58);
    close(c.cr, 0.0332);
  });
  test('완전 일관 행렬(7×7)은 원래 가중치를 복원하고 CR = 0', () => {
    const w = [0.22, 0.18, 0.16, 0.14, 0.12, 0.1, 0.08];
    const m = consistentFrom(w);
    closeAll(ahpWeights(m), w, 1e-9);
    const c = ahpConsistency(m);
    close(c.lambdaMax, 7, 1e-9);
    close(c.cr, 0, 1e-9);
  });
  test('n = 1, 2는 CR = 0', () => {
    assert.equal(ahpConsistency([[1]]).cr, 0);
    assert.equal(ahpConsistency([[1, 5], [1 / 5, 1]]).cr, 0);
  });
  test('RI 표는 PRD 6.3과 같다', () => {
    assert.deepEqual(RI_TABLE, [0, 0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45]);
  });
});

describe('가장 모순되는 비교 (F6-3, DESIGN 6.11)', () => {
  const w = [0.4, 0.3, 0.2, 0.1];
  const broken = () => {
    // 일관 행렬에서 (0, 3) 칸만 뒤집어 망가뜨림: 원래 4배 → 1/4배
    const m = consistentFrom(w);
    return setJudgment(m, 0, 3, 1 / 4);
  };

  test('망가뜨린 칸을 찾아낸다', () => {
    const m = broken();
    assert.ok(ahpConsistency(m).cr >= 0.1, '망가진 행렬은 CR이 0.1 이상이어야 함');
    const p = mostInconsistentPair(m);
    assert.deepEqual([p.i, p.j], [0, 3]);
    close(p.current, 1 / 4);
  });

  test('제안값은 Saaty 척도 값이고, 적용하면 CR이 좋아진다', () => {
    const m = broken();
    const before = ahpConsistency(m).cr;
    const p = mostInconsistentPair(m);
    assert.equal(snapToSaaty(p.suggested), p.suggested, '척도 값이어야 함');
    assert.ok(p.crAfter < before, `CR ${before} → ${p.crAfter}`);
  });

  test('제안값은 그 칸의 원래 일관된 값(4배)을 되찾고 CR은 0이 된다', () => {
    const p = mostInconsistentPair(broken());
    assert.equal(p.suggested, 4);
    close(p.crAfter, 0, 1e-9);
  });

  test('n ≤ 2면 null', () => {
    assert.equal(mostInconsistentPair([[1, 3], [1 / 3, 1]]), null);
  });
});

describe('Saaty 척도와 슬라이더 변환 (DESIGN 6.11)', () => {
  test('가장 가까운 척도 값으로 맞춘다 (로그 기준)', () => {
    assert.equal(snapToSaaty(2.9), 3);
    assert.equal(snapToSaaty(12), 9);
    close(snapToSaaty(0.3), 1 / 3);
    close(snapToSaaty(1 / 20), 1 / 9);
    assert.equal(snapToSaaty(1.1), 1);
  });
  test('슬라이더 → 쌍대비교: 음수는 왼쪽이 |v|+1배, 양수는 오른쪽', () => {
    assert.equal(sliderToPairwise(0), 1);
    assert.equal(sliderToPairwise(-2), 3);
    assert.equal(sliderToPairwise(-8), 9);
    close(sliderToPairwise(4), 1 / 5);
  });
  test('쌍대비교 → 슬라이더 왕복 변환', () => {
    for (let v = -8; v <= 8; v++) assert.equal(pairwiseToSlider(sliderToPairwise(v)), v);
  });
});

describe('쌍대비교 행렬 다루기', () => {
  test('identityPairwise와 setJudgment는 역수 관계를 지킨다', () => {
    const m = setJudgment(identityPairwise(3), 0, 2, 5);
    assert.equal(m[0][2], 5);
    close(m[2][0], 1 / 5);
    assert.equal(m[1][1], 1);
  });
  test('setJudgment는 원래 행렬을 바꾸지 않는다', () => {
    const m = identityPairwise(2);
    setJudgment(m, 0, 1, 3);
    assert.equal(m[0][1], 1);
  });
  test('단순 가중치로 초깃값 채우기 (F6-4): 비율을 척도 값으로 맞추고 역수 유지', () => {
    const m = fillPairwiseFromWeights([0.5, 0.25, 0.1, 0.15]);
    assert.equal(m[0][1], 2);
    assert.equal(m[0][2], 5);
    close(m[2][0], 1 / 5);
    close(m[1][3], 2); // 0.25 / 0.15 ≈ 1.67 → 2
    assert.ok(ahpConsistency(m).cr < 0.1);
  });
  test('가중치 0이 있어도 깨지지 않는다', () => {
    const m = fillPairwiseFromWeights([0.6, 0.4, 0]);
    assert.equal(m[0][2], 9);
    close(m[2][0], 1 / 9);
  });
});

describe('그룹 집계 (6.4)', () => {
  test('단순 모드: 영향력 가중 산술평균', () => {
    const r = aggregateSimple([[0.6, 0.4], [0.2, 0.8]], [3, 1]);
    closeAll(r, [0.5, 0.5]);
  });
  test('영향력을 생략하면 동일 비중', () => {
    closeAll(aggregateSimple([[0.6, 0.4], [0.2, 0.8]]), [0.4, 0.6]);
  });
  test('AHP 모드(AIJ): 셀별 기하평균, 서로 반대 판단은 1이 된다', () => {
    const a = setJudgment(identityPairwise(2), 0, 1, 4);
    const b = setJudgment(identityPairwise(2), 0, 1, 1 / 4);
    const g = aggregateAIJ([a, b]);
    close(g[0][1], 1, 1e-9);
  });
  test('AIJ: 영향력 가중 기하평균', () => {
    const a = setJudgment(identityPairwise(2), 0, 1, 9);
    const b = setJudgment(identityPairwise(2), 0, 1, 1);
    // 9^(2/3) · 1^(1/3) = 4.3267
    close(aggregateAIJ([a, b], [2, 1])[0][1], Math.pow(9, 2 / 3));
  });
  test('AIJ 결과는 역수 행렬이다', () => {
    const a = setJudgment(setJudgment(identityPairwise(3), 0, 1, 3), 1, 2, 5);
    const b = setJudgment(setJudgment(identityPairwise(3), 0, 1, 1 / 2), 0, 2, 7);
    const g = aggregateAIJ([a, b], [1, 2]);
    for (let i = 0; i < 3; i++) {
      close(g[i][i], 1, 1e-12);
      for (let j = 0; j < 3; j++) close(g[i][j] * g[j][i], 1, 1e-12);
    }
  });
});

describe('순위와 동점 (F9-1, F9-5)', () => {
  test('점수 내림차순, null은 맨 뒤', () => {
    const r = rank([71.3, null, 82.4, 78.9]);
    assert.deepEqual(r.map((x) => x.index), [2, 3, 0, 1]);
    assert.deepEqual(r.map((x) => x.rank), [1, 2, 3, null]);
  });
  test('같은 점수는 같은 순위', () => {
    const r = rank([50, 60, 50]);
    assert.deepEqual(r.map((x) => x.rank), [1, 2, 2]);
  });
  test('사실상 동점: 1위 대비 3% 이내 (경계 포함)', () => {
    assert.equal(isNearTie(100, 97), true);
    assert.equal(isNearTie(100, 96.9), false);
    assert.equal(isNearTie(82.4, 78.9), false);
    assert.equal(isNearTie(80, 79, 0.01), false);
  });
});

describe('민감도 분석 (6.5, F9-4)', () => {
  test('한 기준을 x로 바꾸면 나머지는 원래 비율로 1 − x를 나눠 갖는다', () => {
    closeAll(adjustWeights([0.2, 0.3, 0.5], 0, 0.6), [0.6, 0.15, 0.25]);
  });
  test('나머지가 모두 0이면 균등 배분', () => {
    closeAll(adjustWeights([1, 0, 0], 0, 0.4), [0.4, 0.3, 0.3]);
  });

  // A = [10, 2], B = [4, 8]. 기준 0의 가중치 x에 대해
  // A(x) = 20 + 80x, B(x) = 80 − 40x → x = 0.5에서 교차
  const scores = [
    [10, 2],
    [4, 8],
  ];

  test('후보별 점수 직선과 1위 구간을 정확히 계산한다', () => {
    const s = sensitivity(scores, [0.6, 0.4], 0);
    close(s.current, 0.6);
    close(s.lines[0].intercept, 20);
    close(s.lines[0].slope, 80);
    close(s.lines[1].intercept, 80);
    close(s.lines[1].slope, -40);
    assert.equal(s.segments.length, 2);
    assert.equal(s.segments[0].leader, 1);
    close(s.segments[0].to, 0.5);
    assert.equal(s.segments[1].leader, 0);
  });

  test('현재 위치에서 가장 가까운 역전 지점 (아래·위)', () => {
    const s = sensitivity(scores, [0.6, 0.4], 0);
    close(s.down.at, 0.5);
    assert.equal(s.down.leader, 1);
    assert.equal(s.up, null);
  });

  test('1위가 끝까지 바뀌지 않으면 up·down 모두 null', () => {
    const s = sensitivity([[9, 9], [1, 1]], [0.5, 0.5], 1);
    assert.equal(s.up, null);
    assert.equal(s.down, null);
    assert.equal(s.segments.length, 1);
  });

  test('3개 후보에서 위쪽 역전 지점을 찾는다', () => {
    // 기준 0 가중치 x: A = 50 + 0x(5,5), B = 30 + 60x(9,3), C = 60 − 50x(1,6)
    const s3 = sensitivity([[5, 5], [9, 3], [1, 6]], [0.1, 0.9], 0);
    // x=0.1: A 50, B 36, C 55 → C 1위. C=A at x=0.2, 이후 A, B=A at x=1/3
    assert.equal(s3.segments[0].leader, 2);
    close(s3.up.at, 0.2);
    assert.equal(s3.up.leader, 0);
    assert.equal(s3.down, null);
  });
});

describe('AI 의견 불일치 지표 (6.6)', () => {
  test('표준편차(모집단)와 상대 범위', () => {
    const d = disagreement([7, 6, 8]);
    close(d.mean, 7);
    close(d.sd, Math.sqrt(2 / 3));
    close(d.spread, 2 / 7);
    assert.equal(d.count, 3);
  });
  test('null은 빼고 계산, 값이 1개 이하면 sd = 0', () => {
    const d = disagreement([null, 5]);
    assert.equal(d.sd, 0);
    assert.equal(d.count, 1);
  });
  test('값이 없으면 mean·sd·spread 모두 null', () => {
    const d = disagreement([null, undefined]);
    assert.equal(d.mean, null);
    assert.equal(d.sd, null);
    assert.equal(d.spread, null);
  });
  test('평균이 0이면 spread는 null', () => {
    assert.equal(disagreement([0, 0]).spread, null);
  });
});
