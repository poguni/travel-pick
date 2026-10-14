# Travel Pick

세 AI(Claude Sonnet 5.5, GPT-6 Luna, Gemini 3.8 Flash)와 함께 다음 여행지를 고르는 개인용 웹 앱입니다.
후보 발굴 → 자료 수집 → 기준·가중치(단순·AHP) → 점수 → 결과 분석 → AI 최종 심사 → 리포트 내보내기까지 한 곳에서 진행합니다.

- 배포 주소: https://poguni.github.io/travel-pick/ (배포 방법: [docs/Deploy-Guide.md](docs/Deploy-Guide.md))
- 로그인·서버 없음. 모든 데이터는 이 브라우저의 localStorage에만 저장됩니다.

## 사용하기

1. **설정**에서 OpenRouter API 키를 넣고 [연결 테스트]를 누릅니다. 공용 PC에서는 "이번 세션만"을 고르세요.
   OpenRouter 대시보드에서 키별 사용 한도를 걸어 두기를 권합니다(앱에는 비용 상한이 없고, 실행 전 확인 창으로 예상 비용을 보여 줍니다).
2. **출발 안내판**에서 새 여행을 만들고, 국내/해외·시기·기간·동행·1인 예산을 정합니다. 한 프로젝트는 국내나 해외 한쪽만 다룹니다.
3. 단계(01~08)를 따라 진행합니다. AI 단계는 모두 **실행 전 비용 확인 창**을 거칩니다.

| 단계 | 하는 일 | AI 호출(후보 3곳 기준) |
|---|---|---|
| 01 여행 조건 | 종류·시기·기간·동행·예산·관심사 | — |
| 02 후보 발굴 | 세 AI의 "요즘 떠오르는 여행지" 추천을 공통 추천 순으로, 직접 추가 | 3회 (웹 검색) |
| 03 자료 수집 | 후보 × 모델 조사 카드, 모델 간 수치 차이 30% 이상 강조, 확정값·메모 | 9회 (웹 검색) |
| 04 기준·가중치 | 동행인별 단순 슬라이더 또는 AHP 쌍대비교(CR 표시) | — |
| 05 점수 매기기 | AI 점수 초안(확정값 우선 근거), 표준편차 강조, 직접 확정 | 3회 |
| 06 결과 분석 | 순위, 레이더·기여도 차트, 민감도, 동행인별 1위 | — |
| 07 AI 최종 심사 | 독립 의견 → (상호 비판) → 의장 종합, 계산 결과와 비교 | 4회 / 7회 |
| 08 내보내기 | JSON 백업, Excel(시트 6개), Word·PDF 결정 리포트 | — |

## 실행 (개발)

빌드 없는 ES 모듈 앱이라 `index.html`을 더블클릭하면 열리지 않습니다. 로컬 서버로 엽니다.

```bash
npm run serve        # python dev/serve.py 8000 (캐시 끈 개발 서버)
```

브라우저에서 <http://localhost:8000> 을 엽니다. `dev/gallery.html`은 컴포넌트 모음입니다.

## 테스트

Node 22 이상이 필요합니다. 앱 자체는 의존성이 없고(라이브러리는 CDN에서 필요할 때 불러옴), 테스트만 Excel·Word 내보내기 검증용 SheetJS·docx(개발 의존성)를 씁니다.

```bash
npm install          # 처음 한 번 (SheetJS xlsx 0.20.3, docx 9.5.1)
npm test             # node --test "tests/**/*.test.js" — 계산·저장·AI(가짜 응답)·내보내기·성능
```

## 폴더

| 경로 | 내용 |
|---|---|
| `index.html` | 앱 진입점 |
| `css/` | 디자인 토큰(`tokens.css`), 기본·컴포넌트·화면 스타일, 인쇄용(`print.css`) |
| `js/core/` | 계산(AHP·가중합·민감도), 저장, 비용, 추천 합치기, 자료·점수·심사 규칙 — DOM 없는 순수 함수(테스트 대상) |
| `js/ai/` | OpenRouter 호출기, JSON 처리, 실행기(비용 확인 → 실행 → 기록), 프롬프트 |
| `js/selectors.js` | 화면용 계산(결과, 합의 수준, 자료 카드 등) |
| `js/ui/`, `js/screens/` | 공통 컴포넌트와 화면 |
| `js/export/` | Excel·Word·리포트 데이터·리포트 차트 |
| `tests/` | 단위 테스트 |
| `docs/` | PRD, 구현 계획, OpenRouter 확인 노트, 배포 안내, 개발 기록 |
| `design/` | 디자인 가이드(DESIGN.md)와 시안 |
| `dev/` | 개발 서버·컴포넌트 갤러리(앱은 불러오지 않음) |

## 외부 라이브러리 (CDN, 정확한 버전 고정, 필요할 때만 불러옴)

| 라이브러리 | 버전 | 쓰는 곳 |
|---|---|---|
| Chart.js | 4.5.1 | 결과 차트, 리포트 차트 |
| marked + DOMPurify | 12.0.2 / 3.1.6 | AI 심사 Markdown(정화 후 표시) |
| SheetJS | 0.20.3 | Excel 내보내기 |
| docx | 9.5.1 | Word 내보내기 |

## 보안·개인정보

- API 키는 OpenRouter 말고는 어디에도 보내지 않으며, JSON 백업·Excel·Word·PDF에 들어가지 않습니다.
- AI 심사에 동행인 이름 대신 "구성원 N"을 보내는 옵션이 있습니다(기본 켜짐).
- 브라우저 데이터를 지우면 프로젝트도 지워집니다. 7일마다 백업 권유 배너가 뜨니 JSON 백업을 받아 두세요.

## 문서

- 제품 기획서: [docs/Travel-Pick-PRD.md](docs/Travel-Pick-PRD.md)
- 구현 계획: [docs/Travel-Pick-Implementation-Plan.md](docs/Travel-Pick-Implementation-Plan.md)
- OpenRouter 확인 노트: [docs/OpenRouter-Notes.md](docs/OpenRouter-Notes.md)
- 배포 안내: [docs/Deploy-Guide.md](docs/Deploy-Guide.md)
- 개발 기록: [docs/Development_Report_v1.md](docs/Development_Report_v1.md) ([HTML](docs/Development_Report_v1.html))
- 디자인 가이드: [design/DESIGN.md](design/DESIGN.md)
