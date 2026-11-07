// 화면 흐름: 선수 선택(넘겨보기) → VS → 경기 → (교체 선택) → 결과. 전부 #overlay 안의 DOM.
import { PLAYERS, byNumber } from '../data/players.js';
import { KITS, GK_KITS, kitById, kitsFor, wornKit } from '../data/kits.js';
import { sfx, soundEnabled, setSoundEnabled } from '../sound.js';
import { createPlayer } from '../sim/physics.js';
import { drawPlayer } from '../render/characters.js';
import { shareText } from './text.js';
import { DIFFICULTY, DIFFICULTY_ORDER } from '../sim/constants.js';

const overlay = document.getElementById('overlay');
const LEVELS = DIFFICULTY_ORDER.map(id => ({ id, name: DIFFICULTY[id].name }));
const STORE = 'uhd11.select';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
export function hideOverlay() { overlay.hidden = true; overlay.innerHTML = ''; }
const tickOnButtons = node => node.addEventListener('click', e => { if (e.target.closest('button')) sfx('tick'); });   // 시트 안 모든 버튼에 틱 소리
function show(node) { tickOnButtons(node); overlay.innerHTML = ''; overlay.appendChild(node); overlay.hidden = false; }

const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch { return null; } };
const save = v => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* 사생활 모드 등 */ } };

// 선택 카드: 경기 속 모습 그대로(입을 유니폼, 서 있는 자세, 머리도 경기처럼 컷아웃). 2026-11-03 형준: 왼쪽 큰 카드는 동그란 사진 대신 누끼로, 오른쪽 작은 얼굴들은 동그라미 그대로.
// 컷아웃은 머리 원보다 위로 더 올라오므로(머리카락) 1.25 → 1.15 배로 살짝 줄여 캔버스 위에서 잘리지 않게 한다
function paintCard(canvas, def, imgs, kit) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const k = document.getElementById('stage').dataset.tiny === '1' ? 0.72 : 1;   // 320px 폭 폰
  const W = Math.round(220 * k), H = Math.round(250 * k);
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.ellipse(W / 2, H - 14, 70, 10, 0, 0, Math.PI * 2); ctx.fill();
  const body = createPlayer(def, 'L');
  body.x = W / 2 / (1.15 * k); body.y = (H - 20 * k) / (1.15 * k);
  ctx.save(); ctx.scale(1.15 * k, 1.15 * k);
  drawPlayer(ctx, body, imgs[def.number], { kit });
  ctx.restore();
}

// 넘겨보기 선수 선택기. onChange(def) 로 현재 선수를 알리고, kitFor(def) 가 카드에 입힐 유니폼을 준다.
function buildCarousel({ players, imgs, initial, kitFor, onChange }) {
  let idx = Math.max(0, players.findIndex(p => p.number === initial));
  const root = el('div', 'picker');
  const car = el('div', 'carousel');
  const prev = el('button', 'arrow prev', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', '이전 선수');
  const next = el('button', 'arrow next', '›'); next.type = 'button'; next.setAttribute('aria-label', '다음 선수');
  const card = el('div', 'card');
  const canvas = el('canvas'); canvas.setAttribute('aria-hidden', 'true');
  const who = el('div', 'who');
  card.append(canvas, who);
  car.append(prev, card, next);
  const skill = el('div', 'skill');
  const thumbs = el('div', 'thumbs'); thumbs.setAttribute('role', 'listbox'); thumbs.setAttribute('aria-label', '선수 목록');
  players.forEach((p, i) => {
    const b = el('button', 'thumb'); b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-label', `${p.name} ${p.number}번`);
    const img = el('img'); img.src = p.img; img.alt = ''; b.appendChild(img);
    b.addEventListener('click', () => go(i));
    thumbs.appendChild(b);
  });
  root.append(car, skill, thumbs);

  function go(i) {
    idx = (i + players.length) % players.length;
    const def = players[idx];
    paintCard(canvas, def, imgs, kitFor(def));
    who.innerHTML = `<b class="name">${def.name}</b><span class="num">${def.number}</span>`;
    const sp = def.special, when = sp.kind === 'oneshot' ? '다음 슛 한 번' : sp.kind === 'instant' ? '즉시' : `${sp.duration}초`;
    skill.innerHTML = `<div class="skill-head"><span class="skill-tag">필살기</span><span class="skill-when">${when}</span></div><b class="skill-name">${sp.name}</b><p class="skill-desc">${sp.desc}</p>`;
    [...thumbs.children].forEach((t, k) => t.setAttribute('aria-selected', k === idx));
    onChange(def);
  }
  prev.addEventListener('click', () => go(idx - 1));
  next.addEventListener('click', () => go(idx + 1));
  // 스와이프. 무대가 90° 눕혀져 있으면 물리적 좌우 = 뷰포트 세로(무대 x = 화면 y) 라 clientY 로 잰다
  let start = null;
  const along = e => (document.getElementById('stage').dataset.rotated === '1' ? e.clientY : e.clientX);
  card.addEventListener('pointerdown', e => { start = along(e); });
  card.addEventListener('pointerup', e => { if (start === null) return; const dx = along(e) - start; start = null; if (dx > 40) go(idx - 1); else if (dx < -40) go(idx + 1); });
  card.addEventListener('pointercancel', () => { start = null; });
  go(idx);
  const onKey = e => { if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); } if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); } };
  return { root, current: () => players[idx], refresh: () => go(idx), onKey };
}

