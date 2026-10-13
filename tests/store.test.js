// 데이터 저장 테스트 — PRD 7장, F1-2~4, F13-1·2, 10장(저장 용량·보안)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from './helpers/memoryStorage.js';
import { createStore, migrateProject, KEYS } from '../js/core/store.js';
import {
  createProject,
  createDefaultSettings,
  DEFAULT_CRITERIA,
  SCHEMA_VERSION,
  seasonOfMonth,
} from '../js/core/schema.js';

const T0 = new Date('2026-10-13T00:00:00Z');
const T1 = new Date('2026-10-14T00:00:00Z');
const T2 = new Date('2026-10-15T00:00:00Z');

const setup = (opts) => {
  const local = new MemoryStorage(opts);
  const session = new MemoryStorage();
  return { local, session, store: createStore(local, { session }) };
};

describe('스키마 기본값', () => {
  test('해외 프로젝트: 출발지 인천, 기본 기준 7개, 본인 1명, 단순 모드 균등 가중치', () => {
    const p = createProject({ name: '설 연휴', tripType: 'overseas', id: 'p1', now: T0 });
    assert.equal(p.schemaVersion, SCHEMA_VERSION);
    assert.equal(p.project.origin, '인천');
    assert.equal(p.project.createdAt, T0.toISOString());
    assert.deepEqual(p.criteria.map((c) => c.id), DEFAULT_CRITERIA.map((c) => c.id));
    assert.deepEqual(p.members.map((m) => m.name), ['나']);
    const w = p.weights.m1;
    assert.equal(w.mode, 'simple');
    assert.deepEqual(Object.values(w.raw), [5, 5, 5, 5, 5, 5, 5]);
    assert.deepEqual([w.pairs, w.judged, w.touched], [{}, [], false]);
  });
  test('국내 프로젝트: 출발지 서울', () => {
    assert.equal(createProject({ tripType: 'domestic' }).project.origin, '서울');
  });
  test('새 프로젝트끼리 기준 객체를 공유하지 않는다', () => {
    const a = createProject();
    const b = createProject();
    a.criteria[0].name = '바뀜';
    assert.equal(b.criteria[0].name, '비용');
    assert.notEqual(a.project.id, b.project.id);
  });
  test('계절 → 한국 기준 달', () => {
    assert.equal(seasonOfMonth(2), 'winter');
    assert.equal(seasonOfMonth(12), 'winter');
    assert.equal(seasonOfMonth(10), 'autumn');
  });
});

describe('프로젝트 저장·불러오기 (F1-3, F13-1)', () => {
  test('저장한 데이터를 그대로 불러온다', () => {
    const { store } = setup();
    const p = createProject({ id: 'p1', name: '가족여행', now: T0 });
    assert.deepEqual(store.saveProject(p, { now: T1 }), { ok: true });
    assert.deepEqual(store.loadProject('p1'), p);
  });
  test('목록은 수정일 최신순, 이름·여행 종류 포함', () => {
    const { store } = setup();
    store.saveProject(createProject({ id: 'a', name: '첫째', now: T0 }), { now: T1 });
    store.saveProject(createProject({ id: 'b', name: '둘째', tripType: 'domestic', now: T0 }), { now: T2 });
    assert.deepEqual(store.listProjects(), [
      { id: 'b', name: '둘째', tripType: 'domestic', updatedAt: T2.toISOString() },
      { id: 'a', name: '첫째', tripType: 'overseas', updatedAt: T1.toISOString() },
    ]);
  });
  test('다시 저장하면 목록 항목이 갱신되고 중복되지 않는다', () => {
    const { store } = setup();
    const p = createProject({ id: 'a', name: '처음', now: T0 });
    store.saveProject(p, { now: T1 });
    p.project.name = '바꾼 이름';
    store.saveProject(p, { now: T2 });
    assert.deepEqual(store.listProjects().map((x) => [x.name, x.updatedAt]), [['바꾼 이름', T2.toISOString()]]);
  });
  test('없는 프로젝트는 null', () => {
    assert.equal(setup().store.loadProject('없음'), null);
  });
});

