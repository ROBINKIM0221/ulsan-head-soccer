import { test } from 'node:test';
import assert from 'node:assert/strict';

// 아이폰·아이패드는 Web Audio 를 기본으로 ambient(무음 모드면 조용)로 다룬다. AudioContext 를 만들기 전에 audioSession 종류를 playback 으로 알려야 한다.
// 소리를 꺼 둔 사람은 AudioContext 도 만들지 않으니 종류도 건드리지 않는다(다른 앱에서 듣던 음악이 멈추지 않게).
test('iOS silent mode: audioSession type becomes "playback" right before the AudioContext is created, and not at all while sound is off', async () => {
  const order = [];
  class FakeAC {
    constructor() { order.push('ctx'); this.state = 'running'; this.destination = {}; }
    createGain() { return { gain: {}, connect() {} }; }
    resume() {}
  }
  globalThis.window = { AudioContext: FakeAC };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { audioSession: { set type(v) { order.push('type:' + v); } } } });
  const { unlockSound, setSoundEnabled } = await import('../js/sound.js');

  setSoundEnabled(false); unlockSound();
  assert.deepEqual(order, [], 'sound off: nothing is created or changed');
  setSoundEnabled(true); unlockSound();
  assert.deepEqual(order, ['type:playback', 'ctx']);
});
