// 문수구장을 다섯 층으로 그린다 (설계서 11절). 움직이지 않는 층은 오프스크린 캔버스에 한 번만 그린다.
// 2026-11-12 형준 "UI랑 게임 최대한 예뻐보이게": 화면 해상도 그대로(전엔 1280×720 을 늘려 흐렸다), 16:9 바깥 여백까지 이어 그리고,
// 관중석은 가지런한 좌석 모자이크(전엔 흩뿌린 점), "ULSAN" 은 흰 좌석으로 또렷하게(전엔 작은 글자를 늘린 흐린 픽셀).
import { FIELD } from '../sim/constants.js';
import { mulberry32 } from '../sim/rng.js';

const W = FIELD.W, H = FIELD.H, GROUND = FIELD.GROUND;
const ROOF_Y = 150, STAND_TOP = 205, TIER_Y = 243, STAND_BOTTOM = 440, LED_TOP = 440, LED_BOTTOM = 472, GRASS_TOP = 472;
const SEAT = 9;       // 좌석 간격(가로·세로)
const BLOCK = 13;     // 좌석 13칸마다 통로 한 칸: 글자 하나(10칸) + 사이(3칸)와 같은 주기라 통로가 글자를 자르지 않는다
const MARGIN = 12;    // 화면 흔들림에도 가장자리가 비지 않게 보이는 곳보다 조금 더 그린다
export const DEFAULT_VIEW = { s: 1, ox: 0, oy: 0, bleedX: 0, top: 0, bottom: H };   // 16:9 화면: 여백도 잘림도 없다 (view 의 뜻은 ui/orientation.js)
export const TOUCHLINE_Y = GRASS_TOP + 18;   // 먼 쪽 터치라인

// "ULSAN" 5×7 글자. 좌석 2×2 칸이 한 점이라 글자 하나가 10×14 칸.
const GLYPHS = {
  U: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  L: ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
  S: ['.XXX.', 'X...X', 'X....', '.XXX.', '....X', 'X...X', '.XXX.'],
  A: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  N: ['X...X', 'XX..X', 'X.X.X', 'X.X.X', 'X..XX', 'X...X', 'X...X'],
};
const WORD = 'ULSAN', WORD_COLS = WORD.length * BLOCK - 3, WORD_ROWS = 14;
const WORD_COL0 = Math.round(W / 2 / SEAT - WORD_COLS / 2), WORD_ROW0 = 3;
// 좌석 (col, row) 가 글자 칸인지: true 흰 좌석, false 글자 상자 안의 빈 칸, null 상자 밖
function wordSeat(col, row) {
  const c = col - WORD_COL0, r = row - WORD_ROW0;
  if (c < -1 || c > WORD_COLS || r < -1 || r > WORD_ROWS) return null;
  if (c < 0 || c >= WORD_COLS || r < 0 || r >= WORD_ROWS) return false;
  const i = Math.floor(c / BLOCK), cc = c % BLOCK;
  return cc < 10 && GLYPHS[WORD[i]][r >> 1][cc >> 1] === 'X';
}
const isAisle = col => (((col - WORD_COL0 - 11) % BLOCK) + BLOCK) % BLOCK === 0;

// 양 끝(x=0, W)에서 a, 가운데에서 가장 높은 포물선. 경기장 밖으로도 같은 곡선이 이어진다 (지붕)
const arc = (x, a, c) => a + 2 * (x / W) * (1 - x / W) * (c - a);
function band(ctx, x0, x1, a0, c0, a1, c1) {
  ctx.beginPath();
  for (let x = x0; x < x1 + 40; x += 40) ctx.lineTo(x, arc(x, a0, c0));
  for (let x = x1 + 40; x > x0 - 40; x -= 40) ctx.lineTo(x, arc(x, a1, c1));
  ctx.closePath();
}

