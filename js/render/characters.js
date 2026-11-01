// 선수(큰 머리 + 작고 둥근 몸)와 공을 그린다. 선택 카드와 경기 화면이 같은 함수를 쓴다.
// art = { photo: Image, cut: Image|null }. 경기에서는 배경을 뺀 컷아웃(cut), 선택 카드는 동그란 사진(circle 옵션).
import { PHYS } from '../sim/constants.js';
import { headCenter, bodyRect } from '../sim/physics.js';
import { KITS } from '../data/kits.js';
import { holdOffset } from '../sim/specials.js';

const BLUE = '#004098', NAVY = '#002B6B', GOLD = '#FFC72C', WHITE = '#FFFFFF', SKIN = '#F2C9A4', DARK = '#1A1A1A';
const CUT_SCALE = 1.5;      // 컷아웃 그림 한 변 = 머리 지름 × 1.5 (tools/faces.cjs: 머리가 그림 높이의 70%)
const CUT_CENTER_Y = 0.44;  // 컷아웃 그림에서 머리 중심의 세로 위치 (꼭대기 8%, 턱 78%)

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

// 콩알 몸: 큰 머리 아래 작은 유니폼, 짧은 팔다리, 큰 운동화, 스티커 같은 진한 테두리. 걸을 때 다리가 번갈아 움직인다.
function drawBody(ctx, b, rect, kit, t = 0, cheer = false) {
  const s = b.scale, f = b.facing, cx = b.x, bottom = rect.y + rect.h;
  const { jersey, trim, number: numColor, shorts } = kit;
  const line = '#0F2452', lw = 2.5 * s;
  const torsoW = 46 * s, torsoH = 34 * s, torsoTop = rect.y - 4 * s;           // 턱 밑에 살짝 끼운다
  const shortsH = 9 * s, legLen = 7 * s, shoeW = 30 * s, shoeH = 14 * s;
  const walking = b.onGround && Math.abs(b.vx) > 40 && b.kickAnim <= 0;
  const swing = walking ? Math.sin(t * 16) * 6 * s : 0;
  const kick = b.kickAnim > 0 ? Math.sin((0.25 - b.kickAnim) / 0.25 * Math.PI) : 0;
  const legTop = torsoTop + torsoH + shortsH - 2 * s;
  const outline = () => { ctx.lineWidth = lw; ctx.strokeStyle = line; ctx.stroke(); };

  // 다리 (뒤 → 앞). 앞다리는 킥 때 앞으로 뻗는다
  const backX = cx - 8 * s + swing, frontX = cx + 8 * s - swing + f * kick * 24 * s;
  const backY = legTop + legLen, frontY = legTop + legLen - kick * 16 * s;
  ctx.lineCap = 'round'; ctx.lineWidth = 7 * s; ctx.strokeStyle = SKIN;
  ctx.beginPath(); ctx.moveTo(cx - 8 * s, legTop); ctx.lineTo(backX, backY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 8 * s, legTop); ctx.lineTo(frontX, frontY); ctx.stroke();
  // 운동화: 흰 바닥에 파란 몸통, 앞코가 발 앞쪽으로
  const shoe = (x, y, lift) => {
    ctx.save(); ctx.translate(x + f * 5 * s, y + shoeH / 2); ctx.rotate(-f * lift * 0.5);
    ctx.fillStyle = kit.shoe; ctx.beginPath(); ctx.ellipse(0, 0, shoeW / 2, shoeH / 2, 0, 0, Math.PI * 2); ctx.fill(); outline();
    ctx.fillStyle = WHITE; ctx.beginPath(); ctx.ellipse(0, shoeH * 0.28, shoeW / 2 - 1.5 * s, shoeH * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(f * shoeW * 0.18, -shoeH * 0.12, 2.2 * s, 0, Math.PI * 2); ctx.fill();   // 끈 매듭
    ctx.restore();
  };
  shoe(backX, backY - 2 * s, 0);
  shoe(frontX, frontY - 2 * s, kick);

  // 반바지
  ctx.fillStyle = shorts;
  roundRect(ctx, cx - torsoW * 0.44, torsoTop + torsoH - 5 * s, torsoW * 0.88, shortsH + 5 * s, 6 * s); ctx.fill(); outline();
  // 팔: 양옆 짧은 소매 + 동그란 손. 환호(cheer)면 어깨에서 머리 옆으로 두 팔을 번쩍 든다
  for (const side of [-1, 1]) {
    if (cheer) {
      const sx = cx + side * (torsoW / 2 - 3 * s), sy = torsoTop + 9 * s, hx = cx + side * 60 * s, hy = torsoTop - 50 * s;
      ctx.lineCap = 'round';
      ctx.strokeStyle = line; ctx.lineWidth = 13 * s + lw * 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = jersey; ctx.lineWidth = 13 * s; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(hx, hy, 6 * s, 0, Math.PI * 2); ctx.fill(); outline();
      continue;
    }
    ctx.fillStyle = jersey;
    roundRect(ctx, cx + side * torsoW / 2 - (side > 0 ? 3 * s : 11 * s), torsoTop + 7 * s, 14 * s, 16 * s, 7 * s); ctx.fill(); outline();
    ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(cx + side * (torsoW / 2 + 4 * s), torsoTop + 26 * s, 5 * s, 0, Math.PI * 2); ctx.fill(); outline();
  }
  // 유니폼
  ctx.fillStyle = jersey;
  roundRect(ctx, cx - torsoW / 2, torsoTop, torsoW, torsoH, 15 * s); ctx.fill(); outline();
  if (kit.stripe) {   // 세로 줄무늬(레트로): 몸통 안에만 네 줄
    ctx.save(); roundRect(ctx, cx - torsoW / 2, torsoTop, torsoW, torsoH, 15 * s); ctx.clip();
    ctx.fillStyle = kit.stripe;
    for (const k of [-18, -6, 6, 18]) ctx.fillRect(cx + (k - 3) * s, torsoTop, 6 * s, torsoH);
    ctx.restore();
  }
  ctx.strokeStyle = trim; ctx.lineWidth = 2.5 * s;
  ctx.beginPath(); ctx.moveTo(cx - torsoW / 2 + 7 * s, torsoTop + 4 * s); ctx.lineTo(cx - torsoW / 2 + 7 * s, torsoTop + torsoH - 7 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + torsoW / 2 - 7 * s, torsoTop + 4 * s); ctx.lineTo(cx + torsoW / 2 - 7 * s, torsoTop + torsoH - 7 * s); ctx.stroke();
  // 등번호
  ctx.fillStyle = numColor;
  ctx.font = `600 ${Math.round(26 * s)}px Teko, "Arial Narrow", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(b.def.number), cx, torsoTop + torsoH * 0.58);
}

// 일반 파란 증기기관차: 보일러·굴뚝·운전실·바퀴 둘. 실제 캐릭터와 무관한 모양.
function drawTrain(ctx, b, rect) {
  const s = b.scale, f = b.facing;
  const w = rect.w * 1.9, h = rect.h * 1.05, x = b.x - w / 2, y = rect.y + rect.h - h;
  ctx.fillStyle = '#2A2F36';
  ctx.fillRect(x - 4 * s, y + h - 10 * s, w + 8 * s, 8 * s);
  ctx.fillStyle = BLUE;
  roundRect(ctx, x, y + 10 * s, w * 0.62, h - 20 * s, 12 * s); ctx.fill();
  const cabX = f > 0 ? x : x + w * 0.62;
  ctx.fillStyle = NAVY; roundRect(ctx, cabX, y, w * 0.38, h - 10 * s, 6 * s); ctx.fill();
  ctx.fillStyle = '#CFE3FF'; ctx.fillRect(cabX + 8 * s, y + 8 * s, w * 0.38 - 16 * s, 16 * s);
  const chimX = f > 0 ? x + w * 0.62 - 16 * s : x + w * 0.38 + 4 * s;
  ctx.fillStyle = '#2A2F36'; ctx.fillRect(chimX, y - 6 * s, 12 * s, 20 * s);
  ctx.fillStyle = GOLD; ctx.fillRect(x, y + h / 2 - 2 * s, w, 4 * s);
  for (const cx of [x + w * 0.22, x + w * 0.72]) {
    ctx.fillStyle = DARK; ctx.beginPath(); ctx.arc(cx, y + h - 6 * s, 13 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(cx, y + h - 6 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#FFF4B0'; ctx.beginPath(); ctx.arc(f > 0 ? x + w - 4 * s : x + 4 * s, y + h / 2, 5 * s, 0, Math.PI * 2); ctx.fill();
}

function drawHead(ctx, b, art, circle) {
  const h = headCenter(b);
  const photo = art && art.photo, cut = art && art.cut;
  const flip = b.facing < 0;
  if (!circle && cut) {
    // 컷아웃: 배경 뺀 얼굴을 머리 원보다 조금 크게, 얼굴 중심을 원 중심에 맞춘다
    const size = h.r * 2 * CUT_SCALE;
    ctx.save();
    if (flip) { ctx.translate(h.x * 2, 0); ctx.scale(-1, 1); }
    ctx.drawImage(cut, h.x - size / 2, h.y - size * CUT_CENTER_Y, size, size);
    ctx.restore();
  } else {
    ctx.save();
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    if (photo) {
      ctx.save();
      if (flip) { ctx.translate(h.x * 2, 0); ctx.scale(-1, 1); }
      ctx.drawImage(photo, h.x - h.r, h.y - h.r, h.r * 2, h.r * 2);
      ctx.restore();
    } else { ctx.fillStyle = '#B9CBE8'; ctx.fillRect(h.x - h.r, h.y - h.r, h.r * 2, h.r * 2); }
    ctx.restore();
    ctx.strokeStyle = WHITE; ctx.lineWidth = 2.5 * b.scale;
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.stroke();
  }
  if (b.active && b.active.id === 'train') {   // 발그레한 홍조
    ctx.fillStyle = 'rgba(255,110,130,.45)';
    for (const dx of [-0.5, 0.5]) { ctx.beginPath(); ctx.ellipse(h.x + dx * h.r, h.y + h.r * 0.25, h.r * 0.28, h.r * 0.18, 0, 0, Math.PI * 2); ctx.fill(); }
  }
}

export function drawPlayer(ctx, b, art, { kit = KITS[0], circle = false, t = 0, cheer = false } = {}) {
  const h = headCenter(b), rect = bodyRect(b);
  const isTrain = b.active && b.active.id === 'train';
  const isCatch = b.active && b.active.id === 'catch';
  ctx.save();
  if (b.stun > 0 || b.pinned) {   // 넘어짐·비틀거림: 몸 전체를 기울인다
    const ang = b.pinned ? -b.facing * 0.35 : -b.facing * Math.min(1, b.stun) * 0.9;
    ctx.translate(b.x, b.y); ctx.rotate(ang); ctx.translate(-b.x, -b.y);
  }
  const useCut = !circle && art && art.cut;
  if (useCut) drawHead(ctx, b, art, false);          // 컷아웃은 몸이 어깨를 덮도록 먼저
  if (isTrain) drawTrain(ctx, b, rect);
  else drawBody(ctx, b, rect, kit, t, cheer);
  if (!useCut) drawHead(ctx, b, art, true);
  if (isCatch) drawGloves(ctx, b, h, kit);
  ctx.restore();
}

// 골키퍼 장갑 하나: 손가락 넷 + 안쪽으로 벌린 엄지 + 손바닥 + 유니폼 트림 색 손목 밴드. 로컬 좌표는 손가락이 위, 엄지가 -x 쪽.
// inward = 엄지가 향할 방향(+1 오른쪽, -1 왼쪽). (2026-11-01 형준 "장갑 모양 좀 바꿔주고" — 전엔 흰 네모 둘)
function drawGlove(ctx, x, y, rot, s, inward, band) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(-inward, 1);
  const fill = () => { ctx.fill(); ctx.stroke(); };
  ctx.fillStyle = '#F7F7F7'; ctx.strokeStyle = '#2A2A2A'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.save(); ctx.translate(-10 * s, -3 * s); ctx.rotate(-0.6); roundRect(ctx, -3 * s, -13 * s, 6 * s, 16 * s, 3 * s); fill(); ctx.restore();   // 엄지
  for (let i = 0; i < 4; i++) { const tip = i === 0 || i === 3 ? 3 * s : 0; roundRect(ctx, -9.3 * s + i * 5 * s, -24 * s + tip, 4.6 * s, 18 * s, 2.3 * s); fill(); }   // 손가락 (바깥 둘은 짧게)
  roundRect(ctx, -11 * s, -9 * s, 22 * s, 22 * s, 7 * s); fill();                      // 손바닥이 손가락·엄지 뿌리를 덮는다
  ctx.fillStyle = band; roundRect(ctx, -11 * s, 10 * s, 22 * s, 6 * s, 3 * s); fill();   // 손목 밴드
  ctx.restore();
}

// 조현우 선방 캐치 중 장갑 자세: 준비(머리 양옆, 손가락 위) → 공을 쥠(공 양옆을 감싸고 sim 의 holdOffset 대로 함께 움직임) → 던진 직후 0.3초 앞손을 쭉 뻗음
function drawGloves(ctx, b, h, kit) {
  const s = b.scale, d = b.active.data || {}, dirX = b.side === 'L' ? 1 : -1, band = kit.trim;
  if (d.holding) {
    const o = holdOffset(d.holdT || 0, dirX), bx = h.x + o.dx, by = h.y - h.r - PHYS.BALL_R - 4 + o.dy;
    drawGlove(ctx, bx - (PHYS.BALL_R + 7) * s, by + 6 * s, 0.35, s, 1, band);
    drawGlove(ctx, bx + (PHYS.BALL_R + 7) * s, by + 6 * s, -0.35, s, -1, band);
  } else if (d.threw !== undefined && d.threw < 0.3) {
    drawGlove(ctx, h.x + dirX * (h.r + 26 * s), h.y - h.r - 18 * s, dirX * 1.0, s, -dirX, band);   // 앞손: 던진 방향으로 쭉
    drawGlove(ctx, h.x - dirX * (h.r + 8 * s), h.y + 6 * s, -dirX * 0.3, s, dirX, band);           // 뒷손은 내려서 균형
  } else {
    drawGlove(ctx, h.x - h.r - 10 * s, h.y - 4 * s, -0.25, s, 1, band);
    drawGlove(ctx, h.x + h.r + 10 * s, h.y - 4 * s, 0.25, s, -1, band);
  }
}

export function drawBall(ctx, ball, rotation = 0) {
  const r = ball.r;
  ctx.save();
  ctx.translate(ball.x, ball.y); ctx.rotate(rotation);
  ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = DARK;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.68, Math.sin(a) * r * 0.68, r * 0.22, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, r - 0.75, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

export { PHYS };
