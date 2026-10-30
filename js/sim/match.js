// 경기 규칙: 시계, 득점, 게이지, 교체, 골든골 (설계서 5·8절). DOM 을 모른다.
import { MATCH, GAUGE, DIFFICULTY, NO_INPUT } from './constants.js';
import { createWorld, createPlayer, stepPhysics, resetKickoff } from './physics.js';
import { createAiState, decide, shouldSubstitute, pickSubstitute } from './ai.js';
import { activateSpecial, updateSpecials, specialHooks } from './specials.js';

export function createMatch({ home, away, difficulty = 'first', rng = Math.random }) {
  return {
    world: createWorld(home, away),
    clock: MATCH.LEN, phase: 'kickoff', phaseT: MATCH.GOAL_PAUSE,
    scores: { L: 0, R: 0 }, subUsed: { L: false, R: false }, used: { L: [home], R: [away] },
    difficulty, rng, ai: createAiState(difficulty, rng), result: null, pendingSub: null,
  };
}

export const currentDefs = match => ({ L: match.used.L.at(-1), R: match.used.R.at(-1) });

const other = side => (side === 'L' ? 'R' : 'L');

function finish(match, events) {
  match.phase = 'over';
  match.result = match.scores.L > match.scores.R ? 'win' : match.scores.L < match.scores.R ? 'lose' : 'draw';
  events.push({ type: 'phase', phase: 'over' });
}

function trySpecial(match, side, pressed, events) {
  const p = match.world.players[side];
  if (!pressed || p.gauge < GAUGE.MAX || p.active) return;
  if (activateSpecial(match, side)) {
    p.gauge = 0;
    events.push({ type: 'special', side, id: p.active.id });
  }
}

export function stepMatch(match, inputsL, dt) {
  if (match.phase === 'sub' || match.phase === 'over') return [];
  const events = [];
  const { world } = match;

  if (match.phase === 'kickoff' || match.phase === 'goal') {
    match.phaseT -= dt;
    if (match.phaseT > 0) return events;
    if (match.phase === 'goal') { resetKickoff(world); match.phase = 'kickoff'; match.phaseT = MATCH.GOAL_PAUSE; events.push({ type: 'phase', phase: 'kickoff' }); return events; }
    match.phase = 'play';                      // 골든골 중 득점은 즉시 종료라 킥오프 뒤는 항상 play
    events.push({ type: 'phase', phase: 'play' });
    return events;
  }

  // play | golden
  if (inputsL.sub && requestSubstitute(match, 'L')) { events.push({ type: 'phase', phase: 'sub' }); return events; }
  match.clock -= dt;
  const inputsR = decide(world, 'R', match.ai, dt);
  trySpecial(match, 'L', inputsL.special, events);
  trySpecial(match, 'R', inputsR.special, events);
  events.push(...updateSpecials(match, dt));
  world.players.R.mods.speed *= DIFFICULTY[match.difficulty].speed;

  const phys = stepPhysics(world, { L: inputsL, R: inputsR }, dt, specialHooks(match));
  for (const e of phys) {
    events.push(e);
    if (e.type === 'touch') {
      const p = world.players[e.side];
      p.gauge = Math.min(GAUGE.MAX, p.gauge + (e.perfect ? GAUGE.PERFECT : GAUGE.TOUCH));
    } else if (e.type === 'goal') {
      match.scores[e.scorer]++;
      const c = world.players[other(e.scorer)];
      c.gauge = Math.min(GAUGE.MAX, c.gauge + GAUGE.CONCEDE);
      if (match.phase === 'golden') { finish(match, events); return events; }
      match.phase = 'goal'; match.phaseT = MATCH.GOAL_PAUSE;
      events.push({ type: 'phase', phase: 'goal' });
      return events;
    }
  }

  if (shouldSubstitute(match)) events.push(substitute(match, 'R', pickSubstitute(match, match.rng)));

  if (match.clock <= 0) {
    if (match.phase === 'play' && match.scores.L === match.scores.R) {
      match.phase = 'golden'; match.clock = MATCH.GOLDEN;
      events.push({ type: 'phase', phase: 'golden' });
    } else finish(match, events);
  }
  return events;
}

// L 이 교체 버튼을 눌렀을 때. 조건이 되면 경기를 멈추고 선택 화면을 기다린다.
export function requestSubstitute(match, side) {
  if (match.phase !== 'play' && match.phase !== 'golden') return false;
  if (match.subUsed[side]) return false;
  match.pendingSub = { side, prevPhase: match.phase };
  match.phase = 'sub';
  return true;
}

// 선택이 끝났을 때. newDef 가 null 이면 교체 없이 돌아간다(횟수 유지).
export function resumeFromSub(match, newDef) {
  if (match.phase !== 'sub') return null;
  const { side, prevPhase } = match.pendingSub;
  const ev = newDef ? substitute(match, side, newDef) : null;
  match.phase = prevPhase; match.pendingSub = null;
  return ev;
}

// 몸을 바꾼다. 위치·속도·게이지는 그대로, 필살기 효과는 끝난다.
export function substitute(match, side, newDef) {
  const { world } = match;
  const old = world.players[side];
  const n = createPlayer(newDef, side);
  Object.assign(n, { x: old.x, y: old.y, vx: old.vx, vy: old.vy, onGround: old.onGround, gauge: old.gauge, lastTouchT: old.lastTouchT });
  world.players[side] = n;
  const b = world.ball;
  if (b.attached === side) b.attached = null;
  if (b.held && b.held.side === side) b.held = null;
  world.players[other(side)].pinned = false;
  match.subUsed[side] = true;
  match.used[side].push(newDef);
  return { type: 'sub', side, out: old.def.number, in: newDef.number };
}
