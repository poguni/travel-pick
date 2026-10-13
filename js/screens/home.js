// 01 출발 안내판 (홈) — 프로젝트 탑승권, 프로젝트 목록(F1-2), 저장 공간(F1-4), JSON 백업·불러오기(F13-2)
// 순위표·가중치 나침반·탑승객별 1순위는 Phase 6.
import { h } from '../ui/dom.js';
import { screenHeader, emptyState, dashedCard, button, panel, chip } from '../ui/components/basic.js';
import { boardingPass } from '../ui/components/boardingPass.js';
import { originLabel, periodLong, durationText, companionText, familyDetailText, budgetText } from '../ui/format.js';
import { downloadText, exportFileName } from '../ui/download.js';
import { hrefFor } from '../router.js';

/** 프로젝트 데이터 → 탑승권 (DESIGN.md 6.2) */
export function projectPass(data) {
  const p = data.project;
  const n = data.candidates.length;
  const created = p.createdAt.slice(0, 10).split('-');
  const tbd = (text) => (text === '미정' ? 'TBD · AI가 추천 시기 제시' : null);
  return boardingPass({
    tripType: p.tripType,
    serial: `TP-${created[0]}-${created[1]}${created[2]}`,
    origin: { text: originLabel(p), caption: `${p.origin} 출발` },
    dest: { pending: true, caption: n ? `후보 ${n}곳 중 결정 중` : '후보를 모으는 중' },
    info: [
      { label: 'DEPART', value: periodLong(p.period), sub: tbd(periodLong(p.period)) },
      { label: 'DURATION', value: durationText(p.period), sub: tbd(durationText(p.period)) },
      { label: 'PASSENGERS', value: companionText(p.companion, p.travelers), sub: familyDetailText(p.companion) },
      { label: 'BUDGET / PAX', value: budgetText(p.budgetPerPerson) },
    ],
    stub: { label: 'NOW LEADING · 현재 선두', place: null },
  });
}

const when = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function projectsPanel(ctx) {
  const list = ctx.store.listProjects();
  const currentId = ctx.data?.project.id;
  return panel({
    title: '내 여행 프로젝트',
    meta: `${list.length}개`,
    children: [
      list.length === 0
        ? h('p', { class: 'muted' }, '아직 만든 프로젝트가 없어요.')
        : h(
            'ul',
            { class: 'project-list' },
            list.map((e) => {
              const current = e.id === currentId;
              return h(
                'li',
                { class: ['project-row', current && 'is-current'] },
                h(
                  'button',
                  { type: 'button', id: `home-open-${e.id}`, class: 'project-row__open', 'aria-current': current ? 'true' : null, onClick: () => ctx.openProject(e.id, current ? 'home' : 'conditions') },
                  h('span', { class: 'project-row__name' }, e.name),
                  h('span', { class: 'project-row__meta' }, `${e.tripType === 'domestic' ? '국내' : '해외'} · 수정 ${when(e.updatedAt)}`),
                ),
                current && chip('열려 있음'),
                button({
                  variant: 'secondary',
                  label: '복제',
                  ariaLabel: `${e.name} 복제`,
                  onClick: () => {
                    ctx.flush();
                    const copy = ctx.store.duplicateProject(e.id);
                    ctx.reload();
                    if (copy) ctx.flash(`"${copy.project.name}" 프로젝트를 만들었어요.`);
                  },
                }),
                button({
                  variant: 'secondary',
                  label: '삭제',
                  ariaLabel: `${e.name} 삭제`,
                  onClick: () => {
                    if (window.confirm(`"${e.name}" 프로젝트를 지울까요? 되돌릴 수 없어요.`)) {
                      ctx.deleteProject(e.id);
                      ctx.flash(`"${e.name}" 프로젝트를 지웠어요.`);
                    }
                  },
                }),
              );
            }),
          ),
    ],
  });
}

