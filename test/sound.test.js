import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, eventSound, sfx, soundEnabled, setSoundEnabled, soundLog } from '../js/sound.js';

test('every recipe is a short list of sane steps', () => {
  for (const [name, steps] of Object.entries(RECIPES)) {
    assert.ok(steps.length >= 1 && steps.length <= 12, name);
    for (const s of steps) {
      assert.ok(['tone', 'noise', 'whistle'].includes(s.k), `${name} ${s.k}`);
      assert.ok(s.t > 0 && s.t <= 4.5 && s.at >= 0 && s.at + s.t <= 5, `${name} timing`);
      if (s.k !== 'whistle') assert.ok(s.g > 0 && s.g <= 0.6, `${name} gain ${s.g}`);
      if (s.k === 'tone') assert.ok(s.f0 >= 40 && s.f0 <= 6000 && s.f1 >= 40 && s.f1 <= 6000, `${name} freq`);
    }
  }
});

test('match events map to recipes that exist', () => {
  const m = r => ({ result: r });
  const cases = [
    [{ type: 'kick' }, 'swing'], [{ type: 'touch', part: 'foot' }, 'kick'], [{ type: 'touch', part: 'head' }, 'head'],
    [{ type: 'touch', part: 'head', perfect: true }, 'perfect'], [{ type: 'touch', part: 'body' }, 'bounce'],
    [{ type: 'goal', scorer: 'L' }, 'goal'], [{ type: 'special', id: 'laser' }, 'special'], [{ type: 'catch' }, 'catch'],
    [{ type: 'knockdown' }, 'knock'], [{ type: 'knockback' }, 'knock'], [{ type: 'sub' }, 'sub'],
    [{ type: 'phase', phase: 'play' }, 'whistle'], [{ type: 'phase', phase: 'golden' }, 'golden'],
    [{ type: 'phase', phase: 'over' }, 'win', 'win'], [{ type: 'phase', phase: 'over' }, 'lose', 'lose'], [{ type: 'phase', phase: 'over' }, 'over', 'draw'],
  ];
  for (const [e, want, result] of cases) {
    const got = eventSound(e, m(result || null));
    assert.equal(got, want, JSON.stringify(e));
    assert.ok(RECIPES[got], `recipe ${got}`);
  }
  for (const e of [{ type: 'phase', phase: 'kickoff' }, { type: 'phase', phase: 'goal' }, { type: 'phase', phase: 'sub' }, { type: 'specialEnd' }, { type: 'throw' }]) {
    assert.equal(eventSound(e, m(null)), null, e.type + ' ' + (e.phase || ''));
  }
});

test('without an AudioContext (node) sfx is a safe no-op, and the switch persists in memory', () => {
  assert.equal(soundEnabled(), true);
  assert.equal(sfx('kick'), false);
  assert.equal(soundLog.length, 0);
  setSoundEnabled(false);
  assert.equal(soundEnabled(), false);
  assert.equal(sfx('goal'), false);
  setSoundEnabled(true);
  assert.equal(sfx('nope'), false);
});

// 2026-11-08 형준 "킥오프 소리랑 경기 끝났을때 소리랑 좀 바꿔줘"(좀 가짜 같아서) → 후보 넷을 들려주고 C(콩알 호루라기 + 경기장 울림)를 골랐다.
// 킥오프 "삑" 0.45초, 종료 "삑·삑·삐이"(짧게 둘, 길게 하나). 팡파르·트롬본은 긴 휘슬이 끝나기 0.1초 전에 시작, 함성은 휘슬 도중에 부풀어 오른다
test('whistles: kickoff is one 0.45s blast; full time is short-short-long, and the win/lose tunes start as the long blast ends', () => {
  const kick = RECIPES.whistle;
  assert.equal(kick.length, 1); assert.equal(kick[0].k, 'whistle'); assert.ok(Math.abs(kick[0].t - 0.45) < 1e-9, 'kickoff ' + kick[0].t);
  const w = RECIPES.over.filter(s => s.k === 'whistle');
  assert.equal(w.length, 3);
  assert.ok(w[0].t < 0.25 && w[1].t < 0.25 && w[2].t >= 0.9, 'short, short, long: ' + w.map(s => s.t));
  assert.ok(w[0].at + w[0].t < w[1].at && w[1].at + w[1].t < w[2].at, 'blasts do not overlap');
  const end = w[2].at + w[2].t;
  for (const name of ['win', 'lose']) {
    assert.deepEqual(RECIPES[name].slice(0, 3), RECIPES.over, name + ' starts with the final whistle');
    const first = RECIPES[name].filter(s => s.k === 'tone')[0];
    assert.ok(Math.abs(first.at - (end - 0.1)) < 1e-9, name + ' tune at ' + first.at + ', whistle ends ' + end);
  }
  const crowd = RECIPES.win.find(s => s.k === 'noise');
  assert.ok(crowd.at > w[0].at && crowd.at < end, 'crowd swells during the whistles');
});

// 2026-11-01 형준 "아쉬운 노래 나오면서 LOSE": 패배는 휘슬 뒤 반음씩 내려가는 트롬본 네 음, 마지막은 축 처진다 (전엔 풀 죽은 두 음)
test('lose: after the whistle a sad tune of at least 4 descending notes, the last one drooping', () => {
  const notes = RECIPES.lose.filter(s => s.k === 'tone');
  assert.ok(notes.length >= 4, 'notes: ' + notes.length);
  for (let i = 1; i < notes.length; i++) assert.ok(notes[i].f0 < notes[i - 1].f0, 'descending at ' + i);
  assert.ok(notes.at(-1).f1 < notes.at(-1).f0, 'last note droops');
  assert.ok(notes.every(n => n.at >= 0.9) && notes.at(-1).at + notes.at(-1).t <= 4, 'after the whistle, within the ceremony');
});
