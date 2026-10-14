// 점수 입력 규칙 — PRD F7-1
// scores[candidateId][criterionId] = { final: 1~10, ai?: {...}, rationale? }

import { disagreement } from './mcdm.js';

export const SCORE_MIN = 1;
export const SCORE_MAX = 10;

/** 1~10 정수로 정리해 최종 점수 저장. 빈 값이면 최종 점수만 지운다 */
export function setScore(data, candidateId, criterionId, value) {
  const row = (data.scores[candidateId] ??= {});
  const cell = (row[criterionId] ??= {});
  if (value === '' || value == null || Number.isNaN(Number(value))) {
    delete cell.final;
    if (Object.keys(cell).length === 0) delete row[criterionId];
    return { ok: true };
  }
  cell.final = Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(Number(value))));
  return { ok: true };
}

/** 비어 있는 칸만 value로 채우기 (빠르게 시작하고 다르게 볼 칸만 고칠 때) */
export function fillEmptyScores(data, value = 5) {
  for (const c of data.candidates) {
    for (const k of data.criteria) {
      if (data.scores[c.id]?.[k.id]?.final == null) setScore(data, c.id, k.id, value);
    }
  }
  return { ok: true };
}

// ── AI 점수 초안 (F7-2~4, F10-3) ─────────────────────────
// 셀: scores[후보][기준] = { final?, ai?: { 모델: 1~10 }, rationale?: { 모델: 한 줄 근거 } }
// 실행 상태: data.scoreDraft = { key, at, byModel: { 모델: { status, count, usd, at, error?, raw? } } }
// AI 점수는 final을 바꾸지 않는다. 사용자가 적용(applyDraft)하거나 직접 입력해야 final이 된다.


const clampScore = (v) => Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(v)));
const RAW_LIMIT = 4000;

/** 점수 초안이 지금 후보·기준과 맞는지 판단하는 키 */
export function scoreDraftKey(data) {
  return JSON.stringify([data.candidates.map((c) => c.id), data.criteria.map((k) => k.id)]);
}

/** 셀 하나의 AI 점수 통계: { scores: { 모델: 점수 }, count, mean, sd } */
export function cellStats(cell) {
  const scores = cell?.ai ?? {};
  const d = disagreement(Object.values(scores));
  return { scores, count: d.count, mean: d.mean, sd: d.sd };
}

/** 표준편차가 이 값 이상이면 의견 불일치 강조 (DESIGN 9장) */
export const SD_WARN = 2;

/**
 * 점수 초안 실행 결과 기록. results: runner 결과, value = { scores: [{ c, k, score, rationale }] }
 * map: { c: { 짧은 키: 후보 id }, k: { 짧은 키: 기준 id } } — 프롬프트에서 쓴 짧은 키를 되돌린다.
 * 성공한 모델은 그 모델의 이전 점수를 모두 지우고 새로 채운다.
 */
export function saveScoreDraft(data, results, { key, at, map }) {
  data.scoreDraft ??= { key, at, byModel: {} };
  data.scoreDraft.key = key;
  data.scoreDraft.at = at;
  for (const r of results) {
    const m = r.model;
    if (!r.ok) {
      data.scoreDraft.byModel[m] = { status: 'failed', count: 0, usd: r.usd ?? null, at, error: r.error?.kind ?? 'unknown', detail: r.error?.message ? String(r.error.message).slice(0, 300) : null, raw: r.raw ? String(r.raw).slice(0, RAW_LIMIT) : null };
      continue;
    }
    for (const row of Object.values(data.scores)) {
      for (const cell of Object.values(row)) {
        if (cell.ai) delete cell.ai[m];
        if (cell.rationale) delete cell.rationale[m];
      }
    }
    let count = 0;
    const live = new Set(data.candidates.map((c) => c.id));
    const crits = new Set(data.criteria.map((k) => k.id));
    for (const s of Array.isArray(r.value?.scores) ? r.value.scores : []) {
      const cid = map.c[s?.c];
      const kid = map.k[s?.k];
      if (!live.has(cid) || !crits.has(kid) || typeof s.score !== 'number' || !Number.isFinite(s.score)) continue;
      const cell = ((data.scores[cid] ??= {})[kid] ??= {});
      (cell.ai ??= {})[m] = clampScore(s.score);
      if (typeof s.rationale === 'string' && s.rationale.trim()) (cell.rationale ??= {})[m] = s.rationale.trim().slice(0, 300);
      count++;
    }
    data.scoreDraft.byModel[m] = { status: 'done', count, usd: r.usd ?? null, at };
  }
  return { ok: true };
}

/** 초안에서 고른 값: source = 'avg' 또는 모델 키. 없으면 null */
export function draftValue(cell, source) {
  const st = cellStats(cell);
  if (!st.count) return null;
  return source === 'avg' ? clampScore(st.mean) : st.scores[source] ?? null;
}

/** 적용하면 이미 입력한 최종 점수가 바뀌는 칸 수 (덮어쓰기 확인용) */
export function draftOverwrites(data, source) {
  let n = 0;
  for (const c of data.candidates) {
    for (const k of data.criteria) {
      const cell = data.scores[c.id]?.[k.id];
      const v = draftValue(cell, source);
      if (v != null && cell.final != null && cell.final !== v) n++;
    }
  }
  return n;
}

/** 초안 적용 (F7-4): AI 점수가 있는 칸의 최종 점수를 source 값으로. 반환 { ok, changed } */
export function applyDraft(data, source, { candidateId, criterionId } = {}) {
  let changed = 0;
  for (const c of data.candidates) {
    if (candidateId && c.id !== candidateId) continue;
    for (const k of data.criteria) {
      if (criterionId && k.id !== criterionId) continue;
      const cell = data.scores[c.id]?.[k.id];
      const v = draftValue(cell, source);
      if (v == null || cell.final === v) continue;
      cell.final = v;
      changed++;
    }
  }
  return { ok: true, changed };
}
