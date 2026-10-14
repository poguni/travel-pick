// Word(docx) 결정 리포트 — PRD F13-4·7. Implementation Plan Phase 12
// buildDocx(docx, report, colors): docx 모듈을 받아 문서를 만드는 순수 함수(Node 테스트 가능)
// exportWord(report): 브라우저에서 docx를 동적 import로 불러와 내려받기

import { markdownToParagraphs } from './report.js';
import { exportFileName, downloadBlob } from '../ui/download.js';
import { token } from '../ui/charts.js';

export const DOCX_URL = 'https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.mjs';

/** 한글 글꼴: Word·한컴오피스 모두 있는 맑은 고딕 */
const FONT = { ascii: 'Malgun Gothic', hAnsi: 'Malgun Gothic', cs: 'Malgun Gothic', eastAsia: '맑은 고딕' };

/** 문서에 쓰는 종이 색 토큰 (docx는 CSS 변수를 못 쓰므로 값을 읽어 넘긴다) */
export const DOC_COLOR_TOKENS = { ink: 'ink', muted: 'ink-muted', accent: 'sunset-ink', headFill: 'paper-stub', line: 'paper-line' };

/** readToken(name) → '#RRGGBB' 로 문서 색 만들기 (docx는 # 없는 6자리) */
export function docColors(readToken) {
  return Object.fromEntries(Object.entries(DOC_COLOR_TOKENS).map(([k, t]) => [k, readToken(t).replace('#', '').toUpperCase()]));
}

