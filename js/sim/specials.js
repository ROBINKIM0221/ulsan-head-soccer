// 필살기. 공통 뼈대(발동·지속·종료)는 여기, 각 필살기의 효과는 SPECIALS 표에 채운다 (Task 5~7).
import { defaultMods } from './physics.js';

// SPECIALS[id] = { activate(match, side), update(match, side, dt) -> Event[], end(match, side),
//                  onKick(match, side) -> boolean, onBallTouch(match, side, info) }
export const SPECIALS = {};

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
