// 실행 전 비용 확인 창 → 진행 상황 → 결과 — DESIGN.md 6.15, 7장 06, 11장 상태 표현 / PRD F12-1~3, F10-4
import { h, mount } from '../dom.js';
import { icon } from '../icons.js';
import { modelBadge, MODEL_META } from './ai.js';
import { summarizeEstimates } from '../../core/cost.js';
import { describeError } from '../../ai/openrouter.js';

const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const usd = (v) => (v == null ? '단가 확인 필요' : v > 0 && v < 0.0001 ? '< $0.0001' : `$ ${v < 0.01 ? v.toFixed(4) : v.toFixed(2)}`);
const krw = (v) => (v == null ? '' : `약 ${Math.round(v).toLocaleString('ko-KR')}원`);

/** 지난 실행 대비 문구: "지난 실행: 예상보다 실제가 6% 적었어요" */
function deltaText(delta) {
  if (delta == null) return '처음 실행하는 작업이라 기본 출력 길이로 추정했어요';
  const p = Math.round(Math.abs(delta) * 100);
  if (p < 1) return '지난 실행: 예상과 실제가 거의 같았어요';
  return `지난 실행: 예상보다 실제가 ${p}% ${delta < 0 ? '적었어요' : '많았어요'}`;
}

/**
 * openReceipt(plan, { usdKrw, delta }) → { confirm(): Promise<string[]|null>, progress(index, status, result), finish(out): Promise<'close'|'retry'> }
 */
