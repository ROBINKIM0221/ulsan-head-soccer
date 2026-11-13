// 선수·공 물리. DOM 을 모른다. 수치는 constants.js (설계서 7절).
// 좌표: x 오른쪽 +, y 아래 +. 선수 x 는 몸 가로 중심, y 는 발바닥(바닥 = FIELD.GROUND).
import { FIELD, PHYS, NO_INPUT } from './constants.js';

export function defaultMods() {
  return { speed: 1, jump: 1, headPow: 1, kickPow: 1, canJump: true, catchArmed: false, magnet: false, press: false };
}

export function createPlayer(def, side) {
  return {
    side, def,
    x: side === 'L' ? 320 : 960, y: FIELD.GROUND, vx: 0, vy: 0, onGround: true,
    facing: side === 'L' ? 1 : -1, scale: 1,
    kickCooldown: 0, kickAnim: 0, stun: 0, frozen: 0, pinned: false, forcedVx: null, noSeparate: false, lastTouchT: -1,   // frozen: 오프사이드 트랩에 걸려 서 있을 남은 시간(초)
    gauge: 0, active: null, mods: defaultMods(),
  };
}

export function createBall() {
  return {
    x: 640, y: 300, vx: 0, vy: 0, r: PHYS.BALL_R,
    noGravityT: 0, passThrough: null, flight: null, curveAx: 0, held: null, attached: null, lastTouch: null,
  };
}

export function createWorld(defL, defR) {
  return { players: { L: createPlayer(defL, 'L'), R: createPlayer(defR, 'R') }, ball: createBall(), t: 0, goalLatch: false };
}

export function resetKickoff(world) {
  for (const side of ['L', 'R']) {
    const p = world.players[side];
    p.x = side === 'L' ? 320 : 960; p.y = FIELD.GROUND; p.vx = 0; p.vy = 0; p.onGround = true;
    p.kickCooldown = 0; p.kickAnim = 0; p.stun = 0; p.frozen = 0; p.pinned = false; p.forcedVx = null; p.noSeparate = false;
  }
  Object.assign(world.ball, createBall());
  world.goalLatch = false;
}

export function headCenter(b) {
  const r = PHYS.HEAD_R * b.scale;
  return { x: b.x, y: b.y - PHYS.BODY_H * b.scale - r, r };
}
export function bodyRect(b) {
  const w = PHYS.BODY_W * b.scale, h = PHYS.BODY_H * b.scale;
  return { x: b.x - w / 2, y: b.y - h, w, h };
}
export function footPoint(b) { return { x: b.x + b.facing * 20, y: b.y - 20 }; }
const fullHeight = b => (PHYS.BODY_H + 2 * PHYS.HEAD_R) * b.scale;
const minX = b => FIELD.GOAL_DEPTH + PHYS.BODY_W * b.scale / 2;
const maxX = b => FIELD.W - FIELD.GOAL_DEPTH - PHYS.BODY_W * b.scale / 2;
const clampX = b => { b.x = Math.min(maxX(b), Math.max(minX(b), b.x)); };
const ballFree = ball => !ball.held && !ball.attached;

// 골 지붕(크로스바가 골 깊이 전체를 덮는다): 위에서 떨어지는 공은 골문에 못 들어간다
const ROOFS = [
  { x: 0, y: FIELD.GROUND - FIELD.GOAL_H - FIELD.BAR_T, w: FIELD.GOAL_DEPTH, h: FIELD.BAR_T },
  { x: FIELD.W - FIELD.GOAL_DEPTH, y: FIELD.GROUND - FIELD.GOAL_H - FIELD.BAR_T, w: FIELD.GOAL_DEPTH, h: FIELD.BAR_T },
];

// 원(공) 대 사각형. 닿았으면 밀어내고 법선 성분을 반발계수 e 로 반사. 닿았는지 돌려준다.
function collideBox(ball, box, e, carryVx = 0) {
  const cx = Math.max(box.x, Math.min(ball.x, box.x + box.w));
  const cy = Math.max(box.y, Math.min(ball.y, box.y + box.h));
  let dx = ball.x - cx, dy = ball.y - cy;
  let d = Math.hypot(dx, dy);
  if (d >= ball.r) return false;
  let nx, ny;
  if (d === 0) {
    // 중심이 상자 안: 가장 얕은 축으로 밀어낸다
    const left = ball.x - box.x, right = box.x + box.w - ball.x, top = ball.y - box.y, bottom = box.y + box.h - ball.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) { nx = -1; ny = 0; } else if (m === right) { nx = 1; ny = 0; } else if (m === top) { nx = 0; ny = -1; } else { nx = 0; ny = 1; }
    d = -m;
  } else { nx = dx / d; ny = dy / d; }
  ball.x += nx * (ball.r - d); ball.y += ny * (ball.r - d);
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) { ball.vx -= (1 + e) * vn * nx; ball.vy -= (1 + e) * vn * ny; }
  if (carryVx * nx > 0) ball.vx += carryVx;   // 선수가 공 쪽으로 움직일 때만 밀어 준다
  return true;
}

