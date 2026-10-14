// ⑤ 점수 매기기 — PRD F7-1~4, F10-2·3 / DESIGN.md 9장 "점수 매기기", 11장 상태
import { h } from '../ui/dom.js';
import { screenHeader, button, panel, dashedCard } from '../ui/components/basic.js';
import { textInput } from '../ui/components/form.js';
import { flapCode, placeLabel } from '../ui/components/flapCode.js';
import { modelBadge, MODEL_KEYS, MODEL_META } from '../ui/components/ai.js';
import { icon } from '../ui/icons.js';
import { formatUsd } from '../ui/format.js';
import { hrefFor } from '../router.js';
import { setScore, fillEmptyScores, saveScoreDraft, applyDraft, draftOverwrites, cellStats, scoreDraftKey, SD_WARN } from '../core/scores.js';
import { criterionInfo } from '../core/schema.js';
import { RESEARCH_ITEMS, researchBasis } from '../core/research.js';
import { resultsFor, scoreProgress, groupWeights, consensusSummary } from '../selectors.js';
import { scoreRequest, basisText } from '../ai/prompts.js';
import { ERROR_TEXT } from '../ai/openrouter.js';
import { emptyRedirect } from './placeholder.js';

const usdText = (v) => (v > 0 && v < 0.001 ? '< $ 0.001' : formatUsd(v));
const SOURCE_KO = { avg: 'AI 평균', claude: 'Claude', gpt: 'GPT', gemini: 'Gemini' };
const LEVEL_KO = { high: '높음', mid: '보통', low: '낮음' };

/** 점수 초안 실행 (F7-2). only: 실패한 모델만 다시 부를 때 */
async function runScores(ctx, only) {
  if (!ctx.store.getApiKey()) {
    ctx.flash('설정에서 OpenRouter API 키를 먼저 넣어 주세요.', 'warn');
    return;
  }
  const data = ctx.state.getState().data;
  const project = data.project;
  const models = only ?? ctx.store.loadSettings().models.filter((m) => m.enabled && m.slug).map((m) => m.key);
  const criteria = data.criteria.map((k) => ({ ...k, info: criterionInfo(k, project.tripType) }));
  const basisOf = (c) => {
    const b = basisText(researchBasis(project, c));
    return `${b.when} · ${b.nights}`;
  };
  const { request, map } = scoreRequest(data, { models, today: new Date().toLocaleDateString('sv-SE'), criteria, itemDefs: RESEARCH_ITEMS[project.tripType], basisOf });
  const key = scoreDraftKey(data);
  const out = await ctx.ai.run(request);
  if (!out) return;
  ctx.update((d) => saveScoreDraft(d, out.results, { key, at: new Date().toISOString(), map }));
}

/** 초안 적용 (F7-4). 직접 입력한 점수가 바뀌면 먼저 묻는다 */
function apply(ctx, source, scope = {}) {
  const data = ctx.state.getState().data;
  if (!scope.candidateId) {
    const n = draftOverwrites(data, source);
    if (n > 0 && !window.confirm(`이미 입력한 점수 ${n}칸이 ${SOURCE_KO[source]} 값으로 바뀌어요. 적용할까요?`)) return;
  }
  const r = ctx.update((d) => applyDraft(d, source, scope));
  if (!scope.candidateId) ctx.flash(r.changed ? `${SOURCE_KO[source]} 점수를 ${r.changed}칸에 적용했어요. 다르게 볼 칸은 직접 고쳐 주세요.` : '바뀐 칸이 없어요.');
}

