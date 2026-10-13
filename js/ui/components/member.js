// 동행인 아바타와 전환기 — DESIGN.md 6.10
import { h } from '../dom.js';

/** 동행인 색: 후보 팔레트 --c1~ 순서를 재사용 (이름을 반드시 함께 표시) */
export const memberColor = (index) => `var(--c${(index % 8) + 1})`;

export function memberAvatar(member, index, { size = 32 } = {}) {
  return h(
    'span',
    {
      class: ['avatar', index % 8 === 0 && 'avatar--sunset'],
      style: { '--avatar-bg': memberColor(index), '--avatar-size': `${size}px` },
      'aria-hidden': 'true',
    },
    [...(member.name || '?')][0],
  );
}

const STATUS_TEXT = { done: '완료', waiting: '대기' };

/**
 * 동행인 전환기. statuses: { [memberId]: 'done' | 'waiting' }
 * onSelect(id), onGroup(): 그룹 합계 보기 (없으면 버튼 숨김)
 */
export function memberSwitcher({ members, activeId, statuses = {}, onSelect, onGroup, groupActive = false }) {
  const items = members.map((m, i) => {
    const active = m.id === activeId && !groupActive;
    const status = statuses[m.id];
    return h(
      'button',
      { type: 'button', class: ['member-btn', active && 'is-active'], 'aria-pressed': String(active), onClick: () => onSelect?.(m.id) },
      memberAvatar(m, i, { size: 36 }),
      active ? `${m.name} · 입력 중` : m.name,
      !active && status && h('span', { class: ['member-btn__status', `is-${status}`] }, STATUS_TEXT[status]),
    );
  });
  const group =
    onGroup &&
    h('button', { type: 'button', class: ['member-btn', 'member-btn--group', groupActive && 'is-active'], 'aria-pressed': String(groupActive), onClick: onGroup }, '그룹 합계 보기');
  return h('div', { class: 'member-switcher', role: 'group', 'aria-label': '탑승객 선택' }, items, group);
}
