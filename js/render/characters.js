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

// 파란 증기기관차(실제 캐릭터와 무관한 모양). 앞이 +x 인 로컬 좌표(원점 = 발밑)에서 그리고 facing 으로 뒤집는다.
// 뒤쪽 운전실 위로 머리가 나오고, 앞쪽에 굴뚝·전조등·배장기. 바퀴와 연결봉은 달린 거리만큼 돈다.
const trainDims = b => { const W = PHYS.BODY_W * b.scale, H = PHYS.BODY_H * b.scale; return { L: W * 2.2, H, R: H * 0.19 }; };
export function trainChimney(b) {   // 연기가 나오는 굴뚝 끝 (화면 좌표)
  const { L, H } = trainDims(b);
  return { x: b.x + b.facing * L * 0.43, y: b.y - H * 1.1 };
}
function drawTrain(ctx, b) {
  const s = b.scale, f = b.facing, { L, H, R } = trainDims(b);
  const d = (b.active && b.active.data) || {}, charging = !!d.charging;
  const moving = Math.abs(b.vx) > 20 || charging;
  const bob = moving ? Math.sin(b.x * 0.12) * 1.5 * s : 0;
  const spin = b.x / R * f;                                    // 바퀴 회전각 = 달린 거리 / 반지름
  ctx.save(); ctx.translate(b.x, b.y + bob); ctx.scale(f, 1);
  ctx.lineJoin = 'round';
  const line = (w = 2) => { ctx.strokeStyle = 'rgba(10,20,40,.75)'; ctx.lineWidth = w * s; ctx.stroke(); };
  const plate = -R * 1.55;                                     // 발판(차대 윗면) 높이
  // 돌진 중: 뒤로 흩어지는 속도선
  if (charging) {
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineCap = 'round';
    for (const [y, len] of [[-H * 0.85, 0.5], [-H * 0.55, 0.75], [-H * 0.25, 0.55]]) {
      ctx.lineWidth = 4 * s; ctx.beginPath(); ctx.moveTo(-L * 0.55, y); ctx.lineTo(-L * (0.55 + len), y); ctx.stroke();
    }
  }
  // 차대와 배장기
  ctx.fillStyle = '#1E2733'; roundRect(ctx, -L * 0.47, plate, L * 0.98, R * 0.45, 3 * s); ctx.fill();
  ctx.beginPath(); ctx.moveTo(L * 0.48, plate + R * 0.3); ctx.lineTo(L * 0.63, -2 * s); ctx.lineTo(L * 0.44, -2 * s); ctx.closePath();
  ctx.fillStyle = GOLD; ctx.fill(); line(2);
  ctx.strokeStyle = 'rgba(120,80,0,.6)'; ctx.lineWidth = 2 * s;
  for (const k of [0.25, 0.5, 0.75]) { ctx.beginPath(); ctx.moveTo(L * (0.46 + 0.02 * k), plate + R * 0.35); ctx.lineTo(L * (0.46 + 0.15 * k), -3 * s); ctx.stroke(); }
  // 보일러(둥근 원통처럼 위가 밝다)
  const bTop = -H * 0.8, bBot = plate;
  const g = ctx.createLinearGradient(0, bTop, 0, bBot);
  g.addColorStop(0, '#5E9BEA'); g.addColorStop(0.35, BLUE); g.addColorStop(1, '#00296B');
  ctx.fillStyle = g; roundRect(ctx, -L * 0.12, bTop, L * 0.6, bBot - bTop, (bBot - bTop) * 0.45); ctx.fill(); line(2);
  ctx.fillStyle = '#122A52'; roundRect(ctx, L * 0.4, bTop + 2 * s, L * 0.08, bBot - bTop - 4 * s, 8 * s); ctx.fill();   // 연기실(앞머리)
  ctx.fillStyle = GOLD;
  for (const x of [0.05, 0.2, 0.36]) ctx.fillRect(L * x, bTop + 2 * s, 4 * s, bBot - bTop - 4 * s);                      // 금색 띠
  ctx.fillStyle = 'rgba(255,255,255,.35)'; roundRect(ctx, -L * 0.05, bTop + 5 * s, L * 0.42, 4 * s, 2 * s); ctx.fill();   // 윗면 광택
  // 증기 돔(금색)과 굴뚝(끝이 벌어진 검은 굴뚝)
  ctx.fillStyle = GOLD; ctx.beginPath(); ctx.ellipse(L * 0.13, bTop + 1 * s, 9 * s, 9 * s, 0, Math.PI, 0); ctx.fill(); line(1.5);
  const cx = L * 0.43, cTop = -H * 1.1;   // 연기실 위: 머리 앞쪽 끝이라 연기가 얼굴을 덜 가린다
  ctx.beginPath(); ctx.moveTo(cx - 6 * s, bTop + 2 * s); ctx.lineTo(cx - 7 * s, cTop + 6 * s); ctx.lineTo(cx - 11 * s, cTop); ctx.lineTo(cx + 11 * s, cTop); ctx.lineTo(cx + 7 * s, cTop + 6 * s); ctx.lineTo(cx + 6 * s, bTop + 2 * s); ctx.closePath();
  ctx.fillStyle = '#23272E'; ctx.fill(); line(1.5);
  ctx.fillStyle = GOLD; ctx.fillRect(cx - 11 * s, cTop, 22 * s, 3 * s);
  // 전조등: 돌진 중엔 앞으로 빛이 퍼진다
  const lx = L * 0.5, ly = bTop + 12 * s;
  if (charging) {
    const lg = ctx.createRadialGradient(lx, ly, 2 * s, lx, ly, 60 * s); lg.addColorStop(0, 'rgba(255,244,176,.75)'); lg.addColorStop(1, 'rgba(255,244,176,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 70 * s, ly - 26 * s); ctx.lineTo(lx + 70 * s, ly + 26 * s); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#23272E'; roundRect(ctx, lx - 7 * s, ly - 6 * s, 12 * s, 12 * s, 3 * s); ctx.fill();
  ctx.fillStyle = '#FFF4B0'; ctx.beginPath(); ctx.arc(lx, ly, 4 * s, 0, Math.PI * 2); ctx.fill();
  // 운전실: 지붕이 앞뒤로 조금 나오고, 옆창과 번호판
  const cabL = -L * 0.47, cabR = -L * 0.1, cabTop = -H * 0.98;
  ctx.fillStyle = NAVY; roundRect(ctx, cabL, cabTop, cabR - cabL, plate - cabTop, 5 * s); ctx.fill(); line(2);
  ctx.fillStyle = '#0F1C33'; roundRect(ctx, cabL - 4 * s, cabTop - 5 * s, cabR - cabL + 8 * s, 7 * s, 3 * s); ctx.fill();
  ctx.fillStyle = '#CFE3FF'; roundRect(ctx, cabL + 7 * s, cabTop + 9 * s, (cabR - cabL) * 0.42, H * 0.22, 3 * s); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(cabL + 10 * s, cabTop + 12 * s, 3 * s, H * 0.14);
  const px = (cabL + cabR) / 2 + 6 * s, py = plate - H * 0.2;
  ctx.fillStyle = GOLD; roundRect(ctx, px - 13 * s, py - 10 * s, 26 * s, 20 * s, 4 * s); ctx.fill();
  // 바퀴 셋과 연결봉
  const wy = -R, wheels = [-L * 0.3, L * 0.03, L * 0.3];
  for (const wx of wheels) {
    ctx.fillStyle = '#171C24'; ctx.beginPath(); ctx.arc(wx, wy, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(wx, wy, R * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#CFE3FF'; ctx.lineWidth = 2 * s;
    for (let k = 0; k < 4; k++) { const a = spin + k * Math.PI / 4; ctx.beginPath(); ctx.moveTo(wx - Math.cos(a) * R * 0.7, wy - Math.sin(a) * R * 0.7); ctx.lineTo(wx + Math.cos(a) * R * 0.7, wy + Math.sin(a) * R * 0.7); ctx.stroke(); }
    ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(wx, wy, R * 0.22, 0, Math.PI * 2); ctx.fill();
  }
  const pin = a => [Math.cos(a) * R * 0.48, Math.sin(a) * R * 0.48];
  const [rx, ry] = pin(spin);
  ctx.strokeStyle = '#D9DEE6'; ctx.lineWidth = 4 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(wheels[0] + rx, wy + ry); ctx.lineTo(wheels[2] + rx, wy + ry); ctx.stroke();
  ctx.fillStyle = '#D9DEE6'; for (const wx of wheels) { ctx.beginPath(); ctx.arc(wx + rx, wy + ry, 3 * s, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // 번호판 숫자(뒤집히지 않게 밖에서 쓴다)
  ctx.fillStyle = NAVY; ctx.font = `600 ${Math.round(19 * s)}px Teko, "Arial Narrow", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(b.def.number), b.x + f * px, b.y + bob + py + 1 * s);
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
  } else if (isCatch) {           // 던지기: 뒤로 젖혔다가 앞으로 숙이며 던진다
    const ang = catchLean(b.active.data || {}, b.side === 'L' ? 1 : -1);
    ctx.translate(b.x, b.y); ctx.rotate(ang); ctx.translate(-b.x, -b.y);
  }
  const holding = isCatch && b.active.data && b.active.data.holding;
  const useCut = !circle && art && art.cut;
  if (useCut) drawHead(ctx, b, art, false);          // 컷아웃은 몸이 어깨를 덮도록 먼저
  if (isTrain) drawTrain(ctx, b);
  else drawBody(ctx, b, rect, kit, t, cheer);
  if (!useCut) drawHead(ctx, b, art, true);
  if (isCatch && !holding) drawGloves(ctx, b, h, kit);
  ctx.restore();
  if (holding) drawGloves(ctx, b, h, kit);            // 쥔 공은 sim 좌표 그대로라 몸 기울기 밖에서 감싼다
}

// 선방 캐치의 몸 기울기(라디안, +는 던지는 쪽으로): 끌어올리는 동안 0 → 뒤로 젖힘 → 던지며 앞으로 → 던진 뒤 0.3초에 걸쳐 바로 선다
function catchLean(d, dirX) {
  if (d.holding) {
    const t = d.holdT || 0;
    if (t < 0.15) return 0;
    if (t < 0.3) return -dirX * 0.14 * (t - 0.15) / 0.15;
    return dirX * (-0.14 + 0.32 * Math.min(1, (t - 0.3) / 0.1));
  }
  if (d.threw !== undefined && d.threw < 0.3) return dirX * 0.18 * (1 - d.threw / 0.3);
  return 0;
}

// 골키퍼 장갑 하나: 손가락 넷 + 안쪽으로 벌린 엄지 + 손바닥 + 유니폼 트림 색 손목 밴드. 로컬 좌표는 손가락이 위, 엄지가 -x 쪽.
// inward = 엄지가 향할 방향(+1 오른쪽, -1 왼쪽).
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
    const t = d.holdT || 0, o = holdOffset(t, dirX, d.from), bx = h.x + o.dx, by = h.y - h.r - PHYS.BALL_R - 4 + o.dy;
    const squeeze = t < 0.08 ? 1 - t / 0.08 : 0;                 // 잡는 순간 장갑이 공을 꽉 누른다
    const gap = (PHYS.BALL_R + 7 - 4 * squeeze) * s, tilt = 0.35 + 0.25 * squeeze;
    drawGlove(ctx, bx - gap, by + 6 * s, tilt, s, 1, band);
    drawGlove(ctx, bx + gap, by + 6 * s, -tilt, s, -1, band);
  } else if (d.threw !== undefined && d.threw < 0.3) {
    if (d.threw < 0.2) {   // 팔을 휘두른 자취: 머리 뒤 위에서 앞 위로 반원
      ctx.save(); ctx.globalAlpha = 0.65 * (1 - d.threw / 0.2);
      ctx.strokeStyle = WHITE; ctx.lineWidth = 9 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 30 * s, dirX > 0 ? -Math.PI * 0.85 : -Math.PI * 0.15, dirX > 0 ? -Math.PI * 0.2 : -Math.PI * 0.8, dirX < 0); ctx.stroke();
      ctx.restore();
    }
    drawGlove(ctx, h.x + dirX * (h.r + 26 * s), h.y - h.r - 18 * s, dirX * 1.0, s, -dirX, band);   // 앞손: 던진 방향으로 쭉
    drawGlove(ctx, h.x - dirX * (h.r + 8 * s), h.y + 6 * s, -dirX * 0.3, s, dirX, band);           // 뒷손은 내려서 균형
  } else {
    drawGlove(ctx, h.x - h.r - 10 * s, h.y - 4 * s, -0.25, s, 1, band);
    drawGlove(ctx, h.x + h.r + 10 * s, h.y - 4 * s, 0.25, s, -1, band);
  }
}

// 발밑 그림자: 땅(y)에 붙어 있고, 높이 뜰수록(lift) 작고 옅어진다. 선수·공이 잔디에 서 있는 느낌과 공이 떨어질 자리를 준다
export function drawShadow(ctx, x, y, lift, rx) {
  const k = Math.max(0.4, 1 - Math.max(0, lift) / 560);
  ctx.save(); ctx.fillStyle = `rgba(0,40,16,${(0.26 * k).toFixed(3)})`;
  ctx.beginPath(); ctx.ellipse(x, y, rx * k, rx * 0.2 * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
// 선수 그림자: 신발 바닥은 몸 상자 바닥(b.y)보다 14px(×크기) 위에 있다 (drawBody 의 다리·신발 치수)
export const drawPlayerShadow = (ctx, b, groundY) => drawShadow(ctx, b.x, groundY - 12 * b.scale, groundY - b.y, 36 * b.scale);

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
  // 아래쪽 그늘: 공이 굴러도 빛은 늘 위에서 온다 (회전을 푼 뒤에 덮는다)
  const shade = ctx.createRadialGradient(ball.x - r * 0.35, ball.y - r * 0.4, r * 0.25, ball.x, ball.y, r);
  if (shade && shade.addColorStop) {
    shade.addColorStop(0, 'rgba(0,20,60,0)'); shade.addColorStop(1, 'rgba(0,20,60,.26)');
    ctx.save(); ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}

export { PHYS };
