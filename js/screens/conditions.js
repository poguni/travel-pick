// ① 여행 조건 — PRD F1-5~F1-11, F8-1 / DESIGN.md 9장 "여행 조건"(탑승권 모양 폼)
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screenHeader, segmented, button, panel, dashedCard } from '../ui/components/basic.js';
import { field, textInput, selectInput, datalist, choiceGroup } from '../ui/components/form.js';
import { codeText } from '../ui/components/flapCode.js';
import { routeArc } from '../ui/components/boardingPass.js';
import { memberAvatar } from '../ui/components/member.js';
import { originLabel, durationText, budgetText, periodLong } from '../ui/format.js';
import { hrefFor } from '../router.js';
import { INTEREST_PRESETS, ORIGIN_SUGGESTIONS } from '../core/schema.js';
import * as P from '../core/project.js';
import { emptyRedirect } from './placeholder.js';

const SEASONS = [
  { value: 'spring', label: '봄' },
  { value: 'summer', label: '여름' },
  { value: 'autumn', label: '가을' },
  { value: 'winter', label: '겨울' },
];
const COMPANIONS = [
  { value: 'solo', label: '혼자' },
  { value: 'couple', label: '연인·부부' },
  { value: 'friends', label: '친구' },
  { value: 'family', label: '가족' },
];
const FAMILY = [
  { value: 'with_kids', label: '아이 동반' },
  { value: 'with_parents', label: '부모님 동반' },
  { value: 'with_kids_and_parents', label: '모두 동반' },
  { value: 'adults_only', label: '성인만' },
];

function tripTypeSection(ctx, data) {
  const locked = data.candidates.length > 0;
  return h(
    'div',
    { class: 'trip-type' },
    segmented({
      label: '여행 종류',
      options: [
        { value: 'overseas', label: '해외 여행' },
        { value: 'domestic', label: '국내 여행' },
      ],
      value: data.project.tripType,
      onChange: (v) => ctx.update((d) => P.setTripType(d, v)),
      disabled: locked,
      idPrefix: 'cond-trip',
    }),
    locked &&
      h(
        'p',
        { class: 'muted trip-type__lock', id: 'cond-trip-lock' },
        icon('warning', { size: 14 }),
        `후보 ${data.candidates.length}곳이 담겨 있어 여행 종류를 바꿀 수 없어요. 다른 종류로 비교하려면 새 프로젝트를 만들어 주세요.`,
      ),
  );
}

