// Chart.js 로더와 공통 설정 — DESIGN.md 6.13
// Chart.js 4는 CDN의 UMD 파일을 정확한 버전으로 고정해 처음 필요할 때만 불러온다.

export const CHART_JS_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.js';

let loading = null;

export function loadChart() {
  if (window.Chart) return Promise.resolve(window.Chart);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHART_JS_URL;
    script.onload = () => {
      applyDefaults(window.Chart);
      resolve(window.Chart);
    };
    script.onerror = () => {
      loading = null;
      reject(new Error('차트 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));
    };
    document.head.append(script);
  });
  return loading;
}

/** CSS 토큰 값 읽기 (Canvas는 CSS 변수를 직접 못 쓰므로) */
export function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

/** '#RRGGBB' + 투명도 → 'rgba(...)' */
export function withAlpha(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function applyDefaults(Chart) {
  Chart.defaults.font.family = "'IBM Plex Sans KR', sans-serif";
  Chart.defaults.color = token('text-2');
  Chart.defaults.borderColor = token('line');
  Chart.defaults.plugins.legend.display = false; // 범례는 HTML로 직접 (DESIGN 6.13)
  Chart.defaults.animation.duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400;
  Chart.defaults.maintainAspectRatio = false;
}

const live = new Map();

/**
 * 차트 그리기. 같은 key의 이전 차트는 먼저 없앤다(화면을 다시 그려도 메모리가 쌓이지 않게).
 * canvas가 아직 문서에 없으면(화면이 바뀜) 그리지 않는다.
 */
export async function mountChart(key, canvas, makeConfig) {
  let Chart;
  try {
    Chart = await loadChart();
  } catch (err) {
    canvas.replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: err.message }));
    return null;
  }
  live.get(key)?.destroy();
  live.delete(key);
  if (!canvas.isConnected) return null;
  const chart = new Chart(canvas, makeConfig());
  live.set(key, chart);
  return chart;
}
