import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYERS, byNumber } from '../js/data/players.js';

test('12 players, unique numbers, ascending', () => {
  assert.equal(PLAYERS.length, 12);
  const nums = PLAYERS.map(p => p.number);
  assert.deepEqual(nums, [...new Set(nums)].sort((a, b) => a - b));
  assert.deepEqual(nums, [10, 11, 14, 15, 19, 21, 24, 26, 38, 55, 96, 99]);
});

test('every player has a special with kind and desc', () => {
  for (const p of PLAYERS) {
    assert.ok(['oneshot', 'buff'].includes(p.special.kind), p.name);
    assert.ok(p.special.desc.length > 8, p.name);
    // 2026-11-12 형준 "60%로 감소 뭐 이런식으로 말투 고치고": 설명은 "~다"로 끝나는 문장이 아니라 짧게 끊는 말투(감소·상승·미끄러짐)
    assert.ok(!/다\.|다$/.test(p.special.desc), `${p.name}: ${p.special.desc}`);
    assert.ok(p.special.name.length >= 2, p.name);
    assert.ok(p.special.duration > 0, p.name);
    assert.ok(['attack', 'defend'].includes(p.role), p.name);
    assert.equal(p.img, `img/${p.number}.jpg`);
    const rate = p.special.gaugeRate ?? 1;
    assert.ok(rate >= 0.4 && rate <= 3, `${p.name} gaugeRate ${rate}`);
  }
});

test('roles and special ids match spec', () => {
  const attack = PLAYERS.filter(p => p.role === 'attack').map(p => p.number);
  assert.deepEqual(attack, [10, 11, 14, 26, 99]);
  assert.equal(byNumber(55).special.id, 'train');
  assert.equal(byNumber(55).special.duration, 3.0);   // 2026-11-01 형준: 1초 늘림
  assert.equal(byNumber(24).special.duration, 6);     // 2026-11-01 형준: "이규성 자석 1초 줄여줘" 8→7, 2026-11-12 "이규성 6초로 바꿔줘" 7→6
  assert.equal(byNumber(15).special.gaugeRate, 2.0);  // 2026-11-02 형준: "정승현 게이지 속도 좀만 줄여줘" 2.6→2.0 (경기의 91% 발동 중이던 것)
  assert.equal(byNumber(10).special.gaugeRate, 0.45);   // 2026-11-13: 레이저가 AI 끼리 슛의 98% 골·승률 82% 라 알리고 추천, 형준 "ㄱㄱ" → 게이지 0.45배 (0.5배는 승률표 66%)
  assert.equal(byNumber(14).special.gaugeRate, undefined);   // 2026-11-13 형준 "커브슛도 너무 발동이 잘 안되는것 같아": 0.45배 → 기본 속도
  assert.equal(byNumber(38).special.id, 'press');
  assert.equal(byNumber(26).special.id, 'spirit');
  assert.equal(byNumber(96).special.id, 'offside');   // 2026-11-13 형준 "슬라이딩이 잘 안나오는데, 그냥 필살기를 바꾸면 좋겠다" → 오프사이드 트랩
  assert.equal(byNumber(96).special.duration, 1.5);
  assert.equal(byNumber(10).special.kind, 'oneshot');
  assert.equal(byNumber(10).special.duration, 6);
  assert.equal(byNumber(7), undefined);
  assert.equal(byNumber(38).special.desc, '상대의 속도와 점프 60%로 감소');   // 형준이 든 예 그대로
});
