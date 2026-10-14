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
