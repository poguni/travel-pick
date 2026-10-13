// 01 출발 안내판 (홈) — Phase 3: 프로젝트 탑승권 요약까지. 순위표 등은 Phase 4·6에서.
import { h } from '../ui/dom.js';
import { screenHeader, emptyState, dashedCard } from '../ui/components/basic.js';
import { boardingPass } from '../ui/components/boardingPass.js';
import {
  originLabel,
  periodLong,
  durationText,
  companionText,
  familyDetailText,
  budgetText,
} from '../ui/format.js';

/** 프로젝트 데이터 → 탑승권 (DESIGN.md 6.2) */
export function projectPass(data) {
  const p = data.project;
  const pax = p.travelers ?? data.members.length;
  const n = data.candidates.length;
  const created = p.createdAt.slice(0, 10).split('-');
  const undecided = (text) => (text === '미정' ? 'TBD · AI가 추천 시기 제시' : null);
  return boardingPass({
    tripType: p.tripType,
    serial: `TP-${created[0]}-${created[1]}${created[2]}`,
    origin: { text: originLabel(p), caption: `${p.origin} 출발` },
    dest: { pending: true, caption: n ? `후보 ${n}곳 중 결정 중` : '후보를 모으는 중' },
    info: [
      { label: 'DEPART', value: periodLong(p.period), sub: undecided(periodLong(p.period)) },
      { label: 'DURATION', value: durationText(p.period), sub: p.period.dayTrip ? null : undecided(durationText(p.period)) },
      { label: 'PASSENGERS', value: companionText(p.companion, pax), sub: familyDetailText(p.companion) },
      { label: 'BUDGET / PAX', value: budgetText(p.budgetPerPerson) },
    ],
    stub: { label: 'NOW LEADING · 현재 선두', place: null },
  });
}

export function renderHome({ data }) {
  if (!data) {
    return {
      node: h(
        'div',
        { class: 'screen' },
        screenHeader({ eyebrow: 'DEPARTURES · 출발 안내판', title: '어디로 떠나 볼까요?' }),
        emptyState({
          title: '아직 여행 프로젝트가 없어요',
          desc: '새 프로젝트 만들기와 JSON 불러오기는 Phase 4에서 연결합니다.',
        }),
      ),
    };
  }
  return {
    node: h(
      'div',
      { class: 'screen' },
      screenHeader({ eyebrow: 'DEPARTURES · 출발 안내판', title: data.candidates.length ? '어디로 떠날지 고르는 중이에요' : '어디로 떠나 볼까요?' }),
      projectPass(data),
      dashedCard({
        eyebrow: 'COMING UP · PHASE 4·6',
        title: '후보 순위표, 가중치 나침반, 탑승객별 1순위가 이 아래에 놓입니다',
      }),
    ),
  };
}
