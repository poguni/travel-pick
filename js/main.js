// 앱 진입점: 저장소·상태·라우터·셸 연결, 화면에 넘길 ctx 만들기
import { createStore } from './core/store.js';
import { createProject as newProject } from './core/schema.js';
import { createState, connectAutosave } from './state.js';
import { createRouter } from './router.js';
import { createShell } from './ui/shell.js';
import { projectSummaryLine, totalActualUsd } from './ui/format.js';
import { renderHome } from './screens/home.js';
import { renderConditions } from './screens/conditions.js';
import { renderCandidates } from './screens/candidates.js';
import { renderResearch } from './screens/research.js';
import { renderWeights } from './screens/weights.js';
import { renderScores } from './screens/scores.js';
import { renderResults } from './screens/results.js';
import { stepsDone } from './selectors.js';
import { renderSettings } from './screens/settings.js';
import { createClient } from './ai/openrouter.js';
import { planRun, executeRun } from './ai/runner.js';
import { lastRunDelta } from './core/cost.js';
import { openReceipt } from './ui/components/costReceipt.js';
import { renderPlaceholder } from './screens/placeholder.js';

const SCREENS = {
  home: renderHome,
  conditions: renderConditions,
  candidates: renderCandidates,
  research: renderResearch,
  weights: renderWeights,
  scores: renderScores,
  results: renderResults,
  settings: renderSettings,
};

const store = createStore(window.localStorage, { session: window.sessionStorage });
const recent = store.listProjects()[0];
const state = createState({
  data: recent ? store.loadProject(recent.id) : null,
  route: null,
  flash: null, // { text, tone: 'ok' | 'warn' } — 화면을 옮기면 사라짐
  saveError: null,
  tick: 0, // 저장소만 바뀌었을 때(목록 등) 화면을 다시 그리기 위한 값
  ui: {}, // 저장하지 않는 화면 상태 (선택한 동행인, 쌍대비교 쪽 번호 등)
});

const autosave = connectAutosave(state, store, {
  onError: (r) => state.update((st) => ({ ...st, saveError: r.error })),
});
window.addEventListener('pagehide', autosave.flush);

const shell = createShell(document.getElementById('app'));
const client = createClient({ getKey: () => store.getApiKey() });
const router = createRouter((route) => state.update((st) => ({ ...st, route, flash: st.route === route ? st.flash : null })));

/** 화면에 넘기는 도구 */
const ctx = {
  store,
  state,
  navigate: (route) => router.navigate(route),

  /**
   * 현재 프로젝트 데이터 바꾸기. fn(data)는 사본을 고치고 { ok, error }를 돌려준다.
   * 실패하면 상태를 건드리지 않는다(입력 중인 폼이 다시 그려지지 않음).
   */
  update(fn) {
    const draft = structuredClone(state.getState().data);
    const result = fn(draft) ?? { ok: true };
    if (result.ok) state.update((st) => ({ ...st, data: draft, saveError: null }));
    return result;
  },

  createProject() {
    autosave.flush();
    const data = newProject({ name: '새 여행' });
    store.saveProject(data);
    state.update((st) => ({ ...st, data }));
    router.navigate('conditions');
  },

  openProject(id, route = 'home') {
    autosave.flush();
    state.update((st) => ({ ...st, data: store.loadProject(id) }));
    router.navigate(route);
  },

  deleteProject(id) {
    const current = state.getState().data?.project.id === id;
    if (current) autosave.flush();
    store.deleteProject(id);
    const next = store.listProjects()[0];
    state.update((st) => ({
      ...st,
      data: current ? (next ? store.loadProject(next.id) : null) : st.data,
      tick: st.tick + 1,
    }));
  },

  /** 저장소가 바뀌었으니 다시 그리기 (가져오기·복제 뒤). 현재 프로젝트도 저장소에서 다시 읽는다 */
  reload() {
    const id = state.getState().data?.project.id ?? store.listProjects()[0]?.id;
    state.update((st) => ({ ...st, data: id ? store.loadProject(id) : null, tick: st.tick + 1 }));
  },

  flush: () => autosave.flush(),

  /** 설정 바꾸기: fn(settings)가 사본을 고친다. API 키는 store가 따로 다룬다 */
  saveSettings(fn) {
    const next = structuredClone(store.loadSettings());
    fn(next);
    store.saveSettings(next);
    state.update((st) => ({ ...st, tick: st.tick + 1 }));
  },

  ai: {
    client,
    /**
     * AI 실행: 계획 → 비용 확인 창 → 병렬 실행 → aiRuns 기록 → 실패분 다시 시도.
     * request.record === false면 프로젝트 비용 기록에 남기지 않는다(설정의 시험 호출).
     * 취소하면 null, 아니면 { results, runs } (다시 시도한 결과는 같은 index로 덮어씀)
     */
    async run(request) {
      const settings = store.loadSettings();
      const data = state.getState().data;
      const plan = planRun(request, settings, data?.aiRuns ?? []);
      if (!plan.calls.length) {
        ctx.flash('사용할 수 있는 모델이 없어요. 설정에서 모델을 켜고 슬러그를 확인해 주세요.', 'warn');
        return null;
      }
      const receipt = openReceipt(plan, { usdKrw: settings.usdKrw, delta: lastRunDelta(data?.aiRuns ?? [], request.feature) });
      const only = await receipt.confirm();
      if (!only) return null;
      receipt.start();
      const byIndex = new Map();
      const allRuns = [];
      let pending = plan;
      for (;;) {
        const out = await executeRun(client, pending, { only, onProgress: receipt.progress });
        out.results.forEach((r) => byIndex.set(r.index, r));
        allRuns.push(...out.runs);
        if (request.record !== false && state.getState().data) ctx.update((d) => (d.aiRuns.push(...out.runs), { ok: true }));
        const choice = await receipt.finish();
        const failed = [...byIndex.values()].filter((r) => !r.ok).map((r) => r.index);
        if (choice !== 'retry' || !failed.length) break;
        receipt.retry(failed);
        pending = { ...plan, calls: plan.calls.filter((c) => failed.includes(c.index)) };
      }
      return { results: [...byIndex.values()].sort((a, b) => a.index - b.index), runs: allRuns };
    },
  },

  /** 저장하지 않는 화면 상태 읽기·바꾸기 (자동 저장 대상 아님) */
  ui: () => state.getState().ui,
  setUi(patch) {
    state.update((st) => ({ ...st, ui: { ...st.ui, ...patch } }));
  },

  flash(text, tone = 'ok') {
    state.update((st) => ({ ...st, flash: { text, tone } }));
  },
};

