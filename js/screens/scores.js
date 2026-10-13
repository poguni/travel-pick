// ⑤ 점수 매기기 — PRD F7-1 / DESIGN.md 9장 "점수 매기기". AI 점수 초안(F7-2~4)은 Phase 10.
import { h } from '../ui/dom.js';
import { screenHeader, button, panel, dashedCard } from '../ui/components/basic.js';
import { textInput } from '../ui/components/form.js';
import { flapCode, placeLabel } from '../ui/components/flapCode.js';
import { hrefFor } from '../router.js';
import { setScore, fillEmptyScores } from '../core/scores.js';
import { resultsFor, scoreProgress, groupWeights } from '../selectors.js';
import { emptyRedirect } from './placeholder.js';

export function renderScores(ctx) {
  const { data } = ctx;
  if (!data) return emptyRedirect('scores');
  const next = () => button({ variant: 'primary', label: '결과 분석으로', next: true, href: hrefFor('results') });
  const header = screenHeader({ eyebrow: 'GATE 05 · SCORES', title: ['후보마다', '기준별 점수를 매겨 주세요'] });

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
            const v = data.scores[c.id]?.[k.id]?.final;
            return h(
              'td',
              null,
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
      panel({
        title: '점수표',
        meta: `입력 ${progress.filled} / ${progress.total}`,
        label: '점수표',
        children: [
          h('p', { class: 'muted' }, '1~10점, 높을수록 좋아요. 비용은 적게 들수록, 거리는 가까울수록 높은 점수를 주세요. 기준 아래 %는 그룹 가중치, 종합은 그룹 기준 점수예요.'),
          h('div', { class: 'table-wrap' }, table),
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
      dashedCard({
        eyebrow: 'AI DRAFT · PHASE 10',
        title: '세 AI가 근거와 함께 점수 초안을 매기는 기능은 Phase 10에서 연결합니다',
        desc: '모델별 점수와 의견 차이(표준편차)를 칸마다 보여 주고, 최종 점수는 항상 직접 확정해요.',
      }),
      dashedCard({ eyebrow: 'NEXT GATE · 06', title: '점수가 다 차면 순위와 차트로 결과를 봐요', action: next() }),
    ),
    mobileActions: [next()],
  };
}
