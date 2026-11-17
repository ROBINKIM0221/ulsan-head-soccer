// 온라인 대전 화면 흐름: 로비(내 선수 고르기 + 친구 초대 / 친구가 고른 선수) → VS → 경기 → 결과 → 로비.
// 방 만든 쪽이 왼쪽(L), 초대 링크로 들어온 쪽이 오른쪽(R): 로비·VS·경기 모두 같은 자리에 선다. 규칙은 net/room.js, 연결은 net/link.js.
import { PLAYERS, byNumber } from '../data/players.js';
import { KITS, GK_KITS, kitById, kitsFor } from '../data/kits.js';
import { el, show, hideOverlay, paintCard, buildCarousel, buildKits, buildMode, buildSoundToggle, oneKeys, showVs, showResult, showNotice } from './screens.js';
import { specialLine } from './text.js';
import { createRoom } from '../net/room.js';

const CID = 'uhd11.cid', ROOM = 'uhd11.room';
const ABORT = { 'peer-quit': '친구가 경기를 그만뒀어요', 'timeout-peer': '친구가 돌아오지 않아 경기가 끝났어요', 'timeout-me': '자리를 오래 비워 경기가 끝났어요', lost: '친구와 연결이 끊겼어요' };
const FAIL = {
  full: ['방이 가득 찼어요', '이미 두 명이 들어와 있어요.'],
  old: ['새로 고침이 필요해요', '게임이 새로 바뀌었어요. 두 사람 모두 새로 고침한 뒤 다시 들어와 주세요.'],
  'no-room': ['방을 찾을 수 없어요', '방을 만든 친구가 화면을 켜 두었는지 확인해 주세요.'],
  unreachable: ['연결하지 못했어요', '두 기기 사이에 길을 찾지 못했어요. 와이파이를 바꾸거나 잠시 뒤 다시 해 주세요.'],
  unsupported: ['이 브라우저에서는 온라인 대전을 할 수 없어요', '크롬이나 사파리로 열어 주세요.'],
  network: ['연결하지 못했어요', '인터넷 연결을 확인해 주세요.'],
  server: ['지금은 온라인 대전에 들어갈 수 없어요', '연결을 이어 주는 서버가 붐비거나 잠시 멈췄어요. 잠시 뒤 다시 해 주세요. 1인·2인 대전은 지금도 할 수 있어요.'],
};
const rand = n => { const abc = 'abcdefghjkmnpqrstuvwxyz23456789', a = new Uint32Array(n); crypto.getRandomValues(a); return [...a].map(v => abc[v % abc.length]).join(''); };
const stored = (store, key, make) => { try { let v = store.getItem(key); if (!v) { v = make(); store.setItem(key, v); } return v; } catch { return make(); } };   // 사생활 모드 등
const slot = def => (def.position === 'GK' ? 'gk' : 'field');

