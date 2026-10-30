import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, PHYS, DT, MATCH } from '../js/sim/constants.js';
import { createWorld, headCenter, footPoint } from '../js/sim/physics.js';
import { createAiState, decide, predictLanding, shouldSubstitute, pickSubstitute } from '../js/sim/ai.js';
import { mulberry32 } from '../js/sim/rng.js';
import { byNumber, PLAYERS } from '../js/data/players.js';

const P10 = byNumber(10), P99 = byNumber(99);
const world = () => { const w = createWorld(P10, P99); w.players.L.x = 200; return w; };

test('predictLanding returns the ground point within the horizon', () => {
  const w = world(); w.ball.x = 640; w.ball.y = 300; w.ball.vx = 300; w.ball.vy = 0;
  const p = predictLanding(w.ball, 1);
  const tFall = Math.sqrt(2 * (FIELD.GROUND - PHYS.BALL_R - 300) / PHYS.GRAVITY);   // ≈ 0.54s
  assert.ok(Math.abs(p.y - (FIELD.GROUND - PHYS.BALL_R)) < 2, `y ${p.y}`);
  assert.ok(Math.abs(p.x - (640 + 300 * tFall)) < 25, `x ${p.x}`);
});

test('AI moves toward the predicted landing only after the reaction delay', () => {
  const w = world(); const ai = createAiState('first', mulberry32(1));
  w.ball.x = 700; w.ball.y = 400; w.ball.vx = 0; w.ball.vy = 0;        // R(960) 기준 왼쪽에 떨어질 공
  let early = 0, late = 0;
  for (let i = 0; i < 20; i++) { const o = decide(w, 'R', ai, DT); if (o.left || o.right) early++; }   // 0.167초
  for (let i = 0; i < 12; i++) { const o = decide(w, 'R', ai, DT); if (o.left) late++; }               // 0.27초까지
  assert.equal(early, 0, 'no movement before 0.18s');
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

test('AI holds a buff special until the ball is within 350px; one-shots fire anytime', () => {
  const w = createWorld(P10, byNumber(19)); w.players.R.gauge = 100;      // 김영권 거인(지속형)
  const ai = createAiState('first', mulberry32(21));
  w.ball.x = 200; assert.equal(decide(w, 'R', ai, DT).special, false);
  w.ball.x = 700; assert.equal(decide(w, 'R', ai, DT).special, true);
  const w2 = createWorld(P10, byNumber(10)); w2.players.R.gauge = 100;    // 이동경 레이저(한 방형)
  w2.ball.x = 200; assert.equal(decide(w2, 'R', createAiState('first', mulberry32(22)), DT).special, true);
});

test('AI kicks when the ball is in front within kick range', () => {
  const w = world(); const ai = createAiState('first', mulberry32(3));
  const f = footPoint(w.players.R);
  w.ball.x = f.x - 20; w.ball.y = f.y; w.ball.vx = 0; w.ball.vy = 0;   // R 은 왼쪽을 본다
  assert.equal(decide(w, 'R', ai, DT).kick, true);
  w.ball.x = w.players.R.x + 60;                                        // 등 뒤
  assert.equal(decide(w, 'R', ai, DT).kick, false);
});

test('AI uses its special at gauge 100: first immediately, youth after 3s', () => {
  const w = world(); w.players.R.gauge = 100;
  const first = createAiState('first', mulberry32(4));
  assert.equal(decide(w, 'R', first, DT).special, true);
  const youth = createAiState('youth', mulberry32(5));
  let fired = -1;
  for (let i = 0; i < 400; i++) { if (decide(w, 'R', youth, DT).special) { fired = i * DT; break; } }
  assert.ok(fired >= 2.9 && fired <= 3.1, `youth fired at ${fired}`);
  w.players.R.gauge = 50;
  assert.equal(decide(w, 'R', createAiState('first', mulberry32(6)), DT).special, false);
});

test('legend fires attacking specials only inside the final 40%, defensive ones only with the ball in its half', () => {
  const w = world(); w.players.R.gauge = 100;                 // R 의 선수는 야고(공격형 대포 헤딩)
  const ai = createAiState('legend', mulberry32(7));
  w.players.R.x = 900; assert.equal(decide(w, 'R', ai, DT).special, false);
  w.players.R.x = 400; assert.equal(decide(w, 'R', ai, DT).special, true);
  const w2 = createWorld(P10, byNumber(19)); w2.players.R.gauge = 100;   // 김영권(수비형)
  const ai2 = createAiState('legend', mulberry32(8));
  w2.ball.x = 300; assert.equal(decide(w2, 'R', ai2, DT).special, false);
  w2.ball.x = 900; assert.equal(decide(w2, 'R', ai2, DT).special, true);
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