function view(st) {
  const settings = store.loadSettings();
  const data = st.data;
  const usage = store.usage();
  const banner = st.saveError
    ? { tone: 'warn', text: '저장 공간이 가득 차서 마지막 변경을 저장하지 못했어요. 출발 안내판에서 JSON 백업을 받고 오래된 프로젝트를 정리해 주세요.' }
    : usage.warn
      ? { tone: 'warn', text: `저장 공간을 ${Math.round(usage.ratio * 100)}% 쓰고 있어요. JSON 백업을 받아 두세요.` }
      : null;
  return {
    route: st.route,
    done: data ? stepsDone(data) : {},
    project: data && { name: data.project.name, summary: projectSummaryLine(data) },
    cost: data && { usd: totalActualUsd(data), usdKrw: settings.usdKrw, models: settings.models },
    onProject: () => router.navigate('home'),
    banner,
    flash: st.flash,
  };
}

let shown = { route: null, projectId: undefined };

/**
 * 포커스가 있던 요소를 id로 기억했다가 다시 그린 뒤 되돌린다.
 * 아직 저장되지 않은(입력 중인) 글자도 새 요소로 옮긴다.
 */
function withFocusKept(paint) {
  const active = document.activeElement;
  const id = active?.id;
  // textInput은 data-committed에 마지막 저장값을 둔다. 그와 다르면 아직 저장 안 된 입력
  const typing = id && active.tagName === 'INPUT' && 'committed' in active.dataset && active.value !== active.dataset.committed;
  const draft = typing ? active.value : null;
  const sel = id && typeof active.selectionStart === 'number' ? safeSelection(active) : null;
  paint();
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  if (typing && el.value !== draft) el.value = draft;
  el.focus({ preventScroll: true });
  if (sel && typing) {
    try {
      el.setSelectionRange(...sel);
    } catch {
      /* number 입력 등은 선택 범위를 지원하지 않음 */
    }
  }
}

function safeSelection(el) {
  try {
    return [el.selectionStart, el.selectionEnd];
  } catch {
    return null;
  }
}

function render(st, { initial }) {
  const projectId = st.data?.project.id ?? null;
  const moved = st.route !== shown.route || projectId !== shown.projectId;
  const paint = () => {
    const screen = (SCREENS[st.route] ?? renderPlaceholder)({ ...ctx, route: st.route, data: st.data });
    shell.main.replaceChildren(screen.node);
    shell.update({ ...view(st), mobileActions: screen.mobileActions });
  };

  if (moved) {
    paint();
    if (!initial) {
      window.scrollTo(0, 0);
      shell.main.querySelector('.screen-title')?.focus({ preventScroll: true });
    }
    shown = { route: st.route, projectId };
  } else {
    withFocusKept(paint);
  }
}

let initial = true;
state.subscribe((st) => {
  if (!st.route) return;
  render(st, { initial });
  initial = false;
});

router.start();
