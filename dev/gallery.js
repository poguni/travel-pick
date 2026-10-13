// 컴포넌트 갤러리 — 시안 08(디자인 토큰) 화면과 비교용. 배포 대상 아님.
import { h, mount } from '../js/ui/dom.js';
import { icon, planeIcon, logoMark, ICON_NAMES } from '../js/ui/icons.js';
import { button, statusPill, chip, segmented, screenHeader, dashedCard, emptyState, skeleton, panel } from '../js/ui/components/basic.js';
import { flapCode, codeText } from '../js/ui/components/flapCode.js';
import { modelBadge, consensusDots, passportStamp, MODEL_KEYS } from '../js/ui/components/ai.js';
import { memberAvatar, memberSwitcher } from '../js/ui/components/member.js';
import { boardingPass } from '../js/ui/components/boardingPass.js';
import { stepList, routeNav } from '../js/ui/components/routeNav.js';

const sec = (title, ...children) => h('section', { class: 'g-sec' }, h('h2', null, title), children);
const row = (...children) => h('div', { class: 'g-row' }, children);
const item = (caption, ...children) => h('div', { class: 'g-item' }, children, h('span', { class: 'g-cap' }, caption));

const swatches = ['night', 'surface', 'surface-2', 'surface-3', 'raised', 'line', 'text-muted', 'paper', 'paper-stub', 'ink', 'sunset', 'sunset-ink', 'ok', 'info'];
const members = [
  { id: 'm1', name: '나' },
  { id: 'm2', name: '배우자' },
  { id: 'm3', name: '첫째' },
  { id: 'm4', name: '둘째' },
];

