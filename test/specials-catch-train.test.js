import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, PHYS, DT, MATCH, NO_INPUT } from '../js/sim/constants.js';
import { headCenter } from '../js/sim/physics.js';
import { createMatch, stepMatch } from '../js/sim/match.js';
import { activateSpecial } from '../js/sim/specials.js';
import { mulberry32 } from '../js/sim/rng.js';
import { byNumber } from '../js/data/players.js';

const inp = o => ({ ...NO_INPUT, ...o });
function ready(homeNo, awayNo = 10) {
  const m = createMatch({ home: byNumber(homeNo), away: byNumber(awayNo), difficulty: 'first', rng: mulberry32(1) });
  for (let i = 0, n = Math.round((MATCH.GOAL_PAUSE + DT) / DT); i < n; i++) stepMatch(m, NO_INPUT, DT);
  m.world.ball.held = { side: 'L', t: 999 };
  m.world.players.R.x = 1160;
  return m;
}
function run(m, seconds, inputs = NO_INPUT, each) {
  const ev = [];
  for (let i = 0, n = Math.round(seconds / DT); i < n; i++) {
    ev.push(...stepMatch(m, typeof inputs === 'function' ? inputs(i) : inputs, DT));
    if (each) each(m, i);
  }
  return ev;
}
const fire = m => { m.world.players.L.gauge = 100; return run(m, DT, inp({ special: true })); };
const speed = b => Math.hypot(b.vx, b.vy);
// 토마스(L) 앞에 공을 바닥에 놓는다
const ballAtFront = m => { const L = m.world.players.L; Object.assign(m.world.ball, { held: null, x: L.x + PHYS.BODY_W * L.scale / 2 + PHYS.BALL_R - 2, y: FIELD.GROUND - PHYS.BALL_R, vx: 0, vy: 0 }); };
// 상대를 멍하게(조작 불가) 세워 둔다
const freeze = (R, x) => { R.x = x; R.stun = 10; R.vx = 0; };

test('catch: a ball heading for its own goal above the head is held .4s then thrown at 40deg/1100', () => {
  const m = ready(21); const L = m.world.players.L; const b = m.world.ball;
  L.x = 400;
  fire(m);
  assert.equal(L.mods.catchArmed, true);
  const h = headCenter(L);
  Object.assign(b, { held: null, x: h.x + 120, y: h.y - 60, vx: -500, vy: -150 });
  const ev1 = run(m, 0.3);
  assert.ok(ev1.some(e => e.type === 'catch' && e.side === 'L'), 'catch event');
  assert.ok(b.held && b.held.side === 'L', 'ball held');
  assert.ok(b.y < h.y - h.r, 'held above the head');
  const ev2 = run(m, 0.45);
  assert.ok(ev2.some(e => e.type === 'throw' && e.side === 'L'), 'throw event');
  assert.equal(b.held, null);
  assert.ok(b.vx > 0, 'thrown toward the far goal');
});

test('catch ignores a laser-flight ball', () => {
  const m = ready(21); const L = m.world.players.L; const b = m.world.ball;
  L.x = 400; fire(m);
  const h = headCenter(L);
  Object.assign(b, { held: null, x: h.x + 120, y: h.y - 60, vx: -800, vy: 0, flight: 'laser', passThrough: 'L', noGravityT: 1 });
  const ev = run(m, 0.3);
  assert.equal(ev.filter(e => e.type === 'catch').length, 0);
  assert.equal(b.held, null);
});

// 2026-11-01 형준 "토마스 필살기 1초만 늘려줘": 2초 → 3초
test('train: scale 1.25, cannot jump, speed 1.1, still a train at 2.2s, back to normal after 3s', () => {
  const m = ready(55); const L = m.world.players.L;
  fire(m);
  assert.equal(L.scale, 1.25); assert.equal(L.mods.canJump, false); assert.ok(Math.abs(L.mods.speed - 1.1) < 1e-9);
  run(m, 0.5, inp({ jump: true }));
  assert.equal(L.y, FIELD.GROUND, 'jump ignored');
  run(m, 1.7);
  assert.equal(L.scale, 1.25, 'still a train at 2.2s');
  run(m, 0.9);
  assert.equal(L.scale, 1); assert.equal(L.active, null); assert.equal(L.mods.canJump, true);
});

