// Phase 0 기본 점검: 파일 연결, 디자인 토큰, 모듈 로드
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

test('index.html이 참조하는 로컬 CSS·JS 파일이 모두 존재한다', () => {
  const html = read('index.html');
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !/^https?:/.test(u));
  assert.ok(refs.includes('js/main.js'), 'js/main.js를 불러와야 함');
  for (const ref of refs) assert.ok(existsSync(join(root, ref)), `${ref} 없음`);
});

test('tokens.css가 DESIGN.md 3장의 토큰을 모두 같은 값으로 갖는다', () => {
  const design = read('design/DESIGN.md');
  const block = design.match(/## 3\. 디자인 토큰[\s\S]*?```css([\s\S]*?)```/)[1];
  const parse = (css) => Object.fromEntries(
    [...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
  const expected = parse(block.slice(0, block.indexOf('body {')));
  const actual = parse(read('css/tokens.css'));
  assert.ok(Object.keys(expected).length > 60, 'DESIGN.md에서 토큰을 읽지 못함');
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(actual[name], value, `${name} 값이 다름`);
  }
});

test('색은 tokens.css에만 둔다: 다른 CSS·JS에 HEX 색이 없다 (DESIGN.md 14장)', () => {
  const files = [
    ...readdirSync(join(root, 'css')).filter((f) => f.endsWith('.css') && f !== 'tokens.css').map((f) => `css/${f}`),
    ...['js/ui', 'js/ui/components', 'js/screens'].flatMap((d) =>
      readdirSync(join(root, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`),
    ),
  ];
  for (const f of files) {
    const hex = read(f).match(/#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b(?![\w-])/g);
    assert.equal(hex, null, `${f}에 HEX 색: ${hex}`);
  }
});

test('DOM을 쓰지 않는 모듈은 Node에서 불러올 수 있다', async () => {
  const dirs = ['js/core', 'js/ai'];
  const files = ['js/state.js', 'js/selectors.js', 'js/router.js'];
  for (const d of dirs) {
    for (const f of readdirSync(join(root, d))) if (f.endsWith('.js')) files.push(`${d}/${f}`);
  }
  for (const f of files) await import(pathToFileURL(join(root, f)).href);
});
