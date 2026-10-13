// ② 후보 발굴 — Phase 4: 직접 추가·목록·삭제 (F3). AI 추천(F2)은 Phase 8.
import { h } from '../ui/dom.js';
import { screenHeader, button, panel, dashedCard, emptyState, chip } from '../ui/components/basic.js';
import { field, datalist } from '../ui/components/form.js';
import { flapCode, placeLabel } from '../ui/components/flapCode.js';
import { icon } from '../ui/icons.js';
import { periodLong, durationText, companionText, familyDetailText, budgetText } from '../ui/format.js';
import { hrefFor } from '../router.js';
import { REGIONS, CANDIDATE_RECOMMENDED } from '../core/schema.js';
import { addCandidate, removeCandidate, candidateCountNotice } from '../core/project.js';
import { emptyRedirect } from './placeholder.js';

const SEASON_KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };

const ERRORS = {
  nameRequired: '이름을 입력해 주세요.',
  duplicate: '같은 이름의 후보가 이미 있어요.',
  badCode: '공항 코드는 영문 3글자예요 (예: OKA). 모르면 비워 두세요.',
};

const plannedLabel = (c) => {
  const parts = [];
  if (c.plannedPeriod?.season) parts.push(`추천 시기 · ${SEASON_KO[c.plannedPeriod.season]}`);
  if (c.plannedPeriod?.month) parts.push(`추천 시기 · ${c.plannedPeriod.month}월`);
  if (c.plannedNights != null) parts.push(`일정 · ${c.plannedNights ? `${c.plannedNights}박 ${c.plannedNights + 1}일` : '당일치기'}`);
  return parts;
};

/** 여행 조건 요약 칩 (시안 02 조건 칩 줄) */
export function conditionChips(data) {
  const p = data.project;
  const detail = familyDetailText(p.companion);
  const period = p.period.mode === 'undecided' ? '시기 미정' : periodLong(p.period);
  const duration = durationText(p.period) === '미정' ? '기간 미정' : durationText(p.period);
  return h(
    'div',
    { class: 'chip-row' },
    chip(p.tripType === 'domestic' ? '국내' : '해외'),
    chip(detail ? `${companionText(p.companion, p.travelers)} · ${detail}` : companionText(p.companion, p.travelers)),
    chip(`${period} · ${duration}`),
    chip(`1인 ${budgetText(p.budgetPerPerson)}`),
    p.interests.length && chip(`관심사 · ${p.interests.join(' · ')}`),
  );
}

function addForm(ctx, data) {
  const p = data.project;
  const overseas = p.tripType === 'overseas';
  const periodOpen = p.period.mode === 'undecided';
  const nightsOpen = p.period.nights == null && !p.period.dayTrip;
  const error = h('p', { class: 'form-error', id: 'cand-error', role: 'alert' });

  const onSubmit = (e) => {
    e.preventDefault();
    const input = Object.fromEntries(new FormData(e.target));
    const r = ctx.update((d) => addCandidate(d, input));
    if (r.ok) {
      document.getElementById('cand-name')?.focus();
    } else {
      error.textContent = ERRORS[r.error] ?? '추가하지 못했어요.';
      document.getElementById(r.error === 'badCode' ? 'cand-code' : 'cand-name')?.focus();
    }
  };

  const input = (id, name, props = {}) => h('input', { id, name, class: 'input', autocomplete: 'off', 'aria-describedby': 'cand-error', ...props });

  return panel({
    title: '직접 추가',
    meta: overseas ? '해외' : '국내',
    children: [
      h(
        'form',
        { class: 'stack', onSubmit, noValidate: true },
        field({ id: 'cand-name', label: overseas ? '도시·지역 *' : '지명 *', children: input('cand-name', 'name', { placeholder: overseas ? '예: 오키나와' : '예: 강릉', maxlength: 30, required: true }) }),
        overseas
          ? h(
              'div',
              { class: 'field-row' },
              field({ id: 'cand-country', label: '국가', children: input('cand-country', 'country', { placeholder: '예: 일본', maxlength: 20 }) }),
              field({ id: 'cand-code', label: '공항 코드', hint: '선택 · 영문 3글자', children: input('cand-code', 'code', { placeholder: 'OKA', maxlength: 3, class: 'input input--code', 'aria-describedby': 'cand-code-hint cand-error' }) }),
            )
          : field({
              id: 'cand-region',
              label: '시·도',
              children: [input('cand-region', 'region', { list: 'cand-region-list', placeholder: '예: 강원', maxlength: 10 }), datalist('cand-region-list', REGIONS)],
            }),
        (periodOpen || nightsOpen) &&
          h(
            'div',
            { class: 'field-row' },
            periodOpen &&
              field({
                id: 'cand-planned',
                label: '조사 기준 시기',
                hint: '시기 미정 프로젝트',
                children: h(
                  'select',
                  { id: 'cand-planned', name: 'plannedPeriod', class: 'input input--select', 'aria-describedby': 'cand-planned-hint' },
                  h('option', { value: '' }, '나중에 정하기'),
                  Object.entries(SEASON_KO).map(([v, label]) => h('option', { value: `season:${v}` }, label)),
                  Array.from({ length: 12 }, (_, i) => h('option', { value: `month:${i + 1}` }, `${i + 1}월`)),
                ),
              }),
            nightsOpen &&
              field({
                id: 'cand-nights',
                label: '조사 기준 일정',
                hint: '박 · 기간 미정 프로젝트',
                children: input('cand-nights', 'plannedNights', { type: 'number', inputmode: 'numeric', min: 0, max: 30, placeholder: '예: 2', class: 'input input--short', 'aria-describedby': 'cand-nights-hint' }),
              }),
          ),
        field({ id: 'cand-note', label: '메모', children: input('cand-note', 'note', { placeholder: '가고 싶은 이유, 들은 정보 등', maxlength: 100 }) }),
        error,
        h('button', { type: 'submit', class: 'btn btn--paper', id: 'cand-submit' }, icon('plus', { size: 16 }), '후보에 추가'),
      ),
    ],
  });
}