/** 합의 수준 (F10-3) */
function consensusPanel(data) {
  const s = consensusSummary(data);
  if (!s.overall) return null;
  const tile = (label, metric, value, desc) =>
    h(
      'div',
      { class: ['cons-tile', metric.level && `is-${metric.level}`] },
      h('span', { class: 'cons-tile__label' }, label),
      h('span', { class: 'cons-tile__value' }, value),
      h('span', { class: 'cons-tile__desc' }, metric.level ? `${LEVEL_KO[metric.level]} · ${desc}` : desc),
    );
  return panel({
    title: 'AI 합의 수준',
    meta: `종합 ${LEVEL_KO[s.overall]}`,
    children: [
      h(
        'div',
        { class: 'cons-grid' },
        tile('추천 중복도', s.recommend, s.recommend.ratio == null ? '—' : `${Math.round(s.recommend.ratio * 100)}%`, s.recommend.ratio == null ? '추천을 두 모델 이상 받으면 계산해요' : `${s.recommend.total}곳 중 ${s.recommend.shared}곳을 2개 이상 모델이 추천`),
        tile('수치 차이', s.numeric, s.numeric.ratio == null ? '—' : `${s.numeric.diverged} / ${s.numeric.compared}`, s.numeric.ratio == null ? '자료 수집에서 두 모델 이상 수치가 있으면 계산해요' : '모델 간 차이 30% 이상인 수치 항목'),
        tile('점수 의견 차이', s.scores, s.scores.meanSd == null ? '—' : `σ ${s.scores.meanSd.toFixed(1)}`, s.scores.meanSd == null ? '점수 초안을 받으면 계산해요' : `표준편차 평균 · ${SD_WARN} 이상 ${s.scores.highSd}칸`),
      ),
    ],
  });
}

