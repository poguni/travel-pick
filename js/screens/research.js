// ③ 자료 수집 — PRD F4, F10-1·4, 5.6. DESIGN.md 9장 자료 수집, 11장 상태
import { h } from '../ui/dom.js';
import { screenHeader, button, dashedCard, emptyState, chip } from '../ui/components/basic.js';
import { textInput } from '../ui/components/form.js';
import { flapCode } from '../ui/components/flapCode.js';
import { modelBadge, consensusDots, MODEL_KEYS } from '../ui/components/ai.js';
import { icon } from '../ui/icons.js';
import { formatUsd, josa } from '../ui/format.js';
import { hrefFor } from '../router.js';
import { RESEARCH_ITEMS, SAFETY_NOTICE, researchBasis, researchKey, saveResearchResults, setConfirmed, setResearchNote } from '../core/research.js';
import { researchProgress, researchCards } from '../selectors.js';
import { researchRequest, basisText } from '../ai/prompts.js';
import { ERROR_TEXT } from '../ai/openrouter.js';
import { emptyRedirect } from './placeholder.js';

const usdText = (v) => (v > 0 && v < 0.001 ? '< $ 0.001' : formatUsd(v));
const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};
const fmtNum = (v, unit) => (unit === '원' ? (v >= 10000 ? `${Math.round(v / 1000) / 10}만` : v.toLocaleString('ko-KR')) : String(Math.round(v * 10) / 10));

/** 지금 쓸 수 있는 모델 키 (설정에서 켜 두고 슬러그가 있는 것) */
const usableModels = (ctx) =>
  ctx.store
    .loadSettings()
    .models.filter((m) => m.enabled && m.slug)
    .map((m) => m.key);

/**
 * 조사 실행. spec: [{ candidateId, models }]. 비용 확인 창 → 실행 → 결과 기록 (F10-1·4)
 */
async function runResearch(ctx, spec) {
  if (!ctx.store.getApiKey()) {
    ctx.flash('설정에서 OpenRouter API 키를 먼저 넣어 주세요.', 'warn');
    return;
  }
  const data = ctx.state.getState().data;
  const project = data.project;
  const targets = spec
    .map(({ candidateId, models }) => {
      const candidate = data.candidates.find((c) => c.id === candidateId);
      return candidate && { candidate, models, basis: researchBasis(project, candidate) };
    })
    .filter((t) => t && t.models.length);
  if (!targets.length) return;
  const keys = Object.fromEntries(targets.map((t) => [t.candidate.id, researchKey(project, t.candidate)]));
  const items = RESEARCH_ITEMS[project.tripType];
  const out = await ctx.ai.run(researchRequest(project, targets, { items, today: new Date().toLocaleDateString('sv-SE') }));
  if (!out) return;
  ctx.update((d) => saveResearchResults(d, out.results, { keys, at: new Date().toISOString() }));
}

const STATUS_TEXT = { done: ['완료', 'is-done'], stale: ['조건 바뀜', 'is-waiting'], failed: ['실패', 'is-failed'], none: ['조사 전', 'is-waiting'] };

/** 후보 탭 (FlapCode + 완료 모델 점). 좌우 화살표로 이동 */
function tabs(ctx, progress, selectedId) {
  const list = progress.perCandidate;
  const select = (id, focus) => {
    ctx.setUi({ researchTab: id });
    if (focus) requestAnimationFrame(() => document.getElementById(`rtab-${id}`)?.focus());
  };
  return h(
    'div',
    { class: 'rtabs', role: 'tablist', 'aria-label': '후보' },
    list.map((p, i) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          id: `rtab-${p.candidate.id}`,
          class: 'rtab',
          style: { '--cand': `var(--c${p.candidate.color + 1})` },
          'aria-selected': String(p.candidate.id === selectedId),
          'aria-controls': 'rpanel',
          tabindex: p.candidate.id === selectedId ? '0' : '-1',
          onClick: () => select(p.candidate.id),
          onKeydown: (e) => {
            const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
            if (!step) return;
            e.preventDefault();
            select(list[(i + step + list.length) % list.length].candidate.id, true);
          },
        },
        flapCode(p.candidate, { size: 18 }),
        h('span', { class: 'rtab__name' }, p.candidate.name),
        consensusDots(
          MODEL_KEYS.filter((m) => p.status[m] === 'done'),
          { showCount: false },
        ),
        p.failed > 0 && h('span', { class: 'rtab__fail', 'aria-label': `실패 ${p.failed}` }, '!'),
      ),
    ),
  );
}

