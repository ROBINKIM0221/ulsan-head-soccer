// 한 프레임을 그린다: 경기장 → 필살기 바닥 표시 → 선수 → 공 → 효과 → HUD → 글자 팝.
import { FIELD, PHYS } from '../sim/constants.js';
import { headCenter, footPoint } from '../sim/physics.js';
import { drawStadium, drawGoals, drawPosts } from './stadium.js';
import { drawPlayer, drawBall } from './characters.js';
import { wornKit } from '../data/kits.js';
import { byNumber } from '../data/players.js';

const GOLD = '#FFC72C', WHITE = '#FFFFFF', NAVY = '#002B6B';
const UI = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const NUM = 'Teko, "Arial Narrow", sans-serif';

export function createFx() {
  return { particles: [], pops: [], shake: 0, ballRot: 0, lastBallX: null, subBoard: null, ghosts: [], trail: [] };
}

function pop(fx, text, x, y, { size = 48, color = GOLD, life = 0.8, rise = 40 } = {}) {
  fx.pops.push({ text, x, y, size, color, life, age: 0, rise });
}

// 경기 이벤트를 연출로 바꾼다
export function pushEvents(fx, events, match) {
  const w = match.world, b = w.ball;
  for (const e of events) {
    switch (e.type) {
      case 'touch': if (e.perfect) pop(fx, 'PERFECT', b.x, b.y - 60, { size: 40, color: WHITE, life: 0.7 }); break;
      case 'goal': {
        const name = byNumber(match.used[e.scorer].at(-1).number).name;
        pop(fx, 'GOAL', FIELD.W / 2, 260, { size: 150, color: GOLD, life: 1.2, rise: 20 });
        pop(fx, name, FIELD.W / 2, 350, { size: 40, color: WHITE, life: 1.2, rise: 20 });
        fx.shake = 0.35; break;
      }
      case 'special': {
        const p = w.players[e.side];
        pop(fx, `${p.def.name} ${p.def.special.name}`, FIELD.W / 2, 200, { size: 48, color: GOLD, life: 0.9, rise: 30 });
        if (e.id === 'giant') fx.shake = 0.3;
        break;
      }
      case 'catch': pop(fx, 'CATCH', headCenter(w.players[e.side]).x, 380, { size: 40, color: WHITE }); break;
      case 'knockdown': case 'knockback': { const h = headCenter(w.players[e.side]); pop(fx, '!', h.x, h.y - h.r - 20, { size: 56, color: WHITE, life: 0.6 }); break; }
      case 'sub': fx.subBoard = { out: e.out, in: e.in, t: 0.8 }; break;
      case 'phase':
        if (e.phase === 'play' && match.clock >= 59.9) pop(fx, 'KICK OFF', FIELD.W / 2, 300, { size: 72, color: WHITE, life: 0.9, rise: 20 });
        if (e.phase === 'golden') pop(fx, '골든골!', FIELD.W / 2, 300, { size: 64, color: GOLD, life: 1.2, rise: 20 });
        break;
    }
  }
}

// 입자·팝·잔상 노화. 물리 스텝마다 부른다.
export function updateFx(fx, match, dt) {
  const w = match.world, b = w.ball;
  fx.shake = Math.max(0, fx.shake - dt);
  if (fx.lastBallX !== null) fx.ballRot += (b.x - fx.lastBallX) / b.r;
  fx.lastBallX = b.x;
  for (const p of fx.pops) p.age += dt;
  fx.pops = fx.pops.filter(p => p.age < p.life);
  if (fx.subBoard) { fx.subBoard.t -= dt; if (fx.subBoard.t <= 0) fx.subBoard = null; }
  for (const side of ['L', 'R']) {
    const p = w.players[side];
    if (!p.active) continue;
    if (p.active.id === 'train' && p.active.data.charging) {
      fx.particles.push({ x: p.x - p.facing * 40 * p.scale, y: p.y - 110 * p.scale, vx: -p.facing * 60 + (Math.random() - .5) * 40, vy: -120 - Math.random() * 60, r: 6 + Math.random() * 6, life: 0.9, age: 0 });
    } else if (p.active.id === 'train') {
      if (Math.random() < 0.5) fx.particles.push({ x: p.x - p.facing * 30 * p.scale, y: p.y - 110 * p.scale, vx: (Math.random() - .5) * 40, vy: -100, r: 5 + Math.random() * 5, life: 0.8, age: 0 });
    }
    if (p.active.id === 'sprint') { fx.ghostTick = (fx.ghostTick || 0) + 1; if (fx.ghostTick % 8 === 0) fx.ghosts.push({ x: p.x, y: p.y, scale: p.scale, facing: p.facing, def: p.def, age: 0, life: 0.3, side }); }
    if (p.active.id === 'slide' && p.onGround) fx.particles.push({ x: p.x - p.facing * 20, y: p.y, vx: -p.facing * 80, vy: -140 - Math.random() * 80, r: 3, life: 0.4, age: 0, color: '#3E9A3E' });
    // 높이뛰기: 땅을 박차는 순간 발밑 먼지
    if (p.active.id === 'highjump' && !p.onGround && p.vy < -600 && Math.random() < 0.6) {
      fx.particles.push({ x: p.x + (Math.random() - .5) * 40, y: FIELD.GROUND - 4, vx: (Math.random() - .5) * 120, vy: -40 - Math.random() * 60, r: 4 + Math.random() * 4, life: 0.5, age: 0, color: 'rgba(220,210,180,.9)' });
    }
  }
  // 커브 슛 궤적 점선
  if (b.flight === 'curve') fx.trail.push({ x: b.x, y: b.y, age: 0, life: 0.6 });
  for (const q of fx.trail) q.age += dt;
  fx.trail = fx.trail.filter(q => q.age < q.life);
  for (const q of fx.particles) { q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.r += 8 * dt; }
  fx.particles = fx.particles.filter(q => q.age < q.life);
  for (const g of fx.ghosts) g.age += dt;
  fx.ghosts = fx.ghosts.filter(g => g.age < g.life);
  if (fx.reduceMotion) { fx.shake = 0; fx.particles.length = 0; fx.ghosts.length = 0; fx.trail.length = 0; }   // 움직임 줄이기: 입자·흔들림·궤적 없음
}

