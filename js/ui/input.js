// 화면 버튼(포인터, 멀티터치)과 키보드를 Inputs 로 모은다.
// left/right/jump 는 누르고 있는 동안, kick/special/sub 는 "이번에 눌림"(read 하면 소비).
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  KeyZ: 'kick', KeyK: 'kick', KeyX: 'special', KeyL: 'special', KeyC: 'sub',
};

export function createInput(root) {
  const held = { left: false, right: false, jump: false };
  const edges = { kick: false, special: false, sub: false, jump: false };   // jump 도 눌림을 기억: 프레임 사이의 짧은 탭을 놓치지 않게
  const pointers = new Map();
  let enabled = true;

  const press = name => { if (!enabled) return; if (name in held) held[name] = true; if (name in edges) edges[name] = true; };
  const release = name => { if (name in held) held[name] = false; };

  const onDown = e => {
    const name = e.currentTarget.dataset.btn;
    pointers.set(e.pointerId, name);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 일부 브라우저 */ }
    e.currentTarget.classList.add('down');
    press(name);
    e.preventDefault();
  };
  const onUp = e => {
    const name = pointers.get(e.pointerId);
    if (name === undefined) return;
    pointers.delete(e.pointerId);
    release(name);
    e.currentTarget.classList.remove('down');
  };
  for (const b of root.querySelectorAll('[data-btn]')) {
    b.addEventListener('pointerdown', onDown);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, onUp);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }

  const onKey = (e, down) => {
    const name = KEYS[e.code];
    if (!name) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    e.preventDefault();
    if (down) { if (!e.repeat) press(name); root.classList.add('kb'); }
    else release(name);
  };
  window.addEventListener('keydown', e => onKey(e, true));
  window.addEventListener('keyup', e => onKey(e, false));
  window.addEventListener('blur', () => { for (const k in held) held[k] = false; });

  return {
    read() {
      const out = { left: held.left, right: held.right, jump: held.jump || edges.jump, kick: edges.kick, special: edges.special, sub: edges.sub };
      edges.kick = edges.special = edges.sub = edges.jump = false;
      return out;
    },
    setEnabled(v) { enabled = v; if (!v) { for (const k in held) held[k] = false; for (const k in edges) edges[k] = false; } },
  };
}
