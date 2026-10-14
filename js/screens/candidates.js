// ② 후보 발굴 — AI 추천(F2, 시안 02) + 직접 추가·목록·삭제(F3)
import { h } from '../ui/dom.js';
import { screenHeader, button, panel, dashedCard, emptyState, chip } from '../ui/components/basic.js';
import { field, datalist, textInput } from '../ui/components/form.js';
import { flapCode, placeLabel } from '../ui/components/flapCode.js';
import { modelBadge, MODEL_KEYS } from '../ui/components/ai.js';
import { destinationPostcard } from '../ui/components/postcard.js';
import { icon } from '../ui/icons.js';
import { periodLong, durationText, companionText, familyDetailText, budgetText, formatUsd } from '../ui/format.js';
import { hrefFor } from '../router.js';
import { REGIONS, CANDIDATE_RECOMMENDED } from '../core/schema.js';
import { addCandidate, removeCandidate, candidateCountNotice, setExclude, recommendKey, saveRecommendResults, addRecommended } from '../core/project.js';
import { recommendView } from '../selectors.js';
import { recommendRequest } from '../ai/prompts.js';
import { ERROR_TEXT } from '../ai/openrouter.js';
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
  if (c.plannedNights != null) parts.push(`적정 일정 · ${c.plannedNights ? `${c.plannedNights}박 ${c.plannedNights + 1}일` : '당일치기'}`);
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
    p.interests.length > 0 && chip(`관심사 · ${p.interests.join(' · ')}`),
  );
}

const COMPANION_H1 = { solo: '나홀로', couple: '커플', friends: '친구', family: '가족' };

/** AI 추천 실행 (F2). only: 실패한 모델만 다시 부를 때 그 모델 키 */
async function runRecommend(ctx, only) {
  if (!ctx.store.getApiKey()) {
    ctx.flash('설정에서 OpenRouter API 키를 먼저 넣어 주세요.', 'warn');
    return;
  }
  const settings = ctx.store.loadSettings();
  const project = ctx.state.getState().data.project;
  const models = only ?? settings.models.filter((m) => m.enabled && m.slug).map((m) => m.key);
  const key = recommendKey(project);
  const out = await ctx.ai.run(recommendRequest(project, { models, today: new Date().toLocaleDateString('sv-SE') }));
  if (!out) return;
  ctx.update((d) => saveRecommendResults(d, out.results, { key, at: new Date().toISOString(), replace: !only }));
}

function excludeField(ctx, data) {
  return h(
    'div',
    { class: 'rec-exclude' },
    field({
      id: 'rec-exclude',
      label: '추천 제외 조건',
      hint: '선택 · AI 추천에만 쓰여요',
      children: textInput({
        id: 'rec-exclude',
        value: data.project.exclude,
        maxlength: 200,
        hint: true,
        placeholder: data.project.tripType === 'overseas' ? '예: 도쿄·오사카는 가 봤어요, 비행 6시간 넘는 곳 제외' : '예: 제주는 가 봤어요, 편도 4시간 넘는 곳 제외',
        onCommit: (v) => ctx.update((d) => setExclude(d, v)),
      }),
    }),
  );
}

/** 모델 실행 현황 3칸 (시안 02, DESIGN 11장 상태) */
function runStrip(ctx, view) {
  const settings = ctx.store.loadSettings();
  const cells = MODEL_KEYS.filter((m) => settings.models.find((x) => x.key === m)?.enabled || view.models[m]).map((m) => {
    const r = view.models[m];
    const name = settings.models.find((x) => x.key === m)?.name;
    const sources = r ? Math.max(r.citations ?? 0, new Set(r.items.flatMap((i) => i.sources)).size) : 0;
    const status = !r ? ['대기', 'is-waiting'] : r.status === 'done' ? ['완료', 'is-done'] : ['실패', 'is-failed'];
    return h(
      'div',
      { class: 'run-cell' },
      modelBadge(m, { size: 40, name, withName: false }),
      h(
        'span',
        { class: 'run-cell__text' },
        h('span', { class: 'run-cell__name' }, name),
        h('span', { class: 'run-cell__sub' }, !r ? '이번 추천에서 실행하지 않았어요' : r.status === 'done' ? `추천 ${r.items.length}곳 · 출처 ${sources}개` : ERROR_TEXT[r.error] ?? '응답을 받지 못했어요'),
        r?.raw && h('details', { class: 'run-cell__raw' }, h('summary', null, '응답 원문 보기'), h('pre', null, r.raw)),
      ),
      h(
        'span',
        { class: 'run-cell__end' },
        h('span', { class: ['run-cell__status', status[1]] }, status[0]),
        r?.usd != null && h('span', { class: 'run-cell__usd' }, r.usd > 0 && r.usd < 0.001 ? '< $ 0.001' : formatUsd(r.usd)),
        r?.status === 'failed' && button({ variant: 'secondary', label: '다시 시도', iconName: 'refresh', onClick: () => runRecommend(ctx, [m]) }),
      ),
    );
  });
  return h('section', { class: 'run-strip', 'aria-label': '모델별 실행 현황' }, cells);
}

