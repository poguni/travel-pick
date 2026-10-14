// 가중치 시각화 — DESIGN.md 6.12 CRGauge, 7장 03 "나의 가중치" 막대
import { h, s } from '../dom.js';
import { criterionTones } from '../../selectors.js';

const GAUGE_MAX = 0.2;
const pct = (v) => `${Math.round(v * 100)}%`;

/** 반원 위 비율 f(0=왼쪽 끝, 1=오른쪽 끝)의 좌표 */
function arcPoint(f, r) {
  const phi = Math.PI * (1 - f);
  return [120 + r * Math.cos(phi), 120 - r * Math.sin(phi)];
}

/**
 * 일관성 비율 게이지 (6.12). consistency: { lambdaMax, ci, ri, cr }, n: 기준 수
 * note: 게이지 아래 추가 안내 노드
 */
export function crGauge(consistency, { n, title = '일관성 비율', note } = {}) {
  const needed = n >= 3;
  const cr = consistency.cr;
  const ok = cr < 0.1;
  const f = Math.min(1, Math.max(0, cr / GAUGE_MAX));
  const [nx, ny] = arcPoint(f, 82);
  const verdict = !needed ? '기준이 2개 이하라 검사가 필요 없어요' : ok ? '일관성 양호 · 기준 0.10 미만' : '다시 검토해 주세요 · 기준 0.10 이상';
  return h(
    'section',
    { class: 'cr-card on-paper', 'aria-label': title },
    h('span', { class: 'cr-card__head' }, h('span', null, 'CONSISTENCY'), h('span', null, title)),
    s(
      'svg',
      { class: 'cr-gauge', width: '240', height: '136', viewBox: '0 0 240 136', fill: 'none', role: 'img', 'aria-label': `${title} ${cr.toFixed(2)}, 기준 0.10 ${ok ? '미만' : '이상'}` },
      s('path', { class: 'cr-gauge__track', d: 'M20 120 A100 100 0 0 1 220 120', 'stroke-width': '16', 'stroke-linecap': 'round' }),
      s('path', { class: 'cr-gauge__ok', d: 'M20 120 A100 100 0 0 1 120 20', 'stroke-width': '16', 'stroke-linecap': 'round' }),
      s('path', { class: 'cr-gauge__needle', d: `M120 120 L ${nx.toFixed(1)} ${ny.toFixed(1)}`, 'stroke-width': '3', 'stroke-linecap': 'round' }),
      s('circle', { class: 'cr-gauge__hub', cx: '120', cy: '120', r: '8' }),
      s('text', { x: '14', y: '134', class: 'cr-gauge__tick' }, '0'),
      s('text', { x: '110', y: '12', class: 'cr-gauge__tick' }, '0.10'),
      s('text', { x: '206', y: '134', class: 'cr-gauge__tick' }, '0.20'),
    ),
    h('span', { class: 'cr-card__value' }, cr.toFixed(2)),
    h('span', { class: ['cr-card__verdict', needed && !ok && 'is-bad'] }, verdict),
    note,
    h(
      'div',
      { class: 'cr-card__stats' },
      h('span', null, h('span', null, 'λmax'), h('b', null, consistency.lambdaMax.toFixed(2))),
      h('span', null, h('span', null, 'CI'), h('b', null, (consistency.ci ?? 0).toFixed(3))),
      h('span', null, h('span', null, `RI (n=${n})`), h('b', null, (consistency.ri ?? 0).toFixed(2))),
    ),
  );
}

/**
 * 가중치 막대: 큰 순서로, 색은 k1~k7 톤 (DESIGN 3장). 막대 길이는 최댓값 대비.
 */
export function weightBars(criteria, vector, { title = '나의 가중치', note } = {}) {
  const tones = criterionTones(vector);
  const max = Math.max(...vector, 1e-9);
  const rows = criteria.map((c, i) => ({ c, v: vector[i], tone: tones[i] })).sort((a, b) => b.v - a.v);
  return h(
    'section',
    { class: 'panel', 'aria-label': title },
    h('h2', { class: 'panel__title' }, title),
    h(
      'ul',
      { class: 'wbars' },
      rows.map(({ c, v, tone }) =>
        h(
          'li',
          { class: 'wbar' },
          h('span', { class: 'wbar__name' }, c.name),
          h('span', { class: 'wbar__track', 'aria-hidden': 'true' }, h('span', { class: 'wbar__fill', style: { width: `${(v / max) * 100}%`, background: `var(--k${tone})` } })),
          h('span', { class: 'wbar__pct' }, pct(v)),
        ),
      ),
    ),
    note && h('p', { class: 'muted' }, note),
  );
}
