// Excel(xlsx) 내보내기 — PRD F13-3·7. Implementation Plan Phase 10
// workbookSheets(data): 시트 6개를 행 배열로 만드는 순수 함수(Node 테스트 가능)
// exportExcel(data): SheetJS를 버튼을 누를 때 동적 import로 불러와 파일을 내려받게 한다.
// API 키·설정은 넣지 않는다(프로젝트 데이터만 사용).

import { groupWeights, resultsFor, researchCards } from '../selectors.js';
import { cellStats } from '../core/scores.js';
import { researchBasis } from '../core/research.js';
import { criterionInfo } from '../core/schema.js';
import { periodLong, durationText, companionText, familyDetailText, budgetText } from '../ui/format.js';
import { exportFileName } from '../ui/download.js';

export const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

const MODELS = [
  ['claude', 'Claude'],
  ['gpt', 'GPT'],
  ['gemini', 'Gemini'],
];
const FEATURE_KO = { recommend: '후보 추천', research: '자료 수집', scores: '점수 초안', panel: '최종 심사', chair: '의장 종합', test: '시험 호출' };
const SEASON_KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
const pct = (v) => (v == null ? '' : Math.round(v * 1000) / 10);
const round = (v, d = 1) => (v == null ? '' : Math.round(v * 10 ** d) / 10 ** d);
const or = (v) => v ?? '';

function basisCells(project, candidate) {
  const b = researchBasis(project, candidate);
  const when = b.period?.month ? `${b.period.month}월` : b.period?.season ? SEASON_KO[b.period.season] : b.period?.startDate ?? '미정';
  const nights = b.dayTrip ? '당일치기' : b.nights == null ? '미정' : `${b.nights}박 ${b.nights + 1}일`;
  return [when, nights];
}

