import { test } from 'node:test';
import assert from 'node:assert/strict';
import { josa, shareText, specialLine } from '../js/ui/text.js';
import { byNumber } from '../js/data/players.js';

test('josa picks 으로/로 and 을/를 by the final consonant', () => {
  assert.equal(josa('정승현', ['으로', '로']), '정승현으로');
  assert.equal(josa('에릭', ['으로', '로']), '에릭으로');
  assert.equal(josa('야고', ['으로', '로']), '야고로');
  assert.equal(josa('토마스', ['으로', '로']), '토마스로');
  assert.equal(josa('김영권', ['을', '를']), '김영권을');
  assert.equal(josa('이규성', ['을', '를']), '이규성을');
  assert.equal(josa('조현우', ['을', '를']), '조현우를');
});

test('shareText reads naturally for win, lose and draw', () => {
  assert.equal(shareText({ me: '이동경', them: '야고', L: 3, R: 1, result: 'win' }), 'ULSAN HD FC 1 VS 1 축구에서 이동경으로 야고를 3:1로 이겼다!');
  assert.equal(shareText({ me: '에릭', them: '김영권', L: 0, R: 2, result: 'lose' }), 'ULSAN HD FC 1 VS 1 축구에서 에릭으로 김영권을 0:2로 졌다…');
  assert.equal(shareText({ me: '토마스', them: '정승현', L: 1, R: 1, result: 'draw' }), 'ULSAN HD FC 1 VS 1 축구에서 토마스로 정승현을 1:1로 비겼다!');
});

// 2026-11-12 형준 "(5초) 이런식으로 지속시간 써줘": 지속형 필살기는 설명 끝에 지속시간을 붙인다. 한 방형(다음 슛 한 번)·즉발은 붙이지 않는다
test('specialLine: a timed special ends with its duration in seconds; one-shots and instants have none', () => {
  assert.equal(specialLine(byNumber(38).special), '상대의 속도와 점프 60%로 감소 (5초)');
  assert.ok(specialLine(byNumber(19).special).endsWith(' (3.5초)'));   // 소수는 그대로
  assert.ok(specialLine(byNumber(55).special).endsWith(' (3초)'));     // 3.0 은 3 으로
  assert.ok(specialLine(byNumber(24).special).endsWith(' (6초)'));
  assert.equal(specialLine(byNumber(10).special), byNumber(10).special.desc);
  assert.equal(specialLine(byNumber(96).special), byNumber(96).special.desc);
});
