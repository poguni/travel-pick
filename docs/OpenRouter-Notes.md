# OpenRouter 확인 노트

| 항목 | 내용 |
|---|---|
| 확인일 | 2026-10-13 |
| 목적 | PRD 14.2 "개발 시작 시 확인할 사항" 1~4번과 브라우저 직접 호출 가능 여부 확인 (구현 계획 Phase 7) |
| 원칙 | 아래 값은 코드에 고정하지 않고 **설정 기본값**으로만 쓴다. 단가는 설정 화면의 [모델 목록·단가 불러오기]로 갱신한다 |

## 1. 세 모델 슬러그와 단가

`GET https://openrouter.ai/api/v1/models` (키 없이 호출 가능, 모델 461개) 응답에서 확인했습니다.
`pricing` 값은 **토큰 1개당 USD 문자열**입니다. 아래 표는 100만 토큰 기준으로 바꾼 값입니다.

| 역할 | 슬러그 | 입력 | 출력 | 웹 검색(`pricing.web_search`) | JSON 스키마 출력 |
|---|---|---|---|---|---|
| 모델 A (의장) | `anthropic/claude-sonnet-5.5` | $2.00 | $10.00 | $0.01 / 회 | 지원 (`response_format`, `structured_outputs`) |
| 모델 B | `openai/gpt-6-luna` | $0.10 | $0.50 | $0.01 / 회 | 지원 |
| 모델 C | `google/gemini-3.8-flash` | $0.75 | $3.75 | $0.014 / 회 | 지원 |

- 같은 모델에 `:batch` 변형(반값, 비동기)이 있지만 이 앱은 즉시 응답이 필요하므로 쓰지 않습니다.
- PRD 5.2의 "Gemini가 가장 저렴"이라는 기대와 달리, 지금 단가로는 **GPT-6 Luna가 가장 저렴**합니다. 재시도·요약 담당 모델은 설정에서 바꿀 수 있게 둡니다.
- 모델 객체 주요 필드: `id`, `name`, `context_length`, `pricing.{prompt, completion, web_search}`, `supported_parameters`(배열).

## 2. 웹 검색 방식과 요금

- 켜는 방법: 요청에 `"plugins": [{ "id": "web" }]`를 넣거나 모델 슬러그 뒤에 `:online`을 붙입니다(둘은 같은 기능).
  이 앱은 **`plugins` 방식**을 씁니다. 슬러그를 그대로 두고 `max_results`를 조절할 수 있어서입니다.
- Anthropic·Google·OpenAI 모델은 기본으로 **제공사 자체(native) 검색**을 씁니다. 요금은 제공사 요금이 그대로 붙고, 모델 목록의 `pricing.web_search`(검색 1회당)로 확인할 수 있습니다.
- 그 밖의 모델은 Exa 검색을 씁니다($0.007/요청, 결과 10개까지 포함, `max_results` 기본 5).
- 검색 결과 본문도 입력 토큰으로 청구됩니다. 예상 비용에는 "검색 1회 요금 + 결과 분량만큼의 입력 토큰"을 함께 반영합니다.
- 출처는 응답 메시지의 `annotations` 배열로 옵니다. 항목마다 `type: "url_citation"`이고 `url_citation.{url, title, content, start_index, end_index}`가 들어 있습니다.

## 3. 응답의 사용량·비용

- **모든 응답에 `usage`가 자동으로 들어옵니다.** 예전 `usage: { include: true }` 옵션은 더 이상 필요 없고 효과도 없습니다.
- 필드: `usage.prompt_tokens`, `usage.completion_tokens`, `usage.total_tokens`, **`usage.cost`(실제 청구 금액, 크레딧=USD)**, `usage.cost_details`, `usage.prompt_tokens_details.cached_tokens`, `usage.completion_tokens_details.reasoning_tokens`.
- 이 앱은 실제 비용으로 `usage.cost`를 우선 쓰고, 값이 없을 때만 `토큰 × 단가`로 계산합니다.

## 4. 구조화 출력

- `response_format: { type: 'json_schema', json_schema: { name, strict, schema } }`와 `{ type: 'json_object' }`를 지원합니다.
- 세 모델 모두 `supported_parameters`에 `response_format`과 `structured_outputs`가 있습니다.
- 그래도 모델 응답이 스키마를 벗어날 수 있으므로 PRD 5.5대로 처리합니다. 코드 블록을 벗기고 → 파싱 → 검증하고, 실패하면 오류를 붙여 1회 재요청하고, 그래도 실패하면 원문을 보여 줍니다.
- **Claude(Anthropic) 스키마 제한** (2026-10-14 실제 사용 중 발견): union type(`"type": ["string", "null"]` 같은 타입 배열이나 `anyOf`) 매개변수는 요청당 **16개**, 선택 매개변수(required에 없는 속성)는 **24개**까지입니다. 객체는 `additionalProperties: false`여야 하고 `minimum`·`maxLength` 같은 제약 키워드는 지원하지 않습니다. 넘으면 400(앱 문구: "요청 형식에 문제가 있어요")이 나고, GPT에서는 같은 요청이 통과합니다.
  - 자료 수집 스키마가 null 허용 항목 때문에 해외 20·국내 19개라 Claude만 실패했습니다. 지금은 모르는 값을 빈 문자열·0으로 받아 union type이 0개입니다.
  - `tests/schema-limits.test.js`가 모든 AI 스키마를 이 한도로 검사합니다. 스키마를 바꿀 때 함께 확인하세요.
  - 400·403·5xx 오류는 OpenRouter가 보낸 원문을 비용 확인 창과 모델 상태 칸에 함께 보여 줍니다. 제공사 오류는 `message`가 "Provider returned error"뿐이므로 `error.metadata.raw`(제공사 원문)와 `metadata.provider_name`을 꺼내 붙입니다.