describe('복제·삭제 (F1-2)', () => {
  test('복제: 새 id, 이름에 "(사본)", 원본과 독립', () => {
    const { store } = setup();
    const p = createProject({ id: 'a', name: '여행', now: T0 });
    store.saveProject(p, { now: T0 });
    const copy = store.duplicateProject('a', { id: 'b', now: T1 });
    assert.equal(copy.project.id, 'b');
    assert.equal(copy.project.name, '여행 (사본)');
    assert.equal(copy.project.createdAt, T1.toISOString());
    assert.equal(copy.project.lastBackupAt, null);
    copy.candidates.push({ id: 'c1' });
    assert.equal(store.loadProject('a').candidates.length, 0);
    assert.equal(store.loadProject('b').project.name, '여행 (사본)');
    assert.equal(store.listProjects().length, 2);
  });
  test('삭제: 데이터와 목록 항목을 함께 지운다', () => {
    const { store, local } = setup();
    store.saveProject(createProject({ id: 'a' }), { now: T0 });
    store.deleteProject('a');
    assert.equal(store.loadProject('a'), null);
    assert.equal(store.listProjects().length, 0);
    assert.equal(local.getItem(KEYS.project('a')), null);
  });
});

describe('v2 → v3 마이그레이션 (PRD 7.2)', () => {
  const v2 = () => ({
    schemaVersion: 2,
    project: {
      id: 'old', name: '2027 설 연휴 가족여행', origin: '인천',
      period: { month: 2, nights: 5 }, budgetPerPerson: 1500000,
      companionType: 'family', interests: ['사진'], createdAt: T0.toISOString(), lastBackupAt: null,
    },
    members: [{ id: 'm1', name: '나', influence: 1 }],
    candidates: [{ id: 'c1', name: '오키나와', country: '일본', source: 'ai', note: '' }],
    criteria: DEFAULT_CRITERIA.map((c) => ({ ...c })),
    weights: {}, research: {}, scores: {}, aiRuns: [], decision: { chosen: null, memo: '' },
  });

  test('해외·월 단위로 채우고 companionType을 companion으로 옮긴다', () => {
    const m = migrateProject(v2());
    assert.equal(m.schemaVersion, 3);
    assert.equal(m.project.tripType, 'overseas');
    assert.deepEqual(m.project.period, {
      mode: 'month', season: null, month: 2, startDate: null, nights: 5, dayTrip: false,
    });
    assert.deepEqual(m.project.companion, { type: 'family', familyDetail: null });
    assert.equal('companionType' in m.project, false);
    assert.deepEqual(m.candidates[0], {
      id: 'c1', name: '오키나와', country: '일본', source: 'ai', note: '',
      region: null, code: null, plannedPeriod: null, plannedNights: null, color: 0,
    });
    assert.equal(m.project.travelers, 1, '인원이 없으면 동행인 수');
  });
  test('월 정보가 없던 v2는 시기 미정으로', () => {
    const d = v2();
    d.project.period = { nights: 3 };
    assert.equal(migrateProject(d).project.period.mode, 'undecided');
  });
  test('원본 객체를 바꾸지 않는다', () => {
    const d = v2();
    migrateProject(d);
    assert.equal(d.schemaVersion, 2);
    assert.equal(d.project.companionType, 'family');
  });
  test('v3는 그대로, 더 새로운 버전은 오류', () => {
    const p = createProject({ id: 'x', now: T0 });
    assert.deepEqual(migrateProject(p), p);
    assert.throws(() => migrateProject({ ...p, schemaVersion: 99 }), /새 버전/);
  });
  test('저장소에 남아 있던 v2 데이터도 불러올 때 변환된다', () => {
    const { store, local } = setup();
    local.setItem(KEYS.project('old'), JSON.stringify(v2()));
    assert.equal(store.loadProject('old').project.tripType, 'overseas');
  });
});

