import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../js/sim/match.js';
import { byNumber } from '../js/data/players.js';
import { createFx, pushEvents, updateFx, cutinPlace } from '../js/render/scene.js';
import { SHOOT_CAMS, SHOOT_TOP } from '../js/ui/orientation.js';
import { FIELD, DT } from '../js/sim/constants.js';

const match = () => createMatch({ home: byNumber(10), away: byNumber(99), rng: () => 0.5 });
const run = (fx, m, seconds) => { for (let i = 0, n = Math.round(seconds / DT); i < n; i++) updateFx(fx, m, DT); };

// 촬영용 화면 ?shoot=cam: 편집 때 이름표 밑 양쪽 모서리(논리 x 13~318, 962~1267)에 선수 창을 얹는다. 필살기 컷인 띠가 그 창에 가리지 않아야 한다
test('cutinPlace: the special cut-in starts at the screen edge; with the shoot cams it moves inward, between the two camera windows, at the same height', () => {
  const v = { bleedX: 0, top: 0, bottom: 720 }, L = cutinPlace(v, 'L'), R = cutinPlace(v, 'R');
  assert.deepEqual([L.faceX, L.tx, L.inner, L.y], [104, 196, 650, 140]);
  assert.deepEqual([R.faceX, R.tx, R.inner, R.y], [FIELD.W - 104, FIELD.W - 196, FIELD.W - 650, 140]);
  const c = { ...v, cutin: SHOOT_CAMS }, Lc = cutinPlace(c, 'L'), Rc = cutinPlace(c, 'R');
  assert.equal(Lc.y, 140, 'not lower: below the windows the band would cover the players\' heads');
  assert.ok(Lc.faceX - 78 > 318 && Lc.inner < 962, 'L: face and name between the windows');
  assert.ok(Rc.faceX + 78 < 962 && Rc.inner > 318, 'R: mirrored, still between the windows');
  assert.equal(Lc.len, 650 + SHOOT_CAMS.dx);   // 밖에서 미끄러져 들어올 때 다 숨을 만큼
});

// 촬영용 화면 ?shoot=top: 위 가운데(논리 x 400~880)는 두 선수 자리
test('shoot=top: the cut-in stops before the players in the top centre, and GOAL / KICK OFF drop below the score bar', () => {
  const v = { bleedX: 0, top: 0, bottom: 720, topBox: SHOOT_TOP }, L = cutinPlace(v, 'L'), R = cutinPlace(v, 'R');
  assert.ok(L.inner < SHOOT_TOP.x && R.inner > SHOOT_TOP.x + SHOOT_TOP.w, 'band ends before the players on both sides');
  assert.equal(L.y, 140); assert.ok(L.size < 156 && L.maxText > 150 && L.maxText < 250, 'smaller face, name fitted to what is left');
  assert.equal(cutinPlace({ bleedX: 0, top: 0, bottom: 720 }, 'L').maxText, Infinity);
  const fx = createFx(), m = match(); fx.view = v;
  pushEvents(fx, [{ type: 'goal', scorer: 'L' }], m);
  const goal = fx.pops.find(p => p.text === 'GOAL'), barBottom = SHOOT_TOP.bar.y + SHOOT_TOP.bar.h;
  assert.ok(goal.y - 50 - 16 > barBottom, 'GOAL (Teko capitals are about 2/3 of the 150px size = 100 tall, and it rises 16) stays clear of the score bar: ' + goal.y);
  const plain = createFx(); pushEvents(plain, [{ type: 'goal', scorer: 'L' }], match());
  assert.equal(plain.pops.find(p => p.text === 'GOAL').y, 236);   // 평소 화면은 그대로
  // 이긴 뒤의 큰 글자(VAMOS!)도 받침대 밑으로 (위 가운데와 받침대에 겹치지 않게)
  m.scores.L = 1; m.result = 'win'; m.phase = 'over'; pushEvents(fx, [{ type: 'phase', phase: 'over' }], m);
  assert.ok(fx.party && 250 + fx.party.drop - 60 > barBottom, 'VAMOS! (about 120 tall around y 250 + drop) below the bar: drop ' + (fx.party && fx.party.drop));
  m.scores.L = 1; const p0 = createFx(), m0 = match(); m0.scores.L = 1; m0.result = 'win'; m0.phase = 'over'; pushEvents(p0, [{ type: 'phase', phase: 'over' }], m0);
  assert.equal(p0.party.drop, 0);
});