/** 모델별 상태 3칸 + 후보·모델 단위 실행 (F4-7, 11장) */
function modelStrip(ctx, candidate, cards, models) {
  return h(
    'div',
    { class: 'run-strip run-strip--compact', 'aria-label': '모델별 조사 상태' },
    MODEL_KEYS.filter((m) => models.includes(m) || cards.entries[m]).map((m) => {
      const st = cards.status[m];
      const e = cards.entries[m];
      const [label, cls] = STATUS_TEXT[st];
      const sub =
        st === 'failed'
          ? ERROR_TEXT[e.error] ?? '응답을 받지 못했어요'
          : st === 'done'
            ? `항목 ${Object.keys(e.items).length}개 · 출처 ${Math.max(e.citations, new Set(Object.values(e.items).flatMap((i) => i.sources)).size)}개`
            : st === 'stale'
              ? '조사 기준이 바뀌었어요'
              : '아직 조사하지 않았어요';
      const canRun = models.includes(m);
      return h(
        'div',
        { class: 'run-cell' },
        modelBadge(m, { size: 36, withName: false }),
        h(
          'span',
          { class: 'run-cell__text' },
          h('span', { class: 'run-cell__name' }, ctx.store.loadSettings().models.find((x) => x.key === m)?.name),
          h('span', { class: 'run-cell__sub' }, sub),
          e?.raw && h('details', { class: 'run-cell__raw' }, h('summary', null, '응답 원문 보기'), h('pre', null, e.raw)),
        ),
        h(
          'span',
          { class: 'run-cell__end' },
          h('span', { class: ['run-cell__status', cls] }, label),
          e?.usd != null && h('span', { class: 'run-cell__usd' }, usdText(e.usd)),
          canRun &&
            (st === 'done'
              ? button({ variant: 'icon', label: `${josa(candidate.name, '을', '를')} 이 모델로 다시 조사`, iconName: 'refresh', onClick: () => runResearch(ctx, [{ candidateId: candidate.id, models: [m] }]) })
              : button({ variant: 'secondary', label: st === 'failed' ? '다시 시도' : '조사', iconName: 'refresh', onClick: () => runResearch(ctx, [{ candidateId: candidate.id, models: [m] }]) })),
        ),
      );
    }),
  );
}

/** 항목 카드 (DESIGN 9장): 항목명 + 확정값(종이) + 모델별 값 + 출처 + 확인 필요 + 메모 */
function itemCard(ctx, candidate, item, models) {
  const { def } = item;
  const cid = candidate.id;
  const shown = MODEL_KEYS.filter((m) => models.includes(m) || item.models[m]);
  const first = Object.values(item.models)[0];
  const warn = item.spread?.warn;
  return h(
    'article',
    { class: ['rcard', warn && 'is-warn'], 'aria-labelledby': `rc-${cid}-${def.id}-label` },
    h(
      'div',
      { class: 'rcard__head' },
      h('span', { class: 'rcard__label', id: `rc-${cid}-${def.id}-label` }, `${def.mono} · ${def.label}`),
      item.needsCheck && chip('확인 필요', { variant: 'paper-warn' }),
    ),
    h(
      'label',
      { class: 'rcard__confirm on-paper' },
      h('span', { class: 'rcard__confirm-label' }, '확정값'),
      textInput({
        id: `rc-${cid}-${def.id}`,
        value: item.confirmed,
        maxlength: 200,
        className: 'input--confirm',
        placeholder: first ? `예: ${first.value}` : '직접 확인한 값을 적어 주세요',
        onCommit: (v) => ctx.update((d) => setConfirmed(d, cid, def.id, v)),
      }),
    ),
    warn &&
      h(
        'p',
        { class: 'rcard__warn' },
        icon('warning', { size: 14 }),
        `모델 간 차이 ${Math.round(item.spread.spread * 100)}% · 직접 확인한 값을 확정값에 적어 주세요`,
      ),
    h(
      'ul',
      { class: 'rcard__models' },
      shown.map((m) => {
        const it = item.models[m];
        const mid = item.spread?.mids[m];
        return h(
          'li',
          { class: ['rcard__model', item.stale.has(m) && 'is-stale'] },
          modelBadge(m, { size: 24, withName: false }),
          h('span', { class: ['rcard__value', !it && 'is-empty'] }, it ? it.value : '—'),
          h(
            'span',
            { class: 'rcard__meta' },
            item.stale.has(m) ? '이전 조건' : warn && mid != null ? `≈ ${fmtNum(mid, def.numeric)}${def.numeric === '원' ? '원' : '시간'}` : it?.asOf ?? '',
          ),
        );
      }),
    ),
    (item.sources.length > 0 || Object.values(item.models).some((i) => i.summary)) &&
      h(
        'details',
        { class: 'rcard__more' },
        h('summary', null, `설명·출처${item.sources.length ? ` ${item.sources.length}` : ''}`),
        h(
          'ul',
          { class: 'rcard__summaries' },
          MODEL_KEYS.filter((m) => item.models[m]?.summary).map((m) => h('li', null, modelBadge(m, { size: 20, withName: false }), h('span', null, item.models[m].summary))),
        ),
        item.sources.length > 0 && h('ul', { class: 'rcard__sources' }, item.sources.map((u) => h('li', null, h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, host(u))))),
      ),
    textInput({
      id: `rn-${cid}-${def.id}`,
      value: item.note,
      maxlength: 500,
      className: 'input--memo',
      ariaLabel: `${def.label} 메모`,
      placeholder: '메모 (직접 찾은 정보, 가격 메모 등)',
      onCommit: (v) => ctx.update((d) => setResearchNote(d, cid, def.id, v)),
    }),
  );
}

