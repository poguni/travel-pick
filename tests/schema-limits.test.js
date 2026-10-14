// AI 출력 스키마가 모델 제공사의 구조화 출력 제한 안에 있는지 — Anthropic: union type 매개변수 16개, 선택 매개변수 24개까지
// (넘으면 Claude 호출이 400 "요청 형식에 문제가 있어요"로 실패한다. Phase 13 이후 실제 사용에서 발견)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../js/core/schema.js';
import { setPeriodMode, updatePeriod } from '../js/core/project.js';
import { RESEARCH_ITEMS } from '../js/core/research.js';
import { recommendSchema, researchSchema, scoreSchema, opinionSchema, responsesSchema, verdictSchema } from '../js/ai/prompts.js';

const UNION_LIMIT = 16;
const OPTIONAL_LIMIT = 24;

/** { unions, optional, problems[] }: 타입 배열·anyOf 개수, required에 없는 속성 수, additionalProperties가 false가 아닌 객체 */
function inspect(schema) {
  let unions = 0;
  let optional = 0;
  const problems = [];
  const walk = (s, path) => {
    if (!s || typeof s !== 'object') return;
    if (Array.isArray(s.type) || s.anyOf) unions++;
    const isObject = s.type === 'object' || (Array.isArray(s.type) && s.type.includes('object'));
    if (isObject) {
      if (s.additionalProperties !== false) problems.push(`${path}: additionalProperties가 false가 아님`);
      const req = new Set(s.required ?? []);
      for (const [k, v] of Object.entries(s.properties ?? {})) {
        if (!req.has(k)) optional++;
        walk(v, `${path}.${k}`);
      }
    }
    if (s.items) walk(s.items, `${path}[]`);
    for (const key of ['minimum', 'maximum', 'minLength', 'maxLength', 'multipleOf']) if (key in s) problems.push(`${path}: 지원하지 않는 ${key}`);
  };
  walk(schema, '$');
  return { unions, optional, problems };
}

function projects() {
  const out = [];
  for (const tripType of ['overseas', 'domestic']) {
    const open = createProject({ tripType });
    const fixed = createProject({ tripType });
    setPeriodMode(fixed, 'month');
    updatePeriod(fixed, { nights: 3 });
    out.push([`${tripType} 미정`, open.project], [`${tripType} 확정`, fixed.project]);
  }
  return out;
}

describe('구조화 출력 스키마 제한 (Anthropic)', () => {
  const cases = [
    ...projects().map(([name, p]) => [`후보 추천 · ${name}`, recommendSchema(p)]),
    ['자료 수집 · 해외', researchSchema(RESEARCH_ITEMS.overseas)],
    ['자료 수집 · 국내', researchSchema(RESEARCH_ITEMS.domestic)],
    ['점수 초안', scoreSchema()],
    ['심사 R1', opinionSchema()],
    ['심사 R2', responsesSchema()],
    ['심사 R3', verdictSchema()],
  ];
  for (const [name, s] of cases) {
    test(name, () => {
      const r = inspect(s.schema);
      assert.ok(r.unions <= UNION_LIMIT, `union type ${r.unions}개 (한도 ${UNION_LIMIT})`);
      assert.ok(r.optional <= OPTIONAL_LIMIT, `선택 매개변수 ${r.optional}개 (한도 ${OPTIONAL_LIMIT})`);
      assert.deepEqual(r.problems, []);
    });
  }
  test('자료 수집 스키마에는 union type이 없다 (항목 수가 늘어도 안전)', () => {
    assert.equal(inspect(researchSchema(RESEARCH_ITEMS.overseas).schema).unions, 0);
  });
});
