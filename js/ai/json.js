// AI 응답 JSON 처리 — PRD 5.5
// 1) 스키마 출력 요청 → 2) 코드 블록 벗기고 파싱 → 3) 검증 실패 시 오류를 붙여 1회 재요청 → 4) 그래도 실패하면 원문 반환

/** 문자열에서 JSON 값 꺼내기 (코드 블록, 앞뒤 설명 허용) */
export function extractJson(text) {
  const s = String(text ?? '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    /* 아래에서 본문 속 JSON을 찾는다 */
  }
  const start = s.search(/[[{]/);
  if (start < 0) return { ok: false };
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) {
      try {
        return { ok: true, value: JSON.parse(s.slice(start, i + 1)) };
      } catch {
        return { ok: false };
      }
    }
  }
  return { ok: false };
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const matches = (v, t) => typeOf(v) === t || (t === 'number' && typeOf(v) === 'integer');

/**
 * 간단한 JSON 스키마 검증 (type, required, properties, items, enum만). 오류 문구 배열을 돌려준다.
 */
export function validate(value, schema, path = '') {
  const at = path || '(전체)';
  const errors = [];
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: ${JSON.stringify(schema.enum)} 중 하나여야 해요`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matches(value, t))) return [...errors, `${at}: ${types.join(' 또는 ')} 형식이어야 해요`];
  }
  if (typeOf(value) === 'object') {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path ? `${path}.` : ''}${key}: 필수 항목이 없어요`);
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in value) errors.push(...validate(value[key], sub, path ? `${path}.${key}` : key));
    }
  }
  if (typeOf(value) === 'array' && schema.items) value.forEach((item, i) => errors.push(...validate(item, schema.items, `${path}[${i}]`)));
  return errors;
}

const addUsage = (a, b) => ({ inTokens: a.inTokens + b.inTokens, outTokens: a.outTokens + b.outTokens, cost: a.cost == null || b.cost == null ? null : a.cost + b.cost });

function check(content, schema) {
  const parsed = extractJson(content);
  if (!parsed.ok) return { ok: false, errors: ['JSON을 찾지 못했어요. JSON만 출력해 주세요.'] };
  const errors = validate(parsed.value, schema.schema);
  return errors.length ? { ok: false, errors } : { ok: true, value: parsed.value };
}

/**
 * JSON 응답 받기. schema: { name, schema }.
 * 반환: { ok, value, citations, usage, retried } 또는 { ok: false, error, raw, usage }
 */
export async function chatJson(client, request, schema) {
  const first = await client.chat({ ...request, schema });
  if (!first.ok) return first;
  const r1 = check(first.content, schema);
  if (r1.ok) return { ok: true, value: r1.value, citations: first.citations, usage: first.usage, retried: false };

  const retryMessages = [
    ...request.messages,
    { role: 'assistant', content: first.content },
    { role: 'user', content: `방금 응답이 요구한 JSON 형식과 달라요. 아래 문제를 고쳐 JSON만 다시 출력해 주세요.\n- ${r1.errors.slice(0, 10).join('\n- ')}` },
  ];
  const second = await client.chat({ ...request, messages: retryMessages, schema });
  if (!second.ok) return { ...second, usage: first.usage };
  const usage = addUsage(first.usage, second.usage);
  const r2 = check(second.content, schema);
  if (r2.ok) return { ok: true, value: r2.value, citations: [...first.citations, ...second.citations], usage, retried: true };
  return { ok: false, error: { kind: 'invalid_json', message: r2.errors.join(' / ') }, raw: second.content, usage };
}