/** 모델별 초안 상태 + 적용 버튼 */
function draftPanel(ctx, data) {
  const draft = data.scoreDraft;
  if (!draft) return null;
  const settings = ctx.store.loadSettings();
  const done = MODEL_KEYS.filter((m) => draft.byModel[m]?.status === 'done' && draft.byModel[m].count > 0);
  const stale = draft.key !== scoreDraftKey(data);
  return panel({
    title: 'AI 점수 초안',
    meta: new Date(draft.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    children: [
      h(
        'div',
        { class: 'run-strip run-strip--compact', 'aria-label': '모델별 점수 초안 상태' },
        MODEL_KEYS.filter((m) => draft.byModel[m]).map((m) => {
          const r = draft.byModel[m];
          const ok = r.status === 'done';
          return h(
            'div',
            { class: 'run-cell' },
            modelBadge(m, { size: 36, withName: false }),
            h(
              'span',
              { class: 'run-cell__text' },
              h('span', { class: 'run-cell__name' }, settings.models.find((x) => x.key === m)?.name ?? MODEL_META[m].name),
              h('span', { class: 'run-cell__sub' }, ok ? `${r.count}칸 채점` : ERROR_TEXT[r.error] ?? '응답을 받지 못했어요'),
              r.raw && h('details', { class: 'run-cell__raw' }, h('summary', null, '응답 원문 보기'), h('pre', null, r.raw)),
            ),
            h(
              'span',
              { class: 'run-cell__end' },
              h('span', { class: ['run-cell__status', ok ? 'is-done' : 'is-failed'] }, ok ? '완료' : '실패'),
              r.usd != null && h('span', { class: 'run-cell__usd' }, usdText(r.usd)),
              !ok && button({ variant: 'secondary', label: '다시 시도', iconName: 'refresh', onClick: () => runScores(ctx, [m]) }),
            ),
          );
        }),
      ),
      stale && h('p', { class: 'notice notice--warn' }, icon('warning', { size: 16 }), '초안을 받은 뒤 후보나 기준이 바뀌었어요. 새로 생긴 칸에는 AI 점수가 없어요.'),
      done.length > 0 &&
        h(
          'div',
          { class: 'apply-bar' },
          h('span', { class: 'apply-bar__label' }, '초안 적용'),
          button({ variant: 'paper', label: 'AI 평균 적용', onClick: () => apply(ctx, 'avg') }),
          done.map((m) => button({ variant: 'secondary', label: `${SOURCE_KO[m]} 적용`, onClick: () => apply(ctx, m) })),
          h('span', { class: 'muted' }, '직접 입력은 칸에 바로 적으세요. 최종 점수는 언제든 고칠 수 있어요.'),
        ),
    ],
  });
}

/** 칸 아래 모델 점수 (F7-3). 누르면 근거 비교 */
function aiChips(ctx, c, k, cell) {
  const st = cellStats(cell);
  if (!st.count) return null;
  const label = `${c.name} ${k.name} AI 점수 ${MODEL_KEYS.filter((m) => st.scores[m] != null).map((m) => `${SOURCE_KO[m]} ${st.scores[m]}`).join(', ')}${st.count >= 2 ? `, 표준편차 ${st.sd.toFixed(1)}` : ''} · 근거 보기`;
  return h(
    'button',
    {
      type: 'button',
      id: `sai-${c.id}-${k.id}`,
      class: 'score-ai',
      'aria-label': label,
      'aria-pressed': String(ctx.ui().scoreCell === `${c.id}|${k.id}`),
      onClick: () => ctx.setUi({ scoreCell: `${c.id}|${k.id}` }),
    },
    MODEL_KEYS.map((m) => h('span', { class: ['score-ai__n', `model--${m}`, st.scores[m] == null && 'is-none'], 'aria-hidden': 'true' }, st.scores[m] ?? '·')),
  );
}

/** 선택한 칸의 모델별 점수·근거 비교 (F10-2) + 이 칸만 적용 */
function cellDetail(ctx, data) {
  const [cid, kid] = (ctx.ui().scoreCell ?? '').split('|');
  const c = data.candidates.find((x) => x.id === cid);
  const k = data.criteria.find((x) => x.id === kid);
  if (!c || !k) return null;
  const cell = data.scores[cid]?.[kid];
  const st = cellStats(cell);
  if (!st.count) return null;
  return panel({
    title: `${c.name} · ${k.name}`,
    meta: st.count >= 2 ? `평균 ${st.mean.toFixed(1)} · σ ${st.sd.toFixed(1)}` : `점수 ${st.mean}`,
    label: '선택한 칸의 AI 근거',
    children: [
      h(
        'ul',
        { class: 'cell-detail' },
        MODEL_KEYS.filter((m) => st.scores[m] != null).map((m) =>
          h(
            'li',
            null,
            modelBadge(m, { size: 30, withName: false }),
            h('span', { class: 'cell-detail__score' }, st.scores[m]),
            h('span', { class: 'cell-detail__why' }, cell.rationale?.[m] ?? '근거 없음'),
            button({ variant: 'secondary', label: `${SOURCE_KO[m]} 점수 적용`, onClick: () => apply(ctx, m, { candidateId: cid, criterionId: kid }) }),
          ),
        ),
      ),
      h(
        'div',
        { class: 'panel__foot' },
        st.count >= 2 && button({ variant: 'paper', label: `평균 ${Math.round(st.mean)}점 적용`, onClick: () => apply(ctx, 'avg', { candidateId: cid, criterionId: kid }) }),
        h('span', { class: 'muted' }, `현재 최종 점수: ${cell.final ?? '없음'}`),
      ),
    ],
  });
}

export function renderScores(ctx) {
  const { data } = ctx;
  if (!data) return emptyRedirect('scores');
  const next = () => button({ variant: 'primary', label: '결과 분석으로', next: true, href: hrefFor('results') });
  const draftButton = () => button({ variant: data.scoreDraft ? 'secondary' : 'primary', label: data.scoreDraft ? 'AI 점수 초안 다시 받기' : 'AI 점수 초안 받기', iconName: 'refresh', onClick: () => runScores(ctx) });
  const header = screenHeader({ eyebrow: 'GATE 05 · SCORES', title: ['후보마다', '기준별 점수를 매겨 주세요'], actions: data.candidates.length ? [draftButton()] : [] });

  if (data.candidates.length === 0) {
    return {
      node: h(
        'div',
        { class: 'screen' },
        header,
        dashedCard({ eyebrow: 'EMPTY · 아직 없어요', title: '먼저 후보를 담아 주세요', action: button({ variant: 'outline', label: '후보 발굴로', href: hrefFor('candidates') }) }),
      ),
    };
  }

  const progress = scoreProgress(data);
  const vector = groupWeights(data).vector;
  const results = resultsFor(data);

  const table = h(
    'table',
    { class: 'score-table' },
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h('th', { scope: 'col' }, '후보'),
        data.criteria.map((k, j) => h('th', { scope: 'col' }, h('span', { class: 'score-table__crit' }, k.name), h('span', { class: 'score-table__w' }, `${Math.round(vector[j] * 100)}%`))),
        h('th', { scope: 'col', class: 'num' }, '종합'),
      ),
    ),
    h(
      'tbody',
      null,
      data.candidates.map((c, i) =>
        h(
          'tr',
          null,
          h(
            'th',
            { scope: 'row' },
            h('span', { class: 'score-table__cand', style: { '--cand': `var(--c${c.color + 1})` } }, flapCode(c, { size: 15 }), !placeLabel(c).ko && h('span', null, c.name)),
          ),
          data.criteria.map((k) => {
            const cell = data.scores[c.id]?.[k.id];
            const v = cell?.final;
            const st = cellStats(cell);
            return h(
              'td',
              { class: ['score-cell', st.count >= 2 && st.sd >= SD_WARN && 'is-warn', ctx.ui().scoreCell === `${c.id}|${k.id}` && 'is-selected'] },
              textInput({
                id: `s-${c.id}-${k.id}`,
                type: 'number',
                inputmode: 'numeric',
                min: 1,
                max: 10,
                step: 1,
                value: v ?? '',
                placeholder: '–',
                ariaLabel: `${c.name} ${k.name} 점수`,
                className: ['input--score', v == null && 'is-empty'].filter(Boolean).join(' '),
                onCommit: (val) => ctx.update((d) => setScore(d, c.id, k.id, val)),
              }),
              aiChips(ctx, c, k, cell),
            );
          }),
          h('td', { class: 'num score-table__total' }, results.totals[i] == null ? '—' : results.totals[i].toFixed(1)),
        ),
      ),
    ),
  );

  return {
    node: h(
      'div',
      { class: 'screen' },
      header,
      consensusPanel(data),
      draftPanel(ctx, data),
      !data.scoreDraft &&
        dashedCard({
          eyebrow: 'AI DRAFT · 점수 초안',
          title: '세 AI에게 근거와 함께 점수 초안을 받아 보세요',
          desc: '자료 수집에서 입력한 확정값을 가장 먼저 근거로 써요. 모델별 점수와 의견 차이를 칸마다 보여 주고, 최종 점수는 직접 확정해요.',
        }),
      panel({
        title: '점수표',
        meta: `입력 ${progress.filled} / ${progress.total}`,
        label: '점수표',
        children: [
          h(
            'p',
            { class: 'muted' },
            '1~10점, 높을수록 좋아요. 비용은 적게 들수록, 거리는 가까울수록 높은 점수를 주세요. 기준 아래 %는 그룹 가중치, 종합은 그룹 기준 점수예요.',
            data.scoreDraft && ` 칸 아래 작은 숫자는 Claude · GPT · Gemini 점수예요. 의견 차이(표준편차)가 ${SD_WARN} 이상이면 칸이 강조돼요.`,
          ),
          h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': '점수표 (가로로 스크롤)' }, table),
          h(
            'div',
            { class: 'panel__foot' },
            button({
              variant: 'secondary',
              label: '빈 칸을 모두 5점으로 채우기',
              disabled: progress.filled === progress.total,
              onClick: () => ctx.update((d) => fillEmptyScores(d, 5)),
            }),
            h('span', { class: 'muted' }, '빠르게 채운 뒤 다르게 볼 칸만 고쳐도 돼요.'),
          ),
        ],
      }),
      cellDetail(ctx, data),
      dashedCard({ eyebrow: 'NEXT GATE · 06', title: '점수가 다 차면 순위와 차트로 결과를 봐요', action: next() }),
    ),
    mobileActions: [next()],
  };
}
