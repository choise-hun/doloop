'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('CH-B keyboard 음원은 MIDI·예약 시각·길이를 검증하고 기존 음원을 유지한다', async () => {
  const { createAudioEngine } = await import('../frontend/src/lib/musicEngine.ts');
  const oscillators = [];
  const context = {
    currentTime: 10, state: 'running', destination: {},
    createOscillator() {
      const oscillator = { type: '', frequency: { setValueAtTime(value, time) { oscillator.frequencyValue = value; oscillator.frequencyTime = time; } },
        connect() {}, start(time) { oscillator.started = time; }, stop(time) { oscillator.stopped = time; } };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; },
  };
  const engine = createAudioEngine(() => context);
  for (const input of [NaN, Infinity, -1, 128, 60.5]) engine.keyboard(input);
  engine.keyboard(60, NaN);
  engine.keyboard(60, 12, -1);
  assert.equal(oscillators.length, 0);
  engine.keyboard(69, 12, 1.2);
  assert.deepEqual(oscillators.map((o) => o.frequencyValue), [440, 880, 1320]);
  for (const oscillator of oscillators) {
    assert.equal(oscillator.type, 'sine');
    assert.equal(oscillator.started, 12);
    assert.equal(oscillator.frequencyTime, 12);
    assert.ok(Math.abs(oscillator.stopped - 13.22) < 1e-9);
  }
  engine.keyboard(0, 1, 99);
  assert.equal(oscillators[3].started, 10);
  assert.equal(oscillators[3].stopped, 18.02);
  engine.pluck(60);
  assert.equal(oscillators[6].type, 'triangle');
  engine.bassPluck(28);
  assert.equal(oscillators[8].type, 'triangle');
  assert.equal(oscillators[9].type, 'sine');
});
