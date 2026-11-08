'use strict';
// Native Chrome, real Google OAuth. Save only the local app session, never Google cookies.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium, expect } = require('@playwright/test');
const ROOT = path.resolve(__dirname, '../..');
const DIR = path.join(ROOT, 'test-results/av3');
const role = process.argv[2];
if (!['A', 'B', 'O'].includes(role)) throw new Error('Usage: node scripts/av3/login.cjs A|B|O');
const base = 'http://127.0.0.1:3103';
const port = Number(process.env.AV3_CDP_PORT) || { A: 9311, B: 9312, O: 9313 }[role];
(async () => {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const profile = path.join(DIR, `chrome-${role}${process.env.AV3_CDP_PORT ? '-' + port : ''}`);
  fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
  const executable = process.env.AV3_BROWSER_EXECUTABLE || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Whale.app/Contents/MacOS/Whale', chromium.executablePath()].find(p => fs.existsSync(p));
  if (!executable) throw new Error('No Chromium browser executable available');
  let running = false;
  try { running = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch {}
  if (!running) {
    const child = spawn(executable, [
      `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
      '--no-first-run', '--no-default-browser-check', '--disable-sync', 'about:blank',
    ], { detached: true, stdio: 'ignore' });
    child.on('error', error => { console.error(error.message); process.exit(1); });
    child.unref();
  }
  // Readiness polling only; journey tests use request/state events, never arbitrary sleeps.
  const deadline = Date.now() + 15000;
  while (true) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Chrome debugging endpoint did not become ready');
    await new Promise(r => setTimeout(r, 100));
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  // Reject all production-app traffic, including a rejected OAuth redirect fallback.
  await context.route(/https:\/\/.*\.a\.run\.app\//, async route => {
    console.error(`AV3_${role}_BLOCKED_PRODUCTION_REDIRECT: local OAuth redirect allowlist needs configuration`);
    await route.abort('blockedbyclient');
  });
  await context.route('https://choise-hun.github.io/**', route => route.abort('blockedbyclient'));
  const page = context.pages().find(p => p.url().startsWith(base) || p.url().startsWith('https://accounts.google.com')) || context.pages()[0] || await context.newPage();
  if (!page.url().startsWith(base) && !page.url().startsWith('https://accounts.google.com')) await page.goto(`${base}/settings.html#account`);
  if (page.url().startsWith(base)) await expect.poll(() => page.evaluate(() => !!window.ULAuth?.isConfigured())).toBe(true);
  const oldAuth = page.url().startsWith(base) ? await page.evaluate(() => localStorage.getItem('ulp:auth')) : null;
  if (page.url().startsWith(base) && (process.env.AV3_REAUTH === '1' || !(await page.evaluate(() => !!window.ULAuth.getMe()?.id)))) {
    await page.evaluate(() => window.ULAuth.signIn(location.origin + '/settings.html'));
  }
  console.log(`AV3_LOGIN_WAITING_${role}: finish Google login in the opened Chrome window`);
  await expect.poll(async () => {
    if (!page.url().startsWith(base)) return null;
    try { return await page.evaluate(({reauth,oldAuth}) => reauth && localStorage.getItem('ulp:auth') === oldAuth ? null : window.ULAuth?.getMe()?.id || null, {reauth:process.env.AV3_REAUTH === '1',oldAuth}); } catch { return null; }
  }, { timeout: 900000, intervals: [100, 250, 500] }).not.toBeNull();
  const identity = await page.evaluate(() => {
    const me = window.ULAuth.getMe(); return { id: me.id, role: me.role, tier: me.tier };
  });
  const authValue = await page.evaluate(() => localStorage.getItem('ulp:auth'));
  if (!authValue) throw new Error('Real app session storage not available');
  const state = { cookies: [], origins: [{ origin: base, localStorage: [{ name: 'ulp:auth', value: authValue }] }] };
  fs.writeFileSync(path.join(DIR, `auth-${role}.json`), JSON.stringify(state), { mode: 0o600 });
  fs.writeFileSync(path.join(DIR, `identity-${role}.json`), JSON.stringify(identity), { mode: 0o600 });
  console.log(`AV3_LOGIN_READY_${role}`);
  // Leave the native Chrome window open for the user and subsequent CDP automation.
  process.exit(0);
})().catch(error => { console.error(error.message); process.exit(1); });
