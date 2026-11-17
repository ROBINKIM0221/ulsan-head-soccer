// 온라인 대전: 앞서 계산(predict)과 방 규칙(room)을 가짜 연결로 붙여 본다. 실제 연결(net/link.js)은 브라우저 점검으로.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DT, NO_INPUT } from '../js/sim/constants.js';
import { createMatch, stepMatch } from '../js/sim/match.js';
import { mulberry32 } from '../js/sim/rng.js';
import { byNumber } from '../js/data/players.js';
import { encode, decode, snapshotOf, predict } from '../js/net/predict.js';
import { createRoom, VERSION, AWAY_LIMIT_MS } from '../js/net/room.js';

const inp = o => ({ ...NO_INPUT, ...o });
const mkMatch = () => createMatch({ home: byNumber(14), away: byNumber(10), twoPlayer: true, rng: mulberry32(7) });
const TICK = 1000 / 120;

test('predict: replaying from a snapshot with the same inputs gives exactly what the host computes', () => {
  const m = mkMatch();
  const script = t => [inp({ right: t % 90 < 60, jump: t % 70 === 0 }), inp({ left: t % 80 < 50, jump: t % 55 === 0, kick: t % 40 === 0 })];
  for (let t = 0; t < 200; t++) { const [l, r] = script(t); stepMatch(m, l, DT, r); }
  const exact = JSON.stringify(snapshotOf(m), (k, v) => (k === 'def' ? v.number : v));   // 반올림 없이
  const snap = decode(exact);
  const heldL = inp({ right: true });
  predict(snap, { from: 200, to: 229, inputL: () => heldL, inputR: t => script(t)[1] });
  for (let t = 200; t < 230; t++) stepMatch(m, heldL, DT, script(t)[1]);
  assert.deepEqual(JSON.parse(JSON.stringify(snap.w, (k, v) => (k === 'def' ? v.number : v))), JSON.parse(JSON.stringify(m.world, (k, v) => (k === 'def' ? v.number : v))));
});

test('predict: the rounded wire format stays within half a pixel over 0.4s, and never touches the score', () => {
  const m = mkMatch();
  for (let t = 0; t < 300; t++) stepMatch(m, inp({ right: t % 50 < 30 }), DT, inp({ left: true, jump: t % 60 === 0 }));
  const raw = encode(snapshotOf(m));
  assert.ok(raw.length < 1100, 'snapshot is ' + raw.length + ' chars');
  const snap = decode(raw);
  predict(snap, { from: 1, to: 48, inputL: () => inp({ right: true }), inputR: () => inp({ left: true }) });
  for (let t = 0; t < 48; t++) stepMatch(m, inp({ right: true }), DT, inp({ left: true }));
  for (const side of ['L', 'R']) assert.ok(Math.abs(snap.w.players[side].x - m.world.players[side].x) < 0.5 && Math.abs(snap.w.players[side].y - m.world.players[side].y) < 0.5, side);
  assert.ok(Math.abs(snap.w.ball.x - m.world.ball.x) < 0.5 && Math.abs(snap.w.ball.y - m.world.ball.y) < 0.5, 'ball');
  assert.deepEqual(snap.m.scores, { L: 0, R: 0 });
});

// 가짜 연결 한 쌍: 보낸 메시지는 delay(ms) 뒤에 도착한다. 실제 link 처럼 0.5초마다 핑이 오가 lastHeard 가 새로워진다(frozen 인 쪽은 못 보낸다)
function rig(delay = 50) {
  let t = 1000;
  const now = () => t, queue = [];
  const mk = () => ({ open: false, lastHeard: 0, frozen: false, other: null, room: null,
    send(m) { if (this.open && !this.frozen) queue.push({ at: t + delay, to: this.other, raw: encode(m) }); },
    close() { this.open = false; if (this.other.open) { this.other.open = false; this.other.room.linkState('lost'); } } });
  const a = mk(), b = mk(); a.other = b; b.other = a;
  const host = createRoom({ host: true, now }), guest = createRoom({ host: false, id: 'g1', now });
  a.room = host; b.room = guest; host.attach(a); guest.attach(b);
  const log = { host: [], guest: [] };
  host.onStart = i => log.host.push(['start', i]); guest.onStart = i => log.guest.push(['start', i]);
  host.onAbort = r => log.host.push(['abort', r]); guest.onAbort = r => log.guest.push(['abort', r]);
  let pingAt = t;
  const advance = (ms = TICK) => {
    t += ms;
    if (t - pingAt >= 500) { pingAt = t; a.send({ t: 'ping' }); b.send({ t: 'ping' }); }
    for (let i = 0; i < queue.length;) { const q = queue[i]; if (q.at <= t) { queue.splice(i, 1); if (q.to.open) { q.to.lastHeard = t; q.to.room.message(JSON.parse(q.raw), q.raw); } } else i++; }
  };
  const connect = (id = 'g1') => { const v = host.join({ t: 'join', id, v: VERSION }); if (v === 'ok') { a.open = b.open = true; a.lastHeard = b.lastHeard = t; host.linkState('open'); guest.linkState('open'); } return v; };
  // 로비에서 둘 다 준비 → 경기 시작까지
  const toMatch = (opts) => {
    host.setMine(14, 'home'); guest.setMine(10, 'away'); connect(); advance(200);
    host.setReady(true); guest.setReady(true); advance(200);
    const mH = mkMatch(), mG = mkMatch(), nH = host.beginMatch(), nG = guest.beginMatch(opts);
    const s = { mH, mG, nH, nG, inL: NO_INPUT, inR: NO_INPUT, stepHost: true, stepGuest: true,
      run(ticks, each) { for (let i = 0; i < ticks; i++) { advance(); if (s.stepHost) nH.step(mH, s.inL, DT); if (s.stepGuest) nG.step(mG, s.inR, DT); each?.(i); } } };
    return s;
  };
  return { host, guest, a, b, log, advance, connect, toMatch, now };
}