function buildLevels(initial, onChange, extra) {
  const wrap = el('div', 'pick');
  const head = el('div', 'pick-head', '<p class="pick-label" id="levelsLabel">난이도</p>');
  if (extra) head.appendChild(extra);
  wrap.appendChild(head);
  const levels = el('div', 'levels'); levels.setAttribute('role', 'group'); levels.setAttribute('aria-labelledby', 'levelsLabel');
  const keys = el('p', 'two-keys', '<span class="grp"><b>1P</b> <kbd>A</kbd><kbd>D</kbd> 이동 · <kbd>W</kbd> 점프 · <kbd>F</kbd> 슛</span> <span class="grp"><b>2P</b> <kbd>←</kbd><kbd>→</kbd> 이동 · <kbd>↑</kbd> 점프 · <kbd>Enter</kbd> 슛</span>'); keys.hidden = true;
  let cur = initial;
  const paint = () => { const i = LEVELS.findIndex(l => l.id === cur); [...levels.children].forEach((b, k) => { b.setAttribute('aria-pressed', k === i); b.classList.toggle('on', k <= i); }); };
  LEVELS.forEach(l => {
    const b = el('button', 'level', `<i class="dot"></i><span>${l.name}</span>`); b.type = 'button';
    b.addEventListener('click', () => { cur = l.id; paint(); onChange(cur); });
    levels.appendChild(b);
  });
  wrap.append(levels, keys); paint();
  return Object.assign(wrap, { setTwo: two => { levels.hidden = two; keys.hidden = !two; head.querySelector('.pick-label').textContent = two ? '2인 대전' : '난이도'; } });
}

// 유니폼 고르기: 카드 밑 작은 셔츠들. 선수가 바뀌면 목록도 바뀐다 (조현우는 골키퍼 4종, 나머지는 필드 5종)
function buildKits(onChange) {
  const wrap = el('div', 'pick kits-pick');
  const label = el('p', 'pick-label'); label.id = 'kitsLabel';
  const row = el('div', 'kits'); row.setAttribute('role', 'group'); row.setAttribute('aria-labelledby', 'kitsLabel');
  wrap.append(label, row);
  function show(list, cur) {
    label.textContent = list === GK_KITS ? '골키퍼 유니폼' : '유니폼';
    row.innerHTML = '';
    for (const k of list) {
      const b = el('button', 'kit', `<i class="shirt" style="--j:${k.jersey};--t:${k.trim}${k.stripe ? ';--s:' + k.stripe : ''}"></i><span>${k.name}</span>`); b.type = 'button';
      b.setAttribute('aria-label', `${k.name} 유니폼`); b.setAttribute('aria-pressed', k.id === cur);
      b.addEventListener('click', () => { show(list, k.id); onChange(k.id); });
      row.appendChild(b);
    }
  }
  return { root: wrap, show };
}

