// AI 심사 회의 — DESIGN.md 6.14 DebateRound, 7장 05, 11장(스켈레톤)
import { h } from '../dom.js';
import { codeText, placeLabel } from './flapCode.js';
import { modelBadge, MODEL_META } from './ai.js';
import { skeleton } from './basic.js';
import { markdownBlock } from '../markdown.js';

const MONO = { claude: 'CL', gpt: 'GP', gemini: 'GM' };
const STANCE = { rebut: '반박', supplement: '보완', agree: '동의' };

/** 라운드 구역: 접고 펼 수 있는 타임라인 한 칸 (F11-6) */
export function roundSection({ marker, chair = false, title, sub, children, label }) {
  return h(
    'details',
    { class: 'round', open: true, 'aria-label': label },
    h(
      'summary',
      { class: 'round__head' },
      h('span', { class: ['round__marker', chair && 'round__marker--chair'], 'aria-hidden': 'true' }, marker),
      h('h2', { class: 'round__title' }, title, sub && h('span', { class: 'round__sub' }, sub)),
    ),
    h('div', { class: 'round__body' }, children),
  );
}

/** R1 의견 카드 */
export function opinionCard({ model, name, role, opinion, cand }) {
  const first = cand(opinion.first);
  const second = opinion.second && cand(opinion.second);
  return h(
    'article',
    { class: 'opinion' },
    h('div', { class: 'opinion__head' }, modelBadge(model, { size: 36, name, role })),
    h(
      'div',
      { class: 'opinion__pick' },
      first && codeText(first, { size: 40, className: 'opinion__code' }),
      first && placeLabel(first).ko === false && h('span', { class: 'opinion__name' }, first.name),
      second && h('span', { class: 'opinion__second' }, `2위 ${placeLabel(second).text}`),
    ),
    opinion.reason && h('p', { class: 'opinion__reason' }, opinion.reason),
    opinion.concerns && h('p', { class: 'opinion__concern' }, h('b', null, '우려'), ` · ${opinion.concerns}`),
  );
}

/** 실패·건너뜀 카드 */
export function failedCard({ model, name, text, action }) {
  return h('article', { class: 'opinion opinion--failed' }, h('div', { class: 'opinion__head' }, modelBadge(model, { size: 36, name })), h('p', { class: 'opinion__reason' }, text), action);
}

/** 응답을 기다리는 카드 (11장 스켈레톤) */
export function pendingCard({ model, name }) {
  return h(
    'article',
    { class: 'opinion' },
    h('div', { class: 'opinion__head' }, modelBadge(model, { size: 36, name }), h('span', { class: 'receipt__status is-running' }, '진행 중', h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')))),
    skeleton({ lines: 4, label: `${name} 응답을 기다리는 중` }),
  );
}

/** R2 반박 목록 (비행 경로 점선으로 이어진 항목) */
export function responseList(responses) {
  return h(
    'ol',
    { class: 'rebuttals' },
    responses.map((r) =>
      h(
        'li',
        { class: 'rebuttal' },
        h('span', { class: ['rebuttal__who', `model--${r.from}`] }, `${MONO[r.from]} → ${MONO[r.target]}`, h('span', { class: 'visually-hidden' }, ` (${MODEL_META[r.from].name}의 답, 대상 ${MODEL_META[r.target].name})`)),
        h('p', { class: 'rebuttal__text' }, r.text),
        h('span', { class: ['stance', `stance--${r.stance}`] }, STANCE[r.stance]),
      ),
    ),
  );
}

/**
 * R3 VerdictTicket: 왼쪽 스텁(최종 추천 코드·배지·바코드) + 오른쪽(합의한 점, 남은 쟁점, 체크리스트)
 * checks: 체크 상태 배열, onCheck(index, checked)
 */
export function verdictTicket({ verdict, cand, tripType, panelSize, checks, onCheck, calcLeader }) {
  const c = cand(verdict.chosen);
  const leader = cand(calcLeader);
  const where = tripType === 'overseas' ? c.country : c.region;
  return h(
    'article',
    { class: 'verdict on-paper', 'aria-label': `최종 추천 ${c.name}` },
    h(
      'div',
      { class: 'verdict__stub' },
      h('span', { class: 'bp__label' }, 'FINAL CALL · 최종 추천'),
      codeText(c, { size: 96, className: 'verdict__code' }),
      h('span', { class: 'verdict__name' }, [c.name, where].filter(Boolean).join(' · ')),
      h(
        'div',
        { class: 'verdict__badges' },
        h('span', { class: 'vbadge vbadge--ink' }, `토론 후 합의 ${verdict.consensus}/${panelSize}`),
        verdict.matchesCalculation
          ? h('span', { class: 'vbadge vbadge--ok' }, '계산 결과와 일치')
          : h('span', { class: 'vbadge vbadge--diff' }, `계산 결과와 다름 · 계산 1위 ${leader ? placeLabel(leader).text : '—'}`),
      ),
      h('div', { class: 'barcode', 'aria-hidden': 'true' }),
    ),
    h(
      'div',
      { class: 'verdict__body' },
      !verdict.matchesCalculation &&
        h('div', { class: 'verdict__diff' }, h('h3', null, '계산 결과와 다른 이유'), h('p', null, verdict.reasonIfDifferent ?? '의장이 이유를 밝히지 않았어요. 결정 전에 계산 결과와 함께 다시 살펴보세요.')),
      verdict.markdown && h('div', { class: 'verdict__md' }, markdownBlock(verdict.markdown)),
      verdict.agreements.length > 0 && h('div', { class: 'verdict__list' }, h('h3', null, '합의한 점'), h('ul', null, verdict.agreements.map((t) => h('li', null, t)))),
      verdict.openIssues.length > 0 && h('div', { class: 'verdict__list' }, h('h3', null, '남은 쟁점'), h('ul', null, verdict.openIssues.map((t) => h('li', null, t)))),
      verdict.checklist.length > 0 &&
        h(
          'fieldset',
          { class: 'verdict__checks' },
          h('legend', null, '결정 전에 확인할 것'),
          verdict.checklist.map((t, i) =>
            h('label', { class: 'verdict__check' }, h('input', { type: 'checkbox', class: 'tp-check', id: `vcheck-${i}`, checked: Boolean(checks[i]), onChange: (e) => onCheck(i, e.target.checked) }), t),
          ),
        ),
    ),
  );
}