test('room: both see each other\'s pick, and the match starts only when both are ready with different players', () => {
  const r = rig();
  r.host.setMine(14, 'home'); r.guest.setMine(14, 'away');
  assert.equal(r.connect(), 'ok'); r.advance(200);
  assert.deepEqual(r.guest.peer, { n: 14, kit: 'home', ready: false });
  assert.deepEqual(r.host.peer, { n: 14, kit: 'away', ready: false });
  r.host.setReady(true); r.guest.setReady(true); r.advance(200);
  assert.equal(r.log.host.length, 0, 'same player on both sides must not start');
  r.guest.setMine(10, 'away'); r.advance(200);
  assert.equal(r.host.peer.ready, false, 'changing the pick drops ready');
  r.guest.setReady(true); r.advance(200); r.advance(100);   // 준비 소식이 가고, 시작 소식이 돌아온다
  const info = { L: { n: 14, kit: 'home' }, R: { n: 10, kit: 'away' } };
  assert.deepEqual(r.log.host, [['start', info]]); assert.deepEqual(r.log.guest, [['start', info]]);
  assert.equal(r.host.me.ready, false);   // 다음 판은 다시 준비부터
});

test('room: a third person cannot take the seat, the same guest can come back, an old page is turned away', () => {
  const r = rig();
  r.connect('g1'); r.advance(100);
  assert.equal(r.host.join({ id: 'someone-else', v: VERSION }), 'full');
  assert.equal(r.host.join({ id: 'g1', v: VERSION }), 'ok');
  assert.equal(r.host.join({ id: 'g1', v: VERSION - 1 }), 'old');
  r.b.frozen = true; r.a.frozen = true;   // 들어와 있던 사람이 15초 넘게 소식이 없으면 자리가 빈다
  for (let i = 0; i < 160; i++) r.advance(100);
  assert.equal(r.host.join({ id: 'someone-else', v: VERSION }), 'ok');
});

test('guest: its own player moves on the very tick the button is pressed, and ends up where the host puts it', () => {
  const r = rig(50), s = r.toMatch();
  s.run(200);   // 킥오프 1초를 지나 경기 중
  assert.equal(s.mH.phase, 'play'); assert.equal(s.mG.phase, 'play');
  const x0 = s.mG.world.players.R.x, hx0 = s.mH.world.players.R.x;
  s.inR = inp({ left: true });
  s.run(1);
  assert.ok(s.mG.world.players.R.x < x0 - 3, 'guest screen moves at once: ' + (x0 - s.mG.world.players.R.x));
  assert.equal(s.mH.world.players.R.x, hx0, 'host has not heard yet');
  const seen = [], real = [];
  s.run(59, () => { seen.push(s.mG.world.players.R.x); real.push(s.mH.world.players.R.x); });
  s.inR = NO_INPUT;
  s.run(60, () => { seen.push(s.mG.world.players.R.x); real.push(s.mH.world.players.R.x); });
  assert.ok(Math.abs(s.mG.world.players.R.x - s.mH.world.players.R.x) < 0.01, 'settles on the same spot');
  // 들어온 쪽 화면은 방 만든 쪽의 6틱(50ms) 뒤 모습을 미리 보여 준다: 그만큼 밀어 대 보면 한 틱 거리(4px) 안에서 겹친다
  let worst = 0; for (let i = 0; i + 6 < seen.length; i++) worst = Math.max(worst, Math.abs(seen[i] - real[i + 6]));
  assert.ok(worst <= 4.1, 'prediction error ' + worst);
});