// 상대 고르기: 난이도 줄 오른쪽 작은 버튼. 기본은 랜덤, 누르면 얼굴 목록(랜덤 + 내 선수 뺀 11명)에서 한 명 (2026-10-31 형준)
// 2026-11-01 형준 "상대가 랜덤으로 나온다는 표시 같고 선택할 수 있을 느낌이 안 들어" → 랜덤일 땐 "상대 고르기", 끝에 ▾ 화살표, 채운 배경
const CARET = '<svg class="caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function buildOpponent(initial, onChange) {
  let cur = initial, mine = null, role = '상대';   // cur: 등번호 또는 null(랜덤). role: 2인 대전이면 '2P 선수'
  const btn = el('button', 'opp choose'); btn.type = 'button'; btn.setAttribute('aria-haspopup', 'dialog');
  const paint = () => {
    const def = cur && byNumber(cur);
    btn.innerHTML = (def ? `<img class="opp-face" src="${def.img}" alt=""><span>${role}</span><b>${def.name}</b>` : `<i class="opp-face">?</i><b>${role} 고르기</b>`) + CARET;
    btn.setAttribute('aria-label', `${role} 고르기: 현재 ${def ? def.name : '랜덤'}`);
  };
  function open() {
    const modal = el('div', 'modal'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-label', role + ' 선택');
    const panel = el('div', 'modal-panel', `<p class="pick-label">${role} 선택</p>`);
    const grid = el('div', 'thumbs');
    const close = () => { modal.remove(); btn.focus({ preventScroll: true }); };
    const pick = n => { cur = n; paint(); close(); onChange(cur); };
    const rnd = el('button', 'thumb random', '?'); rnd.type = 'button'; rnd.setAttribute('aria-label', '랜덤'); rnd.setAttribute('aria-selected', cur === null);
    rnd.addEventListener('click', () => pick(null));
    grid.appendChild(rnd);
    for (const p of PLAYERS.filter(p => p.number !== mine)) {
      const b = el('button', 'thumb', `<img src="${p.img}" alt="">`); b.type = 'button'; b.setAttribute('aria-label', `${p.name} ${p.number}번`); b.setAttribute('aria-selected', p.number === cur);
      b.addEventListener('click', () => pick(p.number));
      grid.appendChild(b);
    }
    panel.appendChild(grid); modal.appendChild(panel);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    tickOnButtons(modal);
    overlay.appendChild(modal);
    (grid.querySelector('[aria-selected="true"]') || rnd).focus({ preventScroll: true });
  }
  btn.addEventListener('click', open);
  paint();
  // 내 선수가 바뀌면 알린다. 내가 상대로 골라 둔 선수를 고르면 랜덤으로 되돌린다
  return { button: btn, current: () => cur, setMine: n => { mine = n; if (cur === n) { cur = null; paint(); onChange(cur); } }, setRole: r => { role = r; paint(); } };
}

// 경기 방식: 1인(컴퓨터 상대) / 2인(한 키보드). 2026-11-07 형준 "2인 모드를 만들어서 선수 두 명이 하게"
function buildMode(initial, onChange) {
  const wrap = el('div', 'mode'); wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', '경기 방식');
  let two = initial;
  const paint = () => [...wrap.children].forEach((b, i) => b.setAttribute('aria-pressed', (i === 1) === two));
  [['1인', '1인: 컴퓨터 상대'], ['2인', '2인: 한 키보드로 둘이']].forEach(([t, label], i) => {
    const b = el('button', null, t); b.type = 'button'; b.setAttribute('aria-label', label);
    b.addEventListener('click', () => { if (two === (i === 1)) return; two = i === 1; paint(); onChange(two); });
    wrap.appendChild(b);
  });
  paint();
  return { root: wrap, current: () => two };
}

// 소리 켜기/끄기 알약. 2026-10-31 형준: 효과음 추가와 함께. 상태는 sound.js 가 저장한다
function buildSoundToggle(cls = 'opp sound') {
  const b = el('button', cls); b.type = 'button'; b.setAttribute('aria-pressed', soundEnabled());
  const paint = () => { const on = soundEnabled(); b.textContent = on ? '♪ 소리 켬' : '♪ 소리 끔'; b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? '효과음 끄기' : '효과음 켜기'); };
  b.addEventListener('click', () => { setSoundEnabled(!soundEnabled()); paint(); });
  paint();
  return b;
}

