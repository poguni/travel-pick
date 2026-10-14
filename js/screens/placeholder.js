// 프로젝트가 없을 때의 안내(emptyRedirect)와 알 수 없는 주소의 대체 화면
import { h } from '../ui/dom.js';
import { screenHeader, dashedCard, emptyState, button } from '../ui/components/basic.js';
import { stepOf, hrefFor } from '../router.js';

const headerFor = (route) => {
  const st = stepOf(route);
  return screenHeader({ eyebrow: st ? `GATE ${st.gate} · ${st.code}` : 'SETTINGS · 설정', title: st ? st.label : '설정' });
};

/** 단계 화면인데 열린 프로젝트가 없을 때 */
export function emptyRedirect(route) {
  return {
    node: h(
      'div',
      { class: 'screen' },
      headerFor(route),
      emptyState({
        title: '먼저 여행 프로젝트를 만들어 주세요',
        desc: '출발 안내판에서 새 여행을 만들면 결정 여정이 시작됩니다.',
        action: button({ variant: 'outline', label: '출발 안내판으로', href: hrefFor('home') }),
      }),
    ),
  };
}

/** 등록되지 않은 화면 (모든 단계 화면이 생긴 뒤에는 잘못된 주소일 때만) */
export function renderPlaceholder({ route, data }) {
  if (stepOf(route) && !data) return emptyRedirect(route);
  return {
    node: h(
      'div',
      { class: 'screen' },
      headerFor(route),
      dashedCard({ eyebrow: 'NOT FOUND · 없는 화면', title: '이 주소의 화면을 찾지 못했어요', action: button({ variant: 'outline', label: '출발 안내판으로', href: hrefFor('home') }) }),
    ),
  };
}
