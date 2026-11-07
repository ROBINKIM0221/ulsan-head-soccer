import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KITS, GK_KITS, kitById, kitsFor, sideKits, wornKit } from '../js/data/kits.js';
import { createMatch } from '../js/sim/match.js';
import { byNumber } from '../js/data/players.js';

const GK = byNumber(21), MF = byNumber(10);

test('5 field kits (home, away, third, fourth, retro) and 4 goalkeeper kits with unique ids and full color sets', () => {
  assert.equal(KITS.length, 5);
  assert.equal(GK_KITS.length, 4);
  assert.equal(new Set([...KITS, ...GK_KITS].map(k => k.id)).size, 9);
  assert.deepEqual(KITS.slice(0, 2).map(k => k.id), ['home', 'away']);
  for (const k of [...KITS, ...GK_KITS]) {
    assert.ok(k.name.length >= 1 && k.name.length <= 5, k.id);
    for (const f of ['jersey', 'trim', 'number', 'shorts', 'shoe']) assert.match(k[f], /^#[0-9A-Fa-f]{6}$/, `${k.id}.${f}`);
  }
  assert.ok(GK_KITS.every(k => k.gk === true) && KITS.every(k => !k.gk));
  // 2026-11-01 형준: 울산 호랑이 시절 줄무늬 유니폼을 '레트로'로. 줄무늬 색(stripe)은 레트로만 있다
  const retro = kitById('retro');
  assert.equal(retro.name, '레트로');
  assert.match(retro.stripe, /^#[0-9A-Fa-f]{6}$/);
  assert.ok(KITS.filter(k => k.stripe).length === 1);
  // 2026-11-01 형준 "비슷한 계열끼리는 안겹치게": 필드 킷은 진한 파랑 계열(dark)과 밝은 계열(light)로 나뉜다
  assert.deepEqual(KITS.map(k => k.id + ':' + k.tone), ['home:dark', 'away:light', 'third:dark', 'fourth:light', 'retro:dark']);
});

test('조현우 picks from the goalkeeper kits, everyone else from the field kits', () => {
  assert.equal(kitsFor(GK), GK_KITS);
  assert.equal(kitsFor(MF), KITS);
  assert.equal(kitById('away').id, 'away');
  assert.equal(kitById(GK_KITS[2].id).gk, true);
  assert.equal(kitById('nope'), undefined);
});

// 2026-11-01 형준: "상대 유니폼은 그냥 아무거나 나오게" → 이어서 "비슷한 계열끼리는 안겹치게" — 상대는 내 것과 다른 계열(dark↔light)의 유니폼 중 무작위(rng), GK 는 내 것과 다른 것 중 무작위
test('sideKits: the AI wears a random kit of the other tone (dark vs light), and a random GK kit that is not mine', () => {
  const first = () => 0, last = () => 0.999;
  const a = sideKits('home', first);
  assert.equal(a.L.field.id, 'home'); assert.equal(a.R.field.id, 'away');
  assert.equal(a.L.gk, GK_KITS[0]); assert.equal(a.R.gk, GK_KITS[1]);
  const z = sideKits('home', last);
  assert.equal(z.R.field.id, 'fourth'); assert.equal(z.R.gk, GK_KITS.at(-1));
  assert.equal(sideKits('retro', first).R.field.id, 'away');
  assert.equal(sideKits('away', first).R.field.id, 'home'); assert.equal(sideKits('away', last).R.field.id, 'retro');
  for (const k of KITS) for (let i = 0; i < 30; i++) {
    const s = sideKits(k.id);
    assert.notEqual(s.R.field.tone, s.L.field.tone, k.id + ' vs ' + s.R.field.id); assert.ok(KITS.includes(s.R.field)); assert.notEqual(s.R.gk, s.L.gk); assert.ok(GK_KITS.includes(s.R.gk));
  }
  const g = sideKits(GK_KITS[1].id, first);
  assert.equal(g.L.gk, GK_KITS[1]); assert.equal(g.L.field.id, 'home'); assert.equal(g.R.field.id, 'away'); assert.equal(g.R.gk, GK_KITS[0]);
  assert.equal(sideKits('nope').L.field.id, 'home');
});

// 2026-11-07 형준 "화면 왼쪽 반이 1p 오른쪽 2p": 2인 대전은 오른쪽도 유니폼을 고른다 (kitR). 없거나 엉터리면 전처럼 무작위
test('sideKits: an explicit right-side kit (2P) is worn as given, field or GK, and a bad id falls back to random', () => {
  const s = sideKits('home', () => 0, 'fourth');
  assert.equal(s.R.field.id, 'fourth'); assert.equal(s.R.gk, GK_KITS[1], 'GK slot still random (not mine)');
  const g = sideKits('home', () => 0, GK_KITS[2].id);
  assert.equal(g.R.gk, GK_KITS[2]); assert.equal(g.R.field.id, 'away', 'field slot still random of the other tone');
  assert.equal(sideKits('home', () => 0, 'nope').R.field.id, 'away');
  assert.equal(sideKits('home', () => 0, null).R.field.id, 'away');
  // 2026-11-08 형준 "2p 유니폼도 5개 중에 고르게": 2P 는 1P 와 같은 유니폼·같은 계열도 된다
  assert.equal(sideKits('home', () => 0, 'home').R.field.id, 'home');
  assert.equal(sideKits('home', () => 0, 'third').R.field.id, 'third');
});

test('wornKit picks the GK kit only for the goalkeeper', () => {
  const s = sideKits('fourth');
  assert.equal(wornKit(s.L, GK), s.L.gk);
  assert.equal(wornKit(s.L, MF).id, 'fourth');
});

test('createMatch stores side kits: mine as chosen (home by default), the AI picked with the match rng', () => {
  const base = { home: MF, away: byNumber(99) };
  const m = createMatch(base);
  assert.equal(m.kits.L.field.id, 'home'); assert.notEqual(m.kits.R.field.id, 'home'); assert.ok(KITS.includes(m.kits.R.field));
  assert.equal(createMatch({ ...base, kit: 'third' }).kits.L.field.id, 'third');
  assert.equal(createMatch({ ...base, kit: 'retro', rng: () => 0 }).kits.R.field.id, 'away');
  assert.equal(createMatch({ ...base, rng: () => 0.999 }).kits.R.field.id, 'fourth');
});
