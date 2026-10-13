# Travel Pick 구현 계획

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0 |
| 작성일 | 2026-10-13 |
| 기준 문서 | `docs/Travel-Pick-PRD.md`(PRD v0.3), `design/DESIGN.md`, `design/Travel-Pick-Design-Mockup.html` |
| 사용법 | 2장의 결정 사항과 3장의 구조를 먼저 확인합니다. 그다음 6장의 Phase를 순서대로 진행하면서 각 Phase의 **프롬프트**를 Claude Code에 붙여 넣습니다 |

---

## 1. 전체 그림

PRD 마일스톤(M1~M5)을 **Claude Code 세션 하나에 끝낼 수 있는 크기의 Phase 14개**로 나눴습니다.

| Phase | 이름 | PRD 기능 | 마일스톤 | 완료하면 할 수 있는 것 |
|---|---|---|---|---|
| 0 | 프로젝트 준비 | — | M1 | 빈 앱 셸이 로컬 서버와 테스트에서 돌아감 |
| 1 | 계산 엔진 | 6장 전체 | M1 | AHP·가중합·민감도를 테스트로 검증 |
| 2 | 데이터 저장 | F1-3·4, F13-1·2, 7장 | M1 | 프로젝트 저장·불러오기·JSON 백업 |
| 3 | 디자인 시스템과 앱 셸 | DESIGN.md 3~6장 | M1 | 토큰·공통 컴포넌트·RouteNav·화면 이동 |
| 4 | 여행 조건·후보·동행인 | F1, F3, F8-1 | M1 | 국내/해외 조건 입력, 후보 직접 추가 |
| 5 | 기준·가중치 | F5, F6, F8-2·4 | M1 | 슬라이더/AHP, CR 게이지, 그룹 가중치 |
| 6 | 점수·결과·홈 | F7-1, F9, F8-5 | **M1 완료** | AI 없이 여행지를 비교해 결정 |
| 7 | 설정과 AI 기반 | F0, F12, 5.1·5.5·5.7·5.8 | M2 | 키 저장, 모델 단가, 비용 확인 창, 공용 AI 호출기 |
| 8 | AI 후보 추천 | F2, F10 일부 | M2 | 3개 모델 추천, 공통 추천 정렬, 엽서 카드 |
| 9 | AI 자료 수집 | F4, F10 | **M2 완료** | 국내/해외별 리서치 카드, 모델 비교, 확정값 |
| 10 | AI 점수 초안과 Excel | F7-2~4, F10-3, F13-3 | **M3 완료** | 점수 초안, 의견 불일치 표시, xlsx 내보내기 |
| 11 | AI 최종 심사 | F11 | M4 | 3라운드 토론, 최종 추천 티켓 |
| 12 | 리포트 내보내기 | F13-4·5·7·8 | M4 | Word·PDF 결정 리포트 |
| 13 | 다듬기와 배포 | 10장, DESIGN.md 10·12장 | **M4 완료** | 모션·접근성 점검, GitHub Pages 공개 |

M5(P2 기능: TOPSIS, 완전 AHP, 스트리밍, Excel 가져오기, 동행인별 점수)는 7장 백로그에 정리했습니다.

---

