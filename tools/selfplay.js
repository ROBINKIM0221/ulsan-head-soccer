// AI 대 AI 셀프 플레이로 선수별 승률표를 뽑는다. 배포와 무관한 밸런스 도구.
// 사용: node tools/selfplay.js [games=200] [difficulty=first]
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PLAYERS } from '../js/data/players.js';
import { DT, NO_INPUT } from '../js/sim/constants.js';
import { createMatch, stepMatch } from '../js/sim/match.js';
import { createAiState, decide } from '../js/sim/ai.js';
import { mulberry32 } from '../js/sim/rng.js';

const MAX_STEPS = 200 * 120;   // 90초 + 골 멈춤 + 골든골을 넉넉히 덮는 상한

// 양쪽 모두 AI, 교체 없음. 같은 seed 면 같은 결과.
export function simulateMatch(defL, defR, difficulty, seed) {
  const rng = mulberry32(seed);
  const m = createMatch({ home: defL, away: defR, difficulty, rng });
  m.subUsed.L = true; m.subUsed.R = true;
  const aiL = createAiState(difficulty, mulberry32(seed ^ 0x9E3779B9));
  for (let i = 0; i < MAX_STEPS && m.phase !== 'over'; i++) {
    const active = m.phase === 'play' || m.phase === 'golden';
    stepMatch(m, active ? decide(m.world, 'L', aiL, DT) : NO_INPUT, DT);
  }
  return { L: m.scores.L, R: m.scores.R, result: m.result ?? 'draw' };
}

// cells[i][j] = i 가 L, j 가 R 일 때 i 의 승률(무승부 0.5). avg[i] = i 가 양쪽에서 거둔 평균 승률.
export function runTable({ games = 200, difficulty = 'first', seed = 1, players = PLAYERS, onProgress } = {}) {
  const n = players.length;
  const cells = Array.from({ length: n }, () => Array(n).fill(null));
  let done = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    let pts = 0;
    for (let g = 0; g < games; g++) {
      const r = simulateMatch(players[i], players[j], difficulty, seed * 100003 + i * 1009 + j * 101 + g);
      pts += r.result === 'win' ? 1 : r.result === 'draw' ? 0.5 : 0;
    }
    cells[i][j] = pts / games;
    if (onProgress) onProgress(++done, n * (n - 1));
  }
  const avg = players.map((_, i) => {
    let sum = 0, cnt = 0;
    for (let j = 0; j < n; j++) if (j !== i) { sum += cells[i][j] + (1 - cells[j][i]); cnt += 2; }
    return sum / cnt;
  });
  return { cells, avg, names: players.map(p => p.name) };
}

export function toMarkdown(t, { games, difficulty }) {
  const pct = v => (v === null ? '—' : Math.round(v * 100) + '%');
  const lines = [
    `# 셀프 플레이 승률표 (${difficulty} AI 끼리, 셀당 ${games}판, 무승부 0.5)`, '',
    '행 = 왼쪽(L) 선수, 열 = 오른쪽(R) 선수, 값 = 행 선수의 승률.', '',
    `| L \\ R | ${t.names.join(' | ')} | 평균 |`,
    `|---|${t.names.map(() => '---').join('|')}|---|`,
  ];
  t.names.forEach((name, i) => lines.push(`| ${name} | ${t.cells[i].map(pct).join(' | ')} | **${pct(t.avg[i])}** |`));
  const out = t.names.map((name, i) => ({ name, avg: t.avg[i] })).filter(x => x.avg < 0.35 || x.avg > 0.65);
  lines.push('', out.length ? `35–65% 밖: ${out.map(x => `${x.name} ${pct(x.avg)}`).join(', ')}` : '모든 선수가 35–65% 안.');
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const games = Number(process.argv[2] || 200), difficulty = process.argv[3] || 'first';
  const t0 = Date.now();
  const t = runTable({ games, difficulty, onProgress: (d, n) => { if (d % 12 === 0) process.stderr.write(`${d}/${n}\r`); } });
  const md = toMarkdown(t, { games, difficulty });
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  const file = `docs/balance-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.md`;
  writeFileSync(file, md);
  process.stdout.write(md + `\n(${((Date.now() - t0) / 1000).toFixed(0)}s, saved ${file})\n`);
}