// lag·predict·stat: 점검용(주소의 &lag=ms, &predict=0, &netstat=1). stat 이면 화면 아래에 핑과 경로를 띄운다
export function createOnline({ imgs, startMatch, onIdle, stage, lag = 0, predict = true, stat = false }) {
  let room = null, code = null, ctx = null, ui = null, ticker = null, seq = 0, gone = false;
  const my = { number: 10, kit: { field: KITS[0].id, gk: GK_KITS[0].id } };
  const clientId = () => stored(localStorage, CID, () => rand(10));   // 이 브라우저의 표: 새로 고침해 다시 들어와도 같은 사람으로 알아본다
  const inviteUrl = () => location.origin + location.pathname + '?room=' + code;
  const bar = stat ? stage.appendChild(el('div', 'net-stat')) : null;
  if (bar) { bar.hidden = true; setInterval(() => {
    const s = room && room.link && room.link.open ? room.link.stat : null;
    bar.hidden = !s || s.rtt === null;
    if (s && s.rtt !== null) bar.textContent = `핑 ${Math.round(s.rtt)}ms` + (s.n ? ` (평균 ${Math.round(s.sum / s.n)} · 최대 ${Math.round(s.max)})` : '') + ` · ${s.route}${s.detail}`;
  }, 1000); }

  // 로비로 들어온다. join 이 있으면 초대 링크로 온 것(오른쪽), 없으면 방을 만든다(왼쪽)
  function open({ join = null, selection, save, leave }) {
    ctx = { save, leave }; gone = false;
    my.number = byNumber(selection.number) ? selection.number : 10;
    const k = kitById(selection.kit); if (k) my.kit[k.gk ? 'gk' : 'field'] = k.id;
    connect(join);
    lobby();
  }
  // fresh: 새 방 번호로(다시 시도). 방 번호는 탭에 적어 두어, 방 만든 사람이 새로 고침해도 보낸 링크가 그대로 통한다
  async function connect(join, fresh = false) {
    if (fresh) { try { sessionStorage.removeItem(ROOM); } catch { /* 사생활 모드 */ } }
    code = join || stored(sessionStorage, ROOM, () => rand(6));
    const r = room = createRoom({ host: !join, id: clientId() });
    r.onChange = sync; r.onStart = begin; r.onAbort = aborted;
    Object.assign(r.me, { n: my.number, kit: my.kit[slot(byNumber(my.number))] });   // 로비 화면이 이미 떠 있을 때(다시 시도)도 이쪽이 고른 것을 안다
    window.__net = r;   // 콘솔·검사 스크립트용
    try {
      const { createLink } = await import('../net/link.js');   // PeerJS(87KB)는 온라인을 열 때만 받는다
      if (room === r) r.attach(createLink({ room: r, code, id: clientId(), lag }));
    } catch { if (room === r) r.linkState('failed', 'network'); }
  }
  function exit(two) {
    seq++; clearInterval(ticker); ui = null;
    if (room) { room.close(); room = null; }
    const q = new URLSearchParams(location.search);
    if (q.has('room')) { q.delete('room'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); }   // 새로 고침해도 닫힌 방에 다시 들어가려 하지 않게
    ctx.leave(two);
  }

  // ---- 로비: 내 쪽은 고르고, 상대 쪽은 친구가 고르는 걸 본다 ----
  function lobby(ready = false) {
    seq++; ui = null;
    if (room.match) room.match.end();
    onIdle();
    const side = room.side;
    const sheet = el('div', 'sheet duel two net'), row = el('div', 'duel-row');
    const left = el('div', 'side L'), mid = el('div', 'mid'), right = el('div', 'side R');
    const mine = side === 'L' ? left : right, theirs = side === 'L' ? right : left;
    let pick = null;
    const kits = buildKits(id => { ui.kitTouched = true; my.kit[slot(byNumber(my.number))] = id; pick.refresh(); });
    // 들어온 쪽은 방 만든 쪽이 고른 선수를 못 고른다(한 키보드 2인과 같은 규칙: 오른쪽이 비켜 준다)
    pick = buildCarousel({ players: PLAYERS, imgs, initial: my.number, side, exclude: () => (room.host || !room.peer ? null : room.peer.n),
      kitFor: def => kitById(my.kit[slot(def)]),
      onChange: def => { my.number = def.number; const kit = my.kit[slot(def)]; kits.show(kitsFor(def), kit); room.setMine(def.number, kit); ctx.save(ui && ui.kitTouched ? { number: def.number, kit } : { number: def.number }); paintReady(); } });   // 저절로 갈아입은 유니폼은 저장하지 않는다
    pick.card.prepend(el('span', 'tag', '나'));
    mine.append(pick.root.querySelector('.carousel'), pick.root.querySelector('.skill'), pick.root.querySelector('.thumbs'), kits.root);

    mid.innerHTML = '<span class="club">ULSAN HD FC</span><span class="emblem" aria-hidden="true"></span><span class="vs" aria-hidden="true">VS</span>';
    const mode = buildMode('online', id => exit(id === 'two'), true);
    const readyBtn = el('button', 'action', ''); readyBtn.type = 'button';
    readyBtn.addEventListener('click', () => { room.setReady(!room.me.ready); paintReady(); });
    mid.append(mode.root, buildSoundToggle(), readyBtn);
    row.append(left, mid, right); sheet.append(row, oneKeys());   // 맨 아래 키 안내 한 줄: 온라인은 각자 자기 기기에서 1인과 같은 키
    ui = { theirs, pick, readyBtn, sig: null, kitTouched: false };
    show(sheet, e => pick.onKey(e));
    if (ready) room.setReady(true);   // 결과 화면의 "다시 하기": 둘 다 누르면 바로 다음 판
    sync();
    clearInterval(ticker); ticker = setInterval(sync, 1000);   // 친구가 자리를 비웠는지는 시간이 지나야 안다
  }
  function sync() {
    if (!room) return;
    if (!room.host && (room.state === 'failed' || room.state === 'lost')) return closed();
    if (ui) { paintPeer(); paintReady(); }
  }
  function paintReady() {
    if (!ui) return;
    const b = ui.readyBtn, can = room.state === 'open' && !!room.peer;
    b.disabled = !can;
    b.textContent = !can ? (room.host ? '친구 기다리는 중' : '들어가는 중') : room.me.ready ? '준비 완료 ✓' : '준비';
    b.classList.toggle('ghost', can && room.me.ready);
    b.setAttribute('aria-pressed', can && room.me.ready);
  }
  function paintPeer() {
    const p = room.peer, quiet = room.peerQuiet(), sig = JSON.stringify([room.state, room.why, p, quiet]);
    if (sig === ui.sig) return;   // 바뀐 게 없으면 그대로 둔다
    ui.sig = sig;
    const def = p && byNumber(p.n);
    if (def) {
      const car = el('div', 'carousel peek'), card = el('div', 'card'), canvas = el('canvas'); canvas.setAttribute('aria-hidden', 'true');
      card.append(el('span', 'tag', '친구'), canvas, el('div', 'who', `<b class="name">${def.name}</b><span class="num">${def.number}</span>`));
      car.appendChild(card);
      const skill = el('div', 'skill', `<div class="skill-head"><span class="skill-tag">필살기</span><b class="skill-name">${def.special.name}</b></div><p class="skill-desc">${specialLine(def.special)}</p>`);
      const state = el('p', 'peer-state' + (p.ready && !quiet ? ' ready' : ''), quiet ? '잠깐 자리를 비웠어요' : p.ready ? '준비 완료 ✓' : '선수를 고르는 중…');
      ui.theirs.replaceChildren(car, skill, state);
      paintCard(canvas, def, imgs, kitById(p.kit) || kitsFor(def)[0], room.side === 'L' ? 'R' : 'L');
    } else ui.theirs.replaceChildren(room.host ? invitePanel() : waitPanel());
    if (!room.host) { if (def) avoidKit(p); ui.pick.refresh(); }   // 친구가 내 선수를 골랐으면 다음 선수로 넘어간다
  }
  // 들어온 쪽: 친구와 같은 계열 유니폼이면 다른 계열로 갈아입는다(직접 고른 뒤로는 그대로 둔다). 경기에서 두 선수가 한눈에 구별되게
  function avoidKit(p) {
    const def = byNumber(my.number), s = slot(def), cur = kitById(my.kit[s]), theirs = kitById(p.kit);
    if (ui.kitTouched || !theirs || !!theirs.gk !== !!cur.gk || (cur.gk ? theirs.id !== cur.id : theirs.tone !== cur.tone)) return;
    const other = kitsFor(def).find(k => (cur.gk ? k.id !== cur.id : k.tone !== cur.tone));
    if (other) my.kit[s] = other.id;
  }
  function waitPanel() {
    const box = el('div', 'invite');
    box.append(el('p', 'invite-title', '친구의 방'), el('p', 'invite-note', room.state === 'open' ? '친구가 고른 선수를 불러오는 중…' : room.why === 'no-room' ? '친구가 게임 화면을 켜 두어야 들어갈 수 있어요. 기다리는 중…' : '방에 들어가는 중…'));
    return box;
  }
  function invitePanel() {
    const box = el('div', 'invite'), st = room.state, url = inviteUrl(), ok = st === 'waiting' || st === 'lost' || st === 'open';
    box.append(el('p', 'invite-title', '친구 초대'));
    if (st === 'failed') {
      const [title, text] = FAIL[room.why] || FAIL.network;
      const again = el('button', 'action', '다시 시도'); again.type = 'button';
      again.addEventListener('click', () => { room.close(); connect(null, true); ui.sig = null; sync(); });
      box.append(el('p', 'invite-note', `${title}. ${text}`), again);
      return box;
    }
    box.append(el('p', 'invite-note', !ok ? '방을 여는 중…' : st === 'lost' ? '친구가 나갔어요. 링크를 다시 보내 초대할 수 있어요.' : '링크를 보내면 친구가 바로 들어와요.'));
    const copy = el('button', 'action', '초대 링크 복사'); copy.type = 'button'; copy.disabled = !ok;
    const field = el('input', 'invite-link'); field.readOnly = true; field.value = url; field.hidden = true; field.setAttribute('aria-label', '초대 링크');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); copy.textContent = '복사했어요'; }
      catch { field.hidden = false; field.focus(); field.select(); field.setSelectionRange(0, url.length); copy.textContent = '아래 주소를 복사해 주세요'; }   // 카톡 안 브라우저 등 복사가 막힌 곳
    });
    box.append(copy);
    if (navigator.share) {
      const sh = el('button', 'action ghost', '공유하기'); sh.type = 'button'; sh.disabled = !ok;
      sh.addEventListener('click', () => navigator.share({ title: document.title, text: '울산 HD 1 VS 1 축구 한 판 하자!', url }).catch(() => {}));
      box.append(sh);
    }
    box.append(field);
    return box;
  }

  // ---- 경기 ----
  function begin({ L, R }) {
    const token = ++seq, r = room;
    clearInterval(ticker); ui = null;
    const home = byNumber(L.n), away = byNumber(R.n);
    const kitL = kitById(L.kit) || kitsFor(home)[0], kitR = kitById(R.kit) || kitsFor(away)[0];
    onIdle();
    showVs({ home, away, kits: { L: kitL, R: kitR }, imgs, tags: r.side === 'L' ? ['나', '친구'] : ['친구', '나'] }).then(() => {
      if (token !== seq || room !== r) return;                    // VS 가 떠 있는 동안 나갔거나 방이 닫혔다(알림이 이미 떠 있다)
      if (r.state !== 'open') { lobby(); return; }                // 방 만든 쪽: 그사이 친구가 나갔다
      hideOverlay();
      startMatch(home, away, 'first', { kit: kitL.id, kitR: kitR.id, twoPlayer: true, net: r.beginMatch({ predict }), onQuit: () => lobby(),
        onOver: (m, wait) => setTimeout(() => { if (token === seq) showResult({ match: m, imgs, onAgain: () => lobby(true), onChange: () => lobby(false) }); }, wait) });
    });
  }
  // 경기가 중간에 끝났다(친구가 그만둠·너무 오래 자리 비움·끊김)
  function aborted(reason) {
    seq++; onIdle();
    if (!room.host && reason === 'lost') return;   // 방이 닫힌 것: 바로 뒤에 sync 가 닫힘 알림을 띄운다
    clearInterval(ticker); ui = null;
    showNotice({ title: ABORT[reason] || ABORT.lost, button: '확인', onOk: () => lobby() });
  }
  // 들어온 쪽: 방에 못 들어갔거나 방이 닫혔다
  function closed() {
    if (gone) return;
    gone = true; seq++; clearInterval(ticker); ui = null; onIdle();
    const [title, text] = room.state === 'failed' ? (FAIL[room.why] || FAIL.network) : ['방이 닫혔어요', '방을 만든 친구가 나갔어요.'];
    showNotice({ title, text, button: '혼자 하기', onOk: () => exit(false) });
  }

  return { open };
}