/** 시트 6개: [{ name, rows }] (rows: 2차원 배열, 숫자는 숫자 그대로) */
export function workbookSheets(data, { now = new Date() } = {}) {
  const p = data.project;
  const overseas = p.tripType === 'overseas';
  const detail = familyDetailText(p.companion);

  // 1. 후보 (+ 프로젝트 요약)
  const candidates = [
    ['프로젝트', p.name],
    ['여행 종류', overseas ? '해외' : '국내'],
    ['출발지', p.origin],
    ['시기', p.period.mode === 'undecided' ? '미정' : periodLong(p.period)],
    ['기간', durationText(p.period)],
    ['동행', detail ? `${companionText(p.companion, p.travelers)} · ${detail}` : companionText(p.companion, p.travelers)],
    ['1인 예산', budgetText(p.budgetPerPerson)],
    ['내보낸 날짜', now.toISOString().slice(0, 10)],
    [],
    ['순번', '후보', overseas ? '국가' : '시·도', '공항 코드', '추가 방법', '조사 기준 시기', '조사 기준 일정', '메모'],
    ...data.candidates.map((c, i) => [i + 1, c.name, or(overseas ? c.country : c.region), or(c.code), c.source === 'ai' ? 'AI 추천' : '직접 추가', ...basisCells(p, c), or(c.note)]),
  ];

  // 2. 기준·가중치 (동행인별, CR)
  const g = groupWeights(data);
  const weights = [
    ['기준', '설명', '그룹 (%)', ...g.members.map((m) => `${m.name} (%)`)],
    ...data.criteria.map((k, j) => [k.name, or(criterionInfo(k, p.tripType)), pct(g.vector[j]), ...g.members.map((m) => pct(m.vector[j]))]),
    [],
    ['동행인', '방식', '영향력', 'CR', '비교한 쌍'],
    ...g.members.map((m) => [m.name, m.mode === 'ahp' ? 'AHP' : '단순', m.influence, m.mode === 'ahp' ? round(m.cr, 3) : '', m.mode === 'ahp' ? `${m.judged}/${m.total}` : '']),
    ['그룹', g.method === 'aij' ? 'AHP 판단 결합(AIJ)' : '가중 평균', '', g.cr == null ? '' : round(g.cr, 3), ''],
  ];

  // 3. 점수표 (최종 점수 + AI 점수·근거)
  const scores = [
    ['후보', '기준', '최종 점수', ...MODELS.map(([, n]) => n), 'AI 평균', '표준편차', ...MODELS.map(([, n]) => `${n} 근거`)],
    ...data.candidates.flatMap((c) =>
      data.criteria.map((k) => {
        const cell = data.scores[c.id]?.[k.id];
        const st = cellStats(cell);
        return [c.name, k.name, or(cell?.final), ...MODELS.map(([m]) => or(st.scores[m])), round(st.mean), st.count >= 2 ? round(st.sd, 2) : '', ...MODELS.map(([m]) => or(cell?.rationale?.[m]))];
      }),
    ),
  ];

  // 4. 결과 순위 (그룹 기준, 기준별 기여 점수)
  const r = resultsFor(data);
  const results = [
    ['순위', '후보', '종합 점수', ...data.criteria.map((k) => `${k.name} 기여`)],
    ...r.ranking.map((x) => [x.rank, data.candidates[x.index].name, round(x.score), ...r.contributions[x.index].map((v) => round(v))]),
    ...r.incomplete.map((id) => ['—', data.candidates.find((c) => c.id === id).name, '점수 미완성']),
  ];
  if (r.nearTie) results.push([], ['참고', '1·2위 차이가 3% 이내로 사실상 동점이에요']);

  // 5. 리서치 자료 (출처 포함)
  const research = [['후보', '항목', '확정값', '메모', ...MODELS.map(([, n]) => n), '모델 간 차이 (%)', '기준 시점', '확인 필요', '출처']];
  for (const c of data.candidates) {
    for (const item of researchCards(data, c).items) {
      if (!Object.keys(item.models).length && !item.confirmed && !item.note) continue;
      research.push([
        c.name,
        item.def.label,
        item.confirmed,
        item.note,
        ...MODELS.map(([m]) => or(item.models[m]?.value)),
        item.spread?.spread == null ? '' : pct(item.spread.spread),
        or(item.asOf),
        item.needsCheck ? '확인 필요' : '',
        item.sources.join('\n'),
      ]);
    }
  }

  // 6. AI 비용 기록
  const runs = data.aiRuns ?? [];
  const sum = (f) => runs.reduce((s, x) => s + (f(x) ?? 0), 0);
  const cost = [
    ['시각', '기능', '모델', '슬러그', '상태', '예상 입력 토큰', '예상 출력 토큰', '예상 USD', '실제 입력 토큰', '실제 출력 토큰', '실제 USD'],
    ...runs.map((x) => [
      x.at,
      FEATURE_KO[x.feature] ?? x.feature,
      x.model,
      or(x.modelSlug),
      x.status === 'failed' ? '실패' : '완료',
      or(x.estimate?.inTokens),
      or(x.estimate?.outTokens),
      x.estimate?.usd == null ? '' : round(x.estimate.usd, 4),
      or(x.actual?.inTokens),
      or(x.actual?.outTokens),
      x.actual?.usd == null ? '' : round(x.actual.usd, 4),
    ]),
    ['합계', '', '', '', `${runs.length}회`, '', '', round(sum((x) => x.estimate?.usd), 4), '', '', round(sum((x) => x.actual?.usd), 4)],
  ];

  return [
    { name: '후보', rows: candidates },
    { name: '기준·가중치', rows: weights },
    { name: '점수표', rows: scores },
    { name: '결과 순위', rows: results },
    { name: '리서치 자료', rows: research },
    { name: 'AI 비용 기록', rows: cost },
  ];
}

/** SheetJS 모듈로 통합 문서 만들기 (열 너비는 글자 수 기준, 최대 60) */
export function toWorkbook(XLSX, sheets) {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const widths = [];
    rows.forEach((row) => row.forEach((v, i) => (widths[i] = Math.max(widths[i] ?? 6, Math.min(60, String(v ?? '').split('\n')[0].length * 1.6 + 2)))));
    ws['!cols'] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return wb;
}

/** 브라우저: SheetJS를 지연 로딩해 TravelPick_<프로젝트명>_<YYYYMMDD>.xlsx로 저장 */
export async function exportExcel(data, { now = new Date() } = {}) {
  const XLSX = await import(SHEETJS_URL);
  const wb = toWorkbook(XLSX, workbookSheets(data, { now }));
  const filename = exportFileName(data.project.name, 'xlsx', now);
  XLSX.writeFile(wb, filename, { compression: true });
  return filename;
}
