// 결정 리포트 데이터 — PRD F13-4·5, 5.6. Implementation Plan Phase 12
// 미리보기(ui/components/report.js)·PDF(인쇄)·Word(export/word.js)가 모두 buildReport 결과 하나를 쓴다.
// 차트 PNG는 브라우저에서 reportCharts(export/charts.js)로 만들어 report.charts에 붙인다.

import { resultsFor, groupWeights, candidateStatus, sensitivityFor, consensusSummary, researchCards } from '../selectors.js';
import { panelView, DEPTHS } from '../core/panel.js';
import { researchBasis, SAFETY_NOTICE, SEASON_LABEL } from '../core/research.js';
import { periodLong, durationText, companionText, familyDetailText, budgetText, josaRo } from '../ui/format.js';
import { MODEL_META } from '../ui/components/ai.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const STATUS_KO = { lead: '유력', contend: '경합', review: '검토' };
const LEVEL_KO = { high: '높음', mid: '보통', low: '낮음' };

/** 결정 전에 늘 확인할 것 (5.6: 가격은 대략적 범위, 공식 기관 확인) */
const FIXED_CHECKS = {
  overseas: ['실제 항공권·숙박 가격 검색 (앱의 가격은 대략적인 범위예요)', '외교부 해외안전여행·질병관리청 해외감염병NOW 확인', '비자·입국 조건과 여권 유효기간 확인'],
  domestic: ['실제 교통편·숙박 가격과 예매 현황 확인 (앱의 가격은 대략적인 범위예요)', '기상청 특보와 여행 시기 날씨 확인'],
};

function basisText(project, c) {
  const b = researchBasis(project, c);
  const when = b.period?.month ? `${b.period.month}월` : b.period?.season ? SEASON_LABEL[b.period.season] : b.period?.startDate ?? '미정';
  const nights = b.dayTrip ? '당일치기' : b.nights == null ? '미정' : `${b.nights}박 ${b.nights + 1}일`;
  return `${when} · ${nights}`;
}

/** 민감도 문장: 역전 지점이 가까운 기준부터 최대 3개 (F9-4) */
function sensitivityLines(data) {
  const nameOf = (id) => data.candidates.find((c) => c.id === id).name;
  const lines = [];
  data.criteria.forEach((k, j) => {
    const s = sensitivityFor(data, j);
    if (!s) return;
    const flips = [s.up && { ...s.up, dir: 'up' }, s.down && { ...s.down, dir: 'down' }].filter(Boolean);
    for (const f of flips) {
      lines.push({
        distance: Math.abs(f.at - s.current),
        text: `${k.name} 가중치가 ${pct(f.at)}${f.dir === 'up' ? '를 넘으면' : ' 아래로 내려가면'} 1위가 ${josaRo(nameOf(f.leaderId))} 바뀝니다 (지금 ${pct(s.current)}).`,
      });
    }
  });
  lines.sort((a, b) => a.distance - b.distance);
  return lines.length ? lines.slice(0, 3).map((l) => l.text) : ['어떤 기준의 가중치를 0~100%로 바꿔도 1위가 바뀌지 않아요.'];
}

/**
 * 리포트 데이터 (순수 함수). now: 만든 날짜
 */