function periodField(ctx, p) {
  const period = p.period;
  let detail;
  if (period.mode === 'season') {
    detail = choiceGroup({ label: '계절', idPrefix: 'cond-season', options: SEASONS, selected: period.season, onSelect: (v) => ctx.update((d) => P.updatePeriod(d, { season: v })) });
  } else if (period.mode === 'month') {
    detail = selectInput({
      id: 'cond-month',
      ariaLabel: '출발 월',
      value: period.month,
      options: Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}월` })),
      onCommit: (v) => ctx.update((d) => P.updatePeriod(d, { month: Number(v) })),
    });
  } else if (period.mode === 'dates') {
    detail = textInput({ id: 'cond-date', type: 'date', ariaLabel: '출발일', value: period.startDate ?? '', onCommit: (v) => ctx.update((d) => P.updatePeriod(d, { startDate: v })) });
  } else {
    detail = h('p', { class: 'field__note' }, 'AI가 후보별로 가장 좋은 시기를 추천하고, 그 시기를 기준으로 조사해요.');
  }
  return h(
    'div',
    { class: 'field' },
    h('span', { class: 'field__label', id: 'cond-period-label' }, 'DEPART · 출발 시기'),
    choiceGroup({
      label: '출발 시기 정하는 방식',
      idPrefix: 'cond-pmode',
      variant: 'tabs',
      options: [
        { value: 'season', label: '계절' },
        { value: 'month', label: '월' },
        { value: 'dates', label: '날짜' },
        { value: 'undecided', label: '미정' },
      ],
      selected: period.mode,
      onSelect: (v) => ctx.update((d) => P.setPeriodMode(d, v)),
    }),
    detail,
    period.mode !== 'undecided' && h('span', { class: 'field__value' }, periodLong(period)),
  );
}

function durationField(ctx, p) {
  const period = p.period;
  const domestic = p.tripType === 'domestic';
  const open = period.nights == null && !period.dayTrip;
  return h(
    'div',
    { class: 'field' },
    h('label', { class: 'field__label', for: 'cond-nights' }, 'DURATION · 기간'),
    h(
      'div',
      { class: 'inline-input' },
      textInput({
        id: 'cond-nights',
        type: 'number',
        inputmode: 'numeric',
        min: 0,
        max: 30,
        value: period.dayTrip || period.nights == null ? '' : period.nights,
        placeholder: period.dayTrip ? '당일' : '미정',
        onCommit: (v) => ctx.update((d) => P.updatePeriod(d, { nights: v === '' ? null : Number(v) })),
        className: 'input--short',
      }),
      h('span', { class: 'inline-input__unit' }, '박'),
    ),
    choiceGroup({
      label: '기간 빠른 선택',
      idPrefix: 'cond-dur',
      options: [
        domestic && { value: 'daytrip', label: '당일치기' },
        { value: 'open', label: '미정' },
      ].filter(Boolean),
      selected: period.dayTrip ? 'daytrip' : open ? 'open' : null,
      onSelect: (v) => ctx.update((d) => P.updatePeriod(d, v === 'daytrip' ? { dayTrip: true } : { nights: null })),
    }),
    !open && h('span', { class: 'field__value' }, durationText(period)),
  );
}

function companionField(ctx, p) {
  const type = p.companion.type;
  const fixed = type === 'solo';
  return h(
    'div',
    { class: 'field' },
    h('span', { class: 'field__label' }, 'PASSENGERS · 동행'),
    choiceGroup({ label: '동행 형태', idPrefix: 'cond-comp', options: COMPANIONS, selected: type, onSelect: (v) => ctx.update((d) => P.setCompanion(d, v)) }),
    type === 'family' &&
      choiceGroup({ label: '가족 세부 형태', idPrefix: 'cond-family', options: FAMILY, selected: p.companion.familyDetail, onSelect: (v) => ctx.update((d) => P.setFamilyDetail(d, v)) }),
    h(
      'div',
      { class: 'inline-input' },
      h('label', { class: 'inline-input__label', for: 'cond-travelers' }, '인원'),
      textInput({
        id: 'cond-travelers',
        type: 'number',
        inputmode: 'numeric',
        min: fixed ? 1 : 2,
        max: 99,
        value: p.travelers,
        disabled: fixed,
        onCommit: (v) => ctx.update((d) => P.setTravelers(d, Number(v))),
        className: 'input--short',
      }),
      h('span', { class: 'inline-input__unit' }, '명'),
    ),
    type === 'family' && !p.companion.familyDetail && h('span', { class: 'field__hint' }, '세부 형태를 고르면 AI가 추천 이유를 더 잘 맞춰요.'),
  );
}

function budgetField(ctx, p) {
  return h(
    'div',
    { class: 'field' },
    h('label', { class: 'field__label', for: 'cond-budget' }, 'BUDGET / PAX · 1인 예산'),
    h(
      'div',
      { class: 'inline-input' },
      textInput({
        id: 'cond-budget',
        type: 'number',
        inputmode: 'decimal',
        min: 0,
        step: 1,
        value: p.budgetPerPerson == null ? '' : p.budgetPerPerson / 10000,
        placeholder: '미정',
        hint: true,
        onCommit: (v) => ctx.update((d) => P.setBudgetManwon(d, v)),
        className: 'input--mid',
      }),
      h('span', { class: 'inline-input__unit' }, '만 원'),
    ),
    h('span', { class: 'field__hint', id: 'cond-budget-hint' }, '교통·숙박·현지 경비를 모두 더한 1인 총경비. 비워 두면 미정.'),
    p.budgetPerPerson != null && h('span', { class: 'field__value' }, budgetText(p.budgetPerPerson)),
  );
}

/** 탑승권 모양 폼 (DESIGN.md 9장) */
function ticketForm(ctx, data) {
  const p = data.project;
  return h(
    'section',
    { class: ['bp', 'bp--form', `bp--${p.tripType}`, 'on-paper'], 'aria-label': '여행 조건' },
    h(
      'div',
      { class: 'bp__main' },
      h('div', { class: 'bp__top' }, h('span', null, 'BOARDING PASS · 여행 조건'), h('span', null, p.tripType === 'domestic' ? 'DOMESTIC · 국내' : 'INTERNATIONAL · 해외')),
      field({
        id: 'cond-name',
        label: '프로젝트 이름',
        className: 'field--name',
        children: textInput({ id: 'cond-name', value: p.name, maxlength: 40, onCommit: (v) => ctx.update((d) => P.setProjectName(d, v)), className: 'input--title' }),
      }),
      h(
        'div',
        { class: 'bp__journey' },
        h(
          'div',
          { class: 'bp__end' },
          codeText(originLabel(p), { size: 84 }),
          h(
            'div',
            { class: 'inline-input origin-input' },
            h('label', { class: 'inline-input__label', for: 'cond-origin' }, p.tripType === 'domestic' ? '출발 도시' : '출발 공항'),
            textInput({ id: 'cond-origin', value: p.origin, list: 'cond-origin-list', onCommit: (v) => ctx.update((d) => P.setOrigin(d, v)), className: 'input--mid' }),
            datalist('cond-origin-list', ORIGIN_SUGGESTIONS[p.tripType]),
          ),
        ),
        routeArc(p.tripType),
        h('div', { class: 'bp__end' }, h('span', { class: 'code code--pending', style: { '--code-size': '84px' } }, '? ? ?'), h('span', { class: 'bp__caption' }, '후보는 다음 게이트에서')),
      ),
      h('div', { class: 'bp__grid bp__grid--form' }, periodField(ctx, p), durationField(ctx, p), companionField(ctx, p), budgetField(ctx, p)),
    ),
  );
}

function interestsPanel(ctx, p) {
  const custom = p.interests.filter((t) => !INTEREST_PRESETS.includes(t));
  return panel({
    title: '관심사',
    meta: `${p.interests.length}개 선택`,
    children: [
      choiceGroup({
        label: '관심사 태그',
        idPrefix: 'cond-int',
        options: [...INTEREST_PRESETS, ...custom].map((t) => ({ value: t, label: t })),
        selected: p.interests,
        onSelect: (t) => ctx.update((d) => P.toggleInterest(d, t)),
      }),
      h(
        'div',
        { class: 'inline-input' },
        h('label', { class: 'visually-hidden', for: 'cond-int-new' }, '관심사 직접 추가'),
        textInput({ id: 'cond-int-new', placeholder: '직접 추가 (예: 스노클링)', maxlength: 20, onCommit: (v) => ctx.update((d) => P.addInterest(d, v)) }),
      ),
    ],
  });
}

function membersPanel(ctx, data) {
  const single = data.members.length <= 1;
  return panel({
    title: '동행인',
    meta: `가중치를 입력할 사람 ${data.members.length}명`,
    children: [
      h('p', { class: 'muted' }, '기준의 중요도를 따로 입력할 사람만 추가하세요. 아이처럼 직접 입력하지 않는 사람은 위의 인원에만 넣으면 돼요.'),
      h(
        'ul',
        { class: 'member-list' },
        data.members.map((m, i) =>
          h(
            'li',
            { class: 'member-row' },
            memberAvatar(m, i, { size: 36 }),
            h('label', { class: 'visually-hidden', for: `cond-mname-${m.id}` }, `동행인 ${i + 1} 이름`),
            textInput({ id: `cond-mname-${m.id}`, value: m.name, maxlength: 12, onCommit: (v) => ctx.update((d) => P.renameMember(d, m.id, v)) }),
            button({
              variant: 'icon',
              label: `${m.name} 삭제`,
              iconName: 'close',
              disabled: single,
              onClick: () => ctx.update((d) => P.removeMember(d, m.id)),
            }),
          ),
        ),
      ),
      h(
        'div',
        { class: 'inline-input' },
        h('label', { class: 'visually-hidden', for: 'cond-mnew' }, '새 동행인 이름'),
        textInput({
          id: 'cond-mnew',
          placeholder: '이름을 쓰고 Enter (예: 배우자)',
          maxlength: 12,
          onCommit: (v) => {
            const r = ctx.update((d) => P.addMember(d, v));
            if (r.ok) document.getElementById('cond-mnew')?.focus();
          },
        }),
      ),
    ],
  });
}

export function renderConditions(ctx) {
  const { data } = ctx;
  if (!data) return emptyRedirect('conditions');
  const next = () =>
    button({ variant: 'primary', label: '후보 발굴로', next: true, href: hrefFor('candidates') });
  return {
    node: h(
      'div',
      { class: 'screen' },
      screenHeader({ eyebrow: 'GATE 01 · CONDITIONS', title: ['어떤 여행을', '떠나고 싶나요?'] }),
      tripTypeSection(ctx, data),
      ticketForm(ctx, data),
      h('div', { class: 'two-col' }, h('div', { class: 'two-col__main' }, interestsPanel(ctx, data.project)), h('div', { class: 'two-col__side' }, membersPanel(ctx, data))),
      dashedCard({
        eyebrow: 'NEXT GATE · 02',
        title: '이 조건으로 후보 여행지를 모아 볼까요?',
        desc: '직접 추가하거나, AI 3개 모델에게 요즘 떠오르는 곳을 추천받아요.',
        action: next(),
      }),
    ),
    mobileActions: [next()],
  };
}
