'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const CT = require('../frontend/src/lib/engine/theory.mjs').default;
const compiled = ts.transpileModule(fs.readFileSync('frontend/src/components/chords/ChordDiagrams.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(compiled, {
  exports: loaded.exports, module: loaded,
  require(id) {
    if (id === 'react') return React;
    if (id.endsWith('musicEngine')) return { CT };
    if (id.endsWith('i18n.mts')) return { t: (key) => key };
    if (id.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    throw new Error(`Unexpected import: ${id}`);
  },
});
const draw = (notes, extra = {}) => renderToStaticMarkup(React.createElement(loaded.exports.KeyboardDiagramSvg, { notes, label: 'Keyboard', ...extra }));

test('CH-B 건반은 서버와 같은 임시표·옥타브를 MIDI로 배치한다', () => {
  const html = draw([{ pitch: 'Cb4' }, { pitch: 'B#3' }, { pitch: 'F##4' }, { pitch: 'Ebb4' }, { pitch: 'Gb4' }]);
  for (const midi of [59, 60, 67, 62, 66]) assert.match(html, new RegExp(`data-midi="${midi}" data-pressed="true"`));
  assert.match(html, /viewBox="0 0 282 94"/);
  const cSharp = draw([{ pitch: 'C#4' }]);
  const dFlat = draw([{ pitch: 'Db4' }]);
  assert.equal(cSharp, dFlat);
  assert.match(cSharp, /data-midi="61"[^>]*>.*?<rect x="15" y="1" width="12" height="44"/);
  assert.ok(cSharp.indexOf('data-midi="83"') < cSharp.indexOf('data-midi="61"'), 'white keys must paint before black keys');
});

test('CH-B 빈/잘못된 음과 MIDI 경계는 안전하게 렌더링하고 라벨을 escape한다', () => {
  const html = draw([{ pitch: 'invalid' }, { pitch: 'C10' }, { pitch: -1 }, { pitch: 128 }, { pitch: NaN }]);
  assert.equal((html.match(/data-pressed="true"/g) || []).length, 0);
  assert.match(html, /data-midi="48"/);
  assert.match(html, /data-midi="71"/);
  const bounds = draw([{ pitch: 0 }, { pitch: 127 }]);
  assert.match(bounds, /data-midi="0" data-pressed="true"/);
  assert.match(bounds, /data-midi="127" data-pressed="true"/);
  const unsafe = draw([{ pitch: 60, text: '<script>x</script>' }], { label: '<img onerror=x>' });
  assert.ok(!unsafe.includes('<script>'));
  assert.ok(unsafe.includes('&lt;script&gt;'));
  assert.ok(unsafe.includes('&lt;img onerror=x&gt;'));
});

test('CH-B 건반은 손 구분·현재음 상태를 표시한다', () => {
  const html = draw([{ pitch: 48, hand: 'lh' }, { pitch: 60, hand: 'rh', now: true }], { split: true });
  assert.match(html, /data-hand="lh"/);
  assert.match(html, /data-hand="rh" data-now="true"/);
  assert.match(html, /class="keyLegend"/);
  assert.match(html, /keyRight keyNow/);
});