function candidateRow(ctx, c, overseas) {
  const meta = [overseas ? c.country : c.region, c.source === 'ai' ? 'AI 추천' : '직접 추가'].filter(Boolean).join(' · ');
  return h(
    'li',
    { class: 'cand-row', style: { '--cand': `var(--c${c.color + 1})` } },
    h('span', { class: 'cand-row__swatch', 'aria-hidden': 'true' }),
    flapCode(c, { size: 20 }),
    h(
      'div',
      { class: 'cand-row__text' },
      // 국내(또는 코드 없는 해외)는 플랩 자리에 이미 지명이 나오므로 이름 줄 생략
      !placeLabel(c).ko && h('span', { class: 'cand-row__name' }, c.name),
      h('span', { class: 'cand-row__meta' }, meta),
      c.note && h('span', { class: 'cand-row__note' }, c.note),
      plannedLabel(c).length > 0 && h('span', { class: 'chip-row' }, plannedLabel(c).map((t) => chip(t))),
    ),
    button({ variant: 'icon', label: `${c.name} 후보에서 빼기`, iconName: 'close', onClick: () => ctx.update((d) => removeCandidate(d, c.id)) }),
  );
}

function listPanel(ctx, data) {
  const n = data.candidates.length;
  const notice = candidateCountNotice(n);
  const overseas = data.project.tripType === 'overseas';
  return panel({
    title: '후보 목록',
    meta: `후보 ${n} / 권장 ${CANDIDATE_RECOMMENDED.min}–${CANDIDATE_RECOMMENDED.max}`,
    children: [
      n === 0
        ? emptyState({ title: '아직 후보가 없어요', desc: '옆의 폼으로 직접 추가해 보세요. AI 추천은 Phase 8에서 연결됩니다.' })
        : h('ol', { class: 'cand-list' }, data.candidates.map((c) => candidateRow(ctx, c, overseas))),
      notice === 'many' &&
        h('p', { class: 'notice notice--warn' }, icon('warning', { size: 16 }), `후보가 ${n}곳이에요. 9곳 이상이면 비교하기 버겁고 AI 조사 비용도 커져요. 3~8곳으로 줄이는 걸 권해요.`),
      notice === 'few' && n > 0 && h('p', { class: 'muted' }, `비교하려면 ${CANDIDATE_RECOMMENDED.min}곳 이상을 권해요.`),
    ],
  });
}

export function renderCandidates(ctx) {
  const { data } = ctx;
  if (!data) return emptyRedirect('candidates');
  const domestic = data.project.tripType === 'domestic';
  const next = () => button({ variant: 'primary', label: '자료 수집으로', next: true, href: hrefFor('research') });
  return {
    node: h(
      'div',
      { class: 'screen' },
      screenHeader({
        eyebrow: 'GATE 02 · DISCOVER',
        title: ['어디를', `${domestic ? '국내' : '해외'} 후보로 올려 볼까요?`],
        below: conditionChips(data),
      }),
      dashedCard({
        eyebrow: 'AI RECOMMEND · PHASE 8',
        title: '세 AI에게 요즘 떠오르는 여행지를 추천받는 기능은 Phase 8에서 연결합니다',
        desc: '지금은 직접 추가한 후보로 다음 단계를 진행할 수 있어요.',
      }),
      h('div', { class: 'two-col' }, h('div', { class: 'two-col__main' }, listPanel(ctx, data)), h('div', { class: 'two-col__side' }, addForm(ctx, data))),
      dashedCard({ eyebrow: 'NEXT GATE · 03', title: '후보가 모였으면 자료를 모아 비교해요', action: next() }),
    ),
    mobileActions: [next()],
  };
}
