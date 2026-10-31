import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KITS, GK_KITS, kitById, kitsFor, sideKits, wornKit } from '../js/data/kits.js';
import { createMatch } from '../js/sim/match.js';
import { byNumber } from '../js/data/players.js';

const GK = byNumber(21), MF = byNumber(10);

test('4 field kits and 4 goalkeeper kits with unique ids and full color sets', () => {
  assert.equal(KITS.length, 4);
  assert.equal(GK_KITS.length, 4);
  assert.equal(new Set([...KITS, ...GK_KITS].map(k => k.id)).size, 8);
  assert.deepEqual(KITS.slice(0, 2).map(k => k.id), ['home', 'away']);
  for (const k of [...KITS, ...GK_KITS]) {
    assert.ok(k.name.length >= 1 && k.name.length <= 5, k.id);
    for (const f of ['jersey', 'trim', 'number', 'shorts', 'shoe']) assert.match(k[f], /^#[0-9A-Fa-f]{6}$/, `${k.id}.${f}`);
  }
  assert.ok(GK_KITS.every(k => k.gk === true) && KITS.every(k => !k.gk));
});

test('조현우 picks from the goalkeeper kits, everyone else from the field kits', () => {
  assert.equal(kitsFor(GK), GK_KITS);
  assert.equal(kitsFor(MF), KITS);
  assert.equal(kitById('away').id, 'away');
  assert.equal(kitById(GK_KITS[2].id).gk, true);
  assert.equal(kitById('nope'), undefined);
});

test('sideKits: the AI wears away against home, home against anything else, and a different GK kit', () => {
  const a = sideKits('home');
  assert.equal(a.L.field.id, 'home'); assert.equal(a.R.field.id, 'away');
  assert.equal(a.L.gk, GK_KITS[0]); assert.notEqual(a.R.gk, a.L.gk);
  assert.equal(sideKits('third').R.field.id, 'home');
  const g = sideKits(GK_KITS[1].id);
  assert.equal(g.L.gk, GK_KITS[1]); assert.equal(g.L.field.id, 'home'); assert.equal(g.R.field.id, 'away'); assert.notEqual(g.R.gk, GK_KITS[1]);
  assert.equal(sideKits('nope').L.field.id, 'home');
});

test('wornKit picks the GK kit only for the goalkeeper', () => {
  const s = sideKits('fourth');
  assert.equal(wornKit(s.L, GK), s.L.gk);
  assert.equal(wornKit(s.L, MF).id, 'fourth');
});

test('createMatch stores side kits, defaulting to home vs away', () => {
  const base = { home: MF, away: byNumber(99) };
  assert.equal(createMatch(base).kits.R.field.id, 'away');
  assert.equal(createMatch({ ...base, kit: 'third' }).kits.L.field.id, 'third');
});
