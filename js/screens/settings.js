// 설정 — PRD F0, F12-4·6, 10장(보안·데이터 보존) / DESIGN.md 9장 "설정"
import { h } from '../ui/dom.js';
import { screenHeader, segmented, button, panel } from '../ui/components/basic.js';
import { field, textInput, datalist } from '../ui/components/form.js';
import { modelBadge } from '../ui/components/ai.js';
import { formatUsd, formatKrw } from '../ui/format.js';
import { costTotals } from '../core/cost.js';
import { ERROR_TEXT } from '../ai/openrouter.js';

const FEATURE_KO = { recommend: '후보 추천', research: '자료 수집', scores: '점수 초안', panel: '최종 심사', chair: '의장 종합', test: '시험 호출' };
const perMillion = (v) => `$${(v * 1e6).toFixed(2)}`;
const mask = (key) => (key.length > 10 ? `${key.slice(0, 6)}••••${key.slice(-4)}` : '••••');
const shortName = (name) => name.replace(/^[^:]+:\s*/, '');

function keyPanel(ctx, settings) {
  const key = ctx.store.getApiKey();
  const ui = ctx.ui();
  const check = ui.keyCheck;
  const onSave = (e) => {
    e.preventDefault();
    const value = new FormData(e.target).get('key')?.trim();
    if (!value) return;
    ctx.store.setApiKey(value, { persist: settings.apiKeyStorage });
    e.target.reset();
    ctx.setUi({ keyCheck: null });
    ctx.flash('API 키를 저장했어요. [연결 테스트]로 확인해 보세요.');
  };
  const onCheck = async () => {
    ctx.setUi({ keyCheck: { pending: true } });
    const r = await ctx.ai.client.checkKey();
    ctx.setUi({ keyCheck: r });
  };
  const checkText = !check
    ? null
    : check.pending
      ? '확인 중…'
      : check.ok
        ? `연결됨 · ${check.label ?? '이름 없는 키'} · ${check.limitRemaining == null ? '한도 없음' : `남은 한도 $${check.limitRemaining.toFixed(2)}`} · 지금까지 $${(check.usage ?? 0).toFixed(2)} 사용`
        : ERROR_TEXT[check.error.kind] ?? check.error.message;

  return panel({
    title: 'OpenRouter API 키',
    meta: key ? `저장됨 · ${mask(key)}` : '없음',
    children: [
      h(
        'form',
        { class: 'inline-input', onSubmit: onSave, autocomplete: 'off' },
        h('label', { class: 'visually-hidden', for: 'set-key' }, 'API 키'),
        h('input', { id: 'set-key', name: 'key', type: 'password', class: 'input', placeholder: key ? '새 키로 바꾸려면 입력' : 'sk-or-v1-…', autocomplete: 'off', spellcheck: 'false' }),
        h('button', { type: 'submit', class: 'btn btn--paper' }, '키 저장'),
      ),
      h(
        'div',
        { class: 'btn-row' },
        segmented({
          label: '키 저장 방식',
          idPrefix: 'set-keystore',
          options: [
            { value: 'local', label: '이 기기에 저장' },
            { value: 'session', label: '이번 세션만' },
          ],
          value: settings.apiKeyStorage,
          onChange: (v) => {
            const current = ctx.store.getApiKey();
            if (current) ctx.store.setApiKey(current, { persist: v });
            ctx.saveSettings((s) => (s.apiKeyStorage = v));
          },
        }),
        button({ variant: 'secondary', label: '연결 테스트', disabled: !key, onClick: onCheck }),
        key &&
          button({
            variant: 'secondary',
            label: '키 지우기',
            onClick: () => {
              ctx.store.clearApiKey();
              ctx.setUi({ keyCheck: null });
              ctx.flash('API 키를 지웠어요.');
            },
          }),
      ),
      checkText && h('p', { class: ['key-check', check?.ok && 'is-ok', check && !check.pending && !check.ok && 'is-bad'], role: 'status' }, checkText),
      h(
        'p',
        { class: 'muted' },
        '키는 이 브라우저에만 저장되고 OpenRouter 말고는 어디에도 보내지 않아요. JSON 백업·내보내기 파일에도 들어가지 않아요. 공용 PC에서는 "이번 세션만"을 쓰고, ',
        h('a', { href: 'https://openrouter.ai/settings/keys', target: '_blank', rel: 'noopener' }, 'OpenRouter 키 설정'),
        '에서 키별 사용 한도를 정해 두세요.',
      ),
    ],
  });
}

