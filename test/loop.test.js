import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoop } from '../js/loop.js';
import { DT } from '../js/sim/constants.js';

function harness() {
  let steps = 0; const alphas = [];
  const loop = createLoop({ step: () => { steps++; }, render: a => { alphas.push(a); } });
  return { loop, get steps() { return steps; }, alphas };
}

test('fixed step: 1s of wall time produces 120 steps', () => {
  const h = harness();
  h.loop.tick(0);
  for (let ms = 1000 / 60; ms <= 1000 + 1e-6; ms += 1000 / 60) h.loop.tick(ms);
  assert.ok(Math.abs(h.steps - Math.round(1 / DT)) <= 1, `steps ${h.steps}`);
});

test('accumulator caps at 0.25s after a long pause (no catch-up burst)', () => {
  const h = harness();
  h.loop.tick(0); h.loop.tick(16);
  const before = h.steps;
  h.loop.tick(5016);                       // 5초 멈춤
  assert.ok(h.steps - before <= Math.round(0.25 / DT) + 1, `burst of ${h.steps - before} steps`);
});

test('render receives alpha in [0,1)', () => {
  const h = harness();
  h.loop.tick(0); h.loop.tick(7); h.loop.tick(21); h.loop.tick(30);
  assert.ok(h.alphas.length >= 3);
  for (const a of h.alphas) assert.ok(a >= 0 && a < 1, `alpha ${a}`);
});