/** data URL(PNG) → Uint8Array */
export function dataUrlBytes(dataUrl) {
  const b64 = String(dataUrl).split(',')[1] ?? '';
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

export function buildDocx(docx, report, colors) {
  const { ink: INK, muted: MUTED, accent: ACCENT, headFill: HEAD_FILL, line: LINE } = colors;
  const { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun, AlignmentType, BorderStyle, ShadingType, Footer, PageNumber } = docx;

  const text = (t, opts = {}) => new TextRun({ text: String(t ?? ''), ...opts });
  const para = (t, opts = {}) => new Paragraph({ spacing: { after: 120 }, ...opts, children: Array.isArray(t) ? t : [text(t)] });
  const heading = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 140 }, children: [text(t)] });
  const bullet = (t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [text(t)] });
  const muted = (t) => para([text(t, { color: MUTED, size: 18 })]);
  const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

  const table = (header, rows) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders,
      rows: [
        new TableRow({
          tableHeader: true,
          children: header.map((h) => new TableCell({ shading: { type: ShadingType.CLEAR, color: 'auto', fill: HEAD_FILL }, children: [new Paragraph({ children: [text(h, { bold: true, size: 18 })] })] })),
        }),
        ...rows.map((row) => new TableRow({ children: row.map((v) => new TableCell({ children: [new Paragraph({ children: [text(v, { size: 18 })] })] })) })),
      ],
    });

  const children = [
    new Paragraph({ children: [text('TRAVEL PICK · 결정 리포트', { color: MUTED, size: 18 })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [text(report.title, { bold: true, size: 44, color: INK })] }),
    muted(`만든 날짜 ${report.generatedAt}`),
  ];

  if (report.decision) {
    children.push(
      heading('최종 결정'),
      para([text(`${report.decision.name}`, { bold: true, size: 40, color: ACCENT }), text(report.decision.where ? `  ${report.decision.where}` : '', { color: MUTED }), text(report.decision.code ? `  ${report.decision.code}` : '', { color: MUTED })]),
      para([text(`${report.decision.status} · `, { bold: true }), text(report.decision.note)]),
    );
  }

  children.push(heading('1. 여행 조건'), table(['항목', '내용'], report.trip));
  children.push(heading('2. 후보'), table(['후보', report.tripType === 'overseas' ? '국가' : '시·도', '공항 코드', '추가 방법', '조사 기준'], report.candidates.map((c) => [c.name, c.where, c.code, c.source, c.basis])));
  children.push(heading('3. 기준과 가중치'), table(report.weights.header, report.weights.rows), ...report.weights.notes.map(muted));
  children.push(heading('4. 점수표'), muted('1~10점, 높을수록 좋음. 종합은 그룹 가중치로 계산한 0~100점.'), table(report.scores.header, report.scores.rows));

  children.push(heading('5. 결과'));
  if (report.ranking.length) children.push(table(['순위', '후보', '종합 점수', '상태'], report.ranking.map((r) => [String(r.rank), r.name, r.score, r.status])));
  else children.push(para('점수가 다 찬 후보가 2곳 미만이라 순위를 계산하지 못했어요.'));
  if (report.nearTie) children.push(para([text('1·2위 차이가 3% 이내로 사실상 동점이에요.', { color: ACCENT, bold: true })]));
  if (report.incomplete.length) children.push(muted(`점수 미완성: ${report.incomplete.join(', ')}`));
  for (const chart of report.charts) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
        children: [new ImageRun({ type: 'png', data: dataUrlBytes(chart.png), transformation: { width: 560, height: Math.round((560 * chart.height) / chart.width) }, altText: { title: chart.title, description: chart.alt, name: chart.title } })],
      }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [text(chart.title, { color: MUTED, size: 18 })] }),
    );
  }

  if (report.sensitivity.length) children.push(heading('6. 민감도'), ...report.sensitivity.map(bullet));
  if (report.consensus.length) children.push(heading('7. AI 합의 수준'), ...report.consensus.map(bullet));

  if (report.panel) {
    const pnl = report.panel;
    children.push(
      heading('8. AI 최종 심사'),
      para([text(`의장 ${pnl.chair} · ${pnl.depth} · `, { color: MUTED }), text(`최종 추천 ${pnl.chosen}`, { bold: true }), text(` · 토론 후 합의 ${pnl.consensus} · ${pnl.matchesCalculation ? '계산 결과와 일치' : '계산 결과와 다름'}`)]),
    );
    if (!pnl.matchesCalculation) children.push(para([text('계산 결과와 다른 이유: ', { bold: true, color: ACCENT }), text(pnl.reasonIfDifferent ?? '의장이 이유를 밝히지 않았어요.')]));
    children.push(...markdownToParagraphs(pnl.markdown).map((t) => para(t)));
    if (pnl.agreements.length) children.push(para([text('합의한 점', { bold: true })]), ...pnl.agreements.map(bullet));
    if (pnl.openIssues.length) children.push(para([text('남은 쟁점', { bold: true })]), ...pnl.openIssues.map(bullet));
    if (pnl.opinions.length) children.push(para([text('1라운드 독립 의견', { bold: true })]), table(['모델', '1위', '2위', '이유', '우려'], pnl.opinions.map((o) => [o.model, o.first, o.second ?? '—', o.reason, o.concerns])));
  }

  children.push(heading(`${report.panel ? 9 : 8}. 결정 전 확인 체크리스트`), ...report.checklist.map((c) => para(`${c.checked ? '☑' : '☐'}  ${c.text}`)), para([text(report.notice, { color: ACCENT })]));

  if (report.sources.length) {
    children.push(heading(`${report.panel ? 10 : 9}. 출처`), ...report.sources.map((s) => para([text(`${s.candidate} · ${s.item}  `, { size: 18, color: MUTED }), text(s.url, { size: 18 })], { spacing: { after: 60 } })));
  }
  children.push(muted(`AI 호출 ${report.cost.calls}회 · 실제 비용 $${report.cost.usd.toFixed(4)} · Travel Pick으로 만든 리포트예요. AI 정보는 틀릴 수 있으니 결정 전에 직접 확인하세요.`));

  return new Document({
    creator: 'Travel Pick',
    title: report.title,
    styles: {
      default: { document: { run: { font: FONT, size: 21, color: INK } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28, bold: true, color: INK } },
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 44, bold: true, color: INK } },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [text(`${report.title} · `, { size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED })] })] }) },
        children,
      },
    ],
  });
}

/** 브라우저: docx를 불러와 TravelPick_<프로젝트명>_<YYYYMMDD>.docx로 저장 */
export async function exportWord(report, { now = new Date() } = {}) {
  const docx = await import(DOCX_URL);
  const blob = await docx.Packer.toBlob(buildDocx(docx, report, docColors(token)));
  const filename = exportFileName(report.projectName, 'docx', now);
  downloadBlob(filename, blob);
  return filename;
}
