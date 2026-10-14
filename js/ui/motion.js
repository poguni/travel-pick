// 모션 도우미 — DESIGN.md 10장
// 화면은 상태가 바뀔 때마다 통째로 다시 그리므로, "값이 실제로 바뀌었을 때"만 움직이도록 지난 값을 기억한다.
// prefers-reduced-motion: reduce면 모든 이동·회전을 끄고 즉시 바꾼다(CSS는 base.css에서 함께 끔).

const seen = new Map();

export const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** key의 값이 지난번과 다른가. 처음 보는 key는 false(첫 화면에서 모두 움직이지 않게). 기록은 갱신 */
export function changed(key, value) {
  const had = seen.has(key);
  const prev = seen.get(key);
  seen.set(key, value);
  return had && prev !== value && !reducedMotion();
}

/** 처음 보는 key인가 (새로 도착한 카드 등장용) */
export function firstSeen(key) {
  if (seen.has(key)) return false;
  seen.set(key, true);
  return !reducedMotion();
}

/**
 * 점수 숫자: 지난 값에서 새 값으로 400ms 카운트 (10장). 처음이거나 같으면 바로 표시.
 * el의 글자를 format(value)로 채우고 el을 돌려준다.
 */
export function countTo(el, key, value, format, duration = 400) {
  const k = `count:${key}`;
  const prev = seen.get(k);
  seen.set(k, value);
  el.textContent = format(value);
  if (prev == null || prev === value || reducedMotion() || typeof requestAnimationFrame !== 'function') return el;
  const start = performance.now();
  const ease = (t) => 1 - (1 - t) ** 3;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = format(prev + (value - prev) * ease(t));
    if (t < 1 && el.isConnected) requestAnimationFrame(step);
    else el.textContent = format(value);
  };
  el.textContent = format(prev);
  requestAnimationFrame(step);
  return el;
}
