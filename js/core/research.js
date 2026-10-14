// 자료 수집 — PRD F4(F4-1 조사 항목 표), F4-5·6, 5.6. Implementation Plan Phase 9
// 저장 형태: data.research[후보 id] = { claude|gpt|gemini: { status, key, at, items, citations, usd, error?, raw? }, confirmed: { 항목: 글 }, notes: { 항목: 글 } }

/**
 * 조사 항목 (F4-1). numeric: 모델 간 수치 비교용 단위(F4-4). 국내에는 비자·여행경보·항공 항목이 없다.
 * ask: 프롬프트에 넣는 조사 내용
 */
const COMMON_HEAD = [
  { id: 'weather', label: '날씨', mono: 'WEATHER', ask: '조사 기준 시기의 기온(최저~최고 ℃)·강수·날씨 특징' },
  { id: 'food', label: '음식', mono: 'FOOD', ask: '대표 음식과 동행 형태에 맞는 식당 선택지' },
  { id: 'photo', label: '사진 촬영', mono: 'PHOTO', ask: '사진 촬영 명소와 추천 시간대' },
  { id: 'fit', label: '동행 적합도', mono: 'FIT', ask: '이 동행 형태(가족 세부 형태 포함)에 맞는 정도와 이유' },
];

export const RESEARCH_ITEMS = {
  overseas: [
    ...COMMON_HEAD,
    { id: 'flightPrice', label: '항공권', mono: 'AIRFARE', numeric: '원', ask: '출발지 기준 왕복 항공권 1인 대략 가격대(원)' },
    { id: 'flightTime', label: '비행시간', mono: 'FLIGHT', numeric: '시간', ask: '편도 비행시간과 직항 여부' },
    { id: 'lodging', label: '숙박비', mono: 'STAY', numeric: '원', ask: '중급 숙소 1박 대략 범위(원)' },
    { id: 'prices', label: '현지 물가', mono: 'PRICES', ask: '현지 물가 수준(한국 대비)과 1인 1일 경비' },
    { id: 'visa', label: '비자·입국', mono: 'ENTRY', ask: '한국 여권 기준 비자·입국 조건' },
    { id: 'safety', label: '안전', mono: 'SAFETY', ask: '치안, 외교부 여행경보 단계, 자연재해 시기' },
    { id: 'hygiene', label: '위생', mono: 'HYGIENE', ask: '식수, 식품 안전, 감염병·예방접종 권고, 의료 접근성' },
  ],
  domestic: [
    ...COMMON_HEAD,
    { id: 'transportCost', label: '교통비', mono: 'FARE', numeric: '원', ask: '출발 도시 기준 이동 수단별(KTX·고속버스·자가용·국내선) 편도 1인 대략 비용(원)' },
    { id: 'transportTime', label: '이동 시간', mono: 'TRANSIT', numeric: '시간', ask: '이동 수단별 편도 소요 시간' },
    { id: 'lodging', label: '숙박비', mono: 'STAY', numeric: '원', ask: '중급 숙소 1박 대략 범위(원)와 성수기 여부' },
    { id: 'prices', label: '현지 물가', mono: 'PRICES', ask: '현지 물가 수준과 1인 1일 경비' },
    { id: 'safety', label: '안전', mono: 'SAFETY', ask: '자연재해·기상 위험 시기(태풍, 폭설 등), 혼잡도' },
    { id: 'hygiene', label: '위생', mono: 'HYGIENE', ask: '식품 위생, 의료 접근성(가까운 응급실 등)' },
  ],
};

/** 안전·위생 고정 안내 (5.6) */
export const SAFETY_NOTICE = {
  overseas: '안전·위생·비자 정보는 바뀔 수 있어요. 출발 전 외교부 해외안전여행(0404.go.kr)과 질병관리청 해외감염병NOW에서 꼭 확인하세요.',
  domestic: '출발 전 기상청 특보와 교통편 예매 현황을 꼭 확인하세요. 항공·숙박 가격은 대략적인 범위예요.',
};

/**
 * 조사 기준 시기·일정 (F4-1, F1-11): 프로젝트 값, 미정이면 후보의 plannedPeriod·plannedNights.
 * 반환: { period: { season }|{ month }|{ startDate }|null, nights: 숫자|null, dayTrip, fromCandidate: { period, nights } }
 */
export function researchBasis(project, candidate) {
  const p = project.period;
  let period = null;
  if (p.mode === 'season') period = { season: p.season };
  else if (p.mode === 'month') period = { month: p.month };
  else if (p.mode === 'dates') period = p.startDate ? { startDate: p.startDate } : null;
  const periodFromCandidate = p.mode === 'undecided';
  if (periodFromCandidate) period = candidate.plannedPeriod ?? null;
  const nightsFromCandidate = p.nights == null && !p.dayTrip;
  const nights = nightsFromCandidate ? candidate.plannedNights ?? null : p.nights;
  return { period, nights, dayTrip: p.dayTrip, fromCandidate: { period: periodFromCandidate, nights: nightsFromCandidate } };
}

