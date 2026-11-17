// 슛 필살기(레이저·감아차기)가 골이 되는 비율. AI 끼리 경기에서 그 선수가 쏜 필살기 슛마다, 상대가 공을 건드리기 전 3초 안에 골이 났는지 센다.
// 사용: node tools/shotrate.mjs [선수 번호=10] [상대마다 경기 수=20]
import { PLAYERS, byNumber } from '../js/data/players.js';
import { DT, NO_INPUT } from '../js/sim/constants.js';
import { createMatch, stepMatch } from '../js/sim/match.js';
import { createAiState, decide } from '../js/sim/ai.js';
import { mulberry32 } from '../js/sim/rng.js';

export function shotRate(no, games = 20, difficulty = 'first') {
  const me = byNumber(no), out = { shots: 0, goals: 0, misses: {} };
  let seed = 1;
  for (const opp of PLAYERS) {
    if (opp.number === no) continue;
    for (let g = 0; g < games; g++, seed++) {
      const m = createMatch({ home: me, away: opp, difficulty, rng: mulberry32(seed) });
      m.subUsed.L = true; m.subUsed.R = true;
      const ai = createAiState(difficulty, mulberry32(seed ^ 0x9E3779B9));
      let open = null;   // 지금 날아가는 필살기 슛 { t, x }
      for (let i = 0; i < 200 * 120 && m.phase !== 'over'; i++) {
        const active = m.phase === 'play' || m.phase === 'golden';
        const ev = stepMatch(m, active ? decide(m.world, 'L', ai, DT) : NO_INPUT, DT);
        for (const e of ev) {
          if (e.type === 'shot' && e.side === 'L' && (e.flight === 'laser' || e.flight === 'curve')) { out.shots++; open = { t: m.world.t, x: Math.round(m.world.ball.x / 160) * 160 }; }
          else if (open && e.type === 'goal') { if (e.scorer === 'L') out.goals++; else miss(out, 'conceded', open); open = null; }
          else if (open && e.type === 'touch' && e.side === 'R') { miss(out, 'touched', open); open = null; }
        }
        if (open && m.world.t - open.t > 3) { miss(out, 'timeout', open); open = null; }
      }
    }
  }
  out.rate = out.shots ? out.goals / out.shots : 0;
  return out;
}
const miss = (out, why, o) => { const k = `${why}@x${o.x}`; out.misses[k] = (out.misses[k] || 0) + 1; };

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('shotrate.mjs')) {
  const no = Number(process.argv[2] || 10), games = Number(process.argv[3] || 20);
  const r = shotRate(no, games);
  console.log(`${byNumber(no).name} ${r.goals}/${r.shots} = ${(r.rate * 100).toFixed(1)}%`);
  console.log('misses', JSON.stringify(Object.fromEntries(Object.entries(r.misses).sort((a, b) => b[1] - a[1]))));
}
