// 여행 조건·동행인·후보 변경 규칙 — PRD F1-5~F1-11, F3, F8-1
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../js/core/schema.js';
import {
  setTripType,
  setOrigin,
  setPeriodMode,
  updatePeriod,
  setCompanion,
  setFamilyDetail,
  setTravelers,
  setBudgetManwon,
  toggleInterest,
  addInterest,
  addMember,
  removeMember,
  renameMember,
  addCandidate,
  removeCandidate,
  candidateCountNotice,
  parsePlannedPeriod,
} from '../js/core/project.js';

const fresh = (tripType = 'overseas') => createProject({ id: 'p', tripType });

describe('여행 종류 (F1-5)', () => {
  test('후보가 없으면 바꿀 수 있고, 출발지 기본값도 따라 바뀐다', () => {
    const d = fresh('overseas');
    assert.deepEqual(setTripType(d, 'domestic'), { ok: true });
    assert.equal(d.project.tripType, 'domestic');
    assert.equal(d.project.origin, '서울');
  });
  test('직접 입력한 출발지는 바꾸지 않는다', () => {
    const d = fresh('overseas');
    setOrigin(d, '김해');
    setTripType(d, 'domestic');
    assert.equal(d.project.origin, '김해');
  });
  test('후보가 하나라도 있으면 잠긴다', () => {
    const d = fresh('overseas');
    addCandidate(d, { name: '오키나와', country: '일본', code: 'OKA' });
    assert.deepEqual(setTripType(d, 'domestic'), { ok: false, error: 'locked' });
    assert.equal(d.project.tripType, 'overseas');
  });
  test('해외로 바꾸면 당일치기는 풀린다', () => {
    const d = fresh('domestic');
    updatePeriod(d, { dayTrip: true });
    setTripType(d, 'overseas');
    assert.equal(d.project.period.dayTrip, false);
  });
});

describe('시기·기간 (F1-7, F1-8)', () => {
  test('시기 방식 바꾸기: 계절을 고르면 기본 봄', () => {
    const d = fresh();
    setPeriodMode(d, 'season');
    assert.equal(d.project.period.mode, 'season');
    assert.equal(d.project.period.season, 'spring');
    setPeriodMode(d, 'month');
    assert.equal(d.project.period.month, 1);
  });
  test('당일치기는 국내만, 켜면 0박', () => {
    const o = fresh('overseas');
    assert.deepEqual(updatePeriod(o, { dayTrip: true }), { ok: false, error: 'dayTripDomesticOnly' });
    const d = fresh('domestic');
    updatePeriod(d, { nights: 2 });
    updatePeriod(d, { dayTrip: true });
    assert.equal(d.project.period.nights, 0);
    assert.equal(d.project.period.dayTrip, true);
  });
  test('박수를 넣으면 당일치기는 꺼진다, 기간 미정은 null', () => {
    const d = fresh('domestic');
    updatePeriod(d, { dayTrip: true });
    updatePeriod(d, { nights: 3 });
    assert.equal(d.project.period.dayTrip, false);
    updatePeriod(d, { nights: null });
    assert.equal(d.project.period.nights, null);
  });
  test('박수는 0~30으로 제한', () => {
    const d = fresh();
    updatePeriod(d, { nights: 99 });
    assert.equal(d.project.period.nights, 30);
    updatePeriod(d, { nights: -2 });
    assert.equal(d.project.period.nights, 0);
  });
});

