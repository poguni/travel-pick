// ④ 기준·가중치 — PRD F5, F6, F8-2·F8-4 / DESIGN.md 6.9~6.12, 7장 03
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screenHeader, segmented, button, panel, dashedCard } from '../ui/components/basic.js';
import { textInput } from '../ui/components/form.js';
import { memberSwitcher } from '../ui/components/member.js';
import { crGauge, weightBars } from '../ui/components/weightViz.js';
import { hrefFor } from '../router.js';
import { MAX_CRITERIA, criterionInfo } from '../core/schema.js';
import * as W from '../core/weights.js';
import { memberWeights, memberStatus, groupWeights, pairList, sliderValueOf } from '../selectors.js';
import { emptyRedirect } from './placeholder.js';

const PAGE = 7;
const TICKS = ['9', '7', '5', '3', '1', '3', '5', '7', '9'];

/** 슬라이더 값 → 결과 문구와 이기는 쪽 */
function judgmentText(v) {
  if (v === 0) return { text: '같음', side: null };
  return { text: `${Math.abs(v) + 1}배 중요`, side: v < 0 ? 'left' : 'right' };
}

/** 제안값(a[a][b]) → 사람이 읽는 문장 */
function suggestionText(s, nameOf) {
  if (s.suggested === 1) return `"같음"으로 바꾸면`;
  return s.suggested > 1 ? `"${nameOf(s.a)} 쪽 ${s.suggested}배 중요"로 바꾸면` : `"${nameOf(s.b)} 쪽 ${Math.round(1 / s.suggested)}배 중요"로 바꾸면`;
}

// ── 기준 편집 (F5-2, F5-5) ───────────────────────────────

/** 접었다 펴는 기준 편집 패널. 열림 상태는 ui에 둬서 다시 그려도 유지 */
function criteriaPanel(ctx, data) {
  const n = data.criteria.length;
  const open = Boolean(ctx.ui().critOpen);
  return h(
    'details',
    { class: 'panel crit-panel', open, onToggle: (e) => e.target.open !== open && ctx.setUi({ critOpen: e.target.open }) },
    h(
      'summary',
      { class: 'crit-panel__summary', id: 'w-crit-summary' },
      h('span', { class: 'panel__title' }, '평가 기준', h('span', { class: 'panel__meta' }, `${n}개 · 권장 3–7, 최대 ${MAX_CRITERIA}`)),
      h('span', { class: 'crit-panel__names' }, data.criteria.map((c) => c.name).join(' · ')),
      h('span', { class: 'crit-panel__toggle' }, open ? '접기' : '편집', icon('chevronDown', { size: 16 })),
    ),
    criteriaEditor(ctx, data),
  );
}

function criteriaEditor(ctx, data) {
  const n = data.criteria.length;
  return h(
    'div',
    { class: 'stack' },
    ...[
      h('p', { class: 'muted' }, '기준을 바꾸면 모든 탑승객의 가중치와 점수표에 함께 반영돼요.'),
      h(
        'ul',
        { class: 'crit-list' },
        data.criteria.map((c, i) =>
          h(
            'li',
            { class: 'crit-row' },
            h('label', { class: 'visually-hidden', for: `w-cname-${c.id}` }, `기준 ${i + 1} 이름`),
            textInput({
              id: `w-cname-${c.id}`,
              value: c.name,
              maxlength: 12,
              hint: criterionInfo(c, data.project.tripType) ? true : null,
              onCommit: (v) => ctx.update((d) => W.renameCriterion(d, c.id, v)),
            }),
            button({
              variant: 'icon',
              label: `${c.name} 기준 삭제`,
              iconName: 'close',
              disabled: n <= W.MIN_CRITERIA,
              onClick: () => {
                const hasScores = Object.values(data.scores).some((row) => row[c.id]);
                if (hasScores && !window.confirm(`"${c.name}" 기준을 지우면 이 기준의 점수도 지워져요. 계속할까요?`)) return;
                ctx.update((d) => W.removeCriterion(d, c.id));
              },
            }),
            criterionInfo(c, data.project.tripType) && h('span', { class: 'crit-row__info', id: `w-cname-${c.id}-hint` }, criterionInfo(c, data.project.tripType)),
          ),
        ),
      ),
      n < MAX_CRITERIA &&
        h(
          'div',
          { class: 'inline-input' },
          h('label', { class: 'visually-hidden', for: 'w-cnew' }, '새 기준 이름'),
          textInput({
            id: 'w-cnew',
            placeholder: '기준 추가 (예: 대중교통) · Enter',
            maxlength: 12,
            onCommit: (v) => {
              const r = ctx.update((d) => W.addCriterion(d, v));
              if (!r.ok && r.error === 'duplicate') ctx.flash('같은 이름의 기준이 이미 있어요.', 'warn');
              if (r.ok) document.getElementById('w-cnew')?.focus();
            },
          }),
        ),
    ],
  );
}

