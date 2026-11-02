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

// 2026-11-01 형준 "최석현은 원래 상대방 미끄러지는거니까 살짝 더 오래": 넘어짐 1초 → 1.3초
// 2026-11-02 형준 "최석현 발동 시간을 좀 늘려야겠는데": 0.35초 → 0.5초, 같은 속도라 약 257px
test('slide: dashes about 257px in .5s, kicks the ball once, knocks the opponent down for 1.3s', () => {
  const m = ready(96); const L = m.world.players.L, R = m.world.players.R; const b = m.world.ball;
  L.x = 400; R.x = 1160;
  const x0 = L.x;
  fire(m);
  run(m, 0.5);
  assert.ok(Math.abs((L.x - x0) - 257) < 14, `slid ${L.x - x0}`);
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
  let peak = 0;
  const ev = fire(m3).concat(run(m3, 0.35, NO_INPUT, m => { peak = Math.max(peak, m.world.players.R.stun); }));
  assert.ok(ev.some(e => e.type === 'knockdown' && e.side === 'R'));
  assert.ok(peak > 1.2 && peak <= 1.3, `stun ${peak}`);
});
