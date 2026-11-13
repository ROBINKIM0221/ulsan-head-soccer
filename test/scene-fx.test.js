import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../js/sim/match.js';
import { byNumber } from '../js/data/players.js';
import { createFx, pushEvents, updateFx } from '../js/render/scene.js';
import { FIELD, DT } from '../js/sim/constants.js';

const match = () => createMatch({ home: byNumber(10), away: byNumber(99), rng: () => 0.5 });
const run = (fx, m, seconds) => { for (let i = 0, n = Math.round(seconds / DT); i < n; i++) updateFx(fx, m, DT); };

// 2026-11-12 형준 "UI랑 게임 최대한 예뻐보이게": 골은 플래시 + 관중석 카메라 플래시 + 골문에서 튀는 조각, 득점자 이름은 남색 판 위에
test('goal: flash, crowd camera flashes, sparks from the scored goal, and the scorer name on a plate', () => {
  const m = match(), fx = createFx();
  pushEvents(fx, [{ type: 'goal', scorer: 'L' }], m);
  assert.ok(fx.flash > 0 && fx.crowd > 0 && fx.shake > 0);
  assert.ok(fx.sparks.length >= 20 && fx.sparks.every(q => q.x > FIELD.W / 2), 'sparks at the right goal: L scored there');
  const [goal, name] = fx.pops;
  assert.equal(goal.text, 'GOAL'); assert.equal(goal.glow, true);
  assert.equal(name.text, '이동경'); assert.equal(name.plate, true);
  run(fx, m, 2.5);
  assert.equal(fx.flash, 0); assert.equal(fx.crowd, 0); assert.equal(fx.sparks.length, 0, 'it all dies down');
  const fxR = createFx(); pushEvents(fxR, [{ type: 'goal', scorer: 'R' }], m);
  assert.ok(fxR.sparks.every(q => q.x < FIELD.W / 2), 'R scores into the left goal');
});

test('special: a cut-in banner for the side that fired, gone after about a second', () => {
  const m = match(), fx = createFx();
  pushEvents(fx, [{ type: 'special', side: 'R', id: 'cannon' }], m);
  assert.equal(fx.cutin.side, 'R'); assert.equal(fx.cutin.def.number, 99);
  assert.equal(fx.pops.length, 0, 'the banner replaces the old text pop');
  run(fx, m, 0.5); assert.ok(fx.cutin, 'still showing at 0.5s');
  run(fx, m, 0.8); assert.equal(fx.cutin, null);
});

test('reduce motion: no flash, sparks, rings or streaks; the cut-in banner still shows (it just does not slide)', () => {
  const m = match(), fx = createFx(); fx.reduceMotion = true;
  pushEvents(fx, [{ type: 'goal', scorer: 'L' }, { type: 'touch', part: 'head', perfect: true }, { type: 'special', side: 'L', id: 'laser' }], m);
  updateFx(fx, m, DT);
  assert.equal(fx.flash, 0); assert.equal(fx.crowd, 0); assert.equal(fx.shake, 0); assert.equal(fx.net, null);
  assert.equal(fx.sparks.length + fx.rings.length + fx.streak.length + fx.particles.length, 0);
  assert.ok(fx.cutin && fx.pops.some(p => p.text === 'GOAL'), 'information stays');
});

// 2026-11-14 형준 "이팩트도 좀 필요할듯": 커브 슛이 나가는 순간 금색 충격 고리와 튀는 조각, 날아가는 동안 혜성 꼬리와 금가루. 골이 들어가면 그 골문 그물이 출렁인다
test('curve shot: a gold burst where it is struck, then a comet tail and gold dust while it flies; the laser keeps its own look', () => {
  const m = match(), fx = createFx(), b = m.world.ball;
  Object.assign(b, { x: 500, y: 600, vx: 600, vy: -800, flight: 'curve' });
  pushEvents(fx, [{ type: 'shot', side: 'L', flight: 'curve' }], m);
  assert.ok(fx.rings.some(q => q.color === '#FFC72C' && q.r > 100 && q.x === 500), 'big gold ring at the ball');
  assert.ok(fx.sparks.length >= 10 && fx.sparks.every(q => q.vx < 0), 'pieces fly back from a left-side shot');
  assert.ok(fx.shake > 0);
  run(fx, m, 0.1);
  assert.ok(fx.trail.length >= 10, 'tail points: ' + fx.trail.length);
  assert.ok(fx.particles.some(q => q.color === '#FFC72C'), 'gold dust');
  b.flight = null; run(fx, m, 0.6);
  assert.equal(fx.trail.length, 0, 'the tail fades out after the flight');
  const laser = createFx(); pushEvents(laser, [{ type: 'shot', side: 'L', flight: 'laser' }], m);
  assert.equal(laser.sparks.length + laser.rings.length, 0);
});

