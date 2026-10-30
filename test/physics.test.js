import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, PHYS, DT, NO_INPUT } from '../js/sim/constants.js';
import { createWorld, stepPhysics, resetKickoff, headCenter, bodyRect } from '../js/sim/physics.js';
import { byNumber } from '../js/data/players.js';

const P10 = byNumber(10), P99 = byNumber(99);
const inp = o => ({ ...NO_INPUT, ...o });
const both = (L = NO_INPUT, R = NO_INPUT) => ({ L, R });

function run(world, seconds, inputs = both(), each) {
  const events = [];
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    events.push(...stepPhysics(world, typeof inputs === 'function' ? inputs(i) : inputs, DT));
    if (each) each(world, i);
  }
  return events;
}
// 선수를 공과 멀리 떨어뜨린 월드
function quietWorld() {
  const w = createWorld(P10, P99);
  w.players.L.x = 120; w.players.R.x = 1160;
  return w;
}
const speed = b => Math.hypot(b.vx, b.vy);

test('createWorld places L at 320 facing right and R at 960 facing left', () => {
  const w = createWorld(P10, P99);
  assert.equal(w.players.L.x, 320); assert.equal(w.players.L.facing, 1);
  assert.equal(w.players.R.x, 960); assert.equal(w.players.R.facing, -1);
  assert.equal(w.players.L.y, FIELD.GROUND);
  assert.deepEqual([w.ball.x, w.ball.y], [640, 300]);
});

test('ball falls and bounces with restitution 0.82 (minus slight drag)', () => {
  const w = quietWorld(); w.ball.y = 300;
  let bounced = false, peakAfter = Infinity;
  run(w, 2, both(), (w) => {
    if (!bounced && w.ball.vy < 0) bounced = true;
    if (bounced && w.ball.y < peakAfter) peakAfter = w.ball.y;
  });
  const h0 = (FIELD.GROUND - PHYS.BALL_R) - 300;
  const h1 = (FIELD.GROUND - PHYS.BALL_R) - peakAfter;
  const ratio = h1 / h0;                               // 0.82² = 0.672, 공기 저항으로 조금 덜
  assert.ok(ratio > 0.56 && ratio < 0.72, `ratio ${ratio}`);
  assert.ok(w.ball.y <= FIELD.GROUND - PHYS.BALL_R + 0.01);
});

test('ball speed never exceeds BALL_MAX', () => {
  const w = quietWorld(); w.ball.vx = 5000; w.ball.vy = -3000;
  run(w, DT);
  assert.ok(speed(w.ball) <= PHYS.BALL_MAX + 1e-6);
});

test('player cannot leave the pitch or enter the goal mouth', () => {
  const w = createWorld(P10, P99);
  run(w, 3, both(inp({ left: true })));
  assert.equal(w.players.L.x, FIELD.GOAL_DEPTH + PHYS.BODY_W / 2);
  run(w, 3, both(NO_INPUT, inp({ right: true })));
  assert.equal(w.players.R.x, FIELD.W - FIELD.GOAL_DEPTH - PHYS.BODY_W / 2);
});

test('jump reaches about 164px and lands within a second', () => {
  const w = quietWorld();
  let minY = FIELD.GROUND;
  run(w, 1, i => both(inp({ jump: i === 0 })), w => { minY = Math.min(minY, w.players.L.y); });
  const apex = FIELD.GROUND - minY;
  assert.ok(Math.abs(apex - PHYS.JUMP * PHYS.JUMP / (2 * PHYS.GRAVITY)) < 6, `apex ${apex}`);
  assert.equal(w.players.L.onGround, true);
  assert.equal(w.players.L.y, FIELD.GROUND);
});

test('kick launches the ball at 900px/s and 35 degrees', () => {
  const w = quietWorld();
  const L = w.players.L;
  w.ball.x = L.x + 45; w.ball.y = FIELD.GROUND - PHYS.BALL_R; w.ball.vx = 0; w.ball.vy = 0;
  const ev = run(w, DT, both(inp({ kick: true })));
  assert.ok(Math.abs(speed(w.ball) - 900) < 10, `speed ${speed(w.ball)}`);
  const deg = Math.atan2(-w.ball.vy, w.ball.vx) * 180 / Math.PI;
  assert.ok(Math.abs(deg - 35) < 1.5, `angle ${deg}`);
  assert.ok(ev.some(e => e.type === 'kick' && e.side === 'L'));
});

