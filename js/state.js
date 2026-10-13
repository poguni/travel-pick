// 앱 상태 저장소와 자동 저장 — PRD F1-3, F13-1
//
// 상태 모양: { data: 현재 프로젝트 데이터(스키마 v3) | null, ...화면 상태 }
// update(fn): fn은 상태 사본을 직접 고치거나 새 상태를 돌려준다. 이전 상태 객체는 바뀌지 않는다.

export function createState(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    getState: () => state,
    update(fn) {
      const prev = state;
      const draft = structuredClone(prev);
      state = fn(draft) ?? draft;
      listeners.forEach((l) => l(state, prev));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const AUTOSAVE_DELAY_MS = 300;

/**
 * data가 바뀌면 delay 뒤에 store.saveProject로 저장한다(연속 변경은 마지막 것만).
 * flush(): 기다리지 않고 바로 저장 — pagehide/visibilitychange에서 호출.
 */
export function connectAutosave(state, store, { delay = AUTOSAVE_DELAY_MS, onError = () => {} } = {}) {
  let timer = null;
  let pending = false;

  const save = () => {
    clearTimeout(timer);
    timer = null;
    if (!pending) return;
    pending = false;
    const { data } = state.getState();
    if (!data) return;
    const r = store.saveProject(data);
    if (!r.ok) onError(r);
  };

  const unsubscribe = state.subscribe((next, prev) => {
    if (!next.data || JSON.stringify(next.data) === JSON.stringify(prev.data)) return;
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(save, delay);
  });

  return { flush: save, disconnect: unsubscribe };
}
