// 한 프레임을 그린다: 경기장 → 필살기 바닥 표시 → 그림자 → 선수 → 공 → 효과 → HUD → 필살기 컷인 → 글자 팝.
// 연출: 발밑 그림자, 남색 유리판 HUD(이름표·점수판), 골 플래시·관중석 카메라 플래시·튀는 조각,
// 필살기 컷인 띠, 빠른 공 잔상·착지 먼지·맞는 순간 고리. 화면은 fx.view(ui/orientation.js: 좌우 여백 bleedX, 화면 위·아래 끝 top·bottom)에 맞춰 채운다:
// 위가 잘린 화면(top > 0)에서는 HUD 가 화면 맨 위로 내려오고, 가운데 글자·컷인도 조금 내려오며(drop), 화면 위로 나간 공은 화살표로 알린다.
import { FIELD, PHYS } from '../sim/constants.js';
import { headCenter, footPoint } from '../sim/physics.js';
import { drawStadium, drawGoals, drawPosts, drawCrowdFlashes, DEFAULT_VIEW, TOUCHLINE_Y } from './stadium.js';
import { drawPlayer, drawBall, drawShadow, drawPlayerShadow, trainChimney } from './characters.js';
import { wornKit } from '../data/kits.js';
import { SLIP_SPECIALS } from '../sim/specials.js';
import { byNumber } from '../data/players.js';
import { startParty, updateParty, partyView, drawParty } from './party.js';
import { sfx, eventSound } from '../sound.js';

const GOLD = '#FFC72C', WHITE = '#FFFFFF', NAVY = '#002B6B', MUTED = '#B9CBE8', GLASS = 'rgba(0,27,77,.78)', FIRE = '#FF7A1A';
const UI = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const NUM = 'Teko, "Arial Narrow", sans-serif';
const FLASH = 0.22;                    // 골 플래시 길이(초)
const CUT_CENTER_Y = 0.44;             // 컷아웃 그림에서 머리 중심의 세로 위치 (characters.js 와 같은 값)
const drop = view => Math.max(0, view.top) * 0.6;   // 위가 잘린 화면: HUD 가 내려온 만큼(top) 그 아래 가운데 글자·컷인·교체 보드도 조금 내린다
const other = side => (side === 'L' ? 'R' : 'L');

// 가운데 글자(GOAL·KICK OFF·골든골·교체 보드)를 내리는 양. 촬영용 화면 ?shoot=top(view.topBox)에서는 위 가운데가 두 선수 자리라, 점수 받침대 밑으로 더 내린다
const popDrop = view => drop(view) + (view.topBox ? view.topBox.bar.y + view.topBox.bar.h - 158 : 0);

export function createFx() {
  return { particles: [], pops: [], shake: 0, ballRot: 0, lastBallX: null, subBoard: null, ghosts: [], trail: [], party: null,
    view: DEFAULT_VIEW, flash: 0, crowd: 0, cutin: null, rings: [], sparks: [], streak: [], flames: [], air: { L: 0, R: 0 }, tick: 0, net: null };
}

function pop(fx, text, x, y, { size = 48, color = GOLD, life = 0.8, rise = 40, glow = false, plate = false } = {}) {
  fx.pops.push({ text, x, y, size, color, life, age: 0, rise, glow, plate });
}

// 경기 이벤트를 연출로 바꾼다
export function pushEvents(fx, events, match) {
  const w = match.world, b = w.ball, d = popDrop(fx.view);
  for (const e of events) {
    const snd = eventSound(e, match); if (snd) sfx(snd);
    switch (e.type) {
      case 'touch':
        if (e.perfect) pop(fx, 'PERFECT', b.x, b.y - 60, { size: 40, color: WHITE, life: 0.7 });
        if (e.part !== 'body') fx.rings.push({ x: b.x, y: b.y, age: 0, life: 0.2, r: e.perfect ? 66 : 40, color: e.perfect ? GOLD : WHITE });   // 맞는 순간 퍼지는 고리
        fx.cannonball = null;   // 누가 건드리면 대포알은 다시 축구공
        if (e.part === 'head') {
          const a = w.players[e.side]?.active;
          if (a && a.id === 'cannon') {   // 대포 헤딩: 폭발 고리·연기·흔들림, 공은 도화선이 타는 대포알이 되어 날아간다
            fx.rings.push({ x: b.x, y: b.y, age: 0, life: 0.32, r: 112, color: FIRE }, { x: b.x, y: b.y, age: 0, life: 0.2, r: 70, color: GOLD });
            for (let i = 0; i < 10; i++) fx.particles.push({ x: b.x, y: b.y, vx: (Math.random() - .5) * 260, vy: -60 - Math.random() * 160, r: 8 + Math.random() * 8, life: 0.6, age: 0, color: 'rgba(95,95,100,.7)' });
            fx.shake = Math.max(fx.shake, 0.2); fx.cannonball = { t: 0 };
          } else if (a && a.id === 'highjump') {   // 제공권 장악: 2배 헤딩이 꽂히는 순간 큰 금색 고리와 조각
            fx.rings.push({ x: b.x, y: b.y, age: 0, life: 0.3, r: 100, color: GOLD });
            for (let i = 0; i < 8; i++) fx.sparks.push({ x: b.x, y: b.y, vx: (Math.random() - .5) * 420, vy: -120 - Math.random() * 360, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 14, color: i % 2 ? GOLD : WHITE, age: 0, life: 0.45 });
          }
        }
        break;
      case 'goal': {
        const name = byNumber(match.used[e.scorer].at(-1).number).name;
        pop(fx, 'GOAL', FIELD.W / 2, 236 + d, { size: 150, color: GOLD, life: 1.2, rise: 16, glow: true });
        pop(fx, name, FIELD.W / 2, 338 + d, { size: 34, color: WHITE, life: 1.2, rise: 16, plate: true });   // 관중석 흰 글자와 겹치지 않게 남색 판 위에
        fx.shake = 0.35; fx.flash = FLASH; fx.crowd = 1.5; fx.cannonball = null;
        fx.net = { side: other(e.scorer), age: 0, life: 0.7 };   // 공이 꽂힌 골문의 그물이 출렁인다
        const gx = e.scorer === 'L' ? FIELD.W - 50 : 50, dir = e.scorer === 'L' ? -1 : 1;   // 골문에서 금·흰 조각이 튄다
        for (let i = 0; i < 34; i++) fx.sparks.push({ x: gx, y: FIELD.GROUND - 50 - Math.random() * 130, vx: dir * (120 + Math.random() * 520), vy: -260 - Math.random() * 520,
          rot: Math.random() * 6.28, vr: (Math.random() - .5) * 14, color: [GOLD, WHITE, '#6FA6F0'][i % 3], age: 0, life: 0.9 + Math.random() * 0.5 });
        break;
      }
      case 'shot':   // 커브 슛이 발을 떠나는 순간: 금색·흰색 충격 고리, 뒤로 튀는 조각, 살짝 흔들림. 소리는 eventSound 의 'curve'
        if (e.flight === 'curve') {
          fx.rings.push({ x: b.x, y: b.y, age: 0, life: 0.34, r: 124, color: GOLD }, { x: b.x, y: b.y, age: 0, life: 0.22, r: 76, color: WHITE });
          const back = e.side === 'L' ? -1 : 1;
          for (let i = 0; i < 14; i++) fx.sparks.push({ x: b.x, y: b.y, vx: back * (60 + Math.random() * 420), vy: -80 - Math.random() * 480,
            rot: Math.random() * 6.28, vr: (Math.random() - .5) * 16, color: i % 2 ? GOLD : WHITE, age: 0, life: 0.45 + Math.random() * 0.3 });
          fx.shake = Math.max(fx.shake, 0.15);
        }
        break;
      case 'special': {
        fx.cutin = { side: e.side, def: w.players[e.side].def, age: 0, life: 1.1 };   // 얼굴과 필살기 이름이 옆에서 미끄러져 들어오는 띠
        if (e.id === 'giant') fx.shake = 0.3;
        if (e.id === 'offside') pop(fx, 'OFFSIDE', w.players[other(e.side)].x, 296, { size: 50, color: GOLD, life: 1.1, rise: 14 });   // 깃발(drawOffside) 위에 뜬다
        break;
      }
      case 'catch': pop(fx, 'CATCH', headCenter(w.players[e.side]).x, 380, { size: 40, color: WHITE }); fx.rings.push({ x: b.x, y: b.y, age: 0, life: 0.25, r: 58, color: WHITE }); break;   // 장갑에 꽂히는 순간
      case 'knockdown': case 'knockback': { const h = headCenter(w.players[e.side]); pop(fx, '!', h.x, h.y - h.r - 20, { size: 56, color: WHITE, life: 0.6 }); break; }
      case 'sub': fx.subBoard = { out: e.out, in: e.in, t: 0.8 }; break;
      case 'phase':
        if (e.phase === 'play' && match.clock >= 59.9) pop(fx, 'KICK OFF', FIELD.W / 2, 300 + d, { size: 104, color: WHITE, life: 0.9, rise: 16, glow: true });
        if (e.phase === 'golden') pop(fx, '골든골!', FIELD.W / 2, 300 + d, { size: 68, color: GOLD, life: 1.2, rise: 16, glow: true });
        if (e.phase === 'over' && match.result !== 'draw') fx.party = startParty(match, fx.view.bleedX, fx.view.top, popDrop(fx.view) - drop(fx.view));   // 이긴 쪽 세레모니 (져도 상대 팀이 한다)
        break;
    }
  }
}

