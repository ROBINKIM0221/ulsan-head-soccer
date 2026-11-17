// 관전 링크: 경기하는 기기(아이패드)가 경기 상태를 보내고, 다른 폰·노트북이 같은 화면을 그린다. 촬영 때 촬영팀이 플레이 화면을 보려고.
// 경기하는 쪽: ?cast=코드 → startCast(코드). 화면에는 아무것도 띄우지 않는다(녹화 화면 그대로).
// 보는 쪽: ?watch=코드 → watchCast(코드, 콜백). 조작·소리 없이 받은 상태만 그린다(main.js startWatch).
// 연결은 온라인 대전과 같은 PeerJS 무료 중개 서버. 보는 쪽은 몇 대여도 된다.
import '../vendor/peerjs.min.js';   // window.Peer
import { encode, snapshotOf, decode } from './predict.js';

const PREFIX = 'uhdfc-hs1-cast-';
const SEND_EVERY = 4;   // 120Hz 중 4틱마다 = 초당 30번

export function startCast(code) {
  const conns = new Set();
  let peer = null, tick = 0, mid = 0, events = [];
  const send = msg => { for (const c of conns) if (c.open) c.send(msg); };
  function open() {
    const p = peer = new window.Peer(PREFIX + code);
    p.on('connection', c => {
      c.on('open', () => conns.add(c));
      c.on('close', () => conns.delete(c));
      c.on('error', () => conns.delete(c));
    });
    p.on('disconnected', () => setTimeout(() => { if (p === peer && !p.destroyed && p.disconnected) p.reconnect(); }, 1000));   // 중개 서버와만 끊긴 것: 다시 붙어야 새로 보는 사람을 받는다
    p.on('error', e => { if (e.type === 'unavailable-id' || e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') { p.destroy(); if (p === peer) setTimeout(open, 3000); } });   // 새로 고침 직후엔 전 연결이 코드를 쥐고 있다
  }
  open();
  return {
    begin() { mid++; tick = 0; events = []; },   // 새 경기
    frame(match, ev) {
      if (!conns.size) { events = []; return; }
      events.push(...ev);
      if (++tick % SEND_EVERY) return;
      const L = match.used.L.at(-1), R = match.used.R.at(-1);
      send(encode({ t: 's', mid, ...snapshotOf(match), k: { L: L.number, R: R.number, two: match.twoPlayer, kits: match.kits }, e: events }));
      events = [];
    },
    idle() { send(JSON.stringify({ t: 'idle' })); },   // 선수 고르는 화면으로 돌아갔다
    get watchers() { return conns.size; },
  };
}

// on.state(s): 받은 상태(decode 한 것, s.mid·s.k·s.e 포함), on.idle(), on.link(연결됐는지)
export function watchCast(code, on) {
  let peer = null, conn = null, retry = null;
  const again = () => { clearTimeout(retry); retry = setTimeout(connect, 2000); };
  // 붙을 때까지 3초마다 다시 두드린다: 중개 서버는 "그런 상대 없음"을 처음 한 번만 알려 주고 그 뒤로는 말이 없다(아이패드가 나중에 켜져도 붙게)
  function connect() {
    clearTimeout(retry);
    if (!peer || peer.destroyed) return;
    if (peer.disconnected) { try { peer.reconnect(); } catch { /* 이미 붙는 중 */ } again(); return; }
    const old = conn, c = conn = peer.connect(PREFIX + code, { serialization: 'raw' });
    if (old) old.close();
    retry = setTimeout(() => { if (c === conn && !c.open) connect(); }, 3000);
    c.on('open', () => on.link(true));
    c.on('data', raw => {
      if (c !== conn) return;
      if (raw.startsWith('{"t":"idle"')) return on.idle();
      on.state(decode(raw));
    });
    c.on('close', () => { if (c === conn) { on.link(false); again(); } });
    c.on('error', () => { if (c === conn) { on.link(false); again(); } });
  }
  function start() {
    const p = peer = new window.Peer();
    p.on('open', connect);
    p.on('error', e => {
      if (e.type === 'peer-unavailable') { on.link(false); again(); }        // 아이패드가 아직 안 열렸다: 2초마다 다시
      else if (p.destroyed || ['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) { on.link(false); p.destroy(); setTimeout(start, 3000); }   // 중개 서버와 끊겼다: 처음부터 다시
    });
    p.on('disconnected', () => setTimeout(() => { if (p === peer && !p.destroyed && p.disconnected) p.reconnect(); }, 1000));
  }
  start();
}
