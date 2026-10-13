// 다기준 의사결정 계산 엔진 — PRD 6장. DOM·저장소를 쓰지 않는 순수 함수.
//
// 데이터 규칙
// - 점수: scores[후보][기준], 기본 1~10점 (null = 아직 입력 안 함)
// - 가중치: 기준 순서와 같은 배열, 합 1
// - 쌍대비교 행렬: a[i][j] = "기준 i가 기준 j보다 몇 배 중요한가", a[j][i] = 1 / a[i][j]

/** Saaty 무작위 지수 RI, 인덱스 = 기준 수 n (PRD 6.3) */
export const RI_TABLE = [0, 0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45];

/** Saaty 척도 값: 1/9 … 1/2, 1, 2 … 9 */
const SAATY_SCALE = [...[9, 8, 7, 6, 5, 4, 3, 2].map((v) => 1 / v), 1, 2, 3, 4, 5, 6, 7, 8, 9];

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ── 정규화 (6.1) ─────────────────────────────────────────

/** 합이 1이 되도록 나눈다. 모두 0이면 균등 배분 (단순 모드 슬라이더 0~10 → 가중치) */
export function normalizeWeights(raw) {
  const total = sum(raw);
  if (total <= 0) return raw.map(() => 1 / raw.length);
  return raw.map((v) => v / total);
}

/** min-max 정규화. direction: 'higher_better' | 'lower_better'. 모두 같으면 0.5, null은 유지 */
export function normalizeMinMax(values, direction = 'higher_better') {
  const nums = values.filter(isNum);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return values.map((v) => {
    if (!isNum(v)) return null;
    if (max === min) return 0.5;
    const t = (v - min) / (max - min);
    return direction === 'lower_better' ? 1 - t : t;
  });
}

// ── 가중합 (6.2) ─────────────────────────────────────────

/** 후보별 최종 점수(0~100). 점수가 하나라도 비면 그 후보는 null */
export function weightedSum(scores, weights, maxScore = 10) {
  return scores.map((row) => {
    if (row.some((s) => !isNum(s))) return null;
    return (sum(row.map((s, j) => weights[j] * s)) / maxScore) * 100;
  });
}

// ── AHP (6.3) ────────────────────────────────────────────

/** 행 기하평균법 가중치 */
export function ahpWeights(matrix) {
  const n = matrix.length;
  const gm = matrix.map((row) => Math.exp(sum(row.map(Math.log)) / n));
  return normalizeWeights(gm);
}

/** λmax, CI, RI, CR. n ≤ 2면 CR = 0 */
export function ahpConsistency(matrix, weights = ahpWeights(matrix)) {
  const n = matrix.length;
  const aw = matrix.map((row) => sum(row.map((a, j) => a * weights[j])));
  const lambdaMax = sum(aw.map((v, i) => v / weights[i])) / n;
  const ri = RI_TABLE[n];
  if (n <= 2) return { lambdaMax, ci: 0, ri, cr: 0 };
  const ci = (lambdaMax - n) / (n - 1);
  return { lambdaMax, ci, ri, cr: ci / ri };
}

/** 가장 가까운 Saaty 척도 값 (로그 거리 기준, 1/9~9로 제한) */
export function snapToSaaty(ratio) {
  const r = Math.min(9, Math.max(1 / 9, ratio));
  let best = 1;
  let bestDist = Infinity;
  for (const s of SAATY_SCALE) {
    const d = Math.abs(Math.log(r) - Math.log(s));
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

/** n×n 단위 행렬(모든 비교 "같음") */
export function identityPairwise(n) {
  return Array.from({ length: n }, () => Array(n).fill(1));
}

/** a[i][j] = value, a[j][i] = 1/value 를 적용한 새 행렬 (원본 유지) */
export function setJudgment(matrix, i, j, value) {
  const m = matrix.map((row) => row.slice());
  m[i][j] = value;
  m[j][i] = 1 / value;
  return m;
}

/**
 * a_ij 와 w_i / w_j 의 차이(로그 기준)가 가장 큰 비교 쌍 (F6-3).
 * suggested = 그 칸에 넣었을 때 CR이 가장 낮아지는 척도 값, crAfter = 그때의 CR.
 * (w_i / w_j 는 모순된 판단 때문에 이미 왜곡돼 있으므로 비율 대신 CR 기준으로 고른다)
 * n ≤ 2면 null.
 */
export function mostInconsistentPair(matrix) {
  const n = matrix.length;
  if (n <= 2) return null;
  const w = ahpWeights(matrix);
  let worst = null;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const deviation = Math.abs(Math.log(matrix[i][j]) - Math.log(w[i] / w[j]));
      if (!worst || deviation > worst.deviation) worst = { i, j, deviation };
    }
  }
  const { i, j, deviation } = worst;
  let suggested = 1;
  let crAfter = Infinity;
  for (const s of SAATY_SCALE) {
    const cr = ahpConsistency(setJudgment(matrix, i, j, s)).cr;
    if (cr < crAfter - 1e-12) {
      suggested = s;
      crAfter = cr;
    }
  }
  return { i, j, current: matrix[i][j], suggested, deviation, crAfter };
}

/** 슬라이더(−8~8) → 쌍대비교 값. v < 0: 왼쪽(i)이 |v|+1배, v > 0: 오른쪽(j)이 v+1배 (DESIGN 6.11) */
export function sliderToPairwise(v) {
  if (v < 0) return -v + 1;
  if (v > 0) return 1 / (v + 1);
  return 1;
}

/** 쌍대비교 값 → 슬라이더(−8~8) */
export function pairwiseToSlider(a) {
  const v = a >= 1 ? -(Math.round(a) - 1) : Math.round(1 / a) - 1;
  return Math.max(-8, Math.min(8, v)) || 0;
}

