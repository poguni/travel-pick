// 데이터 스키마 v3 기본값과 여행 조건 상수 — PRD 7장, F1-5~F1-10

export const SCHEMA_VERSION = 3;

export const TRIP_TYPES = ['overseas', 'domestic'];

/** 출발지 기본값: 해외는 공항, 국내는 도시 (F1-6) */
export const DEFAULT_ORIGIN = { overseas: '인천', domestic: '서울' };

/** 계절 → 한국 기준 달 (F1-7) */
export const SEASON_MONTHS = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
};

export const PERIOD_MODES = ['season', 'month', 'dates', 'undecided'];
export const COMPANION_TYPES = ['solo', 'couple', 'friends', 'family'];
export const FAMILY_DETAILS = ['with_kids', 'with_parents', 'with_kids_and_parents', 'adults_only'];

/** 기본 기준 7개 (F5-1) */
export const DEFAULT_CRITERIA = [
  { id: 'cost', name: '비용' },
  { id: 'weather', name: '날씨' },
  { id: 'distance', name: '거리' },
  { id: 'food', name: '음식' },
  { id: 'photo', name: '사진 촬영' },
  { id: 'safety', name: '안전' },
  { id: 'hygiene', name: '위생' },
].map((c) => ({ ...c, type: 'qualitative', direction: 'higher_better' }));

export const MAX_CRITERIA = 9;

/** 단순 모드 슬라이더 기본값(0~10) */
export const DEFAULT_SIMPLE_WEIGHT = 5;

export function seasonOfMonth(month) {
  return Object.keys(SEASON_MONTHS).find((s) => SEASON_MONTHS[s].includes(month)) ?? null;
}

export function newId() {
  return globalThis.crypto.randomUUID();
}

/** 동행인 1명의 기본 가중치: 단순 모드, 모든 기준 같은 값 */
export function defaultMemberWeights(criteria) {
  const raw = Object.fromEntries(criteria.map((c) => [c.id, DEFAULT_SIMPLE_WEIGHT]));
  return { mode: 'simple', raw, vector: criteria.map(() => 1 / criteria.length) };
}

/** 새 프로젝트 데이터 (스키마 v3) */
export function createProject({ name = '새 여행', tripType = 'overseas', id = newId(), now = new Date() } = {}) {
  const criteria = DEFAULT_CRITERIA.map((c) => ({ ...c }));
  const me = { id: 'm1', name: '나', influence: 1 };
  return {
    schemaVersion: SCHEMA_VERSION,
    project: {
      id,
      name,
      tripType,
      origin: DEFAULT_ORIGIN[tripType],
      period: { mode: 'undecided', season: null, month: null, startDate: null, nights: null, dayTrip: false },
      budgetPerPerson: null,
      companion: { type: 'solo', familyDetail: null },
      interests: [],
      createdAt: now.toISOString(),
      lastBackupAt: null,
    },
    members: [me],
    candidates: [],
    criteria,
    weights: { [me.id]: defaultMemberWeights(criteria) },
    research: {},
    scores: {},
    aiRuns: [],
    decision: { chosen: null, memo: '' },
  };
}

/**
 * 앱 설정 기본값 (API 키 제외). 모델 슬러그·단가·웹 검색 요금은
 * Phase 7에서 OpenRouter 문서를 확인한 뒤 채운다(PRD 14.2).
 */
export function createDefaultSettings() {
  return {
    schemaVersion: SCHEMA_VERSION,
    models: [
      { key: 'claude', name: 'Claude Sonnet 5.5', slug: '', enabled: true, pricing: null },
      { key: 'gpt', name: 'GPT-6 Luna', slug: '', enabled: true, pricing: null },
      { key: 'gemini', name: 'Gemini 3.8 Flash', slug: '', enabled: true, pricing: null },
    ],
    chairModel: 'claude',
    webSearch: true,
    usdKrw: 1400,
    apiKeyStorage: 'local',
  };
}
