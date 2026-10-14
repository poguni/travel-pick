// AI 추천 합치기 — PRD F2-4, Implementation Plan Phase 8
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, normalizeRegion, samePlace, sanitizeItem, sanitizeList, mergeRecommendations, findCandidate, motifFromTags } from '../js/core/merge.js';

const ov = (o) => sanitizeItem({ reason: '', ...o }, 'overseas');
const dom = (o) => sanitizeItem({ reason: '', ...o }, 'domestic');

describe('이름 정규화', () => {
  test('공백·대소문자·괄호 설명을 무시한다', () => {
    assert.equal(normalizeName(' Okinawa '), 'okinawa');
    assert.equal(normalizeName('오키나와 (Okinawa)'), '오키나와');
    assert.equal(normalizeName('Da Nang'), normalizeName('danang'));
  });
  test('국내 행정 접미사를 뗀다', () => {
    assert.equal(normalizeName('강릉시'), '강릉');
    assert.equal(normalizeName('부산광역시'), '부산');
    assert.equal(normalizeName('울릉도'), normalizeName('울릉군'));
    assert.equal(normalizeName('서귀포시'), '서귀포');
    assert.equal(normalizeName('독도'), '독도', '남는 글자가 1음절이면 그대로');
  });
  test('시·도는 약칭으로', () => {
    assert.equal(normalizeRegion('강원특별자치도'), '강원');
    assert.equal(normalizeRegion('강원도'), '강원');
    assert.equal(normalizeRegion('경상북도'), '경북');
    assert.equal(normalizeRegion('강원 강릉시'), '강원');
    assert.equal(normalizeRegion('제주'), '제주');
  });
});

describe('같은 곳 판별', () => {
  test('해외: 오키나와 / Okinawa / OKA', () => {
    const a = ov({ name: '오키나와', nameEn: 'Okinawa', country: '일본', code: 'OKA' });
    const b = ov({ name: 'Okinawa', country: '일본' });
    const c = ov({ name: '오키나와 본섬', code: 'oka' });
    assert.ok(samePlace(a, b, 'overseas'), '영문 이름으로');
    assert.ok(samePlace(a, c, 'overseas'), '공항 코드로 (소문자도)');
  });
  test('해외: 이름이 같아도 국가가 다르면 다른 곳', () => {
    assert.equal(samePlace(ov({ name: '산호세', country: '미국' }), ov({ name: '산호세', country: '코스타리카' }), 'overseas'), false);
  });
  test('해외: 공항 코드가 달라도 이름이 같으면 같은 곳 (도쿄 NRT/HND)', () => {
    assert.ok(samePlace(ov({ name: '도쿄', country: '일본', code: 'NRT' }), ov({ name: '도쿄', country: '일본', code: 'HND' }), 'overseas'));
  });
  test('국내: 강릉 / 강릉시, 시·도 표기가 달라도', () => {
    assert.ok(samePlace(dom({ name: '강릉', region: '강원' }), dom({ name: '강릉시', region: '강원특별자치도' }), 'domestic'));
    assert.ok(samePlace(dom({ name: '강릉' }), dom({ name: '강릉시', region: '강원' }), 'domestic'), '시·도가 없으면 이름만');
  });
  test('국내: 같은 이름이라도 시·도가 다르면 다른 곳', () => {
    assert.equal(samePlace(dom({ name: '고성', region: '강원' }), dom({ name: '고성군', region: '경남' }), 'domestic'), false);
  });
});

describe('항목 다듬기', () => {
  test('잘못된 공항 코드·출처·숫자는 버린다', () => {
    const i = ov({ name: '다낭', code: 'DANANG', sources: ['https://a.com', 'not a url', 3], recommendedMonth: 13, recommendedNights: 3, motif: 'beach' });
    assert.equal(i.code, null);
    assert.deepEqual(i.sources, ['https://a.com']);
    assert.equal(i.recommendedMonth, null);
    assert.equal(i.recommendedNights, 3);
    assert.equal(i.motif, null);
  });
  test('국내 항목에는 공항 코드·국가를 남기지 않는다', () => {
    const i = dom({ name: '강릉', code: 'KAG', country: '한국', region: '강원도' });
    assert.equal(i.code, null);
    assert.equal(i.country, null);
    assert.equal(i.region, '강원');
  });
  test('이름 없는 항목은 빠진다, { destinations } 형식도 받는다', () => {
    assert.equal(sanitizeList({ destinations: [{ name: '' }, { name: '삿포로' }, null] }, 'overseas').length, 1);
    assert.equal(sanitizeList(null, 'overseas').length, 0);
  });
  test('태그로 모티프 고르기', () => {
    assert.equal(motifFromTags(['겨울 바다', '휴양']), 'sea');
    assert.equal(motifFromTags(['온천']), 'mountain');
    assert.equal(motifFromTags(['야시장']), 'city');
  });
});