function collideStatic(ball) {
  if (ball.y + ball.r > FIELD.GROUND) {
    ball.y = FIELD.GROUND - ball.r;
    if (ball.vy > 0) ball.vy = -ball.vy * PHYS.BOUNCE_GROUND;
    if (Math.abs(ball.vy) < 40) ball.vy = 0;
  }
  if (ball.y - ball.r < 0) { ball.y = ball.r; if (ball.vy < 0) ball.vy = -ball.vy * PHYS.BOUNCE_WALL; }
  if (ball.x - ball.r < 0) { ball.x = ball.r; if (ball.vx < 0) ball.vx = -ball.vx * PHYS.BOUNCE_WALL; }
  if (ball.x + ball.r > FIELD.W) { ball.x = FIELD.W - ball.r; if (ball.vx > 0) ball.vx = -ball.vx * PHYS.BOUNCE_WALL; }
  for (const roof of ROOFS) collideBox(ball, roof, PHYS.BOUNCE_WALL);
}

function touch(world, p, ball, perfect, part, events, hooks) {
  ball.lastTouch = { side: p.side, t: world.t };
  if (world.t - p.lastTouchT < PHYS.TOUCH_DEBOUNCE) return;
  p.lastTouchT = world.t;
  events.push({ type: 'touch', side: p.side, perfect, part });   // part: head | foot | body (효과음 구분)
  if (hooks.onBallTouch) hooks.onBallTouch(p.side, { perfect, part });
}

// 공 대 선수(머리 원 + 몸 사각). 밀어냈으면 true.
function collidePlayer(world, p, ball, events, hooks) {
  const h = headCenter(p);
  const dx = ball.x - h.x, dy = ball.y - h.y;
  const d = Math.hypot(dx, dy), sum = h.r + ball.r;
  if (d < sum) {
    const nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : -1;
    ball.x = h.x + nx * sum; ball.y = h.y + ny * sum;
    const rvx = ball.vx - p.vx, rvy = ball.vy - p.vy;
    const relN = rvx * nx + rvy * ny;
    if (relN < 0) {
      const rel = Math.hypot(rvx, rvy);
      const fwdUp = Math.atan2(nx * p.facing, -ny) * 180 / Math.PI;   // 위(0°)에서 앞쪽(+)으로
      const perfect = !p.onGround && fwdUp >= -10 && fwdUp <= 60 && rel >= PHYS.PERFECT_MIN_REL;
      const vn = ball.vx * nx + ball.vy * ny;
      if (vn < 0) { ball.vx -= 2 * vn * nx; ball.vy -= 2 * vn * ny; }
      ball.vx += p.vx * PHYS.HEAD_CARRY; ball.vy += p.vy * PHYS.HEAD_CARRY;
      const outN = ball.vx * nx + ball.vy * ny;
      if (outN < PHYS.HEAD_MIN_OUT) { ball.vx += (PHYS.HEAD_MIN_OUT - outN) * nx; ball.vy += (PHYS.HEAD_MIN_OUT - outN) * ny; }
      const mult = p.mods.headPow * (perfect ? PHYS.PERFECT_MULT : 1);
      ball.vx *= mult; ball.vy *= mult;
      touch(world, p, ball, perfect, 'head', events, hooks);
    }
    return true;
  }
  if (collideBox(ball, bodyRect(p), PHYS.BOUNCE_BODY, p.vx * 0.5)) {
    ball.vy = Math.min(ball.vy, -PHYS.BODY_POP);   // 몸에 맞으면 통통 위로 튄다
    touch(world, p, ball, false, 'body', events, hooks);
    return true;
  }
  return false;
}

// 공에서 먼 선수부터, 가까운 선수를 마지막에
function byDistance(world, ball) {
  const d = side => { const h = headCenter(world.players[side]); return Math.hypot(ball.x - h.x, ball.y - h.y); };
  return d('L') >= d('R') ? ['L', 'R'] : ['R', 'L'];
}

function separatePlayers(L, R) {
  if (L.noSeparate || R.noSeparate) return;   // 돌진하는 기관차는 공중의 상대 밑을 지나간다
  const halfW = (PHYS.BODY_W * L.scale + PHYS.BODY_W * R.scale) / 2;
  const vertOverlap = L.y > R.y - fullHeight(R) && R.y > L.y - fullHeight(L);
  const dx = R.x - L.x;
  if (Math.abs(dx) >= halfW || !vertOverlap) return;
  const dir = dx >= 0 ? 1 : -1;
  let pen = halfW - Math.abs(dx);
  if (L.pinned) R.x += dir * pen;
  else if (R.pinned) L.x -= dir * pen;
  else { L.x -= dir * pen / 2; R.x += dir * pen / 2; }
  clampX(L); clampX(R);
  pen = halfW - Math.abs(R.x - L.x);          // 한쪽이 벽에 막혔으면 나머지를 다른 쪽이 받는다
  if (pen > 1e-9) { if (L.x <= minX(L) + 1e-9 || L.pinned) R.x += dir * pen; else L.x -= dir * pen; clampX(L); clampX(R); }
}

