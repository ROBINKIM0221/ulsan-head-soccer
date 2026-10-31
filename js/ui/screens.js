// 화면 흐름: 선수 선택(넘겨보기) → VS → 경기 → (교체 선택) → 결과. 전부 #overlay 안의 DOM.
import { PLAYERS, byNumber } from '../data/players.js';
import { KITS, GK_KITS, kitById, kitsFor, wornKit } from '../data/kits.js';
import { createPlayer } from '../sim/physics.js';
import { drawPlayer } from '../render/characters.js';
import { shareText } from './text.js';
import { DIFFICULTY, DIFFICULTY_ORDER } from '../sim/constants.js';

const overlay = document.getElementById('overlay');
const LEVELS = DIFFICULTY_ORDER.map(id => ({ id, name: DIFFICULTY[id].name }));
const STORE = 'uhd11.select';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
export function hideOverlay() { overlay.hidden = true; overlay.innerHTML = ''; }
function show(node) { overlay.innerHTML = ''; overlay.appendChild(node); overlay.hidden = false; }

const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch { return null; } };
const save = v => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* 사생활 모드 등 */ } };

// 선택 카드: 경기 속 모습 그대로(입을 유니폼, 서 있는 자세)
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
  body.x = W / 2 / (1.25 * k); body.y = (H - 20 * k) / (1.25 * k);
  ctx.save(); ctx.scale(1.25 * k, 1.25 * k);
  drawPlayer(ctx, body, imgs[def.number], { kit, circle: true });
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

function buildLevels(initial, onChange) {
  const wrap = el('div', 'pick');
  wrap.innerHTML = '<p class="pick-label" id="levelsLabel">난이도</p>';
  const levels = el('div', 'levels'); levels.setAttribute('role', 'group'); levels.setAttribute('aria-labelledby', 'levelsLabel');
  let cur = initial;
  const paint = () => { const i = LEVELS.findIndex(l => l.id === cur); [...levels.children].forEach((b, k) => { b.setAttribute('aria-pressed', k === i); b.classList.toggle('on', k <= i); }); };
  LEVELS.forEach(l => {
    const b = el('button', 'level', `<i class="dot"></i><span>${l.name}</span>`); b.type = 'button';
    b.addEventListener('click', () => { cur = l.id; paint(); onChange(cur); });
    levels.appendChild(b);
  });
  wrap.appendChild(levels); paint();
  return wrap;
}

// 유니폼 고르기: 카드 밑 작은 셔츠들. 선수가 바뀌면 목록도 바뀐다 (조현우는 골키퍼 4종, 나머지는 필드 4종)
function buildKits(onChange) {
  const wrap = el('div', 'pick kits-pick');
  const label = el('p', 'pick-label'); label.id = 'kitsLabel';
  const row = el('div', 'kits'); row.setAttribute('role', 'group'); row.setAttribute('aria-labelledby', 'kitsLabel');
  wrap.append(label, row);
  function show(list, cur) {
    label.textContent = list === GK_KITS ? '골키퍼 유니폼' : '유니폼';
    row.innerHTML = '';
    for (const k of list) {
      const b = el('button', 'kit', `<i class="shirt" style="--j:${k.jersey};--t:${k.trim}"></i><span>${k.name}</span>`); b.type = 'button';
      b.setAttribute('aria-label', `${k.name} 유니폼`); b.setAttribute('aria-pressed', k.id === cur);
      b.addEventListener('click', () => { show(list, k.id); onChange(k.id); });
      row.appendChild(b);
    }
  }
  return { root: wrap, show };
}

