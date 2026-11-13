import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, PHYS, DT, MATCH, GAUGE, NO_INPUT } from '../js/sim/constants.js';
import { headCenter } from '../js/sim/physics.js';
import { createMatch, stepMatch, requestSubstitute, resumeFromSub, substitute, currentDefs } from '../js/sim/match.js';
import { mulberry32 } from '../js/sim/rng.js';
import { byNumber } from '../js/data/players.js';

const P10 = byNumber(10), P99 = byNumber(99), P19 = byNumber(19);
const inp = o => ({ ...NO_INPUT, ...o });
const mk = (opts = {}) => createMatch({ home: P10, away: P99, difficulty: 'first', rng: mulberry32(1), ...opts });

function run(m, seconds, inputs = NO_INPUT) {
  const ev = [];
  for (let i = 0, n = Math.round(seconds / DT); i < n; i++) ev.push(...stepMatch(m, typeof inputs === 'function' ? inputs(i) : inputs, DT));
  return ev;
}
const toPlay = m => run(m, MATCH.GOAL_PAUSE + DT);
// 공을 양 선수에게서 멀리, 공중에 띄워 둔다 (AI 가 바로 건드리지 못하게)
const parkBall = m => { m.world.ball.held = { side: 'L', t: 999 }; };
const shootRight = m => { const b = m.world.ball; b.held = null; b.x = 1190; b.y = 600; b.vx = 600; b.vy = 0; m.world.players.R.x = 640; };

test('kickoff lasts 1s with the clock frozen, then play', () => {
  const m = mk();
  run(m, 0.5);
  assert.equal(m.phase, 'kickoff'); assert.equal(m.clock, MATCH.LEN);
  const ev = run(m, 0.6);
  assert.equal(m.phase, 'play');
  assert.ok(ev.some(e => e.type === 'phase' && e.phase === 'play'));
  const atPlay = m.clock;
  assert.ok(atPlay <= MATCH.LEN && atPlay > MATCH.LEN - 0.15, `clock started late: ${atPlay}`);
  run(m, 1);
  assert.ok(Math.abs((atPlay - m.clock) - 1) < 0.02, `clock ran ${atPlay - m.clock} in 1s`);
});

test('after 90s the match is over or in golden goal, consistent with the score', () => {
  const m = mk();
  // 골마다 2초(연출+킥오프) 시계가 멈추므로 상태가 바뀔 때까지 돌린다 (최대 200초)
  for (let t = 0; t < 200 && m.phase !== 'over' && m.phase !== 'golden'; t += 1) run(m, 1);
  if (m.scores.L === m.scores.R) { assert.equal(m.phase, 'golden'); assert.ok(m.clock <= MATCH.GOLDEN); }
  else { assert.equal(m.phase, 'over'); assert.equal(m.result, m.scores.L > m.scores.R ? 'win' : 'lose'); }
});

test('tie at 90s goes to golden goal for up to 30s, then draw', () => {
  const m = mk(); toPlay(m); parkBall(m);
  m.clock = 0.01;
  const ev = run(m, 0.05);
  assert.equal(m.phase, 'golden');
  assert.ok(ev.some(e => e.type === 'phase' && e.phase === 'golden'));
  assert.ok(Math.abs(m.clock - MATCH.GOLDEN) < 0.1);
  m.clock = 0.01;
  run(m, 0.05);
  assert.equal(m.phase, 'over'); assert.equal(m.result, 'draw');
});

test('a goal in golden goal ends the match immediately', () => {
  const m = mk(); toPlay(m); parkBall(m);
  m.phase = 'golden'; m.clock = 20;
  shootRight(m);
  const ev = run(m, 0.3);
  assert.ok(ev.some(e => e.type === 'goal' && e.scorer === 'L'));
  assert.equal(m.phase, 'over'); assert.equal(m.result, 'win'); assert.deepEqual(m.scores, { L: 1, R: 0 });
});

