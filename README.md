# Travel Pick

여러 AI(Claude, GPT, Gemini)와 함께 다음 여행지를 고르는 개인용 웹 앱입니다.
후보 발굴 → 자료 수집 → 기준·가중치(AHP) → 점수 → 결과 분석 → AI 최종 심사 → 리포트 내보내기까지 한 곳에서 진행합니다.

## 실행

빌드 없는 ES 모듈 앱이라 `index.html`을 더블클릭하면 열리지 않습니다. 간단한 로컬 서버로 엽니다.

```bash
npm run serve        # python dev/serve.py 8000 (캐시 끈 개발 서버)
```

브라우저에서 <http://localhost:8000> 을 엽니다.

## 테스트

Node 22 이상이 필요합니다. 앱 자체는 의존성이 없고, 테스트만 Excel 내보내기 검증용 SheetJS(개발 의존성)를 씁니다.

```bash
npm install          # 처음 한 번 (SheetJS xlsx 0.20.3, cdn.sheetjs.com)
npm test             # node --test "tests/**/*.test.js"
```

## 폴더

| 경로 | 내용 |
|---|---|
| `index.html` | 앱 진입점 |
| `css/` | 디자인 토큰(`tokens.css`)과 스타일 |
| `js/core/` | 계산·저장·비용 같은 순수 함수 (테스트 대상) |
| `js/ai/` | OpenRouter 호출, 프롬프트 |
| `js/ui/`, `js/screens/` | 공통 컴포넌트와 화면 |
| `js/export/` | JSON·Excel·Word·PDF 내보내기 |
| `tests/` | 단위 테스트 |
| `docs/` | PRD, 구현 계획 |
| `design/` | 디자인 가이드(DESIGN.md)와 시안 |

## 문서

- 제품 기획서: [docs/Travel-Pick-PRD.md](docs/Travel-Pick-PRD.md)
- 구현 계획: [docs/Travel-Pick-Implementation-Plan.md](docs/Travel-Pick-Implementation-Plan.md)
- 디자인 가이드: [design/DESIGN.md](design/DESIGN.md)
