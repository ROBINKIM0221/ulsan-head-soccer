// 필살기. 공통 뼈대(발동·지속·종료)는 아래쪽, 각 필살기의 효과는 SPECIALS 표. 수치는 설계서 9절.
import { defaultMods, headCenter } from './physics.js';

const dir = side => (side === 'L' ? 1 : -1);          // 상대 골문 방향
const opp = side => (side === 'L' ? 'R' : 'L');
const me = (m, s) => m.world.players[s];

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