function modelsPanel(ctx, settings) {
  const list = ctx.ui().modelList;
  const loading = ctx.ui().modelListLoading;
  const onLoad = async () => {
    ctx.setUi({ modelListLoading: true });
    const r = await ctx.ai.client.listModels();
    if (!r.ok) {
      ctx.setUi({ modelListLoading: false });
      ctx.flash(ERROR_TEXT[r.error.kind] ?? r.error.message, 'warn');
      return;
    }
    const byId = new Map(r.models.map((m) => [m.id, m]));
    const now = new Date().toISOString();
    let updated = 0;
    ctx.saveSettings((s) => {
      for (const m of s.models) {
        const found = byId.get(m.slug);
        if (found) {
          m.pricing = { ...found.pricing, fetchedAt: now };
          updated++;
        }
      }
    });
    ctx.setUi({ modelList: r.models.filter((m) => m.supportsJson).map((m) => ({ id: m.id, name: m.name })), modelListLoading: false });
    ctx.flash(`모델 ${r.models.length}개를 불러왔고, 지금 쓰는 모델 ${updated}개의 단가를 갱신했어요.`);
  };

  const rows = settings.models.map((m) => {
    const p = m.pricing;
    const priceText = p
      ? `입력 ${perMillion(p.prompt)} · 출력 ${perMillion(p.completion)} / 100만 토큰 · 웹 검색 $${p.webSearch}/회 · ${p.fetchedAt ? `불러옴 ${p.fetchedAt.slice(0, 10)}` : '기본값 2026-10-13'}`
      : '단가 없음 · [모델 목록·단가 불러오기]를 눌러 주세요';
    return h(
      'li',
      { class: ['model-row', !m.enabled && 'is-off'] },
      modelBadge(m.key, { name: m.name, role: settings.chairModel === m.key ? 'chair' : null }),
      h(
        'div',
        { class: 'model-row__fields' },
        h('label', { class: 'visually-hidden', for: `set-slug-${m.key}` }, `${m.name} 슬러그`),
        textInput({
          id: `set-slug-${m.key}`,
          value: m.slug,
          list: list ? 'set-model-list' : null,
          className: 'input--mono',
          onCommit: (v) =>
            ctx.saveSettings((s) => {
              const t = s.models.find((x) => x.key === m.key);
              t.slug = v.trim();
              const found = list?.find((x) => x.id === t.slug);
              if (found) t.name = shortName(found.name);
              t.pricing = null; // 슬러그가 바뀌면 단가를 다시 불러와야 함
            }),
        }),
        h('span', { class: 'model-row__price' }, priceText),
      ),
      h(
        'div',
        { class: 'model-row__toggles' },
        h(
          'label',
          { class: 'check' },
          h('input', {
            type: 'checkbox',
            class: 'tp-check',
            id: `set-on-${m.key}`,
            checked: m.enabled,
            onChange: (e) => ctx.saveSettings((s) => (s.models.find((x) => x.key === m.key).enabled = e.target.checked)),
          }),
          '사용',
        ),
        h(
          'label',
          { class: 'check' },
          h('input', {
            type: 'radio',
            name: 'chair',
            id: `set-chair-${m.key}`,
            checked: settings.chairModel === m.key,
            onChange: () => ctx.saveSettings((s) => (s.chairModel = m.key)),
          }),
          '의장',
        ),
      ),
    );
  });

  return panel({
    title: 'AI 모델',
    meta: '같은 질문을 세 모델에 보내 비교해요',
    children: [
      h('ul', { class: 'model-list' }, rows),
      list && datalist('set-model-list', list.map((m) => m.id)),
      h(
        'div',
        { class: 'btn-row' },
        button({ variant: 'secondary', label: loading ? '불러오는 중…' : '모델 목록·단가 불러오기', iconName: 'refresh', disabled: loading, onClick: onLoad }),
        h('span', { class: 'muted' }, list ? `JSON 출력을 지원하는 모델 ${list.length}개를 슬러그 칸에서 검색할 수 있어요.` : '불러오면 슬러그 칸에서 모델 이름을 검색할 수 있어요.'),
      ),
      h('p', { class: 'muted' }, '의장 모델은 AI 최종 심사에서 결론을 정리해요. 비용을 아끼려면 모델을 2개만 켜도 돼요.'),
    ],
  });
}

