// Read-only inventory. Does not build, boot, install, authenticate, or run UI tests.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';
const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024,
  });
  return {
    ok: !result.error && result.status === 0,
    output: (result.stdout || '').trim(),
    error: result.error?.message || (result.status !== 0 ? (result.stderr || '').trim() : ''),
  };
};
const files = (directory) => existsSync(directory)
  ? readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }) : [];

const xcode = run('xcodebuild', ['-version']);
const simctl = run('xcrun', ['simctl', 'list', 'devices', 'available', '--json']);
let simulators = [];
if (simctl.ok) {
  try {
    simulators = Object.values(JSON.parse(simctl.output).devices).flat()
      .map(({ name, udid, state }) => ({ name, udid, state }));
  } catch (error) {
    simctl.ok = false;
    simctl.error = `Invalid simctl JSON: ${error.message}`;
  }
}
const project = read(join(root, 'ios/App/App.xcodeproj/project.pbxproj'));
const uiTarget = project.includes('com.apple.product-type.bundle.ui-testing');
const schemes = files(join(root, 'ios/App/App.xcodeproj/xcshareddata/xcschemes'))
  .filter(path => path.endsWith('.xcscheme') && read(path).includes('<TestableReference'));

const localSdk = read(join(root, 'android/local.properties')).match(/^sdk\.dir=(.+)$/m)?.[1]?.trim();
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || localSdk
  || join(homedir(), 'Library/Android/sdk');
const emulator = run(join(sdk, 'emulator/emulator'), ['-list-avds']);
// Avoid starting an adb server as a side effect of the inventory.
const androidTests = files(join(root, 'android/app/src/androidTest'))
  .filter(path => /\.(java|kt)$/.test(path));
const staleSample = androidTests.some(path => read(path).includes('"com.getcapacitor.app"'));
const java = run(process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin/java') : 'java', ['-version']);
const gradle = read(join(root, 'android/app/build.gradle'));
const blockers = [];
if (!xcode.ok) blockers.push('iOS: Xcode unavailable');
if (!simctl.ok || !simulators.length) blockers.push('iOS: no available Simulator or inventory failed');
if (!uiTarget) blockers.push('iOS: XCUITest target missing');
if (!schemes.length) blockers.push('iOS: shared scheme with testable reference missing');
if (!java.ok) blockers.push('Android: Java unavailable');
if (!emulator.ok || !emulator.output) blockers.push('Android: no AVD or emulator inventory failed');
if (!existsSync(join(sdk, 'platform-tools/adb'))) blockers.push('Android: adb missing');
if (!gradle.includes('androidx.test.runner.AndroidJUnitRunner')) blockers.push('Android: instrumentation runner missing');
if (!androidTests.length || staleSample) blockers.push('Android: app-specific native UI test missing (template is not acceptance coverage)');

console.log(JSON.stringify({
  scope: 'native-test-preparation-only',
  uiTestsExecuted: false,
  readyForPilot: blockers.length === 0,
  ios: { xcode, simctl: { ok: simctl.ok, error: simctl.error }, simulators, uiTarget, sharedTestSchemes: schemes.length },
  android: { sdk, javaAvailable: java.ok, javaError: java.error,
    avds: emulator.ok ? emulator.output.split(/\r?\n/).filter(Boolean) : [],
    emulatorError: emulator.error, instrumentationSourceCount: androidTests.length, staleSample },
  blockers,
}, null, 2));
process.exitCode = blockers.length ? 2 : 0;
