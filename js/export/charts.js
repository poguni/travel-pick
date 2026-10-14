// 리포트용 차트 PNG — Implementation Plan Phase 12 (Chart.js toBase64Image)
// 종이(흰 바탕) 위에 놓이므로 글자·선 색을 종이용 토큰으로 바꾸고 바탕을 채워서 그린다.
import { loadChart, token, withAlpha } from '../ui/charts.js';
import { resultsFor } from '../selectors.js';

const W = 760;
const H = 460;

const paperBg = { id: 'paperBg', beforeDraw: (chart) => {
  const { ctx } = chart;
  ctx.save();
  ctx.fillStyle = token('paper');
  ctx.fillRect(0, 0, chart.width, chart.height);
  ctx.restore();
} };

async function draw(Chart, config) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  // Chart.js가 크기를 읽을 수 있도록 화면 밖에 잠깐 붙인다
  const holder = Object.assign(document.createElement('div'), { style: `position:fixed;left:-10000px;top:0;width:${W}px;height:${H}px` });
  holder.append(canvas);
  document.body.append(holder);
  const chart = new Chart(canvas, { ...config, plugins: [paperBg], options: { ...config.options, responsive: false, animation: false, devicePixelRatio: 2 } });
  const png = chart.toBase64Image('image/png', 1);
  chart.destroy();
  holder.remove();
  return png;
}

const cache = new Map();

/**
 * 리포트 차트 2개: 종합 점수 막대, 상위 후보 기준별 점수 레이더. 점수가 부족하면 빈 배열.
 * 같은 점수·가중치면 다시 그리지 않는다.
 */
export async function reportCharts(data) {
  const r = resultsFor(data);
  if (r.ranking.length < 2) return [];
  const key = JSON.stringify([r.totals, r.vector, data.candidates.map((c) => [c.name, c.color])]);
  if (cache.has(key)) return cache.get(key);

  const Chart = await loadChart();
  const ink = token('ink');
  const grid = token('paper-line');
  const font = { family: "'IBM Plex Sans KR', sans-serif", size: 22 };
  const colorOf = (c) => token(`c${(c.color ?? 0) + 1}`);
  const ranked = r.ranking.map((x) => data.candidates[x.index]);

  const bar = await draw(Chart, {
    type: 'bar',
    data: { labels: ranked.map((c) => c.name), datasets: [{ data: r.ranking.map((x) => x.score), backgroundColor: ranked.map(colorOf), borderRadius: 6, maxBarThickness: 64 }] },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: ink, font }, grid: { display: false } },
        y: { min: 0, max: 100, ticks: { color: ink, font }, grid: { color: grid } },
      },
    },
  });

  const top = ranked.slice(0, 3);
  const radar = await draw(Chart, {
    type: 'radar',
    data: {
      labels: data.criteria.map((k) => k.name),
      datasets: top.map((c) => ({
        label: c.name,
        data: r.matrix[data.candidates.indexOf(c)],
        borderColor: colorOf(c),
        backgroundColor: withAlpha(colorOf(c), 0.15),
        borderWidth: 3,
        pointRadius: 3,
        pointBackgroundColor: colorOf(c),
      })),
    },
    options: {
      plugins: { legend: { display: true, position: 'bottom', labels: { color: ink, font, boxWidth: 18 } } },
      scales: { r: { min: 0, max: 10, ticks: { display: false, stepSize: 2 }, grid: { color: grid }, angleLines: { color: grid }, pointLabels: { color: ink, font } } },
    },
  });

  const charts = [
    { title: '종합 점수 (그룹 가중치, 0~100)', alt: ranked.map((c, i) => `${c.name} ${r.ranking[i].score.toFixed(1)}점`).join(', '), png: bar, width: W, height: H },
    { title: `기준별 점수 비교 · 상위 ${top.length}곳`, alt: top.map((c) => `${c.name}: ${data.criteria.map((k, j) => `${k.name} ${r.matrix[data.candidates.indexOf(c)][j]}`).join(', ')}`).join(' / '), png: radar, width: W, height: H },
  ];
  cache.set(key, charts);
  return charts;
}