- **Claude에는 구조화 출력을 쓰지 않습니다** (2026-10-14 실제 사용 중 확인): union 한도를 고친 뒤에도 자료 수집이 400으로 실패했고, 제공사 원문은 `Google: The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.`였습니다. OpenRouter가 Claude 요청을 Google Vertex로 보냈고, 구조화 출력이 스키마를 문법으로 컴파일하다 너무 크다고 거절한 것입니다(`strict: false`여도 같음). 이 밖에도 인용(Citations)과 함께 못 쓰는 등 제약이 많습니다.
  - 그래서 `js/ai/openrouter.js`는 `anthropic/` 모델에 스키마를 요청하면 `response_format`을 보내지 않고, 마지막 user 메시지 끝에 "출력 형식" 안내와 JSON 스키마를 붙입니다(`withSchemaInPrompt`). 응답은 위의 검증·1회 재요청이 그대로 처리합니다. GPT·Gemini는 구조화 출력 그대로입니다.
  - 웹 검색은 세 모델 모두 자체 검색입니다. 스키마가 프롬프트로 가므로 Claude 자체 검색의 인용이 충돌하지 않습니다.
  - union·선택 매개변수 한도 검사(`tests/schema-limits.test.js`)는 나중에 다시 구조화 출력을 쓰거나 다른 모델에서 같은 한도를 만날 때를 위해 남겨 둡니다.

## 5. 브라우저 직접 호출 (CORS)·헤더·키 확인

- 사전 요청(OPTIONS)에 `Access-Control-Allow-Origin: *`가 오고, 허용 헤더에 `Authorization`, `Content-Type`, `HTTP-Referer`, `X-Title`, `X-OpenRouter-Title`이 들어 있습니다. GitHub Pages에서 **서버 없이 바로 호출할 수 있습니다.**
- 엔드포인트: `POST https://openrouter.ai/api/v1/chat/completions`
- 헤더: `Authorization: Bearer <키>`, `Content-Type: application/json`. 선택으로 `HTTP-Referer`(앱 주소)와 `X-Title: Travel Pick`(문서는 `X-OpenRouter-Title`로 표기하고, `X-Title`도 받는다고 명시)을 넣습니다.
- **연결 테스트**: `GET https://openrouter.ai/api/v1/key` → `data.{label, limit, limit_remaining, usage, is_free_tier}`. 잘못된 키면 401이 옵니다. 모델 호출 비용 없이 키를 확인할 수 있습니다.

## 6. 오류 코드 (재시도 방침)

| 코드 | 뜻 | 앱 처리 |
|---|---|---|
| 400 | 잘못된 요청 | 재시도 안 함, 원문 표시 |
| 401 | 키가 없거나 잘못됨 | 재시도 안 함, 설정 화면 안내 |
| 402 | 크레딧 부족 | 재시도 안 함, OpenRouter 충전 안내 |
| 403 | 권한·모더레이션 차단 | 재시도 안 함 |
| 408 | 시간 초과 | 지수 백오프로 재시도 |
| 429 | 요청 한도 초과 | 지수 백오프로 재시도 (`Retry-After`가 있으면 따름) |
| 502 / 503 | 모델·제공사 문제 | 지수 백오프로 재시도 |

오류 본문 형태: `{ "error": { "code": number, "message": string, "metadata"?: {} } }`

## 7. 정하지 못한 것

- **원화 환율 기본값(PRD 14.2-6)**: 설정 기본값은 1,400원/USD입니다. 실제 환율은 설정 화면에서 직접 바꿉니다.
- **"떠오르는 여행지" 근거 우선순위(PRD 14.2-5)**: Phase 8 프롬프트를 작성할 때 정합니다.

## 출처

- API 개요: <https://openrouter.ai/docs/api-reference/overview>
- 웹 검색: <https://openrouter.ai/docs/features/web-search>
- 사용량·비용: <https://openrouter.ai/docs/use-cases/usage-accounting>
- 오류: <https://openrouter.ai/docs/api-reference/errors>
- 키·한도: <https://openrouter.ai/docs/api-reference/limits>
- 모델 목록(직접 호출): <https://openrouter.ai/api/v1/models>
- Anthropic 구조화 출력 제한·호환 기능: <https://platform.claude.com/docs/en/build-with-claude/structured-outputs>
- 웹 검색 엔진 지정(`engine`): <https://openrouter.ai/docs/features/web-search>
- 오류 응답 형식(`metadata.raw`): <https://openrouter.ai/docs/api-reference/errors>