mount(
  document.getElementById('gallery'),

  h(
    'header',
    { class: 'g-head' },
    h('div', null, h('span', { class: 'eyebrow' }, 'DESIGN TOKENS · v1 · 구현'), h('h1', null, 'Night Departure')),
    h('p', { class: 'muted', style: { maxWidth: '460px', fontSize: '15px' } }, 'js/ui/components 의 실제 컴포넌트를 렌더링한 페이지입니다. 시안 08 화면과 나란히 비교합니다.'),
  ),

  sec(
    'COLOR',
    row(swatches.map((t) => h('div', { class: 'g-swatch' }, h('span', { style: { background: `var(--${t})` } }), h('span', { class: 'g-cap' }, t)))),
    row(Array.from({ length: 8 }, (_, i) => h('span', { class: 'chip chip--filter', style: { background: `var(--c${i + 1})`, color: 'var(--night)', fontWeight: 700 } }, `C${i + 1}`))),
    row(Array.from({ length: 7 }, (_, i) => h('span', { style: { width: '64px', height: '28px', borderRadius: '6px', background: `var(--k${i + 1})` } }))),
  ),

  sec(
    'BUTTONS · 6.16',
    row(
      button({ variant: 'primary', label: 'AI 최종 심사 시작', next: true }),
      button({ variant: 'primary', label: '다시 추천받기', iconName: 'refresh' }),
      button({ variant: 'secondary', label: '리포트 내보내기' }),
      button({ variant: 'paper', label: '종이 버튼' }),
      button({ variant: 'outline', label: '예상 비용 보기' }),
      button({ variant: 'icon', label: '메뉴 열기', iconName: 'menu' }),
      button({ variant: 'primary', label: '비활성', disabled: true }),
    ),
    h('div', { class: 'g-paper' }, button({ variant: 'ink', label: '15회 실행하기' }), button({ variant: 'paper-line', label: '취소' })),
  ),

  sec(
    'FLAP CODE · 6.4 (해외 공항 코드 / 국내 한글 지명)',
    row(
      item('OKA · raised', flapCode('OKA', { size: 26, tone: 'raised' })),
      item('강릉 · 2음절', flapCode({ code: null, name: '강릉' }, { size: 26, tone: 'raised' })),
      item('울릉도 · 3음절', flapCode({ name: '울릉도' }, { size: 26, tone: 'raised' })),
      item('변산반도 · 4음절', flapCode({ name: '변산반도' }, { size: 26, tone: 'raised' })),
      item('보성녹차밭 · 5음절 → 타일 없음', flapCode({ name: '보성녹차밭' }, { size: 26, tone: 'raised' })),
      item('순위표 크기 20 · night', h('span', { class: 'panel', style: { padding: '12px' } }, row(flapCode('TPE'), flapCode({ name: '경주' }), flapCode('BKI', { dim: true })))),
    ),
    row(
      item('큰 코드 84 (탑승권)', codeText('ICN', { size: 84 })),
      item('한글 84 → 약 67px', codeText({ name: '제주' }, { size: 84 })),
      item('엽서 54', h('span', { class: 'g-sea' }, passportStamp(3), h('span', { style: { position: 'absolute', left: '22px', bottom: '16px', color: 'var(--paper)' } }, codeText({ name: '강릉' }, { size: 54 })))),
    ),
  ),

  sec(
    'STATUS · CHIPS · 6.5',
    row(statusPill('lead'), statusPill('contend'), statusPill('review')),
    h('div', { class: 'chip-row' }, chip('가족 4명 · 아이 동반'), chip('2월 · 5박 6일'), chip('국내'), chip('시기 미정'), chip('제외 · 가 본 곳 2', { variant: 'exclude' })),
    h('div', { class: 'g-paper' }, chip('신규 노선 증편', { variant: 'paper' }), chip('추천 시기 · 10월', { variant: 'paper' }), chip('확인 필요', { variant: 'paper-warn' })),
  ),

  sec(
    'SEGMENTED · 6.9',
    row(
      segmented({ label: '입력 방식', options: [{ value: 'simple', label: '단순 슬라이더' }, { value: 'ahp', label: 'AHP 쌍대비교' }], value: 'ahp' }),
      segmented({ label: '여행 종류', options: [{ value: 'overseas', label: '해외 여행' }, { value: 'domestic', label: '국내 여행' }], value: 'domestic' }),
      segmented({ label: '토론 깊이', options: [{ value: 'fast', label: '빠르게 · 4회' }, { value: 'deep', label: '꼼꼼하게 · 7회' }], value: 'deep' }),
    ),
  ),

  sec(
    'AI MODELS · 6.6 · 6.7',
    row(
      modelBadge('claude', { role: 'chair' }),
      modelBadge('gpt'),
      modelBadge('gemini', { role: 'dissent' }),
      modelBadge('claude', { size: 30, withName: false }),
    ),
    row(
      item('밤 위', row(consensusDots(MODEL_KEYS), consensusDots(['claude', 'gpt']), consensusDots(['gemini']))),
      item('종이 위', h('div', { class: 'g-paper', style: { padding: '14px 18px' } }, consensusDots(['claude', 'gpt', 'gemini'], { paper: true }), consensusDots(['gpt'], { paper: true }))),
      item('여권 도장 3/3 · 2/3 · 1/3', h('div', { class: 'g-sea', style: { width: 'auto', height: 'auto', gap: '16px' } }, passportStamp(3, { rotate: -14 }), passportStamp(2, { rotate: 9 }), passportStamp(1, { rotate: 11 }))),
    ),
  ),

  sec(
    'MEMBERS · 6.10',
    row(members.map((m, i) => memberAvatar(m, i))),
    memberSwitcher({ members, activeId: 'm1', statuses: { m2: 'done', m3: 'done', m4: 'waiting' }, onGroup: () => {} }),
  ),

  sec(
    'BOARDING PASS · 6.2 (해외)',
    boardingPass({
      tripType: 'overseas',
      serial: 'TP-2027-0206',
      origin: { text: 'ICN', caption: '인천 출발' },
      dest: { pending: true, caption: '후보 5곳 중 결정 중' },
      info: [
        { label: 'DEPART', value: '2027.02.06' },
        { label: 'DURATION', value: '5박 6일' },
        { label: 'PASSENGERS', value: '가족 4명', sub: '아이 동반' },
        { label: 'BUDGET / PAX', value: '150만 원' },
      ],
      stub: { label: 'NOW LEADING · 현재 선두', place: { code: 'OKA', name: '오키나와' }, caption: '오키나와 · 일본', score: 82.4, scoreNote: '/ 100 · 2위와 3.5점 차' },
    }),
  ),

  sec(
    'BOARDING PASS · 국내 + 미정 변형',
    boardingPass({
      tripType: 'domestic',
      serial: 'TP-2026-1013',
      origin: { text: '서울', caption: '서울 출발' },
      dest: { pending: true, caption: '후보 4곳 중 결정 중' },
      info: [
        { label: 'DEPART', value: '미정', sub: 'TBD · AI가 추천 시기 제시' },
        { label: 'DURATION', value: '미정', sub: 'TBD · AI가 추천 시기 제시' },
        { label: 'PASSENGERS', value: '연인·부부 2명' },
        { label: 'BUDGET / PAX', value: '50만 원' },
      ],
      stub: { label: 'NOW LEADING · 현재 선두', place: { name: '강릉' }, caption: '강릉 · 강원', score: 79.2, scoreNote: '/ 100 · 2위와 1.8점 차' },
    }),
  ),

  sec(
    'PANELS · EMPTY · SKELETON · 5.2 · 11장',
    row(
      h('div', { style: { flex: '1 1 320px' } }, panel({ title: '후보 순위', meta: '그룹 가중치 기준', children: [skeleton({ lines: 4 })] })),
      h('div', { style: { flex: '1 1 320px' } }, panel({ title: '일관성 비율', paper: true, children: [h('p', null, '종이 패널: 확정 정보·결론에만')] })),
    ),
    dashedCard({ eyebrow: 'NEXT GATE · 07', title: '세 AI가 서로의 의견을 반박한 뒤, 의장 모델이 최종 결론을 정리합니다', desc: '꼼꼼하게 3라운드 · 7회 호출 · 예상 $ 0.xx', action: button({ variant: 'outline', label: '예상 비용 보기' }) }),
    emptyState({ title: '아직 후보가 없어요', desc: 'AI에게 요즘 떠오르는 여행지를 추천받아 보세요.', action: button({ variant: 'primary', label: 'AI 추천받기' }) }),
  ),

  sec(
    'HEADER · ICONS · ROUTE NAV',
    screenHeader({ eyebrow: 'GATE 02 · DISCOVER', title: ['세 AI가 고른,', '요즘 떠오르는 국내 가족 여행지'], actions: [button({ variant: 'primary', label: '다시 추천받기', iconName: 'refresh' })], below: h('div', { class: 'chip-row' }, chip('국내'), chip('가족 4명 · 아이 동반'), chip('시기 미정')) }),
    row(ICON_NAMES.map((n) => item(n, icon(n, { size: 18 }))), item('plane', h('span', { style: { color: 'var(--m-claude-ink)' } }, planeIcon())), item('logo', logoMark())),
    row(
      h(
        'div',
        { class: 'g-nav' },
        routeNav({
          route: 'weights',
          done: { conditions: true, candidates: true, research: true },
          project: { name: '2027 설 연휴 가족여행', summary: 'ICN · FEB · 4 PAX' },
          cost: { usd: 1.234, usdKrw: 1400, models: [{ key: 'claude', name: 'Claude Sonnet 5.5', enabled: true }, { key: 'gpt', name: 'GPT-6 Luna', enabled: true }, { key: 'gemini', name: 'Gemini 3.8 Flash', enabled: false }] },
        }),
      ),
      item('홈에서 본 단계: 다음 단계에 NEXT', h('div', { class: 'g-nav', style: { padding: '16px' } }, stepList({ route: 'home', done: { conditions: true, candidates: true, research: true, weights: true, scores: true, results: true } }))),
    ),
  ),
);
