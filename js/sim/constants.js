// 모든 수치의 출처: docs/superpowers/specs/2026-10-31-head-soccer-design.md (5·7·8·10절)
export const FIELD = { W: 1280, H: 720, GROUND: 640, GOAL_DEPTH: 80, GOAL_H: 230, BAR_T: 10 };

export const PHYS = {
  // 2026-10-31 형준: 원작 헤드 사커 느낌 — 공은 가벼워 오래 떠 있고(BALL_GRAVITY), 점프는 높고, 헤딩이 중심
  GRAVITY: 2200, BALL_GRAVITY: 1500, MOVE: 480, JUMP: 850,
  BALL_R: 22, HEAD_R: 55, BODY_W: 56, BODY_H: 70,
  BALL_MAX: 1600, BOUNCE_GROUND: 0.82, BOUNCE_WALL: 0.9, BOUNCE_BODY: 0.9, BODY_POP: 250, DRAG: 0.9995,   // 공이 통통 튀게 (0.72/0.8/0.5 → 0.82/0.9/0.9, 몸에 맞으면 위로 250)
  KICK_RANGE: 70, KICK_SPEED: 900, KICK_ANGLE_DEG: 35, KICK_COOLDOWN: 0.45,      // 킥은 덜 남발되게 0.3→0.45
  HEAD_CARRY: 0.8, HEAD_MIN_OUT: 250, PERFECT_MIN_REL: 500, PERFECT_MULT: 1.35, TOUCH_DEBOUNCE: 0.25,   // 헤딩이 세게 (0.6→0.8, 최소 반발 150→250)
};

// 밸런스 2026-10-31: 터치 10→4, 퍼펙트 35→20, 실점 15→20. AI 끼리 한 경기 터치가 300번을 넘어 10이면 필살기가 30번 터졌다.
export const GAUGE = { TOUCH: 4, PERFECT: 20, CONCEDE: 20, MAX: 100, ONESHOT_TTL: 6 };

export const MATCH = { LEN: 60, GOLDEN: 30, GOAL_PAUSE: 1, AI_SUB_AFTER: 30 };   // 2026-10-31 형준: 90초 → 60초

export const DT = 1 / 120;

export const DIFFICULTY = {
  youth:  { reaction: 0.35, error: 120, speed: 0.85 },
  first:  { reaction: 0.18, error: 50,  speed: 1.0 },
  legend: { reaction: 0.08, error: 15,  speed: 1.05 },
};

export const NO_INPUT = Object.freeze({ left: false, right: false, jump: false, kick: false, special: false, sub: false });
