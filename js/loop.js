// 고정 시간 간격 루프. 물리는 DT 마다 step(dt), 화면은 프레임마다 render(alpha).
// 한 프레임에 쌓이는 시간은 maxFrame 으로 자른다: 탭이 멈췄다 돌아와도 시계가 한꺼번에 뛰지 않는다.
import { DT } from './sim/constants.js';

export function createLoop({ step, render, dt = DT, maxFrame = 0.25 }) {
  let last = null, acc = 0, rafId = null, running = false;

  function tick(tMs) {
    if (last === null) last = tMs;
    acc += Math.min(maxFrame, Math.max(0, (tMs - last) / 1000));
    last = tMs;
    while (acc >= dt) { step(dt); acc -= dt; }
    render(acc / dt);
  }

  function frame(tMs) {
    if (!running) return;
    tick(tMs);
    rafId = requestAnimationFrame(frame);
  }

  return {
    tick,
    start() { if (running) return; running = true; last = null; acc = 0; rafId = requestAnimationFrame(frame); },
    stop() { running = false; if (rafId !== null) cancelAnimationFrame(rafId); rafId = null; },
    get running() { return running; },
  };
}
