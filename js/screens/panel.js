// ⑦ AI 최종 심사 — PRD F11, 5.4, 10장(개인정보). DESIGN.md 6.14, 7장 05, 11장
import { h } from '../ui/dom.js';
import { screenHeader, segmented, button, dashedCard, panel as panelCard } from '../ui/components/basic.js';
import { MODEL_META } from '../ui/components/ai.js';
import { roundSection, opinionCard, failedCard, pendingCard, responseList, verdictTicket } from '../ui/components/debate.js';
import { icon } from '../ui/icons.js';
import { formatUsd, josaRo } from '../ui/format.js';
import { hrefFor } from '../router.js';
import { RESEARCH_ITEMS } from '../core/research.js';
import { OUT_DEFAULTS } from '../core/cost.js';
import { DEPTHS, panelKey, memberLabel, sanitizeOpinion, sanitizeResponses, sanitizeVerdict, saveRound, startPanel, toggleCheck, choose, panelView } from '../core/panel.js';
import { resultsFor, groupWeights, memberTopPicks } from '../selectors.js';
import { panelContext, r1Messages, r2Messages, r3Messages, opinionSchema, responsesSchema, verdictSchema } from '../ai/prompts.js';
import { planRun } from '../ai/runner.js';
import { ERROR_TEXT } from '../ai/openrouter.js';
import { emptyRedirect } from './placeholder.js';

const today = () => new Date().toLocaleDateString('sv-SE');

/** 쓸 수 있는 모델과 의장 (의장이 꺼져 있으면 첫 모델) */
function lineup(ctx) {
  const settings = ctx.store.loadSettings();
  const models = settings.models.filter((m) => m.enabled && m.slug).map((m) => m.key);
  const chair = models.includes(settings.chairModel) ? settings.chairModel : models[0];
  const names = Object.fromEntries(settings.models.map((m) => [m.key, m.name]));
  return { settings, models, chair, names };
}

/**
 * 심사 계획: 공통 맥락 + 라운드별 호출(예상 비용용). 뒤 라운드는 앞 응답 분량을 extraInTokens로 더한다.
 */
function buildPlan(data, { depth, anonymize, models, chair }) {
  const results = resultsFor(data);
  const picks = memberTopPicks(data);
  const label = memberLabel(data.members, anonymize);
  const context = panelContext(data, {
    criteria: data.criteria,
    vector: groupWeights(data).vector,
    totals: results.totals,
    ranking: results.ranking,
    nearTie: results.nearTie,
    picks: picks.members.map((p) => ({ label: label(data.members.find((m) => m.id === p.id)), top: p.top })),
    itemDefs: RESEARCH_ITEMS[data.project.tripType],
  });
  const rounds = DEPTHS[depth].rounds;
  const calcLeaderKey = context.keyOf[results.ranking[0].id];
  const per = OUT_DEFAULTS.panel;
  const stages = rounds.map((round) => {
    if (round === 'r1') return models.map((model) => ({ model, messages: r1Messages(context, { today: today() }), schema: opinionSchema(), feature: 'panel', meta: { round } }));
    if (round === 'r2') return models.map((model) => ({ model, messages: r2Messages(context, model, [], { today: today() }), schema: responsesSchema(), feature: 'panel', extraInTokens: per * (models.length - 1), meta: { round } }));
    return [{ model: chair, messages: r3Messages(context, [], [], { today: today(), calcLeaderKey }), schema: verdictSchema(), feature: 'chair', extraInTokens: per * models.length * (rounds.includes('r2') ? 2 : 1), meta: { round } }];
  });
  return { context, rounds, stages, calcLeaderKey, results };
}

/** 깊이별 예상 (F11-7): { calls, usd } */
function estimate(ctx, data, depth, anonymize) {
  const { settings, models, chair } = lineup(ctx);
  if (!models.length) return null;
  const plan = buildPlan(data, { depth, anonymize, models, chair });
  const p = planRun({ feature: 'panel', calls: plan.stages.flat() }, settings, data.aiRuns);
  return { calls: p.summary.total.calls, usd: p.summary.total.usd };
}

