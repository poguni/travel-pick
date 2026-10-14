// AI 추천 엽서 — DESIGN.md 6.8 DestinationPostcard, 6.6 PassportStamp, 6.4 국내 표시
import { h, s } from '../dom.js';
import { icon } from '../icons.js';
import { chip } from './basic.js';
import { codeText } from './flapCode.js';
import { consensusDots, passportStamp, modelBadge, MODEL_KEYS } from './ai.js';

const SEASON_KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
const ROTATE = [-12, 9, -6, 11, -14, 7];

/** 일러스트 모티프 3종 (이미지 없이 SVG 도형). 색은 CSS에서 후보 색(--cand)으로 만든다 */
const MOTIF = {
  sea: () => [
    s('circle', { class: 'pc-sun', cx: 170, cy: 72, r: 34 }),
    s('path', { class: 'pc-l1', d: 'M0 110 Q 40 100 80 110 T 160 110 T 240 110 T 320 110 V170 H0Z' }),
    s('path', { class: 'pc-l2', d: 'M0 128 Q 40 118 80 128 T 160 128 T 240 128 T 320 128 V170 H0Z' }),
    s('path', { class: 'pc-l3', d: 'M0 146 Q 40 136 80 146 T 160 146 T 240 146 T 320 146 V170 H0Z' }),
  ],
  city: () => [
    s('circle', { class: 'pc-sun', cx: 70, cy: 60, r: 22 }),
    s('rect', { class: 'pc-l2', x: 140, y: 70, width: 22, height: 100 }),
    s('rect', { class: 'pc-l1', x: 168, y: 96, width: 30, height: 74 }),
    s('rect', { class: 'pc-l3', x: 204, y: 30, width: 16, height: 140 }),
    s('path', { class: 'pc-l3', d: 'M204 30 L212 10 L220 30 Z' }),
    s('rect', { class: 'pc-l2', x: 226, y: 84, width: 34, height: 86 }),
    s('rect', { class: 'pc-l1', x: 266, y: 110, width: 40, height: 60 }),
    s('rect', { class: 'pc-l1', x: 100, y: 118, width: 34, height: 52 }),
  ],
  mountain: () => [
    s('circle', { class: 'pc-sun', cx: 196, cy: 58, r: 24 }),
    s('path', { class: 'pc-l2', d: 'M0 170 L70 100 L120 140 L190 80 L320 170 Z' }),
    s('path', { class: 'pc-l0', d: 'M120 170 V128 L136 112 L152 128 V170 Z' }),
    s('path', { class: 'pc-l0', d: 'M131 112 L136 92 L141 112 Z' }),
  ],
};

/** 추천 시기·적정 일정 태그 문구 (F2-7) */
export function plannedTags(item, { periodOpen, nightsOpen }) {
  const tags = [];
  if (periodOpen && item.plannedPeriod?.month) tags.push(`추천 시기 · ${item.plannedPeriod.month}월`);
  if (periodOpen && item.plannedPeriod?.season) tags.push(`추천 시기 · ${SEASON_KO[item.plannedPeriod.season]}`);
  if (nightsOpen && item.plannedNights != null) tags.push(`적정 일정 · ${item.plannedNights ? `${item.plannedNights}박 ${item.plannedNights + 1}일` : '당일치기'}`);
  return tags;
}

const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** 근거·출처·모델별 이유 (접힘) */
function evidence(item, idBase) {
  const reasons = MODEL_KEYS.filter((m) => item.reasons[m] && item.reasons[m] !== item.reason);
  if (!item.trendEvidence.length && !item.sources.length && !reasons.length && !item.periodReason) return null;
  return h(
    'details',
    { class: 'pc-more' },
    h('summary', { id: `${idBase}-more` }, '근거·출처 보기'),
    item.periodReason && h('p', { class: 'pc-more__period' }, item.periodReason),
    item.trendEvidence.length > 0 && h('div', null, h('span', { class: 'pc-more__label' }, 'TREND · 떠오르는 근거'), h('ul', null, item.trendEvidence.map((t) => h('li', null, t)))),
    item.sources.length > 0 &&
      h(
        'div',
        null,
        h('span', { class: 'pc-more__label' }, `SOURCES · 출처 ${item.sources.length}`),
        h('ul', { class: 'pc-more__sources' }, item.sources.map((u) => h('li', null, h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, host(u))))),
      ),
    reasons.length > 0 &&
      h(
        'div',
        null,
        h('span', { class: 'pc-more__label' }, '다른 모델의 이유'),
        h('ul', { class: 'pc-more__reasons' }, reasons.map((m) => h('li', null, modelBadge(m, { size: 24, withName: false }), h('span', null, item.reasons[m])))),
      ),
  );
}

/**
 * 엽서 카드 (6.8).
 * item: core/merge.js mergeRecommendations 결과 + candidate(담긴 후보 또는 null)
 * color: 후보 색 번호 0~7, index: 도장 회전용, onToggle(item)
 */
export function destinationPostcard(item, { tripType, color, index, periodOpen, nightsOpen, onToggle }) {
  const added = Boolean(item.candidate);
  const idBase = `pc-${index}`;
  const where = tripType === 'overseas' ? item.country : item.region;
  const meta = [where, item.travel].filter(Boolean).join(' · ');
  const planned = plannedTags(item, { periodOpen, nightsOpen });
  return h(
    'article',
    { class: ['postcard', 'on-paper', added && 'is-added'], style: { '--cand': `var(--c${color + 1})` }, 'aria-labelledby': `${idBase}-name` },
    h(
      'div',
      { class: 'pc-art' },
      s('svg', { class: 'pc-art__svg', viewBox: '0 0 320 170', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' }, MOTIF[item.motif]?.() ?? MOTIF.city()),
      codeText({ code: item.code, name: item.name }, { size: 54, className: 'pc-art__code' }),
      h('span', { class: 'pc-art__stamp' }, passportStamp(item.count, { rotate: ROTATE[index % ROTATE.length] })),
    ),
    h(
      'div',
      { class: 'pc-body' },
      h('div', { class: 'pc-head' }, h('h3', { class: 'pc-name', id: `${idBase}-name` }, item.name), meta && h('span', { class: 'pc-meta' }, meta)),
      planned.length > 0 && h('div', { class: 'chip-row' }, planned.map((t) => chip(t, { variant: 'paper' }))),
      item.reason && h('p', { class: 'pc-reason' }, item.reason),
      h(
        'div',
        { class: 'chip-row' },
        item.tags.slice(0, 3).map((t) => chip(t, { variant: 'paper' })),
        item.overBudgetRisk && chip('예산 초과 가능', { variant: 'paper-warn' }),
        item.sources.length > 0 && chip(`출처 ${item.sources.length}`, { variant: 'paper' }),
      ),
      evidence(item, idBase),
      h(
        'div',
        { class: 'pc-foot' },
        consensusDots(item.models, { paper: true }),
        h(
          'button',
          {
            type: 'button',
            id: `${idBase}-toggle`,
            class: ['btn', added ? 'btn--ink' : 'btn--paper-line'],
            'aria-pressed': String(added),
            'aria-label': added ? `${item.name} 후보에서 빼기` : `${item.name} 후보에 담기`,
            onClick: () => onToggle(item),
          },
          icon(added ? 'check' : 'plus', { size: 14 }),
          added ? '후보에 담김' : '후보에 담기',
        ),
      ),
    ),
  );
}