export function showSelect({ imgs, initialNumber, difficulty, kit, opponent = null, two = false, onStart }) {
  const sheet = el('div', 'sheet select');
  const left = el('div', 'col left'), right = el('div', 'col right');
  right.innerHTML = '<div class="brand"><span class="emblem" aria-hidden="true"></span><div class="brand-text"><span class="club">ULSAN HD FC</span><h1><span class="vs">1 VS 1</span> 축구</h1></div></div>';
  let diff = difficulty;
  const chosen = { field: KITS[0].id, gk: GK_KITS[0].id };   // 필드·골키퍼 각각 마지막으로 고른 것
  const slot = def => (def.position === 'GK' ? 'gk' : 'field');
  const init = kitById(kit); if (init) chosen[init.gk ? 'gk' : 'field'] = init.id;
  const kits = buildKits(id => { chosen[slot(picker.current())] = id; picker.refresh(); });
  const opp = buildOpponent(opponent, () => {});
  const mode = buildMode(two, on => { opp.setRole(on ? '2P 선수' : '상대'); levelsRow.setTwo(on); });
  const picker = buildCarousel({ players: PLAYERS, imgs, initial: initialNumber, kitFor: def => kitById(chosen[slot(def)]),
    onChange: def => { kits.show(kitsFor(def), chosen[slot(def)]); opp.setMine(def.number); } });
  left.appendChild(picker.root.querySelector('.carousel'));
  left.appendChild(kits.root);
  right.appendChild(picker.root.querySelector('.skill'));
  right.appendChild(picker.root.querySelector('.thumbs'));
  const extras = el('div', 'pick-extras'); extras.append(mode.root, opp.button, buildSoundToggle());
  const levelsRow = buildLevels(diff, d => { diff = d; }, extras);
  if (two) { opp.setRole('2P 선수'); levelsRow.setTwo(true); }
  right.appendChild(levelsRow);
  const start = el('button', 'action', '경기 시작'); start.type = 'button';
  start.addEventListener('click', () => onStart(picker.current(), diff, chosen[slot(picker.current())], opp.current(), mode.current()));
  right.appendChild(start);
  sheet.append(left, right);
  sheet.addEventListener('keydown', picker.onKey);
  show(sheet);
  start.focus({ preventScroll: true });
}

export function showVs(home, away, ms = 1000) {
  const sheet = el('div', 'sheet vs');
  sheet.innerHTML = `
    <div class="face"><img src="${home.img}" alt=""><b>${home.name}</b><span>${home.number}</span></div>
    <div class="vs-mark">VS</div>
    <div class="face away"><img src="${away.img}" alt=""><b>${away.name}</b><span>${away.number}</span></div>`;
  show(sheet);
  return new Promise(res => setTimeout(res, ms));
}

export function showSubSelect({ imgs, exclude, kits, onPick, onCancel }) {
  const players = PLAYERS.filter(p => !exclude.includes(p.number));
  const sheet = el('div', 'sheet select sub-select');
  const left = el('div', 'col left'), right = el('div', 'col right');
  right.innerHTML = '<div class="brand"><h1>선수 교체</h1><p class="sub-note">경기당 한 번. 게이지는 그대로 이어집니다.</p></div>';
  const picker = buildCarousel({ players, imgs, initial: players[0].number, kitFor: def => wornKit(kits, def), onChange: () => {} });
  left.appendChild(picker.root.querySelector('.carousel'));
  right.appendChild(picker.root.querySelector('.skill'));
  right.appendChild(picker.root.querySelector('.thumbs'));
  const row = el('div', 'row');
  const ok = el('button', 'action', '교체'); ok.type = 'button'; ok.addEventListener('click', () => onPick(picker.current()));
  const cancel = el('button', 'action ghost', '닫기'); cancel.type = 'button'; cancel.addEventListener('click', onCancel);
  row.append(ok, cancel); right.appendChild(row);
  sheet.append(left, right);
  sheet.addEventListener('keydown', picker.onKey);
  show(sheet);
  ok.focus({ preventScroll: true });
}

// 일시정지 메뉴: 경기 중 메뉴 버튼(또는 Esc). 계속하기는 3·2·1 뒤 재개, 메인으로는 선수 선택 화면 (2026-10-31 형준)
export function showPause({ onResume, onQuit }) {
  const sheet = el('div', 'sheet pause');
  sheet.innerHTML = `<h1>일시정지</h1>
    <div class="row">
      <button class="action" type="button" data-act="resume">계속하기</button>
      <button class="action ghost" type="button" data-act="quit">메인으로</button>
    </div>`;
  sheet.appendChild(buildSoundToggle('opp sound'));
  sheet.querySelector('[data-act="resume"]').addEventListener('click', onResume);
  sheet.querySelector('[data-act="quit"]').addEventListener('click', onQuit);
  sheet.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); onResume(); } });
  show(sheet);
  sheet.querySelector('[data-act="resume"]').focus({ preventScroll: true });
}

