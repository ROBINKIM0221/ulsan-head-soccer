import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, PHYS, DT, MATCH, DIFFICULTY } from '../js/sim/constants.js';
import { createWorld, headCenter, footPoint } from '../js/sim/physics.js';
import { createAiState, decide, predictLanding, shouldSubstitute, pickSubstitute } from '../js/sim/ai.js';
import { mulberry32 } from '../js/sim/rng.js';
import { byNumber, PLAYERS } from '../js/data/players.js';

const P10 = byNumber(10), P99 = byNumber(99);
const world = () => { const w = createWorld(P10, P99); w.players.L.x = 200; return w; };

test('predictLanding returns the ground point within the horizon', () => {
  const w = world(); w.ball.x = 640; w.ball.y = 300; w.ball.vx = 300; w.ball.vy = 0;
  const p = predictLanding(w.ball, 1);
  const tFall = Math.sqrt(2 * (FIELD.GROUND - PHYS.BALL_R - 300) / PHYS.BALL_GRAVITY);
  assert.ok(Math.abs(p.y - (FIELD.GROUND - PHYS.BALL_R)) < 2, `y ${p.y}`);
  assert.ok(Math.abs(p.x - (640 + 300 * tFall)) < 25, `x ${p.x}`);
});

test('AI moves toward the predicted landing only after the reaction delay', () => {
  const w = world(); const ai = createAiState('first', mulberry32(1));
  w.ball.x = 700; w.ball.y = 400; w.ball.vx = 0; w.ball.vy = 0;        // R(960) 기준 왼쪽에 떨어질 공
  const ticks = Math.floor(DIFFICULTY.first.reaction / DT);
  let early = 0, late = 0;
  for (let i = 0; i < ticks - 2; i++) { const o = decide(w, 'R', ai, DT); if (o.left || o.right) early++; }   // 반응 지연 전
  for (let i = 0; i < 14; i++) { const o = decide(w, 'R', ai, DT); if (o.left) late++; }                     // 지연이 지난 직후
  assert.equal(early, 0, `no movement before ${DIFFICULTY.first.reaction}s`);
  assert.ok(late > 0, 'moves left toward the ball afterwards');
});

test('youth aims with a much larger error than legend (statistical)', () => {
  const spread = diff => {
    const xs = [];
    for (let s = 0; s < 200; s++) {
      const w = world(); w.ball.x = 640; w.ball.y = 300; w.ball.vx = 0; w.ball.vy = 0;
      const ai = createAiState(diff, mulberry32(s)); ai.reactT = 0;
      decide(w, 'R', ai, DT);
      xs.push(ai.target - predictLanding(w.ball, 1).x);
    }
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  };
  const y = spread('youth'), l = spread('legend');
  assert.ok(y > 3 * l, `youth ${y} vs legend ${l}`);
  assert.ok(l > 0, 'legend still has some error');
});

test('AI jumps when the ball is above its head', () => {
  const w = world(); const ai = createAiState('first', mulberry32(2));
  const h = headCenter(w.players.R);
  w.ball.x = h.x + 10; w.ball.y = h.y - 150; w.ball.vx = 0; w.ball.vy = 0;
  assert.equal(decide(w, 'R', ai, DT).jump, true);
  w.ball.x = h.x - 300;
  assert.equal(decide(w, 'R', ai, DT).jump, false);
});

test('AI kicks when the ball is in front within kick range', () => {
  const w = world(); const ai = createAiState('first', mulberry32(3));
  const f = footPoint(w.players.R);
  w.ball.x = f.x - 20; w.ball.y = f.y; w.ball.vx = 0; w.ball.vy = 0;   // R 은 왼쪽을 본다
  assert.equal(decide(w, 'R', ai, DT).kick, true);
  w.ball.x = w.players.R.x + 60;                                        // 등 뒤
  assert.equal(decide(w, 'R', ai, DT).kick, false);
});

test('shouldSubstitute after 45s, once, with the ball far from its own goal; pickSubstitute by score', () => {
  const m = { clock: MATCH.LEN - MATCH.AI_SUB_AFTER, subUsed: { L: false, R: false }, scores: { L: 1, R: 0 },
    world: { ball: { x: 600 } }, used: { L: [P10], R: [P99] } };
  assert.equal(shouldSubstitute(m), true);
  assert.equal(shouldSubstitute({ ...m, clock: 50 }), false);
  assert.equal(shouldSubstitute({ ...m, subUsed: { L: false, R: true } }), false);
  assert.equal(shouldSubstitute({ ...m, world: { ball: { x: 1000 } } }), false);
  const losing = pickSubstitute(m, mulberry32(9));
  assert.equal(losing.role, 'attack');
  assert.ok(![10, 99].includes(losing.number));
  const tied = pickSubstitute({ ...m, scores: { L: 1, R: 1 } }, mulberry32(10));
  assert.equal(tied.role, 'defend');
  assert.ok(PLAYERS.includes(tied));
});