function drawGauge(ctx, x, y, w, value, alignRight, t) {
  const g = Math.min(1, value / 100), full = g >= 1;
  const x0 = alignRight ? x - w : x;
  ctx.fillStyle = 'rgba(0,43,107,.55)'; ctx.fillRect(x0, y, w, 10);
  const pulse = full ? 0.75 + 0.25 * Math.sin(t * 8) : 1;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = full ? GOLD : '#B9CBE8';
  ctx.fillRect(alignRight ? x - w * g : x0, y, w * g, 10);
  ctx.globalAlpha = 1;
  ctx.font = `700 13px ${UI}`; ctx.textBaseline = 'middle'; ctx.textAlign = alignRight ? 'right' : 'left';
  ctx.fillStyle = full ? GOLD : '#B9CBE8';
  ctx.fillText(full ? '필살기 발동!' : '필살기', alignRight ? x : x0, y + 24);
}

function drawHud(ctx, match, t) {
  const defs = { L: match.used.L.at(-1), R: match.used.R.at(-1) };
  const L = match.world.players.L, R = match.world.players.R;
  // 점수판
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,43,107,.75)';
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(FIELD.W / 2 - 110, 14, 220, 92, 14) : ctx.rect(FIELD.W / 2 - 110, 14, 220, 92); ctx.fill();
  ctx.fillStyle = WHITE; ctx.font = `600 64px ${NUM}`;
  ctx.fillText(`${match.scores.L}  -  ${match.scores.R}`, FIELD.W / 2, 50);
  const tt = Math.max(0, match.clock);
  const mm = Math.floor(tt / 60), ss = Math.floor(tt % 60);
  ctx.fillStyle = match.phase === 'golden' ? GOLD : '#B9CBE8'; ctx.font = `600 34px ${NUM}`;
  ctx.fillText(match.phase === 'golden' ? `골든골 ${mm}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`, FIELD.W / 2, 90);
  // 왼쪽: 이름 번호, 아래 게이지
  ctx.font = `700 26px ${UI}`; ctx.textAlign = 'left'; ctx.fillStyle = WHITE;
  ctx.fillText(defs.L.name, 24, 34);
  const nameW = ctx.measureText(defs.L.name).width;
  ctx.font = `600 32px ${NUM}`; ctx.fillStyle = GOLD; ctx.fillText(String(defs.L.number), 24 + nameW + 12, 36);
  drawGauge(ctx, 24, 56, 200, L.gauge, false, t);
  // 오른쪽: 번호 이름, 아래 게이지 (오른쪽 정렬)
  ctx.font = `700 26px ${UI}`; ctx.textAlign = 'right'; ctx.fillStyle = WHITE;
  ctx.fillText(defs.R.name, FIELD.W - 24, 34);
  const nameWR = ctx.measureText(defs.R.name).width;
  ctx.font = `600 32px ${NUM}`; ctx.fillStyle = '#B9CBE8'; ctx.textAlign = 'right';
  ctx.fillText(String(defs.R.number), FIELD.W - 24 - nameWR - 12, 36);
  drawGauge(ctx, FIELD.W - 24, 56, 200, R.gauge, true, t);
}

function drawSubBoard(ctx, board) {
  const a = Math.min(1, board.t / 0.2);
  ctx.save(); ctx.globalAlpha = a;
  const x = FIELD.W / 2 - 130, y = 280;
  ctx.fillStyle = NAVY; ctx.fillRect(x, y, 130, 110);
  ctx.fillStyle = GOLD; ctx.fillRect(x + 130, y, 130, 110);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = WHITE; ctx.font = `700 18px ${UI}`; ctx.fillText('OUT', x + 65, y + 22);
  ctx.font = `600 70px ${NUM}`; ctx.fillText(String(board.out), x + 65, y + 68);
  ctx.fillStyle = NAVY; ctx.font = `700 18px ${UI}`; ctx.fillText('IN', x + 195, y + 22);
  ctx.font = `600 70px ${NUM}`; ctx.fillText(String(board.in), x + 195, y + 68);
  ctx.restore();
}

