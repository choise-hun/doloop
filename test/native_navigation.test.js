'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function setup() {
  const messages = [];
  const listeners = new Map();
  let mutation;
  const context = vm.createContext({
    exports: {}, require: name => { assert.equal(name, 'react'); return { useLayoutEffect() {} }; },
    MutationObserver: class { constructor(callback) { mutation = callback; } observe() {} },
    crypto: { randomUUID: () => 'document-A' }, Symbol, Set, queueMicrotask,
    document: { querySelectorAll: () => [] },
    window: { addEventListener: (event, callback) => listeners.set(event, callback), webkit: { messageHandlers: { redoNavigation: { postMessage: value => messages.push({ ...value }) } } } },
  });
  const source = ts.transpileModule(fs.readFileSync('frontend/src/lib/nativeNavigation.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInContext(source, context);
  return { module: context.exports, messages, listeners, mutate: () => mutation(), state: () => context.window.__redoSwipeState };
}

test('NAVG tokens: an older cleanup and duplicate release never unlock the newer owner', async () => {
  const h = setup();
  const releaseA = h.module.blockNativeNavigation();
  releaseA();
  const releaseB = h.module.blockNativeNavigation();
  const firstB = h.messages.length;
  await Promise.resolve();
  releaseA();
  await Promise.resolve();
  assert.equal(h.state().blocked, true);
  assert.ok(h.messages.slice(firstB).every(state => state.blocked));
  releaseB();
  await Promise.resolve();
  assert.equal(h.state().blocked, false);
  assert.ok(h.messages.every((state, index) => index === 0 || state.sequence > h.messages[index - 1].sequence));
});

test('NAVG tokens: releasing a modal owner preserves an independent recording owner', async () => {
  const h = setup();
  const recording = h.module.blockNativeNavigation();
  const modal = h.module.blockNativeNavigation();
  modal();
  await Promise.resolve();
  assert.equal(h.state().blocked, true);
  recording();
  await Promise.resolve();
  assert.equal(h.state().blocked, false);
});


test('NAVG notifications: repeated timer DOM mutations do not flood the bridge; pageshow re-announces current state', async () => {
  const h = setup();
  h.module.initNativeNavigation();
  const release = h.module.blockNativeNavigation();
  const count = h.messages.length;
  for (let i = 0; i < 50; i++) h.mutate();
  assert.equal(h.messages.length, count);
  release(); await Promise.resolve();
  assert.equal(h.state().blocked, false);
  const restored = h.messages.length;
  h.listeners.get('pageshow')();
  assert.equal(h.messages.length, restored + 1);
  assert.equal(h.state().blocked, false);
});