test('train: a ball touching the front attaches and the train charges at 700 toward the goal', () => {
  const m = ready(55); const L = m.world.players.L; const b = m.world.ball;
  L.x = 400; fire(m); ballAtFront(m);
  run(m, DT);
  assert.equal(b.attached, 'L'); assert.equal(L.forcedVx, 700);
  const x0 = L.x;
  run(m, 0.3);
  assert.ok(Math.abs((L.x - x0) - 210) < 12, `charged ${L.x - x0}`);
  assert.ok(b.x > L.x, 'ball stays in front');
});

test('train: a grounded opponent in the path is pinned and carried; an airborne one is not', () => {
  const m = ready(55); const L = m.world.players.L, R = m.world.players.R; const b = m.world.ball;
  L.x = 400; freeze(R, 600);
  fire(m); ballAtFront(m);
  let pinnedSeen = false;
  run(m, 0.6, NO_INPUT, (m) => { if (m.world.players.R.pinned) pinnedSeen = true; });
  assert.equal(pinnedSeen, true, 'opponent was pinned during the charge');
  assert.ok(R.x > 630, `carried to ${R.x}`);
  assert.ok(R.x > b.x, 'opponent ahead of the ball');

  const m2 = ready(55); const L2 = m2.world.players.L, R2 = m2.world.players.R;
  L2.x = 400; freeze(R2, 600); R2.onGround = false; R2.y = FIELD.GROUND - 130; R2.vy = -300;
  fire(m2); ballAtFront(m2);
  let pinned2 = false;
  run(m2, 0.6, NO_INPUT, (m) => { if (m.world.players.R.pinned) pinned2 = true; });
  assert.equal(pinned2, false);
  assert.ok(R2.x < L2.x, `train passed under: R ${R2.x}, L ${L2.x}`);
});

test('train: scores when the ball crosses the line even with the pinned opponent stopped at the line', () => {
  const m = ready(55); const L = m.world.players.L, R = m.world.players.R;
  L.x = 1000; freeze(R, 1100);
  fire(m); ballAtFront(m);
  const ev = run(m, 0.7);
  assert.ok(ev.some(e => e.type === 'goal' && e.scorer === 'L'), 'goal');
  assert.deepEqual(m.scores, { L: 1, R: 0 });
  assert.ok(R.x <= FIELD.W - FIELD.GOAL_DEPTH - PHYS.BODY_W / 2 + 1e-6, 'opponent never enters the goal mouth');
});

test('train: the charge lasts at most .35s (about 245px) and everything resets after 3s', () => {
  const m = ready(55); const L = m.world.players.L, R = m.world.players.R; const b = m.world.ball;
  L.x = 300; freeze(R, 1160);
  fire(m); ballAtFront(m);
  const ev = run(m, 3.1);
  assert.equal(ev.filter(e => e.type === 'goal').length, 0, 'from the own half the train runs out of steam');
  assert.ok(L.x < 900, `train stopped at ${L.x}`);
  assert.equal(b.attached, null); assert.equal(L.forcedVx, null); assert.equal(L.scale, 1); assert.equal(L.active, null); assert.equal(R.pinned, false);
});

test('train push ignores the opponent\'s giant scale and overrides its slide', () => {
  const m = ready(55, 19); const L = m.world.players.L, R = m.world.players.R;
  L.x = 400; freeze(R, 600);
  activateSpecial(m, 'R'); run(m, DT);                       // 김영권 거인 (1.7)
  assert.equal(R.scale, 1.3);
  fire(m); ballAtFront(m);
  R.forcedVx = -500;                                        // 슬라이딩처럼 반대로 돌진 중이어도
  let pinned3 = false;
  run(m, 0.6, NO_INPUT, (m) => { if (m.world.players.R.pinned) pinned3 = true; });
  assert.equal(pinned3, true);
  assert.ok(R.x > 630, `giant carried to ${R.x}`);
});