describe('AI 캐시 (7.1)', () => {
  test('저장·조회', () => {
    const { store } = setup();
    store.cacheSet('h1', { answer: 42 }, { now: T0 });
    assert.deepEqual(store.cacheGet('h1'), { answer: 42 });
    assert.equal(store.cacheGet('없음'), null);
  });
  test('정리는 오래된 것부터', () => {
    const { store } = setup();
    store.cacheSet('new', 1, { now: T2 });
    store.cacheSet('old', 1, { now: T0 });
    store.cacheSet('mid', 1, { now: T1 });
    assert.equal(store.pruneCache(2), 2);
    assert.equal(store.cacheGet('old'), null);
    assert.equal(store.cacheGet('mid'), null);
    assert.equal(store.cacheGet('new'), 1);
  });
});

describe('용량 초과 처리 (10장 저장 용량)', () => {
  test('캐시를 오래된 것부터 지우고 다시 저장해 성공한다', () => {
    const { store } = setup({ quota: 12_000 });
    store.cacheSet('old', 'x'.repeat(4000), { now: T0 });
    store.cacheSet('new', 'y'.repeat(4000), { now: T1 });
    const p = createProject({ id: 'p', now: T0 });
    p.project.memo = 'z'.repeat(4500); // 캐시 2개 + 프로젝트가 한도를 넘도록
    assert.deepEqual(store.saveProject(p, { now: T2 }), { ok: true });
    assert.equal(store.cacheGet('old'), null, '오래된 캐시가 먼저 지워져야 함');
    assert.ok(store.cacheGet('new'), '필요한 만큼만 지워야 함');
    assert.equal(store.loadProject('p').project.memo.length, 4500);
  });
  test('그래도 넘치면 오류를 돌려주고, 이전에 저장된 데이터는 그대로', () => {
    const { store } = setup({ quota: 8_000 });
    const p = createProject({ id: 'p', name: '원래', now: T0 });
    store.saveProject(p, { now: T0 });
    p.project.name = '너무 큼';
    p.project.memo = 'z'.repeat(10_000);
    const r = store.saveProject(p, { now: T1 });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'quota');
    assert.equal(store.loadProject('p').project.name, '원래');
    assert.equal(store.listProjects()[0].name, '원래');
  });
});

describe('저장 공간 사용량 (F1-4)', () => {
  test('travelpick: 키만 글자 수로 세고, 80% 이상이면 경고', () => {
    const { store, local } = setup();
    local.setItem('other-app', 'x'.repeat(1000));
    store.saveProject(createProject({ id: 'p' }), { now: T0 });
    const u = store.usage({ quotaChars: 1_000_000 });
    const projectChars = KEYS.project('p').length + local.getItem(KEYS.project('p')).length;
    assert.ok(u.chars >= projectChars);
    assert.ok(u.chars < projectChars + 1000, '다른 앱 키는 제외');
    assert.equal(u.bytes, u.chars * 2, '표시용 바이트는 UTF-16 기준');
    assert.equal(u.warn, false);
    assert.equal(store.usage({ quotaChars: Math.ceil(u.chars / 0.85) }).warn, true);
  });
  test('기본 한도는 약 524만 글자 (크롬 실측과 일치)', () => {
    const { store } = setup();
    assert.equal(store.usage().quotaChars, 5 * 1024 * 1024);
  });
});

describe('설정과 API 키 (10장 보안)', () => {
  test('설정이 없으면 기본값', () => {
    assert.deepEqual(setup().store.loadSettings(), createDefaultSettings());
  });
  test('설정 저장 시 apiKey 필드가 섞여 있어도 지운다', () => {
    const { store, local } = setup();
    store.saveSettings({ ...createDefaultSettings(), usdKrw: 1350, apiKey: 'sk-secret' });
    assert.equal(store.loadSettings().usdKrw, 1350);
    assert.ok(!local.getItem(KEYS.settings).includes('sk-secret'));
  });
  test('키는 기본적으로 이 기기(localStorage)에 저장', () => {
    const { store, local, session } = setup();
    store.setApiKey('sk-1');
    assert.equal(store.getApiKey(), 'sk-1');
    assert.equal(local.getItem(KEYS.apiKey), 'sk-1');
    assert.equal(session.getItem(KEYS.apiKey), null);
  });
  test('"이번 세션만"이면 sessionStorage에 두고 localStorage에서는 지운다', () => {
    const { store, local, session } = setup();
    store.setApiKey('sk-1');
    store.setApiKey('sk-2', { persist: 'session' });
    assert.equal(store.getApiKey(), 'sk-2');
    assert.equal(local.getItem(KEYS.apiKey), null);
    assert.equal(session.getItem(KEYS.apiKey), 'sk-2');
  });
  test('키 지우기', () => {
    const { store } = setup();
    store.setApiKey('sk-1');
    store.clearApiKey();
    assert.equal(store.getApiKey(), null);
  });
});

