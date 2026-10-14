// ⑥ 결과 분석 — PRD F8-5, F9 / DESIGN.md 7장 04·07
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screenHeader, segmented, button, dashedCard } from '../ui/components/basic.js';
import { rankCards, radarPanel, sensitivityPanel, contributionBars, memberPicks, candOf, tieChip } from '../ui/components/results.js';
import { josa } from '../ui/format.js';
import { hrefFor } from '../router.js';
import { resultsFor, memberTopPicks, sensitivityFor, closestSensitivity, scoreProgress } from '../selectors.js';
import { emptyRedirect } from './placeholder.js';

/** Excel 내보내기 (F13-3): 누를 때 SheetJS를 불러온다 */
function excelButton(ctx) {
  return button({
    variant: 'secondary',
    label: 'Excel 내보내기',
    onClick: async () => {
      try {
        const { exportExcel } = await import('../export/excel.js');
        const name = await exportExcel(ctx.state.getState().data);
        ctx.flash(`${name} 파일을 저장했어요.`);
      } catch {
        ctx.flash('Excel 파일을 만들지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.', 'warn');
      }
    },
  });
}

/** "오키나와가 한 발 앞서 있어요" / "강릉과 경주가 사실상 동점이에요" */
export function resultTitle(data, results) {
  const [a, b] = results.ranking.map((r) => data.candidates[r.index].name);
  if (!a) return '어디로 떠나 볼까요?';
  if (results.nearTie && b) return `${josa(a, '과', '와')} ${josa(b, '이', '가')} 사실상 동점이에요`;
  return `${josa(a, '이', '가')} 한 발 앞서 있어요`;
}

export function renderResults(ctx) {
  const { data } = ctx;
  if (!data) return emptyRedirect('results');
  const ui = ctx.ui();
  const memberId = data.members.some((m) => m.id === ui.resultsView) ? ui.resultsView : null;
  const results = resultsFor(data, memberId);
  const viewName = memberId ? data.members.find((m) => m.id === memberId).name : null;
  const panelLink = () => button({ variant: 'primary', label: 'AI 최종 심사 시작', next: true, href: hrefFor('panel') });

  if (results.ranking.length < 2) {
    const p = scoreProgress(data);
    return {
      node: h(
        'div',
        { class: 'screen' },
        screenHeader({ eyebrow: 'GATE 06 · RESULTS', title: '아직 비교할 결과가 없어요', actions: [excelButton(ctx)] }),
        dashedCard({
          eyebrow: 'NEED SCORES · 점수 필요',
          title: data.candidates.length < 2 ? '후보를 2곳 이상 담아 주세요' : `점수표를 채워 주세요 (${p.filled} / ${p.total})`,
          desc: '모든 기준의 점수가 찬 후보가 2곳 이상이면 순위와 차트가 나와요.',
          action: button({ variant: 'outline', label: data.candidates.length < 2 ? '후보 발굴로' : '점수 매기기로', href: hrefFor(data.candidates.length < 2 ? 'candidates' : 'scores') }),
        }),
      ),
    };
  }

  const view =
    data.members.length > 1 &&
    segmented({
      label: '결과 보기 기준',
      idPrefix: 'res-view',
      options: [{ value: 'group', label: '그룹' }, ...data.members.map((m) => ({ value: m.id, label: m.name }))],
      value: memberId ?? 'group',
      onChange: (v) => ctx.setUi({ resultsView: v === 'group' ? null : v }),
    });

  // 민감도는 그룹 가중치 기준. 기본 선택은 역전 지점이 가장 가까운 기준
  const critIndex = Math.min(ui.sensCriterion ?? closestSensitivity(data)?.criterionIndex ?? 0, data.criteria.length - 1);
  const sens = sensitivityFor(data, critIndex);
  const picks = data.members.length > 1 ? memberTopPicks(data) : null;
  const incomplete = results.incomplete.map((id) => candOf(data, id).name);

  return {
    node: h(
      'div',
      { class: 'screen' },
      screenHeader({
        eyebrow: 'GATE 06 · RESULTS',
        title: resultTitle(data, results),
        actions: [view, excelButton(ctx)].filter(Boolean),
        below: h(
          'div',
          { class: 'chip-row' },
          tieChip(data, results),
          viewName && h('span', { class: 'chip chip--filter' }, `${viewName}의 가중치로 본 결과`),
          incomplete.length > 0 && h('span', { class: 'chip chip--exclude' }, `점수 미완성 · ${incomplete.join(', ')}`),
        ),
      }),
      results.nearTie &&
        h('p', { class: 'notice notice--warn' }, icon('warning', { size: 16 }), '1·2위 점수 차가 3% 이내예요. 계산만으로 가르기 어려우니 민감도와 AI 심사 의견을 함께 보세요.'),
      rankCards(data, results, { label: viewName ? `${viewName}의 1위` : '그룹 1위' }),
      h(
        'div',
        { class: 'two-col two-col--even' },
        h('div', { class: 'two-col__half' }, radarPanel(ctx, data, results)),
        h('div', { class: 'two-col__half' }, sens ? sensitivityPanel(ctx, data, sens, critIndex) : null),
      ),
      contributionBars(data, results),
      picks && memberPicks(data, picks, { title: '탑승객별 1위' }),
      dashedCard({
        eyebrow: 'NEXT GATE · 07',
        title: '세 AI가 서로의 의견을 반박한 뒤, 의장 모델이 최종 결론을 정리합니다',
        desc: '계산 순위를 그대로 따르지 않고, 다르면 이유를 밝혀요.',
        action: panelLink(),
      }),
    ),
    mobileActions: [
      button({ variant: 'secondary', label: '차트', onClick: () => document.getElementById('results-radar')?.scrollIntoView({ behavior: 'smooth' }) }),
      panelLink(),
    ],
  };
}