export function stepPhysics(world, inputs, dt, hooks = {}) {
  const events = [];
  const { ball } = world;
  world.t += dt;

  // 1. 선수 입력·중력·이동
  for (const side of ['L', 'R']) {
    const p = world.players[side];
    const inp = inputs[side] || NO_INPUT;
    p.kickCooldown = Math.max(0, p.kickCooldown - dt);
    p.kickAnim = Math.max(0, p.kickAnim - dt);
    p.stun = Math.max(0, p.stun - dt);
    p.frozen = Math.max(0, p.frozen - dt);
    if (p.pinned) { p.vx = 0; }
    else if (p.forcedVx !== null) { p.vx = p.forcedVx; } // 기관차 돌진: 입력 무시
    else if (p.stun > 0) { p.vx *= 0.9; }               // 넘어진 동안은 밀린 속도만 잦아든다
    else if (p.frozen > 0) { p.vx = 0; }                // 오프사이드 트랩: 그 자리에 선다(입력 무시). 공중이면 그대로 떨어진다
    else {
      p.vx = ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) * PHYS.MOVE * p.mods.speed;
      if (inp.jump && p.onGround && p.mods.canJump) { p.vy = -PHYS.JUMP * p.mods.jump; p.onGround = false; }
    }
    if (!p.onGround) p.vy += PHYS.GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y >= FIELD.GROUND) { p.y = FIELD.GROUND; p.vy = 0; p.onGround = true; }
    clampX(p);
  }

  // 2. 선수끼리 겹치지 않게 (튕기지는 않음)
  separatePlayers(world.players.L, world.players.R);

  // 3~5. 공
  if (ballFree(ball)) {
    if (ball.noGravityT > 0) ball.noGravityT = Math.max(0, ball.noGravityT - dt);
    else ball.vy += PHYS.BALL_GRAVITY * dt;
    ball.vx += ball.curveAx * dt;
    ball.vx *= PHYS.DRAG; ball.vy *= PHYS.DRAG;
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    collideStatic(ball);
    // 공에 가까운 선수를 나중에 처리해 접촉의 주인이 되게 한다 (항상 L→R 이면 R 이 동시 접촉을 매번 이긴다)
    let pushed = 0;
    for (const side of byDistance(world, ball)) {
      if (ball.passThrough === side) continue;
      if (collidePlayer(world, world.players[side], ball, events, hooks)) pushed++;
    }
    if (pushed === 2) { ball.vy = Math.min(ball.vy, -350); ball.vx *= 0.3; }   // 두 선수 사이에 끼면 옆으로 튀지 않고 위로 빠져나온다
    collideStatic(ball);
  }

  // 6. 킥(슛 버튼). 공 이동 뒤에 처리해 속도가 정확히 남는다. 둘 다 닿으면 발이 더 가까운 쪽만 공을 찬다.
  const kickers = [];
  for (const side of ['L', 'R']) {
    const p = world.players[side];
    const inp = inputs[side] || NO_INPUT;
    if (!inp.kick || p.kickCooldown > 0 || p.stun > 0 || p.frozen > 0 || p.pinned) continue;
    p.kickCooldown = PHYS.KICK_COOLDOWN; p.kickAnim = 0.25;
    events.push({ type: 'kick', side });
    const f = footPoint(p);
    const inFront = (ball.x - p.x) * p.facing > -10;
    const dist = Math.hypot(ball.x - f.x, ball.y - f.y);
    if (ballFree(ball) && ball.passThrough !== side && inFront && dist <= PHYS.KICK_RANGE) kickers.push({ side, p, dist });
  }
  if (kickers.length) {
    const { side, p } = kickers.sort((a, b) => a.dist - b.dist)[0];
    if (!(hooks.onKick && hooks.onKick(side))) {
      const a = PHYS.KICK_ANGLE_DEG * Math.PI / 180;
      ball.vx = p.facing * PHYS.KICK_SPEED * p.mods.kickPow * Math.cos(a);
      ball.vy = -PHYS.KICK_SPEED * p.mods.kickPow * Math.sin(a);
    }
    touch(world, p, ball, false, 'foot', events, hooks);
  }

  // 7. 속도 상한
  const sp = Math.hypot(ball.vx, ball.vy);
  if (sp > PHYS.BALL_MAX) { ball.vx *= PHYS.BALL_MAX / sp; ball.vy *= PHYS.BALL_MAX / sp; }

  // 8. 골: 공 전체가 골라인을 넘고 크로스바 아래
  if (!world.goalLatch && ball.y > FIELD.GROUND - FIELD.GOAL_H) {
    let scorer = null;
    if (ball.x + ball.r < FIELD.GOAL_DEPTH) scorer = 'R';
    else if (ball.x - ball.r > FIELD.W - FIELD.GOAL_DEPTH) scorer = 'L';
    if (scorer) { world.goalLatch = true; events.push({ type: 'goal', scorer }); }
  }
  return events;
}
