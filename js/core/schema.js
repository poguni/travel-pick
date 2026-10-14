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

/** 관심사 태그 기본 목록 (F1-1) */
export const INTEREST_PRESETS = ['사진', '음식', '휴양', '자연', '도시', '역사', '쇼핑', '액티비티', '온천', '축제'];

/** 국내 후보 시·도 (F3-1) */
export const REGIONS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

/** 출발지 입력 제안 */
export const ORIGIN_SUGGESTIONS = {
  overseas: ['인천', '김포', '김해', '제주', '대구', '청주', '무안', '양양'],
  domestic: ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '수원', '청주', '전주'],
};

/** 후보 권장 수 (F3-2): 9곳 이상이면 비교 부담·AI 비용 안내 */
export const CANDIDATE_RECOMMENDED = { min: 3, max: 8 };
export const CANDIDATE_COLORS = 8;

/** 단순 모드 슬라이더 기본값(0~10) */
export const DEFAULT_SIMPLE_WEIGHT = 5;

export function seasonOfMonth(month) {
  return Object.keys(SEASON_MONTHS).find((s) => SEASON_MONTHS[s].includes(month)) ?? null;
}

export function newId() {
  return globalThis.crypto.randomUUID();
}

/** 기본 기준 설명 (F5-5 툴팁). 거리는 여행 종류에 따라 뜻이 다르다 */
export const CRITERION_INFO = {
  cost: '항공·교통·숙박·현지 물가를 합친 비용 부담. 부담이 적을수록 높은 점수',
  weather: '여행 시기의 기온·강수·날씨',
  distance: { overseas: '비행시간·환승 등 이동 부담. 가까울수록 높은 점수', domestic: '출발 도시에서의 이동시간·이동 수단 부담. 가까울수록 높은 점수' },
  food: '현지 음식의 만족도와 선택지',
  photo: '사진 촬영 명소, 풍경, 좋은 시간대',
  safety: '치안, 여행경보 단계, 자연재해 위험',
  hygiene: '식수·식품 위생, 감염병, 의료 접근성',
};

export function criterionInfo(criterion, tripType) {
  const info = CRITERION_INFO[criterion.id];
  return typeof info === 'object' ? info[tripType] : info ?? null;
}

/** 동행인 1명의 기본 가중치: 단순 모드, 모든 기준 같은 값 (형태는 core/weights.js 참고) */
export function defaultMemberWeights(criteria) {
  const raw = Object.fromEntries(criteria.map((c) => [c.id, DEFAULT_SIMPLE_WEIGHT]));
  return { mode: 'simple', raw, pairs: {}, judged: [], touched: false };
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
      travelers: 1,
      interests: [],
      exclude: '', // 추천 제외 조건 (F2-6)
      createdAt: now.toISOString(),
      lastBackupAt: null,
    },
    members: [me],
    candidates: [],
    criteria,
    weights: { [me.id]: defaultMemberWeights(criteria) },
    research: {},
    scores: {},
    scoreDraft: null, // AI 점수 초안 실행 상태 { key, at, byModel } — 모델 점수는 scores 셀의 ai·rationale에
    recommend: null, // AI 추천 결과 캐시 { key, at, byModel } — core/merge.js로 합쳐 표시
    panel: null, // AI 최종 심사 { depth, anonymized, chair, key, at, rounds, checks } — core/panel.js
    aiRuns: [],
    decision: { chosen: null, memo: '' },
  };
}

/** 단가 기본값: 2026-10-13 OpenRouter 모델 목록 기준 (토큰당 USD, 웹 검색은 1회당). docs/OpenRouter-Notes.md */
const PRICE_2026_10_13 = {
  claude: { prompt: 2e-6, completion: 1e-5, webSearch: 0.01 },
  gpt: { prompt: 1e-7, completion: 5e-7, webSearch: 0.01 },
  gemini: { prompt: 7.5e-7, completion: 3.75e-6, webSearch: 0.014 },
};

/**
 * 앱 설정 기본값 (API 키 제외). 슬러그·단가는 설정 화면에서 바꾸거나 모델 목록 API로 갱신한다(PRD F0-3·4).
 * pricing.fetchedAt이 null이면 위 기본값을 쓰는 중이라는 뜻.
 */
export function createDefaultSettings() {
  const model = (key, name, slug) => ({ key, name, slug, enabled: true, pricing: { ...PRICE_2026_10_13[key], fetchedAt: null } });
  return {
    schemaVersion: SCHEMA_VERSION,
    models: [
      model('claude', 'Claude Sonnet 5.5', 'anthropic/claude-sonnet-5.5'),
      model('gpt', 'GPT-6 Luna', 'openai/gpt-6-luna'),
      model('gemini', 'Gemini 3.8 Flash', 'google/gemini-3.8-flash'),
    ],
    chairModel: 'claude',
    webSearch: true,
    usdKrw: 1400,
    tokenRatio: { ko: 0.8, other: 0.25 }, // 한글 1글자·그 밖 1글자당 토큰 추정 (5.7-1)
    apiKeyStorage: 'local',
  };
}