// 입자·팝·잔상 노화. 물리 스텝마다 부른다.
export function updateFx(fx, match, dt) {
  const w = match.world, b = w.ball;
  fx.tick++;
  fx.shake = Math.max(0, fx.shake - dt);
  fx.flash = Math.max(0, fx.flash - dt);
  fx.crowd = Math.max(0, fx.crowd - dt);
  if (fx.cutin) { fx.cutin.age += dt; if (fx.cutin.age >= fx.cutin.life) fx.cutin = null; }
  if (fx.lastBallX !== null) fx.ballRot += (b.x - fx.lastBallX) / b.r;
  fx.lastBallX = b.x;
  for (const p of fx.pops) p.age += dt;
  fx.pops = fx.pops.filter(p => p.age < p.life);
  if (fx.subBoard) { fx.subBoard.t -= dt; if (fx.subBoard.t <= 0) fx.subBoard = null; }
  if (fx.party) updateParty(fx.party, match, dt);
  for (const side of ['L', 'R']) {
    const p = w.players[side];
    // 착지 먼지: 0.25초 넘게 떠 있다가 내려오면 발밑에 살짝
    if (p.onGround && fx.air[side] > 0.25) for (let i = 0; i < 5; i++) fx.particles.push({ x: p.x + (Math.random() - .5) * 50, y: FIELD.GROUND - 2, vx: (Math.random() - .5) * 150, vy: -30 - Math.random() * 50, r: 3 + Math.random() * 3, life: 0.35, age: 0, color: 'rgba(236,242,226,.85)' });
    fx.air[side] = p.onGround ? 0 : fx.air[side] + dt;
    if (!p.active) continue;
    if (p.active.id === 'train') {   // 굴뚝 연기: 돌진 중엔 뭉게뭉게 뒤로 흩날리고, 바퀴 옆으로 증기를 뿜는다
      const c = trainChimney(p), charging = p.active.data.charging;
      if (charging || Math.random() < 0.5) fx.particles.push({ x: c.x + (Math.random() - .5) * 8, y: c.y, vx: (charging ? -p.facing * 90 : -p.facing * 15) + (Math.random() - .5) * 40, vy: (charging ? -200 : -110) - Math.random() * 70, r: (charging ? 8 : 5) + Math.random() * 6, life: charging ? 0.9 : 0.8, age: 0, back: true });
      if (charging && Math.random() < 0.6) fx.particles.push({ x: p.x + p.facing * 30 * p.scale, y: FIELD.GROUND - 14, vx: -p.facing * (80 + Math.random() * 80), vy: -20 - Math.random() * 30, r: 5 + Math.random() * 4, life: 0.4, age: 0 });
    }
    if (p.active.id === 'sprint') {
      fx.ghostTick = (fx.ghostTick || 0) + 1; if (fx.ghostTick % 8 === 0) fx.ghosts.push({ x: p.x, y: p.y, scale: p.scale, facing: p.facing, def: p.def, age: 0, life: 0.3, side });
      const run = Math.sign(p.vx);   // 빠르게 달리면 발 뒤로 흙먼지
      if (p.onGround && Math.abs(p.vx) > 300 && Math.random() < 0.7) fx.particles.push({ x: p.x - run * 22, y: FIELD.GROUND - 4, vx: -run * (60 + Math.random() * 100), vy: -30 - Math.random() * 50, r: 3 + Math.random() * 4, life: 0.35, age: 0, color: 'rgba(220,210,180,.85)' });
    }
    if (p.active.id === 'spirit') spawnFlames(fx, p, side, dt);
    if (p.active.id === 'spirit' && Math.random() < (Math.abs(p.vx) > 100 ? 0.5 : 0.25)) {   // 투지 폭발: 불길 위로 튀는 불씨
      fx.particles.push({ x: p.x + (Math.random() - .5) * 60 * p.scale, y: p.y - 10 - Math.random() * 70, vx: -Math.sign(p.vx) * 40 + (Math.random() - .5) * 40, vy: -120 - Math.random() * 90, r: 2 + Math.random() * 2.5, life: 0.5, age: 0, color: Math.random() < 0.5 ? FIRE : GOLD });
    }
    // 높이뛰기: 땅을 박차는 순간 발밑 먼지
    if (p.active.id === 'highjump' && !p.onGround && p.vy < -600 && Math.random() < 0.6) {
      fx.particles.push({ x: p.x + (Math.random() - .5) * 40, y: FIELD.GROUND - 4, vx: (Math.random() - .5) * 120, vy: -40 - Math.random() * 60, r: 4 + Math.random() * 4, life: 0.5, age: 0, color: 'rgba(220,210,180,.9)' });
    }
  }
  // 커브 슛: 지나온 자리(그릴 때 굵은 금색 혜성 꼬리가 된다)와 흩날리는 금가루
  if (b.flight === 'curve') {
    fx.trail.push({ x: b.x, y: b.y, age: 0, life: 0.5 });
    if (fx.tick % 3 === 0) fx.particles.push({ x: b.x + (Math.random() - .5) * 26, y: b.y + (Math.random() - .5) * 26, vx: (Math.random() - .5) * 90, vy: 30 + Math.random() * 80, r: 2 + Math.random() * 2.5, life: 0.4, age: 0, color: GOLD });
  }
  if (fx.cannonball) {   // 대포알: 땅에 닿거나 2.5초가 지나면 축구공으로. 날아가는 동안 도화선 끝에서 불티가 튄다
    fx.cannonball.t += dt;
    if (fx.cannonball.t > 2.5 || b.y >= FIELD.GROUND - b.r - 1 || b.held) fx.cannonball = null;
    else {
      const f = fuseTip(b);
      for (let i = 0; i < 2; i++) fx.particles.push({ x: f.x, y: f.y, vx: (Math.random() - .5) * 160, vy: -40 - Math.random() * 120, r: 1.5 + Math.random() * 2, life: 0.25, age: 0, color: Math.random() < 0.5 ? GOLD : FIRE });
    }
  }
  if (fx.net) { fx.net.age += dt; if (fx.net.age >= fx.net.life) fx.net = null; }
  for (const q of fx.trail) q.age += dt;
  fx.trail = fx.trail.filter(q => q.age < q.life);
  // 빠른 공 잔상
  if (fx.tick % 2 === 0 && !b.held && Math.hypot(b.vx, b.vy) > 950) fx.streak.push({ x: b.x, y: b.y, age: 0, life: 0.16 });
  for (const q of fx.streak) q.age += dt;
  fx.streak = fx.streak.filter(q => q.age < q.life);
  for (const q of fx.rings) q.age += dt;
  fx.rings = fx.rings.filter(q => q.age < q.life);
  for (const q of fx.sparks) { q.age += dt; q.vy += 1500 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt; }
  fx.sparks = fx.sparks.filter(q => q.age < q.life && q.y < FIELD.GROUND + 6);
  for (const q of fx.particles) { q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.r += 8 * dt; }
  fx.particles = fx.particles.filter(q => q.age < q.life);
  updateFlames(fx, dt);
  for (const g of fx.ghosts) g.age += dt;
  fx.ghosts = fx.ghosts.filter(g => g.age < g.life);
  if (fx.reduceMotion) {   // 움직임 줄이기(윈도우 애니메이션 끔 등): 화면 전체가 흔들리고 번쩍이는 것만 뺀다. 필살기 연출은 어느 기기에서나 같게 보인다
    fx.shake = 0; fx.flash = 0; fx.crowd = 0;
  }
}

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }

// 이름표: 남색 유리판에 번호·이름, 오른쪽 끝에 필살기 이름, 아래에 게이지. 바깥쪽 모서리는 입은 유니폼 색. side 'R' 은 좌우 대칭.
const PLATE_W = 304, PLATE_H = 78;
function drawNamePlate(ctx, side, def, player, kit, t) {
  const right = side === 'R', x = right ? FIELD.W - 14 - PLATE_W : 14, y = 12;
  rr(ctx, x, y, PLATE_W, PLATE_H, 16); ctx.fillStyle = GLASS; ctx.fill();
  ctx.save(); rr(ctx, x, y, PLATE_W, PLATE_H, 16); ctx.clip();
  ctx.fillStyle = kit.jersey; ctx.fillRect(right ? x + PLATE_W - 9 : x, y, 9, PLATE_H);
  ctx.fillStyle = kit.trim; ctx.fillRect(right ? x + PLATE_W - 12 : x + 9, y, 3, PLATE_H);
  ctx.restore();
  const g = Math.min(1, player.gauge / 100), hot = g >= 1 || !!player.active;   // 다 찼거나 발동 중
  const inL = x + (right ? 16 : 24), inR = x + PLATE_W - (right ? 24 : 16);    // 안쪽 글자 영역
  ctx.textBaseline = 'middle';
  const num = String(def.number);
  ctx.font = `600 42px ${NUM}`; const nw = ctx.measureText(num).width;
  ctx.fillStyle = right ? MUTED : GOLD; ctx.textAlign = right ? 'right' : 'left';
  ctx.fillText(num, right ? inR : inL, y + 31);
  ctx.font = `800 24px ${UI}`; ctx.fillStyle = WHITE;
  ctx.fillText(def.name, right ? inR - nw - 10 : inL + nw + 10, y + 28);
  ctx.font = `700 15px ${UI}`; ctx.fillStyle = hot ? GOLD : MUTED; ctx.textAlign = right ? 'left' : 'right';
  ctx.fillText(def.special.name, right ? inL : inR, y + 29);
  // 게이지
  const gx = inL, gw = inR - inL, gy = y + 52, gh = 11;
  rr(ctx, gx, gy, gw, gh, gh / 2); ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fill();
  if (g > 0.02) {
    ctx.save(); rr(ctx, gx, gy, gw, gh, gh / 2); ctx.clip();
    ctx.globalAlpha = g >= 1 ? 0.78 + 0.22 * Math.sin(t * 8) : 1;
    ctx.fillStyle = g >= 1 ? GOLD : '#A9C6F2';
    ctx.fillRect(right ? gx + gw * (1 - g) : gx, gy, gw * g, gh);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(0,27,77,.55)';
  for (const q of [0.25, 0.5, 0.75]) ctx.fillRect(gx + gw * q - 1, gy, 2, gh);   // 눈금
}

// still: 움직임 줄이기(시계가 튀지 않는다)
function drawScoreboard(ctx, match, still) {
  const cx = FIELD.W / 2, x = cx - 118, y = 10, w = 236, h = 98;
  rr(ctx, x, y, w, h, 18); ctx.fillStyle = GLASS; ctx.fill();
  for (const [side, bx] of [['L', x + 12], ['R', x + w - 20]]) {   // 양 끝에 유니폼 색: 어느 점수가 누구 것인지
    const kit = wornKit(match.kits[side], match.used[side].at(-1));
    rr(ctx, bx, y + 18, 8, 42, 4); ctx.fillStyle = kit.jersey; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = WHITE; ctx.font = `600 66px ${NUM}`;
  ctx.fillText(String(match.scores.L), cx - 52, y + 43);
  ctx.fillText(String(match.scores.R), cx + 52, y + 43);
  ctx.fillStyle = 'rgba(185,203,232,.7)'; ctx.fillRect(cx - 9, y + 36, 18, 5);
  drawClock(ctx, match, still, cx, y + 81);
}

// 남은 시간(가운데 cx, 글자 가운데 높이 y). 골든골이면 꼬리표가 붙는다
function drawClock(ctx, match, still, cx, y) {
  const tt = Math.max(0, match.clock), clock = `${Math.floor(tt / 60)}:${String(Math.floor(tt % 60)).padStart(2, '0')}`;
  ctx.textBaseline = 'middle';
  if (match.phase === 'golden') {
    ctx.fillStyle = GOLD;
    ctx.font = `800 17px ${UI}`; ctx.textAlign = 'right'; ctx.fillText('골든골', cx - 4, y - 2);
    ctx.font = `600 32px ${NUM}`; ctx.textAlign = 'left'; ctx.fillText(clock, cx + 6, y);
  } else {
    // 마지막 10초: 시계가 금색이 되고 초가 바뀔 때마다 살짝 튄다
    const urgent = tt <= 10 && match.phase !== 'over', k = urgent && !still && match.phase === 'play' ? 1 + 0.18 * (tt % 1) ** 2 : 1;
    ctx.fillStyle = urgent ? GOLD : MUTED; ctx.font = `600 32px ${NUM}`; ctx.textAlign = 'center';
    ctx.save(); ctx.translate(cx, y); ctx.scale(k, k); ctx.fillText(clock, 0, 0); ctx.restore();
  }
}

// 촬영용 화면 ?shoot=top: 위 가운데는 편집 때 두 선수(배경을 뺀 영상)가 들어갈 자리라, 점수판을 그 밑에 까는 낮고 긴 받침대로 그린다.
// 선수 영상의 잘린 가슴 선을 받침대 위 금색 선에 맞추면 점수판 뒤에 앉은 것처럼 보인다. 양 끝에 유니폼 색과 점수, 가운데에 남은 시간
function drawScoreBar(ctx, match, still, bar) {
  const { x, y, w, h } = bar, my = y + h / 2 + 3;
  rr(ctx, x, y, w, h, 14); ctx.fillStyle = 'rgba(0,27,77,.62)'; ctx.fill();   // 비쳐 보이게: 받침대 높이(논리 y 270~314)는 뛰어오른 선수 머리가 23%, 공이 10% 있는 자리다(모의 132판)
  ctx.fillStyle = GOLD; ctx.fillRect(x + 14, y, w - 28, 3);
  ctx.textBaseline = 'middle';
  for (const [side, edge, dir] of [['L', x + 16, 1], ['R', x + w - 16, -1]]) {
    const kit = wornKit(match.kits[side], match.used[side].at(-1));
    rr(ctx, dir > 0 ? edge : edge - 8, y + 10, 8, h - 18, 4); ctx.fillStyle = kit.jersey; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
    ctx.fillStyle = WHITE; ctx.font = `600 46px ${NUM}`; ctx.textAlign = dir > 0 ? 'left' : 'right';
    ctx.fillText(String(match.scores[side]), edge + dir * 22, my);
  }
  drawClock(ctx, match, still, x + w / 2, my);
}

// HUD 는 늘 화면 맨 위: 위 여백이 있으면 그만큼 올리고(top < 0), 위가 잘렸으면 그만큼 내린다(top > 0). 점수판 옆 DOM 버튼도 화면 맨 위 기준이다 (css .sub)
function drawHud(ctx, match, t, view, still) {
  ctx.save(); ctx.translate(0, view.top);
  for (const side of ['L', 'R']) {
    const def = match.used[side].at(-1);
    drawNamePlate(ctx, side, def, match.world.players[side], wornKit(match.kits[side], def), t);
  }
  if (view.topBox) drawScoreBar(ctx, match, still, view.topBox.bar); else drawScoreboard(ctx, match, still);
  ctx.restore();
}

function drawSubBoard(ctx, board, view) {
  const a = Math.min(1, board.t / 0.2);
  ctx.save(); ctx.globalAlpha = a;
  const x = FIELD.W / 2 - 130, y = 280 + popDrop(view);
  ctx.save(); rr(ctx, x, y, 260, 110, 14); ctx.clip();
  ctx.fillStyle = NAVY; ctx.fillRect(x, y, 130, 110);
  ctx.fillStyle = GOLD; ctx.fillRect(x + 130, y, 130, 110);
  ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = WHITE; ctx.font = `700 18px ${UI}`; ctx.fillText('OUT', x + 65, y + 22);
  ctx.font = `600 70px ${NUM}`; ctx.fillText(String(board.out), x + 65, y + 68);
  ctx.fillStyle = NAVY; ctx.font = `700 18px ${UI}`; ctx.fillText('IN', x + 195, y + 22);
  ctx.font = `600 70px ${NUM}`; ctx.fillText(String(board.in), x + 195, y + 68);
  ctx.restore();
}

// 화면 위로 나간 공: 금색 화살표와 작은 공으로 어디쯤 떠 있는지 알려 준다 (발밑 그림자는 그대로 떨어질 자리를 보여 준다).
// 화면 맨 위가 아니라 HUD 띠 바로 아래에 그린다: 맨 위는 이름표·점수판과 그 옆 DOM 버튼(메뉴·교체)이 덮는다
function drawBallMarker(ctx, x, top) {
  const y = top + 114;   // 점수판 아래 끝(108) 밑
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = NAVY;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18, y + 20); ctx.lineTo(x - 18, y + 20); ctx.closePath(); ctx.stroke(); ctx.fillStyle = GOLD; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y + 36, 10, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = WHITE; ctx.fill();
  ctx.restore();
}

// 오프사이드 트랩에 걸린 선수(p): 발밑을 지나는 금색 판정선(먼 터치라인에서 화면 아래까지)과, 그 선 끝 터치라인에 서서 깃발을 번쩍 든 부심.
// 선수보다 먼저 그려서 부심은 큰 머리 뒤로 어깨와 깃발만 솟는다. age: 걸린 뒤 지난 초(깃발 든 팔이 0.16초에 올라간다), still: 움직임 줄이기(팔은 처음부터 위, 깃발이 펄럭이지 않는다)
// 깃발은 부심 깃발 그대로 금색·빨강 네 칸: 빨강은 관중석 띠와 이 깃발에만 쓴다.
const REF = { skin: '#F2C9A4', hair: '#2A211C', shirt: '#F3E13A', dark: '#15181D', line: '#0F2452', red: '#D03B46', stick: '#F4F7FA' };
function drawOffside(ctx, p, age, t, view, still) {
  const x = p.x, ty = TOUCHLINE_Y, d = x < FIELD.W / 2 ? 1 : -1;   // d: 깃발 천이 날리는 쪽(화면 안쪽)
  const up = still ? 1 : 1 - Math.pow(1 - Math.min(1, age / 0.16), 3), wave = still ? 0 : Math.sin(t * 13) * 3;
  const limb = (x0, y0, x1, y1, w, color) => {   // 진한 테두리를 두른 굵은 선
    ctx.lineCap = 'round';
    ctx.strokeStyle = REF.line; ctx.lineWidth = w + 5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  };
  const outline = () => { ctx.lineWidth = 2.5; ctx.strokeStyle = REF.line; ctx.stroke(); };
  ctx.save(); ctx.globalAlpha = Math.min(1, age / 0.08, p.frozen / 0.15); ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(255,199,44,.22)'; ctx.fillRect(x - 13, ty, 26, view.bottom + 20 - ty);   // 판정선: 옅은 띠 + 가운데 선
  ctx.fillStyle = GOLD; ctx.fillRect(x - 2, ty, 4, view.bottom + 20 - ty);
  limb(x - 6, ty - 26, x - 6, ty - 5, 7, REF.dark); limb(x + 6, ty - 26, x + 6, ty - 5, 7, REF.dark);   // 다리
  rr(ctx, x - 14, ty - 44, 28, 20, 6); ctx.fillStyle = REF.dark; ctx.fill(); outline();                    // 반바지
  limb(x - d * 15, ty - 76, x - d * 20, ty - 50, 7, REF.shirt);                                            // 내린 팔
  rr(ctx, x - 16, ty - 86, 32, 46, 11); ctx.fillStyle = REF.shirt; ctx.fill(); outline();                  // 윗옷
  ctx.beginPath(); ctx.arc(x, ty - 101, 15, 0, Math.PI * 2); ctx.fillStyle = REF.skin; ctx.fill(); outline();   // 머리
  ctx.beginPath(); ctx.arc(x, ty - 103, 15, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fillStyle = REF.hair; ctx.fill();
  // 깃발 든 팔: 어깨를 축으로 옆(110°)에서 머리 위(0°)로 올라간다. 팔 30 + 깃대 46, 깃대 끝에 30×22 깃발
  ctx.translate(x + d * 14, ty - 76); ctx.rotate(d * (1 - up) * 1.9);
  limb(0, -30, 0, -76, 3, REF.stick);
  ctx.save(); ctx.transform(1, d * wave / 30, 0, 1, 0, 0);
  for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { ctx.fillStyle = (i + j) % 2 ? REF.red : GOLD; ctx.fillRect(d * i * 15, -76 + j * 11, d * 15, 11); }
  ctx.beginPath(); ctx.rect(0, -76, d * 30, 22); outline();
  ctx.restore();
  limb(0, 0, 0, -30, 7, REF.shirt);
  ctx.beginPath(); ctx.arc(0, -31, 5, 0, Math.PI * 2); ctx.fillStyle = REF.skin; ctx.fill(); outline();
  ctx.restore();
}

// 필살기 컷인: 발동한 선수 쪽 화면 끝에서 남색 띠가 미끄러져 들어온다. 얼굴 컷아웃 + "필살기" 꼬리표 + 이름 + 필살기 이름.
// 컷인 띠가 놓이는 자리(논리 px). 촬영용 화면에서 선수 창을 이름표 밑 양쪽에 얹는 배치(view.cutin = ui/orientation.js SHOOT_CAMS)면 띠를 그만큼 안쪽(dx)·아래(dy)로 옮긴다.
// 두 선수를 위 가운데에 두는 배치(view.topBox)면 띠를 그 자리 앞에서 끊고 얼굴을 줄인다: 필살기 이름은 남는 폭(maxText)에 맞춰 drawCutin 이 줄여 쓴다
export function cutinPlace(view, side) {
  const right = side === 'R', dx = (view.cutin && view.cutin.dx) || 0, dy = (view.cutin && view.cutin.dy) || 0, box = view.topBox;
  const at = x => right ? FIELD.W - x - dx : x + dx, end = box ? box.x - 44 : 650;   // 띠 윗변은 아랫변보다 36 더 나간다: 그 끝이 선수 자리 8px 앞에서 멈추게
  return { right, y: 140 + drop(view) + dy, len: end + dx, inner: at(end), faceX: at(box ? 82 : 104), tx: at(box ? 152 : 196), size: box ? 124 : 156, maxText: box ? end - 8 - 152 : Infinity,
    outer: right ? FIELD.W + view.bleedX + 30 : -view.bleedX - 30 };
}
function drawCutin(ctx, c, imgs, view, still) {
  const { right, y, len, inner, faceX, tx, size, maxText, outer } = cutinPlace(view, c.side), H = 104;
  const tin = still ? 1 : Math.min(1, c.age / 0.16), ease = 1 - Math.pow(1 - tin, 3), out = Math.max(0, (c.age - (c.life - 0.2)) / 0.2);
  const d = right ? 1 : -1;   // 바깥쪽 방향
  ctx.save();
  ctx.globalAlpha = 1 - out;
  ctx.translate(d * (1 - ease) * (len + view.bleedX + 60), 0);
  const shape = () => { ctx.beginPath(); ctx.moveTo(outer, y); ctx.lineTo(inner - d * 36, y); ctx.lineTo(inner, y + H); ctx.lineTo(outer, y + H); ctx.closePath(); };
  const grad = ctx.createLinearGradient(right ? FIELD.W : 0, 0, inner, 0);
  grad.addColorStop(0, 'rgba(0,22,66,.96)'); grad.addColorStop(1, 'rgba(0,64,152,.9)');
  shape(); ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(outer, y + 2.5); ctx.lineTo(inner - d * 35, y + 2.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(outer, y + H - 2.5); ctx.lineTo(inner - d * 1, y + H - 2.5); ctx.stroke();
  const art = imgs[c.def.number];
  if (art && art.cut) {   // 머리카락은 띠 위로 조금 솟는다
    ctx.save();
    if (right) { ctx.translate(faceX * 2, 0); ctx.scale(-1, 1); }
    ctx.drawImage(art.cut, faceX - size / 2, y + H / 2 + 6 - size * CUT_CENTER_Y, size, size);
    ctx.restore();
  }
  ctx.textBaseline = 'middle'; ctx.textAlign = right ? 'right' : 'left';
  ctx.font = `800 14px ${UI}`; const tagW = ctx.measureText('필살기').width + 20;
  rr(ctx, right ? tx - tagW : tx, y + 17, tagW, 24, 12); ctx.fillStyle = GOLD; ctx.fill();
  ctx.fillStyle = NAVY; ctx.textAlign = 'center'; ctx.fillText('필살기', right ? tx - tagW / 2 : tx + tagW / 2, y + 30);
  ctx.textAlign = right ? 'right' : 'left';
  ctx.font = `700 19px ${UI}`; ctx.fillStyle = MUTED; ctx.fillText(c.def.name, right ? tx - tagW - 10 : tx + tagW + 10, y + 30);
  ctx.font = `900 46px ${UI}`; const nameW = ctx.measureText(c.def.special.name).width;
  if (nameW > maxText) ctx.font = `900 ${Math.max(24, Math.floor(46 * maxText / nameW))}px ${UI}`;   // 좁은 띠(?shoot=top): 긴 필살기 이름은 줄여 쓴다
  ctx.fillStyle = WHITE; ctx.fillText(c.def.special.name, tx, y + 73);
  ctx.restore();
}

// 보이는 화면 전체(여백 포함)를 지금 fillStyle 로 덮는다
const fillScreen = (ctx, view) => ctx.fillRect(-view.bleedX - 30, view.top - 30, FIELD.W + 2 * view.bleedX + 60, view.bottom - view.top + 60);

// 백그라운드에서 돌아왔을 때의 카운트다운 숫자 (루프가 멈춘 채 그리므로 팝이 아니라 직접 그린다)
export function drawCountdown(ctx, n, view = DEFAULT_VIEW) {
  ctx.save();
  const cy = (view.top + view.bottom) / 2;   // 보이는 화면의 한가운데
  ctx.fillStyle = 'rgba(0,43,107,.45)'; fillScreen(ctx, view);
  ctx.font = `600 220px ${NUM}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 14; ctx.strokeStyle = NAVY; ctx.strokeText(String(n), FIELD.W / 2, cy - 20);
  ctx.fillStyle = GOLD; ctx.fillText(String(n), FIELD.W / 2, cy - 20);
  ctx.font = `700 28px ${UI}`; ctx.fillStyle = WHITE; ctx.fillText('곧 이어집니다', FIELD.W / 2, cy + 120);
  ctx.restore();
}

// 경기가 없을 때(첫 화면·선택 화면 뒤)의 배경: 빈 경기장
export function drawBackdrop(ctx, view = DEFAULT_VIEW, t = 0) {
  ctx.save();
  drawStadium(ctx, t, view);
  drawGoals(ctx);
  drawPosts(ctx);
  ctx.restore();
}

// 대포알: 날아가는 반대쪽(꽁무니)으로 도화선이 나와 있다. fuseTip 은 그 끝(불티가 나오는 자리)
function fuseTip(b) {
  const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
  return { x: b.x - ux * (b.r + 18), y: b.y - uy * (b.r + 18) - 8, ux, uy };
}
function drawCannonball(ctx, b, t) {
  const r = b.r, f = fuseTip(b);
  ctx.save();
  ctx.strokeStyle = '#D9B27A'; ctx.lineWidth = 4; ctx.lineCap = 'round';   // 도화선
  ctx.beginPath(); ctx.moveTo(b.x - f.ux * r * 0.85, b.y - f.uy * r * 0.85); ctx.quadraticCurveTo(b.x - f.ux * (r + 6) + 5, b.y - f.uy * (r + 6) - 8, f.x, f.y); ctx.stroke();
  const g = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, r * 0.1, b.x, b.y, r);
  g.addColorStop(0, '#9AA0AA'); g.addColorStop(0.45, '#40454E'); g.addColorStop(1, '#101215');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(b.x - r * 0.38, b.y - r * 0.42, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2); ctx.fill();
  const k = 0.75 + 0.25 * Math.sin(t * 40);   // 도화선 끝 불꽃: 반짝이는 네 갈래 별
  ctx.translate(f.x, f.y); ctx.fillStyle = GOLD; ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = (i % 2 ? 4 : 12) * k; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 투지 폭발 불꽃: 몸 윤곽(타원)에서 작은 불덩이가 계속 피어올라 노랑 → 주황 → 빨강으로 식으며 작아지고 사라진다.
// 불덩이 하나는 미리 만든 부드러운 원(색마다 한 장)을 늘려 찍는다(그라데이션을 매번 만들지 않게).
const FLAME_RATE = 260;   // 초당 불덩이 수(선수 하나)
function spawnFlames(fx, p, side, dt) {
  const h = headCenter(p), top = h.y - h.r, cy = (top + p.y) / 2, rx = h.r * 0.9, ry = (p.y - top) / 2;
  const acc = fx.flameAcc || (fx.flameAcc = { L: 0, R: 0 });
  acc[side] += FLAME_RATE * dt;
  for (; acc[side] >= 1; acc[side]--) {
    const a = (Math.random() * 2 - 1) * Math.PI * 0.8;          // 발밑(아래 36°)은 빼고 몸 둘레 어디서나
    const x = p.x + Math.sin(a) * rx * (0.75 + Math.random() * 0.2), y = cy - Math.cos(a) * ry * (0.75 + Math.random() * 0.2);
    const size = (12 + Math.random() * 12) * p.scale * (Math.abs(a) < 0.9 ? 1.15 : 0.9);   // 머리 위쪽 불길이 더 크다
    fx.flames.push({ x, y, vx: Math.sin(a) * 45 + (Math.random() - .5) * 30 - p.vx * 0.25, vy: -170 - Math.random() * 110, size, age: 0, life: 0.38 + Math.random() * 0.22, seed: Math.random() * 6.28 });
  }
}
function updateFlames(fx, dt) {
  for (const q of fx.flames) { q.age += dt; q.x += (q.vx + Math.sin(q.age * 18 + q.seed) * 40) * dt; q.y += q.vy * dt; q.vy *= 0.985; }
  fx.flames = fx.flames.filter(q => q.age < q.life);
}
let flameSprites = null;
function sprites() {
  if (flameSprites || typeof document === 'undefined') return flameSprites;
  flameSprites = ['255,245,190', '255,206,60', '255,120,20', '215,40,12'].map(rgb => {   // 흰 빛, 노랑, 주황, 빨강
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.5, `rgba(${rgb},.8)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
  });
  return flameSprites;
}
// 밝은 잔디 위에서는 더해 그리면(lighter) 노랗게 번져 전기처럼 보인다 → 보통으로 겹쳐 그리되 층을 나눈다:
// 식은 불덩이(빨강, 크고 옅게)를 먼저, 주황을 그 위에, 갓 나온 노란 심을 맨 위에 작게. 심만 살짝 더해 그려 빛나게 한다.
function drawFlames(ctx, fx, players, t) {
  const S = sprites(); if (!S || !fx.flames.length) return;
  ctx.save();
  for (const p of players) {   // 몸 뒤 붉은 열기: 불덩이들을 하나로 묶어 준다
    if (!p.active || p.active.id !== 'spirit') continue;
    const h = headCenter(p), top = h.y - h.r, cy = (top + p.y) / 2, k = 0.85 + 0.15 * Math.sin(t * 13);
    ctx.globalAlpha = 0.45 * k; ctx.drawImage(S[3], p.x - h.r * 1.5, cy - (p.y - top) * 0.72, h.r * 3, (p.y - top) * 1.4);
  }
  const layer = (from, to, img, grow, alpha) => {
    for (const q of fx.flames) {
      const u = q.age / q.life; if (u < from || u >= to) continue;
      const s = q.size * grow(u);
      ctx.globalAlpha = alpha(u); ctx.drawImage(S[img], q.x - s, q.y - s * 1.35, s * 2, s * 2.7);   // 위로 길쭉한 불덩이
    }
  };
  layer(0.55, 1, 3, u => 1.25 - 0.6 * u, u => 0.85 * (1 - u) / 0.45);         // 빨강: 꼭대기 쪽, 사라지며 옅어진다
  layer(0.2, 0.75, 2, u => 1.15 - 0.3 * u, () => 0.9);                       // 주황
  layer(0, 0.4, 1, u => 0.7 + 0.5 * u, () => 0.95);                          // 노랑 심
  ctx.globalCompositeOperation = 'lighter';
  layer(0, 0.25, 0, () => 0.45, () => 0.5);                                  // 하얀 빛: 갓 나온 심에만 살짝
  ctx.restore();
}

export function drawFrame(ctx, match, imgs, fx, t) {
  const w = match.world, b = w.ball, view = fx.view || DEFAULT_VIEW;
  ctx.save();
  let dx = 0, dy = 0;
  if (fx.shake > 0) { dx = (Math.random() - .5) * 14 * fx.shake; dy = (Math.random() - .5) * 10 * fx.shake; ctx.translate(dx, dy); }
  drawStadium(ctx, t, view, dx, dy);
  if (fx.crowd > 0) drawCrowdFlashes(ctx, t, Math.min(1, fx.crowd / 0.9), view);
  drawGoals(ctx, fx.net && { side: fx.net.side, k: 1 - fx.net.age / fx.net.life }, t);

  // 바닥 표시: 오프사이드 판정선과 부심, 압박 그물, 자석 원, 롱스로인 낙하 그림자
  for (const side of ['L', 'R']) {
    const p = w.players[side];
    if (p.frozen > 0) { const u = w.players[other(side)]; drawOffside(ctx, p, u.active && u.active.id === 'offside' ? u.def.special.duration - u.active.t : 1, t, view, false); }
    if (p.mods.press) {
      ctx.save(); ctx.strokeStyle = 'rgba(0,43,107,.55)'; ctx.lineWidth = 2;
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(p.x - 60 + i * 20, p.y - 10); ctx.lineTo(p.x - 40 + i * 20, p.y + 22); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p.x + 60 - i * 20, p.y - 10); ctx.lineTo(p.x + 40 - i * 20, p.y + 22); ctx.stroke(); }
      ctx.restore();
    }
    // 몸싸움 미끄러짐 발동 중: 발밑에 도는 금색 점선 고리. 높이뛰기(8초)·투지(5초)는 겉으로 티가 안 나서 평소에도 미끄러지는 줄 알기 쉽다
    if (p.active && SLIP_SPECIALS.includes(p.active.id)) {
      ctx.save(); ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t * 40; ctx.strokeStyle = 'rgba(255,199,44,.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(p.x, FIELD.GROUND - 4, 48 * p.scale, 12 * p.scale, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    // 슛 필살기(레이저·커브)가 장전된 채 기다리는 중: 발밑에 숨 쉬듯 커졌다 작아지는 금색 고리. 지금 슛을 누르거나 공이 몸통 아래쪽에 닿으면 나간다는 표시다.
    // 시간 제한 없이 오래 기다릴 수 있어서 이름표의 금색 필살기 이름만으로는 잘 안 보인다. 미끄러짐 고리(도는 점선)와 달리 굵은 실선.
    if (p.active && p.active.armed) {
      const k = 0.5 + 0.5 * Math.sin(t * 6), rx = (52 + 5 * k) * p.scale, ry = (13 + 1.5 * k) * p.scale;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(p.x, FIELD.GROUND - 4, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,199,44,${0.16 + 0.12 * k})`; ctx.fill();
      ctx.strokeStyle = `rgba(255,199,44,${0.8 + 0.2 * k})`; ctx.lineWidth = 4.5; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(p.x, FIELD.GROUND - 4, rx - 6, ry - 3, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    }
    if (p.mods.magnet) {
      ctx.save(); ctx.setLineDash([10, 10]); ctx.lineDashOffset = -t * 60; ctx.strokeStyle = 'rgba(255,199,44,.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x + p.facing * 40, p.y - 30, 400, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      // 끌어당기는 중(sim/specials.js magnet 과 같은 조건): 공과 발 앞을 잇는 금색 줄, 가까울수록 진하다
      const tx = p.x + (side === 'L' ? 1 : -1) * 40, ty = p.y - 30, dist = Math.hypot(tx - b.x, ty - b.y);
      const mine = b.lastTouch && b.lastTouch.side === side && w.t - b.lastTouch.t < 0.4;
      if (!b.flight && !b.held && !b.attached && !mine && dist < 400) {
        ctx.save(); ctx.setLineDash([14, 8]); ctx.lineDashOffset = t * 90; ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(255,199,44,${0.35 + 0.6 * (1 - dist / 400)})`; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.restore();
      }
    }
    if (p.active && p.active.id === 'sprint' && Math.abs(p.vx) > 300) {   // 스프린트: 몸 뒤로 속도선
      const run = Math.sign(p.vx), h = headCenter(p);
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineCap = 'round'; ctx.lineWidth = 4;
      for (const [y, len] of [[h.y, 70], [p.y - 50, 95], [p.y - 18, 60]]) { ctx.beginPath(); ctx.moveTo(p.x - run * 45, y); ctx.lineTo(p.x - run * (45 + len), y); ctx.stroke(); }
      ctx.restore();
    }
    if (p.active && p.active.id === 'longthrow' && p.active.data.phase === 'fly') {
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath(); ctx.ellipse(p.active.data.targetX, FIELD.GROUND - 4, 34, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  // 그림자: 선수와 공 (세레모니 벤치 선수 그림자는 drawParty 가 그린다)
  const views = { L: fx.party ? partyView(fx.party, 'L', w.players.L) : w.players.L, R: fx.party ? partyView(fx.party, 'R', w.players.R) : w.players.R };
  for (const side of ['L', 'R']) drawPlayerShadow(ctx, views[side], FIELD.GROUND);
  drawShadow(ctx, b.x, FIELD.GROUND + 1, FIELD.GROUND - b.y - b.r, b.r * 0.82);
  // 스프린트 잔상
  for (const g of fx.ghosts) {
    ctx.save(); ctx.globalAlpha = 0.25 * (1 - g.age / g.life);
    drawPlayer(ctx, { ...w.players[g.side], x: g.x, y: g.y, active: null, stun: 0, pinned: false, kickAnim: 0 }, imgs[g.def.number], { kit: wornKit(match.kits[g.side], g.def) });
    ctx.restore();
  }
  drawFlames(ctx, fx, [w.players.L, w.players.R], t);   // 투지 폭발 불꽃: 선수 뒤
  const puff = q => { ctx.save(); ctx.globalAlpha = 0.8 * (1 - q.age / q.life); ctx.fillStyle = q.color || '#FFFFFF'; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
  for (const q of fx.particles) if (q.back) puff(q);   // 굴뚝 연기는 선수 뒤로 지나가 얼굴을 가리지 않는다
  // 선수 (공에 가까운 쪽을 위에)
  const order = Math.abs(b.x - w.players.L.x) < Math.abs(b.x - w.players.R.x) ? ['R', 'L'] : ['L', 'R'];
  for (const side of order) { const p = views[side]; drawPlayer(ctx, p, imgs[p.def.number], { kit: wornKit(match.kits[side], p.def), t, cheer: !!fx.party && side === fx.party.side }); }
  for (const side of ['L', 'R']) {   // 압박에 걸린 선수: 머리 양옆으로 흘러내리는 땀방울
    const p = w.players[side]; if (!p.mods.press || fx.party) continue;
    const h = headCenter(p);
    for (const [dx, ph] of [[-0.95, 0], [0.95, 0.5]]) {
      const k = (t * 1.4 + ph) % 1, x = h.x + dx * h.r, y = h.y - h.r * 0.25 + k * 26;
      ctx.save(); ctx.globalAlpha = 1 - k * 0.7; ctx.fillStyle = '#8FD3FF'; ctx.strokeStyle = WHITE; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y - 13); ctx.bezierCurveTo(x + 9, y - 2, x + 7, y + 7, x, y + 7); ctx.bezierCurveTo(x - 7, y + 7, x - 9, y - 2, x, y - 13); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }
  // 레이저 빛줄기
  if (b.flight === 'laser') {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const grad = ctx.createLinearGradient(b.x, b.y, b.x - b.vx / sp * 220, b.y - b.vy / sp * 220);
    grad.addColorStop(0, 'rgba(255,199,44,.95)'); grad.addColorStop(1, 'rgba(255,199,44,0)');
    ctx.save(); ctx.strokeStyle = grad; ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx / sp * 220, b.y - b.vy / sp * 220); ctx.stroke(); ctx.restore();
  }
  if (fx.trail.length > 1) {   // 커브 슛 꼬리: 공 쪽이 굵고 밝은 금색 혜성 꼬리 + 밝은 심
    const tail = fx.trail[0], head = fx.trail.at(-1);
    ctx.save(); ctx.fillStyle = GOLD;
    for (let i = 0; i < fx.trail.length; i += 2) {   // 번지는 금빛: 공 쪽으로 갈수록 크고 진하다
      const q = fx.trail[i], k = 1 - q.age / q.life;
      ctx.globalAlpha = 0.3 * k; ctx.beginPath(); ctx.arc(q.x, q.y, b.r * (0.25 + 0.95 * k), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [width, rgb, a] of [[16, '255,199,44', .9], [6, '255,246,214', 1]]) {   // 금색 띠 위에 밝은 심. 꼬리 끝으로 갈수록 투명해진다
      const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},${a})`);
      ctx.strokeStyle = g; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); for (const q of fx.trail) ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    ctx.restore();
  }
  if (b.flight === 'curve') {   // 공 둘레 금빛
    const glow = ctx.createRadialGradient(b.x, b.y, b.r * 0.5, b.x, b.y, b.r * 2.7);
    glow.addColorStop(0, 'rgba(255,199,44,.7)'); glow.addColorStop(1, 'rgba(255,199,44,0)');
    ctx.save(); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  for (const q of fx.streak) {   // 빠른 공 잔상
    const k = 1 - q.age / q.life;
    ctx.save(); ctx.globalAlpha = 0.3 * k; ctx.fillStyle = WHITE;
    ctx.beginPath(); ctx.arc(q.x, q.y, b.r * (0.45 + 0.5 * k), 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  if (fx.cannonball) drawCannonball(ctx, b, t); else drawBall(ctx, b, fx.ballRot);
  if (b.flight === 'curve') {   // 회전 줄: 공 둘레를 도는 흰 호 둘
    const spin = t * 18;
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const a of [spin, spin + Math.PI]) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 8, a, a + 1.1); ctx.stroke(); }
    ctx.restore();
  }
  // 증기·잔디·먼지 입자
  for (const q of fx.particles) if (!q.back) puff(q);
  for (const q of fx.rings) {   // 맞는 순간 퍼지는 고리
    const k = q.age / q.life;
    ctx.save(); ctx.globalAlpha = 0.85 * (1 - k); ctx.strokeStyle = q.color; ctx.lineWidth = 5 * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(q.x, q.y, b.r + (q.r - b.r) * k, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  for (const q of fx.sparks) {   // 골 조각
    ctx.save(); ctx.globalAlpha = Math.min(1, (q.life - q.age) / 0.3); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.color; ctx.fillRect(-6, -3, 12, 6); ctx.restore();
  }
  if (fx.party) drawParty(ctx, fx.party, match, imgs, t);
  drawPosts(ctx);
  if (fx.flash > 0) {   // 골 플래시
    ctx.save(); ctx.globalAlpha = 0.42 * (fx.flash / FLASH); ctx.fillStyle = WHITE; fillScreen(ctx, view); ctx.restore();
  }
  drawHud(ctx, match, t, view, false);
  if (b.y + b.r < view.top) drawBallMarker(ctx, b.x, view.top);   // 위가 잘린 화면에서 공이 화면 위로 나갔다 (천장은 논리 y=0 그대로)
  if (fx.subBoard) drawSubBoard(ctx, fx.subBoard, view);
  if (fx.cutin) drawCutin(ctx, fx.cutin, imgs, view, false);
  // 글자 팝
  for (const p of fx.pops) {
    const k = p.age / p.life, a = k < 0.15 ? k / 0.15 : k > 0.7 ? (1 - k) / 0.3 : 1;
    const scale = 0.8 + 0.2 * Math.min(1, k / 0.15);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y - p.rise * k); ctx.scale(scale, scale);
    ctx.font = `800 ${p.size}px ${/^[A-Z! ]+$/.test(p.text) ? NUM : UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(p.text).width;
    if (p.glow) {   // 관중석 무늬 위에서도 읽히게 글자 뒤를 살짝 어둡게
      ctx.save(); ctx.scale(1, 0.4);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, tw * 0.8);
      g.addColorStop(0, 'rgba(0,18,56,.6)'); g.addColorStop(1, 'rgba(0,18,56,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, tw * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    if (p.plate) { rr(ctx, -tw / 2 - 20, -p.size * 0.74, tw + 40, p.size * 1.48, p.size * 0.74); ctx.fillStyle = 'rgba(0,27,77,.9)'; ctx.fill(); }
    else { ctx.lineWidth = Math.max(3, p.size / 10); ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,43,107,.9)'; ctx.strokeText(p.text, 0, 0); }
    ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0); ctx.restore();
  }
  ctx.restore();
}

export { footPoint, PHYS };
