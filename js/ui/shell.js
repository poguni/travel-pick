// 앱 셸 — DESIGN.md 5.1(사이드바 + 본문), 7장 07(모바일 상단 바·하단 고정 바·메뉴 시트)
import { h, mount } from './dom.js';
import { icon } from './icons.js';
import { routeNav, mobileTop, stepList, brand } from './components/routeNav.js';
import { hrefFor } from '../router.js';

/**
 * createShell(root) → { update(view), main }
 * view: { route, done, project, cost, mobileActions: Node[], onProject }
 */
export function createShell(root) {
  const navSlot = h('div', { class: 'app__nav' });
  const topSlot = h('div', { class: 'app__top' });
  const main = h('main', { id: 'main', class: 'app__main', tabindex: '-1' });
  const actions = h('div', { class: 'mobile-actions', hidden: true });
  const sheet = h('dialog', { class: 'sheet', 'aria-label': '단계 메뉴' });

  const skip = h(
    'a',
    {
      class: 'skip-link',
      href: '#main',
      onClick: (e) => {
        e.preventDefault(); // 해시 라우터와 겹치지 않게 직접 이동
        main.focus();
      },
    },
    '본문으로 건너뛰기',
  );

  // 시트 바깥(배경)을 누르면 닫기, 시트 안 링크를 누르면 닫기
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('a')) sheet.close();
  });

  const app = h('div', { class: 'app' }, navSlot, h('div', { class: 'app__body' }, topSlot, main, actions));
  mount(root, skip, app, sheet);

  function renderSheet(view) {
    mount(
      sheet,
      h(
        'div',
        { class: 'sheet__inner' },
        h(
          'div',
          { class: 'sheet__head' },
          brand({ compact: true }),
          h('button', { type: 'button', class: 'btn btn--icon', 'aria-label': '메뉴 닫기', onClick: () => sheet.close() }, icon('close', { size: 18 })),
        ),
        h('a', { class: ['nav-home__link', view.route === 'home' && 'is-current'], href: hrefFor('home') }, '출발 안내판', h('span', { class: 'nav-home__tag' }, 'HOME')),
        view.project && stepList({ route: view.route, done: view.done }),
        h('a', { class: ['nav-settings', view.route === 'settings' && 'is-current'], href: hrefFor('settings') }, '설정', h('span', { class: 'nav-home__tag' }, 'SETTINGS')),
      ),
    );
  }

  return {
    main,
    update(view) {
      app.classList.toggle('has-progress', Boolean(view.project));
      mount(navSlot, routeNav(view));
      mount(
        topSlot,
        mobileTop({
          route: view.route,
          done: view.done,
          showProgress: Boolean(view.project),
          onMenu: () => {
            renderSheet(view);
            sheet.showModal();
          },
        }),
      );
      const list = view.mobileActions ?? [];
      actions.hidden = list.length === 0;
      mount(actions, list);
      if (sheet.open) renderSheet(view);
    },
  };
}
