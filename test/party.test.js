import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../js/sim/match.js';
import { byNumber } from '../js/data/players.js';
import { startParty, updateParty, partyView, PARTY_LEN } from '../js/render/party.js';
import { FIELD, DT } from '../js/sim/constants.js';

const won = () => { const m = createMatch({ home: byNumber(10), away: byNumber(99) }); m.phase = 'over'; m.result = 'win'; return m; };
const run = (party, m, seconds) => { for (let i = 0, n = Math.round(seconds / DT); i < n; i++) updateParty(party, m, DT); };

test('the bench (everyone but the two on the pitch) runs in from both edges and gathers around my player', () => {
  const m = won(), party = startParty(m);
  assert.equal(party.members.length, 10);
  assert.ok(party.members.every(x => ![10, 99].includes(x.body.def.number)));
  assert.ok(party.members.some(x => x.body.x < 0) && party.members.some(x => x.body.x > FIELD.W), 'start off both edges');
  run(party, m, 3);
  const L = m.world.players.L;
  assert.ok(party.members.every(x => Math.abs(x.body.x - L.x) < 400 && Math.abs(x.body.x - L.x) > 40), 'gathered near my player, not on top');
  assert.ok(party.members.every(x => x.body.x >= 60 && x.body.x <= FIELD.W - 60), 'inside the field');
  let hopped = false;   // 모두 같은 박자로 뛰니 한 순간이 아니라 반 박자 동안 본다
  for (let i = 0; i < 60; i++) { updateParty(party, m, DT); if (party.members.some(x => x.body.y < FIELD.GROUND)) hopped = true; }
  assert.ok(hopped, 'they hop');
  assert.ok(party.confetti.length > 0 && party.confetti.every(q => q.y < FIELD.GROUND + 10));
  assert.ok(PARTY_LEN >= 3);
});

test('reduced motion: nobody hops and there is no confetti', () => {
  const m = won(), party = startParty(m, true);
  run(party, m, 3);
  assert.equal(party.confetti.length, 0);
  assert.ok(party.members.every(x => x.body.y === FIELD.GROUND));
  assert.equal(partyView(party, 'L', m.world.players.L).y, FIELD.GROUND);
});

test('the loser is drawn knocked over and my player hops, without touching the match state', () => {
  const m = won(), party = startParty(m);
  run(party, m, 0.1);
  const { L, R } = m.world.players;
  assert.equal(partyView(party, 'R', R).stun, 1); assert.equal(R.stun, 0);
  assert.ok(partyView(party, 'L', L).y <= FIELD.GROUND); assert.equal(L.y, FIELD.GROUND);
});

test('once gathered, everyone keeps jumping slightly out of step, arms up, and shouts appear', () => {
  const m = won(), party = startParty(m);
  run(party, m, 2.2);
  assert.ok(party.members.every(x => x.arrived), 'all arrived by 2.2s');
  // 저마다 박자가 조금씩 달라 같은 순간 높이가 제각각이고, 한 박자 안에 누구나 90px 넘게 뛴다
  let distinct = 0; const peaks = party.members.map(() => FIELD.GROUND), seen = new Set();
  for (let i = 0; i < 140; i++) {
    updateParty(party, m, DT);
    for (const q of party.shouts) seen.add(q.text);
    const ys = party.members.map(x => Math.round(x.body.y));
    if (new Set(ys).size >= 3) distinct++;
    ys.forEach((y, k) => { peaks[k] = Math.min(peaks[k], y); });
  }
  assert.ok(distinct > 100, `staggered moments ${distinct}/140`);
  assert.ok(peaks.every(p => FIELD.GROUND - p >= 90), `peaks ${peaks.map(p => FIELD.GROUND - p).join(',')}`);
  assert.ok(party.shouts.length > 0 && party.shouts.every(s => s.text.length >= 2));
  assert.ok(seen.has('VAMOS!') && !seen.has('울산!'), [...seen].join(','));
});
