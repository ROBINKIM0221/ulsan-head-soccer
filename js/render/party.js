// 승리 세레모니: 벤치 선수들이 양옆에서 우르르 달려와 내 선수 주위에서 펄쩍펄쩍 뛰고, 색종이가 쏟아진다.
// 진 상대는 쓰러져 있다. 경기 상태는 건드리지 않고 그릴 때만 바꾼다. (2026-10-31 형준: "좀 웃긴 요소", "우르르 나와서 세레모니")
import { FIELD } from '../sim/constants.js';
import { createPlayer } from '../sim/physics.js';
import { PLAYERS } from '../data/players.js';
import { drawPlayer } from './characters.js';
import { wornKit } from '../data/kits.js';

export const PARTY_LEN = 3.6;   // 초. 이 뒤에 결과 화면
const RUN = 700, HOP = 60;      // 달려오는 속도(px/s), 제자리 뛰기 높이. 가장 먼 선수도 2초 안에 도착
const COLORS = ['#FFC72C', '#FFFFFF', '#004098'];
const clampX = x => Math.min(FIELD.W - 60, Math.max(60, x));

export function startParty(match, still = false) {
  const { L, R } = match.world.players;
  const bench = PLAYERS.filter(p => p.number !== L.def.number && p.number !== R.def.number);
  const members = bench.map((def, i) => {
    const fromLeft = i % 2 === 0, k = Math.floor(i / 2) + 1;   // 번갈아 양쪽에서, 뒤에 올수록 멀리서 출발
    const body = createPlayer(def, 'L');
    body.x = fromLeft ? -70 - k * 40 : FIELD.W + 70 + k * 40;
    body.facing = fromLeft ? 1 : -1;
    return { body, target: clampX(L.x + (fromLeft ? -1 : 1) * (70 + k * 50)), delay: i * 0.08, phase: i * 1.3 };
  });
  return { t: 0, still, members, confetti: [] };
}

export function updateParty(party, match, dt) {
  party.t += dt;
  const L = match.world.players.L;
  for (const m of party.members) {
    const b = m.body;
    if (party.t < m.delay) continue;
    const dx = m.target - b.x;
    if (Math.abs(dx) > RUN * dt) {   // 달려온다 (vx 가 있어야 다리가 움직인다)
      b.x += Math.sign(dx) * RUN * dt; b.vx = Math.sign(dx) * RUN; b.facing = Math.sign(dx); b.y = FIELD.GROUND; b.onGround = true;
    } else {                          // 도착: 자리에 딱 서서 내 선수를 보고 제자리 뛰기
      b.x = m.target; b.vx = 0; b.facing = Math.sign(L.x - b.x) || 1;
      const hop = party.still ? 0 : Math.max(0, Math.sin(party.t * 7 + m.phase)) * HOP;
      b.y = FIELD.GROUND - hop; b.onGround = hop === 0;
    }
  }
  if (!party.still && party.t < PARTY_LEN - 1) {
    for (let i = 0; i < 2; i++) party.confetti.push({ x: Math.random() * FIELD.W, y: -10, vx: (Math.random() - 0.5) * 80, vy: 160 + Math.random() * 200, rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 10, color: COLORS[(party.confetti.length + i) % 3], age: 0 });
  }
  for (const q of party.confetti) { q.age += dt; q.x += (q.vx + Math.sin(q.age * 4 + q.rot) * 50) * dt; q.y += q.vy * dt; q.rot += q.vr * dt; }
  party.confetti = party.confetti.filter(q => q.y < FIELD.GROUND + 10);
}

// 그릴 때의 두 선수: 내 선수는 펄쩍, 진 상대는 쓰러져 있다
export const partyView = (party, side, p) => side === 'L'
  ? { ...p, y: FIELD.GROUND - (party.still ? 0 : Math.max(0, Math.sin(party.t * 7)) * HOP), onGround: party.still, kickAnim: 0, stun: 0, pinned: false, active: null }
  : { ...p, stun: 1, pinned: false, active: null };

export function drawParty(ctx, party, match, imgs, t) {
  for (const m of party.members) drawPlayer(ctx, m.body, imgs[m.body.def.number], { kit: wornKit(match.kits.L, m.body.def), t });
  for (const q of party.confetti) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.color; ctx.fillRect(-7, -4, 14, 8); ctx.restore(); }
}
