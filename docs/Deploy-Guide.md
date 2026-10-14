# Travel Pick 배포 안내 (GitHub Pages)

> 대상 저장소: `https://github.com/poguni/travel-pick` (이미 만들어져 있고 `main`에 Phase 12까지 푸시됨)
> 배포 주소(예정): **https://poguni.github.io/travel-pick/**
> git 커밋·푸시와 GitHub 설정은 직접 진행합니다. 이 문서는 순서와 설정값만 정리합니다.

## 1. 배포 전에 확인

| 항목 | 값 | 비고 |
|---|---|---|
| 빌드 | 없음 | 저장소 파일을 그대로 서비스 |
| 진입점 | 저장소 루트의 `index.html` | 모든 경로가 상대 경로라 `/travel-pick/` 아래에서도 동작 |
| `.nojekyll` | 루트에 빈 파일 | Jekyll 처리 없이 파일 그대로 올림(Phase 13에서 추가) |
| 외부 라이브러리 | CDN(jsdelivr, cdn.sheetjs.com), Google Fonts | 정확한 버전 고정, 필요할 때만 불러옴 |
| `HTTP-Referer` | 자동 | `js/ai/openrouter.js`가 현재 페이지 주소(해시 제외)를 보냄 → 배포하면 `https://poguni.github.io/travel-pick/`가 됨. 설정할 것 없음 |
| `X-Title` | `Travel Pick` | OpenRouter 사용 기록에 앱 이름으로 표시 |
| API 키 | 저장소에 없음 | 각자 브라우저의 설정 화면에서 입력, `travelpick:apikey`(또는 세션)에만 저장 |

**함께 공개되는 폴더**: `docs/`(기획서·계획), `design/`(디자인 가이드·시안, 약 8.8MB), `tests/`, `dev/`(개발용 갤러리·서버 스크립트)도 Pages 주소에서 열람할 수 있습니다. 비밀 정보는 없으므로 그대로 두기로 했습니다(`dev/`는 앱이 불러오지 않아 동작에 영향 없음). 숨기고 싶다면 저장소를 비공개로 바꾸거나(무료 계정은 비공개 저장소 Pages 불가) GitHub Actions로 일부만 배포해야 합니다.

## 2. 순서

1. **Phase 13 커밋·푸시**
   ```bash
   git add -A
   git commit -m "Phase 13: ..."   # 제안 메시지는 작업 보고 참고
   git push origin main
   ```
2. **Pages 켜기**: GitHub 저장소 → **Settings** → 왼쪽 **Pages**
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` / 폴더 `/ (root)` → **Save**
3. **배포 완료 기다리기**: 저장소 **Actions** 탭의 `pages build and deployment`가 초록색이 되면 완료(보통 1~2분). Settings → Pages 상단에 주소가 나옵니다.
4. **접속 확인**: https://poguni.github.io/travel-pick/ (처음에는 404가 잠깐 보일 수 있음. 강력 새로고침 `Ctrl+Shift+R`)
5. **HTTPS 강제**: Settings → Pages → **Enforce HTTPS** 체크(기본 켜짐)

이후에는 `main`에 푸시할 때마다 자동으로 다시 배포됩니다.

## 3. 배포 주소에서 처음 할 일

배포 주소는 로컬(`localhost:8000`)과 **다른 사이트**라 저장 공간이 따로입니다. 로컬에서 만든 프로젝트는 보이지 않습니다.

1. (로컬 데이터를 옮기려면) 로컬 앱 ⑧ 내보내기 → **JSON 백업 받기** → 배포 주소 출발 안내판 → **JSON 불러오기**
2. 설정 → OpenRouter API 키 입력 → **키 저장** → **연결 테스트**
   - 공용 PC라면 저장 방식을 **이번 세션만**으로
   - OpenRouter 대시보드(https://openrouter.ai/settings/keys)에서 **키별 사용 한도**(예: $5)를 걸어 두기를 권장
3. 설정 → **세 모델 시험 호출**로 실제 호출 확인(약 $0.001)

## 4. 배포 후 끝까지 진행해 보기 (M4 확인)

국내·해외 프로젝트를 하나씩 만들어 아래를 확인합니다. 예상 비용은 후보 3곳 기준 프로젝트당 약 $0.3 안팎입니다(자료 수집이 대부분).

| 단계 | 확인 |
|---|---|
| ② 후보 발굴 | AI 추천받기 → 확인 창 예상 비용 → 엽서 카드, 담기 |
| ③ 자료 수집 | 자료 모으기(후보 수 × 3회) → 항목 카드, 확정값 입력 |
| ④ 기준·가중치 | 슬라이더 또는 AHP |
| ⑤ 점수 | AI 점수 초안 → AI 평균 적용 |
| ⑥ 결과 | 순위·차트·민감도 |
| ⑦ AI 최종 심사 | 빠르게(4회) 1번 → 확정하고 리포트 만들기 |
| ⑧ 내보내기 | Excel·Word·PDF 받기, Word를 MS Word·한컴오피스로 열기 |
| 설정 | 누적 비용이 각 실행의 실제 비용 합과 맞는지 |

문제가 있으면 브라우저 개발자 도구(F12) → Console의 빨간 오류를 복사해 알려 주세요.

## 5. 되돌리기

- 배포 중단: Settings → Pages → Source를 `None`으로
- 이전 버전으로: `git revert <커밋>` 후 푸시(배포는 자동으로 따라감)
