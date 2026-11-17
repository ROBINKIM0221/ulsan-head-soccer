// 온라인 대전의 연결. PeerJS 무료 중개 서버(0.peerjs.com)로 서로를 찾고, 그 뒤는 기기끼리 직접 주고받는다(WebRTC). 직접 길이 막히면 PeerJS 의 중계 서버를 거친다.
// room(net/room.js)에는 link.send(msg) · link.open · link.lastHeard · link.close() 만 보이고, 여기서는 room.linkState / room.message / room.join 을 부른다.
// 중개 서버를 바꿔도 이 파일만 고치면 된다.
import '../vendor/peerjs.min.js';   // window.Peer
import { encode } from './predict.js';
import { VERSION } from './room.js';

const PREFIX = 'uhdfc-hs1-';
const WHY = { 'unavailable-id': 'taken', 'browser-incompatible': 'unsupported' };
// 중개 서버와의 연결 오류: 내 인터넷이 꺼진 게 아니면 서버 쪽(동시 접속 한도로 거절, 멈춤) 탓이라 팬에게 그렇게 알린다
const whyOf = type => WHY[type] || (navigator.onLine === false ? 'network' : 'server');
const KNOCK_MS = 3000, JOIN_LIMIT_MS = 30000;   // 들어가는 쪽: 3초마다 다시 두드리고, 30초 안에 못 들어가면 그만둔다
const OPEN_LIMIT_MS = 20000;                    // 중개 서버가 이 안에 답하지 않으면 그만둔다("방을 여는 중"에 멈추지 않게)

