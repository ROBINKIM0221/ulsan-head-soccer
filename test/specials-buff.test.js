import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, PHYS, DT, MATCH, NO_INPUT } from '../js/sim/constants.js';
import { headCenter } from '../js/sim/physics.js';
import { createMatch, stepMatch } from '../js/sim/match.js';
import { activateSpecial, updateSpecials } from '../js/sim/specials.js';
import { mulberry32 } from '../js/sim/rng.js';
import { byNumber } from '../js/data/players.js';

const inp = o => ({ ...NO_INPUT, ...o });
function ready(homeNo, awayNo = 10) {
  const m = createMatch({ home: byNumber(homeNo), away: byNumber(awayNo), difficulty: 'first', rng: mulberry32(1) });
  for (let i = 0, n = Math.round((MATCH.GOAL_PAUSE + DT) / DT); i < n; i++) stepMatch(m, NO_INPUT, DT);
  m.world.ball.held = { side: 'L', t: 999 };          // 공을 치워 둔다
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

test('sprint: speed mod 2.0 for 6s, then back to 1 with a specialEnd event', () => {
  const m = ready(11); const L = m.world.players.L;
  fire(m);
  assert.equal(L.active.id, 'sprint'); assert.equal(L.mods.speed, 2.0); assert.ok(Math.abs(L.mods.kickPow - 1.35) < 1e-9);
  const x0 = L.x;
  run(m, 0.5, inp({ right: true }));
  assert.ok(Math.abs((L.x - x0) - PHYS.MOVE * 2.0 * 0.5) < 6, `moved ${L.x - x0}`);
  const ev = run(m, 5.6);
  assert.equal(L.active, null); assert.equal(L.mods.speed, 1);
  assert.ok(ev.some(e => e.type === 'specialEnd' && e.id === 'sprint'));
});

test('highjump: jump impulse ×1.35 reaches the expected apex and heads harder', () => {
  const m = ready(15); const L = m.world.players.L;
  fire(m);
  assert.equal(L.mods.jump, 1.35); assert.ok(Math.abs(L.mods.headPow - 2.0) < 1e-9); assert.ok(Math.abs(L.mods.speed - 1.15) < 1e-9);
  let minY = FIELD.GROUND;
  run(m, 1.5, i => inp({ jump: i === 0 }), m => { minY = Math.min(minY, m.world.players.L.y); });
  const apex = FIELD.GROUND - minY;
  const expected = (PHYS.JUMP * 1.35) ** 2 / (2 * PHYS.GRAVITY);
  assert.ok(Math.abs(apex - expected) < 8, `apex ${apex} vs ${expected}`);
});

test('giant: scale 1.4, speed .8, head power 1.2, back to normal after 3.5s', () => {
  const m = ready(19); const L = m.world.players.L;
  fire(m);
  assert.equal(L.scale, 1.4); assert.ok(Math.abs(L.mods.speed - 0.8) < 1e-9); assert.ok(Math.abs(L.mods.headPow - 1.2) < 1e-9);
  run(m, 3.6);
  assert.equal(L.scale, 1); assert.equal(L.active, null); assert.equal(L.mods.headPow, 1);
});

test('press: opponent speed and jump ×0.6, own mods unchanged', () => {
  const m = ready(38); const L = m.world.players.L, R = m.world.players.R;
  fire(m);
  assert.ok(Math.abs(R.mods.speed - 0.6) < 1e-9); assert.ok(Math.abs(R.mods.jump - 0.6) < 1e-9); assert.equal(R.mods.press, true);
  assert.equal(L.mods.speed, 1); assert.equal(L.mods.jump, 1);
  run(m, 5.1);
  assert.equal(R.mods.speed, 1); assert.equal(R.mods.press, false);
});

test('cannon: header speed doubled and the opponent it hits is knocked back and stunned', () => {
  const m = ready(99, 19); const L = m.world.players.L, R = m.world.players.R;
  L.x = 500; R.x = 700;
  fire(m);
  assert.equal(L.mods.headPow, 2);
  const h = headCenter(L);
  Object.assign(m.world.ball, { held: null, x: 620, y: h.y, vx: -600, vy: 0 });
  let knocked = false, stunSeen = false, maxVx = 0, headerSpeed = 0;
  run(m, 0.3, NO_INPUT, (m) => {
    const b = m.world.ball;
    if (b.vx > headerSpeed) headerSpeed = b.vx;
    if (R.stun > 0) stunSeen = true;
    maxVx = Math.max(maxVx, R.vx);
  }).forEach(e => { if (e.type === 'knockback' && e.side === 'R') knocked = true; });
  assert.ok(headerSpeed > 1100, `header speed ${headerSpeed}`);
  assert.ok(knocked, 'knockback event'); assert.ok(stunSeen, 'opponent stunned'); assert.ok(maxVx >= 300, `knockback vx ${maxVx}`);
});

test('magnet: a free ball within 400 is pulled toward the head; a laser-flight ball is not', () => {
  const m = ready(24); const L = m.world.players.L; const h = headCenter(L);
  fire(m);
  Object.assign(m.world.ball, { held: null, x: h.x + 150, y: h.y, vx: 0, vy: 0, noGravityT: 1 });
  let closest = Infinity;
  run(m, 0.3, NO_INPUT, (m) => { closest = Math.min(closest, m.world.ball.x - h.x); });
  assert.ok(closest < 130, `pulled to ${closest}`);     // 발 앞까지 끌려오면 자동 킥으로 다시 날아갈 수 있다
  assert.equal(L.mods.magnet, true);

  const m2 = ready(24); const L2 = m2.world.players.L; const h2 = headCenter(L2);
  fire(m2);
  Object.assign(m2.world.ball, { held: null, x: h2.x + 150, y: h2.y, vx: 0, vy: 0, noGravityT: 1, flight: 'laser' });
  run(m2, 0.3);
  assert.ok(Math.abs(m2.world.ball.x - (h2.x + 150)) < 1, 'laser ball ignored');
});

test('spirit: faster and higher, immune to knockdown, and bumps the opponent back once a second', () => {
  const m = ready(26, 96); const L = m.world.players.L, R = m.world.players.R;
  L.x = 500; R.x = 560; R.stun = 5;
  const evF = fire(m);                                     // 발동 틱에 이미 부딪혀 튕길 수 있다
  assert.ok(Math.abs(L.mods.speed - 1.3) < 1e-9); assert.ok(Math.abs(L.mods.jump - 1.2) < 1e-9);
  L.stun = 1; const ev0 = run(m, DT);
  assert.equal(L.stun, 0, 'cannot be knocked down while active');
  const ev = evF.concat(ev0, run(m, 0.5, inp({ right: true })));
  assert.ok(ev.some(e => e.type === 'knockback' && e.side === 'R'), 'opponent bumped');
  assert.ok(R.x > 600, `opponent pushed to ${R.x}`);
  const bumps = run(m, 2.0, inp({ right: true })).filter(e => e.type === 'knockback').length;
  assert.ok(bumps >= 1 && bumps <= 3, `bumps in 2s: ${bumps}`);
});

test('activate while active is ignored and mods do not accumulate across ticks', () => {
  const m = ready(11); const L = m.world.players.L;
  assert.equal(activateSpecial(m, 'L'), true);
  assert.equal(activateSpecial(m, 'L'), false);
  updateSpecials(m, DT); updateSpecials(m, DT);
  assert.equal(L.mods.speed, 2.0);
});
