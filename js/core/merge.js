// AI 추천 합치기 — PRD F2-4, F10-1·3. Implementation Plan Phase 8
// 같은 곳 판별: 공항 코드가 같거나, 정규화한 이름(한글·영문)이 겹치고 국가(해외)·시·도(국내)가 어긋나지 않으면 같은 곳.
// 정렬: 추천한 모델 수 → 각 모델 목록 안의 평균 순서 → 이름

import { SEASON_MONTHS } from './schema.js';

const MOTIFS = ['sea', 'city', 'mountain'];

/** 이름 비교용: 괄호 속 설명·공백·문장부호 제거, 소문자, 국내 행정 접미사(시·군·도) 제거 */
export function normalizeName(name) {
  let s = String(name ?? '')
    .replace(/\(.*?\)|（.*?）/g, '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[\s·・.,'’"`\-_/]/g, '');
  // "강릉시"→"강릉", "울릉군"→"울릉", "제주도"→"제주". 남는 글자가 2음절 이상일 때만
  const m = s.match(/^([가-힣]{2,}?)(특별자치시|특별자치도|광역시|특별시|시|군|도)$/);
  if (m) s = m[1];
  return s;
}

const REGION_ALIASES = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산',
  세종특별자치시: '세종', 경기도: '경기', 강원도: '강원', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남',
  전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주도: '제주', 제주특별자치도: '제주',
};

/** 시·도 이름을 약칭으로: "강원특별자치도"·"강원도" → "강원". 시·군까지 붙어 오면("강원 강릉시") 앞 단어만 */
export function normalizeRegion(region) {
  const first = String(region ?? '').trim().split(/\s+/)[0] ?? '';
  return REGION_ALIASES[first] ?? first.replace(/(특별자치시|특별자치도|광역시|특별시|도)$/, '');
}

const normalizeCountry = (c) => normalizeName(c);
const cleanCode = (code) => {
  const c = String(code ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : null;
};
const isUrl = (u) => typeof u === 'string' && /^https?:\/\/\S+$/i.test(u.trim());
const strList = (v, max) => (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, max);
const intIn = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/** 모델 한 개의 추천 항목 하나를 앱 형식으로 다듬는다. 이름이 없으면 null */
export function sanitizeItem(raw, tripType) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name ?? '').trim();
  if (!name) return null;
  const overseas = tripType === 'overseas';
  return {
    name,
    nameEn: overseas && typeof raw.nameEn === 'string' && raw.nameEn.trim() ? raw.nameEn.trim() : null,
    country: overseas && typeof raw.country === 'string' && raw.country.trim() ? raw.country.trim() : null,
    region: !overseas && typeof raw.region === 'string' && raw.region.trim() ? normalizeRegion(raw.region) : null,
    code: overseas ? cleanCode(raw.code) : null,
    travel: typeof raw.travel === 'string' && raw.travel.trim() ? raw.travel.trim() : null,
    reason: typeof raw.reason === 'string' ? raw.reason.trim() : '',
    trendEvidence: strList(raw.trendEvidence, 5),
    sources: strList(raw.sources, 8).filter(isUrl),
    tags: strList(raw.tags, 5),
    motif: MOTIFS.includes(raw.motif) ? raw.motif : null,
    recommendedSeason: raw.recommendedSeason in SEASON_MONTHS ? raw.recommendedSeason : null,
    recommendedMonth: intIn(raw.recommendedMonth, 1, 12),
    recommendedNights: intIn(raw.recommendedNights, 0, 30),
    periodReason: typeof raw.periodReason === 'string' && raw.periodReason.trim() ? raw.periodReason.trim() : null,
    overBudgetRisk: raw.overBudgetRisk === true,
  };
}

/** AI 응답 값 { destinations: [...] } → 다듬은 항목 배열 */
export function sanitizeList(value, tripType) {
  const list = Array.isArray(value) ? value : Array.isArray(value?.destinations) ? value.destinations : [];
  return list.map((x) => sanitizeItem(x, tripType)).filter(Boolean);
}

const nameKeys = (p) => new Set([p.name, p.nameEn].filter(Boolean).map(normalizeName).filter(Boolean));
const compatible = (a, b, norm) => !a || !b || norm(a) === norm(b);

/**
 * 두 곳이 같은 곳인가. place: { name, nameEn?, country?, region?, code? }
 * 해외: 공항 코드가 같으면 같은 곳. 코드가 다르거나 없으면 이름(한글·영문 중 하나)이 겹치고 국가가 어긋나지 않을 때.
 * 국내: 지명이 겹치고 시·도가 어긋나지 않을 때.
 */
export function samePlace(a, b, tripType) {
  if (tripType === 'overseas') {
    const ca = cleanCode(a.code);
    if (ca && ca === cleanCode(b.code)) return true;
    if (!compatible(a.country, b.country, normalizeCountry)) return false;
  } else if (!compatible(a.region, b.region, normalizeRegion)) return false;
  const kb = nameKeys(b);
  return [...nameKeys(a)].some((k) => kb.has(k));
}

