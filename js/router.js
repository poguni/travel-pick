// 해시 라우팅 — #/weights 형태. GitHub Pages에서 서버 설정 없이 동작.

/** 결정 여정 8단계 (DESIGN.md 6.1 RouteNav, GATE 번호) */
export const STEPS = [
  { route: 'conditions', label: '여행 조건', gate: '01', code: 'CONDITIONS' },
  { route: 'candidates', label: '후보 발굴', gate: '02', code: 'DISCOVER' },
  { route: 'research', label: '자료 수집', gate: '03', code: 'RESEARCH' },
  { route: 'weights', label: '기준·가중치', gate: '04', code: 'WEIGHTS' },
  { route: 'scores', label: '점수 매기기', gate: '05', code: 'SCORES' },
  { route: 'results', label: '결과 분석', gate: '06', code: 'RESULTS' },
  { route: 'panel', label: 'AI 최종 심사', gate: '07', code: 'THE PANEL' },
  { route: 'export', label: '내보내기', gate: '08', code: 'EXPORT' },
];

export const ROUTES = ['home', ...STEPS.map((s) => s.route), 'settings'];
export const DEFAULT_ROUTE = 'home';

/** '#/weights' → 'weights'. 모르는 주소는 home */
export function parseHash(hash) {
  const route = String(hash ?? '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return ROUTES.includes(route) ? route : DEFAULT_ROUTE;
}

export const hrefFor = (route) => `#/${route}`;

export const stepOf = (route) => STEPS.find((s) => s.route === route) ?? null;

/** 주소가 바뀔 때마다 onChange(route) 호출. start()에서 현재 주소로 한 번 호출 */
export function createRouter(onChange) {
  const handle = () => onChange(parseHash(window.location.hash));
  return {
    start() {
      window.addEventListener('hashchange', handle);
      handle();
    },
    navigate(route) {
      window.location.hash = hrefFor(route);
    },
  };
}