test('a goal pauses 1s, scores, gives the conceding side the CONCEDE gauge bonus, then resets kickoff', () => {
  const m = mk(); toPlay(m);
  shootRight(m);
  const ev = run(m, 0.3);
  assert.equal(ev.filter(e => e.type === 'goal').length, 1);
  assert.equal(m.phase, 'goal'); assert.deepEqual(m.scores, { L: 1, R: 0 });
  assert.equal(m.world.players.R.gauge, GAUGE.CONCEDE);
  const clockAtGoal = m.clock;
  run(m, MATCH.GOAL_PAUSE + DT);
  assert.equal(m.phase, 'kickoff');
  assert.equal(m.world.players.L.x, 320); assert.equal(m.world.players.R.x, 960);
  assert.deepEqual([m.world.ball.x, m.world.ball.y], [640, 300]);
  assert.equal(m.clock, clockAtGoal, 'clock frozen during goal pause');
});

test('gauge: +TOUCH per touch, +PERFECT per perfect header, fires at 100', () => {
  const m = mk({ home: P19 }); toPlay(m);   // 게이지 배율이 1인 선수로 잰다 (이동경은 2026-11-13 부터 0.45배)
  const L = m.world.players.L, h = headCenter(L);
  m.world.players.R.x = 1160; m.world.players.R.y = FIELD.GROUND;
  Object.assign(m.world.ball, { held: null, x: h.x, y: h.y - h.r - PHYS.BALL_R - 5, vx: 0, vy: 200 });
  run(m, 0.1);
  assert.equal(L.gauge, GAUGE.TOUCH);

  // 퍼펙트: 공중에서 위앞쪽 30°, 상대속도 600
  const m2 = mk({ home: P19 }); toPlay(m2); const L2 = m2.world.players.L;
  m2.world.players.R.x = 1160;
  L2.onGround = false; L2.y = FIELD.GROUND - 60; L2.vy = 0;
  const h2 = headCenter(L2), a = Math.PI / 6, nx = Math.sin(a), ny = -Math.cos(a), d = h2.r + PHYS.BALL_R + 1;
  Object.assign(m2.world.ball, { held: null, x: h2.x + nx * d, y: h2.y + ny * d, vx: -nx * 600, vy: -ny * 600 });
  run(m2, DT);
  assert.equal(L2.gauge, GAUGE.PERFECT);

  L.gauge = GAUGE.MAX - 2; L.lastTouchT = -1;
  Object.assign(m.world.ball, { x: h.x, y: h.y - h.r - PHYS.BALL_R - 5, vx: 0, vy: 200 });
  run(m, 0.1);
  assert.ok(L.active !== null && L.gauge === 0, 'capped at 100 and fired automatically');
});

test('gauge gain scales with the player\'s special.gaugeRate', () => {
  const m = createMatch({ home: byNumber(55), away: P99, difficulty: 'first', rng: mulberry32(1) });   // 토마스 0.75 (이진현 0.45 는 2026-11-13 기본 속도로 돌아갔다)
  toPlay(m);
  const L = m.world.players.L, h = headCenter(L);
  m.world.players.R.x = 1160;
  Object.assign(m.world.ball, { held: null, x: h.x, y: h.y - h.r - PHYS.BALL_R - 5, vx: 0, vy: 200 });
  run(m, 0.1);
  assert.equal(L.gauge, GAUGE.TOUCH * 0.75);
});

test('the special fires automatically when the gauge reaches 100, never while one is active', () => {
  const m = mk(); toPlay(m); parkBall(m);
  const L = m.world.players.L; L.gauge = 50;
  let ev = run(m, DT);
  assert.equal(ev.filter(e => e.type === 'special').length, 0); assert.equal(L.gauge, 50); assert.equal(L.active, null);
  L.gauge = 100;
  ev = run(m, DT);
  assert.deepEqual(ev.filter(e => e.type === 'special'), [{ type: 'special', side: 'L', id: 'laser' }]);
  assert.equal(L.gauge, 0); assert.equal(L.active.id, 'laser');
  L.gauge = 100;
  ev = run(m, DT);
  assert.equal(ev.filter(e => e.type === 'special').length, 0, 'cannot re-activate while active');
  assert.equal(L.gauge, 100);
});

