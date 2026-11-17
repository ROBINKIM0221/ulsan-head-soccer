// 온라인 방: 두 사람(방 만든 쪽 = 왼쪽 L, 들어온 쪽 = 오른쪽 R)의 선수 고르기·경기·잠깐 멈춤을 맞춘다.
// DOM 을 모른다. 연결은 link 를 넘겨받는다(실제는 net/link.js, 테스트는 가짜): link.send(msg), link.open, link.lastHeard, link.close().
// link 쪽에서는 room.linkState(상태, 까닭) · room.message(msg, raw) · room.join(msg) 를 부른다.
//
// 메시지: lobby(고른 선수·유니폼·준비) → start(둘 다 준비되면 방 만든 쪽이) → 경기 중 i(들어온 쪽 입력)·s(상태)·away(자리 비움)·quit(그만둠).
// 맞추는 것:
//  ① 선수 고르기 ② 한쪽이 다른 앱으로 넘어가면 둘 다 멈췄다가 3·2·1 뒤 이어 하기
//  ③ 방이 차 있으면 세 번째 사람은 못 들어온다 ④ 들어온 쪽 조작 지연을 앞서 계산으로 메우기(predict.js)
import { stepMatch } from '../sim/match.js';
import { snapshotOf, decode, predict } from './predict.js';

export const VERSION = 4;        // 양쪽 코드가 다르면(한쪽이 이전 페이지) 못 들어오게. 경기 규칙이 바뀌어도 올린다
const SEND_EVERY = 4;            // 120Hz 중 4틱마다 = 초당 30번. 들어온 쪽이 그 사이를 계산으로 메운다
const BEAT = 6;                  // 입력이 그대로여도 6틱마다 알린다(초당 20번): 방 만든 쪽이 "어디까지 받았는지"를 계속 새로 알려 줄 수 있게
const MAX_AHEAD = 48;            // 앞서 계산은 0.4초까지만
const HIST = 256;                // 내 입력 기록(틱). MAX_AHEAD 보다 넉넉히
export const SILENT_MS = 2000;   // 이만큼 아무 소식이 없으면 멈추고 기다린다
export const AWAY_LIMIT_MS = 20000;   // 자리를 비울 수 있는 시간. 넘으면 경기를 끝낸다
const SEAT_FREE_MS = 15000;      // 들어와 있던 사람이 이만큼 소식이 없으면 자리가 빈 것으로 본다
const RESUME_S = 2.7;            // 돌아오면 3·2·1 (0.9초씩)
// 들어온 쪽 화면의 상대 선수. 상대가 방향을 바꾸면 그 소식은 늦게 오므로 앞서 계산한 자리가 틀렸다가 한 번에 고쳐진다(순간이동처럼 보인다).
// 가짜 연결로 잰 값(왕복 100ms, 사람처럼 방향을 바꾸는 상대): 누르던 입력을 끝까지 이어 가면 한 틱에 최대 140px, 절반만 이어 가면 80px, 거기에 화면 속 자리가 틱마다 35%씩 따라가게 하면 26px.
const LEAD = 0.5;                // 앞서 계산하는 구간 중 상대가 누르던 입력을 이어 간다고 보는 비율
const EASE = 0.35;               // 화면 속 상대 선수가 계산된 자리를 틱마다 따라가는 비율
const EASE_MAX = 160;            // 이보다 크게 어긋나면(킥오프 재배치 등) 바로 옮긴다

