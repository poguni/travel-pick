// 단계 내비게이션 — DESIGN.md 6.1 RouteNav, 7장 07 모바일(상단 바·진행 막대)
import { h } from '../dom.js';
import { icon, logoMark } from '../icons.js';
import { STEPS, hrefFor, stepOf } from '../../router.js';
import { modelDot } from './ai.js';
import { formatUsd, formatKrw } from '../format.js';

export function brand({ compact = false } = {}) {
  return h(
    'a',
    { class: ['brand', compact && 'brand--compact'], href: hrefFor('home'), 'aria-label': 'Travel Pick 출발 안내판으로' },
    logoMark({ size: compact ? 28 : 36 }),
    h(
      'span',
      { class: 'brand__text' },
      h('span', { class: 'brand__name' }, 'Travel Pick'),
      !compact && h('span', { class: 'brand__tag' }, 'DECIDE WHERE TO GO'),
    ),
  );
}

/**
 * 단계별 상태: 'done' | 'current' | 'next' | 'todo'
 * - current: 지금 보고 있는 단계
 * - next: 홈 등 단계 밖에 있을 때, 아직 끝나지 않은 첫 단계
 */
export function stepStates(route, done = {}) {
  const inStep = Boolean(stepOf(route));
  const firstTodo = STEPS.find((st) => !done[st.route])?.route;
  return Object.fromEntries(
    STEPS.map((st) => {
      if (st.route === route) return [st.route, 'current'];
      if (done[st.route]) return [st.route, 'done'];
      if (!inStep && st.route === firstTodo) return [st.route, 'next'];
      return [st.route, 'todo'];
    }),
  );
}

function marker(state) {
  if (state === 'done') return h('span', { class: 'step__marker is-done', 'aria-hidden': 'true' }, icon('check', { size: 12 }));
  if (state === 'current' || state === 'next') return h('span', { class: 'step__marker is-current', 'aria-hidden': 'true' }, h('span', { class: 'step__dot' }));
  return h('span', { class: 'step__marker', 'aria-hidden': 'true' });
}

const STATE_TEXT = { done: '완료', current: '현재 단계', next: '다음 단계', todo: '' };

/** 8단계 목록 (사이드바와 모바일 시트에서 같이 씀) */
export function stepList({ route, done }) {
  const states = stepStates(route, done);
  return h(
    'ol',
    { class: 'steps' },
    STEPS.map((st) => {
      const state = states[st.route];
      return h(
        'li',
        { class: ['step', `is-${state}`] },
        marker(state),
        h(
          'a',
          { class: 'step__link', href: hrefFor(st.route), 'aria-current': state === 'current' ? 'page' : null },
          st.label,
          STATE_TEXT[state] && h('span', { class: 'visually-hidden' }, ` · ${STATE_TEXT[state]}`),
          h('span', { class: 'step__num', 'aria-hidden': 'true' }, state === 'next' ? 'NEXT' : st.gate),
        ),
      );
    }),
  );
}

function costCard({ usd, usdKrw, models }) {
  return h(
    'div',
    { class: 'nav-cost' },
    h('span', { class: 'label' }, 'AI 비용 · 이 프로젝트'),
    h('span', { class: 'nav-cost__total' }, formatUsd(usd), ' ', h('span', { class: 'nav-cost__krw' }, formatKrw(usd * usdKrw))),
    h(
      'ul',
      { class: 'nav-cost__models' },
      models.map((m) => h('li', { class: !m.enabled && 'is-off' }, modelDot(m.key), m.name, !m.enabled && h('span', { class: 'muted' }, ' · 꺼짐'))),
    ),
  );
}

/**
 * 사이드바 RouteNav.
 * project: { name, summary } | null, onProject: 프로젝트 전환 버튼, cost: { usd, usdKrw, models }
 */
export function routeNav({ route, done = {}, project, onProject, cost }) {
  return h(
    'nav',
    { class: 'route-nav', 'aria-label': '여행 단계' },
    brand(),
    h(
      'button',
      { type: 'button', class: 'project-switch', onClick: onProject },
      h(
        'span',
        { class: 'project-switch__text' },
        h('span', { class: 'project-switch__name' }, project ? project.name : '여행을 만들어 주세요'),
        h('span', { class: 'project-switch__meta' }, project ? project.summary : '새 프로젝트 · 불러오기'),
      ),
      icon('chevronDown', { size: 16 }),
    ),
    h(
      'div',
      { class: 'nav-home' },
      h(
        'a',
        { class: ['nav-home__link', route === 'home' && 'is-current'], href: hrefFor('home'), 'aria-current': route === 'home' ? 'page' : null },
        '출발 안내판',
        h('span', { class: 'nav-home__tag' }, 'HOME'),
      ),
    ),
    project &&
      h('div', { class: 'nav-route' }, h('span', { class: 'label nav-route__label' }, 'ROUTE · 결정 여정'), stepList({ route, done })),
    h(
      'a',
      { class: ['nav-settings', route === 'settings' && 'is-current'], href: hrefFor('settings'), 'aria-current': route === 'settings' ? 'page' : null },
      '설정',
      h('span', { class: 'nav-home__tag' }, 'SETTINGS'),
    ),
    project && cost && costCard(cost),
  );
}

/** 현재 위치 라벨: GATE 06 · 결과 분석 / HOME · 출발 안내판 */
export function locationLabel(route) {
  const st = stepOf(route);
  if (st) return { left: `GATE ${st.gate} · ${st.label}`, right: `${st.gate} / 08` };
  if (route === 'settings') return { left: 'SETTINGS · 설정', right: '' };
  return { left: 'HOME · 출발 안내판', right: '' };
}

/** 모바일 상단 바 + 8칸 진행 막대 (시안 07) */
export function mobileTop({ route, done = {}, onMenu, showProgress = true }) {
  const states = stepStates(route, done);
  const loc = locationLabel(route);
  return h(
    'div',
    { class: 'mobile-top' },
    h(
      'div',
      { class: 'mobile-top__bar' },
      brand({ compact: true }),
      h('button', { type: 'button', class: 'btn btn--icon', 'aria-label': '단계 메뉴 열기', onClick: onMenu }, icon('menu', { size: 18 })),
    ),
    showProgress &&
      h(
        'div',
        { class: 'mobile-top__progress' },
        h('span', { class: 'mobile-top__loc' }, h('span', { class: 'mobile-top__gate' }, loc.left), h('span', null, loc.right)),
        h(
          'span',
          { class: 'progress8', 'aria-hidden': 'true' },
          STEPS.map((st) => h('span', { class: ['progress8__seg', `is-${states[st.route]}`] })),
        ),
      ),
  );
}
