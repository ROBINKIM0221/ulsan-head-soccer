// 세레모니: 이긴 쪽 벤치 선수들이 양옆에서 우르르 달려와 경기장 폭에 고르게 퍼져 서서 저마다 조금씩 엇갈린 박자로 막 뛰며 두 팔을 번쩍 들고, 색종이가 쏟아지고, 하늘에 큰 VAMOS! 하나.
// 진 쪽은 쓰러져 있다. 내가 져도 상대 팀이 똑같이 한다. 경기 상태는 건드리지 않고 그릴 때만 바꾼다.
// still(움직임 줄이기 설정)은 색종이와 VAMOS 들썩임만 끈다. 점프는 세레모니 그 자체라 늘 한다 (2026-10-31 형준 폰의 애니메이션 제거 설정에서 "왜 또 방방 뛰는거는 사라졌어").
// (2026-10-31 형준: "좀 웃긴 요소", "우르르 나와서 세레모니", "지면 상대팀 선수들도 똑같이", "너무 겹쳐서 좀 퍼뜨려줘")
import { FIELD } from '../sim/constants.js';
import { createPlayer } from '../sim/physics.js';
import { PLAYERS } from '../data/players.js';
import { drawPlayer } from './characters.js';
import { wornKit } from '../data/kits.js';

export const PARTY_LEN = 4.2;   // 초. 이 뒤에 결과 화면 (2026-10-31 형준: "방방 뛰면서 다같이 환호" → 모인 뒤 뛸 시간을 더 준다)
const RUN = 700, HOP = 110, BEAT = 6;   // 달려오는 속도(px/s), 이긴 선수의 점프 높이·박자(rad/s)
// 2026-10-31 형준: 외침은 다 빼고 화면에 VAMOS! 하나만
// 선수마다 박자·시작·높이가 조금씩 달라 진짜 무리처럼 엇갈린다 (2026-10-31 형준: "같은 타이밍 말고 조금씩 엇갈리게 막 점프")
const hopAt = (t, m = { beat: BEAT, phase: 0, hop: HOP }) => Math.max(0, Math.sin(t * m.beat + m.phase)) * m.hop;
const COLORS = ['#FFC72C', '#FFFFFF', '#004098'];
const EDGE = 60, GAP = 70, SPACE = (FIELD.W - 2 * EDGE - 2 * GAP) / 10;   // 가장자리·이긴 선수 양옆을 비우고 남은 폭에 벤치 10명을 고르게 (약 102px)

export function startParty(match, still = false) {
  const side = match.result === 'lose' ? 'R' : 'L', { L, R } = match.world.players, star = match.world.players[side];
  const bench = PLAYERS.filter(p => p.number !== L.def.number && p.number !== R.def.number);
  // 이긴 선수 왼쪽에 들어갈 자리 수만큼 왼쪽에, 나머지는 오른쪽에 깐다(왼쪽부터 오름차순). 가장자리에 서 있어도 한쪽에 몰려 겹치지 않는다
  const nLeft = Math.min(10, Math.max(0, Math.round((star.x - EDGE - GAP) / SPACE)));
  const slots = bench.map((_, j) => j < nLeft ? star.x - GAP - SPACE * (nLeft - j - 0.5) : star.x + GAP + SPACE * (j - nLeft + 0.5));
  const members = bench.map((def, i) => {
    const fromLeft = i % 2 === 0, k = Math.floor(i / 2) + 1;   // 번갈아 양쪽에서, 뒤에 올수록 멀리서 출발해 더 바깥 자리에 선다
    const body = createPlayer(def, side);
    body.x = fromLeft ? -70 - k * 40 : FIELD.W + 70 + k * 40;
    body.facing = fromLeft ? 1 : -1;
    return { body, target: slots[fromLeft ? 5 - k : 4 + k], delay: i * 0.08, arrived: false,
      beat: 5.4 + (i % 4) * 0.5, phase: (i * 0.9) % 1.5, hop: 90 + (i % 3) * 12 };
  });
  return { t: 0, still, side, members, confetti: [] };
}

export function updateParty(party, match, dt) {
  party.t += dt;
  const star = match.world.players[party.side];
  for (const m of party.members) {
    const b = m.body;
    if (party.t < m.delay) continue;
    const dx = m.target - b.x;
    if (Math.abs(dx) > RUN * dt) {   // 달려온다 (vx 가 있어야 다리가 움직인다)
      b.x += Math.sign(dx) * RUN * dt; b.vx = Math.sign(dx) * RUN; b.facing = Math.sign(dx); b.y = FIELD.GROUND; b.onGround = true;
    } else {                          // 도착: 자리에 딱 서서 이긴 선수를 보고 뛴다
      b.x = m.target; b.vx = 0; b.facing = Math.sign(star.x - b.x) || 1; m.arrived = true;
      const hop = hopAt(party.t, m);
      b.y = FIELD.GROUND - hop; b.onGround = hop === 0;
    }
  }
  if (!party.still && party.t < PARTY_LEN - 1) {
    for (let i = 0; i < 2; i++) party.confetti.push({ x: Math.random() * FIELD.W, y: -10, vx: (Math.random() - 0.5) * 80, vy: 160 + Math.random() * 200, rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 10, color: COLORS[(party.confetti.length + i) % 3], age: 0 });
  }
  for (const q of party.confetti) { q.age += dt; q.x += (q.vx + Math.sin(q.age * 4 + q.rot) * 50) * dt; q.y += q.vy * dt; q.rot += q.vr * dt; }
  party.confetti = party.confetti.filter(q => q.y < FIELD.GROUND + 10);
}

// 그릴 때의 두 선수: 이긴 쪽은 펄쩍, 진 쪽은 쓰러져 있다
export const partyView = (party, side, p) => side === party.side
  ? { ...p, y: FIELD.GROUND - hopAt(party.t), onGround: hopAt(party.t) === 0, kickAnim: 0, stun: 0, pinned: false, active: null }
  : { ...p, stun: 1, pinned: false, active: null };

export function drawParty(ctx, party, match, imgs, t) {
  for (const m of party.members) drawPlayer(ctx, m.body, imgs[m.body.def.number], { kit: wornKit(match.kits[party.side], m.body.def), t, cheer: m.arrived });
  // VAMOS!: 0.3초 뒤 하늘 한가운데 커지며 나타나 박자에 맞춰 살짝 들썩인다
  if (party.t > 0.3) {
    const grow = Math.min(1, (party.t - 0.3) / 0.35), k = party.still ? 1 : grow * (1 + 0.05 * Math.sin(party.t * BEAT));
    ctx.save(); ctx.translate(FIELD.W / 2, 250); ctx.scale(k, k); ctx.rotate(-0.04);
    ctx.font = '600 170px Teko, "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 16; ctx.lineJoin = 'round'; ctx.strokeStyle = '#002B6B'; ctx.strokeText('VAMOS!', 0, 0);
    ctx.fillStyle = '#FFC72C'; ctx.fillText('VAMOS!', 0, 0); ctx.restore();
  }
  for (const q of party.confetti) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.color; ctx.fillRect(-7, -4, 14, 8); ctx.restore(); }
}
