import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../js/sim/match.js';
import { byNumber } from '../js/data/players.js';
import { startParty, updateParty, partyView, drawParty, PARTY_LEN } from '../js/render/party.js';
import { FIELD, DT } from '../js/sim/constants.js';

const won = () => { const m = createMatch({ home: byNumber(10), away: byNumber(99) }); m.phase = 'over'; m.result = 'win'; return m; };
const run = (party, m, seconds) => { for (let i = 0, n = Math.round(seconds / DT); i < n; i++) updateParty(party, m, DT); };
// 그리기 호출만 받아 적는 가짜 캔버스: 모든 메서드는 빈 함수, 글자 그리기만 모은다
const drawnTexts = (party, m) => { const out = []; const ctx = new Proxy({}, { get: (_, k) => (k === 'fillText' || k === 'strokeText') ? s => out.push(s) : () => ({}) }); drawParty(ctx, party, m, {}, 1); return out; };

// 2026-11-01 형준 "졌을땐 바모스 뜨면 안돼", 이어서 "졌을때는 색종이도 안나오고, 선수들 나와서 방방 뛰는건 그대로, 아쉬운 노래 나오면서 LOSE 뜨게"
test('win: VAMOS! and confetti; lose: LOSE, no confetti, but the opponent bench still hops', () => {
  const w = won(), pw = startParty(w); run(pw, w, 3);
  const tw = drawnTexts(pw, w);
  assert.ok(tw.includes('VAMOS!') && !tw.includes('LOSE'), 'win text: ' + tw.join(','));
  assert.ok(pw.confetti.length > 0, 'confetti when I win');
  const l = won(); l.result = 'lose'; const pl = startParty(l); run(pl, l, 3);
  const tl = drawnTexts(pl, l);
  assert.ok(tl.includes('LOSE') && !tl.includes('VAMOS!'), 'lose text: ' + tl.join(','));
  assert.equal(pl.confetti.length, 0, 'no confetti when I lose');
  let hopped = false;
  for (let i = 0; i < 60; i++) { updateParty(pl, l, DT); if (pl.members.some(x => x.body.y < FIELD.GROUND)) hopped = true; }
  assert.ok(hopped, 'the opponent bench still hops when I lose');
});

test('the bench (everyone but the two on the pitch) runs in from both edges and gathers around my player', () => {
  const m = won(), party = startParty(m);
  assert.equal(party.members.length, 10);
  assert.ok(party.members.every(x => ![10, 99].includes(x.body.def.number)));
  assert.ok(party.members.some(x => x.body.x < 0) && party.members.some(x => x.body.x > FIELD.W), 'start off both edges');
  run(party, m, 3);
  const L = m.world.players.L;
  assert.ok(party.members.every(x => Math.abs(x.body.x - L.x) > 40), 'not on top of my player');
  assert.ok(party.members.every(x => x.body.x >= 60 && x.body.x <= FIELD.W - 60), 'inside the field');
  let hopped = false;   // 모두 같은 박자로 뛰니 한 순간이 아니라 반 박자 동안 본다
  for (let i = 0; i < 60; i++) { updateParty(party, m, DT); if (party.members.some(x => x.body.y < FIELD.GROUND)) hopped = true; }
  assert.ok(hopped, 'they hop');
  assert.ok(party.confetti.length > 0 && party.confetti.every(q => q.y < FIELD.GROUND + 10));
  assert.ok(PARTY_LEN >= 3);
});

// 2026-10-31 형준: "한쪽 선수들은 너무 겹쳐서 좀 퍼뜨려줘" — 승자가 어디 서 있든 이웃끼리 95px 넘게 떨어지고 경기장 안에 있다
test('the bench spreads out evenly across the pitch instead of piling up, wherever my player stands', () => {
  for (const x of [640, 150, 1150]) {
    const m = won(); m.world.players.L.x = x;
    const party = startParty(m); run(party, m, 3);
    const xs = party.members.map(p => p.body.x).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((v, i) => v - xs[i]);
    assert.ok(gaps.every(g => g >= 95), 'neighbours at least 95px apart at x=' + x + ': ' + gaps.map(Math.round).join(','));
    assert.ok(xs.every(v => v >= 60 && v <= FIELD.W - 60 && Math.abs(v - x) >= 110), 'inside the field and off my player at x=' + x + ': ' + xs.map(Math.round).join(','));
  }
});

// 2026-10-31 형준: "지면 상대팀 선수들도 똑같이 세레머니"
test('when I lose, the opponent bench celebrates around the opponent and I am the one knocked over', () => {
  const m = createMatch({ home: byNumber(10), away: byNumber(99) }); m.phase = 'over'; m.result = 'lose';
  const party = startParty(m); run(party, m, 3);
  assert.equal(party.side, 'R');
  assert.ok(party.members.every(p => p.body.side === 'R' && p.arrived), 'opponent bench all arrived');
  const { L, R } = m.world.players;
  assert.equal(partyView(party, 'L', L).stun, 1); assert.equal(partyView(party, 'R', R).stun, 0);
  let hopped = false;
  for (let i = 0; i < 60; i++) { updateParty(party, m, DT); if (partyView(party, 'R', R).y < FIELD.GROUND) hopped = true; }
  assert.ok(hopped, 'the opponent hops');
});

test('the loser is drawn knocked over and my player hops, without touching the match state', () => {
  const m = won(), party = startParty(m);
  run(party, m, 0.1);
  const { L, R } = m.world.players;
  assert.equal(partyView(party, 'R', R).stun, 1); assert.equal(R.stun, 0);
  assert.ok(partyView(party, 'L', L).y <= FIELD.GROUND); assert.equal(L.y, FIELD.GROUND);
});

test('once gathered, everyone keeps jumping slightly out of step', () => {
  const m = won(), party = startParty(m);
  run(party, m, 2.2);
  assert.ok(party.members.every(x => x.arrived), 'all arrived by 2.2s');
  // 저마다 박자가 조금씩 달라 같은 순간 높이가 제각각이고, 한 박자 안에 누구나 90px 넘게 뛴다
  let distinct = 0; const peaks = party.members.map(() => FIELD.GROUND);
  for (let i = 0; i < 140; i++) {
    updateParty(party, m, DT);
    const ys = party.members.map(x => Math.round(x.body.y));
    if (new Set(ys).size >= 3) distinct++;
    ys.forEach((y, k) => { peaks[k] = Math.min(peaks[k], y); });
  }
  assert.ok(distinct > 100, `staggered moments ${distinct}/140`);
  assert.ok(peaks.every(p => FIELD.GROUND - p >= 90), `peaks ${peaks.map(p => FIELD.GROUND - p).join(',')}`);
});