describe('동행 형태·인원·예산 (F1-9, F1-10)', () => {
  test('혼자는 인원 1명으로 고정', () => {
    const d = fresh();
    setCompanion(d, 'family');
    setTravelers(d, 4);
    setCompanion(d, 'solo');
    assert.equal(d.project.travelers, 1);
    assert.deepEqual(setTravelers(d, 3), { ok: false, error: 'soloIsOne' });
  });
  test('연인·부부는 2명, 친구·가족은 최소 2명', () => {
    const d = fresh();
    setCompanion(d, 'couple');
    assert.equal(d.project.travelers, 2);
    setTravelers(d, 5);
    setCompanion(d, 'friends');
    assert.equal(d.project.travelers, 5);
    setTravelers(d, 1);
    assert.equal(d.project.travelers, 2);
  });
  test('가족 세부 형태는 가족일 때만, 다른 형태로 바꾸면 지운다', () => {
    const d = fresh();
    assert.deepEqual(setFamilyDetail(d, 'with_kids'), { ok: false, error: 'notFamily' });
    setCompanion(d, 'family');
    setFamilyDetail(d, 'with_kids');
    assert.equal(d.project.companion.familyDetail, 'with_kids');
    setCompanion(d, 'friends');
    assert.equal(d.project.companion.familyDetail, null);
  });
  test('예산은 만 원 단위 입력 → 원으로 저장, 비우면 미정', () => {
    const d = fresh();
    setBudgetManwon(d, '150');
    assert.equal(d.project.budgetPerPerson, 1500000);
    setBudgetManwon(d, '');
    assert.equal(d.project.budgetPerPerson, null);
    setBudgetManwon(d, '-5');
    assert.equal(d.project.budgetPerPerson, null);
  });
});

describe('관심사', () => {
  test('토글과 직접 추가(중복·빈 값 무시)', () => {
    const d = fresh();
    toggleInterest(d, '사진');
    toggleInterest(d, '음식');
    toggleInterest(d, '사진');
    assert.deepEqual(d.project.interests, ['음식']);
    addInterest(d, '  스노클링 ');
    addInterest(d, '스노클링');
    addInterest(d, '   ');
    assert.deepEqual(d.project.interests, ['음식', '스노클링']);
  });
});

describe('동행인 (F8-1)', () => {
  test('추가하면 기본 가중치가 생기고, 인원이 모자라면 늘린다', () => {
    const d = fresh();
    setCompanion(d, 'family');
    const r = addMember(d, '배우자');
    assert.equal(r.ok, true);
    assert.equal(d.members.length, 2);
    assert.ok(d.weights[r.id]);
    assert.equal(d.weights[r.id].vector.length, d.criteria.length);
    addMember(d, '첫째');
    assert.equal(d.project.travelers, 3);
  });
  test('id가 겹치지 않는다 (삭제 후 추가)', () => {
    const d = fresh();
    const a = addMember(d, 'A');
    removeMember(d, a.id);
    const b = addMember(d, 'B');
    const c = addMember(d, 'C');
    assert.equal(new Set(d.members.map((m) => m.id)).size, d.members.length);
    assert.notEqual(b.id, c.id);
  });
  test('이름이 비면 거부, 앞뒤 공백 제거', () => {
    const d = fresh();
    assert.deepEqual(addMember(d, '  '), { ok: false, error: 'nameRequired' });
    renameMember(d, 'm1', '  지운 ');
    assert.equal(d.members[0].name, '지운');
    assert.deepEqual(renameMember(d, 'm1', ''), { ok: false, error: 'nameRequired' });
  });
  test('삭제하면 가중치도 지우고, 마지막 1명은 지울 수 없다', () => {
    const d = fresh();
    const r = addMember(d, '배우자');
    removeMember(d, r.id);
    assert.equal(d.weights[r.id], undefined);
    assert.deepEqual(removeMember(d, 'm1'), { ok: false, error: 'lastMember' });
  });
});

