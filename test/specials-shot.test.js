import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, PHYS, DT, MATCH, NO_INPUT } from '../js/sim/constants.js';
import { headCenter, footPoint, resetKickoff } from '../js/sim/physics.js';
import { createMatch, stepMatch, substitute } from '../js/sim/match.js';
import { mulberry32 } from '../js/sim/rng.js';
import { byNumber } from '../js/data/players.js';
import { SPECIALS } from '../js/sim/specials.js';

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
// 발 앞, 몸통에는 닿지 않는 자리(몸통 반폭 28 + 공 반지름 22 = 50 보다 조금 멀리): 몸통에 겹쳐 두면 슛 버튼보다 그 접촉이 먼저 필살기를 쏜다
const ballAtFoot = m => { const L = m.world.players.L; Object.assign(m.world.ball, { held: null, x: L.x + 52, y: FIELD.GROUND - PHYS.BALL_R, vx: 0, vy: 0 }); };
const speed = b => Math.hypot(b.vx, b.vy);

test('laser: next kick flies straight at 1200 with no gravity for .8s and passes through the opponent, then scores from close range', () => {
  const m = ready(10); const L = m.world.players.L, R = m.world.players.R; const b = m.world.ball;
  fire(m);
  assert.equal(L.active.armed, true);
  L.x = 760; R.x = 920; ballAtFoot(m);
  const kickEv = run(m, DT, inp({ kick: true }));
  assert.deepEqual(kickEv.find(e => e.type === 'shot'), { type: 'shot', side: 'L', flight: 'laser' }, 'the special shot announces itself (effects and sound hang on it)');
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

// 골문 안의 한 점(위아래 30px 안쪽)을 조준하고 ±2° 오차
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

// 슛 버튼을 안 눌러도, 발동해 있는 동안 공이 몸통 아래쪽 절반의 앞면에 맞으면 나간다 (굴러오는 공은 발에서 22px 높이)
const rollIntoBody = (m, side = 'L', from = 1) => { const p = m.world.players[side], d = (side === 'L' ? 1 : -1) * from; Object.assign(m.world.ball, { held: null, x: p.x + d * 90, y: FIELD.GROUND - PHYS.BALL_R, vx: -d * 300, vy: 0 }); };
test('shot specials: an armed laser or curve also goes off when the ball hits the lower body from the front, with no kick pressed', () => {
  for (const [no, flight] of [[10, 'laser'], [14, 'curve']]) {
    const m = ready(no); const L = m.world.players.L, b = m.world.ball;
    fire(m); L.x = 600; rollIntoBody(m);
    const ev = run(m, 0.3);
    assert.deepEqual(ev.find(e => e.type === 'shot'), { type: 'shot', side: 'L', flight, by: 'body' }, flight);
    assert.equal(ev.some(e => e.type === 'touch' && e.part === 'body'), true);
    assert.equal(L.active && L.active.armed, false, 'one-shot consumed');
    assert.equal(b.passThrough, 'R'); assert.ok(b.vx > 300, flight + ' flies at the opponent goal: ' + b.vx);
  }
  const m = createMatch({ home: byNumber(19), away: byNumber(10), difficulty: 'first', rng: mulberry32(1), twoPlayer: true });   // 오른쪽 선수도 같다
  for (let i = 0; i < 125; i++) stepMatch(m, NO_INPUT, DT);
  m.world.players.R.gauge = 100; run(m, DT); m.world.players.L.x = 120; rollIntoBody(m, 'R');
  assert.deepEqual(run(m, 0.3).find(e => e.type === 'shot'), { type: 'shot', side: 'R', flight: 'laser', by: 'body' });
  assert.ok(m.world.ball.vx < -300);
});

test('shot specials: not off the head or chest, not off a ball arriving from behind, and not when nothing is armed', () => {
  let m = ready(10); let L = m.world.players.L;
  fire(m); L.x = 600; const h = headCenter(L);
  Object.assign(m.world.ball, { held: null, x: h.x + 10, y: h.y - h.r - 60, vx: 0, vy: 300 });
  let ev = run(m, 0.3);
  assert.ok(ev.some(e => e.type === 'touch' && e.part === 'head') && !ev.some(e => e.type === 'shot'), 'a header keeps it armed');
  assert.equal(L.active.armed, true); assert.equal(m.world.ball.flight, null);
  m = ready(10); L = m.world.players.L; fire(m); L.x = 600;
  Object.assign(m.world.ball, { held: null, x: L.x + 62, y: L.y - 58, vx: -300, vy: 0 });   // 가슴 높이(몸통 위쪽 절반)
  ev = run(m, 0.1);
  assert.ok(ev.some(e => e.type === 'touch' && e.part === 'body') && !ev.some(e => e.type === 'shot'), 'chest-high it is an ordinary bounce');
  assert.equal(L.active.armed, true);
  m = ready(10); L = m.world.players.L; fire(m); L.x = 600; rollIntoBody(m, 'L', -1);
  ev = run(m, 0.3);
  assert.ok(ev.some(e => e.type === 'touch' && e.part === 'body') && !ev.some(e => e.type === 'shot'), 'off the back it is an ordinary bounce');
  assert.equal(L.active.armed, true);
  m = ready(10); m.world.players.L.x = 600; rollIntoBody(m);
  assert.ok(!run(m, 0.3).some(e => e.type === 'shot'), 'no special, no shot');
});

test('shot specials: pressing kick on the same tick or right after does not overwrite the shot that just left the body', () => {
  const m = ready(10); const L = m.world.players.L, b = m.world.ball;
  fire(m); L.x = 600; rollIntoBody(m);
  const ev = run(m, 0.3, inp({ kick: true }));   // 슛을 계속 누르고 있다
  assert.equal(ev.filter(e => e.type === 'shot').length, 1);
  assert.equal(b.flight, 'laser'); assert.ok(speed(b) > 1150 && b.noGravityT > 0, 'still the laser (only air drag has slowed it): ' + speed(b));
  // 두 선수 사이에 낀 공이어도 그대로 나간다(끼인 공을 위로 빼며 가로 속도를 줄이는 처리를 받지 않는다)
  const m2 = ready(10); const L2 = m2.world.players.L, R2 = m2.world.players.R;
  fire(m2); L2.x = 600; R2.x = 600 + 28 + 44 + 28 + 2; Object.assign(m2.world.ball, { held: null, x: 600 + 28 + 21, y: FIELD.GROUND - PHYS.BALL_R, vx: 0, vy: 0 });
  run(m2, 0.05);
  assert.equal(m2.world.ball.flight, 'laser'); assert.ok(Math.abs(speed(m2.world.ball) - 1200) < 20, 'squeezed between both bodies: ' + speed(m2.world.ball));
});

// 한 방형은 시간 제한 없이 나갈 때까지 기다린다
test('shot specials: an armed laser or curve waits as long as it takes (no 6s limit), then goes off once and is gone', () => {
  for (const [no, id] of [[10, 'laser'], [14, 'curve']]) {
    const m = ready(no); const L = m.world.players.L;
    fire(m);
    const ev = run(m, 25);
    assert.equal(L.active && L.active.armed, true, id + ' still armed after 25s');
    assert.ok(!ev.some(e => e.type === 'specialEnd'), 'nothing ended');
    L.x = 500; ballAtFoot(m);
    assert.deepEqual(run(m, DT, inp({ kick: true })).find(e => e.type === 'shot'), { type: 'shot', side: 'L', flight: id });
    const after = run(m, 6);   // 골이 들어가면 2초 멈췄다가, 남은 비행 시간이 지나야 끝난다
    assert.ok(after.some(e => e.type === 'specialEnd' && e.id === id), 'the special ends once the shot is over');
    assert.equal(L.active, null);
    ballAtFoot(m); m.world.goalLatch = false;
    const plain = run(m, DT, inp({ kick: true }));
    assert.ok(Math.abs(speed(m.world.ball) - PHYS.KICK_SPEED) < 10, 'ordinary kick afterwards');
    assert.ok(!plain.some(e => e.type === 'shot'), 'an ordinary kick is not a special shot');
  }
});

test('curve: from midfield the next kick leaves at 55deg/1050, accelerates toward the goal and passes through the opponent for the whole flight', () => {
  const m = ready(14); const L = m.world.players.L; const b = m.world.ball;
  fire(m);
  L.x = 400; ballAtFoot(m);
  run(m, DT, inp({ kick: true }));
  const deg = Math.atan2(-b.vy, b.vx) * 180 / Math.PI;
  assert.ok(Math.abs(deg - 55) < 1.5, `angle ${deg}`); assert.ok(Math.abs(speed(b) - 1050) < 10, `speed ${speed(b)}`);
  assert.equal(b.flight, 'curve'); assert.ok(b.curveAx > 250 && b.curveAx < 900, `aimed acceleration ${b.curveAx}`); assert.equal(b.passThrough, 'R');
  const vx0 = b.vx;
  run(m, 0.5);
  assert.ok(b.vx - vx0 > 100, `horizontal gain ${b.vx - vx0}`);    // 가속×0.5 에서 공기 저항을 뺀 만큼
  assert.equal(b.passThrough, 'R', 'still passing through at .5s (it used to stop after .35s)');
  for (let t = 0; t < 4 && b.flight && m.phase !== 'kickoff'; t += DT) run(m, DT);
  assert.equal(b.flight, null); assert.equal(b.curveAx, 0); assert.equal(b.passThrough, null);
});

// 커브 슛 조준: 가속을 고정하면 자기 진영에서 차야 들어가고 중간 거리에서는 크로스바를 넘는다.
// 조준하면 어디서 차든 내려오는 공이 크로스바 밑을 지난다. x 는 자기 골라인에서 잰 거리(오른쪽 선수는 거울상), keeper 는 상대가 서 있을 자리(없으면 방해 안 되는 곳), 둘 다 가만히 있는다.
function curveFrom(x, { right = false, keeper = null, ballY = FIELD.GROUND - PHYS.BALL_R, off = 52 } = {}) {   // off 52: 발 앞, 몸통에는 안 닿는 자리(ballAtFoot 과 같다)
  const m = createMatch({ home: byNumber(right ? 19 : 14), away: byNumber(right ? 14 : 19), difficulty: 'first', rng: mulberry32(1), twoPlayer: true });
  const step = (inL = NO_INPUT, inR = NO_INPUT) => stepMatch(m, inL, DT, inR);
  for (let i = 0, n = Math.round((MATCH.GOAL_PAUSE + DT) / DT); i < n; i++) step();
  const side = right ? 'R' : 'L', me = m.world.players[side], foe = m.world.players[right ? 'L' : 'R'], d = right ? -1 : 1, b = m.world.ball;
  const at = v => (right ? FIELD.W - v : v);
  me.x = at(x); foe.x = at(keeper !== null ? keeper : x >= 400 ? x - 250 : x + 350);   // 뒤에 두거나, 자리가 없으면 공이 머리 위로 넘어가는 앞쪽에
  me.gauge = 100; step();
  Object.assign(b, { held: null, x: me.x + d * off, y: ballY, vx: 0, vy: 0 });
  const kick = inp({ kick: true }), kickEv = step(right ? NO_INPUT : kick, right ? kick : NO_INPUT);
  const shot = { deg: Math.atan2(-b.vy, b.vx * d) * 180 / Math.PI, vx: b.vx * d, ax: b.curveAx * d, flight: b.flight, goal: false, blocked: false, event: kickEv.find(e => e.type === 'shot') };
  for (let i = 0; i < 2.5 / DT && !shot.goal; i++) {
    const ev = step();
    if (b.flight === 'curve' && ev.some(e => e.type === 'touch' && e.side !== side)) shot.blocked = true;   // 날아가는 공을 상대가 건드렸다
    shot.goal = ev.some(e => e.type === 'goal' && e.scorer === side);
  }
  return shot;
}
test('curve: from anywhere on the pitch the shot drops under the bar into an unguarded goal, for either side and for a ball struck in the air', () => {
  for (let x = 120; x <= 1100; x += 70) assert.equal(curveFrom(x).goal, true, `left player from ${x}`);
  for (const x of [150, 400, 640, 820, 1000]) assert.equal(curveFrom(x, { right: true }).goal, true, `right player from ${x}`);
  for (const x of [200, 500, 800, 1000]) assert.equal(curveFrom(x, { ballY: 570, off: 60 }).goal, true, `volley from ${x}`);
});

test('curve: far out it keeps the 55deg launch and bends in; nearer it slows the launch (never under 350, to clear the kicker\'s own head); inside 190px it is driven low', () => {
  const far = curveFrom(300), mid = curveFrom(800), close = curveFrom(1000);
  assert.ok(Math.abs(far.deg - 55) < 1 && far.ax > 250, JSON.stringify(far));
  assert.ok(mid.vx >= 350 - 1e-9 && mid.vx < 602 && mid.deg > 55 && mid.deg < 70 && mid.ax < far.ax, JSON.stringify(mid));
  assert.ok(Math.abs(close.deg - 20) < 1 && close.flight === 'curve', JSON.stringify(close));
});

// 날아가는 내내 상대를 통과한다
// (처음 잠깐만 통과하면 찬 직후나 골문 앞에서 자주 막힌다)
test('curve: nobody can cut it out in flight — not an opponent right in front of the kicker, one under the arc, or one standing on the goal line', () => {
  for (const [x, keeper] of [[400, 480], [400, 800], [400, 1150], [640, 1150], [200, 640], [760, 1150]]) {
    const s = curveFrom(x, { keeper });
    assert.equal(s.blocked, false, `from ${x} past an opponent at ${keeper}: touched in flight`);
    assert.equal(s.goal, true, `from ${x} past an opponent at ${keeper}`);
  }
  assert.equal(curveFrom(640, { right: true, keeper: 1150 }).goal, true, 'right player too');
  assert.deepEqual(curveFrom(400).event, { type: 'shot', side: 'L', flight: 'curve' });
});

// 슛 성공률: 어디서 어떤 높이로 차도 상대 AI 가 지키는 골문에 들어간다
// (레이저는 먼 데서도 골문까지 힘이 남고, 감아차기는 찬 선수 머리에 걸리지 않으며, 골문 가까이 높은 공은 아래로 꽂는다)
function shootFrom(no, x, y) {
  const m = createMatch({ home: byNumber(no), away: byNumber(21), difficulty: 'first', rng: mulberry32(3) });
  for (let i = 0, n = Math.round((MATCH.GOAL_PAUSE + DT) / DT); i < n; i++) stepMatch(m, NO_INPUT, DT);
  const L = m.world.players.L, R = m.world.players.R;
  L.x = Math.max(60, x - 60); R.x = 1150; L.gauge = 100; run(m, DT, inp({ special: true }));
  Object.assign(m.world.ball, { held: null, attached: null, x, y, vx: 0, vy: 0 });
  assert.ok(SPECIALS[L.active.id].onKick(m, 'L'), 'armed shot goes off');   // 높이 뜬 공도 그 자리에서 찬 것처럼(점프해서 찬 공)
  for (let i = 0; i < 3 / DT; i++) {
    const ev = stepMatch(m, NO_INPUT, DT);
    if (ev.some(e => e.type === 'goal' && e.scorer === 'L')) return true;
    if (ev.some(e => e.type === 'touch' && e.side === 'R')) return false;
  }
  return false;
}
test('shot specials score from anywhere at any height against a defending keeper', () => {
  for (const no of [10, 14]) for (const y of [FIELD.GROUND - PHYS.BALL_R, FIELD.GROUND - 70, FIELD.GROUND - 200]) for (const x of [150, 250, 640, 900, 950, 1050]) {
    assert.equal(shootFrom(no, x, y), true, `${no === 10 ? 'laser' : 'curve'} from x ${x}, y ${y}`);
  }
});

// 오프사이드 트랩: 상대가 2.5초 그 자리에 선다.
// (어디서 터져도 효과가 난다.)
const twoP = (homeNo, awayNo) => { const m = ready(homeNo, awayNo); m.twoPlayer = true; return m; };   // 오른쪽 입력을 직접 준다
const both = (m, seconds, inR) => { const ev = []; for (let i = 0, n = Math.round(seconds / DT); i < n; i++) ev.push(...stepMatch(m, NO_INPUT, DT, inR)); return ev; };
test('offside trap: wherever the opponent is, they stand still for 2.5s (no move, jump or kick), then play on', () => {
  const m = twoP(96, 10); const L = m.world.players.L, R = m.world.players.R;
  L.x = 200; R.x = 900;                                   // 멀리 떨어져 있어도 걸린다
  const ev = fire(m);
  assert.ok(ev.some(e => e.type === 'special' && e.side === 'L' && e.id === 'offside'));
  const mash = inp({ left: true, jump: true, kick: true });
  const frozenEv = both(m, 2.4, mash);
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
