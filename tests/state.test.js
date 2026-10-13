// 상태 저장소와 자동 저장 테스트 — PRD F1-3, F13-1
import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createState, connectAutosave } from '../js/state.js';

describe('상태 저장소', () => {
  test('update는 새 상태를 만들고 구독자에게 알린다', () => {
    const s = createState({ data: { n: 1 } });
    const seen = [];
    s.subscribe((next, prev) => seen.push([prev.data.n, next.data.n]));
    s.update((st) => {
      st.data.n = 2;
    });
    assert.equal(s.getState().data.n, 2);
    assert.deepEqual(seen, [[1, 2]]);
  });
  test('이전 상태 객체는 바뀌지 않는다', () => {
    const s = createState({ data: { list: [1] } });
    const before = s.getState();
    s.update((st) => {
      st.data.list.push(2);
    });
    assert.deepEqual(before.data.list, [1]);
    assert.deepEqual(s.getState().data.list, [1, 2]);
  });
  test('update 함수가 값을 돌려주면 그 값이 새 상태', () => {
    const s = createState({ a: 1 });
    s.update(() => ({ a: 5 }));
    assert.deepEqual(s.getState(), { a: 5 });
  });
  test('구독 해제', () => {
    const s = createState({ a: 1 });
    let calls = 0;
    const off = s.subscribe(() => calls++);
    s.update((st) => {
      st.a = 2;
    });
    off();
    s.update((st) => {
      st.a = 3;
    });
    assert.equal(calls, 1);
  });
});

describe('자동 저장 (300ms 디바운스)', () => {
  const fakeStore = () => {
    const saved = [];
    return { saved, saveProject: (d) => (saved.push(structuredClone(d)), { ok: true }) };
  };

  test('연속 변경은 마지막 것만 한 번 저장', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const s = createState({ data: { project: { id: 'p' }, n: 0 } });
    const store = fakeStore();
    connectAutosave(s, store);
    for (let i = 1; i <= 3; i++) s.update((st) => { st.data.n = i; });
    t.mock.timers.tick(299);
    assert.equal(store.saved.length, 0);
    t.mock.timers.tick(1);
    assert.equal(store.saved.length, 1);
    assert.equal(store.saved[0].n, 3);
  });

  test('data가 바뀌지 않은 변경(UI 상태 등)은 저장하지 않는다', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const s = createState({ data: { project: { id: 'p' } }, ui: { tab: 1 } });
    const store = fakeStore();
    connectAutosave(s, store);
    s.update((st) => ({ ...st, ui: { tab: 2 } }));
    t.mock.timers.tick(500);
    assert.equal(store.saved.length, 0);
  });

  test('flush는 기다리지 않고 바로 저장 (페이지를 떠날 때)', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const s = createState({ data: { project: { id: 'p' }, n: 0 } });
    const store = fakeStore();
    const auto = connectAutosave(s, store);
    s.update((st) => { st.data.n = 7; });
    auto.flush();
    assert.equal(store.saved.length, 1);
    t.mock.timers.tick(500);
    assert.equal(store.saved.length, 1, 'flush 후 예약된 저장은 취소');
  });

  test('저장 실패는 onError로 알린다', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const s = createState({ data: { project: { id: 'p' } } });
    const errors = [];
    connectAutosave(s, { saveProject: () => ({ ok: false, error: 'quota' }) }, {
      onError: (r) => errors.push(r.error),
    });
    s.update((st) => { st.data.x = 1; });
    t.mock.timers.tick(300);
    assert.deepEqual(errors, ['quota']);
  });

  test('data가 null이면 저장하지 않는다 (홈 화면 등)', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const s = createState({ data: { project: { id: 'p' } } });
    const store = fakeStore();
    connectAutosave(s, store);
    s.update((st) => ({ ...st, data: null }));
    t.mock.timers.tick(300);
    assert.equal(store.saved.length, 0);
  });
});