export function openReceipt(plan, { usdKrw, delta }) {
  const dialog = h('dialog', { class: 'receipt-dialog', 'aria-labelledby': 'receipt-title' });
  document.body.append(dialog);
  const models = [...new Set(plan.calls.map((c) => c.model))];
  const enabled = new Set(models);
  let resolveConfirm;
  let resolveFinish;
  let phase = 'confirm';

  const close = (value) => {
    if (phase === 'confirm') resolveConfirm?.(value);
    if (phase === 'done') resolveFinish?.(value);
    if (phase === 'running') return; // 실행 중에는 닫지 않는다
    dialog.close();
    dialog.remove();
  };
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close(phase === 'confirm' ? null : 'close');
  });

  const head = (label, title, sub) =>
    h(
      'div',
      { class: 'receipt__head' },
      h('div', null, h('span', { class: 'receipt__label' }, label), h('h2', { class: 'receipt__title', id: 'receipt-title' }, title), sub && h('p', { class: 'receipt__sub' }, sub)),
      phase !== 'running' && h('button', { type: 'button', class: 'btn btn--icon receipt__close', 'aria-label': '닫기', onClick: () => close(phase === 'confirm' ? null : 'close') }, icon('close', { size: 18 })),
    );

  // ── 1단계: 실행 전 확인 ──
  function renderConfirm() {
    const s = summarizeEstimates(plan.calls, { usdKrw, enabled: [...enabled] });
    const webCalls = plan.calls.filter((c) => c.webSearch && enabled.has(c.model));
    const webUsd = webCalls.reduce((sum, c) => sum + (c.estimate.webUsd ?? 0), 0);
    const n = s.total.calls;
    mount(
      dialog,
      h(
        'div',
        { class: 'receipt on-paper' },
        head('BEFORE TAKEOFF · 실행 전 확인', plan.label, plan.description),
        h(
          'table',
          { class: 'receipt__table' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, '사용'), h('th', { scope: 'col' }, 'MODEL'), h('th', { scope: 'col', class: 'num' }, 'CALLS'), h('th', { scope: 'col', class: 'num' }, 'IN / OUT TOKENS'), h('th', { scope: 'col', class: 'num' }, 'EST.'))),
          h(
            'tbody',
            null,
            models.map((m) => {
              const row = s.byModel[m];
              const on = enabled.has(m);
              const name = plan.calls.find((c) => c.model === m).name ?? MODEL_META[m].name;
              return h(
                'tr',
                { class: !on && 'is-off' },
                h(
                  'td',
                  null,
                  h('input', {
                    type: 'checkbox',
                    class: 'tp-check',
                    id: `receipt-use-${m}`,
                    checked: on,
                    'aria-label': `${name} 이번 실행에 사용`,
                    onChange: (e) => {
                      e.target.checked ? enabled.add(m) : enabled.delete(m);
                      renderConfirm();
                      dialog.querySelector(`#receipt-use-${m}`)?.focus();
                    },
                  }),
                ),
                h('td', null, modelBadge(m, { size: 30, name })),
                h('td', { class: 'num' }, String(row.calls)),
                h('td', { class: 'num' }, `${k(row.inTokens)} / ${k(row.outTokens)}`),
                h('td', { class: 'num' }, usd(row.usd)),
              );
            }),
            webCalls.length > 0 && h('tr', { class: 'receipt__web' }, h('td'), h('td', null, '웹 검색 요금 (포함)'), h('td', { class: 'num' }, String(webCalls.length)), h('td', { class: 'num' }, '—'), h('td', { class: 'num' }, usd(webUsd))),
          ),
        ),
        h(
          'div',
          { class: 'receipt__total' },
          h('div', null, h('span', { class: 'receipt__label' }, 'ESTIMATED TOTAL'), h('span', { class: 'receipt__delta' }, deltaText(delta))),
          h('div', { class: 'receipt__sum' }, h('span', { class: 'receipt__usd' }, s.total.unknownPrice ? `${usd(s.total.usd)}+` : usd(s.total.usd)), h('span', { class: 'receipt__krw' }, `${krw(s.total.krw)} · 환율 설정값 기준`)),
        ),
        h('p', { class: 'receipt__note' }, '추정치예요. 단가는 OpenRouter 모델 목록에서 가져오고, 실행 후에는 실제 사용량으로 다시 기록해요. 비용 상한은 없으니 금액을 보고 판단해 주세요.'),
        h(
          'div',
          { class: 'receipt__actions' },
          h('button', { type: 'button', class: 'btn btn--paper-line', onClick: () => close(null) }, '취소'),
          h('button', { type: 'button', class: 'btn btn--ink', id: 'receipt-run', disabled: n === 0, onClick: () => resolveConfirm([...enabled]) }, n ? `${n}회 실행하기` : '모델을 하나 이상 고르세요'),
        ),
      ),
    );
  }

  // ── 2단계: 진행 상황 (11장: 대기/진행 중/완료/실패) ──
  const status = new Map();
  const results = new Map();
  function renderProgress() {
    const calls = plan.calls.filter((c) => enabled.has(c.model));
    const doneUsd = [...results.values()].reduce((s, r) => s + (r.usd ?? 0), 0);
    mount(
      dialog,
      h(
        'div',
        { class: 'receipt on-paper' },
        head(phase === 'running' ? 'IN FLIGHT · 실행 중' : 'ARRIVED · 실행 완료', plan.label),
        h(
          'ul',
          { class: 'receipt__progress', 'aria-live': 'polite' },
          models
            .filter((m) => enabled.has(m))
            .map((m) => {
              const mine = calls.filter((c) => c.model === m);
              const counts = { waiting: 0, running: 0, done: 0, failed: 0 };
              mine.forEach((c) => counts[status.get(c.index) ?? 'waiting']++);
              const label = counts.running ? `진행 중 · ${counts.done + counts.failed}/${mine.length}` : counts.waiting ? '대기' : counts.failed ? `실패 ${counts.failed}` : '완료';
              const cls = counts.running ? 'is-running' : counts.waiting ? 'is-waiting' : counts.failed ? 'is-failed' : 'is-done';
              const firstError = mine.map((c) => results.get(c.index)).find((r) => r && !r.ok)?.error;
              return h(
                'li',
                { class: 'receipt__prow' },
                modelBadge(m, { size: 30, name: mine[0].name }),
                h('span', { class: ['receipt__status', cls] }, label, counts.running ? h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')) : null),
                firstError && h('span', { class: 'receipt__error' }, describeError(firstError.kind, firstError.message, firstError.message)),
              );
            }),
        ),
        h('div', { class: 'receipt__total' }, h('span', { class: 'receipt__label' }, phase === 'running' ? '실제 비용 · 지금까지' : 'ACTUAL TOTAL · 실제 비용'), h('span', { class: 'receipt__usd' }, usd(doneUsd))),
        phase === 'done' && finishActions(),
      ),
    );
  }

  let allowRetry = true;
  function finishActions() {
    const failed = allowRetry ? [...results.values()].filter((r) => !r.ok).length : 0;
    return h(
      'div',
      { class: 'receipt__actions' },
      failed > 0 && h('button', { type: 'button', class: 'btn btn--paper-line', onClick: () => resolveFinish('retry') }, icon('refresh', { size: 16 }), `실패한 ${failed}개 다시 시도`),
      h('button', { type: 'button', class: 'btn btn--ink', id: 'receipt-done', onClick: () => close('close') }, '닫기'),
    );
  }

  renderConfirm();
  dialog.showModal();
  dialog.querySelector('#receipt-run')?.focus();

  return {
    confirm: () => new Promise((resolve) => (resolveConfirm = resolve)),
    start() {
      phase = 'running';
      renderProgress();
    },
    progress(index, st, result) {
      status.set(index, st);
      if (result) results.set(index, result);
      renderProgress();
    },
    /** 결과를 보여 주고 닫기 또는 다시 시도를 기다린다. allowRetry: false면 다시 시도 버튼 없음(라운드 실행) */
    finish({ allowRetry: retry = true } = {}) {
      allowRetry = retry;
      phase = 'done';
      renderProgress();
      dialog.querySelector('#receipt-done')?.focus();
      return new Promise((resolve) => (resolveFinish = resolve));
    },
    /** 다시 시도: 실패한 호출만 대기로 되돌린다 */
    retry(indexes) {
      phase = 'running';
      indexes.forEach((i) => {
        status.set(i, 'waiting');
        results.delete(i);
      });
      renderProgress();
    },
  };
}
