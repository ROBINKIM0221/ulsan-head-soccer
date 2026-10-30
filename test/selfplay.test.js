import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateMatch, runTable } from '../tools/selfplay.js';
import { byNumber, PLAYERS } from '../js/data/players.js';

test('simulateMatch is deterministic for a seed and finishes with a result', () => {
  const a = simulateMatch(byNumber(10), byNumber(99), 'first', 7);
  const b = simulateMatch(byNumber(10), byNumber(99), 'first', 7);
  assert.deepEqual(a, b);
  assert.ok(['win', 'lose', 'draw'].includes(a.result));
  assert.equal(a.result, a.L > a.R ? 'win' : a.L < a.R ? 'lose' : 'draw');
  const c = simulateMatch(byNumber(10), byNumber(99), 'first', 8);
  assert.ok(Number.isInteger(c.L) && Number.isInteger(c.R));
});

test('runTable returns an NxN table of L win rates in [0,1] and one average per player', () => {
  const players = [byNumber(10), byNumber(19), byNumber(55)];
  const t = runTable({ games: 2, difficulty: 'first', seed: 1, players });
  assert.equal(t.cells.length, 3);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (i === j) assert.equal(t.cells[i][j], null);
    else assert.ok(t.cells[i][j] >= 0 && t.cells[i][j] <= 1, `cell ${i},${j} = ${t.cells[i][j]}`);
  }
  assert.equal(t.avg.length, 3);
  for (const a of t.avg) assert.ok(a >= 0 && a <= 1);
  assert.deepEqual(t.names, players.map(p => p.name));
  assert.equal(runTable({ games: 1, difficulty: 'first', seed: 1, players: PLAYERS.slice(0, 2) }).cells.length, 2);
});
