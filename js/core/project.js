// 여행 조건·동행인·후보 변경 규칙 — PRD F1-5~F1-11, F3, F8-1
// 모든 함수는 프로젝트 데이터(스키마 v3)를 그 자리에서 고치고 { ok, error? }를 돌려준다.
// (state.update 안의 사본에 대해 호출하므로 원본 상태는 안전하다)

import {
  DEFAULT_ORIGIN,
  SEASON_MONTHS,
  CANDIDATE_RECOMMENDED,
  CANDIDATE_COLORS,
  defaultMemberWeights,
  newId,
} from './schema.js';
import { sanitizeList } from './merge.js';

const OK = { ok: true };
const fail = (error) => ({ ok: false, error });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clean = (s) => String(s ?? '').trim();

// ── 여행 종류·출발지 ─────────────────────────────────────

/** 후보가 하나라도 있으면 잠김 (한 프로젝트는 국내나 해외 한쪽만) */
export function setTripType(data, tripType) {
  const p = data.project;
  if (p.tripType === tripType) return OK;
  if (data.candidates.length) return fail('locked');
  if (!p.origin || p.origin === DEFAULT_ORIGIN[p.tripType]) p.origin = DEFAULT_ORIGIN[tripType];
  p.tripType = tripType;
  if (tripType === 'overseas') p.period.dayTrip = false;
  return OK;
}

export function setOrigin(data, origin) {
  data.project.origin = clean(origin) || DEFAULT_ORIGIN[data.project.tripType];
  return OK;
}

export function setProjectName(data, name) {
  const n = clean(name);
  if (!n) return fail('nameRequired');
  data.project.name = n;
  return OK;
}

// ── 시기·기간 ────────────────────────────────────────────

export function setPeriodMode(data, mode) {
  const period = data.project.period;
  period.mode = mode;
  if (mode === 'season') period.season ??= 'spring';
  if (mode === 'month') period.month ??= 1;
  return OK;
}

/** patch: { season, month, startDate, nights, dayTrip } */
export function updatePeriod(data, patch) {
  const p = data.project;
  const period = p.period;
  if (patch.dayTrip) {
    if (p.tripType !== 'domestic') return fail('dayTripDomesticOnly');
    period.dayTrip = true;
    period.nights = 0;
    return OK;
  }
  if ('dayTrip' in patch) period.dayTrip = false;
  if ('nights' in patch) {
    period.nights = patch.nights == null || patch.nights === '' ? null : clamp(Math.round(Number(patch.nights)), 0, 30);
    period.dayTrip = false;
  }
  if (patch.season) period.season = patch.season;
  if (patch.month) period.month = clamp(Number(patch.month), 1, 12);
  if ('startDate' in patch) period.startDate = patch.startDate || null;
  return OK;
}

// ── 동행 형태·인원·예산·관심사 ───────────────────────────

export function setCompanion(data, type) {
  const p = data.project;
  p.companion.type = type;
  if (type !== 'family') p.companion.familyDetail = null;
  if (type === 'solo') p.travelers = 1;
  else if (type === 'couple') p.travelers = 2;
  else p.travelers = Math.max(2, p.travelers);
  return OK;
}

export function setFamilyDetail(data, detail) {
  if (data.project.companion.type !== 'family') return fail('notFamily');
  data.project.companion.familyDetail = detail;
  return OK;
}

export function setTravelers(data, n) {
  const p = data.project;
  if (p.companion.type === 'solo') return n === 1 ? OK : fail('soloIsOne');
  const min = 2;
  p.travelers = clamp(Math.round(Number(n)) || min, min, 99);
  return OK;
}

/** 만 원 단위 입력 → 원. 비우거나 0 이하면 미정(null) */
export function setBudgetManwon(data, manwon) {
  const v = Number(clean(manwon));
  data.project.budgetPerPerson = clean(manwon) && v > 0 ? Math.round(v * 10000) : null;
  return OK;
}

export function toggleInterest(data, tag) {
  const list = data.project.interests;
  const i = list.indexOf(tag);
  if (i >= 0) list.splice(i, 1);
  else list.push(tag);
  return OK;
}

export function addInterest(data, tag) {
  const t = clean(tag);
  if (!t) return fail('empty');
  if (!data.project.interests.includes(t)) data.project.interests.push(t);
  return OK;
}

/** 추천 제외 조건 (F2-6): 자유 입력 */
export function setExclude(data, text) {
  data.project.exclude = clean(text).slice(0, 200);
  return OK;
}

/** 추천 캐시 키: 추천 결과에 영향을 주는 여행 조건이 같으면 같은 값 (Phase 8 캐시) */
export function recommendKey(project) {
  const { tripType, origin, period, budgetPerPerson, companion, travelers, interests, exclude } = project;
  return JSON.stringify([tripType, origin, period, budgetPerPerson, companion, travelers, [...interests].sort(), exclude ?? '']);
}

// ── 동행인 (F8-1) ────────────────────────────────────────

export function addMember(data, name) {
  const n = clean(name);
  if (!n) return fail('nameRequired');
  const next = 1 + Math.max(0, ...data.members.map((m) => Number(m.id.replace(/\D/g, '')) || 0));
  const id = `m${next}`;
  data.members.push({ id, name: n, influence: 1 });
  data.weights[id] = defaultMemberWeights(data.criteria);
  const p = data.project;
  if (p.travelers < data.members.length && p.companion.type !== 'solo') p.travelers = data.members.length;
  return { ok: true, id };
}

