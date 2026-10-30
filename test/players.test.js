import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYERS, byNumber } from '../js/data/players.js';

test('12 players, unique numbers, ascending', () => {
  assert.equal(PLAYERS.length, 12);
  const nums = PLAYERS.map(p => p.number);
  assert.deepEqual(nums, [...new Set(nums)].sort((a, b) => a - b));
  assert.deepEqual(nums, [10, 11, 14, 15, 19, 21, 24, 26, 38, 55, 96, 99]);
});

test('every player has a special with kind and desc', () => {
  for (const p of PLAYERS) {
    assert.ok(['oneshot', 'buff', 'instant'].includes(p.special.kind), p.name);
    assert.ok(p.special.desc.length > 8, p.name);
    assert.ok(p.special.name.length >= 2, p.name);
    assert.ok(p.special.duration > 0, p.name);
    assert.ok(['attack', 'defend'].includes(p.role), p.name);
    assert.equal(p.img, `img/${p.number}.jpg`);
  }
});

test('roles and special ids match spec', () => {
  const attack = PLAYERS.filter(p => p.role === 'attack').map(p => p.number);
  assert.deepEqual(attack, [10, 11, 14, 26, 99]);
  assert.equal(byNumber(55).special.id, 'train');
  assert.equal(byNumber(55).special.duration, 3);
  assert.equal(byNumber(38).special.id, 'press');
  assert.equal(byNumber(96).special.kind, 'instant');
  assert.equal(byNumber(10).special.kind, 'oneshot');
  assert.equal(byNumber(10).special.duration, 6);
  assert.equal(byNumber(7), undefined);
});
