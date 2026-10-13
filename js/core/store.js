// 저장 계층 — PRD 7장, F1-2~4, F13-1·2, 10장(저장 용량·보안).
// Web Storage 객체를 주입받는다(브라우저: localStorage / sessionStorage, 테스트: 메모리 대역).

import { SCHEMA_VERSION, DEFAULT_ORIGIN, createProject, createDefaultSettings } from './schema.js';

const PREFIX = 'travelpick:';

export const KEYS = {
  settings: `${PREFIX}settings`,
  apiKey: `${PREFIX}apikey`,
  index: `${PREFIX}index`,
  project: (id) => `${PREFIX}project:${id}`,
  cache: (hash) => `${PREFIX}cache:${hash}`,
};
const CACHE_PREFIX = KEYS.cache('');

/**
 * localStorage 한도는 브라우저가 UTF-16 글자 수로 센다(크롬 실측: 약 524만 글자에서 QuotaExceededError).
 * 그래서 사용량은 바이트가 아니라 글자 수로 비교한다.
 */
export const DEFAULT_QUOTA_CHARS = 5 * 1024 * 1024;
export const USAGE_WARN_RATIO = 0.8;

const clone = (v) => structuredClone(v);

const isQuotaError = (e) =>
  e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e?.code === 22;

const withoutApiKey = (settings) => {
  if (!settings) return settings;
  const { apiKey, ...rest } = settings;
  return rest;
};

// ── 마이그레이션 ─────────────────────────────────────────

/** 이전 스키마 데이터를 v3로 바꾼 새 객체. 빠진 항목은 기본값으로 채운다 */
export function migrateProject(data) {
  const d = clone(data);
  const version = d.schemaVersion ?? 2;
  if (version > SCHEMA_VERSION) {
    throw new Error(`새 버전(v${version})의 Travel Pick에서 만든 데이터라 열 수 없습니다.`);
  }

  if (version <= 2) {
    const p = d.project ?? {};
    const { month = null, nights = null } = p.period ?? {};
    p.tripType = 'overseas';
    p.origin ??= DEFAULT_ORIGIN.overseas;
    p.period = {
      mode: month == null ? 'undecided' : 'month',
      season: null, month, startDate: null, nights, dayTrip: false,
    };
    p.companion = { type: p.companionType ?? 'solo', familyDetail: null };
    delete p.companionType;
    d.project = p;
    d.candidates = (d.candidates ?? []).map((c) => ({
      region: null, code: null, plannedPeriod: null, plannedNights: null, ...c,
    }));
  }

  // 빠진 최상위 항목·프로젝트 필드 채우기
  const base = createProject({ id: d.project?.id, name: d.project?.name, tripType: d.project?.tripType });
  const out = { ...base, ...d, schemaVersion: SCHEMA_VERSION };
  out.project = { ...base.project, ...d.project };
  // v0.3 이후 추가 필드: 인원(없으면 동행인 수), 후보 색 번호(추가 순서)
  out.project.travelers = d.project?.travelers ?? out.members.length;
  out.candidates = out.candidates.map((c, i) => ({ ...c, color: c.color ?? i % 8 }));
  return out;
}

// ── 저장소 ───────────────────────────────────────────────