function cloud(ctx, cx, cy, s) {
  const puffs = [[0, 0, 34], [-36, 10, 24], [36, 8, 26], [10, -14, 22]];
  ctx.fillStyle = 'rgba(176,214,244,.9)';   // 아래쪽 그늘
  for (const [dx, dy, r] of puffs) { ctx.beginPath(); ctx.ellipse(cx + dx * s, cy + dy * s + 6 * s, r * s, r * s * .72, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#FFFFFF';
  for (const [dx, dy, r] of puffs) { ctx.beginPath(); ctx.ellipse(cx + dx * s, cy + dy * s, r * s, r * s * .75, 0, 0, Math.PI * 2); ctx.fill(); }
}

// 논리 좌표 [x0,x1]×[y0,y1] 전체를 채운다 (경기장 0..W × 0..H 바깥은 같은 그림이 이어진다)
function paintStatic(ctx, x0, x1, y0, y1) {
  const full = (y, h) => ctx.fillRect(x0, y, x1 - x0, h);
  // 1. 하늘과 구름
  const sky = ctx.createLinearGradient(0, Math.min(y0, -60), 0, STAND_TOP);
  sky.addColorStop(0, '#3D97E8'); sky.addColorStop(.55, '#74C2F7'); sky.addColorStop(1, '#D3EDFF');
  ctx.fillStyle = sky; full(y0, GRASS_TOP - y0);
  for (const [cx, cy, s] of [[-170, 78, .9], [180, 70, 1], [520, 40, .8], [900, 80, 1.1], [1180, 45, .7], [W + 190, 84, 1]]) cloud(ctx, cx, cy, s);

  // 2. 지붕: 가운데가 살짝 올라간 띠, 밑면 그늘, 기둥
  ctx.fillStyle = '#59636E';
  for (let x = 40 + Math.floor((x0 - 40) / 150) * 150; x < x1; x += 150) ctx.fillRect(x - 5, arc(x, ROOF_Y + 44, ROOF_Y - 32) - 4, 10, STAND_TOP - ROOF_Y + 40);
  const roof = ctx.createLinearGradient(0, ROOF_Y - 40, 0, ROOF_Y + 50);
  roof.addColorStop(0, '#5B6672'); roof.addColorStop(1, '#3A434D');
  ctx.fillStyle = roof; band(ctx, x0, x1, ROOF_Y + 10, ROOF_Y - 70, ROOF_Y + 44, ROOF_Y - 32); ctx.fill();
  ctx.fillStyle = '#262D35'; band(ctx, x0, x1, ROOF_Y + 44, ROOF_Y - 32, ROOF_Y + 56, ROOF_Y - 20); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 2;   // 지붕 윗선에 햇빛
  ctx.beginPath(); for (let x = x0; x < x1 + 40; x += 40) ctx.lineTo(x, arc(x, ROOF_Y + 11, ROOF_Y - 69)); ctx.stroke();

  // 3. 관중석: 위층 빨간 좌석 띠, 난간, 아래층 파란 좌석 모자이크
  const stand = ctx.createLinearGradient(0, STAND_TOP, 0, STAND_BOTTOM);
  stand.addColorStop(0, '#123A85'); stand.addColorStop(1, '#1B4FA8');
  ctx.fillStyle = stand; full(STAND_TOP, STAND_BOTTOM - STAND_TOP);
  const red = ctx.createLinearGradient(0, STAND_TOP, 0, TIER_Y);
  red.addColorStop(0, '#B62C38'); red.addColorStop(1, '#D03B46');
  ctx.fillStyle = red; full(STAND_TOP, TIER_Y - STAND_TOP - 5);
  ctx.fillStyle = 'rgba(90,10,20,.28)';
  for (let y = STAND_TOP + 6; y < TIER_Y - 8; y += 7) full(y, 2);   // 좌석 줄
  ctx.fillStyle = '#E3EAF3'; full(TIER_Y - 5, 3);                    // 층 사이 난간
  ctx.fillStyle = '#0D2F74'; full(TIER_Y - 2, 4);
  const rng = mulberry32(7);
  const rows = Math.floor((STAND_BOTTOM - 14 - TIER_Y - 6) / SEAT);
  for (let col = Math.floor(x0 / SEAT); col * SEAT < x1; col++) {
    for (let row = 0; row < rows; row++) {
      const r = rng(), letter = wordSeat(col, row);
      if (isAisle(col) && letter !== true) continue;
      const x = col * SEAT + 1.5, y = TIER_Y + 7 + row * SEAT;
      if (letter === true) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x - .5, y - .5, 7, 7); continue; }
      // 글자 상자 안은 파란 좌석만(글자가 또렷하게), 밖은 관중: 파랑 사이로 흰색·금색 응원복이 드문드문
      ctx.fillStyle = letter === false ? (r < .5 ? '#2458B8' : '#2A62C4')
        : r < .36 ? '#2458B8' : r < .68 ? '#2D66C9' : r < .80 ? '#17418F' : r < .87 ? '#DCE7F7' : r < .93 ? '#F5C02E' : '#5F97E6';
      ctx.fillRect(x, y, 6, 6);
    }
  }
  const shade = ctx.createLinearGradient(0, STAND_TOP, 0, STAND_TOP + 110);   // 지붕 그늘
  shade.addColorStop(0, 'rgba(4,14,40,.5)'); shade.addColorStop(1, 'rgba(4,14,40,0)');
  ctx.fillStyle = shade; full(STAND_TOP, 110);
  ctx.fillStyle = '#0C2C6E'; full(STAND_BOTTOM - 10, 10);   // 관중석 앞 벽과 난간
  ctx.fillStyle = '#E8EEF5'; full(STAND_BOTTOM - 12, 3);

  // 5. 잔디: 줄무늬, 멀리는 옅게·가까이는 짙게, 터치라인·하프라인·센터 서클
  for (let x = Math.floor(x0 / 128) * 128, i = Math.floor(x0 / 128); x < x1; x += 128, i++) { ctx.fillStyle = i % 2 ? '#3D9C42' : '#47AD4B'; ctx.fillRect(x, GRASS_TOP, 128, y1 - GRASS_TOP); }
  const far = ctx.createLinearGradient(0, GRASS_TOP, 0, GRASS_TOP + 130);
  far.addColorStop(0, 'rgba(255,255,255,.14)'); far.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = far; full(GRASS_TOP, 130);
  const near = ctx.createLinearGradient(0, GROUND + 10, 0, Math.max(y1, H));
  near.addColorStop(0, 'rgba(0,40,10,0)'); near.addColorStop(1, 'rgba(0,40,10,.3)');
  ctx.fillStyle = near; full(GROUND + 10, y1 - GROUND - 10);
  const boardShadow = ctx.createLinearGradient(0, GRASS_TOP, 0, GRASS_TOP + 14);
  boardShadow.addColorStop(0, 'rgba(0,30,10,.3)'); boardShadow.addColorStop(1, 'rgba(0,30,10,0)');
  ctx.fillStyle = boardShadow; full(GRASS_TOP, 14);
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x0, TOUCHLINE_Y); ctx.lineTo(x1, TOUCHLINE_Y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W / 2, TOUCHLINE_Y); ctx.lineTo(W / 2, y1); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(W / 2, GROUND - 30, 150, 44, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, GROUND - 30, 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
}

