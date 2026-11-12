// 화면 흐름: 선수 선택(넘겨보기) → VS → 경기 → (교체 선택) → 결과. 전부 #overlay 안의 DOM.
import { PLAYERS, byNumber } from '../data/players.js';
import { KITS, GK_KITS, kitById, kitsFor, wornKit, sideKits } from '../data/kits.js';
import { sfx, soundEnabled, setSoundEnabled } from '../sound.js';
import { createPlayer, headCenter } from '../sim/physics.js';
import { drawPlayer } from '../render/characters.js';
import { shareText, specialLine } from './text.js';
import { DIFFICULTY, DIFFICULTY_ORDER } from '../sim/constants.js';

const overlay = document.getElementById('overlay'), stageEl = document.getElementById('stage');
const LEVELS = DIFFICULTY_ORDER.map(id => ({ id, name: DIFFICULTY[id].name }));
const STORE = 'uhd11.select';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
// #stage.sheet-open: 시트가 떠 있는 동안 조작 버튼·점수판 옆 버튼을 숨긴다 (전엔 흐린 배경에 얼룩처럼 비쳤다)
export function hideOverlay() { overlay.hidden = true; overlay.innerHTML = ''; sheetKeys = null; stageEl.classList.remove('sheet-open'); }
const tickOnButtons = node => node.addEventListener('click', e => { if (e.target.closest('button')) sfx('tick'); });   // 시트 안 모든 버튼에 틱 소리
// 시트의 키 넘기기(onKey)는 창 전체에서 받는다: 유니폼 버튼처럼 눌리면 다시 그려지는 버튼은 포커스를 body 로 떨어뜨려 시트 위 리스너가 못 받는다
let sheetKeys = null;
window.addEventListener('keydown', e => { if (sheetKeys && !overlay.hidden) sheetKeys(e); });
function show(node, onKey = null) { tickOnButtons(node); overlay.innerHTML = ''; overlay.appendChild(node); overlay.hidden = false; sheetKeys = onKey; stageEl.classList.add('sheet-open'); }

const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch { return null; } };
const save = v => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* 사생활 모드 등 */ } };