export function showSelect({ imgs, initialNumber, difficulty, kit, onStart }) {
  const sheet = el('div', 'sheet select');
  const left = el('div', 'col left'), right = el('div', 'col right');
  right.innerHTML = '<div class="brand"><span class="emblem" aria-hidden="true"></span><div class="brand-text"><span class="club">ULSAN HD FC</span><h1><span class="vs">1 VS 1</span> 축구</h1></div></div>';
  let diff = difficulty;
  const chosen = { field: KITS[0].id, gk: GK_KITS[0].id };   // 필드·골키퍼 각각 마지막으로 고른 것
  const slot = def => (def.position === 'GK' ? 'gk' : 'field');
  const init = kitById(kit); if (init) chosen[init.gk ? 'gk' : 'field'] = init.id;
  const kits = buildKits(id => { chosen[slot(picker.current())] = id; picker.refresh(); });
  const picker = buildCarousel({ players: PLAYERS, imgs, initial: initialNumber, kitFor: def => kitById(chosen[slot(def)]),
    onChange: def => kits.show(kitsFor(def), chosen[slot(def)]) });
  left.appendChild(picker.root.querySelector('.carousel'));
  left.appendChild(kits.root);
  right.appendChild(picker.root.querySelector('.skill'));
  right.appendChild(picker.root.querySelector('.thumbs'));
  right.appendChild(buildLevels(diff, d => { diff = d; }));
  const start = el('button', 'action', '경기 시작'); start.type = 'button';
  start.addEventListener('click', () => onStart(picker.current(), diff, chosen[slot(picker.current())]));
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

export function showResult({ match, onAgain, onChange }) {
  const sheet = el('div', 'sheet result');
  const verdict = match.result === 'win' ? '승리' : match.result === 'lose' ? '패배' : '무승부';
  const faces = side => match.used[side].map(d => `<img src="${d.img}" alt="${d.name}" title="${d.name}">`).join('');
  sheet.innerHTML = `
    <span class="emblem" aria-hidden="true"></span>
    <p class="verdict ${match.result}">${verdict}</p>
    <p class="score"><span>${match.scores.L}</span><em>-</em><span>${match.scores.R}</span></p>
    <div class="lineup"><div class="side">${faces('L')}<b>${match.used.L.map(d => d.name).join(' → ')}</b></div><div class="side away">${faces('R')}<b>${match.used.R.map(d => d.name).join(' → ')}</b></div></div>
    <div class="row">
      <button class="action" type="button" data-act="again">다시 하기</button>
      <button class="action ghost" type="button" data-act="change">선수 바꾸기</button>
      <button class="action ghost" type="button" data-act="share" hidden>결과 공유</button>
    </div>`;
  sheet.querySelector('[data-act="again"]').addEventListener('click', onAgain);
  sheet.querySelector('[data-act="change"]').addEventListener('click', onChange);
  const share = sheet.querySelector('[data-act="share"]');
  if (navigator.share) {
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
  let selection = { number: byNumber(saved.number) ? saved.number : 10, difficulty: LEVELS.some(l => l.id === saved.difficulty) ? saved.difficulty : 'first', kit: kitById(saved.kit) ? saved.kit : 'home' };

  const randomOther = home => { const pool = PLAYERS.filter(p => p.number !== home.number); return pool[Math.floor(Math.random() * pool.length)]; };

  function play(home, difficulty, kit) {
    const away = randomOther(home);
    showVs(home, away).then(() => {
      hideOverlay();
      startMatch(home, away, difficulty, {
        kit,
        onSubRequest: m => showSubSelect({
          imgs, kits: m.kits.L, exclude: [m.used.L.at(-1).number, m.used.R.at(-1).number],
          onPick: d => { hideOverlay(); finishSubstitution(d); },
          onCancel: () => { hideOverlay(); finishSubstitution(null); },
        }),
        onOver: m => setTimeout(() => showResult({ match: m, onAgain: () => play(home, difficulty, kit), onChange: toSelect }), 1200),
      });
    });
  }
  function toSelect() {
    showSelect({ imgs, initialNumber: selection.number, difficulty: selection.difficulty, kit: selection.kit, onStart: (def, diff, kit) => {
      selection = { number: def.number, difficulty: diff, kit }; save(selection);
      play(def, diff, kit);
    } });
  }
  toSelect();
  return { toSelect, play };
}