function storagePanel(ctx) {
  const u = ctx.store.usage();
  const pct = Math.min(100, u.ratio * 100);
  const mb = (b) => (b / 1024 / 1024).toFixed(2);
  const lastBackup = ctx.data?.project.lastBackupAt;

  const onBackup = () => {
    ctx.flush();
    const backup = ctx.store.exportBackup();
    downloadText(exportFileName('백업', 'json'), JSON.stringify(backup, null, 2));
    ctx.reload();
    ctx.flash(`프로젝트 ${backup.projects.length}개를 JSON으로 백업했어요.`);
  };

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      ctx.flash('JSON 파일을 읽지 못했어요. Travel Pick에서 받은 백업 파일인지 확인해 주세요.', 'warn');
      return;
    }
    ctx.flush();
    let r;
    try {
      r = ctx.store.importBackup(parsed);
    } catch (err) {
      ctx.flash(err.message, 'warn'); // 새 버전 데이터 등
      return;
    }
    ctx.reload();
    if (r.ok) ctx.flash(`프로젝트 ${r.imported}개를 불러왔어요.`);
    else ctx.flash(r.error === 'quota' ? `저장 공간이 부족해 ${r.imported}개만 불러왔어요.` : 'Travel Pick 백업 파일이 아니에요.', 'warn');
  };

  return panel({
    title: '저장 공간',
    meta: '이 브라우저',
    children: [
      h(
        'div',
        { class: 'meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': pct.toFixed(0), 'aria-label': '저장 공간 사용률' },
        h('span', { class: ['meter__fill', u.warn && 'is-warn'], style: { width: `${pct}%` } }),
      ),
      h('p', { class: 'meter__text' }, `${pct.toFixed(1)}% 사용 · ${mb(u.bytes)}MB / 약 ${mb(u.quotaChars * 2)}MB`),
      h('p', { class: 'muted' }, '데이터는 이 브라우저에만 저장돼요. 브라우저 데이터를 지우면 함께 지워지니 가끔 JSON으로 백업해 두세요.'),
      h('p', { class: 'muted' }, `마지막 백업 · ${when(lastBackup)}`),
      h(
        'div',
        { class: 'btn-row' },
        button({ variant: 'secondary', label: 'JSON 백업 받기', onClick: onBackup }),
        h(
          'label',
          { class: 'btn btn--secondary', for: 'home-import' },
          'JSON 불러오기',
          h('input', { id: 'home-import', type: 'file', accept: '.json,application/json', class: 'visually-hidden', onChange: onImport }),
        ),
      ),
      h('p', { class: 'field__hint' }, '불러올 때 같은 프로젝트가 있으면 백업 내용으로 바뀌어요.'),
    ],
  });
}

function nextCard(data) {
  if (!data.candidates.length) {
    return dashedCard({
      eyebrow: 'NEXT GATE · 01–02',
      title: '여행 조건을 정하고 후보를 모아 볼까요?',
      desc: '국내·해외, 시기, 동행, 예산을 먼저 정하면 AI 추천도 더 잘 맞아요.',
      action: button({ variant: 'outline', label: '여행 조건 정하기', href: hrefFor('conditions') }),
    });
  }
  return dashedCard({
    eyebrow: 'COMING UP · PHASE 6',
    title: '후보 순위표, 가중치 나침반, 탑승객별 1순위가 이 자리에 놓입니다',
    action: button({ variant: 'outline', label: '후보 보기', href: hrefFor('candidates') }),
  });
}

export function renderHome(ctx) {
  const { data } = ctx;
  const create = () => button({ variant: 'primary', label: '새 여행 만들기', iconName: 'plus', onClick: () => ctx.createProject() });
  const lower = h('div', { class: 'two-col' }, h('div', { class: 'two-col__main' }, projectsPanel(ctx)), h('div', { class: 'two-col__side' }, storagePanel(ctx)));

  if (!data) {
    return {
      node: h(
        'div',
        { class: 'screen' },
        screenHeader({ eyebrow: 'DEPARTURES · 출발 안내판', title: '어디로 떠나 볼까요?', actions: [create()] }),
        emptyState({
          title: '아직 여행 프로젝트가 없어요',
          desc: '새 여행을 만들거나, 다른 기기에서 받은 JSON 백업을 불러오세요.',
        }),
        lower,
      ),
      mobileActions: [create()],
    };
  }
  return {
    node: h(
      'div',
      { class: 'screen' },
      screenHeader({
        eyebrow: 'DEPARTURES · 출발 안내판',
        title: data.candidates.length ? '어디로 떠날지 고르는 중이에요' : '어디로 떠나 볼까요?',
        actions: [create()],
      }),
      projectPass(data),
      nextCard(data),
      lower,
    ),
  };
}