test('kick has a cooldown', () => {
  const w = quietWorld(); const L = w.players.L;
  const placeBall = () => { w.ball.x = L.x + 60; w.ball.y = FIELD.GROUND - PHYS.BALL_R; w.ball.vx = 0; w.ball.vy = 0; };   // 몸에는 안 닿고 발 범위 안
  placeBall(); run(w, DT, both(inp({ kick: true })));
  placeBall(); run(w, PHYS.KICK_COOLDOWN - 0.1);
  run(w, DT, both(inp({ kick: true })));
  assert.ok(speed(w.ball) < 50, `second kick within cooldown moved ball: ${speed(w.ball)}`);
  placeBall(); run(w, 0.15);
  run(w, DT, both(inp({ kick: true })));
  assert.ok(speed(w.ball) > 800, 'kick works again after cooldown');
});

test('no kick without the kick input', () => {
  const w = quietWorld(); const L = w.players.L;
  w.ball.x = L.x + 60; w.ball.y = FIELD.GROUND - PHYS.BALL_R; w.ball.vx = 0; w.ball.vy = 0;   // 몸에는 안 닿고 발 범위 안
  const ev = run(w, 0.3);
  assert.equal(ev.filter(e => e.type === 'kick').length, 0);
  assert.ok(speed(w.ball) < 50);
});

test('ball bouncing off a standing body pops upward', () => {
  const w = quietWorld(); const L = w.players.L;
  w.ball.x = L.x + 150; w.ball.y = FIELD.GROUND - PHYS.BODY_H / 2; w.ball.vx = -500; w.ball.vy = 0;  // 몸 높이로 굴러온다
  let minVy = 0;
  run(w, 0.3, both(), (w) => { minVy = Math.min(minVy, w.ball.vy); });
  assert.ok(minVy <= -PHYS.BODY_POP + 1, `pop vy ${minVy}`);
  assert.ok(w.ball.vx > 0, 'reflected away from the body');
});

test('head collision reflects the ball upward and emits one touch', () => {
  const w = quietWorld(); const L = w.players.L; const h = headCenter(L);
  w.ball.x = h.x; w.ball.y = h.y - h.r - PHYS.BALL_R - 30; w.ball.vy = 300;
  const ev = run(w, 0.2);
  assert.ok(w.ball.vy < 0 || w.ball.y < h.y - h.r - PHYS.BALL_R - 30, 'ball went back up');
  assert.equal(ev.filter(e => e.type === 'touch').length, 1);
  assert.equal(ev[0].side, 'L');
});

test('touch events debounce within 0.25s but repeat later', () => {
  const w = quietWorld(); const L = w.players.L; const h = headCenter(L);
  w.ball.x = h.x; w.ball.y = h.y - h.r - PHYS.BALL_R - 5; w.ball.vy = 0;   // 머리 위에서 작은 바운스를 반복
  const first = run(w, 0.25);
  assert.ok(first.filter(e => e.type === 'touch').length <= 1);
  const later = run(w, 1.0);
  assert.ok(later.filter(e => e.type === 'touch').length >= 2);
});

function perfectSetup(onGround) {
  const w = quietWorld(); const L = w.players.L;
  if (!onGround) { L.onGround = false; L.y = FIELD.GROUND - 60; L.vy = 0; }   // 점프 정점
  const h = headCenter(L);
  const ang = 30 * Math.PI / 180;                         // 위에서 앞쪽으로 30°
  const nx = Math.sin(ang) * L.facing, ny = -Math.cos(ang);
  const d = h.r + PHYS.BALL_R + 1;
  w.ball.x = h.x + nx * d; w.ball.y = h.y + ny * d;
  w.ball.vx = -nx * 600; w.ball.vy = -ny * 600;           // 머리 쪽으로 600
  return w;
}

