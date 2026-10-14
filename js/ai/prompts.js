// 기능별 프롬프트 (국내/해외 분기) — PRD 5.4
// Phase 8: 후보 추천(F2). 자료 수집·점수·심사는 Phase 9~11

const SEASON_KO = { spring: '봄(3~5월)', summer: '여름(6~8월)', autumn: '가을(9~11월)', winter: '겨울(12~2월)' };
const COMPANION_KO = { solo: '혼자', couple: '연인·부부', friends: '친구', family: '가족' };
const FAMILY_KO = { with_kids: '아이 동반', with_parents: '부모님 동반', with_kids_and_parents: '아이·부모님 모두 동반', adults_only: '성인 가족' };

const manwon = (won) => `${Math.round(won / 10000).toLocaleString('ko-KR')}만 원`;

function periodText(period) {
  if (period.mode === 'season') return SEASON_KO[period.season];
  if (period.mode === 'month') return `${period.month}월`;
  if (period.mode === 'dates') return period.startDate ? `${period.startDate} 출발` : '미정';
  return '미정';
}

function nightsText(period) {
  if (period.dayTrip) return '당일치기';
  return period.nights == null ? '미정' : `${period.nights}박 ${period.nights + 1}일`;
}

/** 여행 조건 요약 (모든 AI 프롬프트의 공통 맥락, PRD 5.4) */
export function conditionSummary(project) {
  const p = project;
  const companion = `${COMPANION_KO[p.companion.type]}${p.companion.familyDetail ? `(${FAMILY_KO[p.companion.familyDetail]})` : ''}, ${p.travelers}명`;
  return [
    `- 여행 종류: ${p.tripType === 'domestic' ? '국내 여행' : '해외 여행'}`,
    `- 출발지: ${p.origin}`,
    `- 시기: ${periodText(p.period)}`,
    `- 기간: ${nightsText(p.period)}`,
    `- 동행: ${companion}`,
    `- 1인 예산(교통·숙박·현지 경비 합계): ${p.budgetPerPerson ? manwon(p.budgetPerPerson) : '미정'}`,
    `- 관심사: ${p.interests.length ? p.interests.join(', ') : '없음'}`,
  ].join('\n');
}

const nullable = (type) => ({ type: [type, 'null'] });
const strings = { type: 'array', items: { type: 'string' } };

/** 추천 출력 스키마 (국내/해외, 미정 항목에 따라 필드가 달라진다) */
export function recommendSchema(project) {
  const overseas = project.tripType === 'overseas';
  const periodOpen = project.period.mode === 'undecided';
  const nightsOpen = project.period.nights == null && !project.period.dayTrip;
  const props = {
    name: { type: 'string' },
    ...(overseas ? { nameEn: { type: 'string' }, country: { type: 'string' }, code: nullable('string') } : { region: { type: 'string' } }),
    travel: nullable('string'),
    reason: { type: 'string' },
    trendEvidence: strings,
    sources: strings,
    tags: strings,
    motif: { type: 'string', enum: ['sea', 'city', 'mountain'] },
    ...(periodOpen ? { recommendedMonth: nullable('integer'), recommendedSeason: { type: ['string', 'null'], enum: ['spring', 'summer', 'autumn', 'winter', null] }, periodReason: nullable('string') } : {}),
    ...(nightsOpen ? { recommendedNights: nullable('integer') } : {}),
    overBudgetRisk: { type: 'boolean' },
  };
  return {
    name: 'destinations',
    schema: {
      type: 'object',
      required: ['destinations'],
      additionalProperties: false,
      properties: {
        destinations: {
          type: 'array',
          items: { type: 'object', required: Object.keys(props), additionalProperties: false, properties: props },
        },
      },
    },
  };
}

