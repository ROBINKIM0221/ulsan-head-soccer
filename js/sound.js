// 효과음. 파일 없이 Web Audio 로 그 자리에서 합성한다. 첫 사용자 입력(포인터·키) 뒤에만 소리가 난다(모바일 자동재생 정책).
// 2026-10-31 형준: "이제 효과음도 넣어줘". 켜기/끄기는 저장된다. DOM 은 모르고, 이 파일만 AudioContext 를 안다.
const STORE = 'uhd11.sound';
const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
let ctx = null, master = null;
let enabled = (() => { try { return localStorage.getItem(STORE) !== '0'; } catch { return true; } })();
export const soundLog = [];   // 최근 재생한 이름 (검사용, 최대 50)

// 레시피 재료. T: 음(f0→f1 Hz, 길이 t초, 세기 g, 시작 at초, 파형). N: 잡음(길이, 세기, 시작, 저역 lp, 고역 hp, 부풀어 오르는 시간 swell). W: 호루라기(길이, 시작)
const T = (f0, f1, t, g, at = 0, type = 'sine') => ({ k: 'tone', f0, f1, t, g, at, type });
const N = (t, g, at = 0, lp = 8000, hp = 0, swell = 0) => ({ k: 'noise', t, g, at, lp, hp, swell });
const W = (t, at = 0) => ({ k: 'whistle', t, at });
const FINAL = [W(0.17), W(0.17, 0.3), W(0.95, 0.62)];   // 종료 휘슬 삑·삑·삐이 (긴 것이 1.57초에 끝난다; 승리·패배 음악은 그 0.1초 전부터)

export const RECIPES = {
  swing:   [N(0.07, 0.12, 0, 3000, 400)],                                   // 헛스윙 휙
  kick:    [N(0.06, 0.25, 0, 6000, 600), T(130, 55, 0.14, 0.4)],            // 발에 맞는 퍽
  head:    [T(260, 150, 0.1, 0.3)],                                          // 헤딩 퐁
  perfect: [T(260, 150, 0.1, 0.3), T(1568, 1568, 0.25, 0.12, 0.02, 'triangle')],   // 완벽 헤딩: 퐁 + 띵
  bounce:  [T(170, 100, 0.08, 0.15)],                                        // 몸에 맞는 툭
  goal:    [N(1.6, 0.5, 0, 1500, 200, 0.25), T(440, 440, 0.2, 0.12, 0, 'square'), T(554, 554, 0.45, 0.12, 0.2, 'square')],   // 함성 + 나팔 두 음
  curve:   [N(0.42, 0.22, 0, 3200, 500, 0.14), T(380, 1150, 0.34, 0.09, 0, 'triangle')],   // 커브 슛이 나가는 휘익: 부풀어 오르는 바람 + 올라가는 음 (2026-11-14 형준 "이팩트도 좀 필요할듯")
  special: [T(523, 523, 0.09, 0.2, 0, 'triangle'), T(659, 659, 0.09, 0.2, 0.08, 'triangle'), T(784, 784, 0.09, 0.2, 0.16, 'triangle'), T(1046, 1046, 0.3, 0.22, 0.24, 'triangle')],
  catch:   [N(0.08, 0.2, 0, 8000, 2000), T(600, 300, 0.12, 0.15)],
  knock:   [T(320, 70, 0.3, 0.35), N(0.05, 0.2)],
  sub:     [W(0.12), W(0.12, 0.17)],
  whistle: [W(0.45)],
  golden:  [T(880, 880, 0.12, 0.18, 0, 'triangle'), T(1108, 1108, 0.35, 0.18, 0.12, 'triangle')],
  over:    FINAL,
  win:     [...FINAL, N(4.0, 0.45, 0.3, 1800, 150, 0.6), T(523, 523, 0.12, 0.12, 1.47, 'square'), T(659, 659, 0.12, 0.12, 1.59, 'square'), T(784, 784, 0.12, 0.12, 1.71, 'square'), T(1046, 1046, 0.6, 0.14, 1.83, 'square')],   // 휘슬 + 관중 함성 + 팡파르
  lose:    [...FINAL, T(466, 466, 0.4, 0.14, 1.47, 'sawtooth'), T(440, 440, 0.4, 0.14, 1.87, 'sawtooth'), T(415, 415, 0.4, 0.14, 2.27, 'sawtooth'), T(392, 330, 1.1, 0.14, 2.67, 'sawtooth')],   // 휘슬 + 아쉬운 트롬본 네 음(반음씩 내려가다 마지막은 축 처짐; 2026-11-01 형준 "아쉬운 노래")
  tick:    [T(1300, 1300, 0.04, 0.1)],                                       // 버튼
};

// 경기 이벤트 → 효과음 이름 (없으면 null)
export function eventSound(e, match) {
  switch (e.type) {
    case 'kick': return 'swing';
    case 'touch': return e.part === 'head' ? (e.perfect ? 'perfect' : 'head') : e.part === 'foot' ? 'kick' : 'bounce';
    case 'goal': return 'goal';
    case 'shot': return e.flight === 'curve' ? 'curve' : null;   // 레이저는 빛줄기뿐, 소리는 킥 소리 그대로
    case 'special': return 'special';
    case 'catch': return 'catch';
    case 'knockdown': case 'knockback': return 'knock';
    case 'sub': return 'sub';
    case 'phase':
      if (e.phase === 'play') return 'whistle';
      if (e.phase === 'golden') return 'golden';
      if (e.phase === 'over') return match.result === 'win' || (match.twoPlayer && match.result === 'lose') ? 'win' : match.result === 'lose' ? 'lose' : 'over';   // 2인: 오른쪽이 이겨도 승리 노래
      return null;
    default: return null;
  }
}

