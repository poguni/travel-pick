// ⑧ 내보내기 — PRD F13-2~5·7·8. DESIGN.md 9장 "내보내기"(종이 영수증 목록)
import { h } from '../ui/dom.js';
import { screenHeader, button, panel } from '../ui/components/basic.js';
import { reportDocument } from '../ui/components/report.js';
import { icon } from '../ui/icons.js';
import { downloadText, exportFileName } from '../ui/download.js';
import { backupDue, BACKUP_DAYS } from '../core/project.js';
import { markExported } from '../core/panel.js';
import { buildReport } from '../export/report.js';
import { reportCharts } from '../export/charts.js';
import { emptyRedirect } from './placeholder.js';

// 차트 PNG: 화면을 다시 그려도 한 번만 만든다 (점수·가중치가 바뀌면 reportCharts가 새로 그림)
let charts = { key: null, list: [], pending: false };

function chartsKey(data) {
  return JSON.stringify([data.project.id, data.scores, data.weights, data.criteria.map((k) => k.id), data.candidates.map((c) => c.id)]);
}

async function ensureCharts(ctx, data) {
  const key = chartsKey(data);
  if (charts.key === key && !charts.pending) return charts.list;
  charts = { key, list: [], pending: true };
  try {
    charts.list = await reportCharts(data);
  } catch {
    charts.list = []; // 차트 라이브러리를 못 불러와도 리포트는 만든다
  }
  charts.pending = false;
  ctx.setUi({ reportTick: Date.now() });
  return charts.list;
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '아직 없음');

function row({ badge, title, desc, meta, action, warn }) {
  return h(
    'li',
    { class: ['export-row', warn && 'is-warn'] },
    h('span', { class: 'export-row__badge', 'aria-hidden': 'true' }, badge),
    h('span', { class: 'export-row__text' }, h('span', { class: 'export-row__title' }, title), h('span', { class: 'export-row__desc' }, desc), meta && h('span', { class: 'export-row__meta' }, meta)),
    action,
  );
}

export function renderExport(ctx) {
  const { data } = ctx;
  if (!data) return emptyRedirect('export');
  const key = chartsKey(data);
  if (charts.key !== key && !charts.pending) ensureCharts(ctx, data);
  const report = { ...buildReport(data), charts: charts.key === key ? charts.list : [] };
  const due = backupDue(data.project);

  // 무엇이든 내보내면 ⑧ 단계를 완료로 표시한다 (RouteNav·홈 다음 게이트)
  const exported = () => ctx.update((d) => markExported(d, { at: new Date().toISOString() }));

  const onBackup = () => {
    exported(); // 백업 파일에도 완료 기록이 들어가도록 먼저
    ctx.flush();
    const backup = ctx.store.exportBackup();
    downloadText(exportFileName('백업', 'json'), JSON.stringify(backup, null, 2));
    ctx.reload();
    ctx.flash(`프로젝트 ${backup.projects.length}개를 JSON으로 백업했어요.`);
  };
  const onExcel = async () => {
    try {
      const { exportExcel } = await import('../export/excel.js');
      const name = await exportExcel(ctx.state.getState().data);
      exported();
      ctx.flash(`${name} 파일을 저장했어요.`);
    } catch {
      ctx.flash('Excel 파일을 만들지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.', 'warn');
    }
  };
  const onWord = async () => {
    try {
      const d = ctx.state.getState().data;
      const list = await ensureCharts(ctx, d);
      const { exportWord } = await import('../export/word.js');
      const name = await exportWord({ ...buildReport(d), charts: list });
      exported();
      ctx.flash(`${name} 파일을 저장했어요. Word나 한컴오피스에서 열어 보세요.`);
    } catch {
      ctx.flash('Word 파일을 만들지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.', 'warn');
    }
  };
  const onPdf = async () => {
    const d = ctx.state.getState().data;
    await ensureCharts(ctx, d);
    // "PDF로 저장"의 기본 파일 이름은 문서 제목이므로, 인쇄하는 동안만 Excel·Word와 같은 이름으로 바꾼다
    const title = document.title;
    document.title = exportFileName(d.project.name, 'pdf').replace(/\.pdf$/, '');
    window.addEventListener('afterprint', () => (document.title = title), { once: true });
    exported(); // 인쇄 창에서 실제로 저장했는지는 알 수 없어 창을 열 때 기록한다
    // 차트가 들어간 미리보기가 그려진 뒤 인쇄 창을 연다
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  return {
    node: h(
      'div',
      { class: 'screen' },
      screenHeader({ eyebrow: 'GATE 08 · EXPORT', title: ['결정을 기록으로', '남겨 두세요'] }),
      h(
        'section',
        { class: 'export-receipt on-paper', 'aria-label': '내보내기 형식' },
        h('div', { class: 'export-receipt__head' }, h('span', { class: 'receipt__label' }, 'EXPORT · 내보내기'), h('span', { class: 'receipt__label' }, data.project.name)),
        h(
          'ul',
          { class: 'export-list' },
          row({
            badge: 'JSON',
            title: 'JSON 백업',
            desc: '모든 프로젝트의 조건·자료·점수·AI 기록. 다른 기기로 옮기거나 브라우저 데이터가 지워졌을 때 복구용이에요. API 키는 들어가지 않아요.',
            meta: `마지막 백업 · ${fmtDate(data.project.lastBackupAt)}${due ? ` · ${BACKUP_DAYS}일이 지났어요` : ''}`,
            warn: due,
            action: button({ variant: 'ink', label: '백업 받기', onClick: onBackup }),
          }),
          row({ badge: 'XLSX', title: 'Excel', desc: '후보, 기준·가중치, 점수표, 결과 순위, 리서치 자료, AI 비용 기록을 시트 6개로.', action: button({ variant: 'paper-line', label: 'Excel 받기', onClick: onExcel }) }),
          row({ badge: 'DOCX', title: 'Word 결정 리포트', desc: '아래 미리보기와 같은 내용을 표·차트와 함께 docx로. 한글 글꼴은 맑은 고딕이에요.', action: button({ variant: 'paper-line', label: 'Word 받기', onClick: onWord }) }),
          row({ badge: 'PDF', title: 'PDF 결정 리포트', desc: '인쇄 창이 열리면 대상에서 "PDF로 저장"을 고르세요. 아래 미리보기 그대로 저장돼요.', action: button({ variant: 'paper-line', label: '인쇄·PDF 저장', onClick: onPdf }) }),
        ),
      ),
      panel({
        title: '리포트 미리보기',
        meta: 'Word·PDF와 같은 내용',
        children: [
          !data.decision.chosen && h('p', { class: 'notice notice--warn' }, icon('warning', { size: 16 }), '아직 최종 결정 전이에요. AI 최종 심사에서 결정하면 리포트 첫머리에 들어가요. 지금은 계산 1위를 표시해요.'),
          h('div', { class: 'report-wrap' }, reportDocument(report, { chartsPending: charts.pending && charts.key === key })),
        ],
      }),
    ),
  };
}
