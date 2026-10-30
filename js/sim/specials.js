// 필살기. 공통 뼈대(발동·지속·종료)는 아래쪽, 각 필살기의 효과는 SPECIALS 표. 수치는 설계서 9절.
import { FIELD, PHYS } from './constants.js';
import { defaultMods, headCenter } from './physics.js';

const dir = side => (side === 'L' ? 1 : -1);          // 상대 골문 방향
const opp = side => (side === 'L' ? 'R' : 'L');
const me = (m, s) => m.world.players[s];
const rad = deg => deg * Math.PI / 180;
const onGround = b => b.y + b.r >= FIELD.GROUND - 0.5;

// 공기 저항·중력을 그대로 넣고 시뮬레이션해서, 각도 angleDeg 로 targetX 에 떨어지는 초속을 찾는다 (최대 vMax)
function speedToLand(x0, y0, targetX, angleDeg, dirX, vMax) {
  const landX = v => {
    let x = x0, y = y0, vx = dirX * v * Math.cos(rad(angleDeg)), vy = -v * Math.sin(rad(angleDeg));
    const dt = 1 / 120;
    for (let i = 0; i < 1200; i++) {
      vy += PHYS.GRAVITY * dt; vx *= PHYS.DRAG; vy *= PHYS.DRAG; x += vx * dt; y += vy * dt;
      if (y + PHYS.BALL_R >= FIELD.GROUND && vy > 0) return x;
    }
    return x;
  };
  if ((landX(vMax) - targetX) * dirX < 0) return vMax;   // 최고 속도로도 못 미치면 최고 속도
  let lo = 100, hi = vMax;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if ((landX(mid) - targetX) * dirX < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// 한 방형이 공을 쏜 뒤, 공이 바닥에 닿거나 되돌아오면 비행 표시를 지운다
function flightOver(b, data, dirX) {
  if (!data.left && !onGround(b)) data.left = true;
  return (data.left && onGround(b)) || Math.sign(b.vx) === -dirX;
}

// SPECIALS[id] = { activate(match, side), update(match, side, dt) -> Event[]|undefined, end(match, side),
//                  onKick(match, side) -> boolean, onBallTouch(match, side, info) }
export const SPECIALS = {
  // ── 지속형 ──
  sprint: { update(m, s) { me(m, s).mods.speed *= 1.8; } },

  highjump: { update(m, s) { me(m, s).mods.jump *= 1.5; } },

  giant: {
    activate(m, s) { me(m, s).scale = 1.7; },
    update(m, s) { const p = me(m, s); p.mods.speed *= 0.85; p.mods.headPow *= 1.2; },
    end(m, s) { me(m, s).scale = 1; },
  },

  press: {
    update(m, s) { const o = me(m, opp(s)); o.mods.speed *= 0.6; o.mods.jump *= 0.6; o.mods.press = true; },
  },

  // 헤딩 ×2. 그 헤딩(0.5초 안)에 맞은 상대는 400px/s 로 밀리고 0.4초 비틀거린다.
  cannon: {
    update(m, s) {
      const p = me(m, s); p.mods.headPow *= 2;
      const d = p.active.data, b = m.world.ball;
      if (d.headT === undefined || d.hit || !b.lastTouch || b.lastTouch.side !== opp(s)) return;
      if (b.lastTouch.t > d.headT && b.lastTouch.t - d.headT <= 0.5) {
        const o = me(m, opp(s));
        o.vx = 400 * dir(s); o.stun = Math.max(o.stun, 0.4); d.hit = true;
        return [{ type: 'knockback', side: opp(s) }];
      }
    },
    onBallTouch(m, s, info) { if (info.part === 'head') { const d = me(m, s).active.data; d.headT = m.world.t; d.hit = false; } },
  },

  // 반지름 220 안의 자유로운 공을 머리 쪽으로 끌어당긴다 (가까울수록 세게, 최대 1800px/s²)
  magnet: {
    update(m, s, dt) {
      const p = me(m, s), b = m.world.ball;
      p.mods.magnet = true;
      if (b.flight || b.held || b.attached) return;
      const h = headCenter(p);
      const dx = h.x - b.x, dy = h.y - b.y, d = Math.hypot(dx, dy);
      if (d > 220 || d < 1) return;
      const a = 1800 * (1 - d / 220);
      b.vx += a * dx / d * dt; b.vy += a * dy / d * dt;
    },
  },

  // ── 다음 한 방형 ──
  // 다음 킥: 1500 직선, 0.8초 중력 없음, 상대를 통과
  laser: {
    onKick(m, s) {
      const p = me(m, s), b = m.world.ball;
      if (!p.active.armed) return false;
      p.active.armed = false; p.active.t = 0.8;
      b.vx = dir(s) * 1500 * Math.cos(rad(3)); b.vy = -1500 * Math.sin(rad(3));
      b.noGravityT = 0.8; b.passThrough = opp(s); b.flight = 'laser';
      return true;
    },
    update(m, s) {
      const p = me(m, s), b = m.world.ball;
      if (p.active.armed || b.flight !== 'laser') return;
      if (b.noGravityT <= 0 || Math.sign(b.vx) !== dir(s)) { SPECIALS.laser.end(m, s); p.active.t = 0; }
    },
    end(m, s) { const b = m.world.ball; if (b.flight === 'laser') { b.flight = null; b.passThrough = null; b.noGravityT = 0; } },
  },

  // 다음 킥: 62°·1000 으로 띄우고 상대 골문 쪽으로 가로 가속 900
  curve: {
    onKick(m, s) {
      const p = me(m, s), b = m.world.ball;
      if (!p.active.armed) return false;
      p.active.armed = false; p.active.t = 2.5; p.active.data.left = false;
      b.vx = dir(s) * 1000 * Math.cos(rad(62)); b.vy = -1000 * Math.sin(rad(62));
      b.flight = 'curve'; b.curveAx = 900 * dir(s);
      return true;
    },
    update(m, s) {
      const p = me(m, s), b = m.world.ball;
      if (p.active.armed || b.flight !== 'curve') return;
      if (flightOver(b, p.active.data, dir(s))) { SPECIALS.curve.end(m, s); p.active.t = 0; }
    },
    end(m, s) { const b = m.world.ball; if (b.flight === 'curve') { b.flight = null; b.curveAx = 0; } },
  },

  // 다음 터치: 공을 집어 0.3초 들고, 상대 골라인 앞 60px 에 떨어지게 55° 로 던진다 (최고 1300)
  longthrow: {
    onBallTouch(m, s) {
      const p = me(m, s), b = m.world.ball;
      if (!p.active.armed) return;
      p.active.armed = false; p.active.t = 4; p.active.data.phase = 'hold';
      b.held = { side: s, t: 0.3 }; b.vx = 0; b.vy = 0;
    },
    update(m, s, dt) {
      const p = me(m, s), b = m.world.ball, d = p.active.data;
      if (d.phase === 'hold') {
        const h = headCenter(p);
        b.x = h.x; b.y = h.y - h.r - b.r - 4;
        b.held.t -= dt;
        if (b.held.t <= 0) {
          const targetX = s === 'L' ? FIELD.W - FIELD.GOAL_DEPTH - 60 : FIELD.GOAL_DEPTH + 60;
          const v = speedToLand(b.x, b.y, targetX, 55, dir(s), 1300);
          b.held = null; b.vx = dir(s) * v * Math.cos(rad(55)); b.vy = -v * Math.sin(rad(55));
          b.flight = 'throw'; d.phase = 'fly'; d.left = false; d.targetX = targetX;
          return [{ type: 'throw', side: s }];
        }
      } else if (d.phase === 'fly') {
        if (b.flight !== 'throw' || flightOver(b, d, dir(s))) { SPECIALS.longthrow.end(m, s); p.active.t = 0; }
      }
    },
    end(m, s) { const b = m.world.ball; if (b.flight === 'throw') b.flight = null; if (b.held && b.held.side === s) b.held = null; },
  },

  // ── 즉발 ──
  // 0.35초 동안 180px 미끄러진다. 공은 1000 으로 걷어내고, 상대는 1초 넘어진다 (각 1회)
  slide: {
    activate(m, s) { const p = me(m, s); p.forcedVx = dir(s) * 180 / 0.35; p.active.data = { kicked: false, hit: false }; },
    update(m, s) {
      const p = me(m, s), d = p.active.data, b = m.world.ball, o = me(m, opp(s));
      const ev = [];
      if (!d.kicked && !b.held && !b.attached && Math.hypot(b.x - (p.x + dir(s) * 30), b.y - (p.y - 20)) < 60) {
        b.vx = dir(s) * 1000 * Math.cos(rad(35)); b.vy = -1000 * Math.sin(rad(35)); d.kicked = true;
      }
      if (!d.hit && Math.abs(o.x - p.x) < PHYS.BODY_W + 10 && o.y > FIELD.GROUND - PHYS.BODY_H) {
        o.stun = Math.max(o.stun, 1); d.hit = true; ev.push({ type: 'knockdown', side: opp(s) });
      }
      return ev;
    },
    end(m, s) { me(m, s).forcedVx = null; },
  },
};

const defOf = p => SPECIALS[p.def.special.id] || {};

// 게이지가 찼을 때 match 가 부른다. 이미 발동 중이면 false.
export function activateSpecial(match, side) {
  const p = match.world.players[side];
  if (p.active) return false;
  const s = p.def.special;
  p.active = { id: s.id, t: s.duration, armed: s.kind === 'oneshot', data: {} };
  defOf(p).activate?.(match, side);
  return true;
}

// 매 틱: mods 를 기본값으로 되돌린 뒤 발동 중인 필살기가 다시 채운다 (누적 금지). 끝나면 specialEnd.
export function updateSpecials(match, dt) {
  const events = [];
  for (const side of ['L', 'R']) {
    const p = match.world.players[side];
    p.mods = defaultMods();
  }
  for (const side of ['L', 'R']) {
    const p = match.world.players[side];
    if (!p.active) continue;
    p.active.t -= dt;
    const ev = defOf(p).update?.(match, side, dt);
    if (ev) events.push(...ev);
    if (p.active && p.active.t <= 0) {
      defOf(p).end?.(match, side);
      events.push({ type: 'specialEnd', side, id: p.active.id });
      p.active = null;
    }
  }
  return events;
}

// 물리가 킥·터치 순간에 부르는 훅
export function specialHooks(match) {
  return {
    onKick: side => { const p = match.world.players[side]; return p.active ? (defOf(p).onKick?.(match, side) ?? false) : false; },
    onBallTouch: (side, info) => { const p = match.world.players[side]; if (p.active) defOf(p).onBallTouch?.(match, side, info); },
  };
}