export const soundEnabled = () => enabled;
export function setSoundEnabled(v) {
  enabled = !!v;
  try { localStorage.setItem(STORE, enabled ? '1' : '0'); } catch { /* 사생활 모드 등 */ }
  if (enabled) ensure();
}
export const audioState = () => (ctx ? ctx.state : 'none');

// 사용자 입력 안에서 한 번 불러 두면 이후 루프 안에서도 소리가 난다
export function unlockSound() { if (enabled) ensure(); }

function ensure() {
  if (!AC) return null;
  if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

let noiseBuf = null;
function noiseBuffer() {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
const env = (g, at, peak, t, attack = 0.005) => {   // 빠르게 올랐다가 t 동안 사그라드는 세기 곡선
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + t);
};
function playTone(s, at) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = s.type; o.frequency.setValueAtTime(s.f0, at); if (s.f1 !== s.f0) o.frequency.exponentialRampToValueAtTime(s.f1, at + s.t);
  env(g, at, s.g, s.t);
  o.connect(g).connect(master); o.start(at); o.stop(at + s.t + 0.02);
}
function playNoise(s, at) {
  const src = ctx.createBufferSource(), g = ctx.createGain(), lp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter();
  src.buffer = noiseBuffer(); src.loop = true;
  lp.type = 'lowpass'; lp.frequency.value = s.lp; hp.type = 'highpass'; hp.frequency.value = s.hp;
  env(g, at, s.g, s.t, s.swell || 0.005);
  src.connect(hp).connect(lp).connect(g).connect(master); src.start(at); src.stop(at + s.t + 0.02);
}
// 심판 호루라기. 2026-11-08 형준 "킥오프 소리랑 경기 끝났을때 소리랑 좀 바꿔줘"(사인파 둘이 "좀 가짜 같아서") → 후보 넷을 들려주고 고른 C: 콩알 호루라기 + 경기장 울림.
// 콩알이 굴러 바람을 끊는 떨림(세기 LFO, 불 때마다 속도가 조금 다름) + 기본음 근처 바람 잡음과 높은 쉭, 불기 시작할 때 음이 올라오고 숨이 빠지며 처진다. 울림은 reverbBus.
const PEA = { f: 2550, partials: [[1, 1], [2, 0.08], [3, 0.03]], trill: 30, depth: 0.6, breath: 0.35, chiff: 0.05, drop: 0.04, vol: 0.28 };
function playWhistle(s, at) {
  const dur = s.t, stop = at + dur + 0.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(PEA.vol, at + 0.012);
  g.gain.linearRampToValueAtTime(PEA.vol * 0.8, at + dur); g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.09);
  const trem = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  trem.gain.value = 1 - PEA.depth / 2; lfo.frequency.value = PEA.trill * (0.94 + Math.random() * 0.12); lg.gain.value = PEA.depth / 2;
  lfo.connect(lg).connect(trem.gain); lfo.start(at); lfo.stop(stop);
  g.connect(trem).connect(reverbBus());
  for (const [ratio, amp] of PEA.partials) {
    const o = ctx.createOscillator(), f = PEA.f * ratio, og = ctx.createGain(); og.gain.value = amp;
    o.frequency.setValueAtTime(f * (1 - PEA.chiff), at); o.frequency.exponentialRampToValueAtTime(f, at + 0.05);
    o.frequency.setValueAtTime(f, at + dur - 0.02); o.frequency.exponentialRampToValueAtTime(f * (1 - PEA.drop), at + dur + 0.09);
    o.connect(og).connect(g); o.start(at); o.stop(stop);
  }
  for (const [type, freq, q, amp] of [['bandpass', PEA.f, 4, PEA.breath], ['highpass', 3500, 1, PEA.breath * 0.25]]) {
    const n = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = noiseBuffer(); n.loop = true; fl.type = type; fl.frequency.value = freq; fl.Q.value = q; ng.gain.value = amp;
    n.connect(fl).connect(ng).connect(g); n.start(at); n.stop(stop);
  }
}
let verb = null;
function reverbBus() {   // 경기장 울림: 1.6초 동안 사그라드는 잡음을 임펄스로 쓰는 값싼 리버브. 호루라기만 거친다 (건조한 소리 + 울림 0.6)
  if (verb) return verb;
  const len = Math.floor(ctx.sampleRate * 1.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c); let y = 0;
    for (let i = 0; i < len; i++) { const x = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.4)); y += 0.4 * (x - y); d[i] = y; }   // 한 극 저역 통과로 높은 울림을 깎는다
  }
  const conv = ctx.createConvolver(); conv.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.6;
  verb = ctx.createGain(); verb.connect(master); verb.connect(conv); conv.connect(wet).connect(master);
  return verb;
}

// 이름으로 재생. 꺼져 있거나 아직 소리를 낼 수 없으면 false
export function sfx(name) {
  const r = RECIPES[name];
  if (!r || !enabled || !ensure()) return false;
  soundLog.push(name); if (soundLog.length > 50) soundLog.shift();
  if (ctx.state !== 'running') return false;
  const now = ctx.currentTime + 0.01;
  for (const s of r) (s.k === 'tone' ? playTone : s.k === 'noise' ? playNoise : playWhistle)(s, now + s.at);
  return true;
}