function toggleRecommended(ctx, data, item) {
  const c = item.candidate;
  if (c) {
    const hasWork = data.research[c.id] || data.scores[c.id];
    if (hasWork && !window.confirm(`${c.name} 후보를 빼면 모은 자료와 점수도 함께 지워져요. 뺄까요?`)) return;
    ctx.update((d) => removeCandidate(d, c.id));
    return;
  }
  const r = ctx.update((d) => addRecommended(d, item));
  if (!r.ok) ctx.flash(r.error === 'duplicate' ? '같은 이름의 후보가 이미 있어요.' : '후보에 담지 못했어요.', 'warn');
}

// 새 추천이 도착했을 때만 엽서 등장 애니메이션 (DESIGN 10장). 담기 등으로 다시 그릴 때는 생략
let animatedAt = null;

function recommendSection(ctx, data, view) {
  const fresh = view.at !== animatedAt;
  animatedAt = view.at;
  const p = data.project;
  const periodOpen = p.period.mode === 'undecided';
  const nightsOpen = p.period.nights == null && !p.period.dayTrip;
  const n = data.candidates.length;
  return [
    runStrip(ctx, view),
    view.stale &&
      h(
        'p',
        { class: 'notice notice--warn' },
        icon('warning', { size: 16 }),
        '여행 조건이 바뀌었어요. 아래 추천은 이전 조건 기준이에요. 새 조건으로 받으려면 [다시 추천받기]를 눌러 주세요.',
      ),
    h(
      'div',
      { class: 'section-head' },
      h('h2', { class: 'section-head__title' }, '공통 추천 순', h('span', { class: 'section-head__meta' }, `후보 ${n} / 권장 ${CANDIDATE_RECOMMENDED.min}–${CANDIDATE_RECOMMENDED.max}`)),
      h('span', { class: 'muted' }, '여러 모델이 함께 고른 곳일수록 앞에 놓입니다'),
    ),
    view.items.length
      ? h(
          'section',
          { class: ['postcard-grid', fresh && 'postcard-grid--fresh'], 'aria-label': '추천 여행지' },
          view.items.map((item, i) =>
            destinationPostcard(item, { tripType: p.tripType, color: item.candidate?.color ?? i % 8, index: i, periodOpen, nightsOpen, onToggle: (it) => toggleRecommended(ctx, data, it) }),
          ),
        )
      : emptyState({ title: '받은 추천이 없어요', desc: '모델이 모두 실패했거나 조건에 맞는 곳을 찾지 못했어요. 다시 추천받거나 직접 추가해 보세요.' }),
  ];
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
        ? emptyState({ title: '아직 후보가 없어요', desc: 'AI 추천에서 담거나, 옆의 폼으로 직접 추가해 보세요.' })
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
  const p = data.project;
  const domestic = p.tripType === 'domestic';
  const view = recommendView(data);
  const next = () => button({ variant: 'primary', label: '자료 수집으로', next: true, href: hrefFor('research') });
  const runButton = (variant) => button({ variant, label: view ? '다시 추천받기' : 'AI 추천받기', iconName: 'refresh', onClick: () => runRecommend(ctx) });
  return {
    node: h(
      'div',
      { class: 'screen' },
      screenHeader({
        eyebrow: 'GATE 02 · DISCOVER',
        title: view ? ['세 AI가 고른,', `요즘 떠오르는 ${domestic ? '국내 ' : ''}${COMPANION_H1[p.companion.type]} 여행지`] : ['어디를', `${domestic ? '국내' : '해외'} 후보로 올려 볼까요?`],
        actions: [runButton(view?.stale ? 'primary' : view ? 'secondary' : 'primary')],
        below: [conditionChips(data), excludeField(ctx, data)],
      }),
      view
        ? recommendSection(ctx, data, view)
        : dashedCard({
            eyebrow: 'AI RECOMMEND · 세 AI 추천',
            title: `세 AI에게 요즘 떠오르는 ${domestic ? '국내' : '해외'} 여행지를 추천받아 보세요`,
            desc: '웹 검색으로 최근 인기가 오르는 곳과 그 근거를 찾아요. 실행 전에 예상 비용을 먼저 보여 드려요.',
          }),
      h('div', { class: 'two-col' }, h('div', { class: 'two-col__main' }, listPanel(ctx, data)), h('div', { class: 'two-col__side' }, addForm(ctx, data))),
      dashedCard({ eyebrow: 'NEXT GATE · 03', title: '후보가 모였으면 자료를 모아 비교해요', action: next() }),
    ),
    mobileActions: [next()],
  };
}
