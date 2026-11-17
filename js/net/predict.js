// 온라인 대전: 상태를 글자로 싸고 푸는 일과 "앞서 계산하기". DOM 을 모른다.
// 방 만든 쪽(L)이 경기를 계산해 상태를 보낸다. 들어온 쪽(R)은 받은 상태에서 "방 만든 쪽이 아직 받지 못한 내 입력"만큼 같은 계산을 더 돌려서 그린다.
// 그래서 들어온 쪽도 버튼을 누르는 즉시 자기 선수가 움직인다 (받은 상태를 그대로 그리면 조작이 핑 + 35~50ms 늦다).
import { DT } from '../sim/constants.js';
import { stepMatch } from '../sim/match.js';
import { byNumber } from '../data/players.js';

// 보낼 글자 수를 줄인다: 선수 정의는 등번호로, 소수는 둘째 자리까지(앞서 계산하는 출발점으로는 충분하다)
export const encode = msg => JSON.stringify(msg, (k, v) => (k === 'def' && v && v.number ? v.number : typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v));

// 경기에서 보낼 부분: 세계 전체와 점수판에 쓰는 값들
export const snapshotOf = match => ({ w: match.world, m: { clock: match.clock, phase: match.phase, phaseT: match.phaseT, scores: match.scores, result: match.result, goals: match.goals } });

// 받은 글자를 다시 상태로. 부를 때마다 새 객체라 마음대로 바꿔도 된다
export function decode(raw) {
  const s = JSON.parse(raw);
  for (const side of ['L', 'R']) s.w.players[side].def = byNumber(s.w.players[side].def);
  return s;
}

// snap(decode 로 막 푼 것)을 from..to 틱(양 끝 포함)만큼 앞서 계산해 snap.w 를 그 결과로 바꾼다.
// inputL(t): 그 틱에 상대가 누르고 있을 것으로 보는 입력, inputR(t): 그 틱의 내 입력.
// 점수·시계 같은 경기 값은 건드리지 않는다: 화면의 점수판은 늘 방 만든 쪽이 알려 준 값만 쓴다(골을 미리 넣었다가 취소하는 일이 없게).
export function predict(snap, { from, to, inputL, inputR }) {
  const { w, m } = snap;
  let t = from, calls = 0;
  // 같은 틱이면 같은 난수: 프레임마다 다시 계산해도 레이저 슛 같은 무작위 값이 흔들리지 않는다
  const rng = () => { let x = (Math.imul(t, 0x9E3779B1) + Math.imul(++calls, 0x85EBCA6B)) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x2C1B3C6D); x ^= x >>> 13; return (x >>> 0) / 4294967296; };
  const tmp = { world: w, twoPlayer: true, clock: m.clock, phase: m.phase, phaseT: m.phaseT, scores: { ...m.scores }, result: m.result, goals: [],
    subUsed: { L: true, R: true }, used: { L: [w.players.L.def], R: [w.players.R.def] }, difficulty: 'first', rng, ai: null, pendingSub: null, kits: null };
  for (; t <= to; t++) { calls = 0; stepMatch(tmp, inputL(t), DT, inputR(t)); }
  return tmp.world;
}
