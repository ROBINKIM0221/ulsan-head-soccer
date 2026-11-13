import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, PHYS, DT, MATCH, NO_INPUT } from '../js/sim/constants.js';
import { headCenter, footPoint, resetKickoff } from '../js/sim/physics.js';
import { createMatch, stepMatch, substitute } from '../js/sim/match.js';
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

test('laser: next kick flies straight at 1200 with no gravity for .8s and passes through the opponent, then scores from close range', () => {
  const m = ready(10); const L = m.world.players.L, R = m.world.players.R; const b = m.world.ball;
  fire(m);
  assert.equal(L.active.armed, true);
  L.x = 760; R.x = 920; ballAtFoot(m);
  run(m, DT, inp({ kick: true }));
  assert.ok(Math.abs(speed(b) - 1200) < 20, `speed ${speed(b)}`);
  assert.equal(b.flight, 'laser'); assert.equal(b.passThrough, 'R'); assert.ok(b.noGravityT > 0.7);
  assert.equal(L.active && L.active.armed, false, 'one-shot consumed');
  const yAtGoal = b.y + (FIELD.W - b.x) * (b.vy / b.vx);
  assert.ok(yAtGoal > FIELD.GROUND - FIELD.GOAL_H && yAtGoal < FIELD.GROUND, 'aimed into the goal mouth: ' + Math.round(yAtGoal));
  const ev = run(m, 0.25);
  assert.ok(b.x > R.x + 60, 'went through R');
  assert.equal(ev.filter(e => e.type === 'touch' && e.side === 'R').length, 0);
  // 760 에서 쏜 레이저는 크로스바 아래로 들어가 득점한다; 킥오프 재배치 뒤 공 표시는 지워져 있다
  for (let t = 0; t < 3 && m.phase !== 'kickoff'; t += DT) run(m, DT);
  assert.deepEqual(m.scores, { L: 1, R: 0 });
  assert.equal(b.flight, null); assert.equal(b.passThrough, null);
});

