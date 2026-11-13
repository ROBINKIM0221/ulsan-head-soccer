// 부팅과 경기 루프. 화면 흐름(선수 선택·결과)은 ui/screens.js (Task 10).
import { PLAYERS, byNumber } from './data/players.js';
import { createMatch, stepMatch, requestSubstitute, resumeFromSub } from './sim/match.js';
import { mulberry32 } from './sim/rng.js';
import { createLoop } from './loop.js';
import { createFx, pushEvents, updateFx, drawFrame, drawCountdown, drawBackdrop } from './render/scene.js';
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

// 사진 한 장. 실패하면 0.4초·1.2초 뒤 두 번 더 받아 본다(느린 폰 통신에서 컷아웃이 빠져 동그란 사진으로 나오던 것). 끝내 안 되면 null
const loadImage = (src, tries = 3) => new Promise(res => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => { if (tries > 1) setTimeout(() => loadImage(src + (src.includes('?') ? '' : '?r=' + tries), tries - 1).then(res), tries === 3 ? 400 : 1200); else res(null); };
  img.src = src;
});
// 선수마다 { photo: 동그란 사진용 원본, cut: 배경 뺀 컷아웃(경기용) }
function loadImages() {
  return Promise.all(PLAYERS.map(async p => [p.number, { photo: await loadImage(p.img), cut: await loadImage(p.img.replace(/\.jpg$/, 'c.png')) }]))
    .then(pairs => Object.fromEntries(pairs));
}

const game = { match: null, fx: null, loop: null, input: null, imgs: null, paused: false, countdown: null, countdownTimer: null, ui: null, quit: null, view: undefined };

function layout() {
  const r = fitStage(stage, canvas);
  game.view = r.view;                    // 그릴 때의 시야: 좌우 여백과 화면 위·아래 끝 (ui/orientation.js)
  if (game.fx) game.fx.view = r.view;
  repaint();                             // 캔버스 크기를 바꾸면 지워진다
  if (r.rotated && !layout.hinted) {
    layout.hinted = true;
    hint.hidden = false;
    setTimeout(() => { hint.style.opacity = '0'; setTimeout(() => { hint.hidden = true; }, 400); }, 2000);
  }
  return r;
}

// 루프가 멈춰 있을 때(첫 화면·선택·일시정지·결과 화면 뒤) 한 번 그린다. 경기가 없으면 빈 경기장이 시트 뒤 배경이 된다
function repaint() {
  if (game.loop && game.loop.running) return;
  if (game.match) drawFrame(ctx, game.match, game.imgs || {}, game.fx, performance.now() / 1000);
  else drawBackdrop(ctx, game.view);
}

