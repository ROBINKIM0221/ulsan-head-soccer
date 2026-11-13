// 필살기. 공통 뼈대(발동·지속·종료)는 아래쪽, 각 필살기의 효과는 SPECIALS 표. 수치는 설계서 9절.
import { FIELD, PHYS, DT } from './constants.js';
import { defaultMods, headCenter } from './physics.js';

const dir = side => (side === 'L' ? 1 : -1);          // 상대 골문 방향
const opp = side => (side === 'L' ? 'R' : 'L');
const me = (m, s) => m.world.players[s];
const rad = deg => deg * Math.PI / 180;
const onGround = b => b.y + b.r >= FIELD.GROUND - 0.5;

// 한 방형이 공을 쏜 뒤, 공이 바닥에 닿거나 되돌아오면 비행 표시를 지운다
function flightOver(b, data, dirX) {
  if (!data.left && !onGround(b)) data.left = true;
  return (data.left && onGround(b)) || Math.sign(b.vx) === -dirX;
}

// SPECIALS[id] = { activate(match, side), update(match, side, dt) -> Event[]|undefined, end(match, side),
//                  onKick(match, side) -> boolean, onBallTouch(match, side, info) }
// 몸싸움 미끄러짐(거인·높이뛰기·투지): 발동 중 몸이 닿은 상대는 0.8초 넘어지고 320px/s 로 밀린다. 한 번 넘어뜨리면 1.5초 동안은 다시 안 건드린다.
// 2026-11-01 형준 "김영권 정승현 조현택 최석현은 부딪히면 상대방 미끄러지는것도 추가". 기관차에 붙들린 상대는 제외.
const SLIP = 0.8, SLIP_COOL = 1.5;
const CURVE_V = 1050, CURVE_CLOSE = 190, CURVE_AIM_Y = 480, CURVE_MIN_AX = 250, CURVE_MIN_VX = 350;   // 커브 슛 조준 (curve.onKick)
export const SLIP_SPECIALS = ['giant', 'highjump', 'spirit'];   // 화면이 발밑 고리로 '지금 닿으면 미끄러진다'를 보여 주는 데 쓴다
function slipOnContact(m, s, dt) {
  const p = me(m, s), o = me(m, opp(s)), d = p.active.data;
  d.cool = Math.max(0, (d.cool || 0) - dt);
  const touching = Math.abs(o.x - p.x) < (PHYS.BODY_W * (p.scale + o.scale)) / 2 + 6 && o.y > p.y - PHYS.BODY_H * p.scale - 20;
  if (d.cool > 0 || !touching || o.pinned) return;
  o.vx = 320 * Math.sign(o.x - p.x || dir(s)); o.stun = Math.max(o.stun, SLIP); d.cool = SLIP_COOL;
  return [{ type: 'knockdown', side: opp(s) }];
}

// 잡은 공의 위치(머리 위 기준, t = 잡은 뒤 지난 초, dirX = 상대 골문 방향): 0.15초 고정 → 0.3초까지 뒤로 22px 당기며 살짝 들고 → 0.4초에 앞으로 26px 휘두르며 놓는다
export const CATCH_HOLD = 0.4;
export function holdOffset(t, dirX) {
  if (t < 0.15) return { dx: 0, dy: 0 };
  if (t < 0.3) { const k = (t - 0.15) / 0.15; return { dx: -dirX * 22 * k, dy: -8 * k }; }
  const k = Math.min(1, (t - 0.3) / 0.1); return { dx: dirX * (-22 + 48 * k), dy: -8 - 6 * k };
}

