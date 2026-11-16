// Requires the isolated fixture APK + test APK installed on a dedicated UXN AVD.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const serial = process.argv[2];
if (!/^emulator-\d+$/.test(serial || '')) throw Error('Specify the dedicated emulator serial');
const adb = path.join(process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk'), 'platform-tools/adb');
function run(args) {
  const result = spawnSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw Error(result.error?.message || result.stderr);
  return result.stdout;
}
if (!run(['emu', 'avd', 'name']).startsWith('UXN_')) throw Error('Only a dedicated UXN AVD is allowed');
const project = process.argv[3];
if (!project || !fs.existsSync(path.join(project, 'app/src/main/assets/public/native-fixture.js'))) throw Error('Specify the isolated fixture android directory');
for (const apk of ['app/build/outputs/apk/debug/app-debug.apk', 'app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk']) {
  const file = path.join(project, apk);
  if (!fs.existsSync(file)) throw Error('Build fixture app/test APKs first');
  run(['install', '-r', '-t', file]);
}

async function debuggerSession() {
  const pid = run(['shell', 'pidof', 'com.ulevelp.redo']).trim();
  if (!/^\d+$/.test(pid)) throw Error('Expected one app process');
  const port = run(['forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid]).trim();
  let last = 'DevTools page not ready';
  const deadline = Date.now() + 20000;
  let page;
  while (Date.now() < deadline && !page) {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json');
      if (!response.ok) throw Error('DevTools HTTP ' + response.status);
      page = (await response.json()).find(page => page.url.startsWith('https://localhost'));
    } catch (error) { last = error.message; }
  }
  if (!page) { run(['forward', '--remove', 'tcp:' + port]); throw Error(last); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const evaluate = expression => new Promise((resolve, reject) => {
    const requestId = ++id;
    const listener = event => {
      const message = JSON.parse(event.data);
      if (message.id !== requestId) return;
      clearTimeout(timer); ws.removeEventListener('message', listener);
      if (message.error || message.result.exceptionDetails) reject(Error(JSON.stringify(message.error || message.result.exceptionDetails)));
      else resolve(message.result.result.value);
    };
    const timer = setTimeout(() => { ws.removeEventListener('message', listener); reject(Error('DevTools evaluation deadline')); }, 5000);
    ws.addEventListener('message', listener);
    ws.send(JSON.stringify({ id: requestId, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
  return { evaluate, close() { ws.close(); run(['forward', '--remove', 'tcp:' + port]); } };
}
async function waitFor(session, expression) {
  const deadline = Date.now() + 15000;
  let last;
  while (Date.now() < deadline) {
    last = await session.evaluate(expression);
    if (last === true) return;
  }
  throw Error('Condition deadline: ' + expression + '; result=' + last);
}
run(['shell', 'am', 'start', '-W', '-n', 'com.ulevelp.redo/.MainActivity']);
const before = await debuggerSession();
try {
  await waitFor(before, "document.getElementById('state')?.textContent === 'Native fixture ready'");
  const previous = await before.evaluate('performance.timeOrigin');
  await before.evaluate("document.getElementById('reset').click()");
  await waitFor(before, "performance.timeOrigin !== " + previous + " && document.getElementById('state')?.textContent === 'Native fixture ready'");
  await before.evaluate("document.getElementById('login').click()");
  await waitFor(before, "document.getElementById('auth')?.textContent === 'Auth guest Profile none waiting Exchanges 0'");
  await waitFor(before, "JSON.parse(localStorage.getItem('ulp:native-oauth')).flowId === localStorage.getItem('uxn:flow') && localStorage.getItem('uxn:verifier') === 'fixture-verifier-' + localStorage.getItem('uxn:flow')");
  const flowId = await before.evaluate("localStorage.getItem('uxn:flow')");
  if (!/^fixture-flow-[a-f0-9-]+$/.test(flowId)) throw Error('Unexpected fixture flow id');
  // WebView batches LevelDB writes. Wait for this unique pending/verifier record
  // to reach disk; a synchronous localStorage read alone is not cold durability.
  const commitDeadline = Date.now() + 15000;
  let durable = false;
  while (Date.now() < commitDeadline && !durable) {
    const directory = 'app_webview/Default/Local Storage/leveldb';
    const names = run(['shell', "run-as com.ulevelp.redo ls '" + directory + "'"]).split(/\s+/).filter(name => /^\d+\.log$/.test(name));
    const journal = names.map(name => run(['exec-out', 'run-as', 'com.ulevelp.redo', 'cat', directory + '/' + name])).join('');
    durable = journal.includes('"flowId":"' + flowId + '"') && journal.includes('fixture-verifier-' + flowId);
  }
  if (!durable) throw Error('Pending/verifier did not reach the WebView storage journal');
} finally { before.close(); }
// Match the real Browser handoff: finish the Activity background transition first.
run(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.HOME']);
run(['shell', 'am', 'force-stop', 'com.ulevelp.redo']);
run(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'ulevelp://auth/callback?code=A', 'com.ulevelp.redo']);
const after = await debuggerSession();
try {
  try { await waitFor(after, "document.getElementById('auth')?.textContent === 'Auth A Profile A idle Exchanges 1'"); }
  catch (error) { throw Error(error.message + '; UI=' + await after.evaluate("document.getElementById('auth')?.textContent")); }
  console.log('PASS: pending/verifier → force-stop → OS VIEW cold launch → one exchange → rendered profile A');
} finally { after.close(); }
