// 결과 표시 컴포넌트 — DESIGN.md 6.3 DepartureBoard, 6.13 차트, 7장 01·04
import { h } from '../dom.js';
import { statusPill, panel, chip } from './basic.js';
import { flapCode, codeText, placeLabel } from './flapCode.js';
import { memberAvatar } from './member.js';
import { choiceGroup } from './form.js';
import { mountChart, token, withAlpha } from '../charts.js';
import { candidateStatus, criterionTones } from '../../selectors.js';
import { josaRo } from '../format.js';
import { changed, countTo } from '../motion.js';

export const candOf = (data, id) => data.candidates.find((c) => c.id === id);
export const candColorVar = (c) => `var(--c${(c.color ?? 0) + 1})`;
const candColorHex = (c) => token(`c${(c.color ?? 0) + 1}`);

/** 오키나와 · 일본 / 강릉 · 강원 */
export function placeCaption(c) {
  return [c.name, c.country ?? c.region].filter(Boolean).join(' · ');
}

const fmt = (v) => v.toFixed(1);
const pct = (v) => `${Math.round(v * 100)}%`;

// ── 출발 안내판 순위표 (6.3) ─────────────────────────────

export function departureBoard(data, results, { title = '후보 순위', meta = '그룹 가중치 기준' } = {}) {
  const domestic = data.project.tripType === 'domestic';
  const leader = results.ranking[0]?.score ?? 0;
  const row = (r) => {
    const c = data.candidates[r.index];
    const first = r.rank === 1;
    return h(
      'tr',
      { class: first && 'is-first' },
      h('td', { class: 'board__rank' }, String(r.rank).padStart(2, '0')),
      h('td', null, flapCode(c, { size: 20, dim: r.rank > 3, flip: changed(`board:${data.project.id}:${title}:${r.rank}`, c.id) })),
      h(
        'td',
        null,
        h(
          'span',
          { class: 'board__dest' },
          !placeLabel(c).ko && h('span', { class: 'board__name' }, c.name),
          h('span', { class: 'board__sub' }, (domestic ? c.region : c.country) ?? (domestic ? '국내' : '해외')),
        ),
      ),
      h(
        'td',
        { class: 'board__score' },
        h(
          'span',
          { class: 'board__score-wrap' },
          countTo(h('span', { class: ['board__num', r.rank > 3 && 'is-dim'] }), `board:${data.project.id}:${title}:${c.id}`, r.score, fmt),
          h('span', { class: 'board__bar', 'aria-hidden': 'true' }, h('span', { style: { width: `${r.score}%`, background: candColorVar(c) } })),
        ),
      ),
      h('td', null, statusPill(candidateStatus(r.rank, leader - r.score))),
    );
  };
  const incompleteRows = results.incomplete.map((id) => {
    const c = candOf(data, id);
    return h(
      'tr',
      { class: 'is-incomplete' },
      h('td', { class: 'board__rank' }, '—'),
      h('td', null, flapCode(c, { size: 20, dim: true })),
      h('td', null, h('span', { class: 'board__dest' }, !placeLabel(c).ko && h('span', { class: 'board__name' }, c.name), h('span', { class: 'board__sub' }, '점수 미완성'))),
      h('td', { class: 'board__score' }, h('span', { class: 'muted' }, '—')),
      h('td', null, statusPill('review')),
    );
  });
  return h(
    'section',
    { class: 'panel', 'aria-label': title },
    h('h2', { class: 'panel__title' }, title, h('span', { class: 'panel__meta' }, meta)),
    h(
      'div',
      { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': `${title} 표` },
      h(
        'table',
        { class: 'board' },
        h('thead', null, h('tr', null, ['순위', domestic ? '지명' : '코드', domestic ? '시·도' : '목적지', '종합 점수', '상태'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, results.ranking.map(row), incompleteRows),
      ),
    ),
  );
}

// ── 가중치 나침반 (6.13 도넛) ────────────────────────────

export function weightCompass(data, group) {
  const tones = criterionTones(group.vector);
  const items = data.criteria.map((c, i) => ({ c, v: group.vector[i], tone: tones[i] })).sort((a, b) => b.v - a.v);
  let acc = 0;
  const stops = items.map(({ v, tone }) => {
    const from = acc;
    acc += v * 100;
    return `var(--k${tone}) ${from}% ${acc}%`;
  });
  const crText = group.cr == null ? '—' : group.cr.toFixed(2);
  return panel({
    title: '가중치 나침반',
    children: h(
      'div',
      { class: 'compass' },
      h(
        'div',
        { class: 'compass__donut', role: 'img', 'aria-label': `기준별 그룹 가중치: ${items.map(({ c, v }) => `${c.name} ${pct(v)}`).join(', ')}`, style: { background: `conic-gradient(${stops.join(', ')})` } },
        h('div', { class: 'compass__hole' }, h('span', { class: 'compass__cr-label' }, 'CR'), h('span', { class: ['compass__cr', group.cr == null ? 'is-na' : group.cr >= 0.1 && 'is-bad'], title: group.cr == null ? '단순 모드가 섞여 있어 그룹 CR이 없어요' : null }, crText)),
      ),
      h(
        'ul',
        { class: 'compass__legend' },
        items.map(({ c, v, tone }) => h('li', null, h('span', { class: 'compass__swatch', style: { background: `var(--k${tone})` } }), `${c.name} ${Math.round(v * 100)}`)),
      ),
    ),
  });
}

// ── 탑승객별 1위 (F8-5) ──────────────────────────────────

export function memberPicks(data, picks, { title = '탑승객별 1위' } = {}) {
  return panel({
    title,
    children: h(
      'ul',
      { class: 'picks' },
      picks.members.map((m, i) => {
        const c = m.top && candOf(data, m.top);
        const differs = m.id === picks.mostDifferent;
        return h(
          'li',
          { class: ['pick', differs && 'is-warn'] },
          h('span', { class: 'pick__who' }, memberAvatar(data.members[i], i), h('span', null, m.name, differs && h('span', { class: 'pick__note' }, '그룹 결과와 차이가 가장 큼'))),
          c ? flapCode(c, { size: 15 }) : h('span', { class: 'muted' }, '—'),
        );
      }),
    ),
  });
}

// ── 상위 3곳 카드 (7장 04) ───────────────────────────────

function strengths(data, results, index) {
  const contrib = results.contributions[index];
  const top = contrib.map((v, j) => [v, j]).sort((a, b) => b[0] - a[0]).slice(0, 2);
  return `${top.map(([, j]) => data.criteria[j].name).join('·')}에서 강해요`;
}

export function rankCards(data, results, { label = '그룹 1위' } = {}) {
  const [first, ...rest] = results.ranking.slice(0, 3);
  if (!first) return null;
  const c1 = data.candidates[first.index];
  return h(
    'section',
    { class: 'rank-cards', 'aria-label': '상위 3곳' },
    h(
      'article',
      { class: 'rank-card rank-card--first on-paper' },
      h('span', { class: 'rank-card__label' }, `RANK 01 · ${label}`),
      h(
        'div',
        { class: 'rank-card__body' },
        codeText(c1, { size: 64, flip: changed(`rank:${data.project.id}:${label}:1`, c1.id) }),
        h('span', { class: 'rank-card__score' }, countTo(h('span'), `rank:${data.project.id}:${label}:${c1.id}`, first.score, fmt), h('small', null, ' / 100')),
      ),
      h('span', { class: 'rank-card__name' }, placeCaption(c1)),
      h('span', { class: 'rank-card__why' }, strengths(data, results, first.index)),
    ),
    rest.map((r) => {
      const c = data.candidates[r.index];
      return h(
        'article',
        { class: 'rank-card' },
        h('span', { class: 'rank-card__label' }, `RANK ${String(r.rank).padStart(2, '0')}`),
        h(
          'div',
          { class: 'rank-card__body' },
          codeText(c, { size: 40, flip: changed(`rank:${data.project.id}:${label}:${r.rank}`, c.id) }),
          countTo(h('span', { class: 'rank-card__score' }), `rank:${data.project.id}:${label}:${c.id}`, r.score, fmt),
        ),
        h('span', { class: 'rank-card__name' }, `${placeCaption(c)}`),
        h('span', { class: 'rank-card__why' }, `1위와 ${fmt(first.score - r.score)}점 차 · ${strengths(data, results, r.index)}`),
      );
    }),
  );
}

// ── 기여도 누적 막대 (6.13) ──────────────────────────────

export function contributionBars(data, results) {
  const tones = criterionTones(results.vector);
  const order = data.criteria.map((_, j) => j).sort((a, b) => results.vector[b] - results.vector[a]);
  return panel({
    title: '점수는 어디서 왔을까',
    meta: '종합 점수 = 기준별 기여도의 합',
    children: [
      h(
        'ul',
        { class: 'contrib' },
        results.ranking.map((r) => {
          const c = data.candidates[r.index];
          const parts = order.map((j) => ({ j, v: results.contributions[r.index][j] }));
          return h(
            'li',
            { class: 'contrib__row' },
            flapCode(c, { size: 14 }),
            h(
              'span',
              {
                class: 'contrib__track',
                role: 'img',
                'aria-label': `${c.name} ${fmt(r.score)}점: ${parts.map(({ j, v }) => `${data.criteria[j].name} ${fmt(v)}`).join(', ')}`,
              },
              parts.map(({ j, v }) => h('span', { class: 'contrib__seg', style: { width: `${v}%`, background: `var(--k${tones[j]})` }, title: `${data.criteria[j].name} ${fmt(v)}` })),
            ),
            h('span', { class: 'contrib__score' }, fmt(r.score)),
          );
        }),
      ),
      h(
        'ul',
        { class: 'contrib__legend' },
        order.map((j) => h('li', null, h('span', { class: 'compass__swatch', style: { background: `var(--k${tones[j]})` } }), `${data.criteria[j].name} ${pct(results.vector[j])}`)),
      ),
    ],
  });
}

// ── 레이더 (6.13) ────────────────────────────────────────

/** 차트 대신 읽을 수 있는 점수표 (12장 "차트마다 대응하는 표") */
export function scoreTableDetails(data, results) {
  return h(
    'details',
    { class: 'table-details' },
    h('summary', null, '표로 보기'),
    h(
      'div',
      { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': '차트 데이터 표' },
      h(
        'table',
        { class: 'wtable' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, '후보'), data.criteria.map((k) => h('th', { scope: 'col', class: 'num' }, k.name)), h('th', { scope: 'col', class: 'num' }, '종합'))),
        h(
          'tbody',
          null,
          results.ranking.map((r) =>
            h('tr', null, h('th', { scope: 'row' }, data.candidates[r.index].name), results.matrix[r.index].map((s) => h('td', { class: 'num' }, String(s))), h('td', { class: 'num' }, fmt(r.score))),
          ),
        ),
      ),
    ),
  );
}

export function radarPanel(ctx, data, results) {
  const hidden = new Set(ctx.ui().radarHidden ?? []);
  const order = data.criteria.map((_, j) => j).sort((a, b) => results.vector[b] - results.vector[a]);
  const ranked = results.ranking.map((r) => ({ r, c: data.candidates[r.index] }));
  const canvas = h('canvas', { role: 'img', 'aria-label': `기준별 점수 레이더 차트. ${ranked.map(({ c }) => c.name).join(', ')}. 표로 보기에서 같은 내용을 볼 수 있어요.` });

  mountChart('radar', canvas, () => ({
    type: 'radar',
    data: {
      labels: order.map((j) => data.criteria[j].name),
      datasets: ranked.map(({ r, c }, i) => {
        const color = candColorHex(c);
        return {
          label: c.name,
          data: order.map((j) => results.matrix[r.index][j]),
          borderColor: color,
          backgroundColor: i === 0 ? withAlpha(color, 0.16) : i === 1 ? withAlpha(color, 0.1) : 'transparent',
          fill: i < 2,
          borderWidth: i === 0 ? 2.5 : 2,
          borderDash: i < 2 ? [] : [5, 4],
          pointRadius: i < 2 ? 3 : 0,
          pointBackgroundColor: color,
          hidden: hidden.has(c.id),
        };
      }),
    },
    options: {
      scales: {
        r: {
          min: 0,
          max: 10,
          ticks: { stepSize: 2, display: false },
          grid: { color: token('line') },
          angleLines: { color: token('line') },
          pointLabels: { font: { size: 13 }, color: token('text-2') },
        },
      },
    },
  }));

  const legend = h(
    'div',
    { class: 'chart-legend', role: 'group', 'aria-label': '레이더에 보일 후보' },
    ranked.map(({ c }, i) =>
      h(
        'button',
        {
          type: 'button',
          id: `r-legend-${c.id}`,
          class: 'chart-legend__item',
          'aria-pressed': String(!hidden.has(c.id)),
          onClick: () => {
            const next = new Set(hidden);
            next.has(c.id) ? next.delete(c.id) : next.add(c.id);
            ctx.setUi({ radarHidden: [...next] });
          },
        },
        h('span', { class: ['chart-legend__line', i >= 2 && 'is-dashed'], style: { '--legend': candColorVar(c) } }),
        c.name,
      ),
    ),
  );

  return h(
    'section',
    { class: 'panel', id: 'results-radar', 'aria-label': '기준별 모양 비교' },
    h('h2', { class: 'panel__title' }, '기준별 모양 비교', h('span', { class: 'panel__meta' }, '축은 가중치 큰 순서')),
    legend,
    h('div', { class: 'chart-box chart-box--radar' }, canvas),
    scoreTableDetails(data, results),
  );
}

// ── 민감도 (6.13, F9-4) ──────────────────────────────────

/** "비용 가중치가 31%를 넘으면 1위가 타이베이로 바뀝니다" */
export function sensitivitySentence(data, s) {
  const crit = s.criterion.name;
  const nameOf = (id) => candOf(data, id).name;
  if (s.up && (!s.down || s.up.at - s.current <= s.current - s.down.at)) {
    return { lead: `${crit} 가중치가`, pct: pct(s.up.at), rest: `를 넘으면 1위가 ${josaRo(nameOf(s.up.leaderId))} 바뀝니다` };
  }
  if (s.down) {
    return { lead: `${crit} 가중치가`, pct: pct(s.down.at), rest: ` 아래로 내려가면 1위가 ${josaRo(nameOf(s.down.leaderId))} 바뀝니다` };
  }
  return { lead: `${crit} 가중치를 0~100%로 바꿔 봐도`, pct: '', rest: ` 1위는 ${nameOf(s.leaderId)} 그대로예요` };
}

export function sentenceNode(sentence, cls = 'sens__sentence') {
  return h('p', { class: cls }, sentence.lead, sentence.pct && ' ', sentence.pct && h('b', null, sentence.pct), sentence.rest);
}

export function sensitivityPanel(ctx, data, s, criterionIndex) {
  const sentence = sensitivitySentence(data, s);
  const top2 = [s.leaderId, ...[s.up?.leaderId, s.down?.leaderId].filter((id) => id && id !== s.leaderId)].slice(0, 2);
  if (top2.length < 2) {
    const second = data.candidates.find((c) => c.id !== s.leaderId && s.lines[data.candidates.indexOf(c)]);
    if (second) top2.push(second.id);
  }
  const lineOf = (id) => s.lines[data.candidates.findIndex((c) => c.id === id)];
  const flip = s.up ?? s.down;
  const canvas = h('canvas', { role: 'img', 'aria-label': `${s.criterion.name} 가중치에 따른 점수 변화. ${sentence.lead} ${sentence.pct}${sentence.rest}` });

  mountChart('sensitivity', canvas, () => {
    const colors = [token('sunset-ink'), token('chart-second')];
    const ink = token('ink');
    return {
      type: 'line',
      data: {
        datasets: top2.map((id, i) => {
          const l = lineOf(id);
          return {
            label: candOf(data, id).name,
            data: [
              { x: 0, y: l.intercept },
              { x: 100, y: l.intercept + l.slope },
            ],
            borderColor: colors[i],
            borderWidth: 3,
            pointRadius: 0,
          };
        }),
      },
      options: {
        scales: {
          x: { type: 'linear', min: 0, max: 100, ticks: { callback: (v) => `${v}%`, color: token('ink-muted') }, grid: { color: token('paper-line') } },
          y: { ticks: { color: token('ink-muted') }, grid: { color: token('paper-line') } },
        },
        plugins: { tooltip: { enabled: false } },
      },
      plugins: [
        {
          id: 'sensMarks',
          beforeDatasetsDraw(chart) {
            const { ctx: g, chartArea: a, scales } = chart;
            g.save();
            if (flip) {
              const x0 = scales.x.getPixelForValue(flip.at * 100);
              const x1 = flip === s.up ? a.right : a.left;
              g.fillStyle = token('chart-flip');
              g.fillRect(Math.min(x0, x1), a.top, Math.abs(x1 - x0), a.bottom - a.top);
            }
            const xc = scales.x.getPixelForValue(s.current * 100);
            g.setLineDash([4, 4]);
            g.strokeStyle = ink;
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(xc, a.top);
            g.lineTo(xc, a.bottom);
            g.stroke();
            g.setLineDash([]);
            g.fillStyle = ink;
            g.font = "12px 'JetBrains Mono', monospace";
            g.fillText(`현재 ${pct(s.current)}`, Math.min(xc + 6, a.right - 70), a.top + 14);
            g.restore();
          },
          afterDatasetsDraw(chart) {
            if (!flip) return;
            const l = lineOf(flip.leaderId);
            const { ctx: g, scales } = chart;
            g.save();
            g.fillStyle = ink;
            g.beginPath();
            g.arc(scales.x.getPixelForValue(flip.at * 100), scales.y.getPixelForValue(l.intercept + l.slope * flip.at), 5, 0, Math.PI * 2);
            g.fill();
            g.restore();
          },
        },
      ],
    };
  });

  return h(
    'section',
    { class: 'panel panel--paper sens on-paper', 'aria-label': '민감도 분석' },
    h('span', { class: 'sens__label' }, 'SENSITIVITY · 민감도 · 그룹 가중치 기준'),
    sentenceNode(sentence),
    choiceGroup({
      label: '살펴볼 기준',
      idPrefix: 'sens-crit',
      options: data.criteria.map((c, j) => ({ value: String(j), label: c.name })),
      selected: String(criterionIndex),
      onSelect: (v) => ctx.setUi({ sensCriterion: Number(v) }),
    }),
    h('div', { class: 'chart-box chart-box--line' }, canvas),
    h(
      'div',
      { class: 'chart-legend chart-legend--paper', 'aria-hidden': 'true' },
      top2.map((id, i) => h('span', { class: 'chart-legend__item' }, h('span', { class: 'chart-legend__line', style: { '--legend': i === 0 ? 'var(--sunset-ink)' : 'var(--chart-second)' } }), candOf(data, id).name)),
    ),
  );
}

/** 근소한 차이 안내 칩 (F9-5) */
export function tieChip(data, results) {
  if (!results.nearTie) return null;
  return chip(`1·2위 차이 ${fmt(results.ranking[0].score - results.ranking[1].score)}점 · 사실상 동점`, { variant: 'filter' });
}
