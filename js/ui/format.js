// 화면 표시용 문자열 만들기 (DOM 없음, Node 테스트 대상)

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const SEASON_KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };

/** 출발 공항 이름 → IATA 코드 (모르면 null) */
const ORIGIN_AIRPORT = { 인천: 'ICN', 김포: 'GMP', 김해: 'PUS', 부산: 'PUS', 제주: 'CJU', 대구: 'TAE', 청주: 'CJJ', 무안: 'MWX', 양양: 'YNY' };

export const airportCodeOf = (origin) => ORIGIN_AIRPORT[origin] ?? null;

/** 출발지 표시: 해외는 공항 코드(ICN), 국내는 도시명 */
export function originLabel(project) {
  if (project.tripType === 'overseas') return airportCodeOf(project.origin) ?? project.origin;
  return project.origin;
}

/** 시기 짧은 표시: FEB / 가을 / 10.03 / TBD */
export function periodShort(period) {
  switch (period?.mode) {
    case 'month':
      return MONTH_ABBR[period.month - 1] ?? 'TBD';
    case 'season':
      return SEASON_KO[period.season] ?? 'TBD';
    case 'dates':
      return period.startDate ? period.startDate.slice(5).replace('-', '.') : 'TBD';
    default:
      return 'TBD';
  }
}

/** RouteNav 프로젝트 버튼 아래 한 줄: ICN · FEB · 4 PAX (DESIGN.md 6.1) */
export function projectSummaryLine(data) {
  const p = data.project;
  const pax = p.travelers ?? data.members.length;
  return `${originLabel(p)} · ${periodShort(p.period)} · ${pax} PAX`;
}

/** 시기 긴 표시: 2월 / 가을 (9~11월) / 2027.02.06 / 미정 */
export function periodLong(period) {
  switch (period?.mode) {
    case 'month':
      return period.month ? `${period.month}월` : '미정';
    case 'season': {
      const range = { spring: '3~5월', summer: '6~8월', autumn: '9~11월', winter: '12~2월' }[period.season];
      return range ? `${SEASON_KO[period.season]} (${range})` : '미정';
    }
    case 'dates':
      return period.startDate ? period.startDate.replaceAll('-', '.') : '미정';
    default:
      return '미정';
  }
}

/** 기간: 5박 6일 / 당일치기 / 미정 */
export function durationText(period) {
  if (period?.dayTrip) return '당일치기';
  if (period?.nights == null) return '미정';
  return `${period.nights}박 ${period.nights + 1}일`;
}

const COMPANION_KO = { solo: '혼자', couple: '연인·부부', friends: '친구', family: '가족' };
const FAMILY_DETAIL_KO = {
  with_kids: '아이 동반',
  with_parents: '부모님 동반',
  with_kids_and_parents: '아이·부모님 동반',
  adults_only: '성인만',
};

/** 동행 형태 + 인원: 가족 4명 / 혼자 */
export function companionText(companion, pax) {
  if (companion?.type === 'solo') return '혼자';
  return `${COMPANION_KO[companion?.type] ?? '동행'} ${pax}명`;
}

export function familyDetailText(companion) {
  return companion?.type === 'family' ? FAMILY_DETAIL_KO[companion.familyDetail] ?? null : null;
}

/** 1인 예산: 150만 원 / 123.5만 원 / 미정 */
export function budgetText(won) {
  if (won == null) return '미정';
  if (won < 10000) return `${won.toLocaleString('ko-KR')}원`;
  return `${(won / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만 원`;
}

export function formatUsd(usd) {
  if (usd == null) return '$ —';
  return `$ ${usd < 1 && usd > 0 ? usd.toFixed(3) : usd.toFixed(2)}`;
}

export function formatKrw(krw) {
  if (krw == null) return '—';
  return `약 ${Math.round(krw).toLocaleString('ko-KR')}원`;
}

/** 프로젝트의 실제 AI 비용 합계(USD) */
export function totalActualUsd(data) {
  return (data?.aiRuns ?? []).reduce((sum, r) => sum + (r.actual?.usd ?? 0), 0);
}