export function createStore(local, { session = null } = {}) {
  const readJSON = (key, fallback = null) => {
    const raw = local.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  };

  const cacheEntries = () => {
    const out = [];
    for (let i = 0; i < local.length; i++) {
      const key = local.key(i);
      if (key?.startsWith(CACHE_PREFIX)) out.push({ key, at: readJSON(key)?.at ?? '' });
    }
    return out.sort((a, b) => a.at.localeCompare(b.at));
  };

  /** 저장. 용량이 부족하면 캐시를 오래된 것부터 지우며 다시 시도 */
  const setWithEviction = (key, value) => {
    for (;;) {
      try {
        local.setItem(key, value);
        return { ok: true };
      } catch (e) {
        if (!isQuotaError(e)) throw e;
        const oldest = cacheEntries().find((c) => c.key !== key);
        if (!oldest) return { ok: false, error: 'quota' };
        local.removeItem(oldest.key);
      }
    }
  };

  const readIndex = () => readJSON(KEYS.index, []);
  const writeIndex = (entries) => {
    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return setWithEviction(KEYS.index, JSON.stringify(entries));
  };

  /** 프로젝트 데이터와 목록 항목을 함께 기록. 데이터 저장이 실패하면 목록도 건드리지 않는다 */
  const writeProject = (data, updatedAt) => {
    const { id, name, tripType } = data.project;
    const r = setWithEviction(KEYS.project(id), JSON.stringify(data));
    if (!r.ok) return r;
    const entries = readIndex().filter((e) => e.id !== id);
    entries.push({ id, name, tripType, updatedAt });
    return writeIndex(entries);
  };

  const store = {
    // 프로젝트 (F1-2, F1-3)
    listProjects: () => readIndex(),

    loadProject(id) {
      const data = readJSON(KEYS.project(id));
      return data == null ? null : migrateProject(data);
    },

    saveProject(data, { now = new Date() } = {}) {
      return writeProject(data, now.toISOString());
    },

    deleteProject(id) {
      local.removeItem(KEYS.project(id));
      writeIndex(readIndex().filter((e) => e.id !== id));
    },

    duplicateProject(id, { id: newId = globalThis.crypto.randomUUID(), now = new Date() } = {}) {
      const src = store.loadProject(id);
      if (!src) return null;
      const copy = clone(src);
      copy.project = {
        ...copy.project,
        id: newId,
        name: `${src.project.name} (사본)`,
        createdAt: now.toISOString(),
        lastBackupAt: null,
      };
      const r = store.saveProject(copy, { now });
      return r.ok ? copy : null;
    },

    // 설정 (API 키 제외)
    loadSettings() {
      return { ...createDefaultSettings(), ...withoutApiKey(readJSON(KEYS.settings, {})) };
    },

    saveSettings(settings) {
      return setWithEviction(KEYS.settings, JSON.stringify(withoutApiKey(settings)));
    },

    // API 키: 기본 이 기기(localStorage), 선택 시 이번 세션만(sessionStorage) (F0-1)
    getApiKey() {
      return session?.getItem(KEYS.apiKey) ?? local.getItem(KEYS.apiKey) ?? null;
    },

    setApiKey(key, { persist = 'local' } = {}) {
      if (persist === 'session' && session) {
        session.setItem(KEYS.apiKey, key);
        local.removeItem(KEYS.apiKey);
      } else {
        local.setItem(KEYS.apiKey, key);
        session?.removeItem(KEYS.apiKey);
      }
    },

    clearApiKey() {
      local.removeItem(KEYS.apiKey);
      session?.removeItem(KEYS.apiKey);
    },

    // AI 응답 캐시 (7.1)
    cacheGet(hash) {
      return readJSON(KEYS.cache(hash))?.value ?? null;
    },

    cacheSet(hash, value, { now = new Date() } = {}) {
      return setWithEviction(KEYS.cache(hash), JSON.stringify({ at: now.toISOString(), value }));
    },

    /** 오래된 캐시부터 count개 삭제, 실제로 지운 개수 반환 */
    pruneCache(count) {
      const victims = cacheEntries().slice(0, count);
      victims.forEach((c) => local.removeItem(c.key));
      return victims.length;
    },

    // 저장 공간 사용량 (F1-4). 비율은 글자 수 기준, bytes는 표시용(UTF-16 글자당 2바이트)
    usage({ quotaChars = DEFAULT_QUOTA_CHARS } = {}) {
      let chars = 0;
      for (let i = 0; i < local.length; i++) {
        const key = local.key(i);
        if (key?.startsWith(PREFIX)) chars += key.length + (local.getItem(key)?.length ?? 0);
      }
      const ratio = chars / quotaChars;
      return { chars, quotaChars, bytes: chars * 2, ratio, warn: ratio >= USAGE_WARN_RATIO };
    },

    // JSON 백업·복원 (F13-2). API 키는 절대 넣지 않는다
    exportBackup({ now = new Date() } = {}) {
      const exportedAt = now.toISOString();
      const projects = readIndex().map((entry) => {
        const data = store.loadProject(entry.id);
        data.project.lastBackupAt = exportedAt;
        writeProject(data, entry.updatedAt); // 수정일은 그대로 두고 백업 시각만 기록
        return data;
      });
      return {
        app: 'travelpick',
        backupVersion: 1,
        exportedAt,
        settings: store.loadSettings(),
        projects,
      };
    },

    importBackup(backup, { now = new Date() } = {}) {
      if (backup?.app !== 'travelpick' || !Array.isArray(backup.projects)) {
        return { ok: false, error: 'invalid' };
      }
      const projects = backup.projects.map(migrateProject);
      if (backup.settings) store.saveSettings({ ...createDefaultSettings(), ...backup.settings });
      let imported = 0;
      for (const data of projects) {
        const r = store.saveProject(data, { now });
        if (!r.ok) return { ...r, imported };
        imported++;
      }
      return { ok: true, imported };
    },
  };
  return store;
}
