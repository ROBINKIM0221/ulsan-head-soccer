// 컴퓨터 상대. 규칙 기반 (설계서 10절). 매 틱 decide() 가 Inputs 를 돌려준다. 필살기는 자동이라 판단하지 않는다.
import { FIELD, PHYS, MATCH, DIFFICULTY, NO_INPUT } from './constants.js';
import { headCenter, footPoint } from './physics.js';
import { PLAYERS } from '../data/players.js';

export function createAiState(difficulty, rng) {
  const cfg = DIFFICULTY[difficulty];
  return { difficulty, cfg, rng, reactT: cfg.reaction, target: null };
}

// 공의 1초 뒤 위치(또는 그 전에 바닥에 닿는 지점). 중력·바닥·벽만 본다.
export function predictLanding(ball, horizon) {
  let { x, y, vx, vy } = ball;
  const r = ball.r, dt = 1 / 60;
  for (let t = 0; t < horizon; t += dt) {
    if (ball.noGravityT <= t) vy += PHYS.BALL_GRAVITY * dt;
    x += vx * dt; y += vy * dt;
    if (x - r < 0) { x = r; vx = -vx * PHYS.BOUNCE_WALL; }
    if (x + r > FIELD.W) { x = FIELD.W - r; vx = -vx * PHYS.BOUNCE_WALL; }
    if (y + r >= FIELD.GROUND) return { x, y: FIELD.GROUND - r, t };
  }
  return { x, y, t: horizon };
}

const ownGoalX = side => (side === 'L' ? FIELD.GOAL_DEPTH : FIELD.W - FIELD.GOAL_DEPTH);

export function decide(world, side, ai, dt) {
  const me = world.players[side], ball = world.ball, cfg = ai.cfg;
  const dir = side === 'L' ? 1 : -1;              // 상대 골문 방향
  const goalX = ownGoalX(side);

  ai.reactT -= dt;
  if (ai.reactT <= 0) {
    ai.reactT = cfg.reaction;
    const land = predictLanding(ball, 1);
    // 공이 내 앞에 떨어지게 조금 뒤(내 골문 쪽)에 선다. 공이 이미 내 골문 쪽에 있으면 공을 돌아 골문 쪽으로 들어간다.
    const ballGoalSide = Math.abs(ball.x - goalX) < Math.abs(me.x - goalX);
    let tx = ballGoalSide ? ball.x - dir * 90 : land.x - dir * 60;
    if (me.active && me.active.id === 'magnet') tx = ball.x - dir * 40;   // 자석이 켜져 있으면 공에 바짝 붙는다
    ai.target = tx + (ai.rng() * 2 - 1) * cfg.error;
  }

  const out = { ...NO_INPUT };
  if (ai.target !== null) {
    const d = ai.target - me.x;
    if (d > 12) out.right = true; else if (d < -12) out.left = true;
  }

  const h = headCenter(me);
  const above = h.y - ball.y;
  if (me.onGround && Math.abs(ball.x - h.x) < h.r + ball.r + 20 && above > 0 && above < 220) out.jump = true;
  // 공이 내 뒤(골문 쪽) 가까이 낮게 있으면 뛰어넘어 골문 쪽으로 돌아간다 (몸으로 밀어 넣는 자책골 방지)
  const ballBehind = (ball.x - me.x) * dir < -10;
  if (me.onGround && ballBehind && Math.abs(ball.x - me.x) < 110 && ball.y > h.y) out.jump = true;

  const f = footPoint(me);
  const inFront = (ball.x - me.x) * dir > -10;
  if (inFront && me.kickCooldown <= 0 && Math.hypot(ball.x - f.x, ball.y - f.y) <= PHYS.KICK_RANGE) out.kick = true;

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
