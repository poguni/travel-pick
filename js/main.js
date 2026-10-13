// 앱 진입점: 저장소·상태·라우터·셸 연결
import { createStore } from './core/store.js';
import { createState, connectAutosave } from './state.js';
import { createRouter } from './router.js';
import { createShell } from './ui/shell.js';
import { projectSummaryLine, totalActualUsd } from './ui/format.js';
import { renderHome } from './screens/home.js';
import { renderPlaceholder } from './screens/placeholder.js';

const SCREENS = { home: renderHome };

const store = createStore(window.localStorage, { session: window.sessionStorage });
const recent = store.listProjects()[0];
const state = createState({
  data: recent ? store.loadProject(recent.id) : null,
  route: null,
});

const autosave = connectAutosave(state, store, {
  onError: (r) => console.warn('자동 저장 실패:', r.error), // 저장 공간 경고 배너는 Phase 4
});
window.addEventListener('pagehide', autosave.flush);

const shell = createShell(document.getElementById('app'));

function view(st) {
  const settings = store.loadSettings();
  const data = st.data;
  return {
    route: st.route,
    done: {}, // 단계 완료 판정은 Phase 6(selectors)에서
    project: data && { name: data.project.name, summary: projectSummaryLine(data) },
    cost: data && { usd: totalActualUsd(data), usdKrw: settings.usdKrw, models: settings.models },
  };
}

let shownRoute = null;
let shownProjectId;

function render(st, { focus = false } = {}) {
  const projectId = st.data?.project.id ?? null;
  if (st.route !== shownRoute || projectId !== shownProjectId) {
    const screen = (SCREENS[st.route] ?? renderPlaceholder)({ route: st.route, data: st.data, state, store });
    shell.main.replaceChildren(screen.node);
    shell.update({ ...view(st), mobileActions: screen.mobileActions });
    if (focus) {
      window.scrollTo(0, 0);
      shell.main.querySelector('.screen-title')?.focus({ preventScroll: true });
    }
    shownRoute = st.route;
    shownProjectId = projectId;
  } else {
    shell.update(view(st));
  }
}

// 첫 화면에서는 포커스를 옮기지 않고, 이후 화면 이동 때만 제목으로 포커스를 옮긴다(스크린 리더 안내)
let initialized = false;
state.subscribe((st) => {
  render(st, { focus: initialized });
  initialized = true;
});

createRouter((route) => state.update((st) => ({ ...st, route }))).start();