/** 추천 프롬프트 메시지 (F2-1~3, F2-6~8) */
export function recommendMessages(project, { today }) {
  const overseas = project.tripType === 'overseas';
  const periodOpen = project.period.mode === 'undecided';
  const nightsOpen = project.period.nights == null && !project.period.dayTrip;
  const system = [
    `너는 한국에 사는 여행자를 돕는 여행 큐레이터다. 오늘은 ${today}이다.`,
    `최근 3년 동안 인기가 오르고 있는 ${overseas ? '해외' : '국내(대한민국 안)'} 여행지를 5~8곳 추천한다. ${overseas ? '한국 안의 여행지는 넣지 않는다.' : '해외 여행지는 넣지 않는다.'}`,
    '',
    '출력 규칙',
    '- 요구한 JSON만 출력한다. 모든 글은 한국어로 쓴다. 추천 순서는 이 조건에 잘 맞는 순서다.',
    overseas
      ? '- name: 한국어 도시·지역명(예: 오키나와). nameEn: 영문명. country: 한국어 국가명. code: 가장 가까운 주요 공항의 IATA 3글자(모르면 null).'
      : '- name: 짧은 지명(예: "강원 강릉시" → "강릉"). region: 시·도 약칭(서울, 부산, 경기, 강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주 등).',
    overseas
      ? `- travel: ${project.origin} 출발 기준 비행시간(예: "직항 2h 15m"). 모르면 null.`
      : `- travel: ${project.origin} 출발 기준 대표 이동 수단과 시간(예: "KTX 1h 50m", "차 3h"). 모르면 null.`,
    '- reason: 이 동행 형태에 왜 맞는지 2문장 이내. 예산을 넘을 가능성이 있으면 그 이유도 쓴다.',
    `- trendEvidence: 인기가 오르고 있다는 구체적 근거(연도·수치 포함). 예: ${overseas ? '검색량·방문객 증가, 신규 직항 노선, 미디어 노출' : '검색량·방문객 증가, 신규 KTX·도로 개통, 지역 축제, 미디어 노출'}. 확인하지 못한 내용은 쓰지 않는다.`,
    '- sources: 근거를 확인한 웹 페이지 URL. 없으면 빈 배열. URL을 지어내지 않는다.',
    '- tags: 여행지 특징 2~3개(예: 겨울 휴양, 야경 촬영).',
    '- motif: 대표 분위기. 바다·섬이면 sea, 도시면 city, 산·자연·사원이면 mountain.',
    periodOpen && '- 시기가 미정이므로 recommendedMonth(1~12) 또는 recommendedSeason(spring/summer/autumn/winter) 중 하나에 가장 좋은 시기를, periodReason에 이유를 한 문장으로 쓴다.',
    nightsOpen && `- 기간이 미정이므로 recommendedNights에 적정 일정을 박 수로 쓴다(${overseas ? '' : '당일치기는 0, '}예: 3박 4일 → 3).`,
    project.budgetPerPerson
      ? '- 1인 예산 안에서 가능한 곳을 먼저 추천한다. 예산을 넘을 가능성이 있으면 overBudgetRisk를 true로 한다.'
      : '- 예산이 미정이므로 overBudgetRisk는 false로 둔다.',
    '- 모르는 값은 null로 둔다.',
  ]
    .filter((line) => line !== false && line != null)
    .join('\n');
  const user = [
    '여행 조건',
    conditionSummary(project),
    `- 제외 조건: ${project.exclude?.trim() || '없음'}`,
    '',
    '이 조건에 맞는 여행지를 추천해 줘.',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** 추천 실행 요청 (ai/runner.js planRun 입력). models: 호출할 모델 키 */
export function recommendRequest(project, { models, today }) {
  const domestic = project.tripType === 'domestic';
  const messages = recommendMessages(project, { today });
  const schema = recommendSchema(project);
  return {
    feature: 'recommend',
    label: `${domestic ? '국내' : '해외'} 후보 추천`,
    description: `세 AI가 웹 검색으로 요즘 떠오르는 ${domestic ? '국내' : '해외'} 여행지를 5~8곳씩 추천해요.`,
    calls: models.map((model) => ({ model, messages, schema, webSearch: true })),
  };
}

// ── Phase 9: 자료 수집 (F4) ──────────────────────────────

const MONTH_TEXT = (period) => (period?.month ? `${period.month}월` : period?.season ? SEASON_KO[period.season] : period?.startDate ? `${period.startDate} 출발` : null);

/** 조사 기준 시기·일정 문구 (core/research.js researchBasis 결과) */
export function basisText(basis) {
  const when = MONTH_TEXT(basis.period) ?? '미정(이 여행지를 가기 가장 좋은 시기로 가정)';
  const nights = basis.dayTrip ? '당일치기' : basis.nights == null ? '미정(적정 일정으로 가정)' : `${basis.nights}박 ${basis.nights + 1}일`;
  return { when: `${when}${basis.fromCandidate.period && basis.period ? ' (후보의 추천 시기)' : ''}`, nights: `${nights}${basis.fromCandidate.nights && basis.nights != null ? ' (후보의 적정 일정)' : ''}` };
}

const researchItemSchema = (numeric) => ({
  type: 'object',
  required: ['value', 'summary', 'sources', 'asOf', 'needsCheck', ...(numeric ? ['numeric'] : [])],
  additionalProperties: false,
  properties: {
    value: { type: 'string' },
    summary: { type: 'string' },
    sources: strings,
    asOf: nullable('string'),
    needsCheck: { type: 'boolean' },
    ...(numeric
      ? { numeric: { type: ['object', 'null'], required: ['min', 'max'], additionalProperties: false, properties: { min: nullable('number'), max: nullable('number') } } }
      : {}),
  },
});

/** 조사 출력 스키마 (국내/해외 항목이 다르다, F4-1). items: core/research.js RESEARCH_ITEMS[tripType] */
export function researchSchema(items) {
  const props = Object.fromEntries(items.map((d) => [d.id, researchItemSchema(Boolean(d.numeric))]));
  return {
    name: 'research',
    schema: {
      type: 'object',
      required: ['items'],
      additionalProperties: false,
      properties: { items: { type: 'object', required: Object.keys(props), additionalProperties: false, properties: props } },
    },
  };
}

/** 조사 프롬프트 (F4-1~3, 5.4·5.6) */
export function researchMessages(project, candidate, { items, basis, today }) {
  const overseas = project.tripType === 'overseas';
  const b = basisText(basis);
  const system = [
    `너는 한국에 사는 여행자를 위한 여행 조사원이다. 오늘은 ${today}이다. 웹 검색으로 확인한 사실만 쓴다.`,
    '',
    '조사 항목 (items의 키)',
    ...items.map((d) => `- ${d.id}: ${d.ask}${d.numeric ? ` → numeric에 ${d.numeric} 단위 숫자 범위 {min, max}` : ''}`),
    '',
    '출력 규칙',
    '- 요구한 JSON만 출력한다. 모든 글은 한국어로 쓴다.',
    '- value: 비교하기 쉬운 한 줄 결론(예: "왕복 35~45만 원", "최저 12℃·최고 19℃, 비 적음"). summary: 근거와 주의점 2문장 이내.',
    '- sources: 확인한 웹 페이지 URL. URL을 지어내지 않는다. asOf: 정보 기준 시점("2026-09" 형식), 모르면 null.',
    '- 출처가 없거나 확실하지 않으면 needsCheck를 true로 한다. 모르는 값은 value에 "확인 필요"라고 쓰고 numeric은 null로 둔다.',
    '- 가격은 대략적인 범위로만 쓴다(원화 기준). 시간은 시간 단위 소수(예: 2시간 30분 → 2.5).',
    overseas
      ? '- 안전·위생·비자는 외교부 해외안전여행, WHO, 질병관리청 등 공식 기관 정보를 우선 근거로 한다.'
      : '- 안전·위생은 기상청, 행정안전부(재난안전), 지자체 공식 관광 정보를 우선 근거로 한다. 비자·여행경보·항공권 항목은 다루지 않는다.',
  ].join('\n');
  const where = overseas ? [candidate.country, candidate.code].filter(Boolean).join(', ') : candidate.region;
  const user = [
    '여행 조건',
    conditionSummary(project),
    '',
    `조사 대상: ${candidate.name}${where ? ` (${where})` : ''}`,
    `조사 기준 시기: ${b.when}`,
    `조사 기준 일정: ${b.nights}`,
    '',
    '위 여행지를 조사 항목대로 조사해 줘.',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * 조사 실행 요청. targets: [{ candidate, models: [키...], basis }]. items: RESEARCH_ITEMS[tripType]
 * 호출마다 meta.candidateId를 붙여 결과를 후보에 나눠 담는다.
 */
export function researchRequest(project, targets, { items, today }) {
  const schema = researchSchema(items);
  const calls = targets.flatMap(({ candidate, models, basis }) => {
    const messages = researchMessages(project, candidate, { items, basis, today });
    return models.map((model) => ({ model, messages, schema, webSearch: true, meta: { candidateId: candidate.id } }));
  });
  const n = new Set(targets.map((t) => t.candidate.id)).size;
  return {
    feature: 'research',
    label: n === 1 ? `${targets[0].candidate.name} 자료 수집` : `후보 ${n}곳 자료 수집`,
    description: `웹 검색으로 ${project.tripType === 'domestic' ? '국내' : '해외'} 조사 항목 ${items.length}개를 모아요. 후보마다 모델별로 한 번씩 호출해요.`,
    calls,
  };
}

// ── Phase 10: 점수 초안 (F7-2) ───────────────────────────

/**
 * 후보 한 곳의 근거 요약: 사용자 확정값 → 메모 → AI 조사 값(서로 다른 값 최대 2개). 조사가 없으면 빈 배열
 * itemDefs: RESEARCH_ITEMS[tripType]
 */
export function evidenceLines(research, itemDefs) {
  if (!research) return [];
  return itemDefs.flatMap((d) => {
    const confirmed = research.confirmed?.[d.id];
    const note = research.notes?.[d.id];
    const aiValues = [...new Set(['claude', 'gpt', 'gemini'].map((m) => research[m]?.status === 'done' && research[m].items?.[d.id]?.value).filter(Boolean))].slice(0, 2);
    if (!confirmed && !note && !aiValues.length) return [];
    const parts = [confirmed && `[확정] ${confirmed}`, note && `[메모] ${note}`, !confirmed && aiValues.length && `[AI 조사] ${aiValues.join(' / ')}`].filter(Boolean);
    return [`  - ${d.label}: ${parts.join(' · ')}`];
  });
}

/** 점수 초안 출력 스키마: 후보 × 기준 칸 배열 */
export function scoreSchema() {
  return {
    name: 'scores',
    schema: {
      type: 'object',
      required: ['scores'],
      additionalProperties: false,
      properties: {
        scores: {
          type: 'array',
          items: {
            type: 'object',
            required: ['c', 'k', 'score', 'rationale'],
            additionalProperties: false,
            properties: { c: { type: 'string' }, k: { type: 'string' }, score: { type: 'integer' }, rationale: { type: 'string' } },
          },
        },
      },
    },
  };
}

/**
 * 점수 초안 요청 (F7-2, 5.4: 확정값 우선). 점수표 전체를 모델마다 한 번에.
 * criteria: [{ id, name, info }] (info: 기준 설명), itemDefs: RESEARCH_ITEMS[tripType]
 * 반환: { request, map } — map은 짧은 키(c1, k1) → 실제 id
 */
export function scoreRequest(data, { models, today, criteria, itemDefs, basisOf }) {
  const project = data.project;
  const map = { c: {}, k: {} };
  const candLines = data.candidates.flatMap((c, i) => {
    const key = `c${i + 1}`;
    map.c[key] = c.id;
    const where = project.tripType === 'overseas' ? [c.country, c.code].filter(Boolean).join(', ') : c.region;
    const ev = evidenceLines(data.research[c.id], itemDefs);
    return [`- ${key}: ${c.name}${where ? ` (${where})` : ''} · 조사 기준 ${basisOf(c)}`, ...(ev.length ? ev : ['  - (조사 자료 없음: 일반 지식으로 판단하고 rationale에 "자료 없음"을 밝힌다)'])];
  });
  const critLines = criteria.map((k, j) => {
    const key = `k${j + 1}`;
    map.k[key] = k.id;
    return `- ${key}: ${k.name}${k.info ? ` — ${k.info}` : ''}`;
  });
  const system = [
    `너는 여행지 비교 평가자다. 오늘은 ${today}이다.`,
    '후보 × 기준의 모든 칸에 1~10점(정수)을 매긴다. 이 여행자에게 좋을수록 높은 점수다. 비용은 부담이 적을수록, 거리는 가까울수록 높은 점수다.',
    '',
    '규칙',
    '- 요구한 JSON만 출력한다. c는 후보 키, k는 기준 키를 그대로 쓴다. 모든 칸을 빠짐없이 채운다.',
    '- [확정] 값은 여행자가 직접 확인한 값이므로 가장 우선하는 근거로 쓴다. 그다음 [메모], [AI 조사] 순서다.',
    '- 후보끼리 비교해 점수 차이가 드러나게 매긴다(모두 같은 점수 금지).',
    '- rationale: 한국어 한 줄(40자 안팎)로 근거를 쓴다.',
  ].join('\n');
  const user = ['여행 조건', conditionSummary(project), '', '기준', ...critLines, '', '후보와 조사 자료', ...candLines].join('\n');
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const cells = data.candidates.length * criteria.length;
  return {
    map,
    request: {
      feature: 'scores',
      label: '점수 초안',
      description: `세 AI가 후보 ${data.candidates.length}곳 × 기준 ${criteria.length}개, ${cells}칸에 점수와 근거를 매겨요. 웹 검색은 쓰지 않아요.`,
      calls: models.map((model) => ({ model, messages, schema: scoreSchema(), webSearch: false, outTokens: Math.max(400, cells * 40) })),
    },
  };
}

// ── Phase 11: AI 최종 심사 (F11) ─────────────────────────

const MODEL_NAME = { claude: 'Claude', gpt: 'GPT', gemini: 'Gemini' };
const STANCE_KO = { rebut: '반박', supplement: '보완', agree: '동의' };

/**
 * 심사 공통 맥락 (F11-1, 5.4: 짧게). 후보는 짧은 키(c1…)로 보낸다.
 * input: { criteria, vector, totals, ranking, nearTie, picks: [{ label, top }], itemDefs }
 * 반환: { text, candMap: { c1: 후보 id }, keyOf: { 후보 id: c1 } }
 */
export function panelContext(data, input) {
  const { criteria, vector, totals, ranking, nearTie, picks, itemDefs } = input;
  const candMap = {};
  const keyOf = {};
  data.candidates.forEach((c, i) => {
    candMap[`c${i + 1}`] = c.id;
    keyOf[c.id] = `c${i + 1}`;
  });
  const name = (id) => `${keyOf[id]} ${data.candidates.find((c) => c.id === id)?.name}`;
  const rankOf = Object.fromEntries(ranking.map((r) => [r.id, r.rank]));
  const lines = [
    '여행 조건',
    conditionSummary(data.project),
    '',
    '후보와 조사 자료',
    ...data.candidates.flatMap((c, i) => {
      const where = data.project.tripType === 'overseas' ? [c.country, c.code].filter(Boolean).join(', ') : c.region;
      const ev = evidenceLines(data.research[c.id], itemDefs);
      return [`- ${keyOf[c.id]}: ${c.name}${where ? ` (${where})` : ''}${totals[i] == null ? ' · 점수 미완성' : ` · 계산 ${totals[i].toFixed(1)}점 (${rankOf[c.id]}위)`}`, ...ev];
    }),
    '',
    '기준과 그룹 가중치',
    ...criteria.map((k, j) => `- ${k.name} ${Math.round(vector[j] * 100)}%`),
    '',
    '확정 점수표 (1~10, 높을수록 좋음)',
    ...data.candidates.map((c) => `- ${name(c.id)}: ${criteria.map((k) => `${k.name} ${data.scores[c.id]?.[k.id]?.final ?? '–'}`).join(', ')}`),
    '',
    `계산 결과 (가중합): ${ranking.map((r) => `${r.rank}위 ${name(r.id)} ${r.score.toFixed(1)}`).join(' / ')}${nearTie ? ' — 1·2위가 3% 이내로 사실상 동점' : ''}`,
    ...(picks.length > 1 ? ['', '동행인별 1위 (각자 가중치 기준)', ...picks.map((p) => `- ${p.label}: ${p.top ? name(p.top) : '없음'}`)] : []),
  ];
  return { text: lines.join('\n'), candMap, keyOf };
}

const PANEL_SYSTEM = (today) =>
  [
    `너는 여행지 결정 심사단의 한 명이다. 오늘은 ${today}이다.`,
    '- 계산된 순위를 그대로 따르지 말고 자료와 조건을 보고 독립적으로 판단한다. 계산 결과와 다르게 판단하면 그 이유를 밝힌다.',
    '- 요구한 JSON만 출력한다. 모든 글은 한국어로, 짧고 구체적으로 쓴다. 후보는 c1 같은 키로 가리킨다.',
    '- 자료에 없는 사실을 단정하지 않는다. 확인이 필요한 점은 우려나 체크리스트로 남긴다.',
  ].join('\n');

export const opinionSchema = () => ({
  name: 'opinion',
  schema: {
    type: 'object',
    required: ['first', 'second', 'reason', 'concerns'],
    additionalProperties: false,
    properties: { first: { type: 'string' }, second: nullable('string'), reason: { type: 'string' }, concerns: { type: 'string' } },
  },
});

export const responsesSchema = () => ({
  name: 'responses',
  schema: {
    type: 'object',
    required: ['responses'],
    additionalProperties: false,
    properties: {
      responses: {
        type: 'array',
        items: {
          type: 'object',
          required: ['target', 'stance', 'text'],
          additionalProperties: false,
          properties: { target: { type: 'string', enum: ['claude', 'gpt', 'gemini'] }, stance: { type: 'string', enum: ['rebut', 'supplement', 'agree'] }, text: { type: 'string' } },
        },
      },
    },
  },
});

export const verdictSchema = () => ({
  name: 'verdict',
  schema: {
    type: 'object',
    required: ['markdown', 'summary'],
    additionalProperties: false,
    properties: {
      markdown: { type: 'string' },
      summary: {
        type: 'object',
        required: ['chosen', 'consensus', 'matchesCalculation', 'agreements', 'openIssues', 'checklist', 'reasonIfDifferent'],
        additionalProperties: false,
        properties: {
          chosen: { type: 'string' },
          consensus: { type: 'integer' },
          matchesCalculation: { type: 'boolean' },
          agreements: strings,
          openIssues: strings,
          checklist: strings,
          reasonIfDifferent: nullable('string'),
        },
      },
    },
  },
});

const opinionText = (o, keyOf) => `[${MODEL_NAME[o.model]}] 1위 ${keyOf[o.first]}${o.second ? `, 2위 ${keyOf[o.second]}` : ''} · 이유: ${o.reason} · 우려: ${o.concerns || '없음'}`;

/** R1 독립 의견 (F11-2) */
export function r1Messages(context, { today }) {
  return [
    { role: 'system', content: `${PANEL_SYSTEM(today)}\n\n1라운드: 다른 심사위원의 의견을 보지 않고 1위·2위와 이유(2문장 이내), 가장 큰 우려 1가지를 쓴다.` },
    { role: 'user', content: `${context.text}\n\n독립 의견을 줘.` },
  ];
}

/** R2 상호 비판 (F11-3): 나머지 모델의 R1 의견을 읽고 각각에 동의·반박·보완 */
export function r2Messages(context, self, opinions, { today }) {
  const others = opinions.filter((o) => o.model !== self);
  return [
    {
      role: 'system',
      content: `${PANEL_SYSTEM(today)}\n\n2라운드: 다른 심사위원의 1라운드 의견마다 하나씩 답한다. target은 그 심사위원 키(${others.map((o) => o.model).join(', ')}), stance는 rebut(반박)·supplement(보완)·agree(동의) 중 하나, text는 근거를 담은 한두 문장.`,
    },
    { role: 'user', content: `${context.text}\n\n다른 심사위원의 1라운드 의견\n${others.map((o) => `- ${o.model}: ${opinionText(o, context.keyOf)}`).join('\n')}\n\n각 의견에 답해 줘.` },
  ];
}

/** R3 의장 종합 (F11-4·5) */
export function r3Messages(context, opinions, responses, { today, calcLeaderKey }) {
  const r2 = responses.length ? `\n\n2라운드 상호 비판\n${responses.map((r) => `- ${MODEL_NAME[r.from]} → ${MODEL_NAME[r.target]} (${STANCE_KO[r.stance]}): ${r.text}`).join('\n')}` : '';
  return [
    {
      role: 'system',
      content: [
        PANEL_SYSTEM(today),
        '',
        '3라운드: 너는 의장이다. 심사위원 의견을 종합해 최종 결론을 낸다.',
        '- summary.chosen: 최종 추천 후보 키. consensus: 최종 결론에 동의하는 심사위원 수(0~3).',
        `- matchesCalculation: chosen이 계산 1위(${calcLeaderKey})와 같으면 true. 다르면 reasonIfDifferent에 이유를 2문장 이내로 반드시 쓰고, 같으면 null.`,
        '- agreements: 심사위원이 합의한 점 2~4개. openIssues: 남은 쟁점 1~3개. checklist: 결정 전에 여행자가 직접 확인할 것 3~5개(예: 실제 항공권 가격 검색).',
        '- markdown: 결론과 근거를 Markdown으로 짧게(제목 없이 문단 2~3개, 목록 가능, 300자 안팎).',
      ].join('\n'),
    },
    { role: 'user', content: `${context.text}\n\n1라운드 독립 의견\n${opinions.map((o) => `- ${opinionText(o, context.keyOf)}`).join('\n')}${r2}\n\n최종 결론을 정리해 줘.` },
  ];
}
