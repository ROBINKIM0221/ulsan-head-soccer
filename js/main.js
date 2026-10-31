// 부팅과 경기 루프. 화면 흐름(선수 선택·결과)은 ui/screens.js (Task 10).
import { PLAYERS, byNumber } from './data/players.js';
import { createMatch, stepMatch, requestSubstitute, resumeFromSub } from './sim/match.js';
import { mulberry32 } from './sim/rng.js';
import { createLoop } from './loop.js';
import { createFx, pushEvents, updateFx, drawFrame, drawCountdown } from './render/scene.js';
import { createInput } from './ui/input.js';
import { fitStage } from './ui/orientation.js';
import { PARTY_LEN } from './render/party.js';
import { unlockSound, soundLog, audioState } from './sound.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hint = document.getElementById('hint');
const subBtn = stage.querySelector('[data-btn="sub"]');
const menuBtn = stage.querySelector('.sub.menu');
const params = new URLSearchParams(location.search);

const loadImage = src => new Promise(res => { const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = src; });
// 선수마다 { photo: 동그란 사진용 원본, cut: 배경 뺀 컷아웃(경기용) }
function loadImages() {
  return Promise.all(PLAYERS.map(async p => [p.number, { photo: await loadImage(p.img), cut: await loadImage(p.img.replace(/\.jpg$/, 'c.png')) }]))
    .then(pairs => Object.fromEntries(pairs));
}

function layout() {
  const r = fitStage(stage, canvas);
  if (r.rotated && !layout.hinted) {
    layout.hinted = true;
    hint.hidden = false;
    setTimeout(() => { hint.style.opacity = '0'; setTimeout(() => { hint.hidden = true; }, 400); }, 2000);
  }
  return r;
}

const game = { match: null, fx: null, loop: null, input: null, imgs: null, paused: false, countdown: null, countdownTimer: null, ui: null, quit: null };

export function startMatch(home, away, difficulty, { kit, onSubRequest, onOver, debugSpecial } = {}) {
  if (game.loop) game.loop.stop();
  const match = createMatch({ home, away, difficulty, kit, rng: mulberry32((Date.now() >>> 0) || 1) });
  if (debugSpecial) match.world.players.L.gauge = 100;
  const fx = createFx();
  fx.reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  game.match = match; game.fx = fx;
  game.input.setEnabled(true);
  subBtn.disabled = false; menuBtn.disabled = false;

  let overNotified = false;
  const step = dt => {
    const inputs = game.input.read();
    const events = stepMatch(match, inputs, dt);
    pushEvents(fx, events, match);
    updateFx(fx, match, dt);
    for (const e of events) {
      if (e.type === 'phase' && e.phase === 'sub') { game.input.setEnabled(false); game.loop.stop(); onSubRequest?.(match); }   // 선택하는 동안 루프도 쉰다
      if (e.type === 'phase' && e.phase === 'over' && !overNotified) {
        overNotified = true; game.input.setEnabled(false);
        const wait = match.result === 'win' ? PARTY_LEN * 1000 : 1300;   // 이기면 세레모니가 끝날 때까지, 아니면 GOAL 연출까지만 돌린다
        setTimeout(() => { if (game.match === match) game.loop.stop(); }, wait);
        onOver?.(match, wait - 100);
      }
    }
    subBtn.disabled = match.subUsed.L || !(match.phase === 'play' || match.phase === 'golden');   // 킥오프·골 연출 중엔 눌러도 소용없으니 꺼 둔다
    menuBtn.disabled = match.phase === 'over' || match.phase === 'sub';
  };
  const render = () => drawFrame(ctx, match, game.imgs, fx, performance.now() / 1000);
  game.loop = createLoop({ step, render });
  game.loop.start();
  window.__debug = { match, get world() { return match.world; }, fx, get loop() { return game.loop; }, get countdown() { return game.countdown; }, sounds: soundLog, get audio() { return audioState(); } };   // 콘솔·검사 스크립트용
  return match;
}

// 교체 선택이 끝났을 때 (newDef 가 null 이면 교체 없이 복귀)
export function finishSubstitution(newDef) {
  const ev = resumeFromSub(game.match, newDef);
  if (ev) pushEvents(game.fx, [ev], game.match);
  game.input.setEnabled(true);
  if (!document.hidden) game.loop.start();
}

