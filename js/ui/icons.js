// 인라인 SVG 아이콘 — DESIGN.md 8장. 선 1.7px, round cap/join, 색은 currentColor.
// 모든 모양은 이 파일의 상수만 쓰므로 template 파싱이 안전하다.

const STROKE = {
  check: '<path d="M3.5 8.4l3 3 6-6.4"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  arrowRight: '<path d="M3 8h10M9 4l4 4-4 4"/>',
  refresh: '<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"/>',
  chevronDown: '<path d="M4 6l4 4 4-4"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7"/>',
  warning: '<path d="M8 2.2l6.3 11H1.7z"/><path d="M8 6.6v3M8 11.6v.01"/>',
};

const PLANE =
  '<path d="M0 6 L14 6 L20 0 L23 0 L19 6 L26 6 L29 3 L31 3 L29 7 L31 11 L29 11 L26 8 L19 8 L23 14 L20 14 L14 8 L0 8 Z"/>';

const LOGO =
  '<circle class="logo__ring" cx="17" cy="17" r="15.5" stroke-width="1.5"/>' +
  '<path class="logo__path" d="M7 22 C 12 10, 22 8, 27 12" stroke-width="1.5" stroke-dasharray="2 3" stroke-linecap="round"/>' +
  '<circle class="logo__dot" cx="27" cy="12" r="3"/><circle class="logo__origin" cx="7" cy="22" r="2"/>';

function parse(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup;
  return t.content.firstElementChild;
}

function finish(svg, label) {
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  svg.setAttribute('focusable', 'false');
  return svg;
}

/** 선 아이콘: icon('check', { size: 14 }) */
export function icon(name, { size = 16, label } = {}) {
  const svg = parse(
    `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${STROKE[name]}</svg>`,
  );
  return finish(svg, label);
}

/** 비행기(채움, 탑승권 전용) */
export function planeIcon({ width = 31, label } = {}) {
  const svg = parse(
    `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon--plane" width="${width}" height="${(width * 14) / 31}" viewBox="0 0 31 14" fill="currentColor">${PLANE}</svg>`,
  );
  return finish(svg, label);
}

/** 로고: 원 안의 점선 비행 경로 + 오렌지 점 (DESIGN.md 6.1) */
export function logoMark({ size = 36 } = {}) {
  const svg = parse(
    `<svg xmlns="http://www.w3.org/2000/svg" class="logo" width="${size}" height="${size}" viewBox="0 0 34 34" fill="none">${LOGO}</svg>`,
  );
  return finish(svg);
}

export const ICON_NAMES = Object.keys(STROKE);