const usdShort = (v) => (v == null ? '$ —' : v < 0.01 ? `$ ${v.toFixed(3)}` : `$ ${v.toFixed(2)}`);

async function runPanel(ctx, { depth, anonymize }) {
  if (!ctx.store.getApiKey()) {
    ctx.flash('설정에서 OpenRouter API 키를 먼저 넣어 주세요.', 'warn');
    return;
  }
  const data = ctx.state.getState().data;
  const { models, chair } = lineup(ctx);
  const plan = buildPlan(data, { depth, anonymize, models, chair });
  const { context, rounds, calcLeaderKey, results } = plan;
  const key = panelKey(data, results.totals);
  const panelModels = [...models];
  const opinionsOf = (stageResults) =>
    stageResults.filter((r) => r.ok).map((r) => ({ model: r.model, value: sanitizeOpinion(r.value, context.candMap) })).filter((o) => o.value).map((o) => ({ model: o.model, ...o.value }));
  const clean = {
    r1: (v) => sanitizeOpinion(v, context.candMap),
    r2: (v, model) => sanitizeResponses(v, model, panelModels),
    r3: (v) => sanitizeVerdict(v, context.candMap, panelModels.length),
  };
  const responsesOf = (stageResults) =>
    stageResults.filter((r) => r.ok).flatMap((r) => sanitizeResponses(r.value, r.model, panelModels).map((x) => ({ from: r.model, ...x })));

  try {
    const out = await ctx.ai.runStaged({
      feature: 'panel',
      label: `AI 최종 심사 · ${DEPTHS[depth].label}`,
      description: depth === 'fast' ? '세 모델의 독립 의견을 받은 뒤 의장이 종합해요.' : '독립 의견 → 상호 비판 → 의장 종합, 세 라운드를 차례로 진행해요.',
      stages: plan.stages,
      onStart: () => {
        ctx.setUi({ panelRunning: true });
        ctx.update((d) => startPanel(d, { depth, anonymized: anonymize, chair, key, at: new Date().toISOString() }));
      },
      prepare: (stage, planned, prior) => {
        const round = rounds[stage];
        if (round === 'r1') return planned;
        const opinions = opinionsOf(prior[0]);
        if (round === 'r2') return planned.filter((c) => opinions.some((o) => o.model !== c.model)).map((c) => ({ ...c, messages: r2Messages(context, c.model, opinions, { today: today() }) }));
        if (!opinions.length) return [];
        const responses = rounds.includes('r2') ? responsesOf(prior[1]) : [];
        return planned.map((c) => ({ ...c, messages: r3Messages(context, opinions, responses, { today: today(), calcLeaderKey }) }));
      },
      onStage: (stage, stageResults) => {
        const round = rounds[stage];
        ctx.update((d) => saveRound(d, round, stageResults, clean[round], { at: new Date().toISOString() }));
      },
    });
    if (out && !ctx.state.getState().data.panel?.rounds.r3?.[chair]) ctx.flash('의장 종합이 없어요. 의장 모델을 빼고 실행했거나 응답을 받지 못했어요. 다시 심사해 주세요.', 'warn');
  } finally {
    ctx.setUi({ panelRunning: false });
  }
}

function decide(ctx, candidateId) {
  const r = ctx.update((d) => choose(d, candidateId));
  if (r.ok) ctx.navigate('export');
}

/** 라운드 카드들: 결과·실패·진행 중 */
function roundCards(ctx, data, round, view, { names, running }) {
  const slot = data.panel.rounds[round] ?? {};
  const cand = (id) => data.candidates.find((c) => c.id === id);
  const models = round === 'r3' ? [data.panel.chair] : Object.keys(MODEL_META).filter((m) => slot[m] || (running && lineup(ctx).models.includes(m)));
  return models.map((m) => {
    const r = slot[m];
    if (!r) return running ? pendingCard({ model: m, name: names[m] }) : null;
    if (r.status !== 'done') return failedCard({ model: m, name: names[m], text: ERROR_TEXT[r.error] ?? '응답을 받지 못했어요.' });
    if (round === 'r1') {
      const opinion = view.opinions.find((o) => o.model === m);
      const role = m === data.panel.chair ? 'chair' : view.verdict && opinion.first !== view.verdict.chosen ? 'dissent' : undefined;
      return opinionCard({ model: m, name: names[m], role, opinion, cand });
    }
    return null;
  });
}