export function showResult({ match, onAgain, onChange }) {
  const sheet = el('div', 'sheet result');
  const verdict = match.twoPlayer ? (match.result === 'draw' ? '무승부' : `${match.used[match.result === 'win' ? 'L' : 'R'].at(-1).name} 승리`)   // 2인: 이긴 선수 이름
    : match.result === 'win' ? '승리' : match.result === 'lose' ? '패배' : '무승부';
  // 선수마다 얼굴·이름·골 수, 교체했으면 화살표로 잇는다 (2026-10-31 형준: 대칭 + 선수별 골)
  const tally = side => { const t = {}; for (const g of match.goals) if (g.side === side) t[g.number] = (t[g.number] || 0) + 1; return t; };
  const lineup = side => { const t = tally(side); return match.used[side].map(d => `<div class="chip"><img src="${d.img}" alt=""><b>${d.name}</b><span class="g${t[d.number] ? '' : ' none'}"><em>${t[d.number] || 0}</em>골</span></div>`).join('<i class="sub-arrow" aria-hidden="true">→</i>'); };
  sheet.innerHTML = `
    <span class="emblem" aria-hidden="true"></span>
    <p class="verdict ${match.twoPlayer && match.result !== 'draw' ? 'win' : match.result}">${verdict}</p>
    <p class="score"><span>${match.scores.L}</span><em>-</em><span>${match.scores.R}</span></p>
    <div class="lineup"><div class="side">${lineup('L')}</div><div class="side away">${lineup('R')}</div></div></div>
    <div class="row">
      <button class="action" type="button" data-act="again">다시 하기</button>
      <button class="action ghost" type="button" data-act="change">선수 바꾸기</button>
      <button class="action ghost" type="button" data-act="share" hidden>결과 공유</button>
    </div>`;
  sheet.querySelector('[data-act="again"]').addEventListener('click', onAgain);
  sheet.querySelector('[data-act="change"]').addEventListener('click', onChange);
  const share = sheet.querySelector('[data-act="share"]');
  if (navigator.share && !match.twoPlayer) {   // 공유 문장은 "내가 상대를" 꼴이라 2인은 숨긴다
    share.hidden = false;
    share.addEventListener('click', () => {
      const text = shareText({ me: match.used.L.at(-1).name, them: match.used.R.at(-1).name, L: match.scores.L, R: match.scores.R, result: match.result });
      navigator.share({ text, url: location.href }).catch(() => {});
    });
  }
  show(sheet);
  sheet.querySelector('[data-act="again"]').focus({ preventScroll: true });
}

// 전체 흐름
export function runFlow({ startMatch, finishSubstitution, imgs }) {
  const saved = load() || {};
  const number = byNumber(saved.number) ? saved.number : 10;
  let selection = { number, difficulty: LEVELS.some(l => l.id === saved.difficulty) ? saved.difficulty : 'first', kit: kitById(saved.kit) ? saved.kit : 'home',
    opp: byNumber(saved.opp) && saved.opp !== number ? saved.opp : null, two: saved.two === true };   // opp: 고른 상대(2인이면 2P 선수) 등번호, null 이면 랜덤. two: 2인 대전

  const randomOther = home => { const pool = PLAYERS.filter(p => p.number !== home.number); return pool[Math.floor(Math.random() * pool.length)]; };

  function play(home, difficulty, kit, opp, two) {
    const away = byNumber(opp) && opp !== home.number ? byNumber(opp) : randomOther(home);
    showVs(home, away).then(() => {
      hideOverlay();
      startMatch(home, away, difficulty, {
        kit, twoPlayer: two,
        onSubRequest: m => showSubSelect({
          imgs, kits: m.kits.L, exclude: [m.used.L.at(-1).number, m.used.R.at(-1).number],
          onPick: d => { hideOverlay(); finishSubstitution(d); },
          onCancel: () => { hideOverlay(); finishSubstitution(null); },
        }),
        onOver: (m, wait) => setTimeout(() => showResult({ match: m, onAgain: () => play(home, difficulty, kit, opp, two), onChange: toSelect }), wait),
      });
    });
  }
  function toSelect() {
    showSelect({ imgs, initialNumber: selection.number, difficulty: selection.difficulty, kit: selection.kit, opponent: selection.opp, two: selection.two, onStart: (def, diff, kit, opp, two) => {
      selection = { number: def.number, difficulty: diff, kit, opp, two }; save(selection);
      play(def, diff, kit, opp, two);
    } });
  }
  toSelect();
  return { toSelect, play };
}
