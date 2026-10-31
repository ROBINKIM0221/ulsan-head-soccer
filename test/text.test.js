import { test } from 'node:test';
import assert from 'node:assert/strict';
import { josa, shareText } from '../js/ui/text.js';

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