export function renameMember(data, id, name) {
  const n = clean(name);
  if (!n) return fail('nameRequired');
  const m = data.members.find((x) => x.id === id);
  if (m) m.name = n;
  return OK;
}

export function removeMember(data, id) {
  if (data.members.length <= 1) return fail('lastMember');
  data.members = data.members.filter((m) => m.id !== id);
  delete data.weights[id];
  return OK;
}

// ── 후보 (F3) ────────────────────────────────────────────

/** 'season:autumn' → { season: 'autumn' }, 'month:10' → { month: 10 } */
export function parsePlannedPeriod(value) {
  const [kind, v] = clean(value).split(':');
  if (kind === 'season' && v in SEASON_MONTHS) return { season: v };
  if (kind === 'month' && Number(v) >= 1 && Number(v) <= 12) return { month: Number(v) };
  return null;
}

/** 지금 후보들이 쓰지 않는 가장 작은 색 번호 (모두 쓰면 개수 순환) */
function nextColor(candidates) {
  const used = new Set(candidates.map((c) => c.color));
  for (let i = 0; i < CANDIDATE_COLORS; i++) if (!used.has(i)) return i;
  return candidates.length % CANDIDATE_COLORS;
}

/**
 * input: { name, country, region, code, note, plannedPeriod: 'season:autumn' | 'month:10', plannedNights }
 * 해외는 country·code, 국내는 region만 쓴다. 시기·기간이 정해진 프로젝트에서는 조사 기준 시기를 무시.
 */
export function addCandidate(data, input, { source = 'manual' } = {}) {
  const p = data.project;
  const name = clean(input.name);
  if (!name) return fail('nameRequired');
  if (data.candidates.some((c) => c.name === name)) return fail('duplicate');

  let code = null;
  if (p.tripType === 'overseas' && clean(input.code)) {
    code = clean(input.code).toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) return fail('badCode');
  }

  const periodOpen = p.period.mode === 'undecided';
  const nightsOpen = p.period.nights == null && !p.period.dayTrip;
  const nights = clean(input.plannedNights);

  const id = `c-${newId()}`;
  data.candidates.push({
    id,
    name,
    country: p.tripType === 'overseas' ? clean(input.country) || null : null,
    region: p.tripType === 'domestic' ? clean(input.region) || null : null,
    code,
    source,
    note: clean(input.note),
    plannedPeriod: periodOpen ? parsePlannedPeriod(input.plannedPeriod) : null,
    plannedNights: nightsOpen && nights !== '' ? clamp(Math.round(Number(nights)), 0, 30) : null,
    color: nextColor(data.candidates),
  });
  return { ok: true, id };
}

/** 후보와 그 후보의 자료·점수·최종 선택을 함께 지운다 */
export function removeCandidate(data, id) {
  data.candidates = data.candidates.filter((c) => c.id !== id);
  delete data.research[id];
  delete data.scores[id];
  if (data.decision.chosen === id) data.decision.chosen = null;
  return OK;
}

/** 'few'(3곳 미만) | 'many'(9곳 이상) | null */
export function candidateCountNotice(count) {
  if (count < CANDIDATE_RECOMMENDED.min) return 'few';
  if (count > CANDIDATE_RECOMMENDED.max) return 'many';
  return null;
}

// ── AI 추천 (F2) ─────────────────────────────────────────

const RAW_LIMIT = 4000;

/**
 * AI 추천 실행 결과를 data.recommend에 기록한다.
 * results: runner의 결과 [{ model, ok, value, citations, usd, error, raw }]
 * 조건 키가 바뀌었거나 replace면 이전 결과를 버리고, 아니면(실패한 모델만 다시 시도) 해당 모델만 바꾼다.
 */
export function saveRecommendResults(data, results, { key, at, replace = false }) {
  if (replace || data.recommend?.key !== key) data.recommend = { key, at, byModel: {} };
  data.recommend.at = at;
  for (const r of results) {
    data.recommend.byModel[r.model] = r.ok
      ? { status: 'done', items: sanitizeList(r.value, data.project.tripType), citations: r.citations?.length ?? 0, usd: r.usd ?? null, at }
      : { status: 'failed', items: [], citations: 0, usd: r.usd ?? null, error: r.error?.kind ?? 'unknown', raw: r.raw ? String(r.raw).slice(0, RAW_LIMIT) : null, at };
  }
  return OK;
}

const plannedValue = (p) => (p?.month ? `month:${p.month}` : p?.season ? `season:${p.season}` : '');

/** 합친 추천 항목 하나를 후보로 담는다 (F2-5). 추천 시기·일정은 미정 프로젝트에서만 plannedPeriod·plannedNights로 (F2-7) */
export function addRecommended(data, item) {
  return addCandidate(
    data,
    { name: item.name, country: item.country, region: item.region, code: item.code, plannedPeriod: plannedValue(item.plannedPeriod), plannedNights: item.plannedNights ?? '' },
    { source: 'ai' },
  );
}

// ── 백업 권유 (F13-8) ────────────────────────────────────

export const BACKUP_DAYS = 7;

/** 마지막 JSON 백업(없으면 만든 날) 뒤로 days일이 지났는가 */
export function backupDue(project, now = new Date(), days = BACKUP_DAYS) {
  const last = Date.parse(project.lastBackupAt ?? project.createdAt);
  return Number.isFinite(last) && now.getTime() - last >= days * 86400000;
}
