# Travel Pick — 프로젝트 지침

## 기준 문서
- 기능: docs/Travel-Pick-PRD.md (v0.3). 시각 디자인: design/DESIGN.md. 시안: design/Travel-Pick-Design-Mockup.html
- 진행 계획: docs/Travel-Pick-Implementation-Plan.md (Phase 단위로 진행)
- 새로 작성하는 문서는 docs/에 둔다. 디자인 관련 파일은 design/에 그대로 둔다.

## 구조 규칙
- 빌드 없는 ES 모듈. 로컬 확인은 `npm run serve`(python -m http.server 8000). file:// 로는 열리지 않는다.
- js/core/ 는 DOM·localStorage·fetch를 직접 쓰지 않는 순수 함수만 둔다(저장소는 주입). 여기는 반드시 테스트를 쓴다.
- 의존 방향: screens → ui → selectors → core. core는 다른 폴더를 import하지 않는다.
- CSS 색은 css/tokens.css의 변수만 쓴다. 새 색을 만들지 않는다(DESIGN.md 14장). tokens.css는 DESIGN.md 3장과 같아야 한다(tests/smoke.test.js가 검사).
- 외부 라이브러리는 CDN 정확한 버전 고정. 내보내기 라이브러리는 동적 import로 지연 로딩.

## 동작 규칙
- localStorage 키 접두사 `travelpick:`. API 키는 프로젝트 데이터·내보내기 파일에 절대 넣지 않는다.
- AI 출력은 DOMPurify로 정화한 뒤에만 innerHTML에 넣는다. 그 밖의 사용자·AI 문자열은 textContent로 넣는다.
- 모든 AI 호출은 js/ai/runner.js를 거친다(비용 확인 창 → 실행 → 실제 비용 기록).
- 한 프로젝트는 국내(domestic) 또는 해외(overseas) 한쪽만 다룬다. 국내 여행지는 공항 코드 대신 한글 지명을 표시한다(DESIGN.md 6.4).
- UI 문구는 한국어, word-break: keep-all.

## 완료 기준
- `npm test` 통과.
- 화면 변경은 Playwright로 데스크톱(1440px)·모바일(390px) 스크린샷을 찍어 시안과 비교.
- 콘솔 오류 없음.
- Phase가 끝나면 변경 요약과 함께 커밋.
