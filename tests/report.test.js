// 결정 리포트·Word·백업 권유 — PRD F13-4·5·7·8, 5.6. Implementation Plan Phase 12
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as docx from 'docx';
import JSZip from 'jszip';
import { createProject } from '../js/core/schema.js';
import { addCandidate, addMember, backupDue } from '../js/core/project.js';
import { setScore } from '../js/core/scores.js';
import { saveResearchResults, researchKey } from '../js/core/research.js';
import { startPanel, saveRound, sanitizeOpinion, sanitizeVerdict, toggleCheck, choose } from '../js/core/panel.js';
import { buildReport, markdownToParagraphs } from '../js/export/report.js';
import { buildDocx, docColors, dataUrlBytes } from '../js/export/word.js';

const tokens = readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8');
const readToken = (name) => tokens.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))[1];
// 1×1 투명 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function project({ panel = true, decide = true } = {}) {
  const d = createProject({ id: 'p', name: '설 연휴 가족여행' });
  addMember(d, '배우자');
  addCandidate(d, { name: '오키나와', country: '일본', code: 'OKA', plannedPeriod: 'month:2' });
  addCandidate(d, { name: '타이베이', country: '대만', code: 'TPE' });
  d.criteria.forEach((k, j) => {
    setScore(d, d.candidates[0].id, k.id, 8);
    setScore(d, d.candidates[1].id, k.id, j === 0 ? 9 : 6);
  });
  const a = d.candidates[0];
  const src = (u) => ({ value: 'v', sources: [u] });
  saveResearchResults(d, [{ model: 'claude', ok: true, meta: { candidateId: a.id }, value: { items: { weather: src('https://a.com/1'), food: src('https://a.com/1'), safety: src('https://b.com/2') } }, citations: [] }], { keys: { [a.id]: researchKey(d.project, a) }, at: 't' });
  if (panel) {
    const map = { c1: a.id, c2: d.candidates[1].id };
    startPanel(d, { depth: 'fast', anonymized: true, chair: 'claude', key: 'k', at: 't' });
    saveRound(d, 'r1', [{ model: 'claude', ok: true, value: { first: 'c1', second: 'c2', reason: '이유', concerns: '우려' } }], (v) => sanitizeOpinion(v, map), { at: 't' });
    saveRound(d, 'r3', [{ model: 'claude', ok: true, value: { markdown: '**오키나와** 추천\n\n- 근거 하나', summary: { chosen: 'c1', consensus: 1, agreements: ['안전'], openIssues: ['날씨'], checklist: ['항공권 검색', '숙소 취소 기한'], reasonIfDifferent: null } } }], (v) => sanitizeVerdict(v, map, 1), { at: 't' });
    toggleCheck(d, 0, true);
  }
  if (decide) choose(d, a.id);
  d.aiRuns.push({ feature: 'panel', model: 'claude', actual: { usd: 0.0123 } });
  return d;
}

