// 모든 수치의 출처: docs/superpowers/specs/2026-10-31-head-soccer-design.md (5·7·8·10절)
export const FIELD = { W: 1280, H: 720, GROUND: 640, GOAL_DEPTH: 80, GOAL_H: 230, BAR_T: 10 };

export const PHYS = {
  GRAVITY: 2200, MOVE: 420, JUMP: 760,
  BALL_R: 22, HEAD_R: 55, BODY_W: 56, BODY_H: 70,
  BALL_MAX: 1600, BOUNCE_GROUND: 0.72, BOUNCE_WALL: 0.8, BOUNCE_BODY: 0.5, DRAG: 0.999,
  KICK_RANGE: 70, KICK_SPEED: 900, KICK_ANGLE_DEG: 35, KICK_COOLDOWN: 0.3,
  HEAD_CARRY: 0.6, PERFECT_MIN_REL: 500, PERFECT_MULT: 1.35, TOUCH_DEBOUNCE: 0.25,
};

export const GAUGE = { TOUCH: 10, PERFECT: 35, CONCEDE: 15, MAX: 100, ONESHOT_TTL: 6 };

export const MATCH = { LEN: 90, GOLDEN: 30, GOAL_PAUSE: 1, AI_SUB_AFTER: 45 };

export const DT = 1 / 120;

export const DIFFICULTY = {
  youth:  { reaction: 0.35, error: 120, speed: 0.85, specialDelay: 3, smart: false },
  first:  { reaction: 0.18, error: 50,  speed: 1.0,  specialDelay: 0, smart: false },
  legend: { reaction: 0.08, error: 15,  speed: 1.05, specialDelay: 0, smart: true },
};

export const NO_INPUT = Object.freeze({ left: false, right: false, jump: false, kick: false, special: false, sub: false });