// 선택 카드: 경기 속 모습 그대로(입을 유니폼, 서 있는 자세, 머리도 경기처럼 컷아웃). 2026-11-03 형준: 왼쪽 큰 카드는 동그란 사진 대신 누끼로, 오른쪽 작은 얼굴들은 동그라미 그대로.
// 컷아웃은 머리 원보다 위로 더 올라오므로(머리카락) 1.25 → 1.15 배로 살짝 줄여 캔버스 위에서 잘리지 않게 한다.
// side 'R' 은 경기처럼 왼쪽을 본다. def.random(컴퓨터 상대 랜덤)이면 회색 선수에 물음표 머리. 폰 가로(카드 둘이 나란히)에서는 작게.
// zoom: 카드 배율(VS·결과 화면은 더 크게). pose: 'cheer' 두 팔 번쩍, 'sad' 풀썩 기울어짐.
const MYSTERY_KIT = { jersey: '#8E9BB0', trim: '#DCE6F5', number: '#FFFFFF', shorts: '#66748C', shoe: '#3A4559' };
function paintCard(canvas, def, imgs, kit, side = 'L', { zoom = 1, pose = null } = {}) {
  const ctx = canvas.getContext('2d');
  const us = parseFloat(stageEl.style.getPropertyValue('--us')) || 1;   // 큰 화면에서 시트를 키우는 배율: 그만큼 더 촘촘히 그려야 또렷하다
  const dpr = Math.min(4, (window.devicePixelRatio || 1) * us);
  const st = stageEl.dataset;
  const k = (st.tiny === '1' ? 0.5 : st.compact === '1' ? 0.56 : 1) * zoom;
  const W = Math.round(220 * k), H = Math.round(250 * k);
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.ellipse(W / 2, H - 14 * k, 70 * k, 10 * k, 0, 0, Math.PI * 2); ctx.fill();
  const body = createPlayer(def.random ? { number: '?' } : def, side);
  body.x = W / 2 / (1.15 * k); body.y = (H - 20 * k) / (1.15 * k);
  if (pose === 'sad') body.stun = 0.38;
  ctx.save(); ctx.scale(1.15 * k, 1.15 * k);
  drawPlayer(ctx, body, def.random ? null : imgs[def.number], { kit: def.random ? MYSTERY_KIT : kit, cheer: pose === 'cheer' });
  if (def.random) {
    const h = headCenter(body);
    ctx.fillStyle = '#002B6B'; ctx.font = `600 ${Math.round(h.r * 1.7)}px Teko, "Arial Narrow", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', h.x, h.y + h.r * 0.1);
  }
  ctx.restore();
}

// 넘겨보기 선수 선택기. onChange(def) 로 현재 선수를 알리고, kitFor(def) 가 카드에 입힐 유니폼을 준다.
// side 'R' 은 카드가 왼쪽을 본다. random 이면 맨 앞에 "?"(컴퓨터 상대 랜덤) 칸. exclude() 가 돌려주는 등번호는 건너뛴다(같은 선수끼리 못 붙게).
// keys = [이전, 다음] 의 e.code: 1인은 방향키, 2인은 왼쪽 A·D / 오른쪽 방향키 (2026-11-07 형준 "왼쪽 반이 1p 오른쪽 2p")
const RANDOM = { random: true, number: 0, name: '랜덤 상대' };
function buildCarousel({ players, imgs, initial, kitFor, onChange, side = 'L', random = false, exclude = () => null, keys = ['ArrowLeft', 'ArrowRight'] }) {
  const list = random ? [RANDOM, ...players] : players;
  let idx = Math.max(0, list.findIndex(p => p.number === initial));
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
  list.forEach((p, i) => {
    const b = el('button', p.random ? 'thumb random' : 'thumb', p.random ? '?' : undefined); b.type = 'button'; b.setAttribute('role', 'option');
    b.setAttribute('aria-label', p.random ? '랜덤' : `${p.name} ${p.number}번`);
    if (!p.random) { const img = el('img'); img.src = p.img; img.alt = ''; b.appendChild(img); }
    b.addEventListener('click', () => go(i));
    thumbs.appendChild(b);
  });
  root.append(car, skill, thumbs);

  const banned = p => !p.random && p.number === exclude();
  function go(i, dir = 1) {
    let k = (i + list.length) % list.length;
    for (let n = 0; n < list.length && banned(list[k]); n++) k = (k + dir + list.length) % list.length;
    idx = k;
    const def = list[idx];
    paintCard(canvas, def, imgs, def.random ? null : kitFor(def), side);
    who.innerHTML = def.random ? '<b class="name">랜덤 상대</b>' : `<b class="name">${def.name}</b><span class="num">${def.number}</span>`;
    // 필살기 카드: 꼬리표와 이름이 한 줄, 그 아래 한 줄 설명. 발동 조건 칩("다음 슛 한 번"·"6초"·"즉시")은 뺐다 (2026-11-12 형준 "이 내용은 그냥 필요 없을 것 같아서")
    const [skillName, skillDesc] = def.random ? ['경기마다 다른 선수', '시작하면 나머지 11명 중 한 명 등장'] : [def.special.name, specialLine(def.special)];
    skill.innerHTML = `<div class="skill-head"><span class="skill-tag">필살기</span><b class="skill-name">${skillName}</b></div><p class="skill-desc">${skillDesc}</p>`;
    [...thumbs.children].forEach((t, n) => { t.setAttribute('aria-selected', n === idx); t.disabled = banned(list[n]); });
    onChange(def);
  }
  prev.addEventListener('click', () => go(idx - 1, -1));
  next.addEventListener('click', () => go(idx + 1, 1));
  // 스와이프. 무대가 90° 눕혀져 있으면 물리적 좌우 = 뷰포트 세로(무대 x = 화면 y) 라 clientY 로 잰다
  let start = null;
  const along = e => (document.getElementById('stage').dataset.rotated === '1' ? e.clientY : e.clientX);
  card.addEventListener('pointerdown', e => { start = along(e); });
  card.addEventListener('pointerup', e => { if (start === null) return; const dx = along(e) - start; start = null; if (dx > 40) go(idx - 1, -1); else if (dx < -40) go(idx + 1, 1); });
  card.addEventListener('pointercancel', () => { start = null; });
  go(idx);
  const onKey = e => { if (e.code === keys[0]) { e.preventDefault(); go(idx - 1, -1); } else if (e.code === keys[1]) { e.preventDefault(); go(idx + 1, 1); } };
  // refresh: 유니폼이 바뀌어 다시 그리거나, 왼쪽이 이 선수로 바뀌어 건너뛰어야 할 때(랜덤 칸이 있으면 랜덤으로)
  return { root, card, current: () => list[idx], refresh: () => go(banned(list[idx]) && random ? 0 : idx), onKey };
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

// 셔츠 아이콘(SVG): 몸통은 상의 색(레트로는 세로 줄무늬), 깃과 소매 끝은 트림 색, 어두운 바탕에서도 보이게 옅은 흰 테두리
const SHIRT = 'M14 2.5 5 6 1 14.5l6 3 3-4V32h20V13.5l3 4 6-3L35 6l-9-3.5c-1.5 2.6-3.6 3.9-6 3.9s-4.5-1.3-6-3.9Z';
let shirtSeq = 0;
function shirtSvg(k) {
  const id = 'sh' + (++shirtSeq);
  const stripes = k.stripe ? [11, 17.5, 24].map(x => `<rect x="${x}" y="0" width="3.5" height="34" fill="${k.stripe}"/>`).join('') : '';
  return `<svg class="shirt" viewBox="0 0 40 34" aria-hidden="true"><clipPath id="${id}"><path d="${SHIRT}"/></clipPath>`
    + `<g clip-path="url(#${id})"><rect width="40" height="34" fill="${k.jersey}"/>${stripes}`
    + `<path d="M1 14.5l6 3M39 14.5l-6 3" stroke="${k.trim}" stroke-width="5"/><path d="M14 2.5c1.5 2.6 3.6 3.9 6 3.9s4.5-1.3 6-3.9" fill="none" stroke="${k.trim}" stroke-width="3.4"/></g>`
    + `<path d="${SHIRT}" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
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
      const b = el('button', 'kit', `${shirtSvg(k)}<span>${k.name}</span>`); b.type = 'button';
      b.setAttribute('aria-label', `${k.name} 유니폼`); b.setAttribute('aria-pressed', k.id === cur);
      b.addEventListener('click', () => { show(list, k.id); onChange(k.id); });
      row.appendChild(b);
    }
  }
  return { root: wrap, show };
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