// ── 단순 모드 (F6-1) ─────────────────────────────────────

function simplePanel(ctx, data, memberId, result) {
  const w = data.weights[memberId];
  return panel({
    title: '기준마다 중요도를 0~10으로 정해 주세요',
    meta: '합계는 자동으로 100%',
    label: '단순 슬라이더',
    children: data.criteria.map((c, i) => {
      const raw = w?.raw?.[c.id] ?? 5;
      const others = data.criteria.reduce((sum, x) => (x.id === c.id ? sum : sum + (w?.raw?.[x.id] ?? 5)), 0);
      const label = (r) => `${r} · ${Math.round((others + r > 0 ? r / (others + r) : 1 / data.criteria.length) * 100)}%`;
      const value = h('span', { class: 'simple-row__value' }, `${raw} · ${Math.round(result.vector[i] * 100)}%`);
      return h(
        'div',
        { class: 'simple-row' },
        h('label', { class: 'simple-row__name', for: `w-raw-${c.id}` }, c.name),
        h('input', {
          id: `w-raw-${c.id}`,
          class: 'range',
          type: 'range',
          min: '0',
          max: '10',
          step: '1',
          value: String(raw),
          'aria-valuetext': `${raw}점`,
          onInput: (e) => (value.textContent = label(Number(e.target.value))), // 끄는 동안 이 기준의 비율 미리 보기
          onChange: (e) => ctx.update((d) => W.setRawWeight(d, memberId, c.id, e.target.value)),
        }),
        value,
      );
    }),
  });
}

// ── AHP 모드 (F6-2~F6-4, DESIGN 6.11) ────────────────────

function pairRow(ctx, memberId, w, pair, warn, nameOf) {
  const { a, b } = pair;
  const v = sliderValueOf(w, a.id, b.id);
  const judged = (w?.judged ?? []).includes(pair.key);
  const left = h('span', { class: 'pair__name pair__name--left' }, a.name);
  const right = h('span', { class: 'pair__name pair__name--right' }, b.name);
  const result = h('span', { class: 'pair__result' });
  const paint = (val) => {
    const j = judgmentText(val);
    left.classList.toggle('is-win', j.side === 'left');
    right.classList.toggle('is-win', j.side === 'right');
    result.textContent = j.text;
    result.dataset.side = j.side ?? '';
  };
  paint(v);
  const aria = (val) => {
    const j = judgmentText(val);
    return j.side ? `${j.side === 'left' ? a.name : b.name} 쪽 ${j.text}` : '같음';
  };
  return h(
    'div',
    { class: ['pair', warn && 'is-warn', !judged && 'is-new'] },
    left,
    h('input', {
      id: `w-pair-${a.id}-${b.id}`,
      class: 'range range--pair',
      type: 'range',
      min: '-8',
      max: '8',
      step: '1',
      value: String(v),
      'aria-label': `${a.name} 대 ${b.name}`,
      'aria-valuetext': aria(v),
      onInput: (e) => {
        paint(Number(e.target.value));
        e.target.setAttribute('aria-valuetext', aria(Number(e.target.value)));
      },
      onChange: (e) => ctx.update((d) => W.setPairJudgment(d, memberId, a.id, b.id, e.target.value)),
    }),
    right,
    h('span'),
    h('span', { class: 'pair__ticks', 'aria-hidden': 'true' }, TICKS.map((t) => h('span', null, t))),
    result,
    warn &&
      h(
        'div',
        { class: 'pair__warn' },
        icon('warning', { size: 16 }),
        h('span', null, `다른 판단과 가장 어긋나는 비교예요. ${suggestionText(warn, nameOf)} CR이 ${warn.crAfter.toFixed(2)}로 좋아져요.`),
        button({ variant: 'secondary', label: '제안대로 바꾸기', onClick: () => ctx.update((d) => W.applySuggestion(d, memberId)) }),
      ),
  );
}

