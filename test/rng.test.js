import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../js/sim/rng.js';

test('same seed gives the same sequence', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const sa = Array.from({ length: 5 }, a), sb = Array.from({ length: 5 }, b);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, Array.from({ length: 5 }, mulberry32(43)));
});

test('values are in [0, 1)', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 1000; i++) { const v = r(); assert.ok(v >= 0 && v < 1, String(v)); }
});
