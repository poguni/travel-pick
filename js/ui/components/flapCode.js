// 공항 코드 / 한글 지명 표시 — DESIGN.md 6.4 FlapCode, "국내 여행지 표시"
import { h } from '../dom.js';

export const isAirportCode = (text) => /^[A-Z]{3}$/.test(text ?? '');

/**
 * 후보 → 표시할 글자. 해외는 공항 코드, 국내(또는 코드 없음)는 한글 지명.
 * place: { code, name } 또는 문자열
 */
export function placeLabel(place) {
  if (typeof place === 'string') return { text: place, ko: !isAirportCode(place) };
  if (isAirportCode(place?.code)) return { text: place.code, ko: false };
  return { text: place?.name ?? '', ko: true };
}

/** 1~4음절이고 공백이 없으면 음절별 타일, 그보다 길면 타일 없이 */
const tileable = (text) => !/\s/.test(text) && [...text].length <= 4;

/**
 * 스플릿 플랩 코드 (작은 표시: 순위표, 카드 등).
 * size: 라틴 기준 글자 크기(px). 한글은 CSS에서 약 80%로 줄인다.
 * tone: night(밤 카드 위) | raised(밤 바탕 위)
 * flip: true면 타일이 위→아래로 넘어가며 나타난다(순위가 바뀐 자리, DESIGN 10장)
 */
export function flapCode(place, { size = 20, tone = 'night', dim = false, flip = false } = {}) {
  const { text, ko } = placeLabel(place);
  const tiles = tileable(text);
  return h(
    'span',
    {
      class: ['flap', ko && 'flap--ko', !tiles && 'flap--plain', `flap--${tone}`, dim && 'flap--dim', flip && 'flap--flip'],
      style: { '--flap-size': `${size}px` },
    },
    tiles
      ? [...[...text].map((ch, i) => h('span', { class: 'flap__tile', 'aria-hidden': 'true', style: { '--i': i } }, ch)), h('span', { class: 'visually-hidden' }, text)]
      : text,
  );
}

/**
 * 큰 코드 글자 (탑승권, 엽서, 최종 추천): Bricolage 800 / 한글은 Plex KR 700, 약 80% 크기
 */
export function codeText(place, { size = 84, className, flip = false } = {}) {
  const { text, ko } = placeLabel(place);
  return h('span', { class: ['code', ko && 'code--ko', flip && 'code--flip', className], style: { '--code-size': `${size}px` } }, text);
}