test('perfect header: airborne, upper-front 60deg, rel speed >= 500', () => {
  const wp = perfectSetup(false), wn = perfectSetup(true);
  const evp = run(wp, DT), evn = run(wn, DT);
  const tp = evp.find(e => e.type === 'touch'), tn = evn.find(e => e.type === 'touch');
  assert.ok(tp && tp.perfect === true, 'airborne upper-front hit is perfect');
  assert.ok(tn && tn.perfect === false, 'standing hit is not perfect');
  const ratio = speed(wp.ball) / speed(wn.ball);
  assert.ok(ratio > 1.25 && ratio < 1.45, `perfect speed ratio ${ratio}`);
});

test('goal when the whole ball crosses the line under the bar; roof blocks lobs', () => {
  const w = quietWorld(); w.players.R.x = 640;             // R 을 비켜 세움
  w.ball.x = 1190; w.ball.y = 600; w.ball.vx = 600; w.ball.vy = 0;
  const ev = run(w, 0.5);
  assert.equal(ev.filter(e => e.type === 'goal').length, 1);
  assert.equal(ev.find(e => e.type === 'goal').scorer, 'L');

  const w2 = quietWorld(); w2.players.R.x = 640;
  w2.ball.x = 1150; w2.ball.y = 350; w2.ball.vx = 600; w2.ball.vy = 0;
  const ev2 = run(w2, 1.5);
  assert.equal(ev2.filter(e => e.type === 'goal').length, 0);
  assert.ok(w2.ball.x < FIELD.W - FIELD.GOAL_DEPTH, 'ball came back out over the roof');
});

test('resetKickoff restores positions and clears ball flags', () => {
  const w = quietWorld(); w.ball.flight = 'laser'; w.ball.noGravityT = 1; w.ball.passThrough = 'R';
  resetKickoff(w);
  assert.deepEqual([w.players.L.x, w.players.R.x, w.ball.x, w.ball.y], [320, 960, 640, 300]);
  assert.equal(w.ball.flight, null); assert.equal(w.ball.noGravityT, 0); assert.equal(w.ball.passThrough, null);
});

test('ball squeezed between two players escapes within 0.5s', () => {
  const w = createWorld(P10, P99);
  w.players.L.x = 600; w.players.R.x = 600 + PHYS.BODY_W + 2 * PHYS.BALL_R - 10;   // 공 지름보다 좁은 틈
  w.ball.x = (w.players.L.x + w.players.R.x) / 2; w.ball.y = FIELD.GROUND - PHYS.BALL_R; w.ball.vx = 0; w.ball.vy = 0;
  run(w, 0.5, both(inp({ right: true }), inp({ left: true })));     // 서로 밀어붙임
  for (const b of [w.players.L, w.players.R]) {
    const r = bodyRect(b);
    const overlapX = w.ball.x + PHYS.BALL_R > r.x && w.ball.x - PHYS.BALL_R < r.x + r.w;
    const overlapY = w.ball.y + PHYS.BALL_R > r.y && w.ball.y - PHYS.BALL_R < r.y + r.h;
    assert.ok(!(overlapX && overlapY), `ball still inside ${b.side} body`);
  }
  assert.ok(Number.isFinite(w.ball.x) && Number.isFinite(w.ball.vx) && speed(w.ball) <= PHYS.BALL_MAX);
});

test('passThrough side ignores collision', () => {
  const w = quietWorld(); const R = w.players.R; const h = headCenter(R);
  w.ball.passThrough = 'R'; w.ball.noGravityT = 1;
  w.ball.x = h.x - 150; w.ball.y = h.y; w.ball.vx = 800; w.ball.vy = 0;
  const ev = run(w, 0.3);
  assert.equal(ev.filter(e => e.type === 'touch').length, 0);
  assert.ok(w.ball.x > h.x + 60, 'ball passed through the head');
  assert.ok(w.ball.vx > 700);
});

test('players separate without bouncing', () => {
  const w = createWorld(P10, P99);
  w.players.L.x = 600; w.players.R.x = 620;
  run(w, DT);
  assert.ok(w.players.R.x - w.players.L.x >= PHYS.BODY_W - 1e-6);
  assert.equal(w.players.L.vx, 0); assert.equal(w.players.R.vx, 0);
});