// 4. LED 광고판 띠: 흰 글자가 천천히 흐른다
function paintLed(ctx, t, x0, x1) {
  const led = ctx.createLinearGradient(0, LED_TOP, 0, LED_BOTTOM);
  led.addColorStop(0, '#004CB0'); led.addColorStop(1, '#00398A');
  ctx.fillStyle = led; ctx.fillRect(x0, LED_TOP, x1 - x0, LED_BOTTOM - LED_TOP);
  ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x0, LED_TOP, x1 - x0, 2);
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.font = '700 20px "Pretendard Variable", Pretendard, sans-serif';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const text = 'ULSAN HD FC   ·   울산 HD FC   ·   ';
  const unit = ctx.measureText(text).width || 300;
  const off = -((t * 60) % unit);
  for (let x = off + Math.floor((x0 - off) / unit) * unit; x < x1; x += unit) ctx.fillText(text, x, (LED_TOP + LED_BOTTOM) / 2 + 1);
}

// 골이 들어가면 관중석에서 카메라 플래시가 터진다 (k: 1 → 0 으로 잦아든다)
export function drawCrowdFlashes(ctx, t, k, view = DEFAULT_VIEW) {
  const rng = mulberry32(1 + Math.floor(t * 14)), x0 = -view.bleedX, span = W + 2 * view.bleedX;
  ctx.save(); ctx.fillStyle = '#FFFFFF';
  for (let i = 0, n = Math.round(26 * k); i < n; i++) {
    const x = x0 + rng() * span, y = TIER_Y + 10 + rng() * (STAND_BOTTOM - TIER_Y - 30), r = 2 + rng() * 4;
    ctx.globalAlpha = .55 + rng() * .45;
    ctx.beginPath(); ctx.moveTo(x, y - r * 2); ctx.lineTo(x + r * .5, y - r * .5); ctx.lineTo(x + r * 2, y); ctx.lineTo(x + r * .5, y + r * .5);
    ctx.lineTo(x, y + r * 2); ctx.lineTo(x - r * .5, y + r * .5); ctx.lineTo(x - r * 2, y); ctx.lineTo(x - r * .5, y - r * .5); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// 골대: 그물(옅은 흰 면 + 격자)과 크로스바. 왼쪽/오른쪽.
export function drawGoals(ctx) {
  const top = GROUND - FIELD.GOAL_H, d = FIELD.GOAL_DEPTH;
  for (const side of ['L', 'R']) {
    const x0 = side === 'L' ? 0 : W - d, x1 = side === 'L' ? d : W, back = side === 'L' ? 0 : W;
    ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(x0, top, d, FIELD.GOAL_H);
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1;
    for (let y = top + 12; y < GROUND; y += 14) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
    for (let x = x0 + 12; x < x1; x += 14) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, GROUND); ctx.stroke(); }
    ctx.fillStyle = 'rgba(244,247,250,.75)'; ctx.fillRect(back - 2, top - FIELD.BAR_T, 4, FIELD.GOAL_H + FIELD.BAR_T);   // 뒤쪽 기둥
    ctx.fillStyle = '#F4F7FA';
    ctx.fillRect(x0, top - FIELD.BAR_T, d, FIELD.BAR_T);                      // 크로스바(지붕)
    ctx.fillStyle = 'rgba(0,20,60,.18)'; ctx.fillRect(x0, top, d, 3);
  }
}

