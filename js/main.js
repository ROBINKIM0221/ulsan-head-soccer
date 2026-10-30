// 부팅과 경기 루프. 화면 흐름(선수 선택·결과)은 ui/screens.js (Task 10).
import { PLAYERS, byNumber } from './data/players.js';
import { createMatch, stepMatch, requestSubstitute, resumeFromSub } from './sim/match.js';
import { mulberry32 } from './sim/rng.js';
import { createLoop } from './loop.js';
import { createFx, pushEvents, updateFx, drawFrame } from './render/scene.js';
import { createInput } from './ui/input.js';
import { fitStage } from './ui/orientation.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hint = document.getElementById('hint');
const specialBtn = stage.querySelector('[data-btn="special"]');
const subBtn = stage.querySelector('[data-btn="sub"]');
const params = new URLSearchParams(location.search);

function loadImages() {
  return Promise.all(PLAYERS.map(p => new Promise(res => {
    const img = new Image();
    img.onload = () => res([p.number, img]);
    img.onerror = () => res([p.number, null]);
    img.src = p.img;
  }))).then(pairs => Object.fromEntries(pairs));
}

function layout() {
  const r = fitStage(stage, canvas, { padsVisible: !stage.classList.contains('kb') });
  if (r.rotated && !layout.hinted) {
    layout.hinted = true;
    hint.hidden = false;
    setTimeout(() => { hint.style.opacity = '0'; setTimeout(() => { hint.hidden = true; }, 400); }, 2000);
  }
  return r;
}

const game = { match: null, fx: null, loop: null, input: null, imgs: null, paused: false };

export function startMatch(home, away, difficulty, { onSubRequest, onOver, debugSpecial } = {}) {
  if (game.loop) game.loop.stop();
  const match = createMatch({ home, away, difficulty, rng: mulberry32((Date.now() >>> 0) || 1) });
  if (debugSpecial) match.world.players.L.gauge = 100;
  const fx = createFx();
  game.match = match; game.fx = fx;
  game.input.setEnabled(true);
  subBtn.disabled = false;

  let overNotified = false;
  const step = dt => {
    const inputs = game.input.read();
    const events = stepMatch(match, inputs, dt);
    pushEvents(fx, events, match);
    updateFx(fx, match, dt);
    for (const e of events) {
      if (e.type === 'phase' && e.phase === 'sub') { game.input.setEnabled(false); onSubRequest?.(match); }
      if (e.type === 'phase' && e.phase === 'over' && !overNotified) { overNotified = true; game.input.setEnabled(false); onOver?.(match); }
    }
    const L = match.world.players.L;
    specialBtn.style.setProperty('--gauge', String(L.gauge / 100));
    specialBtn.classList.toggle('ready', L.gauge >= 100 && !L.active);
    subBtn.disabled = match.subUsed.L || (match.phase !== 'play' && match.phase !== 'golden' && match.phase !== 'kickoff' && match.phase !== 'goal');
  };
  const render = () => drawFrame(ctx, match, game.imgs, fx, performance.now() / 1000);
  game.loop = createLoop({ step, render });
  game.loop.start();
  if (params.get('debug')) window.__debug = { match, get world() { return match.world; }, fx };
  return match;
}

// 교체 선택이 끝났을 때 (newDef 가 null 이면 교체 없이 복귀)
export function finishSubstitution(newDef) {
  const ev = resumeFromSub(game.match, newDef);
  if (ev) pushEvents(game.fx, [ev], game.match);
  game.input.setEnabled(true);
}

// 탭이 숨겨지면 멈추고, 돌아오면 3초 세고 재개
function pauseOnHide() {
  document.addEventListener('visibilitychange', () => {
    if (!game.loop) return;
    if (document.hidden) { game.loop.stop(); game.paused = true; }
    else if (game.paused) {
      game.paused = false;
      let n = 3;
      const tick = () => {
        if (!game.match || game.match.phase === 'over') { game.loop.start(); return; }
        if (n === 0) { game.loop.start(); return; }
        game.fx.pops.push({ text: String(n), x: 640, y: 300, size: 120, color: '#FFC72C', life: 0.9, age: 0, rise: 10 });
        drawFrame(ctx, game.match, game.imgs, game.fx, performance.now() / 1000);
        n--; setTimeout(tick, 900);
      };
      tick();
    }
  });
}

async function boot() {
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 50));
  game.input = createInput(stage);
  stage.addEventListener('keydown', () => layout(), { once: true });
  window.addEventListener('keydown', () => { if (stage.classList.contains('kb')) layout(); }, { once: true });
  game.imgs = await loadImages();
  pauseOnHide();

  const { runFlow, showResult, showSubSelect, hideOverlay } = await import('./ui/screens.js');
  const dbg = params.get('debug');
  if (dbg === '1' || dbg === 'result' || dbg === 'sub') {
    // 선택 화면 없이 바로: 이동경 vs 야고 (1군). ?special=1 이면 L 게이지 100 으로 시작
    const home = byNumber(Number(params.get('home') || 10)), away = byNumber(Number(params.get('away') || 99));
    const match = startMatch(home, away, params.get('difficulty') || 'first', {
      debugSpecial: params.get('special') === '1',
      onSubRequest: m => showSubSelect({ imgs: game.imgs, exclude: [m.used.L.at(-1).number, m.used.R.at(-1).number],
        onPick: d => { hideOverlay(); finishSubstitution(d); }, onCancel: () => { hideOverlay(); finishSubstitution(null); } }),
      onOver: m => showResult({ match: m, onAgain: () => location.reload(), onChange: () => location.reload() }),
    });
    if (dbg === 'result') { match.scores.L = 3; match.scores.R = 1; match.phase = 'over'; match.result = 'win'; game.loop.stop();
      showResult({ match, onAgain: () => location.reload(), onChange: () => location.reload() }); }
    if (dbg === 'sub') setTimeout(() => { requestSubstitute(match, 'L'); game.input.setEnabled(false);
      showSubSelect({ imgs: game.imgs, exclude: [10, 99], onPick: d => { hideOverlay(); finishSubstitution(d); }, onCancel: () => { hideOverlay(); finishSubstitution(null); } }); }, 1500);
    return;
  }
  runFlow({ startMatch, finishSubstitution, imgs: game.imgs, stage });
}

boot();