// 2026-11-01 형준 "레이저가 골문에서 크게 벗어나는 경우가 많네. 100프로는 아니더라도 골문 근처로": 골문 안의 한 점(위아래 30px 안쪽)을 조준하고 ±2° 오차
test('laser: aims at a random point inside the goal with a little spread, so even from my own half it arrives near the goal', () => {
  let scored = 0; const heights = [];
  for (let seed = 1; seed <= 20; seed++) {
    const m = createMatch({ home: byNumber(10), away: byNumber(19), difficulty: 'first', rng: mulberry32(seed) });
    for (let i = 0, n = Math.round((MATCH.GOAL_PAUSE + DT) / DT); i < n; i++) stepMatch(m, NO_INPUT, DT);
    const L = m.world.players.L, R = m.world.players.R, b = m.world.ball;
    b.held = { side: 'L', t: 999 }; R.x = 1160;
    fire(m); L.x = 300; ballAtFoot(m);
    run(m, DT, inp({ kick: true }));
    assert.equal(b.flight, 'laser');
    const yAtGoal = b.y + (FIELD.W - b.x) * (b.vy / b.vx);
    heights.push(Math.round(yAtGoal));
    assert.ok(yAtGoal > FIELD.GROUND - FIELD.GOAL_H - 40 && yAtGoal < FIELD.GROUND + 10, 'near the goal from my own half: ' + Math.round(yAtGoal));
    for (let t = 0; t < 2 && m.phase !== 'kickoff'; t += DT) run(m, DT);
    if (m.scores.L === 1) scored++;
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) > 60, 'spread: ' + heights.join(','));
  assert.ok(scored >= 12, 'mostly scores from my own half: ' + scored + '/20');
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

test('curve: next kick leaves at 55deg/1050, passes through the opponent briefly and accelerates toward the goal at 1100', () => {
  const m = ready(14); const L = m.world.players.L; const b = m.world.ball;
  fire(m);
  L.x = 400; ballAtFoot(m);
  run(m, DT, inp({ kick: true }));
  const deg = Math.atan2(-b.vy, b.vx) * 180 / Math.PI;
  assert.ok(Math.abs(deg - 55) < 1.5, `angle ${deg}`); assert.ok(Math.abs(speed(b) - 1050) < 10, `speed ${speed(b)}`);
  assert.equal(b.flight, 'curve'); assert.equal(b.curveAx, 900); assert.equal(b.passThrough, 'R');
  const vx0 = b.vx;
  run(m, 0.5);
  assert.ok(b.vx - vx0 > 300, `horizontal gain ${b.vx - vx0}`);    // 900×0.5 minus drag
  assert.equal(b.passThrough, null, 'pass-through only for the first .35s');
  for (let t = 0; t < 4 && b.flight && m.phase !== 'kickoff'; t += DT) run(m, DT);
  assert.equal(b.flight, null); assert.equal(b.curveAx, 0); assert.equal(b.passThrough, null);
});

// 2026-11-13 형준 "슬라이딩이 잘 안나오는데, 그냥 필살기를 바꾸면 좋겠다" → "오프사이드 트랩… 이거 해보자": 상대가 1.5초 그 자리에 선다.
// (전 필살기 슬라이딩은 게이지가 차는 순간 앞에 공·상대가 없으면 아무 일도 없어 보였다. 이건 어디서 터져도 효과가 난다.)
const twoP = (homeNo, awayNo) => { const m = ready(homeNo, awayNo); m.twoPlayer = true; return m; };   // 오른쪽 입력을 직접 준다
const both = (m, seconds, inR) => { const ev = []; for (let i = 0, n = Math.round(seconds / DT); i < n; i++) ev.push(...stepMatch(m, NO_INPUT, DT, inR)); return ev; };
test('offside trap: wherever the opponent is, they stand still for 1.5s (no move, jump or kick), then play on', () => {
  const m = twoP(96, 10); const L = m.world.players.L, R = m.world.players.R;
  L.x = 200; R.x = 900;                                   // 멀리 떨어져 있어도 걸린다
  const ev = fire(m);
  assert.ok(ev.some(e => e.type === 'special' && e.side === 'L' && e.id === 'offside'));
  const mash = inp({ left: true, jump: true, kick: true });
  const frozenEv = both(m, 1.4, mash);
  assert.equal(R.x, 900); assert.equal(R.onGround, true, 'did not jump');
  assert.ok(!frozenEv.some(e => e.type === 'kick' && e.side === 'R'), 'did not kick');
  assert.ok(R.frozen > 0 && L.active && L.active.id === 'offside');
  const after = both(m, 0.3, mash);
  assert.equal(R.frozen, 0); assert.equal(L.active, null);
  assert.ok(R.x < 880, `moves again: ${R.x}`);
  assert.ok(after.some(e => e.type === 'kick' && e.side === 'R'), 'kicks again');
});

test('offside trap: caught in the air they drop straight down; a kickoff or the user being substituted lifts it', () => {
  const m = twoP(96, 10); const R = m.world.players.R;
  R.x = 900;
  both(m, 0.2, inp({ left: true, jump: true }));          // 왼쪽으로 달리며 뛰어오른 순간
  assert.equal(R.onGround, false);
  const x0 = R.x;
  fire(m);
  both(m, 1.0, inp({ left: true }));
  assert.equal(R.x, x0, 'no drift in the air'); assert.equal(R.onGround, true, 'landed');

  resetKickoff(m.world);                                   // 골을 먹고 다시 서면 묶여 있지 않다
  assert.equal(R.frozen, 0);

  const m2 = twoP(96, 10); fire(m2);
  assert.ok(m2.world.players.R.frozen > 1.4);
  substitute(m2, 'L', byNumber(19));                       // 진행 중인 필살기 효과는 교체 순간 끝난다
  assert.equal(m2.world.players.R.frozen, 0);
});