// 골라인 쪽 포스트(장식). 공·선수 위에 그려서 공이 포스트 뒤로 들어가 보이게 한다.
export function drawPosts(ctx) {
  const top = GROUND - FIELD.GOAL_H, d = FIELD.GOAL_DEPTH;
  for (const x of [d - 8, W - d]) {
    ctx.fillStyle = '#F4F7FA'; ctx.fillRect(x, top - FIELD.BAR_T, 8, FIELD.GOAL_H + FIELD.BAR_T);
    ctx.fillStyle = 'rgba(0,30,80,.16)'; ctx.fillRect(x + 5, top - FIELD.BAR_T, 3, FIELD.GOAL_H + FIELD.BAR_T);   // 둥근 기둥의 그늘
  }
}

let cache = null, cacheKey = '', cacheOx = 0, cacheOy = 0;
// dx·dy: 화면 흔들림(논리 px). 배경은 캔버스 픽셀에 딱 맞춰 붙인다 (다시 늘리지 않아 또렷하다)
export function drawStadium(ctx, t, view = DEFAULT_VIEW, dx = 0, dy = 0) {
  const x0 = -view.bleedX - MARGIN, x1 = W + view.bleedX + MARGIN, y0 = view.top - MARGIN, y1 = view.bottom + MARGIN;   // 보이는 곳만 (위아래가 잘린 화면은 그만큼 덜 그린다)
  const key = `${view.s}|${view.bleedX}|${view.top}|${view.bottom}`;
  if (!cache || cacheKey !== key) {
    cache = document.createElement('canvas');
    cacheOx = Math.round(-x0 * view.s); cacheOy = Math.round(-y0 * view.s);
    cache.width = Math.ceil((x1 - x0) * view.s); cache.height = Math.ceil((y1 - y0) * view.s);
    const c = cache.getContext('2d');
    c.setTransform(view.s, 0, 0, view.s, cacheOx, cacheOy);
    paintStatic(c, x0, x1, y0, y1);
    cacheKey = key;
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(cache, Math.round(view.ox + dx * view.s) - cacheOx, Math.round(view.oy + dy * view.s) - cacheOy);
  ctx.restore();
  paintLed(ctx, t, x0, x1);
}