export const SPECIALS = {
  // ── 지속형 ──
  // 밸런스 2026-10-31: 1.8→2.0, 달리는 기세로 킥 1.35배 (승률 15%→21%)
  sprint: { update(m, s) { const p = me(m, s); p.mods.speed *= 2.0; p.mods.kickPow *= 1.35; } },

  // 밸런스 2026-10-31: 점프 1.5→1.35(AI 가 너무 높이 떠서 공을 놓침), 헤딩 ×2.0 (승률 26%→18%→14%→4%)
  highjump: { update(m, s, dt) { const p = me(m, s); p.mods.jump *= 1.4; p.mods.headPow *= 2.2; p.mods.speed *= 1.2; return slipOnContact(m, s, dt); } },   // 몸이 가벼워져 조금 빨라진다 (새 물리에서 25%)

  giant: {
    activate(m, s) { me(m, s).scale = 1.3; },   // 밸런스 2026-10-31: 1.7→1.5→1.4→1.3 (새 물리에서 66%)
    update(m, s, dt) { const p = me(m, s); p.mods.speed *= 0.8; p.mods.headPow *= 1.2; return slipOnContact(m, s, dt); },
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
        o.vx = 400 * dir(s); o.stun = Math.max(o.stun, 0.8); d.hit = true;   // 밸런스 2026-10-31: 비틀거림 0.4→0.8 (승률 26%)
        return [{ type: 'knockback', side: opp(s) }];
      }
    },
    onBallTouch(m, s, info) { if (info.part === 'head') { const d = me(m, s).active.data; d.headT = m.world.t; d.hit = false; } },
  },

  // 반지름 400 안의 자유로운 공을 발 앞으로 끌어당긴다 (가까울수록 세게, 최대 4000px/s²)
  magnet: {
    update(m, s, dt) {
      const p = me(m, s), b = m.world.ball;
      p.mods.magnet = true;
      if (b.flight || b.held || b.attached) return;
      // 밸런스 2026-10-31: 머리가 아니라 발 앞(x+40, y-30)으로 끌어와 바로 찰 수 있게; 반지름 400, 가속 4000 (승률 32%→17%)
      if (b.lastTouch && b.lastTouch.side === s && m.world.t - b.lastTouch.t < 0.4) return;   // 내가 찬 공은 0.4초 동안 놓아준다
      const tx = p.x + dir(s) * 40, ty = p.y - 30;
      const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
      if (d > 400 || d < 1) return;
      const a = 4000 * (1 - d / 400);
      b.vx += a * dx / d * dt; b.vy += a * dy / d * dt;
    },
  },

  // ── 다음 한 방형 ──
  // 다음 킥: 1200 직선, 0.8초 중력 없음, 상대를 통과. 골문 안의 한 점(위아래 30px 안쪽)을 조준하고 ±2° 오차 → 어디서 쏘든 골문 근처 (2026-11-01 형준 "100프로는 아니더라도 골문 근처로"; 전엔 20° 고정이라 510px 밖에선 지붕)
  laser: {
    onKick(m, s) {
      const p = me(m, s), b = m.world.ball;
      if (!p.active.armed) return false;
      p.active.armed = false; p.active.t = 0.8;
      const gx = dir(s) > 0 ? FIELD.W : 0, ty = FIELD.GROUND - 30 - m.rng() * (FIELD.GOAL_H - 60);
      const ang = Math.atan2(ty - b.y, gx - b.x) + rad((m.rng() - 0.5) * 4);
      b.vx = 1200 * Math.cos(ang); b.vy = 1200 * Math.sin(ang);
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

  // 다음 킥: 55°·1050 으로 띄우고 상대 골문 쪽으로 휘어(가로 가속) 크로스바 밑으로 떨어진다. 처음 0.35초만 상대를 통과한다 (밸런스 2026-10-31: 통과가 상시면 승률 97%).
  // 조준(2026-11-13 형준, 슛의 22%만 골이라고 알리자 "ㄱㄱ"): 전엔 가속이 900 고정이라 자기 진영에서 차야 들어가고 중간 거리에서는 크로스바를 넘었다.
  // 이제 띄우는 높이는 그대로 두고, 공 앞끝이 골라인에 닿는 자리에서 내려오는 공의 높이가 CURVE_AIM_Y 가 되도록 가로 초속과 가속을 푼다.
  // 멀면 55° 그대로 떠서 골문 쪽으로 가속해 휘어 들어가고(가속 CURVE_MIN_AX 이상), 가까워질수록 가로 초속을 줄이며, CURVE_MIN_VX 까지 줄이고도 남으면 가속이 음수가 되어 뚝 떨어진다.
  // (초속 하한: 그보다 느리게 띄우면 공이 찬 선수 자기 머리에 맞는다.)
  // 골라인에서 CURVE_CLOSE 안쪽이면 띄우지 않고 20°로 낮게 깔아 찬다(공중에서 차도 크로스바에 안 걸린다). 막는 법은 그대로: 골문 앞을 지키거나 뛰어서 머리로.
  curve: {
    onKick(m, s) {
      const p = me(m, s), b = m.world.ball, d = dir(s);
      if (!p.active.armed) return false;
      p.active.armed = false; p.active.t = 2.5; p.active.data.left = false; p.active.data.flightT = 0;
      const dist = ((d > 0 ? FIELD.W - FIELD.GOAL_DEPTH - b.r : FIELD.GOAL_DEPTH + b.r) - b.x) * d;   // 공 앞끝이 골라인에 닿는 자리까지
      const close = dist <= CURVE_CLOSE, deg = close ? 20 : 55;
      let vx = CURVE_V * Math.cos(rad(deg)), ax = 900;
      const vy0 = -CURVE_V * Math.sin(rad(deg));
      if (!close) {
        // 떠서 AIM_Y 로 다시 내려올 때까지 물리(stepPhysics 의 공)와 같은 식으로 센다. 그동안 가로로 가는 거리 = s1·초속 + s2·가속
        let vy = vy0, y = b.y, s1 = 0, s2 = 0, u = 1, w = 0;
        for (let i = 0; i < 480 && !(vy > 0 && y >= CURVE_AIM_Y); i++) {
          vy = (vy + PHYS.BALL_GRAVITY * DT) * PHYS.DRAG; y += vy * DT;
          u *= PHYS.DRAG; w = (w + DT) * PHYS.DRAG; s1 += u * DT; s2 += w * DT;
        }
        vx = Math.max(CURVE_MIN_VX, Math.min(vx, (dist - CURVE_MIN_AX * s2) / s1)); ax = (dist - vx * s1) / s2;
      }
      b.vx = d * vx; b.vy = vy0;
      b.flight = 'curve'; b.curveAx = ax * d; b.passThrough = opp(s);
      return true;
    },
    update(m, s, dt) {
      const p = me(m, s), b = m.world.ball;
      if (p.active.armed || b.flight !== 'curve') return;
      p.active.data.flightT += dt;
      if (p.active.data.flightT > 0.35) b.passThrough = null;   // 머리 위를 넘긴 뒤에는 골문 앞에서 막을 수 있다 (밸런스 2026-10-31: 통과 상시면 97%)
      if (flightOver(b, p.active.data, dir(s))) { SPECIALS.curve.end(m, s); p.active.t = 0; }
    },
    end(m, s) { const b = m.world.ball; if (b.flight === 'curve') { b.flight = null; b.curveAx = 0; b.passThrough = null; } },
  },

  // 투지 폭발 (조현택): 5초간 더 빠르고 높이 뛰며, 넘어지지 않고, 몸싸움에서 상대를 튕겨낸다 (1초에 한 번)
  spirit: {
    update(m, s, dt) {
      const p = me(m, s);
      p.mods.speed *= 1.3; p.mods.jump *= 1.2;
      p.stun = 0;                                            // 대포·몸싸움에 넘어지지 않는다 (오프사이드 트랩에는 선다: 넘어지는 것이 아니다)
      return slipOnContact(m, s, dt);
    },
  },

  // 내 골문 쪽으로 오는 공이 머리 위 150 안을 지나면 잡아 0.4초 뒤 40°·1100 으로 던진다.
  // 잡은 공은 holdOffset 대로 머리 위 → 뒤로 → 앞으로 휘둘러 놓는다. 그리기(장갑 자세)는 d.holdT·d.threw 를 본다 (2026-11-01 형준 "잡아서 던지는 모습을 좀더 리얼하게")
  catch: {
    update(m, s, dt) {
      const p = me(m, s), b = m.world.ball, d = p.active.data;
      p.mods.catchArmed = true;
      const h = headCenter(p);
      if (d.threw !== undefined) d.threw += dt;   // 던진 뒤 지난 시간: 팔을 뻗은 자세로 잠깐 머문다
      if (d.holding) {
        d.holdT += dt; b.held.t -= dt;
        const o = holdOffset(d.holdT, dir(s));
        b.x = h.x + o.dx; b.y = h.y - h.r - b.r - 4 + o.dy;
        if (b.held.t <= 0) {
          b.held = null; d.holding = false; d.threw = 0;
          b.vx = dir(s) * 1100 * Math.cos(rad(40)); b.vy = -1100 * Math.sin(rad(40));
          return [{ type: 'throw', side: s }];
        }
        return;
      }
      if (b.held || b.attached || b.flight) return;
      const towardMyGoal = b.vx * dir(s) < 0;
      const inZone = Math.abs(b.x - h.x) <= h.r + b.r + 40 && b.y < h.y && b.y > h.y - h.r - 150;
      if (towardMyGoal && inZone) {
        b.held = { side: s, t: CATCH_HOLD }; b.vx = 0; b.vy = 0; d.holding = true; d.holdT = 0; delete d.threw;
        return [{ type: 'catch', side: s }];
      }
    },
    end(m, s) { const b = m.world.ball; if (b.held && b.held.side === s) b.held = null; },
  },

  // 기관차: 3초 동안 1.25배 크기·1.1배 속도·점프 불가. 공이 앞면에 닿으면 붙여서 0.4초(≈280px) 돌진,
  // 길에 있는 바닥의 상대는 공 앞에 붙어 함께 밀린다. 돌진이 끝나면 공을 놓는다.
  train: {
    activate(m, s) { const p = me(m, s); p.scale = 1.25; p.active.data = { charging: false, done: false, chargeT: 0 }; },   // 밸런스 2026-10-31: 크기 1.4→1.25
    update(m, s, dt) {
      const p = me(m, s), o = me(m, opp(s)), b = m.world.ball, d = p.active.data;
      p.mods.canJump = false; p.mods.speed *= 1.1;   // 밸런스 2026-10-31: 1.5→1.3→1.2→1.1 (새 물리에서 75%)
      const half = PHYS.BODY_W * p.scale / 2;
      if (!d.charging) {
        if (d.done || b.held || b.attached || b.flight) return;
        const dx = (b.x - p.x) * dir(s);
        const inFront = dx > 0 && dx <= half + b.r + 8;
        const vertical = b.y > p.y - (PHYS.BODY_H + 2 * PHYS.HEAD_R) * p.scale - b.r && b.y <= p.y + b.r;
        if (inFront && vertical) { b.attached = s; d.charging = true; d.chargeT = 0; p.forcedVx = 700 * dir(s); p.noSeparate = true; }
        return;
      }
      if (b.attached !== s) { p.active.t = 0; return; }        // 득점 뒤 킥오프 등으로 공이 떨어졌으면 끝
      d.chargeT += dt;
      // 공은 기관차 앞에 붙어 가고, 기관차가 골라인에 막혀도 공은 계속 굴러 들어간다
      const front = p.x + dir(s) * half;
      const rolled = b.x + 700 * dir(s) * dt;
      b.x = dir(s) > 0 ? Math.max(rolled, front + b.r) : Math.min(rolled, front - b.r);
      b.y = FIELD.GROUND - b.r; b.vx = 700 * dir(s); b.vy = 0;
      const oHalf = PHYS.BODY_W * o.scale / 2;
      const grounded = o.y > FIELD.GROUND - PHYS.BODY_H * 1.4;
      const ahead = (o.x - b.x) * dir(s);
      if (!o.pinned && grounded && ahead > -oHalf && ahead < b.r + oHalf + 4) o.pinned = true;
      if (o.pinned) o.x = b.x + dir(s) * (b.r + oHalf);         // 골라인에서는 physics 가 잘라 세운다
      if (d.chargeT >= 0.35) {                                   // 밸런스 2026-10-31: 0.75→…→0.4→0.35초 (새 물리에서 72%)
        b.attached = null; o.pinned = false; p.forcedVx = null; p.noSeparate = false;
        d.charging = false; d.done = true;
      }
    },
    end(m, s) {
      const p = me(m, s), o = me(m, opp(s)), b = m.world.ball;
      p.scale = 1; p.forcedVx = null; p.noSeparate = false; o.pinned = false;
      if (b.attached === s) { b.attached = null; b.vx = 0; b.vy = 0; }
    },
  },

  // 오프사이드 트랩 (최석현): 부심 깃발이 올라가고 상대가 1.5초 그 자리에 선다 — 이동·점프·킥 불가, 공중이면 그대로 떨어진다. 몸은 그대로라 공은 맞고 튄다.
  // 2026-11-13 형준 "슬라이딩이 잘 안나오는데, 그냥 필살기를 바꾸면 좋겠다" → 후보 넷 중 "오프사이드 트랩… 이거 해보자".
  // 전 필살기 슬라이딩(0.5초 미끄러지며 공을 걷어내고 상대를 넘어뜨림)은 게이지가 차는 순간 앞에 공·상대가 없으면 헛돌았다. 이건 어디서 터져도 효과가 보인다.
  // 묶인 시간은 상대 몸의 frozen 이고 물리가 센다: 킥오프 재배치가 지우고(골을 먹고도 묶여 있지 않게), 최석현이 교체로 나가면 end 가 푼다. 돌진 중인 기관차는 못 세운다.
  offside: {
    activate(m, s) { me(m, opp(s)).frozen = me(m, s).active.t; },
    end(m, s) { me(m, opp(s)).frozen = 0; },
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

// 발동 중인 필살기를 즉시 끝낸다 (교체 등). 공에 남긴 표시(비행·통과·붙음)도 end() 가 지운다.
export function endSpecial(match, side) {
  const p = match.world.players[side];
  if (!p.active) return false;
  defOf(p).end?.(match, side);
  p.active = null;
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