describe('리포트 데이터 (F13-4·5)', () => {
  test('결정·여행 조건·후보·가중치·점수표·순위', () => {
    const r = buildReport(project(), { now: new Date(2026, 9, 14) });
    assert.equal(r.title, '설 연휴 가족여행 결정 리포트');
    assert.equal(r.generatedAt, '2026.10.14');
    assert.equal(r.decision.name, '오키나와');
    assert.equal(r.decision.status, '확정');
    assert.deepEqual(r.trip[0], ['여행 종류', '해외 여행']);
    assert.equal(r.candidates[0].basis, '2월 · 미정');
    assert.deepEqual(r.weights.header, ['기준', '그룹', '나', '배우자']);
    assert.equal(r.scores.rows[0].at(-1), '80.0');
    assert.equal(r.ranking[0].name, '오키나와');
    assert.equal(r.ranking[0].status, '유력');
  });
  test('민감도 문장, AI 심사 요약, 체크리스트(심사 + 고정 항목), 공식 기관 문구 (5.6)', () => {
    const r = buildReport(project());
    assert.ok(r.sensitivity.length >= 1);
    assert.match(r.sensitivity[0], /비용 가중치가 \d+%를 넘으면 1위가 타이베이로 바뀝니다/);
    assert.equal(r.panel.chosen, '오키나와');
    assert.equal(r.panel.matchesCalculation, true);
    assert.equal(r.panel.opinions[0].model, 'Claude Sonnet 5.5');
    assert.deepEqual(r.checklist.slice(0, 2), [{ text: '항공권 검색', checked: true }, { text: '숙소 취소 기한', checked: false }]);
    assert.ok(r.checklist.some((c) => /외교부 해외안전여행/.test(c.text)), '해외는 공식 기관 확인 항목');
    assert.match(r.notice, /외교부/);
  });
  test('출처는 중복 없이, 결정 전·심사 없음도 만든다', () => {
    const r = buildReport(project({ panel: false, decide: false }));
    assert.deepEqual(r.sources.map((s) => s.url), ['https://a.com/1', 'https://b.com/2']);
    assert.equal(r.decision.status, '결정 전');
    assert.equal(r.panel, null);
    assert.equal(r.checklist.length, 3, '고정 항목만');
  });
  test('국내 리포트는 국내 확인 문구', () => {
    const d = createProject({ id: 'p', tripType: 'domestic' });
    addCandidate(d, { name: '강릉', region: '강원' });
    const r = buildReport(d);
    assert.match(r.notice, /기상청/);
    assert.ok(!r.checklist.some((c) => /외교부|비자/.test(c.text)));
    assert.equal(r.decision, null, '순위가 없으면 결정 칸 없음');
  });
  test('API 키가 들어가지 않는다', () => {
    assert.ok(!/sk-or|apikey/i.test(JSON.stringify(buildReport(project()))));
  });
  test('Markdown → Word 문단', () => {
    assert.deepEqual(markdownToParagraphs('**굵게** 문장\n\n- 항목 [링크](https://x.com)\n<b>태그</b>'), ['굵게 문장', '• 항목 링크 (https://x.com)', '태그']);
  });
});

describe('Word(docx) 파일 구조 (F13-4)', () => {
  async function unzip(report) {
    const buf = await docx.Packer.toBuffer(buildDocx(docx, report, docColors(readToken)));
    return JSZip.loadAsync(buf);
  }
  test('표·제목·한글 글꼴·차트 이미지가 들어간다', async () => {
    const report = { ...buildReport(project()), charts: [{ title: '종합 점수', alt: '오키나와 80점', png: PNG, width: 900, height: 500 }] };
    const zip = await unzip(report);
    const xml = await zip.file('word/document.xml').async('string');
    assert.ok(xml.includes('설 연휴 가족여행 결정 리포트'));
    assert.ok(xml.includes('계산 결과와 일치'));
    assert.ok(xml.includes('☑  항공권 검색'));
    assert.ok((xml.match(/<w:tbl>/g) ?? []).length >= 6, '표 6개 이상');
    assert.ok(xml.includes('<w:drawing>'), '차트 이미지');
    assert.ok(Object.keys(zip.files).some((f) => /^word\/media\/.+\.png$/.test(f)));
    const styles = await zip.file('word/styles.xml').async('string');
    assert.ok(styles.includes('맑은 고딕'), '한글 글꼴(eastAsia)');
    assert.ok(styles.includes(readToken('ink').slice(1).toUpperCase()), '글자색은 토큰 값');
    assert.ok(!xml.includes('sk-or'));
  });
  test('data URL → 바이트', () => {
    const bytes = dataUrlBytes(PNG);
    assert.deepEqual([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join(''), 'PNG');
  });
});

describe('백업 권유 (F13-8)', () => {
  test('마지막 백업(없으면 만든 날) 뒤로 7일이 지나면', () => {
    const now = new Date('2026-10-14T00:00:00Z');
    assert.equal(backupDue({ createdAt: '2026-10-10T00:00:00Z', lastBackupAt: null }, now), false);
    assert.equal(backupDue({ createdAt: '2026-10-01T00:00:00Z', lastBackupAt: null }, now), true);
    assert.equal(backupDue({ createdAt: '2026-09-01T00:00:00Z', lastBackupAt: '2026-10-08T00:00:00Z' }, now), false);
    assert.equal(backupDue({ createdAt: '2026-09-01T00:00:00Z', lastBackupAt: '2026-10-07T00:00:00Z' }, now), true, '정확히 7일');
  });
});