export function renderPanel(ctx) {
  const { data } = ctx;
  if (!data) return emptyRedirect('panel');
  const header = (actions = [], below) => screenHeader({ eyebrow: 'GATE 07 · THE PANEL', title: '세 AI의 심사 회의', actions, below });
  const results = resultsFor(data);

  if (results.ranking.length < 2) {
    return {
      node: h(
        'div',
        { class: 'screen' },
        header(),
        dashedCard({
          eyebrow: 'NEED RESULTS · 결과 필요',
          title: '점수가 다 찬 후보가 2곳 이상이어야 심사할 수 있어요',
          desc: '심사위원은 계산 결과와 점수표를 함께 보고 의견을 내요.',
          action: button({ variant: 'outline', label: '점수 매기기로', href: hrefFor('scores') }),
        }),
      ),
    };
  }

  const ui = ctx.ui();
  const p = data.panel;
  const depth = ui.panelDepth ?? p?.depth ?? 'fast';
  const anonymize = ui.panelAnon ?? p?.anonymized ?? true;
  const running = Boolean(ui.panelRunning);
  const { names, models } = lineup(ctx);
  const est = { fast: estimate(ctx, data, 'fast', anonymize), thorough: estimate(ctx, data, 'thorough', anonymize) };
  const calcLeader = results.ranking[0].id;
  const view = panelView(p, calcLeader);
  const actual = p ? Object.values(p.rounds).flatMap((r) => Object.values(r)).reduce((s, r) => s + (r.usd ?? 0), 0) : null;
  const stale = p && p.key !== panelKey(data, results.totals);
  const cand = (id) => data.candidates.find((c) => c.id === id);

  const controls = h(
    'div',
    { class: 'panel-controls' },
    segmented({
      label: '토론 깊이',
      idPrefix: 'panel-depth',
      value: depth,
      disabled: running,
      options: Object.entries(DEPTHS).map(([value, d]) => ({ value, label: `${d.label} · ${est[value]?.calls ?? '–'}회 · ${usdShort(est[value]?.usd)}` })),
      onChange: (v) => ctx.setUi({ panelDepth: v }),
    }),
    h(
      'label',
      { class: 'check-inline' },
      h('input', { type: 'checkbox', class: 'tp-check', id: 'panel-anon', checked: anonymize, disabled: running, onChange: (e) => ctx.setUi({ panelAnon: e.target.checked }) }),
      '동행인 이름 대신 "구성원 N"으로 보내기',
    ),
    actual != null && h('span', { class: 'panel-controls__cost' }, `지난 심사 실제 비용 ${formatUsd(actual)}`),
  );

  const runBtn = button({ variant: p ? 'secondary' : 'primary', label: p ? '다시 심사' : '심사 시작', iconName: 'refresh', disabled: running || !models.length, onClick: () => runPanel(ctx, { depth, anonymize }) });

  const nodes = [
    header([runBtn], [h('p', { class: 'screen-lead' }, '따로 의견을 내고, 서로 반박한 뒤, 의장이 결론을 정리합니다. 계산 순위를 그대로 따르지 않고 다르면 이유를 밝혀요.'), controls]),
  ];

  if (stale) nodes.push(h('p', { class: 'notice notice--warn' }, icon('warning', { size: 16 }), '심사한 뒤 점수나 가중치가 바뀌었어요. 지금 결과로 다시 심사하는 걸 권해요.'));

  if (!p) {
    nodes.push(
      dashedCard({
        eyebrow: 'THE PANEL · 심사 전',
        title: `계산 1위는 ${cand(calcLeader).name}이에요. 세 AI가 이 결과를 다시 따져 봐요`,
        desc: '여행 조건, 조사 자료 요약, 확정 점수표, 그룹 가중치, 계산 결과, 동행인별 1위를 보내요. 실행 전에 예상 비용을 먼저 보여 드려요.',
      }),
    );
  } else {
    const rounds = DEPTHS[p.depth].rounds;
    nodes.push(
      roundSection({
        marker: 'R1',
        title: '독립 의견',
        sub: '서로의 답을 보지 않고 판단',
        label: '1라운드 독립 의견',
        children: h('div', { class: 'opinion-grid' }, roundCards(ctx, data, 'r1', view, { names, running })),
      }),
    );
    if (rounds.includes('r2')) {
      const failed = Object.entries(p.rounds.r2 ?? {}).filter(([, r]) => r.status !== 'done');
      const waiting = running && !p.rounds.r2;
      nodes.push(
        roundSection({
          marker: 'R2',
          title: '상호 비판',
          sub: '다른 두 모델의 의견을 읽고 답함',
          label: '2라운드 상호 비판',
          children: [
            view.responses.length > 0 && responseList(view.responses),
            waiting && pendingCard({ model: 'claude', name: '상호 비판' }),
            failed.length > 0 && h('p', { class: 'muted' }, failed.map(([m, r]) => `${names[m]}: ${ERROR_TEXT[r.error] ?? '응답 없음'}`).join(' · ')),
            !waiting && !view.responses.length && !failed.length && h('p', { class: 'muted' }, '상호 비판 결과가 없어요.'),
          ],
        }),
      );
    }
    nodes.push(
      roundSection({
        marker: 'R3',
        chair: true,
        title: '의장 종합',
        sub: names[p.chair],
        label: '3라운드 의장 종합',
        children: view.verdict
          ? verdictTicket({
              verdict: view.verdict,
              cand,
              tripType: data.project.tripType,
              panelSize: Object.keys(p.rounds.r1 ?? {}).length || 3,
              checks: p.checks,
              calcLeader,
              onCheck: (i, checked) => ctx.update((d) => toggleCheck(d, i, checked)),
            })
          : roundCards(ctx, data, 'r3', view, { names, running }),
      }),
    );
  }

  // 결정 (→ 리포트)
  const suggested = view?.verdict?.chosen ?? calcLeader;
  const chosen = data.decision.chosen && cand(data.decision.chosen);
  nodes.push(
    panelCard({
      title: '결정',
      meta: chosen ? `현재 결정 · ${chosen.name}` : '아직 결정 전',
      children: [
        ui.panelPickOther &&
          h(
            'div',
            { class: 'pick-other' },
            segmented({
              label: '결정할 후보',
              idPrefix: 'pick',
              value: ui.panelPick ?? suggested,
              options: results.ranking.map((r) => ({ value: r.id, label: `${r.rank}위 ${cand(r.id).name}` })),
              onChange: (v) => ctx.setUi({ panelPick: v }),
            }),
          ),
        h(
          'div',
          { class: 'decide-actions' },
          ui.panelPickOther
            ? [
                button({ variant: 'secondary', label: '취소', onClick: () => ctx.setUi({ panelPickOther: false, panelPick: null }) }),
                button({ variant: 'primary', label: `${josaRo(cand(ui.panelPick ?? suggested).name)} 확정하고 리포트 만들기`, next: true, onClick: () => decide(ctx, ui.panelPick ?? suggested) }),
              ]
            : [
                button({ variant: 'secondary', label: '다른 후보로 결정', onClick: () => ctx.setUi({ panelPickOther: true, panelPick: suggested }) }),
                button({ variant: 'primary', label: `${josaRo(cand(suggested).name)} 확정하고 리포트 만들기`, next: true, onClick: () => decide(ctx, suggested) }),
              ],
        ),
      ],
    }),
  );

  return { node: h('div', { class: 'screen' }, nodes), mobileActions: [] };
}
