// 결정 리포트 문서 (미리보기 = 인쇄본) — PRD F13-5, 8장(print.css + window.print). DESIGN.md 9장 내보내기
import { h } from '../dom.js';
import { skeleton } from './basic.js';
import { markdownBlock } from '../markdown.js';

const table = (header, rows, cls) =>
  h('table', { class: ['rpt-table', cls] }, h('thead', null, h('tr', null, header.map((t) => h('th', { scope: 'col' }, t)))), h('tbody', null, rows.map((r) => h('tr', null, r.map((v) => h('td', null, v))))));

const section = (title, ...children) => h('section', { class: 'rpt-section' }, h('h2', null, title), children);

/**
 * report: export/report.js buildReport 결과. chartsPending: 차트를 만드는 중이면 자리 표시
 */
export function reportDocument(report, { chartsPending = false } = {}) {
  let n = 0;
  const num = (t) => `${++n}. ${t}`;
  const p = report.panel;
  return h(
    'article',
    { class: 'report on-paper', 'aria-label': report.title },
    h(
      'header',
      { class: 'rpt-cover' },
      h('span', { class: 'rpt-eyebrow' }, 'TRAVEL PICK · 결정 리포트'),
      h('h1', null, report.title),
      h('span', { class: 'rpt-date' }, `만든 날짜 ${report.generatedAt}`),
      report.decision &&
        h(
          'div',
          { class: 'rpt-decision' },
          h('span', { class: 'rpt-decision__label' }, `FINAL DECISION · ${report.decision.status}`),
          h('span', { class: 'rpt-decision__name' }, report.decision.name, report.decision.code && h('span', { class: 'rpt-decision__code' }, report.decision.code)),
          report.decision.where && h('span', { class: 'rpt-decision__where' }, report.decision.where),
          h('p', null, report.decision.note),
        ),
    ),
    section(num('여행 조건'), table(['항목', '내용'], report.trip, 'rpt-table--kv')),
    section(num('후보'), table(['후보', report.tripType === 'overseas' ? '국가' : '시·도', '공항 코드', '추가 방법', '조사 기준'], report.candidates.map((c) => [c.name, c.where, c.code, c.source, c.basis]))),
    section(num('기준과 가중치'), table(report.weights.header, report.weights.rows), h('ul', { class: 'rpt-notes' }, report.weights.notes.map((t) => h('li', null, t)))),
    section(num('점수표'), h('p', { class: 'rpt-muted' }, '1~10점, 높을수록 좋음. 종합은 그룹 가중치로 계산한 0~100점.'), table(report.scores.header, report.scores.rows, 'rpt-table--scores')),
    section(
      num('결과'),
      report.ranking.length ? table(['순위', '후보', '종합 점수', '상태'], report.ranking.map((r) => [String(r.rank), r.name, r.score, r.status])) : h('p', null, '점수가 다 찬 후보가 2곳 미만이라 순위를 계산하지 못했어요.'),
      report.nearTie && h('p', { class: 'rpt-warn' }, '1·2위 차이가 3% 이내로 사실상 동점이에요.'),
      report.incomplete.length > 0 && h('p', { class: 'rpt-muted' }, `점수 미완성: ${report.incomplete.join(', ')}`),
      chartsPending
        ? skeleton({ lines: 3, label: '차트를 만드는 중' })
        : h(
            'div',
            { class: 'rpt-charts' },
            report.charts.map((c) => h('figure', null, h('img', { src: c.png, alt: c.alt, width: c.width / 2, height: c.height / 2 }), h('figcaption', null, c.title))),
          ),
    ),
    report.sensitivity.length > 0 && section(num('민감도'), h('ul', null, report.sensitivity.map((t) => h('li', null, t)))),
    report.consensus.length > 0 && section(num('AI 합의 수준'), h('ul', null, report.consensus.map((t) => h('li', null, t)))),
    p &&
      section(
        num('AI 최종 심사'),
        h('p', { class: 'rpt-muted' }, `의장 ${p.chair} · ${p.depth} · 토론 후 합의 ${p.consensus}`),
        h('p', null, h('b', null, `최종 추천 ${p.chosen}`), ' · ', h('span', { class: p.matchesCalculation ? 'rpt-ok' : 'rpt-warn' }, p.matchesCalculation ? '계산 결과와 일치' : '계산 결과와 다름')),
        !p.matchesCalculation && h('p', { class: 'rpt-diff' }, h('b', null, '계산 결과와 다른 이유 · '), p.reasonIfDifferent ?? '의장이 이유를 밝히지 않았어요.'),
        p.markdown && markdownBlock(p.markdown),
        h(
          'div',
          { class: 'rpt-two' },
          p.agreements.length > 0 && h('div', null, h('h3', null, '합의한 점'), h('ul', null, p.agreements.map((t) => h('li', null, t)))),
          p.openIssues.length > 0 && h('div', null, h('h3', null, '남은 쟁점'), h('ul', null, p.openIssues.map((t) => h('li', null, t)))),
        ),
        p.opinions.length > 0 && table(['모델', '1위', '2위', '이유', '우려'], p.opinions.map((o) => [o.model, o.first, o.second ?? '—', o.reason, o.concerns])),
      ),
    section(
      num('결정 전 확인 체크리스트'),
      h('ul', { class: 'rpt-checks' }, report.checklist.map((c) => h('li', { class: c.checked && 'is-checked' }, h('span', { class: 'rpt-box', 'aria-hidden': 'true' }, c.checked ? '✓' : ''), h('span', null, c.text, c.checked && h('span', { class: 'visually-hidden' }, ' (확인함)'))))),
      h('p', { class: 'rpt-notice' }, report.notice),
    ),
    report.sources.length > 0 &&
      section(
        num('출처'),
        h('ol', { class: 'rpt-sources' }, report.sources.map((s) => h('li', null, h('span', { class: 'rpt-muted' }, `${s.candidate} · ${s.item} `), h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.url)))),
      ),
    h('footer', { class: 'rpt-foot' }, `AI 호출 ${report.cost.calls}회 · 실제 비용 $${report.cost.usd.toFixed(4)} · AI 정보는 틀릴 수 있으니 결정 전에 직접 확인하세요.`),
  );
}
