import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DT, MATCH, NO_INPUT } from '../js/sim/constants.js';
import { createMatch, stepMatch } from '../js/sim/match.js';
import { mulberry32 } from '../js/sim/rng.js';
import { byNumber } from '../js/data/players.js';
import { startParty, updateParty, drawParty } from '../js/render/party.js';
import { eventSound } from '../js/sound.js';
import { KEYS, KEYS_2P } from '../js/ui/input.js';

// 2026-11-07 형준 "2인 모드를 만들어서 선수 두 명이 하게 만들자", "ai 모드는 그대로 유지하면서 2인 모드 추가".
// twoPlayer 경기는 오른쪽도 사람 입력(stepMatch 4번째 인자)으로 움직이고, AI·난이도 속도 보정·교체가 모두 꺼진다. 1인 경기는 그대로.
const inp = o => ({ ...NO_INPUT, ...o });
const mk = (opts = {}) => createMatch({ home: byNumber(10), away: byNumber(99), difficulty: 'youth', rng: mulberry32(7), ...opts });
const run = (m, seconds, L = NO_INPUT, R) => { const ev = []; for (let i = 0, n = Math.round(seconds / DT); i < n; i++) ev.push(...stepMatch(m, L, DT, R)); return ev; };
const toPlay = m => run(m, MATCH.GOAL_PAUSE + DT);

test('two-player: the right player follows the 4th-argument inputs and the AI never moves it', () => {
  const m = mk({ twoPlayer: true }); toPlay(m);
  assert.equal(m.twoPlayer, true);
  const R = m.world.players.R, x0 = R.x;
  run(m, 1.0);                                    // 아무도 안 누름: AI 가 있었으면 움직였을 시간
  assert.equal(R.x, x0, 'R stands still without input');
  run(m, 0.5, NO_INPUT, inp({ left: true }));
  assert.ok(R.x < x0 - 50, 'R walks left on P2 input: ' + (R.x - x0));
  const ai = mk(); toPlay(ai); run(ai, 1.0);
  assert.notEqual(ai.world.players.R.x, x0, '1P: the AI still moves R');
});

test('two-player: no difficulty speed handicap on R and no substitution for anyone', () => {
  const m = mk({ twoPlayer: true }); toPlay(m);
  stepMatch(m, NO_INPUT, DT, NO_INPUT);
  assert.equal(m.world.players.R.mods.speed, m.world.players.L.mods.speed, 'same speed (youth would be 0.65x for the AI)');
  const ev = run(m, 0.2, inp({ sub: true }));
  assert.equal(m.phase, 'play'); assert.ok(!ev.some(e => e.type === 'phase' && e.phase === 'sub'));
  assert.equal(m.subUsed.L, false);
  const ai = mk(); toPlay(ai); stepMatch(ai, NO_INPUT, DT);
  assert.ok(ai.world.players.R.mods.speed < 1, '1P youth: the AI is slowed');
});

test('two-player: when the right player wins, the party is theirs with VAMOS! and confetti, and the win tune plays', () => {
  const m = mk({ twoPlayer: true }); m.phase = 'over'; m.result = 'lose';   // result 는 왼쪽 기준 그대로
  const party = startParty(m);
  assert.equal(party.side, 'R');
  for (let i = 0; i < Math.round(3 / DT); i++) updateParty(party, m, DT);
  const out = []; const ctx = new Proxy({}, { get: (_, k) => (k === 'fillText' || k === 'strokeText') ? s => out.push(s) : () => ({}) });
  drawParty(ctx, party, m, {}, 1);
  assert.ok(out.includes('VAMOS!') && !out.includes('LOSE'), out.join(','));
  assert.ok(party.confetti.length > 0);
  assert.equal(eventSound({ type: 'phase', phase: 'over' }, m), 'win');
  const ai = mk(); ai.phase = 'over'; ai.result = 'lose';
  assert.equal(eventSound({ type: 'phase', phase: 'over' }, ai), 'lose', '1P: losing still sounds sad');
});

test('two-player keys: P1 on WASD+F, P2 on arrows+Enter, no key shared; 1P keys unchanged', () => {
  for (const side of ['L', 'R']) assert.deepEqual([...new Set(Object.values(KEYS_2P[side]))].sort(), ['jump', 'kick', 'left', 'right'], side);
  assert.equal(KEYS_2P.L.KeyA, 'left'); assert.equal(KEYS_2P.L.KeyW, 'jump'); assert.equal(KEYS_2P.L.KeyF, 'kick');
  assert.equal(KEYS_2P.R.ArrowLeft, 'left'); assert.equal(KEYS_2P.R.ArrowUp, 'jump'); assert.equal(KEYS_2P.R.Enter, 'kick');
  assert.ok(!Object.keys(KEYS_2P.L).some(k => k in KEYS_2P.R), 'disjoint');
  assert.equal(KEYS.ArrowLeft, 'left'); assert.equal(KEYS.KeyA, 'left'); assert.equal(KEYS.KeyZ, 'kick');
});