test('guest screen: the opponent does not teleport when it turns around', () => {
  const r = rig(50), s = r.toMatch();
  s.run(200);
  let prev = s.mG.world.players.L.x, worst = 0;
  const watch = () => { const x = s.mG.world.players.L.x; worst = Math.max(worst, Math.abs(x - prev)); prev = x; };
  for (const dir of ['right', 'left', 'right', null, 'left']) { s.inL = dir ? inp({ [dir]: true }) : NO_INPUT; s.run(40, watch); }
  assert.ok(worst <= 30, 'largest step in one tick: ' + worst.toFixed(1) + 'px (running is 4px)');
  s.inL = NO_INPUT; s.run(60);
  assert.ok(Math.abs(s.mG.world.players.L.x - s.mH.world.players.L.x) < 0.5, 'and it settles where the host has it');
});

test('guest without prediction waits a full round trip before its player moves', () => {
  const r = rig(50), s = r.toMatch({ predict: false });
  s.run(200);
  const x0 = s.mG.world.players.R.x;
  s.inR = inp({ left: true });
  s.run(10);
  assert.equal(s.mG.world.players.R.x, x0);
  s.run(12);
  assert.ok(s.mG.world.players.R.x < x0);
});

test('guest kick and jump reach the host even when pressed for a single tick', () => {
  const r = rig(50), s = r.toMatch();
  s.run(200);
  s.inR = inp({ jump: true }); s.run(1); s.inR = NO_INPUT;
  assert.equal(s.mG.world.players.R.onGround, false, 'guest sees its jump at once');
  s.run(12);
  assert.equal(s.mH.world.players.R.onGround, false, 'host applies the jump');
  s.run(240);
  const R = s.mH.world.players.R; Object.assign(s.mH.world.ball, { x: R.x - 45, y: 618, vx: 0, vy: 0, held: null }); R.kickCooldown = 0;
  s.run(8);   // 들어온 쪽이 그 공을 받아 볼 시간
  s.inR = inp({ kick: true }); s.run(1); s.inR = NO_INPUT;
  s.run(12);
  assert.ok(s.mH.world.ball.vx < -300, 'host ball was kicked: ' + s.mH.world.ball.vx);
});

test('away: when one side leaves, both stop, and play resumes after a 3-2-1 once they are back', () => {
  const r = rig(50), s = r.toMatch();
  s.run(200);
  s.nG.setAway(true);
  s.run(30);
  const clock = s.mH.clock;
  s.run(240);   // 2초
  assert.equal(s.mH.clock, clock, 'host clock is frozen while the guest is away');
  assert.deepEqual({ me: s.nH.hold().me, peer: s.nH.hold().peer, count: s.nH.hold().count }, { me: false, peer: true, count: 0 });
  assert.equal(s.nG.hold().me, true);
  assert.ok(s.nH.hold().left <= 18 && s.nH.hold().left >= 16);
  s.nG.setAway(false);
  s.run(30);
  assert.equal(s.nH.hold().count, 3); assert.equal(s.nG.hold().count, 3);
  assert.equal(s.mH.clock, clock);
  s.run(330);
  assert.equal(s.nH.hold(), null); assert.equal(s.nG.hold(), null);
  assert.ok(s.mH.clock < clock, 'playing again');
});

test('away: the host side leaving stops the guest too (told by message, or noticed by silence)', () => {
  const r = rig(50), s = r.toMatch();
  s.run(200);
  s.nH.setAway(true); s.stepHost = false; r.a.frozen = true;   // 방 만든 쪽 폰이 다른 앱으로: 알리고 나서 화면이 멈춘다
  s.run(60);
  assert.deepEqual({ peer: s.nG.hold().peer, silent: s.nG.hold().silent }, { peer: true, silent: false });
  r.a.frozen = false; s.stepHost = true; s.nH.setAway(false);
  s.run(30);
  assert.equal(s.nG.hold().count, 3);
  s.run(330);
  assert.equal(s.nG.hold(), null);
  // 알리지도 못하고 끊긴 경우: 2초 소식이 없으면 연결 문제로 보고 기다린다
  s.stepHost = false; r.a.frozen = true;
  s.run(300);
  assert.deepEqual({ peer: s.nG.hold().peer, silent: s.nG.hold().silent }, { peer: false, silent: true });
});

test('away: nobody waits more than 20 seconds, and quitting ends it for the other side at once', () => {
  let r = rig(50), s = r.toMatch();
  s.run(200);
  s.stepGuest = false; r.b.frozen = true;   // 들어온 쪽이 사라졌다
  s.run(Math.ceil((AWAY_LIMIT_MS + 3000) / TICK));
  assert.deepEqual(r.log.host.at(-1), ['abort', 'timeout-peer']);
  assert.equal(r.host.match, null);

  r = rig(50); s = r.toMatch();
  s.run(200);
  s.nG.quit(); s.run(20);
  assert.deepEqual(r.log.host.at(-1), ['abort', 'peer-quit']);
  assert.equal(r.guest.match, null);

  r = rig(50); s = r.toMatch();
  s.run(200);
  r.b.close(); s.run(5);
  assert.deepEqual(r.log.host.at(-1), ['abort', 'lost']);
  assert.equal(r.host.peer, null);
});
