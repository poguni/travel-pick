// AI 모델 표시 — DESIGN.md 6.6 ConsensusDots / PassportStamp, 6.7 ModelBadge
import { h } from '../dom.js';

/** 세 모델: 순서 Claude → GPT → Gemini, 2글자 모노그램 */
export const MODEL_KEYS = ['claude', 'gpt', 'gemini'];
export const MODEL_META = {
  claude: { mono: 'CL', name: 'Claude Sonnet 5.5' },
  gpt: { mono: 'GP', name: 'GPT-6 Luna' },
  gemini: { mono: 'GM', name: 'Gemini 3.8 Flash' },
};

const ROLE = { chair: 'CHAIR', dissent: 'DISSENT' };

/**
 * 모델 배지 (6.7). size: 30~40px. withName: 옆에 모델명. role: chair | dissent
 * 색만으로 구분하지 않도록 모노그램과 이름을 함께 쓴다.
 */
export function modelBadge(key, { size = 40, name = MODEL_META[key].name, withName = true, role } = {}) {
  return h(
    'span',
    { class: ['model-badge', `model--${key}`] },
    h('span', { class: 'model-badge__mono', style: { '--badge-size': `${size}px` }, 'aria-hidden': withName ? 'true' : null, title: withName ? null : name }, MODEL_META[key].mono),
    withName && h('span', { class: 'model-badge__name' }, name),
    role && h('span', { class: ['role-badge', `role-badge--${role}`] }, ROLE[role]),
  );
}

/** 모델 색 점 하나 (RouteNav 비용 카드 등) */
export function modelDot(key) {
  return h('span', { class: ['model-dot', `model--${key}`], 'aria-hidden': 'true' });
}

/**
 * AI 합의 점 (6.6). agreed: 동의한 모델 키 배열. paper: 종이 위(-ink 색).
 * 옆에 2/3 텍스트를 붙여 색만으로 구분하지 않는다.
 */
export function consensusDots(agreed, { paper = false, keys = MODEL_KEYS, showCount = true, prefix = '' } = {}) {
  const set = new Set(agreed);
  const count = keys.filter((k) => set.has(k)).length;
  return h(
    'span',
    { class: ['consensus', paper && 'consensus--paper'] },
    h(
      'span',
      { class: 'consensus__dots', role: 'img', 'aria-label': `${keys.length}개 모델 중 ${count}개 동의` },
      keys.map((k) => h('span', { class: ['consensus__dot', `model--${k}`, set.has(k) && 'is-on'] })),
    ),
    showCount && h('span', { class: 'consensus__count', 'aria-hidden': 'true' }, `${prefix}${count}/${keys.length}`),
  );
}

/** 합의 수준 이름: 전원 CONSENSUS, 과반 MAJORITY, 그 밖 SOLO PICK */
export function consensusLevel(count, total = 3) {
  if (count >= total) return 'consensus';
  if (count > total / 2) return 'majority';
  return 'solo';
}

const STAMP_LABEL = { consensus: 'CONSENSUS', majority: 'MAJORITY', solo: 'SOLO PICK' };

/** 여권 도장 (6.6): 실선 3/3 · 점선 2/3 · 점 1/3, 약간 회전 */
export function passportStamp(count, { total = 3, rotate = -12, size = 74 } = {}) {
  const level = consensusLevel(count, total);
  return h(
    'span',
    {
      class: ['stamp', `stamp--${level}`],
      style: { '--stamp-rotate': `${rotate}deg`, '--stamp-size': `${size}px` },
      role: 'img',
      'aria-label': `AI 합의 ${count}/${total} · ${STAMP_LABEL[level]}`,
    },
    h('span', { class: 'stamp__count', 'aria-hidden': 'true' }, `${count}/${total}`),
    h('span', { class: 'stamp__label', 'aria-hidden': 'true' }, STAMP_LABEL[level]),
  );
}