export function startMatch(home, away, difficulty, { kit, kitR = null, onSubRequest, onOver, debugSpecial, twoPlayer = false } = {}) {
  if (game.loop) game.loop.stop();
  const match = createMatch({ home, away, difficulty, kit, kitR, twoPlayer, rng: mulberry32((Date.now() >>> 0) || 1) });
  if (debugSpecial) match.world.players.L.gauge = 100;
  const fx = createFx();
  fx.reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  fx.view = game.view;
  game.match = match; game.fx = fx;
  game.input.setEnabled(true); game.input.setTwoPlayer(twoPlayer);
  stage.classList.toggle('two', twoPlayer);   // CSS: 터치 패드 숨기고 2인용 키 안내
  subBtn.disabled = false; menuBtn.disabled = false;
  subBtn.style.display = twoPlayer ? 'none' : '';   // 2인은 교체 없음

  let overNotified = false;
  const step = dt => {
    const events = stepMatch(match, game.input.read('L'), dt, twoPlayer ? game.input.read('R') : undefined);
    pushEvents(fx, events, match);
    updateFx(fx, match, dt);
    for (const e of events) {
      if (e.type === 'phase' && e.phase === 'sub') { game.input.setEnabled(false); game.loop.stop(); onSubRequest?.(match); }   // 선택하는 동안 루프도 쉰다
      if (e.type === 'phase' && e.phase === 'over' && !overNotified) {
        overNotified = true; game.input.setEnabled(false);
        const wait = match.result !== 'draw' ? PARTY_LEN * 1000 : 1300;   // 승패가 갈리면 세레모니가 끝날 때까지, 무승부면 GOAL 연출까지만 돌린다
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
    if (game.match.phase === 'over' || n === 0) { game.countdown = null; game.input.setEnabled(game.match.phase !== 'over'); game.loop.start(); return; }   // 일시정지가 꺼 둔 입력을 다시 켠다 (2026-10-31 형준: 재개 뒤 내 선수가 안 움직이는 버그)
    game.countdown = n;
    drawFrame(ctx, game.match, game.imgs, game.fx, performance.now() / 1000);
    drawCountdown(ctx, n, game.view);
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
    onQuit: () => { game.ui.hideOverlay(); subBtn.disabled = menuBtn.disabled = true; game.quit(); },
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
  // 선택 카드의 등번호는 캔버스에 한 번만 그리니 Teko 를 잠깐 기다린다 (못 받아도 1.5초 뒤엔 그냥 간다)
  const teko = document.fonts && document.fonts.load ? Promise.race([document.fonts.load('600 20px Teko'), new Promise(r => setTimeout(r, 1500))]).catch(() => {}) : null;
  [game.imgs] = await Promise.all([loadImages(), teko]);
  pauseOnHide();

  const { runFlow, showResult, showSubSelect, hideOverlay, showPause } = await import('./ui/screens.js');
  game.ui = { showPause, hideOverlay };
  menuBtn.addEventListener('click', pauseMatch);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') pauseMatch(); });   // 시트가 떠 있을 때의 Esc 는 시트가 먼저 먹는다
  const dbg = params.get('debug');
  if (dbg === '1' || dbg === 'result' || dbg === 'sub') {
    // 선택 화면 없이 바로: 이동경 vs 야고 (1군). ?special=1 이면 L 게이지 100 으로 시작, &kit=third 로 유니폼, &two=1 이면 2인 대전
    hideOverlay();   // index.html 의 로딩 화면은 선택 화면이 덮어쓰는데, 디버그는 선택 화면이 없다
    const home = byNumber(Number(params.get('home') || 10)), away = byNumber(Number(params.get('away') || 99));
    game.quit = () => location.reload();
    const match = startMatch(home, away, params.get('difficulty') || 'first', {
      kit: params.get('kit') || 'home', debugSpecial: params.get('special') === '1', twoPlayer: params.get('two') === '1',
      onSubRequest: m => showSubSelect({ imgs: game.imgs, kits: m.kits.L, exclude: [m.used.L.at(-1).number, m.used.R.at(-1).number],
        onPick: d => { hideOverlay(); finishSubstitution(d); }, onCancel: () => { hideOverlay(); finishSubstitution(null); } }),
      onOver: (m, wait) => setTimeout(() => showResult({ match: m, imgs: game.imgs, onAgain: () => location.reload(), onChange: () => location.reload() }), wait),
    });
    if (dbg === 'result') { match.scores.L = 3; match.scores.R = 1; match.phase = 'over'; match.result = 'win'; game.loop.stop();
      match.used.R.push(byNumber(96)); match.goals = [{ side: 'L', number: 10 }, { side: 'L', number: 10 }, { side: 'L', number: 10 }, { side: 'R', number: 96 }];   // 교체·골 수 표시 확인용
      showResult({ match, imgs: game.imgs, onAgain: () => location.reload(), onChange: () => location.reload() }); }
    if (dbg === 'sub') setTimeout(() => { requestSubstitute(match, 'L'); game.input.setEnabled(false);
      showSubSelect({ imgs: game.imgs, kits: match.kits.L, exclude: [10, 99], onPick: d => { hideOverlay(); finishSubstitution(d); }, onCancel: () => { hideOverlay(); finishSubstitution(null); } }); }, 1500);
    return;
  }
  // onIdle: 선택 화면으로 돌아갈 때 지난 경기의 마지막 장면을 지우고 빈 경기장을 배경으로
  const flow = runFlow({ startMatch, finishSubstitution, imgs: game.imgs, stage, onIdle: () => { if (game.loop) game.loop.stop(); game.match = null; repaint(); } });
  game.quit = flow.toSelect;
}

boot();
