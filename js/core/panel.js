// AI 최종 심사 — PRD F11, 5.4, 10장(개인정보). Implementation Plan Phase 11
// 저장 형태: data.panel = { depth, anonymized, chair, key, at, rounds: { r1: { 모델: 결과 }, r2: { 모델: 결과 }, r3: { 모델: 결과 } }, checks: [bool] }
// 결과 = { status: 'done'|'failed'|'skipped', value?, usd, error?, raw?, at }

export const DEPTHS = {
  fast: { label: '빠르게', rounds: ['r1', 'r3'] },
  thorough: { label: '꼼꼼하게', rounds: ['r1', 'r2', 'r3'] },
};

export const STANCES = ['rebut', 'supplement', 'agree'];

const RAW_LIMIT = 4000;

/** 심사 입력이 지금 점수·가중치와 같은지 판단하는 키: 후보와 계산된 종합 점수(소수 1자리) */
export function panelKey(data, totals) {
  return JSON.stringify(data.candidates.map((c, i) => [c.id, totals[i] == null ? null : Math.round(totals[i] * 10) / 10]));
}

/** 동행인 이름 → 보낼 이름 ("구성원 N" 옵션, 10장) */
export const memberLabel = (members, anonymize) => (m) => (anonymize ? `구성원 ${members.indexOf(m) + 1}` : m.name);

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const strList = (v, max = 8) => (Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, max) : []);

/** R1 응답 다듬기: { first, second, reason, concerns } (후보 키 → id). 1위가 없으면 null */
export function sanitizeOpinion(value, candMap) {
  const first = candMap[value?.first];
  if (!first) return null;
  const second = candMap[value?.second];
  return { first, second: second && second !== first ? second : null, reason: str(value.reason), concerns: str(value.concerns) };
}

/** R2 응답 다듬기: [{ target, stance, text }] — 자기 자신·모르는 모델·빈 문장은 버린다 */
export function sanitizeResponses(value, self, models) {
  return (Array.isArray(value?.responses) ? value.responses : [])
    .filter((r) => r && models.includes(r.target) && r.target !== self && STANCES.includes(r.stance) && str(r.text))
    .map((r) => ({ target: r.target, stance: r.stance, text: str(r.text) }))
    .slice(0, 4);
}

/** R3 응답 다듬기: { markdown, chosen, consensus, agreements, openIssues, checklist, reasonIfDifferent } */
export function sanitizeVerdict(value, candMap, panelSize) {
  const chosen = candMap[value?.summary?.chosen];
  if (!chosen) return null;
  const s = value.summary;
  const consensus = Number.isInteger(s.consensus) ? Math.min(panelSize, Math.max(0, s.consensus)) : null;
  return {
    markdown: str(value.markdown).slice(0, 8000),
    chosen,
    consensus,
    agreements: strList(s.agreements),
    openIssues: strList(s.openIssues),
    checklist: strList(s.checklist, 10),
    reasonIfDifferent: str(s.reasonIfDifferent) || null,
  };
}

/**
 * 라운드 하나의 결과 기록. results: runner 결과(meta.model 생략 가능), clean(value, model) → 다듬은 값 또는 null
 * 응답은 왔지만 쓸 수 없는 값이면 실패(invalid_json)로 둔다.
 */
export function saveRound(data, round, results, clean, { at }) {
  const slot = (data.panel.rounds[round] ??= {});
  for (const r of results) {
    const value = r.ok ? clean(r.value, r.model) : null;
    slot[r.model] =
      r.ok && value
        ? { status: 'done', value, usd: r.usd ?? null, at }
        : { status: r.error?.kind === 'skipped' ? 'skipped' : 'failed', usd: r.usd ?? null, error: r.ok ? 'invalid_json' : r.error?.kind ?? 'unknown', raw: r.raw ? String(r.raw).slice(0, RAW_LIMIT) : null, at };
  }
  data.panel.at = at;
  return { ok: true };
}

/** 새 심사 시작: 이전 결과를 지운다 */
export function startPanel(data, { depth, anonymized, chair, key, at }) {
  data.panel = { depth, anonymized, chair, key, at, rounds: {}, checks: [] };
  return { ok: true };
}

export function toggleCheck(data, index, checked) {
  if (!data.panel) return { ok: false, error: 'noPanel' };
  data.panel.checks[index] = Boolean(checked);
  return { ok: true };
}

/** 최종 선택 저장 (F11 → 리포트) */
export function choose(data, candidateId) {
  if (!data.candidates.some((c) => c.id === candidateId)) return { ok: false, error: 'unknown' };
  data.decision.chosen = candidateId;
  return { ok: true };
}

const done = (round) => Object.entries(round ?? {}).filter(([, r]) => r.status === 'done');

/**
 * 화면용 정리. calcLeader: 계산 1위 후보 id
 * 반환: { opinions: [{ model, ...R1 }], responses: [{ from, target, stance, text }], verdict: { model, ...R3, matchesCalculation, consensus } | null }
 */
export function panelView(panel, calcLeader) {
  if (!panel) return null;
  const opinions = done(panel.rounds.r1).map(([model, r]) => ({ model, ...r.value }));
  const responses = done(panel.rounds.r2).flatMap(([from, r]) => r.value.map((x) => ({ from, ...x })));
  const r3 = done(panel.rounds.r3)[0];
  let verdict = null;
  if (r3) {
    const v = r3[1].value;
    // 합의 수는 AI 값이 없으면 R1에서 같은 1위를 고른 모델 수로
    const consensus = v.consensus ?? opinions.filter((o) => o.first === v.chosen).length;
    verdict = { model: r3[0], ...v, consensus, matchesCalculation: v.chosen === calcLeader };
  }
  return { opinions, responses, verdict };
}