// 백그라운드에서 돌아왔을 때의 카운트다운 숫자 (루프가 멈춘 채 그리므로 팝이 아니라 직접 그린다)
export function drawCountdown(ctx, n) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,43,107,.45)'; ctx.fillRect(0, 0, FIELD.W, FIELD.H);
  ctx.font = `600 220px ${NUM}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 14; ctx.strokeStyle = NAVY; ctx.strokeText(String(n), FIELD.W / 2, FIELD.H / 2 - 20);
  ctx.fillStyle = GOLD; ctx.fillText(String(n), FIELD.W / 2, FIELD.H / 2 - 20);
  ctx.font = `700 28px ${UI}`; ctx.fillStyle = WHITE; ctx.fillText('곧 이어집니다', FIELD.W / 2, FIELD.H / 2 + 120);
  ctx.restore();
}

export function drawFrame(ctx, match, imgs, fx, t) {
  const w = match.world, b = w.ball;
  ctx.save();
  ctx.clearRect(0, 0, FIELD.W, FIELD.H);
  if (fx.shake > 0) ctx.translate((Math.random() - .5) * 14 * fx.shake, (Math.random() - .5) * 10 * fx.shake);
  drawStadium(ctx, t);
  drawGoals(ctx);

  // 바닥 표시: 압박 그물, 자석 원, 롱스로인 낙하 그림자
  for (const side of ['L', 'R']) {
    const p = w.players[side];
    if (p.mods.press) {
      ctx.save(); ctx.strokeStyle = 'rgba(0,43,107,.55)'; ctx.lineWidth = 2;
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(p.x - 60 + i * 20, p.y - 10); ctx.lineTo(p.x - 40 + i * 20, p.y + 22); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p.x + 60 - i * 20, p.y - 10); ctx.lineTo(p.x + 40 - i * 20, p.y + 22); ctx.stroke(); }
      ctx.restore();
    }
    if (p.mods.magnet) {
      ctx.save(); ctx.setLineDash([10, 10]); ctx.lineDashOffset = -t * 60; ctx.strokeStyle = 'rgba(255,199,44,.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x + p.facing * 40, p.y - 30, 400, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (p.active && p.active.id === 'longthrow' && p.active.data.phase === 'fly') {
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath(); ctx.ellipse(p.active.data.targetX, FIELD.GROUND - 4, 34, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  // 스프린트 잔상
  for (const g of fx.ghosts) {
    ctx.save(); ctx.globalAlpha = 0.25 * (1 - g.age / g.life);
    drawPlayer(ctx, { ...w.players[g.side], x: g.x, y: g.y, active: null, stun: 0, pinned: false, kickAnim: 0 }, imgs[g.def.number], { kit: wornKit(match.kits[g.side], g.def) });
    ctx.restore();
  }
  // 선수 (공에 가까운 쪽을 위에)
  const order = Math.abs(b.x - w.players.L.x) < Math.abs(b.x - w.players.R.x) ? ['R', 'L'] : ['L', 'R'];
  for (const side of order) { const p = w.players[side]; drawPlayer(ctx, p, imgs[p.def.number], { kit: wornKit(match.kits[side], p.def), t }); }
  // 레이저 빛줄기
  if (b.flight === 'laser') {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const grad = ctx.createLinearGradient(b.x, b.y, b.x - b.vx / sp * 220, b.y - b.vy / sp * 220);
    grad.addColorStop(0, 'rgba(255,199,44,.95)'); grad.addColorStop(1, 'rgba(255,199,44,0)');
    ctx.save(); ctx.strokeStyle = grad; ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx / sp * 220, b.y - b.vy / sp * 220); ctx.stroke(); ctx.restore();
  }
  for (let i = 0; i < fx.trail.length; i += 3) {   // 커브 궤적
    const q = fx.trail[i];
    ctx.save(); ctx.globalAlpha = 0.6 * (1 - q.age / q.life); ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  drawBall(ctx, b, fx.ballRot);
  // 증기·잔디 입자
  for (const q of fx.particles) {
    ctx.save(); ctx.globalAlpha = 0.8 * (1 - q.age / q.life); ctx.fillStyle = q.color || '#FFFFFF';
    ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  drawPosts(ctx);
  drawHud(ctx, match, t);
  if (fx.subBoard) drawSubBoard(ctx, fx.subBoard);
  // 글자 팝
  for (const p of fx.pops) {
    const k = p.age / p.life, a = k < 0.15 ? k / 0.15 : k > 0.7 ? (1 - k) / 0.3 : 1;
    const scale = 0.8 + 0.2 * Math.min(1, k / 0.15);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y - p.rise * k); ctx.scale(scale, scale);
    ctx.font = `800 ${p.size}px ${/^[A-Z!]+$/.test(p.text) ? NUM : UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, p.size / 10); ctx.strokeStyle = 'rgba(0,43,107,.9)'; ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0); ctx.restore();
  }
  ctx.restore();
}

export { footPoint, PHYS };
