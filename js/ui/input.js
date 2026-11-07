// 화면 버튼(포인터, 멀티터치)과 키보드를 Inputs 로 모은다.
// left/right/jump 는 누르고 있는 동안, kick/special/sub 는 "이번에 눌림"(read 하면 소비).
// 키는 이동·점프·슛뿐 (2026-10-31 형준: 단순하게). 필살기는 자동, 교체는 화면 버튼으로만.
// 1인: KEYS 전부 왼쪽(L). 2인(2026-11-07 형준 "선수 두 명이 하게"): 한 키보드를 반씩 — 왼쪽 선수 WASD+F, 오른쪽 선수 방향키+Enter(/ 도 됨). 화면 버튼은 항상 L.
export const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  KeyZ: 'kick', KeyK: 'kick',
};
export const KEYS_2P = {
  L: { KeyA: 'left', KeyD: 'right', KeyW: 'jump', KeyF: 'kick' },
  R: { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', Enter: 'kick', Slash: 'kick' },
};

export function createInput(root, { onKeyboard } = {}) {
  const fresh = () => ({ held: { left: false, right: false, jump: false }, edges: { kick: false, special: false, sub: false, jump: false } });   // jump 도 눌림을 기억: 프레임 사이의 짧은 탭을 놓치지 않게
  const sides = { L: fresh(), R: fresh() };
  const clear = () => { for (const s of Object.values(sides)) { for (const k in s.held) s.held[k] = false; for (const k in s.edges) s.edges[k] = false; } };
  const pointers = new Map();
  let enabled = true, two = false;

  const press = (side, name) => { if (!enabled) return; const s = sides[side]; if (name in s.held) s.held[name] = true; if (name in s.edges) s.edges[name] = true; };
  const release = (side, name) => { const s = sides[side]; if (name in s.held) s.held[name] = false; };

  const onDown = e => {
    const name = e.currentTarget.dataset.btn;
    pointers.set(e.pointerId, name);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 일부 브라우저 */ }
    e.currentTarget.classList.add('down');
    press('L', name);
    e.preventDefault();
  };
  const onUp = e => {
    const name = pointers.get(e.pointerId);
    if (name === undefined) return;
    pointers.delete(e.pointerId);
    release('L', name);
    e.currentTarget.classList.remove('down');
  };
  for (const b of root.querySelectorAll('[data-btn]')) {
    b.addEventListener('pointerdown', onDown);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, onUp);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }

  const onKey = (e, down) => {
    const side = two ? (e.code in KEYS_2P.L ? 'L' : e.code in KEYS_2P.R ? 'R' : null) : (KEYS[e.code] ? 'L' : null);
    if (!side) return;
    const name = two ? KEYS_2P[side][e.code] : KEYS[e.code];
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (!enabled) return;                       // 선택·결과 화면 위에서는 Space/Enter 가 버튼을 누르게 둔다
    e.preventDefault();
    if (down) {
      if (!e.repeat) press(side, name);
      if (!root.classList.contains('kb')) { root.classList.add('kb'); onKeyboard?.(); }
    } else release(side, name);
  };
  window.addEventListener('keydown', e => onKey(e, true));
  window.addEventListener('keyup', e => onKey(e, false));
  window.addEventListener('blur', () => { for (const s of Object.values(sides)) for (const k in s.held) s.held[k] = false; });

  return {
    read(side = 'L') {
      const { held, edges } = sides[side];
      const out = { left: held.left, right: held.right, jump: held.jump || edges.jump, kick: edges.kick, special: edges.special, sub: edges.sub };
      edges.kick = edges.special = edges.sub = edges.jump = false;
      return out;
    },
    setEnabled(v) { enabled = v; if (!v) clear(); },
    setTwoPlayer(v) { two = !!v; clear(); },
  };
}