// 골은 플래시 + 관중석 카메라 플래시 + 골문에서 튀는 조각, 득점자 이름은 남색 판 위에
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

// 움직임 줄이기(윈도우 애니메이션 끔 등): 화면 전체가 흔들리고 번쩍이는 것만 빠지고, 고리·조각 같은 연출은 어느 기기에서나 같게 남는다
test('reduce motion: no screen shake, goal flash or crowd flashes; rings, sparks and the cut-in still show', () => {
  const m = match(), fx = createFx(); fx.reduceMotion = true;
  pushEvents(fx, [{ type: 'goal', scorer: 'L' }, { type: 'touch', part: 'head', perfect: true }, { type: 'special', side: 'L', id: 'laser' }], m);
  updateFx(fx, m, DT);
  assert.equal(fx.flash, 0); assert.equal(fx.crowd, 0); assert.equal(fx.shake, 0);
  assert.ok(fx.sparks.length > 0 && fx.rings.length > 0, 'effects stay');
  assert.ok(fx.cutin && fx.pops.some(p => p.text === 'GOAL'), 'information stays');
});

// 투지 폭발 불꽃은 필살기 그 자체라 움직임 줄이기에서도 남는다(윈도우 "애니메이션 표시"를 끄면 크롬이 움직임 줄이기로 알린다)
test('reduce motion: the spirit flames still burn (they are the special itself)', () => {
  const m = match(), fx = createFx(); fx.reduceMotion = true;
  m.world.players.L.active = { id: 'spirit', t: 5, data: {} };
  for (let i = 0; i < 10; i++) updateFx(fx, m, DT);
  assert.ok(fx.flames.length > 10, 'flames: ' + fx.flames.length);
});

// 커브 슛이 나가는 순간 금색 충격 고리와 튀는 조각, 날아가는 동안 혜성 꼬리와 금가루. 골이 들어가면 그 골문 그물이 출렁인다
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

// 대포 헤딩(야고): 헤딩 순간 공이 대포알이 되고(글자는 띄우지 않는다), 누가 건드리거나 땅에 닿으면 축구공으로 돌아온다
test('cannon header: the ball becomes a cannonball (no BOOM text) until someone touches it or it lands', () => {
  const m = match(), fx = createFx(), b = m.world.ball;
  m.world.players.R.active = { id: 'cannon', t: 5, data: {} };
  Object.assign(b, { x: 700, y: 300, vx: -900, vy: -200 });
  pushEvents(fx, [{ type: 'touch', side: 'R', part: 'head' }], m);
  assert.ok(fx.cannonball, 'cannonball after the header');
  assert.ok(!fx.pops.some(p => p.text === 'BOOM'), 'no BOOM text');
  run(fx, m, 0.2); assert.ok(fx.cannonball, 'still a cannonball in flight');
  pushEvents(fx, [{ type: 'touch', side: 'L', part: 'head' }], m);
  assert.equal(fx.cannonball, null, 'back to a football once touched');
  pushEvents(fx, [{ type: 'touch', side: 'R', part: 'head' }], m);
  b.y = FIELD.GROUND - b.r; run(fx, m, DT);
  assert.equal(fx.cannonball, null, 'back to a football when it lands');
  m.world.players.R.active = null; pushEvents(fx, [{ type: 'touch', side: 'R', part: 'head' }], m);
  assert.ok(!fx.cannonball, 'an ordinary header does nothing');
});

// 폭 맞춤: 위가 잘린 화면(view.top > 0)은 HUD 가 그만큼 내려오므로 가운데 큰 글자도 0.6배만큼 내리고, 색종이는 보이는 화면 맨 위에서 떨어진다
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

// 오프사이드 트랩: 컷인 띠와 함께, 걸린 상대 머리 위쪽에 OFFSIDE 글자
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