// code: 방 번호. id: 이 브라우저의 표(같은 사람이 다시 들어오는 걸 알아보려고). lag: 점검용, 보내는 메시지를 그만큼(ms) 늦춘다
export function createLink({ room, code, id, lag = 0 }) {
  const host = room.host;
  let peer = null, conn = null, ready = false, closed = false, tries = 0, timers = [], pongs = 0, knockT = null, joinStart = 0, noRoom = false, openT = null;
  const stat = { rtt: null, n: 0, sum: 0, max: 0, route: '?', detail: '' };   // 핑(지금·평균·최대)과 경로(직접/중계): 점검용 화면 아래 띠
  const link = { stat, lastHeard: 0, get open() { return ready && !!conn && conn.open; }, send, close };

  const put = (c, s) => { if (c && c.open) c.send(s); };
  const direct = (c, m) => put(c, JSON.stringify(m));   // 들어올 때의 인사(join·welcome·no)와 작별(bye)
  function send(m) { if (!link.open) return; const s = encode(m), c = conn; if (lag > 0) setTimeout(put, lag, c, s); else put(c, s); }

  function fail(why) { if (closed) return; shut(); room.linkState('failed', why); }
  // later: 작별 인사가 나갈 틈을 주고 끊는다
  function shut(later = false) {
    closed = true; ready = false; clearTimeout(knockT); clearTimeout(openT); timers.forEach(clearInterval); timers = []; removeEventListener('pagehide', close);
    const p = peer; if (p && !p.destroyed) { if (later) setTimeout(() => p.destroy(), 300); else p.destroy(); }
  }
  function close() { if (closed) return; if (link.open) direct(conn, { t: 'bye' }); shut(true); }   // 창을 닫을 때도 부른다: 상대가 갑자기 사라지면 닫혔다는 신호가 1분 넘게 안 올 수 있어서 말로 알린다

  // 연결이 섰다: 핑을 돌리고 room 에 알린다
  function up() {
    tries = 0; clearTimeout(knockT); link.lastHeard = performance.now(); pongs = 0;
    Object.assign(stat, { rtt: null, n: 0, sum: 0, max: 0, route: '?', detail: '' });
    timers.forEach(clearInterval);
    timers = [setInterval(() => send({ t: 'ping', ts: performance.now() }), 500), setInterval(route, 2000)];
    room.linkState('open');
  }
  function down(c) {
    if (c !== conn) return;   // 이미 다른 연결로 바뀌었다
    const was = ready; ready = false; timers.forEach(clearInterval); timers = [];
    if (was) conn = null;
    if (!closed && was) room.linkState('lost');   // 방 만든 쪽은 중개 서버에 그대로 붙어 있어 다음 사람을 받을 수 있다. 붙기도 전에 닫힌 것은 knock 이 다시 두드린다
  }
  async function route() {
    const pc = conn && conn.peerConnection; if (!pc) return;
    const all = await pc.getStats(); let pair = null;
    all.forEach(r => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
    const l = pair && all.get(pair.localCandidateId), r = pair && all.get(pair.remoteCandidateId);
    if (l && r) { stat.route = l.candidateType === 'relay' || r.candidateType === 'relay' ? '중계' : '직접'; stat.detail = `(${l.candidateType}/${r.candidateType})`; }
  }

  function onData(c, s) {
    if (closed) return;
    let m; try { m = JSON.parse(s); } catch { return; }
    if (c !== conn || !ready) return hello(c, m);
    link.lastHeard = performance.now();
    if (m.t === 'ping') send({ t: 'pong', ts: m.ts });
    else if (m.t === 'pong') {
      const r = performance.now() - m.ts; stat.rtt = r;
      if (++pongs > 6) { stat.n++; stat.sum += r; stat.max = Math.max(stat.max, r); }   // 처음 3초는 화면이 바빠 핑이 부풀어 나온다: 평균·최대에서 뺀다
    } else if (m.t === 'bye') c.close();
    else room.message(m, s);
  }
  // 인사: 들어온 쪽이 join 을 보내면 방 만든 쪽(room.join)이 받을지 정해 welcome 이나 no 로 답한다
  function hello(c, m) {
    if (host) {
      if (m.t !== 'join') return;
      const v = room.join(m);
      if (v !== 'ok') { direct(c, { t: 'no', why: v }); setTimeout(() => c.close(), 600); return; }
      const old = conn; conn = c; ready = true;
      if (old && old !== c) old.close();   // 같은 사람이 새로 들어왔다(새로 고침)
      direct(c, { t: 'welcome' });
      up();
    } else if (c === conn && m.t === 'welcome') { ready = true; up(); }
    else if (c === conn && m.t === 'no') fail(m.why);
  }
  const wire = c => { c.on('data', s => onData(c, s)); c.on('close', () => down(c)); c.on('error', () => {}); };

  // 들어가는 쪽: 문을 두드린다. 방 만든 사람이 링크를 보내느라 카톡에 가 있으면 그 폰의 게임 화면은 멈춰 있어 답이 없다 → 돌아올 때까지 3초마다 다시 두드린다.
  // (PeerJS 는 "그런 방 없음"을 첫 번째에만 알려 주고 그 뒤로는 말이 없어서, 시간을 재서 끝낸다)
  function knock() {
    if (closed || link.open) return;
    const pc = conn && conn.peerConnection, answered = !!(pc && pc.remoteDescription);   // 답이 왔으면 두 기기 사이의 길을 찾는 중: 새로 두드리지 않고 기다린다
    if (performance.now() - joinStart > JOIN_LIMIT_MS) return fail(!answered && noRoom ? 'no-room' : 'unreachable');
    if (!answered && !peer.disconnected) {   // 중개 서버와 잠깐 끊겨 있으면 이번엔 건너뛴다
      const old = conn, c = conn = peer.connect(PREFIX + code, { serialization: 'raw' });
      if (old) old.close();
      c.on('open', () => direct(c, { t: 'join', id, v: VERSION }));
      wire(c);
    }
    knockT = setTimeout(knock, KNOCK_MS);
  }
  function start() {
    const p = peer = host ? new window.Peer(PREFIX + code) : new window.Peer();
    p.on('open', () => {
      clearTimeout(openT);
      if (link.open) return;   // 경기 중에 중개 서버에만 다시 붙은 것
      if (host) room.linkState('waiting');
      else if (!joinStart) { joinStart = performance.now(); room.linkState('joining'); knock(); }
    });
    if (host) p.on('connection', wire);
    // 중개 서버와만 끊긴 것(폰에서 카톡으로 넘어갔다 올 때 등): 다음 사람을 받으려면 다시 붙어야 한다. destroy 도중에도 이 이벤트가 나와서 잠깐 뒤에 확인한다
    p.on('disconnected', () => setTimeout(() => { if (p === peer && !closed && !p.destroyed && p.disconnected) p.reconnect(); }, 800));
    p.on('error', e => {
      if (closed) return;
      if (host && e.type === 'unavailable-id' && tries++ < 6) { p.destroy(); setTimeout(() => { if (!closed) start(); }, 1500); }   // 새로 고침 직후엔 전 연결이 아직 방 번호를 쥐고 있다
      else if (!host && e.type === 'peer-unavailable') { noRoom = true; if (!link.open) room.linkState('joining', 'no-room'); }       // 아직 방이 안 보인다: knock 이 계속 두드린다
      else if (!link.open) fail(whyOf(e.type));   // 경기 중 중개 서버와만 끊긴 것은 넘어간다
    });
  }
  room.linkState('opening');
  addEventListener('pagehide', close);
  openT = setTimeout(() => { if (!(peer && peer.open)) fail(whyOf()); }, OPEN_LIMIT_MS);
  start();
  return link;
}
