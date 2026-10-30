// 선수(큰 머리 사진 + 작은 유니폼 몸)와 공을 그린다. 선택 카드와 경기 화면이 같은 함수를 쓴다.
import { PHYS } from '../sim/constants.js';
import { headCenter, bodyRect } from '../sim/physics.js';

const BLUE = '#004098', NAVY = '#002B6B', GOLD = '#FFC72C', WHITE = '#FFFFFF';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function drawLegs(ctx, b, rect) {
  const s = b.scale, legLen = 14 * s, y0 = rect.y + rect.h - 2;
  ctx.lineCap = 'round'; ctx.lineWidth = 6 * s; ctx.strokeStyle = '#1A1A1A';
  // 뒷다리
  ctx.beginPath(); ctx.moveTo(b.x - 10 * s, y0); ctx.lineTo(b.x - 12 * s, y0 + legLen); ctx.stroke();
  // 앞다리: 킥 중이면 앞으로 뻗는다
  const kick = b.kickAnim > 0 ? Math.sin((0.25 - b.kickAnim) / 0.25 * Math.PI) : 0;
  const fx = b.x + 10 * s + b.facing * kick * 26 * s, fy = y0 + legLen - kick * 12 * s;
  ctx.beginPath(); ctx.moveTo(b.x + 10 * s, y0); ctx.lineTo(fx, fy); ctx.stroke();
  // 신발
  ctx.fillStyle = BLUE;
  ctx.beginPath(); ctx.ellipse(b.x - 12 * s + b.facing * 3, y0 + legLen, 9 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(fx + b.facing * 4, fy, 9 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
}

function drawJersey(ctx, b, rect, away) {
  const s = b.scale;
  ctx.fillStyle = away ? WHITE : BLUE;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10 * s); ctx.fill();
  // 트림과 어깨선
  ctx.strokeStyle = away ? BLUE : GOLD; ctx.lineWidth = 3 * s;
  ctx.beginPath(); ctx.moveTo(rect.x + 6 * s, rect.y + 4 * s); ctx.lineTo(rect.x + 6 * s, rect.y + rect.h - 6 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rect.x + rect.w - 6 * s, rect.y + 4 * s); ctx.lineTo(rect.x + rect.w - 6 * s, rect.y + rect.h - 6 * s); ctx.stroke();
  // 등번호
  ctx.fillStyle = away ? BLUE : WHITE;
  ctx.font = `600 ${Math.round(40 * s)}px Teko, "Arial Narrow", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(b.def.number), b.x, rect.y + rect.h * 0.55);
}

// 일반 파란 증기기관차: 보일러·굴뚝·운전실·바퀴 둘. 실제 캐릭터와 무관한 모양.
function drawTrain(ctx, b, rect) {
  const s = b.scale, f = b.facing;
  const w = rect.w * 1.9, h = rect.h * 1.05, x = b.x - w / 2, y = rect.y + rect.h - h;
  ctx.fillStyle = '#2A2F36';
  ctx.fillRect(x - 4 * s, y + h - 10 * s, w + 8 * s, 8 * s);                     // 받침
  ctx.fillStyle = BLUE;
  roundRect(ctx, x, y + 10 * s, w * 0.62, h - 20 * s, 12 * s); ctx.fill();          // 보일러
  const cabX = f > 0 ? x : x + w * 0.62;
  ctx.fillStyle = NAVY; roundRect(ctx, cabX, y, w * 0.38, h - 10 * s, 6 * s); ctx.fill();   // 운전실
  ctx.fillStyle = '#CFE3FF'; ctx.fillRect(cabX + 8 * s, y + 8 * s, w * 0.38 - 16 * s, 16 * s);   // 창
  const chimX = f > 0 ? x + w * 0.62 - 16 * s : x + w * 0.38 + 4 * s;
  ctx.fillStyle = '#2A2F36'; ctx.fillRect(chimX, y - 6 * s, 12 * s, 20 * s);     // 굴뚝
  ctx.fillStyle = GOLD; ctx.fillRect(x, y + h / 2 - 2 * s, w, 4 * s);             // 금색 띠
  for (const cx of [x + w * 0.22, x + w * 0.72]) {                                // 바퀴
    ctx.fillStyle = '#1A1A1A'; ctx.beginPath(); ctx.arc(cx, y + h - 6 * s, 13 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(cx, y + h - 6 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
  }
  // 앞 램프
  ctx.fillStyle = '#FFF4B0'; ctx.beginPath(); ctx.arc(f > 0 ? x + w - 4 * s : x + 4 * s, y + h / 2, 5 * s, 0, Math.PI * 2); ctx.fill();
}

export function drawPlayer(ctx, b, img, { away = false } = {}) {
  const h = headCenter(b), rect = bodyRect(b), s = b.scale;
  const isTrain = b.active && b.active.id === 'train';
  const isCatch = b.active && b.active.id === 'catch';
  ctx.save();
  // 넘어짐·비틀거림: 몸 전체를 기울인다
  if (b.stun > 0 || b.pinned) {
    const ang = b.pinned ? -b.facing * 0.35 : -b.facing * Math.min(1, b.stun) * 0.9;
    ctx.translate(b.x, b.y); ctx.rotate(ang); ctx.translate(-b.x, -b.y);
  }
  if (isTrain) drawTrain(ctx, b, rect);
  else { drawLegs(ctx, b, rect); drawJersey(ctx, b, rect, away); }

  // 머리: 사진을 원으로 오리고 흰 테두리
  ctx.save();
  ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  if (img) {
    ctx.save();
    if (b.facing < 0) { ctx.translate(h.x * 2, 0); ctx.scale(-1, 1); }   // 오른쪽 선수는 왼쪽을 본다
    ctx.drawImage(img, h.x - h.r, h.y - h.r, h.r * 2, h.r * 2);
    ctx.restore();
  } else { ctx.fillStyle = '#B9CBE8'; ctx.fillRect(h.x - h.r, h.y - h.r, h.r * 2, h.r * 2); }
  if (isTrain) {   // 발그레한 홍조
    ctx.fillStyle = 'rgba(255,110,130,.45)';
    for (const dx of [-0.5, 0.5]) { ctx.beginPath(); ctx.ellipse(h.x + dx * h.r, h.y + h.r * 0.25, h.r * 0.28, h.r * 0.18, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
  ctx.strokeStyle = WHITE; ctx.lineWidth = 2.5 * s;
  ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.stroke();

  if (isCatch) {   // 장갑 두 개
    ctx.fillStyle = '#F2F2F2'; ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
    for (const dx of [-1, 1]) {
      roundRect(ctx, h.x + dx * (h.r + 6) - 14, h.y - h.r * 0.2, 28, 34, 9); ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawBall(ctx, ball, rotation = 0) {
  const r = ball.r;
  ctx.save();
  ctx.translate(ball.x, ball.y); ctx.rotate(rotation);
  ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1A1A1A';
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