export function createRoom({ host, id = '', now = () => performance.now() }) {
  let link = null, mid = 0, guestId = null;
  const room = {
    host, side: host ? 'L' : 'R',
    state: 'idle', why: null,                       // 연결 상태: opening · waiting(방 만든 쪽: 친구 기다림) · joining · open · lost · failed(why)
    me: { n: null, kit: null, ready: false },       // 이쪽이 고른 선수(등번호)·유니폼·준비
    peer: null,                                     // 상대가 고른 것. 아직 없으면 null
    match: null,                                    // 경기 중이면 그 경기의 net (beginMatch 가 준다)
    onChange: null, onStart: null, onAbort: null,   // 화면이 건다: 로비 다시 그리기 / 경기 시작({ L, R }) / 경기가 중간에 끝남(까닭)

    attach(l) { link = l; },
    get link() { return link; },
    peerQuiet: () => !!(room.peer && link && now() - link.lastHeard > 3000),   // 로비에서 상대가 다른 앱에 가 있는 듯할 때
    setMine(n, kit) { if (room.me.n === n && room.me.kit === kit) return; Object.assign(room.me, { n, kit, ready: false }); sendLobby(); },   // 고른 걸 바꾸면 준비가 풀린다
    setReady(v) { if (room.me.ready === !!v) return; room.me.ready = !!v; sendLobby(); tryStart(); },
    close() { if (room.match) room.match.end(); if (link) link.close(); link = null; room.state = 'idle'; room.peer = null; },

    // ---- link 가 부르는 것 ----
    linkState(state, why = null) {
      room.state = state; room.why = why;
      if (state === 'open') { room.peer = null; if (room.match) room.match.abort('lost', false); sendLobby(); }   // 새로 들어왔다(같은 사람이 새로 고침했을 수도): 하던 경기는 접고 로비부터
      else if (state === 'lost' || state === 'failed') { room.peer = null; guestId = null; if (room.match) room.match.abort('lost', false); }
      room.onChange?.();
    },
    // 방 만든 쪽: 새로 들어오려는 사람을 받을지. 자리는 하나뿐이고, 같은 사람(id)이 다시 오는 건 받는다
    join(m) {
      if (m.v !== VERSION) return 'old';
      const free = !link.open || now() - link.lastHeard > SEAT_FREE_MS;
      if (!free && m.id !== guestId) return 'full';
      guestId = m.id;
      return 'ok';
    },
    message(m, raw) {
      if (m.t === 'lobby') { room.peer = { n: m.n, kit: m.kit, ready: !!m.ready }; room.onChange?.(); tryStart(); }
      else if (m.t === 'start' && !host) { mid = m.mid; room.me.ready = false; if (room.peer) room.peer.ready = false; room.onStart?.({ L: m.L, R: m.R }); }
      else if (room.match && m.mid === mid) room.match.message(m, raw);
    },

    // 경기를 시작할 때(VS 화면 뒤) 화면이 부른다. 돌려주는 net 을 경기 루프가 틱마다 쓴다
    beginMatch({ predict: predictOn = true, lead = LEAD } = {}) { room.match = host ? hostMatch() : guestMatch(predictOn, lead); return room.match; },
  };

  const send = m => { if (link && link.open) link.send(m); };
  const sendLobby = () => send({ t: 'lobby', n: room.me.n, kit: room.me.kit, ready: room.me.ready });
  // 둘 다 준비됐으면 방 만든 쪽이 시작을 알린다. 같은 선수끼리는 시작하지 않는다(들어온 쪽 화면이 곧 다른 선수로 넘긴다)
  function tryStart() {
    const { me, peer } = room;
    if (!host || room.match || !peer || !me.ready || !peer.ready || me.n === peer.n || !link.open) return;
    const info = { L: { n: me.n, kit: me.kit }, R: { n: peer.n, kit: peer.kit } };
    send({ t: 'start', mid: ++mid, ...info });
    me.ready = false; peer.ready = false;
    room.onStart?.(info);
  }

  // 양쪽 경기에 공통인 부분: 자리 비움 알리기, 그만두기, 중간에 끝내기
  function common(net) {
    Object.assign(net, {
      host, side: room.side, ended: false,
      end() { net.ended = true; if (room.match === net) room.match = null; },
      quit() { if (net.ended) return; send({ t: 'quit', mid, why: 'left' }); net.end(); },                 // 이쪽이 메뉴에서 그만둠
      // 경기가 중간에 끝난다. tell: 상대에게도 알릴지. 까닭: peer-quit · timeout-peer · timeout-me · lost
      abort(reason, tell = true) {
        if (net.ended) return;
        if (tell) send({ t: 'quit', mid, why: reason === 'timeout-me' ? 'away-me' : 'away-you' });
        net.end(); room.onAbort?.(reason);
      },
      quitMessage(m) { net.end(); room.onAbort?.(m.why === 'left' ? 'peer-quit' : m.why === 'away-you' ? 'timeout-me' : 'timeout-peer'); },
    });
    return net;
  }

  // ---- 방 만든 쪽: 경기를 계산한다 ----
  function hostMatch() {
    const remote = { g: 0, usedG: -1, age: 0, left: false, right: false, jump: false, kickN: 0, jumpN: 0, kickSeen: 0, jumpSeen: 0 };   // 받은 상대 입력
    const hold = { on: false, since: 0, count: 0, awayL: false, awayR: false, silent: false };
    let tick = 0, seq = 0, outEvents = [];
    const startHold = () => { if (!hold.on) { hold.on = true; hold.since = now(); } hold.count = 0; };
    const net = common({
      // 자리 비움(다른 앱으로 넘어감·메뉴를 엶)과 돌아옴. 돌아오면 step 이 3·2·1 을 센다
      setAway(on) { hold.awayL = !!on; if (on) startHold(); send({ t: 'away', mid, on: !!on }); },
      message(m) {
        if (m.t === 'i') {
          remote.kickN = Math.max(remote.kickN, m.k); remote.jumpN = Math.max(remote.jumpN, m.jc);   // 슛·점프는 횟수로: 순서가 바뀌거나 짧게 눌러도 놓치지 않는다
          if (m.g > remote.g) { remote.g = m.g; remote.left = !!m.l; remote.right = !!m.r; remote.jump = !!m.j; }
        } else if (m.t === 'away') { hold.awayR = !!m.on; if (m.on) startHold(); }
        else if (m.t === 'quit') net.quitMessage(m);
      },
      // 지금 멈춰 있으면 화면에 띄울 것: { me, peer, silent, left(남은 초), count(3·2·1, 세는 중이 아니면 0) }
      hold() {
        if (!hold.on) return null;
        return { me: hold.awayL, peer: hold.awayR || hold.silent, silent: hold.silent && !hold.awayR, left: Math.max(0, Math.ceil((AWAY_LIMIT_MS - (now() - hold.since)) / 1000)), count: Math.ceil(hold.count / 0.9) };
      },
      step(match, inp, dt) {
        if (net.ended) return [];
        if (match.phase === 'over') hold.on = false;
        else {
          hold.silent = now() - link.lastHeard > SILENT_MS;
          if (hold.awayL || hold.awayR || hold.silent) {
            startHold();
            if (now() - hold.since > AWAY_LIMIT_MS) { net.abort(hold.awayL ? 'timeout-me' : 'timeout-peer'); return []; }
          } else if (hold.on) {
            hold.count = hold.count > 0 ? hold.count - dt : RESUME_S;
            if (hold.count <= 0) { hold.on = false; hold.count = 0; remote.kickSeen = remote.kickN; remote.jumpSeen = remote.jumpN; }   // 멈춘 동안 누른 슛·점프는 버린다
          }
        }
        let events = [];
        if (!hold.on) {
          if (remote.usedG !== remote.g) { remote.usedG = remote.g; remote.age = 0; }
          const inR = { left: remote.left, right: remote.right, jump: remote.jump || remote.jumpN > remote.jumpSeen, kick: remote.kickN > remote.kickSeen, special: false, sub: false };
          remote.jumpSeen = remote.jumpN; remote.kickSeen = remote.kickN;
          events = stepMatch(match, inp, dt, inR);
          remote.age++;
          outEvents.push(...events);
        }
        if (++tick % SEND_EVERY === 0) {
          // a: 상대 입력을 어디까지 썼는지 [그 입력의 틱, 그 뒤로 계산한 틱 수, 쓴 슛 수, 쓴 점프 수]. hi: 이쪽이 지금 누르고 있는 것. h: 멈춤
          const h = net.hold();
          send({ t: 's', mid, n: seq++, ...snapshotOf(match), e: outEvents, a: [remote.usedG, remote.age, remote.kickSeen, remote.jumpSeen], hi: [+!!inp.left, +!!inp.right, +!!inp.jump],
            ...(h ? { h: [(h.me ? 1 : 0) | (h.peer ? 2 : 0) | (h.silent ? 4 : 0), h.left, h.count] } : null) });
          outEvents = [];
        }
        return events;
      },
    });
    return net;
  }

  // ---- 들어온 쪽: 입력을 보내고, 받은 상태에서 앞서 계산해 그린다 ----
  function guestMatch(predictOn, lead) {
    const hist = new Array(HIST), kicks = [], jumps = [];   // 틱별 내 입력, 슛·점프를 누른 틱들(순번 = 방 만든 쪽이 세는 횟수)
    let g = 0, prevJump = false, lastKey = '', sentG = -BEAT, raw = null, rawN = -1, inEvents = [], holdInfo = null;
    let hostAway = false, goneSince = 0, awayMe = false, shown = null;   // shown: 화면에 그리는 상대 선수 자리
    const NONE = { left: false, right: false, jump: false, kick: false, special: false, sub: false };
    const net = common({
      setAway(on) { awayMe = !!on; send({ t: 'away', mid, on: !!on }); },
      message(m, text) {
        if (m.t === 's') { inEvents.push(...m.e); if (m.n > rawN) { rawN = m.n; raw = text; } }   // 순서가 바뀌어 와도 이벤트는 다 쓰고 상태는 최신 것만
        else if (m.t === 'away') hostAway = !!m.on;
        else if (m.t === 'quit') net.quitMessage(m);
      },
      hold() {
        if (holdInfo) { const [who, left, count] = holdInfo; return { me: !!(who & 2) && !(who & 4), peer: !!(who & 1), silent: !!(who & 4), left, count }; }
        if (goneSince) return { me: false, peer: hostAway, silent: !hostAway, left: Math.max(0, Math.ceil((AWAY_LIMIT_MS - (now() - goneSince)) / 1000)), count: 0 };
        return awayMe ? { me: true, peer: false, silent: false, left: 0, count: 0 } : null;
      },
      step(match, inp) {
        if (net.ended) return [];
        g++;
        if (inp.kick) kicks.push(g);
        if (inp.jump && !prevJump) jumps.push(g);
        prevJump = inp.jump;
        hist[g % HIST] = { g, left: inp.left, right: inp.right, jump: inp.jump };
        const key = `${+inp.left}${+inp.right}${+inp.jump}|${kicks.length}|${jumps.length}`;
        if (key !== lastKey || g - sentG >= BEAT) { lastKey = key; sentG = g; send({ t: 'i', mid, g, l: +inp.left, r: +inp.right, j: +inp.jump, k: kicks.length, jc: jumps.length }); }

        // 방 만든 쪽이 자리를 비웠거나 소식이 끊겼으면(그쪽 화면이 꺼지면 멈췄다는 말도 못 보낸다) 여기서 기다리는 시간을 센다
        const gone = match.phase !== 'over' && (hostAway || now() - link.lastHeard > SILENT_MS);
        if (!gone) goneSince = 0;
        else if (!goneSince) goneSince = now();
        else if (now() - goneSince > AWAY_LIMIT_MS) { net.abort('timeout-peer'); return []; }

        if (raw !== null) {
          const s = decode(raw);
          holdInfo = s.h || null;
          if (predictOn && !s.h && !gone) {
            const c = s.a[0] + s.a[1], from = Math.max(c, g - MAX_AHEAD + 1), kSeen = s.a[2], jSeen = s.a[3];   // c: 방 만든 쪽이 다음에 쓸 내 틱. 거기서 지금까지를 더 계산한다
            const edge = (list, seen, t) => { for (let i = seen; i < list.length; i++) if (list[i] === t || (t === from && list[i] < from)) return true; return false; };   // 아직 안 쓰인 슛·점프(늦게 도착 중인 것은 첫 틱에)
            const held = { ...NONE, left: !!s.hi[0], right: !!s.hi[1], jump: !!s.hi[2] }, until = from + Math.ceil((g - from + 1) * lead);   // 상대는 누르던 걸 앞서 계산하는 구간의 lead 만큼만 더 누른다고 본다
            if (from <= g) predict(s, { from, to: g, inputL: t => (t < until ? held : NONE),
              inputR: t => { const h = hist[t % HIST]; return h && h.g === t ? { left: h.left, right: h.right, jump: h.jump || edge(jumps, jSeen, t), kick: edge(kicks, kSeen, t), special: false, sub: false } : NONE; } });
          }
          const o = s.w.players.L;
          if (shown && predictOn && !s.h && Math.abs(o.x - shown.x) < EASE_MAX && Math.abs(o.y - shown.y) < EASE_MAX) { o.x = shown.x += (o.x - shown.x) * EASE; o.y = shown.y += (o.y - shown.y) * EASE; }
          else shown = { x: o.x, y: o.y };
          match.world = s.w; Object.assign(match, s.m);
        }
        const ev = inEvents; inEvents = [];
        return ev;
      },
    });
    return net;
  }

  return room;
}