const mode = (values) => {
  const counts = new Map();
  values.filter((v) => v != null).forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  let best = null;
  let n = 0;
  counts.forEach((c, v) => {
    if (c > n) [best, n] = [v, c];
  });
  return best;
};
const median = (values) => {
  const v = values.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2);
};
const countOf = (items, field) => items.filter((i) => i[field] != null).length;
const uniq = (list) => [...new Set(list)];

/** 태그로 엽서 모티프 고르기 (AI가 motif를 주지 않았을 때) */
export function motifFromTags(tags = []) {
  const text = tags.join(' ');
  if (/바다|해변|섬|해안|휴양|비치|다이빙|서핑/.test(text)) return 'sea';
  if (/산|트레킹|하이킹|온천|사원|숲|자연|계곡|호수/.test(text)) return 'mountain';
  return 'city';
}

/**
 * 모델별 추천 목록 합치기.
 * byModel: { claude: [item...], gpt: [...], gemini: [...] } (sanitizeItem 결과, 앞쪽일수록 그 모델의 추천 순위가 높음)
 * 반환: [{ key, name, nameEn, country, region, code, travel, models[], count, avgRank, reason, reasons{}, trendEvidence[], sources[], tags[],
 *          motif, plannedPeriod, plannedNights, periodReason, overBudgetRisk }]
 */
export function mergeRecommendations(byModel, tripType, modelOrder = Object.keys(byModel)) {
  const groups = [];
  for (const model of modelOrder) {
    (byModel[model] ?? []).forEach((item, rank) => {
      const hit = groups.filter((g) => g.entries.some((e) => samePlace(e.item, item, tripType)));
      let group = hit[0];
      if (!group) groups.push((group = { entries: [] }));
      // 새 항목이 두 묶음을 잇는 경우 하나로 합친다
      for (const other of hit.slice(1)) {
        group.entries.push(...other.entries);
        groups.splice(groups.indexOf(other), 1);
      }
      group.entries.push({ model, rank, item });
    });
  }

  const merged = groups.map((g) => {
    const items = g.entries.map((e) => e.item);
    const models = modelOrder.filter((m) => g.entries.some((e) => e.model === m));
    // 모델마다 가장 높은 순위 하나만 평균에 쓴다(한 모델이 같은 곳을 두 번 적은 경우)
    const ranks = models.map((m) => Math.min(...g.entries.filter((e) => e.model === m).map((e) => e.rank)));
    const first = (m) => g.entries.find((e) => e.model === m).item;
    const month = mode(items.map((i) => i.recommendedMonth));
    const season = mode(items.map((i) => i.recommendedSeason));
    const name = mode(items.map((i) => i.name));
    const code = mode(items.map((i) => i.code));
    const country = mode(items.map((i) => i.country));
    const region = mode(items.map((i) => i.region));
    return {
      key: tripType === 'overseas' ? `${code ?? normalizeName(name)}|${normalizeCountry(country ?? '')}` : `${normalizeName(name)}|${region ?? ''}`,
      name,
      nameEn: mode(items.map((i) => i.nameEn)),
      country,
      region,
      code,
      travel: mode(items.map((i) => i.travel)),
      models,
      count: models.length,
      avgRank: ranks.reduce((s, r) => s + r, 0) / ranks.length,
      reason: first(models[0]).reason,
      reasons: Object.fromEntries(models.map((m) => [m, first(m).reason])),
      trendEvidence: uniq(items.flatMap((i) => i.trendEvidence)).slice(0, 6),
      sources: uniq(items.flatMap((i) => i.sources.map((u) => u.trim()))),
      tags: uniq(items.flatMap((i) => i.tags)).slice(0, 4),
      motif: mode(items.map((i) => i.motif)) ?? motifFromTags(items.flatMap((i) => i.tags)),
      // 월과 계절 중 더 많은 모델이 고른 쪽 (같으면 더 구체적인 월)
      plannedPeriod: month && countOf(items, 'recommendedMonth') >= countOf(items, 'recommendedSeason') ? { month } : season ? { season } : month ? { month } : null,
      plannedNights: median(items.map((i) => i.recommendedNights)),
      periodReason: items.map((i) => i.periodReason).find(Boolean) ?? null,
      overBudgetRisk: items.some((i) => i.overBudgetRisk),
    };
  });

  return merged.sort((a, b) => b.count - a.count || a.avgRank - b.avgRank || a.name.localeCompare(b.name, 'ko'));
}

/** 추천 항목과 같은 곳인 기존 후보 (담김 표시용) */
export function findCandidate(candidates, item, tripType) {
  return candidates.find((c) => samePlace(c, item, tripType)) ?? null;
}