/** 캐시 키 (F4-6): 같은 후보·같은 조사 기준이면 같은 값 */
export function researchKey(project, candidate) {
  const b = researchBasis(project, candidate);
  return JSON.stringify([project.tripType, project.origin, candidate.name, candidate.code, b.period, b.nights, b.dayTrip, project.companion, project.travelers]);
}

const isUrl = (u) => typeof u === 'string' && /^https?:\/\/\S+$/i.test(u.trim());
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** 숫자 범위 다듬기: { min, max } (하나만 있으면 같은 값), 둘 다 없으면 null */
function cleanNumeric(n) {
  if (!n || typeof n !== 'object') return null;
  let [min, max] = [num(n.min), num(n.max)];
  if (min == null && max == null) return null;
  min ??= max;
  max ??= min;
  return min <= max ? { min, max } : { min: max, max: min };
}

/** 항목 하나 다듬기 (F4-2·3): 출처가 없으면 확인 필요 */
export function sanitizeResearchItem(raw, def) {
  if (!raw || typeof raw !== 'object') return null;
  const value = typeof raw.value === 'string' ? raw.value.trim() : '';
  if (!value) return null;
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).filter(isUrl).map((u) => u.trim()).slice(0, 6);
  return {
    value,
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    sources,
    asOf: typeof raw.asOf === 'string' && raw.asOf.trim() ? raw.asOf.trim() : null,
    needsCheck: raw.needsCheck === true || sources.length === 0,
    numeric: def.numeric ? cleanNumeric(raw.numeric) : null,
  };
}

/** AI 응답 { items: { 항목: {...} } } → { 항목: 다듬은 값 } (없거나 잘못된 항목은 빠짐) */
export function sanitizeResearch(value, tripType) {
  const items = value?.items ?? {};
  const out = {};
  for (const def of RESEARCH_ITEMS[tripType]) {
    const item = sanitizeResearchItem(items[def.id], def);
    if (item) out[def.id] = item;
  }
  return out;
}

const RAW_LIMIT = 4000;

/**
 * 조사 실행 결과 기록. results: runner 결과(meta.candidateId 포함). keys: { 후보 id: researchKey }
 * 실행한 후보·모델 칸만 바꾸고, 확정값·메모·다른 모델 결과는 그대로 둔다.
 */
export function saveResearchResults(data, results, { keys, at }) {
  for (const r of results) {
    const id = r.meta?.candidateId;
    if (!id || !data.candidates.some((c) => c.id === id)) continue; // 실행 중에 지운 후보
    const slot = (data.research[id] ??= { confirmed: {}, notes: {} });
    slot[r.model] = r.ok
      ? { status: 'done', key: keys[id], at, items: sanitizeResearch(r.value, data.project.tripType), citations: r.citations?.length ?? 0, usd: r.usd ?? null }
      : { status: 'failed', key: keys[id], at, items: {}, citations: 0, usd: r.usd ?? null, error: r.error?.kind ?? 'unknown', raw: r.raw ? String(r.raw).slice(0, RAW_LIMIT) : null };
  }
  return { ok: true };
}

/** 확정값(F4-5) 입력. 비우면 지운다 */
export function setConfirmed(data, candidateId, itemId, text) {
  const slot = (data.research[candidateId] ??= { confirmed: {}, notes: {} });
  slot.confirmed ??= {};
  const v = String(text ?? '').trim().slice(0, 200);
  if (v) slot.confirmed[itemId] = v;
  else delete slot.confirmed[itemId];
  return { ok: true };
}

/** 수동 메모(F4-5). 비우면 지운다 */
export function setResearchNote(data, candidateId, itemId, text) {
  const slot = (data.research[candidateId] ??= { confirmed: {}, notes: {} });
  slot.notes ??= {};
  const v = String(text ?? '').trim().slice(0, 500);
  if (v) slot.notes[itemId] = v;
  else delete slot.notes[itemId];
  return { ok: true };
}

/**
 * 모델 한 개의 후보 조사 상태: 'done'(지금 조건으로 완료) | 'stale'(조건이 바뀜) | 'failed' | 'none'
 */
export function researchStatus(data, candidate, model) {
  const r = data.research[candidate.id]?.[model];
  if (!r) return 'none';
  if (r.status === 'failed') return 'failed';
  return r.key === researchKey(data.project, candidate) ? 'done' : 'stale';
}

export const SEASON_LABEL = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
