// 탑승권 카드 — DESIGN.md 6.2 BoardingPass (해외·국내·미정 변형)
import { h, s } from '../dom.js';
import { codeText } from './flapCode.js';

const PLANE_PATH = 'M0 6 L14 6 L20 0 L23 0 L19 6 L26 6 L29 3 L31 3 L29 7 L31 11 L29 11 L26 8 L19 8 L23 14 L20 14 L14 8 L0 8 Z';

/** 출발지 → 목적지 사이 점선 호(비율 유지). 해외는 꼭대기에 비행기, 국내는 끝에 원형 점 */
function routeArc(tripType) {
  return s(
    'svg',
    { class: 'bp__arc', width: '220', height: '60', viewBox: '0 0 220 60', fill: 'none', 'aria-hidden': 'true' },
    s('path', { d: 'M4 50 C 60 4, 160 4, 216 50', 'stroke-width': '1.5', 'stroke-dasharray': '3 6', 'stroke-linecap': 'round' }),
    tripType === 'domestic'
      ? s('circle', { class: 'bp__arc-dot', cx: '216', cy: '50', r: '3.5' })
      : s('g', { transform: 'translate(103 9) rotate(8)' }, s('path', { class: 'bp__plane', d: PLANE_PATH })),
  );
}

function endpoint({ place, text, caption, pending = false }) {
  const big = pending
    ? h('span', { class: 'code code--pending', style: { '--code-size': '84px' } }, text ?? '? ? ?')
    : codeText(place ?? text, { size: 84 });
  return h('div', { class: 'bp__end' }, big, caption && h('span', { class: 'bp__caption' }, caption));
}

function infoCell({ label, value, sub }) {
  return h(
    'div',
    { class: 'bp__info' },
    h('span', { class: 'bp__label' }, label),
    h('span', { class: 'bp__value' }, value),
    sub && h('span', { class: 'bp__sub' }, sub),
  );
}

function stub({ label, place, caption, score, scoreNote, emptyText = '아직 순위가 없어요' }) {
  return h(
    'div',
    { class: 'bp__stub' },
    h('span', { class: 'bp__notch bp__notch--top', 'aria-hidden': 'true' }),
    h('span', { class: 'bp__notch bp__notch--bottom', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'bp__stub-head' },
      h('span', { class: 'bp__label' }, label),
      place ? codeText(place, { size: 56 }) : h('span', { class: 'code', style: { '--code-size': '56px' } }, '—'),
      h('span', { class: 'bp__stub-caption' }, place ? caption : emptyText),
    ),
    score != null &&
      h('div', { class: 'bp__score' }, h('span', { class: 'bp__score-num' }, score.toFixed(1)), h('span', { class: 'bp__score-note' }, scoreNote)),
    h('div', { class: 'barcode', 'aria-hidden': 'true' }),
  );
}

/**
 * boardingPass({
 *   tripType: 'overseas' | 'domestic',
 *   label, serial,
 *   origin: { text: 'ICN' | '서울', caption: '인천 출발' },
 *   dest:   { pending: true, caption: '후보 5곳 중 결정 중' } | { place, caption },
 *   info:   [{ label: 'DEPART', value: '2027.02.06', sub }],   // 4칸
 *   stub:   { label, place, caption, score, scoreNote } | null,
 *   ariaLabel,
 * })
 */
export function boardingPass({ tripType = 'overseas', label = 'BOARDING PASS · 여행 프로젝트', serial, origin, dest, info = [], stub: stubData, ariaLabel = '여행 탑승권' }) {
  return h(
    'section',
    { class: ['bp', `bp--${tripType}`], 'aria-label': ariaLabel },
    h(
      'div',
      { class: 'bp__main' },
      h('div', { class: 'bp__top' }, h('span', null, label), serial && h('span', null, serial)),
      h('div', { class: 'bp__journey' }, endpoint(origin), routeArc(tripType), endpoint(dest)),
      h('div', { class: 'bp__grid' }, info.map(infoCell)),
    ),
    stubData && stub(stubData),
  );
}
