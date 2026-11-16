import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = process.argv.includes('--fixture');
const qa = process.argv.includes('--qa');
const arg = process.argv.indexOf('--out');
const out = arg >= 0 ? path.resolve(process.argv[arg + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), 'uxn-native-'));
// Never overwrite an existing checkout or a product bundle.
if (fs.existsSync(out) && fs.readdirSync(out).length) throw Error('--out must be an empty directory');
fs.mkdirSync(out, { recursive: true });
for (const platform of ['ios', 'android']) fs.cpSync(path.join(root, platform), path.join(out, platform), {
  recursive: true, filter: p => !['build', '.gradle', '.idea', 'DerivedData'].includes(path.basename(p)),
});
fs.symlinkSync(path.join(root, 'node_modules'), path.join(out, 'node_modules'), 'dir');
for (const destination of ['ios/App/App/public', 'android/app/src/main/assets/public']) {
  const target = path.join(out, destination);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(path.join(root, 'dist-app'), target, { recursive: true });
  if (fixture) {
    await build({ entryPoints: [path.join(root, 'test/native/input-probe.ts')], outfile: path.join(target, 'input-probe.js'), bundle: true, format: 'esm', target: 'es2022' });
    fs.copyFileSync(path.join(root, 'test/native/input-probe.html'), path.join(target, 'input-probe.html'));
    await build({ entryPoints: [path.join(root, 'test/native/fixture.ts')], outfile: path.join(target, 'native-fixture.js'), bundle: true, format: 'esm', target: 'es2022', alias: { '@capacitor/browser': path.join(root, 'test/native/browser.ts') } });
    const html = fs.readFileSync(path.join(root, 'test/native/fixture.html'));
    for (const page of ['index.html', 'settings.html', 'log.html', 'practice.html']) fs.writeFileSync(path.join(target, page), html);
  }
}
if (qa) {
  const scheme = path.join(out, 'ios/App/App.xcodeproj/xcshareddata/xcschemes/UXNNative.xcscheme');
  fs.writeFileSync(scheme, fs.readFileSync(scheme, 'utf8').replace('key="UXN_APP_ID" value="com.ulevelp.redo"', 'key="UXN_APP_ID" value="com.ulevelp.redo.uxn"'));
  const project = path.join(out, 'ios/App/App.xcodeproj/project.pbxproj');
  fs.writeFileSync(project, fs.readFileSync(project, 'utf8').replaceAll('PRODUCT_BUNDLE_IDENTIFIER = com.ulevelp.redo;', 'PRODUCT_BUNDLE_IDENTIFIER = com.ulevelp.redo.uxn;'));
  const info = path.join(out, 'ios/App/App/Info.plist');
  for (const args of [['-replace', 'CFBundleDisplayName', '-string', 'RE:DO QA', info], ['-remove', 'CFBundleURLTypes', info]]) {
    const result = spawnSync('plutil', args, { encoding: 'utf8' });
    if (result.status !== 0) throw Error(result.stderr || result.stdout);
  }
}
console.log(JSON.stringify({ out, fixture, qa, productBundlesModified: false }));