/** 단순 모드 가중치로 쌍대비교 초깃값 채우기 (F6-4) */
export function fillPairwiseFromWeights(weights) {
  const n = weights.length;
  let m = identityPairwise(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const [wi, wj] = [weights[i], weights[j]];
      const ratio = wi === wj ? 1 : wj === 0 ? 9 : wi / wj;
      m = setJudgment(m, i, j, snapToSaaty(ratio));
    }
  }
  return m;
}

// ── 그룹 집계 (6.4) ──────────────────────────────────────

/** 단순 모드: 동행인 가중치 벡터의 영향력 가중 산술평균 */
export function aggregateSimple(vectors, influence = vectors.map(() => 1)) {
  const total = sum(influence);
  const n = vectors[0].length;
  const avg = Array.from({ length: n }, (_, j) =>
    sum(vectors.map((v, k) => v[j] * influence[k])) / total,
  );
  return normalizeWeights(avg);
}

/** AHP 모드(AIJ): 셀별 영향력 가중 기하평균 행렬 */
export function aggregateAIJ(matrices, influence = matrices.map(() => 1)) {
  const total = sum(influence);
  const n = matrices[0].length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      Math.exp(sum(matrices.map((m, k) => influence[k] * Math.log(m[i][j]))) / total),
    ),
  );
}

// ── 순위 (F9-1, F9-5) ────────────────────────────────────

/** 점수 내림차순 순위. 같은 점수는 같은 순위, null은 맨 뒤(rank null) */
export function rank(totals) {
  const valid = totals.filter(isNum);
  return totals
    .map((score, index) => ({ index, score }))
    .sort((a, b) => (isNum(b.score) ? b.score : -Infinity) - (isNum(a.score) ? a.score : -Infinity))
    .map((r) => ({
      ...r,
      rank: isNum(r.score) ? 1 + valid.filter((s) => s > r.score).length : null,
    }));
}

/** 1·2위 차이가 1위 점수의 threshold 이내면 "사실상 동점" (경계 포함) */
export function isNearTie(first, second, threshold = 0.03) {
  return first - second <= threshold * first + 1e-9;
}

// ── 민감도 분석 (6.5) ────────────────────────────────────

/** 기준 j의 가중치를 x로 바꾸고, 나머지는 원래 비율을 유지하며 1 − x를 나눠 갖는다 */
export function adjustWeights(weights, j, x) {
  const others = weights.map((w, k) => (k === j ? 0 : w));
  const rest = sum(others);
  const n = weights.length;
  return weights.map((w, k) => {
    if (k === j) return x;
    return rest > 0 ? (w / rest) * (1 - x) : (1 - x) / (n - 1);
  });
}

/**
 * 기준 j의 가중치를 0~1로 움직일 때 1위가 바뀌는 지점 (F9-4).
 * 가중치 x에서 후보 점수는 직선 intercept + slope·x 이므로 교차점을 정확히 계산한다.
 * 반환: lines(후보별 직선, 점수가 비면 null), segments(1위 구간), up/down(현재 위치에서 가장 가까운 역전 지점)
 */
export function sensitivity(scores, weights, j, maxScore = 10) {
  const base = adjustWeights(weights, j, 0); // x = 0일 때 나머지 기준의 가중치
  const lines = scores.map((row, index) => {
    if (row.some((s) => !isNum(s))) return null;
    const rest = sum(row.map((s, k) => (k === j ? 0 : base[k] * s)));
    const scale = 100 / maxScore;
    return { index, intercept: rest * scale, slope: (row[j] - rest) * scale };
  });
  const valid = lines.filter(Boolean);
  const at = (line, x) => line.intercept + line.slope * x;
  const leaderAt = (x) =>
    valid.reduce((best, l) => (at(l, x) > at(best, x) + 1e-12 ? l : best)).index;

  // 모든 교차점을 구간 경계 후보로
  const cuts = new Set([0, 1]);
  for (let a = 0; a < valid.length; a++) {
    for (let b = a + 1; b < valid.length; b++) {
      const ds = valid[a].slope - valid[b].slope;
      if (ds === 0) continue;
      const x = (valid[b].intercept - valid[a].intercept) / ds;
      if (x > 0 && x < 1) cuts.add(x);
    }
  }
  const xs = [...cuts].sort((p, q) => p - q);
  const segments = [];
  for (let k = 0; k < xs.length - 1; k++) {
    const leader = leaderAt((xs[k] + xs[k + 1]) / 2);
    const last = segments[segments.length - 1];
    if (last && last.leader === leader) last.to = xs[k + 1];
    else segments.push({ from: xs[k], to: xs[k + 1], leader });
  }

  const current = weights[j];
  const idx = segments.findIndex((s) => current >= s.from && (current < s.to || s.to === 1));
  const next = segments[idx + 1];
  const prev = segments[idx - 1];
  return {
    criterion: j,
    current,
    lines,
    segments,
    up: next ? { at: next.from, leader: next.leader } : null,
    down: prev ? { at: prev.to, leader: prev.leader } : null,
  };
}

// ── AI 의견 불일치 (6.6) ─────────────────────────────────

/** 평균, 표준편차(모집단), 상대 범위 (max − min) / 평균. null·undefined는 제외 */
export function disagreement(values) {
  const v = values.filter(isNum);
  const count = v.length;
  if (count === 0) return { count, mean: null, sd: null, spread: null };
  const mean = sum(v) / count;
  const sd = Math.sqrt(sum(v.map((x) => (x - mean) ** 2)) / count);
  const spread = mean === 0 ? null : (Math.max(...v) - Math.min(...v)) / mean;
  return { count, mean, sd, spread };
}
