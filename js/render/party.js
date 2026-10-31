// 승리 세레모니: 벤치 선수들이 양옆에서 우르르 달려와 내 선수 주위에서 박자 맞춰 다 같이 높이 뛰며 두 팔을 번쩍 들고 환호하고, 색종이가 쏟아진다.
// 진 상대는 쓰러져 있다. 경기 상태는 건드리지 않고 그릴 때만 바꾼다. (2026-10-31 형준: "좀 웃긴 요소", "우르르 나와서 세레모니")
import { FIELD } from '../sim/constants.js';
import { createPlayer } from '../sim/physics.js';
import { PLAYERS } from '../data/players.js';
import { drawPlayer } from './characters.js';
import { wornKit } from '../data/kits.js';

export const PARTY_LEN = 4.2;   // 초. 이 뒤에 결과 화면 (2026-10-31 형준: "방방 뛰면서 다같이 환호" → 모인 뒤 뛸 시간을 더 준다)
const RUN = 700, HOP = 110, BEAT = 6;   // 달려오는 속도(px/s), 뛰는 높이, 뛰는 박자(rad/s): 모두 같은 박자로 뛴다
const SHOUTS = ['와아아!', '울산!', '최고다!', '이겼다!', '만세!', '호랑이!'];
const hopAt = t => Math.max(0, Math.sin(t * BEAT)) * HOP;
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
    return { body, target: clampX(L.x + (fromLeft ? -1 : 1) * (70 + k * 50)), delay: i * 0.08, arrived: false };
  });
  return { t: 0, still, members, confetti: [], shouts: [], nextShout: 0.6 };
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
    } else {                          // 도착: 자리에 딱 서서 내 선수를 보고, 모두 같은 박자로 뛴다
      b.x = m.target; b.vx = 0; b.facing = Math.sign(L.x - b.x) || 1; m.arrived = true;
      const hop = party.still ? 0 : hopAt(party.t);
      b.y = FIELD.GROUND - hop; b.onGround = hop === 0;
    }
  }
  // 외침: 도착한 선수 머리 위에 번갈아 튀어나온다
  if (party.t >= party.nextShout) {
    const here = party.members.filter(m => m.arrived);
    if (here.length) { const m = here[Math.floor(Math.random() * here.length)], b = m.body; party.shouts.push({ text: SHOUTS[party.shouts.length % SHOUTS.length], x: b.x, y: b.y - 200, age: 0, life: 1.0 }); }
    party.nextShout = party.t + 0.3;
  }
  for (const q of party.shouts) q.age += dt;
  party.shouts = party.shouts.filter(q => q.age < q.life);
  if (!party.still && party.t < PARTY_LEN - 1) {
    for (let i = 0; i < 2; i++) party.confetti.push({ x: Math.random() * FIELD.W, y: -10, vx: (Math.random() - 0.5) * 80, vy: 160 + Math.random() * 200, rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 10, color: COLORS[(party.confetti.length + i) % 3], age: 0 });
  }
  for (const q of party.confetti) { q.age += dt; q.x += (q.vx + Math.sin(q.age * 4 + q.rot) * 50) * dt; q.y += q.vy * dt; q.rot += q.vr * dt; }
  party.confetti = party.confetti.filter(q => q.y < FIELD.GROUND + 10);
}

// 그릴 때의 두 선수: 내 선수는 펄쩍, 진 상대는 쓰러져 있다
export const partyView = (party, side, p) => side === 'L'
  ? { ...p, y: FIELD.GROUND - (party.still ? 0 : hopAt(party.t)), onGround: party.still, kickAnim: 0, stun: 0, pinned: false, active: null }
  : { ...p, stun: 1, pinned: false, active: null };

export function drawParty(ctx, party, match, imgs, t) {
  for (const m of party.members) drawPlayer(ctx, m.body, imgs[m.body.def.number], { kit: wornKit(match.kits.L, m.body.def), t, cheer: m.arrived });
  for (const q of party.shouts) {   // 외침: 떠오르며 사라진다
    const k = q.age / q.life, a = k < 0.15 ? k / 0.15 : k > 0.6 ? (1 - k) / 0.4 : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(q.x, q.y - 40 * k); ctx.rotate((q.x % 2 ? -1 : 1) * 0.12);
    ctx.font = '800 36px "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,43,107,.9)'; ctx.strokeText(q.text, 0, 0); ctx.fillStyle = q.text === '울산!' ? '#FFC72C' : '#FFFFFF'; ctx.fillText(q.text, 0, 0); ctx.restore();
  }
  for (const q of party.confetti) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.color; ctx.fillRect(-7, -4, 14, 8); ctx.restore(); }
}