// 복귀 카운트다운: 루프는 멈춘 채 3·2·1 을 직접 그리고, 끝나면 재개. 도중에 다시 숨겨지면 취소.
function startCountdown() {
  let n = 3;
  const tick = () => {
    game.countdownTimer = null;
    if (document.hidden || !game.match) { game.countdown = null; return; }
    if (game.match.phase === 'over' || n === 0) { game.countdown = null; game.loop.start(); return; }
    game.countdown = n;
    drawFrame(ctx, game.match, game.imgs, game.fx, performance.now() / 1000);
    drawCountdown(ctx, n);
    n--;
    game.countdownTimer = setTimeout(tick, 900);
  };
  tick();
}

// 일시정지 메뉴: 메뉴 버튼 또는 Esc. 계속하기는 3·2·1 뒤 재개, 메인으로는 선수 선택 화면 (2026-10-31 형준: "경기 중에 메인으로 돌아가는 키")
function pauseMatch() {
  const m = game.match;
  if (!m || m.phase === 'over' || m.phase === 'sub' || !game.loop.running) return;
  game.loop.stop(); game.input.setEnabled(false);
  game.ui.showPause({
    onResume: () => { game.ui.hideOverlay(); startCountdown(); },
    onQuit: () => { game.ui.hideOverlay(); game.match = null; subBtn.disabled = menuBtn.disabled = true; game.quit(); },
  });
}

// 탭이 숨겨지면 멈추고, 돌아오면 3초 세고 재개
function pauseOnHide() {
  document.addEventListener('visibilitychange', () => {
    if (!game.loop) return;
    if (document.hidden) {
      if (game.countdownTimer) { clearTimeout(game.countdownTimer); game.countdownTimer = null; game.countdown = null; game.paused = true; }
      if (game.loop.running) { game.loop.stop(); game.paused = true; }
    } else if (game.paused) {
      game.paused = false;
      startCountdown();
    }
  });
}

async function boot() {
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 50));
  game.input = createInput(stage);   // 키보드를 쓰기 시작하면 CSS(.kb)가 터치 버튼을 숨긴다
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, unlockSound, { capture: true });   // 첫 입력에서 오디오 잠금 해제
  game.imgs = await loadImages();
  pauseOnHide();

  const { runFlow, showResult, showSubSelect, hideOverlay, showPause } = await import('./ui/screens.js');
  game.ui = { showPause, hideOverlay };
  menuBtn.addEventListener('click', pauseMatch);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') pauseMatch(); });   // 시트가 떠 있을 때의 Esc 는 시트가 먼저 먹는다
  const dbg = params.get('debug');
  if (dbg === '1' || dbg === 'result' || dbg === 'sub') {
    // 선택 화면 없이 바로: 이동경 vs 야고 (1군). ?special=1 이면 L 게이지 100 으로 시작, &kit=third 로 유니폼
    const home = byNumber(Number(params.get('home') || 10)), away = byNumber(Number(params.get('away') || 99));
    game.quit = () => location.reload();
    const match = startMatch(home, away, params.get('difficulty') || 'first', {
      kit: params.get('kit') || 'home', debugSpecial: params.get('special') === '1',
      onSubRequest: m => showSubSelect({ imgs: game.imgs, kits: m.kits.L, exclude: [m.used.L.at(-1).number, m.used.R.at(-1).number],
        onPick: d => { hideOverlay(); finishSubstitution(d); }, onCancel: () => { hideOverlay(); finishSubstitution(null); } }),
      onOver: (m, wait) => setTimeout(() => showResult({ match: m, onAgain: () => location.reload(), onChange: () => location.reload() }), wait),
    });
    if (dbg === 'result') { match.scores.L = 3; match.scores.R = 1; match.phase = 'over'; match.result = 'win'; game.loop.stop();
      match.used.R.push(byNumber(96)); match.goals = [{ side: 'L', number: 10 }, { side: 'L', number: 10 }, { side: 'L', number: 10 }, { side: 'R', number: 96 }];   // 교체·골 수 표시 확인용
      showResult({ match, onAgain: () => location.reload(), onChange: () => location.reload() }); }
    if (dbg === 'sub') setTimeout(() => { requestSubstitute(match, 'L'); game.input.setEnabled(false);
      showSubSelect({ imgs: game.imgs, kits: match.kits.L, exclude: [10, 99], onPick: d => { hideOverlay(); finishSubstitution(d); }, onCancel: () => { hideOverlay(); finishSubstitution(null); } }); }, 1500);
    return;
  }
  const flow = runFlow({ startMatch, finishSubstitution, imgs: game.imgs, stage });
  game.quit = flow.toSelect;
}

boot();