## 2. 구현 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 파일 구조 | `index.html` + `css/*.css` + `js/**/*.js`(ES 모듈), **빌드 없음** | 모듈별 테스트와 관리가 쉬움. GitHub Pages는 여러 파일도 그대로 서비스함 |
| 로컬 실행 | `python -m http.server 8000`(또는 VS Code Live Server) | ES 모듈은 더블클릭(file://)으로 열면 브라우저가 막음. 평소에는 GitHub Pages 주소 사용 |
| 테스트 | Node 내장 `node:test` + `node:assert` (`npm test` = `node --test tests/`) | 설치할 의존성 없음. 계산·저장·비용·AI 응답 파싱 같은 순수 함수만 테스트 |
| 화면 확인 | Playwright MCP로 스크린샷을 찍어 시안(`Travel-Pick-Design-Mockup.html`)과 비교 | DESIGN.md 14장의 "시안과 나란히 비교" 지침 |
| UI 방식 | Vanilla JS. 화면마다 `render(root, state)` 함수, 상태가 바뀌면 해당 화면만 다시 그림 | PRD 8장. 프레임워크 없이 충분한 규모 |
| 상태 관리 | 단일 상태 객체 + `update(fn)` + `subscribe(listener)`. 결과·순위 같은 파생값은 `selectors.js`에서 계산 | "앞 단계를 고치면 뒤 단계가 자동으로 다시 계산"(PRD 3장) |
| 라우팅 | 해시 라우터(`#/conditions`, `#/weights` …) | GitHub Pages에서 서버 설정 없이 동작 |
| 외부 라이브러리 | CDN, **정확한 버전 고정**. 내보내기용 라이브러리는 `import()`로 지연 로딩 | PRD 8장 |
| 버전 관리 | Phase 0에서 `git init`. 커밋·푸시는 사용자가 직접 하고, Claude는 Phase마다 커밋 시점과 메시지를 안내 | 사용자가 GitHub 작업을 직접 관리 |

외부 라이브러리 후보는 아래와 같습니다. 버전은 해당 Phase를 시작할 때 최신 안정판을 확인하고 고정합니다.

| 라이브러리 | 용도 | 처음 쓰는 Phase |
|---|---|---|
| Chart.js 4.x | 레이더, 막대, 선 차트 | 6 |
| marked + DOMPurify | AI가 준 Markdown을 안전하게 표시 | 11 |
| SheetJS (xlsx) | Excel 내보내기. npm 레지스트리 판은 오래됐으므로 `cdn.sheetjs.com` 판 사용 | 10 |
| docx | Word 내보내기 | 12 |

---

## 3. 폴더 구조와 모듈

```
TravelPick/
├─ index.html              앱 진입점(폰트, CSS, js/main.js 로드)
├─ css/
│  ├─ tokens.css           DESIGN.md 3장 :root 토큰 (HEX는 이 파일에만)
│  ├─ base.css             body, 타이포, 버튼, 포커스 링, 모션 감소
│  ├─ components.css       BoardingPass, FlapCode, Pill, Segmented …
│  ├─ screens.css          화면별 배치
│  └─ print.css            PDF 리포트용 인쇄 레이아웃 (Phase 12)
├─ js/
│  ├─ main.js              초기화, 라우터 연결
│  ├─ router.js            해시 라우팅
│  ├─ state.js             상태 저장소(update/subscribe), 자동 저장 연결
│  ├─ selectors.js         파생값: 그룹 가중치, 점수, 순위, 민감도
│  ├─ core/                ← DOM을 쓰지 않는 순수 함수 (Node 테스트 대상)
│  │  ├─ mcdm.js           정규화, 가중합, AHP, CR, 그룹 집계, 민감도, 불일치 지표
│  │  ├─ store.js          localStorage 입출력, 스키마 v3, 마이그레이션, 백업
│  │  ├─ cost.js           토큰·비용 추정, 실제 비용 기록
│  │  ├─ schema.js         기본값, 기본 기준 7개, 여행 조건 상수(계절→달 등)
│  │  └─ merge.js          AI 추천 합치기, 수치 차이 계산
│  ├─ ai/
│  │  ├─ openrouter.js     fetch, 시간 초과, 429 재시도, 동시 호출 제한
│  │  ├─ json.js           코드 블록 벗기기, 스키마 검증, 1회 재요청
│  │  ├─ prompts.js        기능별 프롬프트 (국내/해외 분기)
│  │  └─ runner.js         비용 확인 창 → 병렬 실행 → 기록
│  ├─ ui/
│  │  ├─ dom.js            h() 요소 생성 도우미, 이스케이프
│  │  ├─ icons.js          인라인 SVG 아이콘 (DESIGN.md 8장)
│  │  └─ components/       boardingPass.js, flapCode.js, routeNav.js, costReceipt.js …
│  ├─ screens/             home, conditions, candidates, research, weights,
│  │                       scores, results, panel, export, settings
│  └─ export/              json.js, xlsx.js, docx.js, report.js (지연 로딩)
├─ tests/                  *.test.js (node:test)
├─ dev/gallery.html        컴포넌트 갤러리 (시안 08 화면과 비교용, 배포 제외 가능)
├─ docs/                   PRD, 구현 계획, 개발 기록
├─ design/                 DESIGN.md, 시안
├─ CLAUDE.md               프로젝트 공통 지침 (Phase 0에서 작성)
└─ package.json            스크립트 전용 ("test", "serve"), 의존성 없음
```

**의존 방향**은 `screens → ui/components → selectors → core`입니다. `ai`는 `core/cost`와 `core/merge`를 씁니다. `core`는 다른 모듈을 참조하지 않습니다.

---

## 4. 프로젝트 공통 지침 (`CLAUDE.md` 초안)

Phase 0에서 프로젝트 루트에 아래 내용으로 `CLAUDE.md`를 만듭니다. 이렇게 해 두면 각 Phase 프롬프트에 공통 규칙을 반복하지 않아도 됩니다.

```markdown
# Travel Pick — 프로젝트 지침

## 기준 문서
- 기능: docs/Travel-Pick-PRD.md (v0.3). 시각 디자인: design/DESIGN.md. 시안: design/Travel-Pick-Design-Mockup.html
- 진행 계획: docs/Travel-Pick-Implementation-Plan.md (Phase 단위로 진행)

## 구조 규칙
- 빌드 없는 ES 모듈. 로컬 확인은 `npm run serve`(python -m http.server 8000).
- js/core/ 는 DOM·localStorage·fetch를 직접 쓰지 않는 순수 함수만 둔다(저장소는 주입). 여기는 반드시 테스트를 쓴다.
- 의존 방향: screens → ui → selectors → core. core는 다른 폴더를 import하지 않는다.
- CSS 색은 css/tokens.css의 변수만 쓴다. 새 색을 만들지 않는다(DESIGN.md 14장).
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
- git 커밋·푸시는 사용자가 직접 한다. Claude는 git commit/push를 실행하지 않고, 커밋하기 좋은 시점에 알리면서 포함될 변경 요약과 커밋 메시지(제목 + 본문)를 제안한다.
```

---

## 5. 공통 검증 방법

| 대상 | 방법 |
|---|---|
| 계산(core) | `node:test` 단위 테스트. AHP는 교과서 예제의 가중치·CR 값과 비교(소수 셋째 자리) |
| 저장 | 메모리 저장소를 주입해 저장·불러오기·마이그레이션·용량 초과 처리 테스트 |
| AI | 실제 호출 없이 `fetch`를 가짜로 바꿔 성공·429·시간 초과·잘못된 JSON 시나리오 테스트. 실제 호출은 Phase 7 연결 테스트와 Phase 8·9 수동 확인에서 소액으로만 |
| 화면 | Playwright로 스크린샷 비교, 키보드만으로 주요 흐름 조작, 콘솔 오류 확인 |
| 반응형 | 1440px, 1024px, 390px |

---

## 6. Phase별 계획과 프롬프트

> 프롬프트 사용 팁
> - 한 Phase = 한 세션을 권합니다. 세션을 시작할 때 "CLAUDE.md와 구현 계획의 Phase N을 읽고 시작해 줘"로도 충분합니다. 아래 프롬프트는 더 구체적으로 지시하고 싶을 때 씁니다.
> - 큰 Phase(5, 7, 9, 11)는 먼저 "작업 계획만 보여 줘"로 계획을 받고 확인한 뒤 진행하면 안전합니다.

### Phase 0. 프로젝트 준비

**목표**: 빈 앱이 로컬 서버에서 열리고, 테스트 명령이 돌아가는 상태.

작업
1. `git init`, `.gitignore`(`node_modules/`, `.playwright-mcp/`, `*.log`)
2. 3장 폴더 구조의 빈 파일 생성, `package.json`(scripts: `test`, `serve`)
3. `index.html`: Google Fonts 링크(DESIGN.md 4장), CSS 연결, `<script type="module" src="js/main.js">`
4. `css/tokens.css`(DESIGN.md 3장 그대로), `css/base.css`(body 점 격자, 글꼴, 포커스 링, `prefers-reduced-motion`)
5. 4장의 `CLAUDE.md` 작성, `README.md`(실행 방법)
6. 표본 테스트 1개(`tests/smoke.test.js`)

완료 기준: `npm test` 통과. `npm run serve` 후 브라우저에 밤 바탕 + 점 격자 + "Travel Pick" 제목이 보임.

```text
[Phase 0] Travel Pick 프로젝트를 준비해 줘.
- docs/Travel-Pick-Implementation-Plan.md의 2·3·4장을 읽고 그대로 따라.
- git init, .gitignore, 3장 폴더 구조(빈 모듈 파일 포함), package.json(test: node --test tests/, serve: python -m http.server 8000)을 만들어.
- index.html에 DESIGN.md 4장 폰트 링크와 css/tokens.css(DESIGN.md 3장 토큰 그대로), css/base.css를 연결하고 js/main.js를 type="module"로 불러와.
- 4장 내용으로 프로젝트 루트 CLAUDE.md를, 실행 방법을 담은 README.md를 작성해.
- tests/smoke.test.js 하나로 npm test가 통과하는지 확인하고, 로컬 서버로 첫 화면을 Playwright 스크린샷으로 보여 줘.
- 끝나면 첫 커밋을 만들어.
```

### Phase 1. 계산 엔진 (`js/core/mcdm.js`)

**목표**: PRD 6장의 모든 계산을 순수 함수로 만들고 테스트로 검증합니다. UI는 만들지 않습니다.

함수 목록
| 함수 | 내용 | PRD |
|---|---|---|
| `normalizeMinMax(values, direction)` | min-max 정규화, 모두 같으면 0.5 | 6.1 |
| `weightedSum(scores, weights)` | 후보별 최종 점수(0~100 환산) | 6.2 |
| `ahpWeights(matrix)` | 행 기하평균 가중치 | 6.3 |
| `ahpConsistency(matrix, weights)` | λmax, CI, RI, CR | 6.3 |
| `mostInconsistentPair(matrix)` | `a_ij`와 `w_i/w_j` 차이가 가장 큰 쌍 + 그 칸에 넣었을 때 CR이 가장 낮아지는 척도 값과 그때의 CR | 6.3, DESIGN 6.11 |
| `sliderToPairwise(v)` / `pairwiseToSlider(a)` | 슬라이더 −8~8 ↔ 1/9~9 | DESIGN 6.11 |
| `fillPairwiseFromWeights(weights)` | 단순 가중치로 쌍대비교 초깃값 채우기(1/9~9로 반올림) | F6-4 |
| `aggregateSimple(vectors, influence)` | 가중 산술평균 | 6.4 |
| `aggregateAIJ(matrices, influence)` | 셀별 가중 기하평균 | 6.4 |
| `rank(results)` / `isNearTie(a, b, 0.03)` | 순위, 사실상 동점 | F9-5 |
| `sensitivity(scores, weights, j, steps)` | 기준 j 가중치 0~1 이동, 1위 바뀌는 임계값 | 6.5 |
| `disagreement(values)` | 표준편차, (max−min)/평균 | 6.6 |

완료 기준: 모든 함수 테스트 통과. Saaty 교과서 예제 1개 이상과 3×3·7×7 일관 행렬(CR = 0) 검증.

```text
[Phase 1] js/core/mcdm.js 계산 엔진을 테스트 먼저 방식으로 만들어 줘.
- 근거: PRD 6장 전체, F6-3·F6-4·F9-5, DESIGN.md 6.11(슬라이더 −8~8 규칙).
- 구현 계획 Phase 1의 함수 목록을 모두 구현. DOM·localStorage를 쓰지 마.
- 먼저 tests/mcdm.test.js에 실패하는 테스트를 쓰고, 통과시켜.
  · 완전 일관 행렬은 CR=0, n=1·2는 CR=0
  · 알려진 교과서 AHP 예제의 가중치와 CR을 소수 셋째 자리까지 비교(출처를 주석에 적어)
  · mostInconsistentPair가 일부러 망가뜨린 셀을 찾아내는지
  · AIJ 집계 결과가 역수 행렬(a_ji = 1/a_ij)인지
  · 민감도: 1위가 바뀌는 임계값이 손으로 계산한 값과 같은지, 바뀌지 않으면 null
  · 동점 판정 3% 경계
- 결과를 표로 요약하고 커밋 메시지를 제안해.
```

### Phase 2. 데이터 저장 (`js/core/store.js`, `js/state.js`)

**목표**: PRD 7장 스키마 v3대로 저장·불러오기·백업이 되는 상태.

작업
- `schema.js`: 빈 프로젝트 생성기(기본 기준 7개, 본인 동행인 1명, 국내면 출발지 서울·해외면 인천), 계절→달 표.
- `store.js`(저장소 주입식): 프로젝트 목록·저장·삭제·복제, 설정 저장(API 키 별도 키), 캐시 저장(오래된 것부터 정리), 사용량 계산(80% 경고), `QuotaExceededError` 처리, JSON 내보내기·가져오기(API 키 제외 확인), v2→v3 마이그레이션.
- `state.js`: `getState`, `update(fn)`, `subscribe`. 변경 후 300ms 디바운스 자동 저장.

완료 기준: 저장·마이그레이션·용량 초과·백업에 API 키가 들어가지 않는지 테스트 통과.

```text
[Phase 2] 데이터 저장 계층을 만들어 줘.
- 근거: PRD 7장(키 구성, 스키마 v3, v0.3 필드 설명, v2 마이그레이션 규칙), F1-2~4, F13-1·2, 10장 저장 용량·보안.
- js/core/schema.js, js/core/store.js(저장소 객체를 인자로 받아 Node에서 테스트 가능하게), js/state.js를 구현해.
- tests/store.test.js: 메모리 저장소로 저장·불러오기, 복제·삭제, v2 데이터 마이그레이션, 용량 초과 시 데이터가 사라지지 않고 오류를 돌려주는지, JSON 백업에 API 키가 없는지, 캐시 정리 순서를 테스트해.
- 국내/해외 프로젝트 기본값이 다른지(출발지 서울/인천)도 테스트해.
- 커밋 메시지를 제안해.
```

### Phase 3. 디자인 시스템과 앱 셸

**목표**: 공통 컴포넌트와 화면 틀. 각 화면은 아직 자리만 만듭니다.

작업
- `ui/dom.js`(`h()` 도우미), `ui/icons.js`(DESIGN.md 8장 아이콘 9종)
- 컴포넌트: 버튼 6종, StatusPill/Chip, SegmentedControl, FlapCode(**한글 지명 타일 규칙 포함**), BoardingPass(국내·미정 변형 포함), ConsensusDots, PassportStamp, ModelBadge, MemberAvatar/Switcher, 점선 안내 카드, 빈 상태, 스켈레톤
- RouteNav(8단계, 완료/현재/미완료 상태, 하단 AI 비용 요약 자리), 모바일 셸(상단 바 + 8칸 진행 막대 + 하단 고정 바 + 메뉴 시트)
- `router.js`: 해시 라우트 10개(home, 8단계, settings)
- `dev/gallery.html`: 모든 컴포넌트를 한 페이지에(해외 `OKA`와 국내 `강릉`·`울릉도` 예시 함께)

완료 기준: 갤러리를 시안 08(디자인 토큰) 화면과 비교해 색·크기·간격이 맞음. 1440px/390px에서 셸이 시안 01·07 구조와 같음.

```text
[Phase 3] 디자인 시스템과 앱 셸을 만들어 줘.
- 근거: DESIGN.md 3~6장, 8장, 10~12장, 13장. 시안 design/Travel-Pick-Design-Mockup.html의 마크업은 구조 참고용.
- 구현 계획 Phase 3 작업 목록을 구현해. 색은 tokens.css 변수만 써.
- FlapCode·BoardingPass는 국내 변형을 반드시 포함해(DESIGN.md 6.2, 6.4 "국내 여행지 표시": 한글 Plex KR 700, 공항 코드의 약 80% 크기, 1~4음절은 음절별 타일).
- dev/gallery.html에 모든 컴포넌트와 상태를 한 페이지로 보여 줘.
- Playwright로 갤러리와 시안 08 화면, 앱 셸(1440px·390px)과 시안 01·07을 나란히 스크린샷 찍고 차이를 표로 정리해. 큰 차이는 고쳐.
- 커밋 메시지를 제안해.
```

### Phase 4. 여행 조건·후보·동행인

**목표**: ① 여행 조건 화면과 ② 후보 화면의 "직접 추가" 부분.

작업
- 여행 조건 화면(DESIGN.md 9장): 여행 종류 SegmentedControl → 탑승권 모양 폼(출발지, 시기 4방식, 기간 N박/당일치기/미정, 동행 형태 + 가족 세부 형태, 인원, 1인 총경비), 관심사 칩, 동행인 추가·이름·색
- 규칙: 당일치기는 국내만, 후보가 있으면 여행 종류 잠금(PRD F1-5), 시기·기간 미정 표시
- 후보 화면 수동 부분: 직접 추가 폼(F3-1: 해외는 국가·공항 코드, 국내는 시·도), 목록, 삭제, 9곳 이상 안내(F3-2), 후보 색 `--c1`부터 고정 배정
- 홈: 프로젝트 목록, 새 프로젝트, JSON 불러오기, 저장 공간 막대

완료 기준: 국내 프로젝트와 해외 프로젝트를 각각 만들어 후보 3곳씩 추가 → 새로고침해도 유지. 키보드만으로 폼 입력 가능.

```text
[Phase 4] 여행 조건, 후보 직접 추가, 동행인, 홈 프로젝트 목록 화면을 만들어 줘.
- 근거: PRD F1(특히 F1-5~F1-11), F3, F8-1, 9장 화면 구성. DESIGN.md 9장 "여행 조건" 가이드, 6.2 BoardingPass 국내·미정 변형, 6.10.
- 후보가 하나라도 있으면 여행 종류를 바꿀 수 없게 하고 이유를 안내해. 당일치기는 국내에서만 보이게 해.
- 시기가 미정이면 후보 직접 추가 폼에 조사 기준 시기(plannedPeriod)·일정 입력 칸을 보여 줘(F3-1).
- 국내·해외 프로젝트를 각각 만들어 후보 3곳씩 넣고 새로고침 후 유지되는지 Playwright로 확인하고, 두 화면을 1440px·390px로 스크린샷 찍어 보여 줘.
- 커밋 메시지를 제안해.
```

### Phase 5. 기준·가중치

**목표**: ④ 기준·가중치 화면(시안 03).

작업
- 기준 편집: 기본 7개, 추가·삭제·이름 변경(3~7 권장, 최대 9), 툴팁(거리 = 해외 비행시간 / 국내 이동시간)
- 단순 모드: 0~10 슬라이더, 자동 정규화 막대
- AHP 모드: PairwiseSlider 목록(한 번에 12개 + "다음 N개"), 진행 표시, CR 경고 행 + 수정 제안 문장, [슬라이더 값으로 나머지 채우기]
- CRGauge(SVG 반원), 나의 가중치 막대(`--k1~k7` 가중치 순)
- MemberSwitcher(입력 중/완료/대기), 그룹 합계 보기(단순 = 산술평균, AHP = AIJ, 그룹 CR)
- 기준을 추가·삭제하면 쌍대비교 행렬과 점수표 크기를 함께 조정

완료 기준: 시안 03과 비교. 모순된 판단을 넣으면 해당 행이 경고 스타일이 되고, 제안대로 바꾸면 CR이 0.1 아래로 내려감.

```text
[Phase 5] 기준·가중치 화면을 만들어 줘(시안 03).
- 근거: PRD F5, F6, F8-2·F8-4, 6.3·6.4. DESIGN.md 6.9~6.12, 7장 03 화면.
- 계산은 모두 Phase 1의 mcdm.js 함수를 써. 화면에서 수식을 다시 구현하지 마.
- 기준을 추가·삭제하면 모든 동행인의 쌍대비교 행렬, 단순 가중치, 점수표가 함께 조정되게 해.
- CR 경고 행에는 mostInconsistentPair 결과로 "N배로 바꾸면 CR이 0.0x로 좋아집니다" 문장을 보여 줘.
- 시안 03과 나란히 스크린샷 비교, 키보드로 슬라이더 조작 가능 여부 확인.
- 먼저 작업 계획을 보여 주고, 확인 후 진행해.
```

### Phase 6. 점수·결과·홈 (M1 완료)

**목표**: ⑤ 점수, ⑥ 결과(시안 04), 홈 출발 안내판(시안 01). 여기까지 하면 AI 없이 앱을 쓸 수 있습니다.

작업
- 점수 행렬(후보 × 기준, 1~10 입력, AI 점수 자리는 비워 둠)
- 결과: 상위 3 카드(1위 탑승권), 그룹/동행인별 보기 전환, 레이더(Chart.js, DESIGN 6.13 규칙), 기여도 누적 막대, 민감도(기준 선택 + 선 그래프 + 문장), 동행인별 1위, 동점 안내, 차트별 대응 표
- 홈 출발 안내판: BoardingPass 요약 + DepartureBoard + 가중치 나침반 도넛 + 탑승객별 1순위 + 다음 게이트 안내, 진행 단계별 H1 문구
- RouteNav 단계 완료 판정(조건 입력됨, 후보 3곳 이상, 가중치 입력, 점수 모두 입력 …)

완료 기준: 국내·해외 예시 프로젝트로 조건 입력부터 결과까지 끝까지 진행 가능. 시안 01·04·07과 비교.

```text
[Phase 6] 점수 매기기, 결과 분석, 홈 출발 안내판을 만들어 M1을 완료해 줘.
- 근거: PRD F7-1, F8-5, F9(F9-4 민감도 포함, F9-6 제외), 6.5. DESIGN.md 6.3·6.13, 7장 01·04·07 화면, 9장 점수 매기기 가이드.
- Chart.js 4는 CDN 정확한 버전으로 고정하고, DESIGN.md 6.13의 Chart.defaults를 적용해. 차트마다 같은 데이터의 표 또는 aria-label 요약을 넣어.
- 순위·점수·민감도는 selectors.js에서 계산하고, 앞 단계 값을 바꾸면 결과가 즉시 다시 계산되는지 확인해.
- 국내 예시(강릉·경주·제주 등)와 해외 예시(오키나와·타이베이·다낭 등)를 각각 끝까지 진행해 보고 결과 화면을 시안 04·07과 스크린샷 비교해.
- M1 완료 기준(PRD 11장)을 점검표로 보고하고 커밋 메시지를 제안해.
```

### Phase 7. 설정과 AI 기반 (비용 확인 창 포함)

**목표**: AI 기능 4개가 공통으로 쓰는 기반. 실제 AI 기능은 Phase 8부터 붙입니다.

시작 전 확인(PRD 14.2): Claude Code가 OpenRouter 공식 문서에서 다음을 확인하고 결과를 `docs/OpenRouter-Notes.md`에 기록합니다.
1. 세 모델 슬러그와 현재 단가
2. 웹 검색 방식(`:online` 또는 web 플러그인)과 요금, 세 모델에서 동작 여부
3. 응답 `usage`에 비용이 포함되는지
4. 모델별 `response_format`(JSON 스키마) 지원 여부
5. 브라우저 직접 호출(CORS) 가능 여부, 권장 헤더

작업
- 설정 화면(DESIGN.md 9장): API 키(마스킹, 이 기기/이번 세션), 연결 테스트, 모델 3개(목록 API로 검색·선택, 단가 표시), 의장 모델, 모델 사용 여부, 웹 검색 토글, 환율, 토큰 계수, 누적 비용, 저장 공간, 데이터 초기화
- `ai/openrouter.js`: 시간 초과 90초, 동시 3개, 429 지수 백오프, 오류 분류
- `ai/json.js`: 코드 블록 벗기기 → 파싱 → 간단한 스키마 검증 → 실패 시 오류를 붙여 1회 재요청 → 그래도 실패하면 원문 반환
- `core/cost.js`: 입력 토큰 추정(언어 계수), 기능별 출력 기본값, 실제 평균 반영(F12-5), 웹 검색 요금, USD·원화
- CostReceipt 대화상자(시안 06): 모델별 체크박스, 합계·버튼 문구 즉시 갱신, "지난 실행 대비" 문구
- `ai/runner.js`: 예상 → 확인 창 → 병렬 실행 → 모델별 진행 상태(대기/진행/완료/실패) → `aiRuns` 기록 → RouteNav 비용 요약 갱신

완료 기준: 가짜 fetch 테스트 통과(성공, 429 후 성공, 시간 초과, 잘못된 JSON 후 재요청 성공, 한 모델 실패 시 나머지 진행). 실제 키로 연결 테스트 성공.

```text
[Phase 7] 설정 화면과 AI 공통 기반(OpenRouter 호출기, JSON 처리, 비용 추정, 비용 확인 창)을 만들어 줘.
- 먼저 PRD 14.2의 1~4번과 브라우저 CORS 가능 여부를 OpenRouter 공식 문서에서 확인하고(context7 또는 웹 검색), docs/OpenRouter-Notes.md에 출처 링크와 함께 정리해. 확인한 값은 코드에 고정하지 말고 설정 기본값으로만 써.
- 근거: PRD F0, F12, 5.1·5.5·5.7·5.8, 10장 보안. DESIGN.md 6.15, 7장 06 화면, 9장 설정 가이드, 11장 상태 표현.
- API 키는 travelpick:apikey(또는 sessionStorage)에만 저장하고, 로그·오류 메시지·내보내기에 나오지 않게 해.
- tests/ai.test.js(가짜 fetch)와 tests/cost.test.js를 먼저 쓰고 통과시켜.
- 비용 확인 창은 시안 06과 스크린샷 비교. 체크박스를 끄면 합계와 "N회 실행하기" 문구가 바로 바뀌는지 확인해.
- 먼저 작업 계획을 보여 주고, 확인 후 진행해.
```

### Phase 8. AI 후보 추천 (F2)

**목표**: ② 후보 화면의 AI 추천(시안 02).

작업
- `prompts.js`의 추천 프롬프트: 여행 조건 요약(여행 종류, 시기/미정, 기간/미정, 출발지, 1인 예산, 동행 형태·세부 형태, 관심사, 제외 조건), 국내/해외 분기, 트렌드 근거 지침, 미정일 때 추천 시기·적정 일정 요구, 한국어, 모르면 null
- 출력 스키마: `[{ name, country | region, code(해외), reason, trendEvidence[], sources[], tags[], recommendedPeriod?, recommendedNights?, overBudgetRisk? }]`
- `core/merge.js`: 같은 곳 판별(해외는 공항 코드 우선, 없으면 정규화한 이름+국가 / 국내는 정규화한 지명+시·도), 추천 모델 수로 정렬, 3/3·2/3·1/3
- 화면: 모델 실행 현황 3칸, 조건 칩 줄, DestinationPostcard(SVG 모티프 바다/도시/산 — AI가 준 tags로 고름), 담기 버튼(추천 시기·일정을 `plannedPeriod`로 저장), `후보 N / 권장 3–8`
- 캐시: 같은 조건이면 재호출 없이 표시, [다시 추천받기]

완료 기준: merge 테스트 통과(이름 표기가 조금 달라도 같은 곳으로 묶임). 실제 호출로 국내 1회·해외 1회 확인하고 비용 기록 확인.

```text
[Phase 8] AI 후보 추천(F2)을 만들어 줘.
- 근거: PRD F2(F2-1~F2-8), F10-1·2·4, 5.3·5.4. DESIGN.md 6.6·6.8, 7장 02 화면, 6.4 국내 표시.
- 모든 호출은 ai/runner.js를 거쳐(비용 확인 창 먼저).
- core/merge.js와 tests/merge.test.js: "오키나와/Okinawa/OKA", "강릉/강릉시" 같은 표기 차이를 같은 곳으로 묶는지, 정렬 순서가 맞는지 테스트해.
- 시기·기간이 미정인 프로젝트에서 엽서에 추천 시기·적정 일정 태그가 나오고, 담을 때 plannedPeriod로 저장되는지 확인해.
- 실제 API는 국내 1회, 해외 1회만 호출해서 확인하고, 각 실행의 예상 비용과 실제 비용을 보고해.
- 시안 02와 스크린샷 비교 후 커밋 메시지를 제안해.
```

### Phase 9. AI 자료 수집 (F4, M2 완료)

**목표**: ③ 자료 수집 화면.

작업
- 프롬프트·스키마를 국내/해외로 분리(PRD F4-1 조사 항목 표). 항목마다 `{ value, summary, sources[], asOf, needsCheck }`, 숫자 항목은 비교용 `numeric`(예: 항공권 최소·최대 원)
- 조사 기준 시기: 프로젝트 시기, 미정이면 후보의 `plannedPeriod`
- 화면(DESIGN.md 9장): 후보 탭(FlapCode) + 항목 카드 그리드, 카드 = 항목명 + 확정값 + 모델별 값 3줄 + 출처 + `확인 필요` 태그, 모델 간 차이 30% 이상이면 경고 스타일(F4-4), 확정값 입력(종이 바탕), 수동 메모
- 후보별·모델별 선택 실행(F4-7), 캐시 + [새로 조사](F4-6)
- 안전·위생 고정 안내 문구(국내/해외 다르게, PRD 5.6)

완료 기준: 후보 5곳 × 3모델 = 15회 실행 중 일부 실패해도 나머지가 표시되고 실패분만 다시 시도 가능. 같은 후보·시기면 재호출하지 않음.

```text
[Phase 9] AI 자료 수집(F4)을 만들어 M2를 완료해 줘.
- 근거: PRD F4(F4-1 조사 항목 표 포함), F10, 5.3·5.4·5.6. DESIGN.md 9장 자료 수집 가이드, 11장.
- 국내와 해외는 프롬프트와 출력 스키마를 따로 둬. 국내에는 비자·여행경보·항공 항목이 없어야 해.
- 조사 기준 시기는 프로젝트 시기, 미정이면 후보의 plannedPeriod를 써.
- 숫자 항목은 core/merge.js에 모델 간 차이 계산을 추가하고 테스트해(30% 기준).
- 실패한 모델·후보만 다시 시도하는 버튼과, 캐시 적중 시 재호출하지 않는 동작을 확인해.
- 실제 API는 후보 2곳 × 3모델로만 확인하고 비용을 보고해.
- M2 완료 기준(PRD 11장)을 점검표로 보고하고 커밋 메시지를 제안해.
- 먼저 작업 계획을 보여 주고, 확인 후 진행해.
```

### Phase 10. AI 점수 초안과 Excel (M3 완료)

작업
- 점수 초안 프롬프트: 리서치 확정값 우선, 후보 × 기준 전체를 한 번에, 셀마다 `{ score, rationale }`
- 점수 행렬에 모델 점수 3개·평균·표준편차 표시, 2점 이상이면 `--warn-bg`, [AI 평균 적용]/[특정 모델 적용]/[직접 입력]
- 합의 수준(F10-3): 추천 중복도, 수치 차이, 점수 표준편차를 프로젝트 요약으로
- Excel 내보내기(F13-3): 시트 6개(후보, 기준·가중치(동행인별·CR), 점수표, 결과 순위, 리서치 자료(출처), AI 비용 기록), 파일 이름 `TravelPick_<프로젝트명>_<YYYYMMDD>.xlsx`

```text
[Phase 10] AI 점수 초안, 교차 검증 지표, Excel 내보내기를 만들어 M3를 완료해 줘.
- 근거: PRD F7-2~F7-4, F10-3, F13-3·F13-7, 6.6. DESIGN.md 9장 점수 매기기 가이드.
- 점수 초안 프롬프트는 리서치 확정값을 우선 근거로 쓰게 하고, 최종 점수는 항상 사용자가 확정하게 해.
- SheetJS는 cdn.sheetjs.com의 정확한 버전으로, 내보내기 버튼을 누를 때 동적 import로 불러와.
- 내보낸 xlsx를 Node로 다시 읽어 시트 6개와 주요 값이 맞는지, API 키가 없는지 확인해.
- 커밋 메시지를 제안해.
```

### Phase 11. AI 최종 심사 (F11)

작업
- 입력 요약 만들기(F11-1, 공통 맥락은 짧게), 동행인 이름을 "구성원 N"으로 바꾸는 옵션(10장 개인정보)
- 라운드 실행: 빠르게(R1 3회 + 종합 1회) / 꼼꼼하게(R1 3 + R2 3 + R3 1). R2는 R1 결과를 넣어 호출, R3는 의장 모델
- R3 출력: Markdown 본문 + 요약 JSON `{ chosen, consensus, matchesCalculation, agreements[], openIssues[], checklist[], reasonIfDifferent }`
- 화면(시안 05): 깊이 SegmentedControl(예상 비용 즉시 갱신), 라운드 타임라인(접기·펼치기), R1 카드, R2 반박 목록(반박/보완/동의 태그), R3 VerdictTicket(체크리스트는 실제 체크박스, 계산 결과와 다르면 배지·이유), 진행 중 스켈레톤
- [○○로 확정하고 리포트 만들기] → `decision.chosen` 저장 후 내보내기로 이동

```text
[Phase 11] AI 최종 심사(F11)를 만들어 줘(시안 05).
- 근거: PRD F11, 5.4(계산 순위를 그대로 따르지 말고 다르면 이유), 10장 개인정보 옵션. DESIGN.md 6.14, 7장 05 화면, 11장.
- marked + DOMPurify를 정확한 버전으로 불러오고, AI Markdown은 반드시 정화한 뒤 표시해.
- 라운드는 순서대로 실행하고, 앞 라운드가 일부 실패해도 남은 결과로 다음 라운드를 진행할 수 있게 해.
- 가짜 응답으로 "계산 결과와 일치"와 "계산 결과와 다름" 두 경우의 화면을 모두 확인하고, 실제 API는 "빠르게" 1회만 실행해 비용을 보고해.
- 먼저 작업 계획을 보여 주고, 확인 후 진행해.
```

### Phase 12. 리포트 내보내기 (Word·PDF)

작업
- `export/report.js`: 리포트 데이터 모으기(여행 조건, 후보, 기준·가중치, 점수표, 차트 PNG, 민감도 문장, AI 심사 요약, 확인 체크리스트, 출처 목록, 공식 기관 확인 문구)
- PDF: 리포트 미리보기 화면 + `print.css` + `window.print()`(PRD 8장 기본 방식)
- Word: docx 라이브러리, 한글 글꼴 지정, 표·제목·차트 이미지
- ⑧ 내보내기 화면(DESIGN.md 9장 영수증 스타일), 마지막 백업 시각, 7일 경과 백업 권유 배너(F13-8)

```text
[Phase 12] Word·PDF 결정 리포트와 내보내기 화면을 만들어 줘.
- 근거: PRD F13-4·F13-5·F13-7·F13-8, 5.6(확인 체크리스트·공식 기관 문구), 8장 PDF 방식. DESIGN.md 9장 내보내기 가이드.
- 리포트 내용은 export/report.js 한 곳에서 모으고, 미리보기·PDF·Word가 같은 데이터를 쓰게 해.
- 차트는 Chart.js의 toBase64Image()로 PNG를 만들어 넣어.
- PDF는 인쇄 미리보기 스크린샷으로 쪽 나눔과 한글을 확인하고, docx는 생성 파일 구조를 검사해. MS Word·한컴오피스에서 직접 여는 확인은 사용자에게 요청해.
- 커밋 메시지를 제안해.
```

### Phase 13. 다듬기와 배포 (M4 완료)

작업
- 모션(DESIGN.md 10장): 플랩 넘김, 점수 카운트, 카드 등장, 도장 찍기, `prefers-reduced-motion` 대응
- 접근성 점검(DESIGN.md 12장): 대비, 44px 터치 영역, `aria-label`, 키보드 흐름, 포커스 링
- 성능: 계산 100ms 이내 확인, 첫 화면에서 내보내기 라이브러리를 불러오지 않는지 확인
- 오류 상황 점검: 오프라인, 잘못된 키, 저장 공간 가득 참
- GitHub 저장소 생성 → Pages 배포(`main` 브랜치 루트), `HTTP-Referer` 헤더에 Pages 주소 설정, `dev/` 제외 여부 결정
- README 갱신, 개발 기록 문서 작성(`docs/`)

```text
[Phase 13] 마무리와 배포를 진행해 M4를 완료해 줘.
- 근거: DESIGN.md 10장(모션)·12장(접근성), PRD 10장(비기능)·11장 M4.
- 모션을 구현하고 prefers-reduced-motion에서 모두 꺼지는지 확인해.
- 접근성 점검표(DESIGN.md 12장)를 화면별로 확인해 결과를 표로 보고하고, 문제를 고쳐.
- 오프라인, 잘못된 API 키, localStorage 가득 참 상황을 재현해 안내가 제대로 나오는지 확인해.
- GitHub 저장소 생성·푸시·Pages 설정은 내가 직접 할 테니, 필요한 순서와 설정값을 단계별로 안내해 줘.
- 배포 주소에서 국내·해외 프로젝트 하나씩 끝까지 진행해 보고, M4 완료 기준을 점검표로 보고해.
```

---

## 7. 백로그 (M5, P2)

| 기능 | PRD | 메모 |
|---|---|---|
| 가중합 vs TOPSIS 비교 | F9-6 | mcdm.js에 `topsis()` 추가, 결과 화면에 순위 비교 표 |
| 완전 AHP(후보도 쌍대비교) | F6-6 | 후보 8곳 × 기준 7개면 비교 수가 많으므로 기준별 선택 실행 |
| 스트리밍 응답 | 8장 AI | 심사 R3처럼 긴 응답에 우선 적용 |
| Excel 가져오기 | F13-6 | Phase 10 시트 구조를 그대로 읽기 |
| 동행인별 점수 | F8-6 | 점수 구조를 `scores[member][candidate]`로 확장, 마이그레이션 필요 |
| 기준 프리셋 | F5-6 | 동행 형태별 추가 기준 |
| 라이트 테마 | DESIGN.md 13장 | `[data-theme="day"]` 토큰 세트 |

---

## 8. 위험 요소와 대응 (구현 관점)

| 위험 | 대응 |
|---|---|
| OpenRouter 사양(슬러그, 웹 검색, usage 비용)이 문서와 다름 | Phase 7 시작 시 확인 후 `docs/OpenRouter-Notes.md`에 기록. 모두 설정값으로 둠 |
| 모델마다 JSON 형식이 어긋남 | `ai/json.js` 검증 + 1회 재요청 + 원문 표시. 스키마를 작게 유지 |
| 같은 여행지를 모델마다 다르게 표기 | `merge.js` 정규화 규칙 + 테스트. 사용자가 수동으로 합치는 기능은 필요할 때 추가 |
| AI 테스트 비용 | 자동 테스트는 가짜 fetch만 사용. 실제 호출은 Phase별 최소 횟수로 정하고 비용을 보고 |
| 화면이 시안과 달라짐 | Phase 3 갤러리를 기준으로 삼고, 화면 Phase마다 스크린샷 비교 |
| 기준 수가 바뀔 때 행렬·점수 크기 불일치 | 기준 추가·삭제를 한 함수에서 처리하고 테스트(Phase 5) |
| localStorage 5MB 초과(리서치 결과가 큼) | 캐시와 프로젝트 데이터 분리, 캐시부터 정리, 80% 경고, JSON 백업 권유 |

---

## 9. 진행 체크리스트

- [x] Phase 0 프로젝트 준비 (2026-10-13, 커밋 4d9f991)
- [x] Phase 1 계산 엔진 (2026-10-13)
- [ ] Phase 2 데이터 저장
- [ ] Phase 3 디자인 시스템과 앱 셸
- [ ] Phase 4 여행 조건·후보·동행인
- [ ] Phase 5 기준·가중치
- [ ] Phase 6 점수·결과·홈 → **M1 완료**
- [ ] Phase 7 설정과 AI 기반
- [ ] Phase 8 AI 후보 추천
- [ ] Phase 9 AI 자료 수집 → **M2 완료**
- [ ] Phase 10 AI 점수 초안과 Excel → **M3 완료**
- [ ] Phase 11 AI 최종 심사
- [ ] Phase 12 리포트 내보내기
- [ ] Phase 13 다듬기와 배포 → **M4 완료**