function candidatePanel(ctx, data, candidate, models) {
  const cards = researchCards(data, candidate);
  const b = basisText(researchBasis(data.project, candidate));
  const todo = models.filter((m) => cards.status[m] !== 'done');
  const anyDone = models.some((m) => cards.status[m] === 'done');
  const where = data.project.tripType === 'overseas' ? candidate.country : candidate.region;
  return h(
    'section',
    { class: 'rpanel', id: 'rpanel', role: 'tabpanel', 'aria-labelledby': `rtab-${candidate.id}` },
    h(
      'div',
      { class: 'rpanel__head' },
      h(
        'div',
        { class: 'rpanel__title' },
        h('h2', null, candidate.name, where && h('span', { class: 'rpanel__where' }, where)),
        h('span', { class: 'muted' }, `조사 기준 · ${b.when} · ${b.nights}`),
      ),
      h(
        'div',
        { class: 'rpanel__actions' },
        todo.length > 0 && button({ variant: 'paper', label: `이 후보 조사 · ${todo.length}회`, iconName: 'refresh', onClick: () => runResearch(ctx, [{ candidateId: candidate.id, models: todo }]) }),
        anyDone && button({ variant: 'secondary', label: '새로 조사', iconName: 'refresh', onClick: () => runResearch(ctx, [{ candidateId: candidate.id, models }]) }),
      ),
    ),
    modelStrip(ctx, candidate, cards, models),
    h('div', { class: 'rcard-grid' }, cards.items.map((item) => itemCard(ctx, candidate, item, models))),
  );
}

export function renderResearch(ctx) {
  const { data } = ctx;
  if (!data) return emptyRedirect('research');
  const next = () => button({ variant: 'primary', label: '기준·가중치로', next: true, href: hrefFor('weights') });
  const header = (actions = [], below) => screenHeader({ eyebrow: 'GATE 03 · RESEARCH', title: ['후보마다 자료를 모아', '나란히 비교해요'], actions, below });

  if (!data.candidates.length) {
    return {
      node: h(
        'div',
        { class: 'screen' },
        header(),
        emptyState({ title: '조사할 후보가 없어요', desc: '후보 발굴에서 AI 추천을 담거나 직접 추가해 주세요.', action: button({ variant: 'outline', label: '후보 발굴로', href: hrefFor('candidates') }) }),
      ),
    };
  }

  const models = usableModels(ctx);
  const progress = researchProgress(data, models);
  const ui = ctx.ui();
  const selected = data.candidates.find((c) => c.id === ui.researchTab) ?? data.candidates[0];
  const n = data.candidates.length;

  const runAll = progress.pendingCalls
    ? button({ variant: 'primary', label: `자료 모으기 · ${progress.pendingCalls}회`, iconName: 'refresh', onClick: () => runResearch(ctx, progress.pending) })
    : button({ variant: 'secondary', label: '모두 조사했어요', iconName: 'check', disabled: true });

  return {
    node: h(
      'div',
      { class: 'screen' },
      header(
        [runAll],
        h(
          'div',
          { class: 'chip-row' },
          chip(`조사한 후보 ${progress.doneCandidates} / ${n}곳`),
          chip(data.project.tripType === 'domestic' ? `국내 조사 항목 ${RESEARCH_ITEMS.domestic.length}개` : `해외 조사 항목 ${RESEARCH_ITEMS.overseas.length}개`),
          progress.pendingCalls > 0 && chip('같은 후보·시기로 이미 조사한 모델은 다시 호출하지 않아요', { variant: 'exclude' }),
        ),
      ),
      progress.failedCalls > 0 &&
        h(
          'div',
          { class: 'notice notice--warn notice--action' },
          icon('warning', { size: 16 }),
          h('span', null, `조사 ${progress.failedCalls}개가 실패했어요. 다른 결과는 그대로 쓸 수 있어요.`),
          button({ variant: 'secondary', label: `실패한 ${progress.failedCalls}개 다시 시도`, iconName: 'refresh', onClick: () => runResearch(ctx, progress.failed) }),
        ),
      h('p', { class: 'notice notice--ok' }, SAFETY_NOTICE[data.project.tripType]),
      tabs(ctx, progress, selected.id),
      candidatePanel(ctx, data, selected, models),
      dashedCard({ eyebrow: 'NEXT GATE · 04', title: '자료를 봤으면 무엇이 더 중요한지 정해요', action: next() }),
    ),
    mobileActions: [next()],
  };
}