describe('후보 직접 추가 (F3-1)', () => {
  test('해외: 공항 코드는 대문자 3글자로 정리, 국내 필드는 null', () => {
    const d = fresh('overseas');
    const r = addCandidate(d, { name: ' 오키나와 ', country: '일본', code: 'oka', note: '' });
    assert.equal(r.ok, true);
    assert.deepEqual(d.candidates[0], {
      id: r.id, name: '오키나와', country: '일본', region: null, code: 'OKA',
      source: 'manual', note: '', plannedPeriod: null, plannedNights: null, color: 0,
    });
  });
  test('해외: 공항 코드가 3글자 영문이 아니면 거부, 비우면 null', () => {
    const d = fresh('overseas');
    assert.deepEqual(addCandidate(d, { name: '다낭', code: 'DA' }), { ok: false, error: 'badCode' });
    addCandidate(d, { name: '다낭', code: '' });
    assert.equal(d.candidates[0].code, null);
  });
  test('국내: 코드 없이 시·도만', () => {
    const d = fresh('domestic');
    addCandidate(d, { name: '강릉', region: '강원', code: 'GNG', country: '한국' });
    const c = d.candidates[0];
    assert.equal(c.region, '강원');
    assert.equal(c.code, null);
    assert.equal(c.country, null);
  });
  test('이름 필수, 같은 이름은 중복 거부', () => {
    const d = fresh('domestic');
    assert.deepEqual(addCandidate(d, { name: '' }), { ok: false, error: 'nameRequired' });
    addCandidate(d, { name: '경주' });
    assert.deepEqual(addCandidate(d, { name: ' 경주' }), { ok: false, error: 'duplicate' });
  });
  test('시기·기간이 미정이면 조사 기준 시기·일정을 저장한다', () => {
    const d = fresh('domestic');
    addCandidate(d, { name: '제주', plannedPeriod: 'season:autumn', plannedNights: '2' });
    assert.deepEqual(d.candidates[0].plannedPeriod, { season: 'autumn' });
    assert.equal(d.candidates[0].plannedNights, 2);
  });
  test('시기가 정해진 프로젝트에서는 조사 기준 시기를 무시', () => {
    const d = fresh('domestic');
    setPeriodMode(d, 'month');
    updatePeriod(d, { nights: 2 });
    addCandidate(d, { name: '제주', plannedPeriod: 'month:10', plannedNights: '3' });
    assert.equal(d.candidates[0].plannedPeriod, null);
    assert.equal(d.candidates[0].plannedNights, null);
  });
  test('조사 기준 시기 값 해석', () => {
    assert.deepEqual(parsePlannedPeriod('month:10'), { month: 10 });
    assert.deepEqual(parsePlannedPeriod('season:winter'), { season: 'winter' });
    assert.equal(parsePlannedPeriod(''), null);
    assert.equal(parsePlannedPeriod('month:13'), null);
  });
});

describe('후보 색과 삭제 (DESIGN 3장 색 규칙, F3)', () => {
  test('추가 순서대로 색 번호 0, 1, 2… 지운 뒤에는 빈 번호를 다시 쓴다', () => {
    const d = fresh('domestic');
    ['강릉', '경주', '제주'].forEach((name) => addCandidate(d, { name }));
    assert.deepEqual(d.candidates.map((c) => c.color), [0, 1, 2]);
    removeCandidate(d, d.candidates[1].id);
    addCandidate(d, { name: '여수' });
    assert.deepEqual(d.candidates.map((c) => [c.name, c.color]), [['강릉', 0], ['제주', 2], ['여수', 1]]);
  });
  test('9곳 이상이면 색은 다시 돈다', () => {
    const d = fresh('domestic');
    for (let i = 0; i < 9; i++) addCandidate(d, { name: `후보${i}` });
    assert.equal(d.candidates[8].color, 0);
  });
  test('삭제하면 자료·점수·최종 선택도 정리', () => {
    const d = fresh('domestic');
    const { id } = addCandidate(d, { name: '강릉' });
    d.research[id] = { claude: {} };
    d.scores[id] = { cost: { final: 7 } };
    d.decision.chosen = id;
    removeCandidate(d, id);
    assert.equal(d.candidates.length, 0);
    assert.equal(d.research[id], undefined);
    assert.equal(d.scores[id], undefined);
    assert.equal(d.decision.chosen, null);
  });
});

describe('후보 수 안내 (F3-2)', () => {
  test('3곳 미만 / 권장 / 9곳 이상', () => {
    assert.equal(candidateCountNotice(2), 'few');
    assert.equal(candidateCountNotice(5), null);
    assert.equal(candidateCountNotice(9), 'many');
  });
});
