// AI Markdown 표시 — PRD 8장(marked + DOMPurify), CLAUDE.md "AI 출력은 DOMPurify로 정화한 뒤에만 innerHTML"
// 라이브러리는 처음 필요할 때 동적 import로 불러오고, 변환 결과는 원문별로 기억한다.
import { h } from './dom.js';

export const MARKED_URL = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js';
export const DOMPURIFY_URL = 'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.es.mjs';

let libs = null;
const cache = new Map();

function load() {
  libs ??= Promise.all([import(MARKED_URL), import(DOMPURIFY_URL)]).then(([m, p]) => ({ marked: m.marked, purify: p.default }));
  return libs;
}

/** Markdown → 정화한 HTML 문자열 */
export async function renderMarkdown(md) {
  if (cache.has(md)) return cache.get(md);
  const { marked, purify } = await load();
  const html = purify.sanitize(marked.parse(md, { gfm: true, breaks: true }), { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'img', 'form', 'input'], FORBID_ATTR: ['style'] });
  cache.set(md, html);
  return html;
}

/**
 * Markdown 블록. 아직 변환 전이면 원문을 글자로 먼저 보여 주고, 변환되면 그 자리에서 바꾼다.
 * 링크는 새 창으로 연다.
 */
export function markdownBlock(md, { className = 'md' } = {}) {
  const el = h('div', { class: className });
  const fill = (html) => {
    el.innerHTML = html; // DOMPurify로 정화한 결과만
    el.querySelectorAll('a[href]').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
  };
  if (cache.has(md)) fill(cache.get(md));
  else {
    el.textContent = md;
    renderMarkdown(md)
      .then(fill)
      .catch(() => {
        /* 불러오기 실패: 원문 글자 그대로 둔다 */
      });
  }
  return el;
}
