// 점수 입력 규칙 — PRD F7-1
// scores[candidateId][criterionId] = { final: 1~10, ai?: {...}, rationale? }  (AI 점수는 Phase 10)

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
