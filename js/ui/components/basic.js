// 기본 컴포넌트: 버튼, 상태 알약, 칩, 세그먼트, 화면 헤더, 빈 상태, 스켈레톤 — DESIGN.md 6.5, 6.9, 6.16, 11장
import { h } from '../dom.js';
import { icon } from '../icons.js';

/**
 * 버튼 (6.16). variant: primary | secondary | paper | ink | outline | icon
 * next: true면 오른쪽 화살표(다음 단계 이동 전용). href가 있으면 <a>로 만든다.
 */
export function button({ variant = 'secondary', label, iconName, next = false, href, onClick, ariaLabel, type = 'button', size, disabled, pressed } = {}) {
  const children = [
    iconName && icon(iconName, { size: 16 }),
    variant !== 'icon' && label,
    next && icon('arrowRight', { size: 16 }),
  ];
  const props = {
    class: ['btn', `btn--${variant}`, size && `btn--${size}`],
    'aria-label': ariaLabel ?? (variant === 'icon' ? label : null),
    'aria-pressed': pressed == null ? null : String(pressed),
    onClick,
  };
  if (href) return h('a', { ...props, href }, children);
  return h('button', { ...props, type, disabled }, children);
}

const STATUS = {
  lead: { label: '유력', cls: 'pill--lead' },
  contend: { label: '경합', cls: 'pill--contend' },
  review: { label: '검토', cls: 'pill--review' },
};

/** 후보 상태 알약 (6.5): lead 유력 · contend 경합 · review 검토 */
export function statusPill(status) {
  const s = STATUS[status];
  return h('span', { class: ['pill', s.cls] }, s.label);
}

/** 칩 (6.5). variant: filter | exclude | paper | paper-warn */
export function chip(text, { variant = 'filter' } = {}) {
  return h('span', { class: ['chip', `chip--${variant}`] }, text);
}

/**
 * 세그먼트 컨트롤 (6.9). 선택이 바뀌면 onChange(value)
 * idPrefix: 버튼 id(`${idPrefix}-${value}`, 다시 그린 뒤 포커스 복원용), disabled: 전체 잠금
 */
export function segmented({ label, options, value, onChange, size, idPrefix, disabled = false }) {
  const buttons = options.map((opt) =>
    h(
      'button',
      {
        type: 'button',
        id: idPrefix ? `${idPrefix}-${opt.value}` : null,
        class: 'seg__btn',
        'aria-pressed': String(opt.value === value),
        disabled,
        onClick: () => {
          buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btnOf(opt.value))));
          onChange?.(opt.value);
        },
        dataset: { value: opt.value },
      },
      opt.label,
    ),
  );
  const btnOf = (v) => buttons.find((b) => b.dataset.value === String(v));
  return h('div', { class: ['seg', size && `seg--${size}`], role: 'group', 'aria-label': label }, buttons);
}

/**
 * 화면 헤더: GATE 라벨 + H1(여러 줄 가능) + 오른쪽 행동 + 아래 줄(칩 등)
 * title: 문자열 또는 줄 배열
 */
export function screenHeader({ eyebrow, title, actions = [], below }) {
  const lines = Array.isArray(title) ? title : [title];
  const h1 = h('h1', { class: 'screen-title', tabindex: '-1' }, lines.flatMap((line, i) => (i ? [h('br'), line] : [line])));
  return h(
    'header',
    { class: 'screen-header' },
    h('span', { class: 'eyebrow' }, eyebrow),
    h('div', { class: 'screen-header__row' }, h1, actions.length ? h('div', { class: 'screen-header__actions' }, actions) : null),
    below,
  );
}

/** 점선 안내 카드 (5.2): 다음 게이트 안내, 빈 상태 */
export function dashedCard({ eyebrow, title, desc, action }) {
  return h(
    'section',
    { class: 'dashed-card' },
    h(
      'div',
      { class: 'dashed-card__text' },
      eyebrow && h('span', { class: 'eyebrow' }, eyebrow),
      h('span', { class: 'dashed-card__title' }, title),
      desc && h('span', { class: 'muted' }, desc),
    ),
    action,
  );
}

/** 빈 상태 (11장): 점선 카드 + 짧은 안내 + 주요 버튼 1개 */
export function emptyState({ title, desc, action }) {
  return dashedCard({ eyebrow: 'EMPTY · 아직 없어요', title, desc, action });
}

/** AI 진행 중 자리 표시 (11장) */
export function skeleton({ lines = 3, label = '불러오는 중' } = {}) {
  return h(
    'div',
    { class: 'skeleton', role: 'status', 'aria-label': label },
    Array.from({ length: lines }, (_, i) => h('span', { class: 'skeleton__bar', style: { width: `${[92, 76, 58, 84][i % 4]}%` } })),
  );
}

/** 패널 카드 (5.2) */
export function panel({ title, meta, children = [], paper = false, label }) {
  return h(
    'section',
    { class: ['panel', paper && 'panel--paper'], 'aria-label': label ?? (typeof title === 'string' ? title : null) },
    title && h('h2', { class: 'panel__title' }, title, meta && h('span', { class: 'panel__meta' }, meta)),
    children,
  );
}