describe('합치기와 정렬 (F2-4)', () => {
  const byModel = {
    claude: [
      ov({ name: '오키나와', nameEn: 'Okinawa', country: '일본', code: 'OKA', reason: 'C 이유', sources: ['https://x.com/1'], recommendedMonth: 2, recommendedNights: 3, motif: 'sea' }),
      ov({ name: '치앙마이', country: '태국', code: 'CNX' }),
      ov({ name: '타이베이', country: '대만', code: 'TPE' }),
    ],
    gpt: [
      ov({ name: '타이베이', country: '대만', code: 'TPE' }),
      ov({ name: 'Okinawa', country: '일본', reason: 'G 이유', sources: ['https://x.com/1', 'https://x.com/2'], recommendedMonth: 2, recommendedNights: 4, overBudgetRisk: true }),
    ],
    gemini: [
      ov({ name: '오키나와', code: 'OKA', recommendedMonth: 3, recommendedNights: 5 }),
      ov({ name: '다낭', country: '베트남', code: 'DAD' }),
      ov({ name: '타이베이', country: '대만', code: 'TPE' }),
    ],
  };
  const merged = mergeRecommendations(byModel, 'overseas', ['claude', 'gpt', 'gemini']);

  test('표기가 달라도 한 곳으로 묶인다', () => {
    assert.deepEqual(merged.map((m) => m.name).sort(), ['다낭', '오키나와', '치앙마이', '타이베이'].sort());
  });
  test('추천 모델 수 → 평균 순위 순서', () => {
    // 오키나와 3/3 평균 (0+1+0)/3, 타이베이 3/3 평균 (2+0+2)/3, 그다음 1/3끼리 순위로: 치앙마이(1) = 다낭(1) → 이름순
    assert.deepEqual(merged.map((m) => [m.name, m.count]), [['오키나와', 3], ['타이베이', 3], ['다낭', 1], ['치앙마이', 1]]);
  });
  test('필드 합치기: 모델 목록, 코드, 출처 중복 제거, 시기 최빈값, 일정 중앙값, 예산 위험', () => {
    const oka = merged[0];
    assert.deepEqual(oka.models, ['claude', 'gpt', 'gemini']);
    assert.equal(oka.code, 'OKA');
    assert.equal(oka.nameEn, 'Okinawa');
    assert.deepEqual(oka.sources, ['https://x.com/1', 'https://x.com/2']);
    assert.deepEqual(oka.plannedPeriod, { month: 2 });
    assert.equal(oka.plannedNights, 4);
    assert.equal(oka.overBudgetRisk, true);
    assert.equal(oka.reason, 'C 이유');
    assert.deepEqual(oka.reasons, { claude: 'C 이유', gpt: 'G 이유', gemini: '' });
    assert.equal(oka.motif, 'sea');
  });
  test('뒤에 온 항목이 두 묶음을 이으면 하나로 합친다', () => {
    const m = mergeRecommendations(
      { a: [ov({ name: '오키나와', country: '일본' })], b: [ov({ name: 'Okinawa', code: 'OKA' })], c: [ov({ name: '오키나와', nameEn: 'Okinawa', country: '일본' })] },
      'overseas',
    );
    assert.equal(m.length, 1);
    assert.equal(m[0].count, 3);
  });
  test('국내: 강릉/강릉시가 묶이고 시기가 계절로 남는다', () => {
    const m = mergeRecommendations(
      { claude: [dom({ name: '강릉', region: '강원', recommendedSeason: 'autumn' })], gpt: [dom({ name: '강릉시', region: '강원도', recommendedSeason: 'autumn' })], gemini: [dom({ name: '경주', region: '경북' })] },
      'domestic',
    );
    assert.deepEqual(m.map((x) => [x.name, x.count]), [['강릉', 2], ['경주', 1]]);
    assert.deepEqual(m[0].plannedPeriod, { season: 'autumn' });
    assert.equal(m[0].code, null);
  });
  test('추천 시기: 월과 계절 중 더 많은 모델이 고른 쪽', () => {
    const m = mergeRecommendations(
      { a: [dom({ name: '강릉', recommendedSeason: 'autumn' })], b: [dom({ name: '강릉시', recommendedSeason: 'autumn' })], c: [dom({ name: '강릉', recommendedMonth: 5 })] },
      'domestic',
    );
    assert.deepEqual(m[0].plannedPeriod, { season: 'autumn' });
    const t = mergeRecommendations({ a: [dom({ name: '강릉', recommendedSeason: 'autumn' })], b: [dom({ name: '강릉', recommendedMonth: 10 })] }, 'domestic');
    assert.deepEqual(t[0].plannedPeriod, { month: 10 }, '같으면 월');
  });
  test('기존 후보와 같은 곳 찾기 (담김 표시)', () => {
    const cands = [{ id: 'c1', name: '오키나와', country: '일본', code: null, region: null }];
    assert.equal(findCandidate(cands, merged[0], 'overseas')?.id, 'c1');
    assert.equal(findCandidate(cands, merged[1], 'overseas'), null);
  });
});
