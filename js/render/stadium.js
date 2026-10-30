// 문수구장을 다섯 층으로 그린다 (설계서 11절). 움직이지 않는 층은 오프스크린 캔버스에 한 번만 그린다.
import { FIELD } from '../sim/constants.js';
import { mulberry32 } from '../sim/rng.js';

const W = FIELD.W, H = FIELD.H, GROUND = FIELD.GROUND;
const ROOF_Y = 150, STAND_TOP = 205, STAND_BOTTOM = 440, LED_TOP = 440, LED_BOTTOM = 472, GRASS_TOP = 472;
let cache = null;

function paintStatic(ctx) {
  // 1. 하늘과 구름
  const sky = ctx.createLinearGradient(0, 0, 0, GRASS_TOP);
  sky.addColorStop(0, '#5FB8F5'); sky.addColorStop(1, '#C9E9FF');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GRASS_TOP);
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  for (const [cx, cy, s] of [[180, 70, 1], [520, 40, .8], [900, 80, 1.1], [1180, 45, .7]]) {
    for (const [dx, dy, r] of [[0, 0, 34], [-36, 10, 24], [36, 8, 26], [10, -14, 22]]) {
      ctx.beginPath(); ctx.ellipse(cx + dx * s, cy + dy * s, r * s, r * s * .75, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 2. 지붕: 가운데가 살짝 올라간 회색 띠와 기둥
  ctx.fillStyle = '#3F4852';
  ctx.beginPath(); ctx.moveTo(0, ROOF_Y + 10); ctx.quadraticCurveTo(W / 2, ROOF_Y - 70, W, ROOF_Y + 10);
  ctx.lineTo(W, ROOF_Y + 44); ctx.quadraticCurveTo(W / 2, ROOF_Y - 32, 0, ROOF_Y + 44); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2B323A';
  ctx.beginPath(); ctx.moveTo(0, ROOF_Y + 44); ctx.quadraticCurveTo(W / 2, ROOF_Y - 32, W, ROOF_Y + 44);
  ctx.lineTo(W, ROOF_Y + 56); ctx.quadraticCurveTo(W / 2, ROOF_Y - 20, 0, ROOF_Y + 56); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4C565F';
  for (let i = 0; i <= 8; i++) { const x = 40 + i * 150; ctx.fillRect(x - 5, ROOF_Y + 20, 10, STAND_TOP - ROOF_Y - 10); }
  // 3. 관중석: 파란 좌석 블록, 위쪽 빨간 띠, 회색 계단
  ctx.fillStyle = '#1B4FA8'; ctx.fillRect(0, STAND_TOP, W, STAND_BOTTOM - STAND_TOP);
  ctx.fillStyle = '#C8323C'; ctx.fillRect(0, STAND_TOP, W, 34);
  ctx.fillStyle = '#8C97A3';
  for (let x = 160; x < W; x += 160) ctx.fillRect(x - 6, STAND_TOP, 12, STAND_BOTTOM - STAND_TOP);
  const rng = mulberry32(7);   // 관중 점 질감
  for (let i = 0; i < 2600; i++) {
    const x = rng() * W, y = STAND_TOP + 34 + rng() * (STAND_BOTTOM - STAND_TOP - 40);
    const c = rng();
    ctx.fillStyle = c < .55 ? 'rgba(255,255,255,.55)' : c < .8 ? 'rgba(255,199,44,.6)' : 'rgba(10,30,90,.7)';
    ctx.fillRect(x, y, 3, 3);
  }
  // "ULSAN" 글자 좌석: 작은 캔버스에 쓴 뒤 픽셀 느낌으로 키운다 (2026-10-31 형준: 울산 → ULSAN)
  const small = document.createElement('canvas'); small.width = 128; small.height = 32;
  const sc = small.getContext('2d');
  sc.fillStyle = '#fff'; sc.font = '800 27px "Pretendard Variable", Pretendard, sans-serif';
  sc.textAlign = 'center'; sc.textBaseline = 'middle'; sc.fillText('ULSAN', 64, 17);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = .9;
  ctx.drawImage(small, 0, 0, 128, 32, W / 2 - 300, STAND_TOP + 62, 600, 150);
  ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true;
  // 관중석 아래 난간
  ctx.fillStyle = '#E8EEF5'; ctx.fillRect(0, STAND_BOTTOM - 6, W, 6);
  // 5. 잔디 줄무늬, 터치라인, 센터 서클, 하프라인
  for (let x = 0, i = 0; x < W; x += 128, i++) { ctx.fillStyle = i % 2 ? '#3E9A3E' : '#48AD48'; ctx.fillRect(x, GRASS_TOP, 128, H - GRASS_TOP); }
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, GRASS_TOP + 8); ctx.lineTo(W, GRASS_TOP + 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W / 2, GRASS_TOP + 8); ctx.lineTo(W / 2, H); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(W / 2, GROUND - 30, 150, 44, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, GROUND - 30, 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
}

// 4. LED 광고판 띠: 흰 글자가 천천히 흐른다
function paintLed(ctx, t) {
  ctx.fillStyle = '#004098'; ctx.fillRect(0, LED_TOP, W, LED_BOTTOM - LED_TOP);
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.font = '700 20px "Pretendard Variable", Pretendard, sans-serif';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const text = 'ULSAN HD FC   ·   울산 HD FC   ·   ';
  const unit = ctx.measureText(text).width;
  const off = -((t * 60) % unit);
  for (let x = off; x < W; x += unit) ctx.fillText(text, x, (LED_TOP + LED_BOTTOM) / 2 + 1);
}

// 골대: 흰 프레임과 그물. 왼쪽/오른쪽.
export function drawGoals(ctx) {
  const top = GROUND - FIELD.GOAL_H, d = FIELD.GOAL_DEPTH;
  for (const side of ['L', 'R']) {
    const x0 = side === 'L' ? 0 : W - d, x1 = side === 'L' ? d : W;
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
    for (let y = top + 12; y < GROUND; y += 14) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
    for (let x = x0 + 12; x < x1; x += 14) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, GROUND); ctx.stroke(); }
    ctx.fillStyle = '#F4F7FA';
    ctx.fillRect(x0, top - FIELD.BAR_T, d, FIELD.BAR_T);                      // 크로스바(지붕)
    const postX = side === 'L' ? d - 8 : W - d;                              // 골라인 쪽 포스트(장식)
    ctx.fillRect(postX, top - FIELD.BAR_T, 8, FIELD.GOAL_H + FIELD.BAR_T);
  }
}

export function drawStadium(ctx, t) {
  if (!cache) {
    cache = document.createElement('canvas'); cache.width = W; cache.height = H;
    paintStatic(cache.getContext('2d'));
  }
  ctx.drawImage(cache, 0, 0);
  paintLed(ctx, t);
}
