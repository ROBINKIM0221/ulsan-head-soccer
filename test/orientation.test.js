import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageMetrics } from '../js/ui/orientation.js';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// 2026-11-12 형준 "UI랑 게임 최대한 예뻐보이게": 경기장(16:9) 바깥 여백을 단색 띠로 두지 않고 경기장 그림을 이어 그린다.
// stageMetrics 는 뷰포트에서 배율 k(논리 1280×720 → CSS px)와 바깥 여백(논리 px)을 계산한다.
test('stageMetrics: a 16:9 viewport has no bleed and scale = width / 1280', () => {
  const m = stageMetrics(1280, 720);
  assert.equal(m.rotated, false); near(m.k, 1); near(m.cw, 1280); near(m.ch, 720); near(m.bleedX, 0); near(m.bleedY, 0);
  assert.equal(m.compact, false); assert.equal(m.tiny, false);
});

test('stageMetrics: a wide phone fits the height and bleeds sideways (logical px)', () => {
  const m = stageMetrics(844, 390);
  near(m.k, 390 / 720); near(m.cw, 390 * 16 / 9); near(m.ch, 390);
  near(m.bleedX, (844 - 390 * 16 / 9) / 2 / (390 / 720)); near(m.bleedY, 0);
  assert.equal(m.compact, true); assert.equal(m.tiny, false);
  assert.equal(stageMetrics(658, 320).tiny, true);
});

test('stageMetrics: a tall viewport (tablet, 16:10 laptop) fits the width and bleeds up and down', () => {
  const m = stageMetrics(1024, 768);
  near(m.k, 0.8); near(m.cw, 1024); near(m.ch, 576); near(m.bleedX, 0); near(m.bleedY, 96 / 0.8);
});

test('stageMetrics: a portrait viewport is the same stage lying on its side', () => {
  const p = stageMetrics(390, 844), l = stageMetrics(844, 390);
  assert.equal(p.rotated, true); assert.equal(l.rotated, false);
  for (const key of ['w', 'h', 'k', 'cw', 'ch', 'bleedX', 'bleedY', 'compact', 'tiny']) assert.equal(p[key], l[key], key);
});