function optionsPanel(ctx, settings) {
  return panel({
    title: '옵션',
    children: [
      h(
        'label',
        { class: 'check check--row' },
        h('input', { type: 'checkbox', class: 'tp-check', id: 'set-web', checked: settings.webSearch, onChange: (e) => ctx.saveSettings((s) => (s.webSearch = e.target.checked)) }),
        h('span', null, h('b', null, '웹 검색 사용'), h('span', { class: 'muted' }, ' · 최신 정보가 필요한 후보 추천·자료 수집에만 써요. 검색 1회마다 요금이 붙어요.')),
      ),
      h(
        'div',
        { class: 'field-row' },
        field({
          id: 'set-krw',
          label: '원화 환율 (1 USD)',
          hint: '예상·실제 비용의 원화 환산에 써요',
          children: textInput({ id: 'set-krw', type: 'number', inputmode: 'decimal', min: 1, value: settings.usdKrw, hint: true, onCommit: (v) => Number(v) > 0 && ctx.saveSettings((s) => (s.usdKrw = Number(v))) }),
        }),
        field({
          id: 'set-ratio-ko',
          label: '한글 1글자 ≈ 토큰',
          hint: '실제 사용량을 보고 조정',
          children: textInput({ id: 'set-ratio-ko', type: 'number', inputmode: 'decimal', min: 0.1, max: 3, step: 0.05, value: settings.tokenRatio.ko, hint: true, onCommit: (v) => Number(v) > 0 && ctx.saveSettings((s) => (s.tokenRatio.ko = Number(v))) }),
        }),
        field({
          id: 'set-ratio-other',
          label: '그 밖 1글자 ≈ 토큰',
          hint: '영문 4글자 ≈ 1토큰',
          children: textInput({ id: 'set-ratio-other', type: 'number', inputmode: 'decimal', min: 0.05, max: 2, step: 0.05, value: settings.tokenRatio.other, hint: true, onCommit: (v) => Number(v) > 0 && ctx.saveSettings((s) => (s.tokenRatio.other = Number(v))) }),
        }),
      ),
    ],
  });
}

function testPanel(ctx, settings) {
  const onTest = async () => {
    const out = await ctx.ai.run({
      feature: 'test',
      record: false, // 앱 점검용이라 여행 프로젝트의 AI 비용에 넣지 않는다
      label: '시험 호출',
      description: '켜 둔 모델마다 아주 짧은 질문을 1번씩 보내 연결과 비용 기록을 확인해요.',
      calls: settings.models.map((m) => ({
        model: m.key,
        outTokens: 60,
        messages: [
          { role: 'system', content: 'You are a connectivity check. Reply with JSON only.' },
          { role: 'user', content: '{"ok": true, "model": "<당신의 모델 이름>"} 형식의 JSON 하나만 답해 주세요.' },
        ],
        schema: { name: 'ping', schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, model: { type: 'string' } } } },
      })),
    });
    if (!out) return;
    const ok = out.results.filter((r) => r.ok).length;
    const usd = out.runs.reduce((s, r) => s + (r.actual?.usd ?? 0), 0);
    ctx.flash(`시험 호출 ${ok}/${out.results.length} 성공 · 실제 비용 ${formatUsd(usd)} (${formatKrw(usd * settings.usdKrw)})`, ok === out.results.length ? 'ok' : 'warn');
  };
  return panel({
    title: '시험 호출',
    children: [
      h('p', { class: 'muted' }, '실행 전 비용 확인 창, 병렬 호출, JSON 응답 처리, 실제 비용 기록이 모두 잘 되는지 확인해요. 모델당 1회, 보통 1원도 안 들어요.'),
      h('div', { class: 'btn-row' }, button({ variant: 'secondary', label: '세 모델 시험 호출', disabled: !ctx.store.getApiKey(), onClick: onTest })),
    ],
  });
}