function ahpPanel(ctx, data, memberId, result) {
  const w = data.weights[memberId];
  const pairs = pairList(data.criteria);
  const pages = Math.max(1, Math.ceil(pairs.length / PAGE));
  const page = Math.min(ctx.ui().ahpPage ?? 0, pages - 1);
  const shown = pairs.slice(page * PAGE, page * PAGE + PAGE);
  const nameOf = (id) => data.criteria.find((c) => c.id === id)?.name ?? id;
  const warnKey = result.inconsistent ? W.pairKey(result.inconsistent.a, result.inconsistent.b) : null;
  const progress = result.total ? result.judged / result.total : 1;

  return h(
    'section',
    { class: 'panel', 'aria-label': 'AHP 쌍대비교' },
    h(
      'div',
      { class: 'panel__bar' },
      h('h2', { class: 'panel__title' }, '두 기준씩 견주어 보세요'),
      h(
        'span',
        { class: 'progress-mini' },
        `${result.judged} / ${result.total}`,
        h('span', { class: 'progress-mini__track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(result.total), 'aria-valuenow': String(result.judged), 'aria-label': '비교 진행률' }, h('span', { style: { width: `${progress * 100}%` } })),
      ),
    ),
    h('p', { class: 'muted' }, '슬라이더를 더 중요한 쪽으로 옮기세요. 가운데는 "같음", 끝은 "9배 중요"예요.'),
    h(
      'div',
      { class: 'pairs' },
      shown.map((p) => {
        const warn = p.key === warnKey ? result.inconsistent : null;
        return pairRow(ctx, memberId, w, p, warn, nameOf);
      }),
    ),
    h(
      'div',
      { class: 'panel__foot' },
      button({
        variant: 'secondary',
        label: '슬라이더 값으로 나머지 채우기',
        disabled: result.judged >= result.total,
        onClick: () => ctx.update((d) => W.fillRemainingPairs(d, memberId)),
      }),
      h(
        'div',
        { class: 'btn-row' },
        h('span', { class: 'page-info' }, `${page * PAGE + 1}–${page * PAGE + shown.length} / ${pairs.length}`),
        page > 0 && button({ variant: 'secondary', label: '이전', onClick: () => ctx.setUi({ ahpPage: page - 1 }) }),
        page < pages - 1 &&
          button({ variant: 'paper', label: `다음 ${Math.min(PAGE, pairs.length - (page + 1) * PAGE)}개 비교하기`, onClick: () => ctx.setUi({ ahpPage: page + 1 }) }),
      ),
    ),
  );
}

function crCardFor(ctx, data, result) {
  const left = result.total - result.judged;
  const s = result.inconsistent;
  const pairs = pairList(data.criteria);
  const note = h(
    'div',
    { class: 'cr-card__note' },
    left > 0 && h('p', null, `아직 ${left}개 비교가 남았어요. 남은 쌍은 "같음"으로 계산 중이에요.`),
    s &&
      button({
        variant: 'paper-line',
        label: '가장 어긋나는 비교 보기',
        onClick: () => ctx.setUi({ ahpPage: Math.floor(pairs.findIndex((p) => p.key === W.pairKey(s.a, s.b)) / PAGE) }),
      }),
  );
  return crGauge(result.consistency, { n: data.criteria.length, note });
}

// ── 그룹 합계 (F8-4) ─────────────────────────────────────

function groupTable(data, group) {
  const pct = (v) => `${Math.round(v * 100)}`;
  return h(
    'section',
    { class: 'panel', 'aria-label': '탑승객별 가중치' },
    h('h2', { class: 'panel__title' }, '탑승객별 가중치', h('span', { class: 'panel__meta' }, '단위 %')),
    h(
      'div',
      { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': '가중치 표' },
      h(
        'table',
        { class: 'wtable' },
        h(
          'thead',
          null,
          h('tr', null, h('th', { scope: 'col' }, '탑승객'), h('th', { scope: 'col' }, '방식'), data.criteria.map((c) => h('th', { scope: 'col', class: 'num' }, c.name)), h('th', { scope: 'col', class: 'num' }, 'CR')),
        ),
        h(
          'tbody',
          null,
          group.members.map((m) =>
            h(
              'tr',
              null,
              h('th', { scope: 'row' }, m.name),
              h('td', null, m.mode === 'ahp' ? 'AHP' : '단순'),
              m.vector.map((v) => h('td', { class: 'num' }, pct(v))),
              h('td', { class: ['num', m.cr != null && m.cr >= 0.1 && 'is-bad'] }, m.cr == null ? '—' : m.cr.toFixed(2)),
            ),
          ),
          h(
            'tr',
            { class: 'is-group' },
            h('th', { scope: 'row' }, '그룹'),
            h('td', null, group.method === 'aij' ? 'AIJ' : '평균'),
            group.vector.map((v) => h('td', { class: 'num' }, pct(v))),
            h('td', { class: 'num' }, group.cr == null ? '—' : group.cr.toFixed(2)),
          ),
        ),
      ),
    ),
  );
}

const groupNote = (group, count) =>
  group.method === 'aij'
    ? `그룹 가중치는 ${count}명의 판단을 기하평균(AIJ)으로 합쳐 계산해요.`
    : `단순 모드인 사람이 있어서, ${count}명의 가중치를 평균해 그룹 가중치를 만들었어요. 모두 AHP로 입력하면 판단을 기하평균(AIJ)으로 합치고 그룹 CR도 볼 수 있어요.`;

// ── 화면 ─────────────────────────────────────────────────

export function renderWeights(ctx) {
  const { data } = ctx;
  if (!data) return emptyRedirect('weights');
  const ui = ctx.ui();
  const members = data.members;
  const activeId = members.some((m) => m.id === ui.weightsMember) ? ui.weightsMember : members[0].id;
  const groupView = Boolean(ui.weightsGroup) && members.length > 1;
  const w = data.weights[activeId];
  const result = memberWeights(data.criteria, w);
  const group = groupWeights(data);
  const statuses = Object.fromEntries(members.map((m) => [m.id, memberStatus(data.criteria, data.weights[m.id])]));
  const activeName = members.find((m) => m.id === activeId).name;

  const modeControl = segmented({
    label: '입력 방식',
    idPrefix: 'w-mode',
    options: [
      { value: 'simple', label: '단순 슬라이더' },
      { value: 'ahp', label: 'AHP 쌍대비교' },
    ],
    value: result.mode,
    disabled: groupView,
    onChange: (v) => ctx.update((d) => W.setWeightMode(d, activeId, v)),
  });

  const switcher =
    members.length > 1 &&
    memberSwitcher({
      members,
      activeId,
      statuses,
      groupActive: groupView,
      onSelect: (id) => ctx.setUi({ weightsMember: id, weightsGroup: false, ahpPage: 0 }),
      onGroup: () => ctx.setUi({ weightsGroup: true }),
    });

  let left;
  let right;
  if (groupView) {
    left = groupTable(data, group);
    right = [
      group.method === 'aij' && crGauge(group.consistency, { n: data.criteria.length, title: '그룹 일관성 비율' }),
      weightBars(data.criteria, group.vector, { title: '그룹 가중치', note: groupNote(group, members.length) }),
    ];
  } else if (result.mode === 'ahp') {
    left = ahpPanel(ctx, data, activeId, result);
    right = [crCardFor(ctx, data, result), weightBars(data.criteria, result.vector, { title: members.length > 1 ? `${activeName}의 가중치` : '나의 가중치', note: members.length > 1 ? groupNote(group, members.length) : null })];
  } else {
    left = simplePanel(ctx, data, activeId, result);
    right = [
      weightBars(data.criteria, result.vector, { title: members.length > 1 ? `${activeName}의 가중치` : '나의 가중치' }),
      dashedCard({ eyebrow: 'TIP · AHP', title: 'AHP로 바꾸면 판단이 서로 맞는지 확인할 수 있어요', desc: '두 기준씩 비교하고 일관성 비율(CR)을 계산해요. 지금 슬라이더 값으로 비교 초깃값을 채울 수 있어요.' }),
    ];
  }

  const next = () => button({ variant: 'primary', label: '점수 매기기로', next: true, href: hrefFor('scores') });
  return {
    node: h(
      'div',
      { class: 'screen' },
      screenHeader({ eyebrow: 'GATE 04 · WEIGHTS', title: ['이번 여행에서,', '무엇이 더 중요한가요?'], actions: [modeControl], below: switcher }),
      criteriaPanel(ctx, data),
      h('div', { class: 'two-col' }, h('div', { class: 'two-col__main' }, left), h('div', { class: 'two-col__side' }, right)),
      dashedCard({ eyebrow: 'NEXT GATE · 05', title: '가중치가 정해지면 후보마다 기준별 점수를 매겨요', action: next() }),
    ),
    mobileActions: [next()],
  };
}
