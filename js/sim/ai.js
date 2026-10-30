// 컴퓨터 상대. 규칙 기반 (설계서 10절). 매 틱 decide() 가 Inputs 를 돌려준다.
import { FIELD, PHYS, MATCH, DIFFICULTY, NO_INPUT } from './constants.js';
import { headCenter, footPoint } from './physics.js';
import { PLAYERS } from '../data/players.js';

const ATTACK_SPECIALS = new Set(['laser', 'curve', 'longthrow', 'cannon', 'sprint', 'train', 'slide']);

export function createAiState(difficulty, rng) {
  const cfg = DIFFICULTY[difficulty];
  return { difficulty, cfg, rng, reactT: cfg.reaction, target: null, specialHoldT: 0, subDone: false };
}

// 공의 1초 뒤 위치(또는 그 전에 바닥에 닿는 지점). 중력·바닥·벽만 본다.
export function predictLanding(ball, horizon) {
  let { x, y, vx, vy } = ball;
  const r = ball.r, dt = 1 / 60;
  for (let t = 0; t < horizon; t += dt) {
    if (ball.noGravityT <= t) vy += PHYS.GRAVITY * dt;
    x += vx * dt; y += vy * dt;
    if (x - r < 0) { x = r; vx = -vx * PHYS.BOUNCE_WALL; }
    if (x + r > FIELD.W) { x = FIELD.W - r; vx = -vx * PHYS.BOUNCE_WALL; }
    if (y + r >= FIELD.GROUND) return { x, y: FIELD.GROUND - r, t };
  }
  return { x, y, t: horizon };
}

const ownGoalX = side => (side === 'L' ? FIELD.GOAL_DEPTH : FIELD.W - FIELD.GOAL_DEPTH);

function smartOk(me, ball, side) {
  const id = me.def.special.id;
  if (ATTACK_SPECIALS.has(id)) {
    // 상대 골문 쪽 40% 안에서만
    return side === 'R' ? me.x < FIELD.W * 0.4 : me.x > FIELD.W * 0.6;
  }
  // 수비형: 공이 내 진영에 있을 때만
  return side === 'R' ? ball.x > FIELD.W / 2 : ball.x < FIELD.W / 2;
}

export function decide(world, side, ai, dt) {
  const me = world.players[side], ball = world.ball, cfg = ai.cfg;
  const dir = side === 'L' ? 1 : -1;              // 상대 골문 방향
  const goalX = ownGoalX(side);

  ai.reactT -= dt;
  if (ai.reactT <= 0) {
    ai.reactT = cfg.reaction;
    const land = predictLanding(ball, 1);
    let tx = land.x + (ai.rng() * 2 - 1) * cfg.error;
    const towardMyGoal = ball.vx * dir < 0;
    const ballCloser = Math.abs(ball.x - goalX) < Math.abs(me.x - goalX);
    if (towardMyGoal && ballCloser) tx = (ball.x + goalX) / 2;   // 공과 골문 사이에 선다
    ai.target = tx;
  }

  const out = { ...NO_INPUT };
  if (ai.target !== null) {
    const d = ai.target - me.x;
    if (d > 12) out.right = true; else if (d < -12) out.left = true;
  }

  const h = headCenter(me);
  const above = h.y - ball.y;
  if (me.onGround && Math.abs(ball.x - h.x) < h.r + ball.r + 20 && above > 0 && above < 220) out.jump = true;

  const f = footPoint(me);
  const inFront = (ball.x - me.x) * dir > -10;
  if (inFront && me.kickCooldown <= 0 && Math.hypot(ball.x - f.x, ball.y - f.y) <= PHYS.KICK_RANGE) out.kick = true;

  if (me.gauge >= 100 && !me.active) {
    ai.specialHoldT += dt;
    if (ai.specialHoldT >= cfg.specialDelay - 1e-9 && (!cfg.smart || smartOk(me, ball, side))) out.special = true;
  } else ai.specialHoldT = 0;

  return out;
}

// AI(R) 교체: 45초 지난 뒤, 아직 안 썼고, 공이 내 골문에서 400 이상 떨어져 있을 때
export function shouldSubstitute(match) {
  return match.clock <= MATCH.LEN - MATCH.AI_SUB_AFTER + 1e-9
    && !match.subUsed.R
    && Math.abs(match.world.ball.x - ownGoalX('R')) >= 400;
}

// 지고 있으면 공격 성향, 아니면 수비 성향. 지금 뛰는 두 선수는 뺀다.
export function pickSubstitute(match, rng) {
  const role = match.scores.R < match.scores.L ? 'attack' : 'defend';
  const onPitch = new Set([match.used.L.at(-1).number, match.used.R.at(-1).number]);
  const pool = PLAYERS.filter(p => p.role === role && !onPitch.has(p.number));
  return pool[Math.floor(rng() * pool.length)];
}