describe('JSON 백업·복원 (F13-2)', () => {
  test('백업에는 설정·모든 프로젝트가 들어가고 API 키는 없다', () => {
    const { store } = setup();
    store.setApiKey('sk-secret-123');
    store.saveSettings({ ...createDefaultSettings(), apiKey: 'sk-secret-123' });
    store.saveProject(createProject({ id: 'a', now: T0 }), { now: T0 });
    store.saveProject(createProject({ id: 'b', now: T0 }), { now: T1 });
    const backup = store.exportBackup({ now: T2 });
    assert.equal(backup.app, 'travelpick');
    assert.equal(backup.exportedAt, T2.toISOString());
    assert.deepEqual(backup.projects.map((p) => p.project.id).sort(), ['a', 'b']);
    assert.ok(!JSON.stringify(backup).includes('sk-secret'));
  });
  test('백업하면 각 프로젝트의 마지막 백업 시각이 기록된다 (F13-8 준비)', () => {
    const { store } = setup();
    store.saveProject(createProject({ id: 'a', now: T0 }), { now: T0 });
    const backup = store.exportBackup({ now: T2 });
    assert.equal(backup.projects[0].project.lastBackupAt, T2.toISOString());
    assert.equal(store.loadProject('a').project.lastBackupAt, T2.toISOString());
  });
  test('다른 기기에서 복원: 프로젝트와 설정이 돌아오고, 이전 버전은 변환된다', () => {
    const src = setup().store;
    src.saveSettings({ ...createDefaultSettings(), usdKrw: 1300 });
    src.saveProject(createProject({ id: 'a', name: '복원 대상', now: T0 }), { now: T0 });
    const backup = JSON.parse(JSON.stringify(src.exportBackup({ now: T1 })));
    backup.projects.push({
      schemaVersion: 2,
      project: { id: 'v2', name: '옛 데이터', period: { month: 5, nights: 2 }, companionType: 'solo' },
      candidates: [],
    });

    const { store } = setup();
    const r = store.importBackup(backup, { now: T2 });
    assert.deepEqual(r, { ok: true, imported: 2 });
    assert.equal(store.loadProject('a').project.name, '복원 대상');
    assert.equal(store.loadProject('v2').project.tripType, 'overseas');
    assert.equal(store.loadSettings().usdKrw, 1300);
    assert.equal(store.listProjects().length, 2);
  });
  test('같은 id가 이미 있으면 백업 내용으로 덮어쓴다', () => {
    const { store } = setup();
    store.saveProject(createProject({ id: 'a', name: '지금', now: T0 }), { now: T1 });
    const backup = {
      app: 'travelpick', backupVersion: 1, exportedAt: T0.toISOString(), settings: null,
      projects: [createProject({ id: 'a', name: '백업본', now: T0 })],
    };
    store.importBackup(backup, { now: T2 });
    assert.equal(store.loadProject('a').project.name, '백업본');
    assert.equal(store.listProjects().length, 1);
  });
  test('Travel Pick 백업 파일이 아니면 아무것도 바꾸지 않고 오류', () => {
    const { store } = setup();
    assert.deepEqual(store.importBackup({ hello: 'world' }), { ok: false, error: 'invalid' });
    assert.deepEqual(store.importBackup(null), { ok: false, error: 'invalid' });
    assert.equal(store.listProjects().length, 0);
  });
  test('복원 파일에 apiKey가 섞여 있어도 설정에 남기지 않는다', () => {
    const { store, local } = setup();
    store.importBackup({
      app: 'travelpick', backupVersion: 1, exportedAt: T0.toISOString(),
      settings: { ...createDefaultSettings(), apiKey: 'sk-leak' }, projects: [],
    });
    assert.ok(!local.getItem(KEYS.settings).includes('sk-leak'));
  });
});
