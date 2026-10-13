// 아직 만들지 않은 화면의 자리 표시 (각 Phase에서 실제 화면으로 교체)
import { h } from '../ui/dom.js';
import { screenHeader, dashedCard, emptyState, button } from '../ui/components/basic.js';
import { stepOf, hrefFor } from '../router.js';

/** 화면별로 구현할 Phase (docs/Travel-Pick-Implementation-Plan.md 1장) */
const PHASE_OF = {
  conditions: 4,
  candidates: '4·8',
  research: 9,
  weights: 5,
  scores: 6,
  results: 6,
  panel: 11,
  export: 12,
  settings: 7,
};

export function renderPlaceholder({ route, data }) {
  const st = stepOf(route);
  const eyebrow = st ? `GATE ${st.gate} · ${st.code}` : 'SETTINGS · 설정';
  const title = st ? st.label : '설정';

  const body =
    st && !data
      ? emptyState({
          title: '먼저 여행 프로젝트를 만들어 주세요',
          desc: '출발 안내판에서 새 여행을 만들면 결정 여정이 시작됩니다.',
          action: button({ variant: 'outline', label: '출발 안내판으로', href: hrefFor('home') }),
        })
      : dashedCard({
          eyebrow: `COMING UP · PHASE ${PHASE_OF[route]}`,
          title: `${title} 화면은 Phase ${PHASE_OF[route]}에서 만듭니다`,
          desc: '앱 셸과 단계 이동은 지금 동작합니다.',
        });

  return { node: h('div', { class: 'screen' }, screenHeader({ eyebrow, title }), body) };
}
