// 01 출발 안내판 (홈) — DESIGN.md 7장 01
// 프로젝트 탑승권(현재 선두), 후보 순위표, 가중치 나침반, 탑승객별 1순위, 다음 게이트,
// 프로젝트 목록(F1-2), 저장 공간(F1-4), JSON 백업·불러오기(F13-2)
import { h } from '../ui/dom.js';
import { screenHeader, emptyState, dashedCard, button, panel, chip } from '../ui/components/basic.js';
import { boardingPass } from '../ui/components/boardingPass.js';
import { departureBoard, weightCompass, memberPicks, placeCaption } from '../ui/components/results.js';
import { originLabel, periodLong, durationText, companionText, familyDetailText, budgetText } from '../ui/format.js';
import { downloadText, exportFileName } from '../ui/download.js';
import { hrefFor, STEPS } from '../router.js';
import { resultsFor, groupWeights, memberTopPicks, stepsDone } from '../selectors.js';

/** 프로젝트 데이터 → 탑승권 (DESIGN.md 6.2). 순위가 있으면 스텁에 현재 선두 */
export function projectPass(data, results = resultsFor(data)) {
  const p = data.project;
  const [first, second] = results.ranking;
  const leader = first && data.candidates[first.index];
  const n = data.candidates.length;
  const chosen = data.decision.chosen && data.candidates.find((c) => c.id === data.decision.chosen);
  const created = p.createdAt.slice(0, 10).split('-');
  const tbd = (text) => (text === '미정' ? 'TBD · AI가 추천 시기 제시' : null);
  return boardingPass({
    tripType: p.tripType,
    serial: `TP-${created[0]}-${created[1]}${created[2]}`,
    origin: { text: originLabel(p), caption: `${p.origin} 출발` },
    // AI 최종 심사에서 고른 여행지가 있으면 도착지에 표시한다
    dest: chosen ? { place: chosen, caption: `${placeCaption(chosen)} · 최종 결정` } : { pending: true, caption: n ? `후보 ${n}곳 중 결정 중` : '후보를 모으는 중' },
    info: [
      { label: 'DEPART', value: periodLong(p.period), sub: tbd(periodLong(p.period)) },
      { label: 'DURATION', value: durationText(p.period), sub: tbd(durationText(p.period)) },
      { label: 'PASSENGERS', value: companionText(p.companion, p.travelers), sub: familyDetailText(p.companion) },
      { label: 'BUDGET / PAX', value: budgetText(p.budgetPerPerson) },
    ],
    stub: leader
      ? {
          label: 'NOW LEADING · 현재 선두',
          place: leader,
          caption: placeCaption(leader),
          score: first.score,
          scoreNote: second ? `/ 100 · 2위와 ${(first.score - second.score).toFixed(1)}점 차` : '/ 100',
        }
      : { label: 'NOW LEADING · 현재 선두', place: null, emptyText: n ? '점수를 매기면 선두가 보여요' : '아직 순위가 없어요' },
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

/** 다음 게이트: 아직 끝나지 않은 첫 단계 (자료 수집은 AI 단계라 M1에서는 건너뜀) */
const NEXT_TEXT = {
  conditions: ['여행 조건부터 정해 볼까요?', '국내·해외, 시기, 동행, 예산을 먼저 정하면 AI 추천도 더 잘 맞아요.', '여행 조건 정하기'],
  candidates: ['비교할 후보를 2곳 이상 모아 주세요', '직접 추가하거나, AI 3개 모델에게 추천받아요.', '후보 발굴로'],
  weights: ['탑승객마다 기준의 중요도를 정해 주세요', '슬라이더로 빠르게, 또는 AHP로 엄밀하게.', '기준·가중치로'],
  scores: ['후보마다 기준별 점수를 매겨 주세요', '1~10점으로 매기면 바로 순위가 나와요.', '점수 매기기로'],
  panel: ['세 AI가 서로의 의견을 반박한 뒤, 의장 모델이 최종 결론을 정리합니다', '꼼꼼하게 3라운드 · 7회 호출', 'AI 최종 심사 보기'],
  export: ['결정 리포트를 내보내요', 'JSON·Excel·Word·PDF', '내보내기로'],
};

export function nextStep(data) {
  const done = stepsDone(data);
  return STEPS.find((st) => st.route !== 'research' && st.route !== 'results' && !done[st.route]) ?? null;
}

function nextCard(data) {
  const st = nextStep(data);
  if (!st) return null;
  const [title, desc, label] = NEXT_TEXT[st.route];
  return dashedCard({ eyebrow: `NEXT GATE · ${st.gate}`, title, desc, action: button({ variant: 'outline', label, href: hrefFor(st.route) }) });
}

/** 진행 단계별 제목 (DESIGN.md 7장 01) */
function homeTitle(data, results) {
  if (!data.candidates.length) return '어디로 떠나 볼까요?';
  if (results.ranking.length >= 2 && !results.incomplete.length) return '어디로 떠날지, 거의 다 왔어요';
  return '어디로 떠날지 고르는 중이에요';
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
  const results = resultsFor(data);
  const group = groupWeights(data);
  const st = nextStep(data);
  // 같은 요소를 두 곳(머리글·모바일 하단 바)에 넣으면 한쪽으로 옮겨지므로 매번 새로 만든다
  const go = () => st && button({ variant: 'primary', label: NEXT_TEXT[st.route][2], next: true, href: hrefFor(st.route) });
  const ranked = results.ranking.length > 0;
  return {
    node: h(
      'div',
      { class: 'screen' },
      screenHeader({
        eyebrow: 'DEPARTURES · 출발 안내판',
        title: homeTitle(data, results),
        actions: [button({ variant: 'secondary', label: '새 여행 만들기', iconName: 'plus', onClick: () => ctx.createProject() }), go()].filter(Boolean),
      }),
      projectPass(data, results),
      ranked &&
        h(
          'div',
          { class: 'two-col' },
          h('div', { class: 'two-col__main' }, departureBoard(data, results)),
          h('div', { class: 'two-col__side' }, weightCompass(data, group), data.members.length > 1 && memberPicks(data, memberTopPicks(data))),
        ),
      nextCard(data),
      lower,
    ),
    mobileActions: st ? [go()] : [],
  };
}