function costPanel(ctx, settings) {
  const runs = ctx.data?.aiRuns ?? [];
  const t = costTotals(runs);
  const row = (label, usd) => h('tr', null, h('th', { scope: 'row' }, label), h('td', { class: 'num' }, formatUsd(usd)), h('td', { class: 'num' }, formatKrw(usd * settings.usdKrw)));
  return panel({
    title: '누적 AI 비용',
    meta: ctx.data ? ctx.data.project.name : '열린 프로젝트 없음',
    children: !runs.length
      ? h('p', { class: 'muted' }, '아직 이 프로젝트에서 AI를 호출하지 않았어요.')
      : [
          h('p', { class: 'cost-total' }, formatUsd(t.total), ' ', h('span', { class: 'muted' }, `${formatKrw(t.total * settings.usdKrw)} · ${t.calls}회 호출`)),
          h(
            'div',
            { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': '기능별 AI 비용 표' },
            h(
              'table',
              { class: 'wtable' },
              h('thead', null, h('tr', null, h('th', { scope: 'col' }, '구분'), h('th', { scope: 'col', class: 'num' }, 'USD'), h('th', { scope: 'col', class: 'num' }, '원화'))),
              h(
                'tbody',
                null,
                settings.models.filter((m) => t.byModel[m.key]).map((m) => row(m.name, t.byModel[m.key])),
                Object.entries(t.byFeature).map(([f, usd]) => row(`기능 · ${FEATURE_KO[f] ?? f}`, usd)),
              ),
            ),
          ),
        ],
  });
}

function dataPanel(ctx) {
  const onWipe = () => {
    if (!window.confirm('이 브라우저의 Travel Pick 데이터(모든 프로젝트, 설정, API 키)를 지울까요?')) return;
    if (!window.confirm('정말 지울까요? 되돌릴 수 없어요. 필요하면 먼저 출발 안내판에서 JSON 백업을 받아 두세요.')) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith('travelpick:')) keys.push(localStorage.key(i));
    keys.forEach((k) => localStorage.removeItem(k));
    ctx.store.clearApiKey();
    window.location.hash = '#/home';
    window.location.reload();
  };
  return panel({
    title: '데이터',
    children: [
      h('p', { class: 'muted' }, '모든 데이터는 이 브라우저의 저장 공간(localStorage)에만 있어요. 브라우저 데이터를 지우면 함께 지워지니, 출발 안내판에서 가끔 JSON 백업을 받아 두세요.'),
      h('div', { class: 'btn-row' }, button({ variant: 'secondary', label: '모든 데이터 지우기', onClick: onWipe })),
    ],
  });
}

export function renderSettings(ctx) {
  const settings = ctx.store.loadSettings();
  return {
    node: h(
      'div',
      { class: 'screen' },
      screenHeader({ eyebrow: 'SETTINGS · 설정', title: '설정' }),
      h(
        'div',
        { class: 'two-col' },
        h('div', { class: 'two-col__main' }, keyPanel(ctx, settings), modelsPanel(ctx, settings), optionsPanel(ctx, settings)),
        h('div', { class: 'two-col__side' }, testPanel(ctx, settings), costPanel(ctx, settings), dataPanel(ctx)),
      ),
    ),
  };
}
