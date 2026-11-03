import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// 2026-11-03 형준 "처음 링크 눌렀을 때 조작키랑 이런게 잠깐 뜨는데, 로딩 화면이 어색해서": 사진 24장이 내려오는 동안
// 빈 경기장·조작 버튼이 아니라 엠블럼·제목이 있는 오버레이가 먼저 보인다. 선택 화면이 그 자리를 덮어쓴다 (screens.js show()).
test('index.html opens with the loading sheet already visible in #overlay, so the arena and its buttons are covered from the first paint', () => {
  const line = html.split(/\r?\n/).find(l => l.includes('id="overlay"'));
  assert.ok(!/id="overlay"[^>]*hidden/.test(line), 'overlay must not start hidden: ' + line);
  for (const part of ['class="sheet loading"', 'class="brand"', 'class="emblem"', '1 VS 1', 'class="loading-bar"']) assert.ok(line.includes(part), part + ' in ' + line);
});