// 선택 화면: 왼쪽 반이 나(1P), 오른쪽 반이 상대 — 1인이면 컴퓨터(AI, 랜덤 "?" 카드 + 난이도), 2인이면 2P(선수 + 유니폼).
// 가운데 기둥에 엠블럼·VS·"1인 | 2인"·소리·경기 시작 (2026-11-07 형준 "화면 왼쪽 반이 1p 오른쪽 2p였으면, 1인 혼자 ai랑 할 때는 오른쪽을 ai로").
// 오른쪽은 왼쪽과 같은 선수를 못 고른다. 2P 유니폼은 왼쪽과 상관없이 전부(2026-11-08 형준 "2p 유니폼도 5개 중에 고르게"; 그 전엔 다른 계열만). 토글하면 상태를 들고 다시 그린다.
export function showSelect({ imgs, selection, onStart }) {
  const slot = def => (def.position === 'GK' ? 'gk' : 'field');
  const st = { two: !!selection.two, diff: selection.difficulty, L: { number: selection.number, kit: { field: KITS[0].id, gk: GK_KITS[0].id } }, R: { number: selection.opp, kit: { field: KITS[1].id, gk: GK_KITS[0].id } },   // 2P: 선수와 유니폼. 기본은 어웨이(1P 기본 홈과 안 겹치게)
    ai: selection.ai ?? null };   // 1인 모드의 컴퓨터 상대 등번호. null = 랜덤(기본). 2P 선수와 따로 둔다: 2인에서 1인으로 넘겨도 랜덤 상대가 기본 (2026-11-12 형준 "1인은 디폴트가 랜덤상대로")
  const initL = kitById(selection.kit); if (initL) st.L.kit[initL.gk ? 'gk' : 'field'] = initL.id;
  const initR = kitById(selection.kitR); if (initR) st.R.kit[initR.gk ? 'gk' : 'field'] = initR.id;
  const Ldef = () => byNumber(st.L.number);
  // 컴퓨터 카드 미리 보기용: 경기(sideKits)처럼 왼쪽과 다른 계열의 첫 유니폼, 골키퍼끼리는 왼쪽 것 빼고
  const aiKit = def => { const Lgk = Ldef().position === 'GK'; return (def.position === 'GK' ? GK_KITS.filter(k => !(Lgk && k.id === st.L.kit.gk)) : (Lgk ? KITS : KITS.filter(k => k.tone !== kitById(st.L.kit.field).tone)))[0]; };
  const tag = (card, text) => card.prepend(el('span', 'tag', text));

  function render() {
    const sheet = el('div', 'sheet duel' + (st.two ? ' two' : ''));
    const row = el('div', 'duel-row');
    const left = el('div', 'side L'), mid = el('div', 'mid'), right = el('div', 'side R');
    let pickR = null, kitsR = null;
    const kitsL = buildKits(id => {
      st.L.kit[slot(Ldef())] = id; pickL.refresh();
    });
    const pickL = buildCarousel({ players: PLAYERS, imgs, initial: st.L.number, side: 'L', keys: st.two ? ['KeyA', 'KeyD'] : ['ArrowLeft', 'ArrowRight'],
      kitFor: def => kitById(st.L.kit[slot(def)]),
      onChange: def => { st.L.number = def.number; kitsL.show(kitsFor(def), st.L.kit[slot(def)]); if (pickR) pickR.refresh(); } });
    tag(pickL.card, '1P');
    left.append(pickL.root.querySelector('.carousel'), pickL.root.querySelector('.skill'), pickL.root.querySelector('.thumbs'), kitsL.root);

    if (st.two) {
      kitsR = buildKits(id => { st.R.kit[slot(pickR.current())] = id; pickR.refresh(); });
      pickR = buildCarousel({ players: PLAYERS, imgs, initial: st.R.number ?? 0, side: 'R', keys: ['ArrowLeft', 'ArrowRight'], exclude: () => st.L.number,
        kitFor: def => kitById(st.R.kit[slot(def)]),
        onChange: def => { st.R.number = def.number; kitsR.show(kitsFor(def), st.R.kit[slot(def)]); } });
      tag(pickR.card, '2P');
      right.append(pickR.root.querySelector('.carousel'), pickR.root.querySelector('.skill'), pickR.root.querySelector('.thumbs'), kitsR.root);
    } else {
      pickR = buildCarousel({ players: PLAYERS, imgs, initial: st.ai ?? 0, side: 'R', random: true, keys: [], exclude: () => st.L.number,
        kitFor: aiKit,   // 미리 보기용. 경기에선 왼쪽과 다른 계열 중 무작위
        onChange: def => { st.ai = def.random ? null : def.number; } });
      tag(pickR.card, 'AI');
      right.append(pickR.root.querySelector('.carousel'), pickR.root.querySelector('.skill'), pickR.root.querySelector('.thumbs'), buildLevels(st.diff, d => { st.diff = d; }));
    }

    mid.innerHTML = '<span class="club">ULSAN HD FC</span><span class="emblem" aria-hidden="true"></span><span class="vs" aria-hidden="true">VS</span>';
    const mode = buildMode(st.two, on => { st.two = on; render(); });
    const start = el('button', 'action', '경기 시작'); start.type = 'button';
    start.addEventListener('click', () => {
      const p2 = byNumber(st.R.number);   // 2P 선수 (2인 화면을 한 번도 안 열었으면 없을 수 있다)
      onStart({ number: st.L.number, difficulty: st.diff, kit: st.L.kit[slot(Ldef())], opp: st.R.number ?? null, ai: st.ai, two: st.two, kitR: p2 ? st.R.kit[slot(p2)] : null });
    });
    mid.append(mode.root, buildSoundToggle(), start);
    row.append(left, mid, right);
    sheet.appendChild(row);
    if (st.two) sheet.appendChild(el('p', 'two-keys', '<span class="grp"><b>1P</b> <kbd>A</kbd><kbd>D</kbd> 이동 · <kbd>W</kbd> 점프 · <kbd>Tab</kbd> 슛</span> <span class="grp"><b>2P</b> <kbd>←</kbd><kbd>→</kbd> 이동 · <kbd>↑</kbd> 점프 · <kbd>Space</kbd> 슛</span>'));
    show(sheet, e => { pickL.onKey(e); pickR.onKey(e); });
    start.focus({ preventScroll: true });
  }
  render();
}