test('goal: the net of the goal the ball went into ripples for a moment', () => {
  const m = match(), fx = createFx();
  pushEvents(fx, [{ type: 'goal', scorer: 'L' }], m);
  assert.equal(fx.net.side, 'R', 'L scores into the right goal');
  run(fx, m, 0.3); assert.ok(fx.net && fx.net.age > 0.2);
  run(fx, m, 0.5); assert.equal(fx.net, null);
  pushEvents(fx, [{ type: 'goal', scorer: 'R' }], m); assert.equal(fx.net.side, 'L');
});

test('touch: a ring where the ball was hit (not for body bumps), gold for a perfect header', () => {
  const m = match(), fx = createFx();
  pushEvents(fx, [{ type: 'touch', part: 'foot' }, { type: 'touch', part: 'body' }, { type: 'touch', part: 'head', perfect: true }], m);
  assert.equal(fx.rings.length, 2);
  assert.equal(fx.rings[1].color, '#FFC72C');
});

// 2026-11-13 폭 맞춤: 위가 잘린 화면(view.top > 0)은 HUD 가 그만큼 내려오므로 가운데 큰 글자도 0.6배만큼 내리고, 색종이는 보이는 화면 맨 위에서 떨어진다
test('cropped view: centre pops sit lower by 0.6 x the cropped top, and confetti starts at the visible top edge', () => {
  const m = match(), fx = createFx(); fx.view = { s: 1, ox: 0, oy: 0, bleedX: 0, top: 90, bottom: 675 };
  pushEvents(fx, [{ type: 'goal', scorer: 'L' }], m);
  assert.equal(fx.pops[0].y, 236 + 54); assert.equal(fx.pops[1].y, 338 + 54);
  const plain = createFx(); pushEvents(plain, [{ type: 'goal', scorer: 'L' }], m);
  assert.equal(plain.pops[0].y, 236, 'a 16:9 screen is unchanged');
  const tall = createFx(); tall.view = { s: 1, ox: 0, oy: 0, bleedX: 0, top: -120, bottom: 840 }; pushEvents(tall, [{ type: 'goal', scorer: 'L' }], m);
  assert.equal(tall.pops[0].y, 236, 'extra sky above does not move them either');
  m.phase = 'over'; m.result = 'win';
  pushEvents(fx, [{ type: 'phase', phase: 'over' }], m); updateFx(fx, m, DT);
  assert.ok(fx.party.confetti.length > 0 && fx.party.confetti.every(q => q.y > 79 && q.y < 90), 'confetti is born just above the visible top (y = 80)');
});

// 2026-11-13 형준 "오프사이드 트랩… 이거 해보자": 컷인 띠와 함께, 걸린 상대 머리 위쪽에 OFFSIDE 글자
test('offside trap: the cut-in plus an OFFSIDE pop over the opponent who got caught', () => {
  const m = match(), fx = createFx(); m.world.players.R.x = 1000;
  pushEvents(fx, [{ type: 'special', side: 'L', id: 'offside' }], m);
  assert.equal(fx.cutin.side, 'L');
  assert.equal(fx.pops.length, 1); assert.equal(fx.pops[0].text, 'OFFSIDE'); assert.equal(fx.pops[0].x, 1000);
});

// 넓은 폰은 경기장 바깥 여백까지 보인다: 세레모니 벤치 선수들은 보이는 곳 밖에서 달려와야 한다
test('party: with side bleed the bench starts beyond the visible edge, and confetti covers the bleed too', () => {
  const m = match(); m.phase = 'over'; m.result = 'win';
  const fx = createFx(); fx.view = { s: 1, ox: 0, oy: 0, bleedX: 140, top: 0, bottom: 720 };
  pushEvents(fx, [{ type: 'phase', phase: 'over' }], m);
  assert.ok(fx.party.members.every(x => x.body.x < -140 || x.body.x > FIELD.W + 140), 'nobody pops into view');
  run(fx, m, 3);
  assert.ok(fx.party.confetti.some(q => q.x < 0 || q.x > FIELD.W), 'confetti falls in the bleed');
  assert.ok(fx.party.members.every(x => x.body.x >= 60 && x.body.x <= FIELD.W - 60), 'and they still gather inside the field');
});
