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
  assert.ok(party.members.some(x => x.body.y < FIELD.GROUND), 'someone is mid-hop');
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