// VS 화면: 경기 속 모습 그대로의 큰 캐릭터 둘이 금색 사선을 사이에 두고 마주 본다. 양옆에서 미끄러져 들어오고 VS 가 쾅 찍힌다
// (2026-11-12 형준 "UI랑 게임 최대한 예뻐보이게"; 전엔 작은 동그란 사진 둘과 VS 글자, 1초). kits = { L, R } 는 경기에서 입을 유니폼, tags 는 [왼쪽, 오른쪽] 꼬리표.
export function showVs({ home, away, kits, imgs, tags = ['1P', 'AI'] }, ms = 1500) {
  const sheet = el('div', 'sheet vs');
  const side = (cls, def, kit, tag) => {
    const box = el('div', 'vs-side ' + cls), canvas = el('canvas'); canvas.setAttribute('aria-hidden', 'true');
    paintCard(canvas, def, imgs, kit, cls, { zoom: 1.5 * (parseFloat(stageEl.style.getPropertyValue('--us')) || 1) });   // VS 시트는 zoom 을 안 쓰니 배율을 직접 곱한다
    box.append(el('span', 'tag', tag), canvas, el('div', 'vs-cap', `<span class="num">${def.number}</span><b class="name">${def.name}</b><span class="sk">${def.special.name}</span>`));
    return box;
  };
  const mark = el('div', 'vs-mark', 'VS'); mark.setAttribute('aria-hidden', 'true');
  sheet.append(side('L', home, kits.L, tags[0]), mark, side('R', away, kits.R, tags[1]));
  sheet.setAttribute('aria-label', `${home.name} 대 ${away.name}`);
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
  show(sheet, picker.onKey);
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

export function showResult({ match, imgs, onAgain, onChange }) {
  const sheet = el('div', 'sheet result');
  const verdict = match.twoPlayer ? (match.result === 'draw' ? '무승부' : `${match.used[match.result === 'win' ? 'L' : 'R'].at(-1).name} 승리`)   // 2인: 이긴 선수 이름
    : match.result === 'win' ? '승리' : match.result === 'lose' ? '패배' : '무승부';
  // 선수마다 얼굴·이름·골 수, 교체했으면 화살표로 잇는다 (2026-10-31 형준: 대칭 + 선수별 골)
  const tally = side => { const t = {}; for (const g of match.goals) if (g.side === side) t[g.number] = (t[g.number] || 0) + 1; return t; };
  const lineup = side => { const t = tally(side); return match.used[side].map(d => `<div class="chip"><img src="${d.img}" alt=""><b>${d.name}</b><span class="g${t[d.number] ? '' : ' none'}"><em>${t[d.number] || 0}</em>골</span></div>`).join('<i class="sub-arrow" aria-hidden="true">→</i>'); };
  sheet.innerHTML = `
    <div class="result-main">
    <span class="emblem" aria-hidden="true"></span>
    <p class="verdict ${match.twoPlayer && match.result !== 'draw' ? 'win' : match.result}">${verdict}</p>
    <p class="score"><span>${match.scores.L}</span><em>-</em><span>${match.scores.R}</span></p>
    <div class="lineup"><div class="side">${lineup('L')}</div><div class="side away">${lineup('R')}</div></div>
    <div class="row">
      <button class="action" type="button" data-act="again">다시 하기</button>
      <button class="action ghost" type="button" data-act="change">선수 바꾸기</button>
      <button class="action ghost" type="button" data-act="share" hidden>결과 공유</button>
    </div>
    </div>`;
  // 양옆에 마지막까지 뛴 두 선수: 이긴 쪽은 두 팔 번쩍 들고 폴짝폴짝, 진 쪽은 풀썩 (2026-11-12 형준 "UI랑 게임 최대한 예뻐보이게")
  if (imgs) {
    const figure = s => {
      const won = match.result === (s === 'L' ? 'win' : 'lose'), lost = match.result === (s === 'L' ? 'lose' : 'win');
      const def = match.used[s].at(-1), canvas = el('canvas', 'result-fig ' + s + (won ? ' won' : lost ? ' lost' : '')); canvas.setAttribute('aria-hidden', 'true');
      paintCard(canvas, def, imgs, wornKit(match.kits[s], def), s, { zoom: stageEl.dataset.tiny === '1' ? 1.05 : 1.25, pose: won ? 'cheer' : lost ? 'sad' : null });
      canvas.style.maxWidth = canvas.style.width; canvas.style.width = '100%'; canvas.style.height = 'auto';   // 칸이 좁으면(16:9 폰) 그만큼 줄어든다
      return canvas;
    };
    sheet.prepend(figure('L')); sheet.append(figure('R'));
  }
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

// 전체 흐름. selection = { number, difficulty, kit, opp, ai, two, kitR }: opp·kitR 은 2P 선수와 유니폼, ai 는 1인 모드에서 지정한 컴퓨터 상대(null 이면 랜덤).
// ai 는 저장하지 않는다: 다시 열면 1인은 늘 랜덤 상대에서 시작한다 (2026-11-12 형준 "1인은 디폴트가 랜덤상대로"; 전엔 지정한 상대가 저장돼 다음에도 그 선수가 떠 있었다)
export function runFlow({ startMatch, finishSubstitution, imgs, onIdle }) {
  const saved = load() || {};
  const number = byNumber(saved.number) ? saved.number : 10;
  let selection = { number, difficulty: LEVELS.some(l => l.id === saved.difficulty) ? saved.difficulty : 'first', kit: kitById(saved.kit) ? saved.kit : 'home',
    opp: byNumber(saved.opp) && saved.opp !== number ? saved.opp : null, ai: null, two: saved.two === true, kitR: kitById(saved.kitR) ? saved.kitR : null };

  const randomOther = home => { const pool = PLAYERS.filter(p => p.number !== home.number); return pool[Math.floor(Math.random() * pool.length)]; };

  function play(sel) {
    const home = byNumber(sel.number);
    const pick = sel.two ? sel.opp : sel.ai;   // 오른쪽: 2인이면 2P 선수, 1인이면 지정한 컴퓨터 상대(없으면 랜덤)
    const away = byNumber(pick) && pick !== home.number ? byNumber(pick) : randomOther(home);
    // 오른쪽 유니폼을 여기서 정한다: 2인은 고른 것, 컴퓨터는 경기 규칙(sideKits: 내 것과 다른 계열 중 무작위)대로 뽑아 VS 화면과 경기가 같은 옷이 되게
    onIdle?.();   // "다시 하기"로 와도 VS 화면 뒤는 지난 경기의 마지막 장면이 아니라 빈 경기장
    const picked = sideKits(sel.kit, Math.random, sel.two ? sel.kitR : null);
    const kitR = wornKit(picked.R, away).id;
    showVs({ home, away, kits: { L: wornKit(picked.L, home), R: wornKit(picked.R, away) }, imgs, tags: ['1P', sel.two ? '2P' : 'AI'] }).then(() => {
      hideOverlay();
      startMatch(home, away, sel.difficulty, {
        kit: sel.kit, kitR, twoPlayer: sel.two,
        onSubRequest: m => showSubSelect({
          imgs, kits: m.kits.L, exclude: [m.used.L.at(-1).number, m.used.R.at(-1).number],
          onPick: d => { hideOverlay(); finishSubstitution(d); },
          onCancel: () => { hideOverlay(); finishSubstitution(null); },
        }),
        onOver: (m, wait) => setTimeout(() => showResult({ match: m, imgs, onAgain: () => play(sel), onChange: toSelect }), wait),
      });
    });
  }
  function toSelect() {
    onIdle?.();   // 지난 경기 장면을 지우고 빈 경기장을 배경으로
    showSelect({ imgs, selection, onStart: sel => { selection = sel; save({ ...sel, ai: undefined }); play(sel); } });
  }
  toSelect();
  return { toSelect, play };
}