export function buildReport(data, { now = new Date() } = {}) {
  const p = data.project;
  const overseas = p.tripType === 'overseas';
  const cand = (id) => data.candidates.find((c) => c.id === id);
  const results = resultsFor(data);
  const g = groupWeights(data);
  const leaderId = results.ranking[0]?.id ?? null;
  const view = panelView(data.panel, leaderId);
  const verdict = view?.verdict ?? null;
  const chosen = data.decision.chosen && cand(data.decision.chosen);
  const detail = familyDetailText(p.companion);
  const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;

  const decisionOf = () => {
    if (chosen) return { name: chosen.name, code: chosen.code, where: overseas ? chosen.country : chosen.region, status: '확정', note: chosen.id === leaderId ? '계산 1위와 같은 후보예요.' : `계산 1위(${cand(leaderId)?.name ?? '—'})와 다른 후보를 골랐어요.` };
    if (leaderId) return { name: cand(leaderId).name, code: cand(leaderId).code, where: overseas ? cand(leaderId).country : cand(leaderId).region, status: '결정 전', note: '아직 최종 결정 전이에요. 계산 1위를 표시해요.' };
    return null;
  };

  const s = consensusSummary(data);
  const consensus = [
    s.recommend.ratio != null && `추천 중복도 ${pct(s.recommend.ratio)} (${LEVEL_KO[s.recommend.level]})`,
    s.numeric.ratio != null && `수치 차이 30% 이상 ${s.numeric.diverged}/${s.numeric.compared}항목 (${LEVEL_KO[s.numeric.level]})`,
    s.scores.meanSd != null && `점수 의견 차이 σ ${s.scores.meanSd.toFixed(1)} (${LEVEL_KO[s.scores.level]})`,
  ].filter(Boolean);

  const panelChecks = verdict ? verdict.checklist.map((text, i) => ({ text, checked: Boolean(data.panel.checks?.[i]) })) : [];

  const sources = [];
  const seen = new Set();
  for (const c of data.candidates) {
    for (const item of researchCards(data, c).items) {
      for (const url of item.sources) {
        if (seen.has(url)) continue;
        seen.add(url);
        sources.push({ candidate: c.name, item: item.def.label, url });
      }
    }
  }

  return {
    title: `${p.name} 결정 리포트`,
    projectName: p.name,
    generatedAt: date,
    tripType: p.tripType,
    decision: decisionOf(),
    trip: [
      ['여행 종류', overseas ? '해외 여행' : '국내 여행'],
      ['출발지', p.origin],
      ['시기', p.period.mode === 'undecided' ? '미정 (후보별 추천 시기)' : periodLong(p.period)],
      ['기간', durationText(p.period)],
      ['동행', detail ? `${companionText(p.companion, p.travelers)} · ${detail}` : companionText(p.companion, p.travelers)],
      ['1인 예산', budgetText(p.budgetPerPerson)],
      ['관심사', p.interests.length ? p.interests.join(', ') : '없음'],
    ],
    candidates: data.candidates.map((c) => ({ name: c.name, where: (overseas ? c.country : c.region) ?? '', code: c.code ?? '', source: c.source === 'ai' ? 'AI 추천' : '직접 추가', basis: basisText(p, c) })),
    weights: {
      header: ['기준', '그룹', ...g.members.map((m) => m.name)],
      rows: data.criteria.map((k, j) => [k.name, pct(g.vector[j]), ...g.members.map((m) => pct(m.vector[j]))]),
      notes: [
        ...g.members.filter((m) => m.mode === 'ahp').map((m) => `${m.name}: AHP, CR ${m.cr.toFixed(3)}${m.cr > 0.1 ? ' (0.1 초과 · 판단 다시 보기 권장)' : ''}`),
        g.method === 'aij' ? `그룹: AHP 판단 결합(AIJ), CR ${g.cr.toFixed(3)}` : '그룹: 동행인 가중치의 가중 평균',
      ],
    },
    scores: {
      header: ['후보', ...data.criteria.map((k) => k.name), '종합'],
      rows: data.candidates.map((c, i) => [c.name, ...data.criteria.map((k) => String(data.scores[c.id]?.[k.id]?.final ?? '–')), results.totals[i] == null ? '—' : results.totals[i].toFixed(1)]),
    },
    ranking: results.ranking.map((r) => ({ rank: r.rank, name: cand(r.id).name, score: r.score.toFixed(1), status: STATUS_KO[candidateStatus(r.rank, results.ranking[0].score - r.score)] })),
    incomplete: results.incomplete.map((id) => cand(id).name),
    nearTie: results.nearTie,
    sensitivity: results.ranking.length >= 2 ? sensitivityLines(data) : [],
    consensus,
    panel: verdict && {
      depth: DEPTHS[data.panel.depth].label,
      chair: MODEL_META[verdict.model].name,
      chosen: cand(verdict.chosen).name,
      consensus: `${verdict.consensus}/${Object.keys(data.panel.rounds.r1 ?? {}).length || 3}`,
      matchesCalculation: verdict.matchesCalculation,
      reasonIfDifferent: verdict.reasonIfDifferent,
      markdown: verdict.markdown,
      agreements: verdict.agreements,
      openIssues: verdict.openIssues,
      opinions: view.opinions.map((o) => ({ model: MODEL_META[o.model].name, first: cand(o.first).name, second: o.second ? cand(o.second).name : null, reason: o.reason, concerns: o.concerns })),
    },
    checklist: [...panelChecks, ...FIXED_CHECKS[p.tripType].map((text) => ({ text, checked: false }))],
    notice: SAFETY_NOTICE[p.tripType],
    sources,
    cost: { usd: (data.aiRuns ?? []).reduce((t, r) => t + (r.actual?.usd ?? 0), 0), calls: (data.aiRuns ?? []).length },
    charts: [],
  };
}

/** Markdown을 글자만 남긴 문단으로 (Word용: 굵게·목록 기호만 정리) */
export function markdownToParagraphs(md) {
  return String(md ?? '')
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*]\s+/, '• ').replace(/^#+\s*/, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)').replace(/<[^>]*>/g, '').trim())
    .filter(Boolean);
}