test('requestSubstitute pauses the match; resumeFromSub(null) keeps the substitution available', () => {
  const m = mk(); toPlay(m);
  assert.equal(requestSubstitute(m, 'L'), true);
  assert.equal(m.phase, 'sub');
  const clock = m.clock, bx = m.world.ball.x;
  assert.deepEqual(run(m, 0.5), []);
  assert.equal(m.clock, clock); assert.equal(m.world.ball.x, bx);
  resumeFromSub(m, null);
  assert.equal(m.phase, 'play'); assert.equal(m.subUsed.L, false);
  assert.equal(requestSubstitute(m, 'L'), true, 'still available');
});

test('substitute keeps gauge and position, clears the active special, marks used', () => {
  const m = mk(); toPlay(m);
  const L = m.world.players.L; L.gauge = 40; L.x = 500; L.active = { id: 'laser', t: 3, armed: true, data: {} };
  const ev = substitute(m, 'L', P19);
  const n = m.world.players.L;
  assert.equal(n.def.number, 19); assert.equal(n.gauge, 40); assert.equal(n.x, 500); assert.equal(n.active, null);
  assert.equal(m.subUsed.L, true);
  assert.deepEqual(m.used.L.map(p => p.number), [10, 19]);
  assert.deepEqual(ev, { type: 'sub', side: 'L', out: 10, in: 19 });
  assert.deepEqual(currentDefs(m), { L: P19, R: P99 });
});

test('substituting a player whose laser is in flight clears the ball flags', () => {
  const m = mk(); toPlay(m);
  const L = m.world.players.L; L.x = 760; m.world.players.R.x = 1160;
  L.gauge = 100; run(m, DT, inp({ special: true }));
  Object.assign(m.world.ball, { held: null, x: L.x + 45, y: FIELD.GROUND - PHYS.BALL_R, vx: 0, vy: 0 });
  run(m, DT, inp({ kick: true }));
  assert.equal(m.world.ball.flight, 'laser'); assert.equal(m.world.ball.passThrough, 'R');
  substitute(m, 'L', P19);
  assert.equal(m.world.ball.flight, null); assert.equal(m.world.ball.passThrough, null); assert.equal(m.world.ball.noGravityT, 0);
  assert.equal(m.world.players.L.active, null);
});

test('a second substitution request is ignored', () => {
  const m = mk(); toPlay(m);
  requestSubstitute(m, 'L'); resumeFromSub(m, P19);
  assert.equal(m.phase, 'play'); assert.equal(m.subUsed.L, true);
  assert.equal(requestSubstitute(m, 'L'), false);
  assert.equal(m.phase, 'play');
});

test('AI substitutes once after 45s with the ball far from its goal, picking by score', () => {
  const m = mk(); toPlay(m); parkBall(m);
  m.clock = MATCH.LEN - MATCH.AI_SUB_AFTER; m.world.ball.x = 600; m.scores.L = 1;
  const ev = run(m, 0.5);
  const subs = ev.filter(e => e.type === 'sub');
  assert.equal(subs.length, 1); assert.equal(subs[0].side, 'R'); assert.equal(subs[0].out, 99);
  assert.equal(byNumber(subs[0].in).role, 'attack');
  assert.equal(m.subUsed.R, true);
  assert.equal(run(m, 2).filter(e => e.type === 'sub').length, 0);
});

test('stepMatch does nothing in the over phase', () => {
  const m = mk(); toPlay(m); parkBall(m);
  m.phase = 'over'; m.result = 'draw';
  const bx = m.world.ball.x, clock = m.clock;
  assert.deepEqual(run(m, 1), []);
  assert.equal(m.world.ball.x, bx); assert.equal(m.clock, clock);
});

test('each goal is logged with the scoring side and the player on the pitch', () => {
  const m = mk();
  toPlay(m);
  assert.deepEqual(m.goals, []);
  shootRight(m); run(m, 0.5);
  assert.deepEqual(m.goals, [{ side: 'L', number: 10 }]);
});
