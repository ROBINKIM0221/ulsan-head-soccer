import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, PHYS, DT, MATCH, NO_INPUT } from '../js/sim/constants.js';
import { headCenter, footPoint } from '../js/sim/physics.js';
import { createMatch, stepMatch } from '../js/sim/match.js';
import { mulberry32 } from '../js/sim/rng.js';
import { byNumber } from '../js/data/players.js';

const inp = o => ({ ...NO_INPUT, ...o });
function ready(homeNo, awayNo = 19) {
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
const ballAtFoot = m => { const L = m.world.players.L; Object.assign(m.world.ball, { held: null, x: L.x + 45, y: FIELD.GROUND - PHYS.BALL_R, vx: 0, vy: 0 }); };
const speed = b => Math.hypot(b.vx, b.vy);

test('laser: next kick flies straight at 1500 with no gravity for .8s and passes through the opponent, then normal', () => {
  const m = ready(10); const L = m.world.players.L, R = m.world.players.R; const b = m.world.ball;
  fire(m);
  assert.equal(L.active.armed, true);
  L.x = 400; R.x = 700; ballAtFoot(m);
  run(m, DT, inp({ kick: true }));
  assert.ok(Math.abs(speed(b) - 1500) < 20, `speed ${speed(b)}`);
  assert.equal(b.flight, 'laser'); assert.equal(b.passThrough, 'R'); assert.ok(b.noGravityT > 0.7);
  assert.equal(L.active && L.active.armed, false, 'one-shot consumed');
  const yStart = b.y;
  const ev = run(m, 0.25);
  assert.ok(Math.abs(b.y - yStart) < 60, `nearly level: ${b.y - yStart}`);
  assert.ok(b.x > R.x + 60, 'went through R');
  assert.equal(ev.filter(e => e.type === 'touch' && e.side === 'R').length, 0);
  // 400 에서 쏜 레이저는 골문까지 닿아 득점한다; 킥오프 재배치 뒤 공 표시는 지워져 있다
  for (let t = 0; t < 3 && m.phase !== 'kickoff'; t += DT) run(m, DT);
  assert.deepEqual(m.scores, { L: 1, R: 0 });
  assert.equal(b.flight, null); assert.equal(b.passThrough, null);
});

test('laser: bouncing back (direction reversed) ends the flight early', () => {
  const m = ready(10); const L = m.world.players.L; const b = m.world.ball;
  fire(m); L.x = 400; ballAtFoot(m);
  run(m, DT, inp({ kick: true }));
  assert.equal(b.flight, 'laser');
  b.vx = -100;                                           // 벽에 맞고 돌아온 상황
  const ev = run(m, DT);
  assert.equal(b.flight, null); assert.equal(b.passThrough, null); assert.equal(b.noGravityT, 0);
  assert.ok(ev.some(e => e.type === 'specialEnd' && e.id === 'laser'));
  assert.equal(L.active, null);
});

test('laser: expires unarmed after 6s without a kick', () => {
  const m = ready(10); const L = m.world.players.L;
  fire(m);
  const ev = run(m, 6.1);
  assert.equal(L.active, null);
  assert.ok(ev.some(e => e.type === 'specialEnd' && e.id === 'laser'));
  ballAtFoot(m); run(m, DT, inp({ kick: true }));
  assert.ok(Math.abs(speed(m.world.ball) - PHYS.KICK_SPEED) < 10, 'ordinary kick afterwards');
});

test('curve: next kick leaves at 62deg/1000 and accelerates horizontally toward the goal at 900', () => {
  const m = ready(14); const L = m.world.players.L; const b = m.world.ball;
  fire(m);
  L.x = 400; ballAtFoot(m);
  run(m, DT, inp({ kick: true }));
  const deg = Math.atan2(-b.vy, b.vx) * 180 / Math.PI;
  assert.ok(Math.abs(deg - 62) < 1.5, `angle ${deg}`); assert.ok(Math.abs(speed(b) - 1000) < 10, `speed ${speed(b)}`);
  assert.equal(b.flight, 'curve'); assert.equal(b.curveAx, 900);
  const vx0 = b.vx;
  run(m, 0.5);
  assert.ok(b.vx - vx0 > 350, `horizontal gain ${b.vx - vx0}`);    // 900×0.5 minus drag
  run(m, 3);
  assert.equal(b.flight, null); assert.equal(b.curveAx, 0);
});

test('longthrow: next touch holds the ball .3s then lands it near the far goal line', () => {
  const m = ready(26); const L = m.world.players.L; const b = m.world.ball;
  L.x = 400; m.world.players.R.x = 300;                 // 상대를 낙하 지점에서 치운다
  fire(m);
  const h = headCenter(L);
  Object.assign(b, { held: null, x: h.x, y: h.y - h.r - PHYS.BALL_R - 10, vx: 0, vy: 100 });
  run(m, 0.1);
  assert.ok(b.held && b.held.side === 'L', 'ball is held after the touch');
  let landed = null;
  run(m, 2.5, NO_INPUT, (m) => { const bb = m.world.ball; if (!landed && !bb.held && bb.y + bb.r >= FIELD.GROUND - 0.5 && bb.x > 600) landed = bb.x; });
  const target = FIELD.W - FIELD.GOAL_DEPTH - 60;
  assert.ok(landed !== null, 'ball landed');
  assert.ok(Math.abs(landed - target) < 40, `landed at ${landed}, target ${target}`);
});

test('slide: dashes 180px in .35s, kicks the ball once, knocks the opponent down for 1s', () => {
  const m = ready(96); const L = m.world.players.L, R = m.world.players.R; const b = m.world.ball;
  L.x = 400; R.x = 1160;
  const x0 = L.x;
  fire(m);
  run(m, 0.35);
  assert.ok(Math.abs((L.x - x0) - 180) < 12, `slid ${L.x - x0}`);
  assert.equal(L.active, null, 'instant special over');

  const m2 = ready(96); const L2 = m2.world.players.L; const b2 = m2.world.ball;
  L2.x = 400;
  Object.assign(b2, { held: null, x: 500, y: FIELD.GROUND - PHYS.BALL_R, vx: 0, vy: 0 });
  fire(m2);
  let kickV = null;
  run(m2, 0.35, NO_INPUT, (m) => { const bb = m.world.ball; if (!kickV && speed(bb) > 700) kickV = { vx: bb.vx, vy: bb.vy }; });
  assert.ok(kickV && kickV.vx > 0 && kickV.vy < 0, `ball kicked forward-up: ${JSON.stringify(kickV)}`);

  const m3 = ready(96); const L3 = m3.world.players.L, R3 = m3.world.players.R;
  L3.x = 400; R3.x = 480;
  const ev = fire(m3).concat(run(m3, 0.35));
  assert.ok(ev.some(e => e.type === 'knockdown' && e.side === 'R'));
  assert.ok(R3.stun > 0.5, `stun ${R3.stun}`);
});

test('one-shot flight ball ignores magnet (flight flag set)', () => {
  const m = ready(10, 24); const L = m.world.players.L, R = m.world.players.R;
  fire(m);
  L.x = 400; R.x = 700; ballAtFoot(m);
  run(m, DT, inp({ kick: true }));
  assert.equal(m.world.ball.flight, 'laser');
  R.gauge = 100; R.active = null;
});
