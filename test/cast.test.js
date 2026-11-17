import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch } from '../js/sim/match.js';
import { byNumber } from '../js/data/players.js';
import { mulberry32 } from '../js/sim/rng.js';
import { DT, NO_INPUT } from '../js/sim/constants.js';

// 가짜 PeerJS: 경기하는 쪽이 만든 Peer 와, 보는 쪽이 붙는 연결 하나
class FakeConn {
  constructor() { this.open = true; this.sent = []; this.h = {}; }
  on(ev, f) { this.h[ev] = f; }
  send(s) { this.sent.push(s); }
}
class FakePeer {
  constructor(id) { this.id = id; this.h = {}; FakePeer.last = this; }
  on(ev, f) { this.h[ev] = f; }
}
globalThis.window = { Peer: FakePeer };
const { startCast } = await import('../js/net/cast.js');
window.Peer = FakePeer;   // 가져오는 순간 진짜 PeerJS 가 window.Peer 를 덮어쓴다
const { decode } = await import('../js/net/predict.js');

// 관전 링크: 보는 기기가 붙으면 초당 30번(4틱마다) 상태를 보내고, 받은 쪽은 그 상태와 선수·유니폼·이벤트로 같은 화면을 그릴 수 있다
test('cast: sends the match state every 4 ticks once someone watches, with the players, kits and events; idle when back to the select screen', () => {
  const cast = startCast('t1');
  assert.equal(FakePeer.last.id, 'uhdfc-hs1-cast-t1');
  const m = createMatch({ home: byNumber(14), away: byNumber(10), twoPlayer: true, rng: mulberry32(1) });
  cast.begin();
  for (let i = 0; i < 8; i++) cast.frame(m, stepMatch(m, NO_INPUT, DT, NO_INPUT));   // 아직 아무도 안 본다: 보낼 곳이 없다
  const c = new FakeConn(); FakePeer.last.h.connection(c); c.h.open();
  assert.equal(cast.watchers, 1);
  for (let i = 0; i < 8; i++) cast.frame(m, i === 1 ? [{ type: 'goal', scorer: 'L' }] : []);
  assert.equal(c.sent.length, 2, 'every 4 ticks');
  const s = decode(c.sent[0]);
  assert.equal(s.t, 's'); assert.equal(s.mid, 1);
  assert.deepEqual([s.k.L, s.k.R, s.k.two], [14, 10, true]);
  assert.ok(s.k.kits.L && s.k.kits.R, 'kits');
  assert.equal(s.w.players.L.def.number, 14, 'player defs come back as definitions');
  assert.deepEqual(s.e, [{ type: 'goal', scorer: 'L' }], 'events since the last message');
  assert.ok('clock' in s.m && 'scores' in s.m);
  cast.begin(); cast.frame(m, []); cast.frame(m, []); cast.frame(m, []); cast.frame(m, []);
  assert.equal(decode(c.sent.at(-1)).mid, 2, 'a new match gets a new id');
  cast.idle(); assert.equal(c.sent.at(-1), '{"t":"idle"}');
  c.h.close(); assert.equal(cast.watchers, 0);
});
