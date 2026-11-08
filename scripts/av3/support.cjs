'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium, expect } = require('@playwright/test');
const ROOT = path.resolve(__dirname, '../..');
const DIR = path.join(ROOT, 'test-results/av3');
const BASE = 'http://127.0.0.1:3103';
function sql(query) {
  const runtime = JSON.parse(fs.readFileSync(path.join(DIR, 'runtime.json')));
  assert.equal(runtime.container, 'ulevelp-av3-db');
  const info = JSON.parse(execFileSync('docker', ['inspect', runtime.container], { encoding: 'utf8' }))[0];
  assert.equal(info.Config.Labels['ulevelp.audit'], 'av3');
  assert.equal(info.HostConfig.PortBindings['5432/tcp'][0].HostIp, '127.0.0.1');
  return execFileSync('docker', ['exec', '-i', runtime.container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
    '-U', 'ulp_av3', '-d', 'ulp_av3', '-At'], { input: query, encoding: 'utf8' }).trim();
}
function rows(query) { return JSON.parse(sql(`SELECT COALESCE(json_agg(t),'[]'::json) FROM (${query}) t;`)); }
function literal(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
function snapshot() {
  const tables = rows("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('flyway_schema_history','video_titles') ORDER BY tablename");
  return Object.fromEntries(tables.map(({ tablename }) => {
    assert.match(tablename, /^[a-z_]+$/);
    return [tablename, rows(`SELECT * FROM "${tablename}" t ORDER BY to_jsonb(t)::text`)];
  }));
}
async function actor(browser, role) {
  const authPath = path.join(DIR, `auth-${role}.json`);
  assert.ok(fs.existsSync(authPath), `Google login required for ${role}`);
  const context = await browser.newContext({ storageState: authPath, locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1280, height: 900 } });
  await context.route(/https:\/\/.*\.a\.run\.app\//, route => route.abort('blockedbyclient'));
  const page = await context.newPage();
  await page.goto(`${BASE}/settings.html`);
  await expect.poll(() => page.evaluate(() => window.ULAuth?.getMe()?.id || null)).not.toBeNull();
  const id = await page.evaluate(() => window.ULAuth.getMe().id);
  const expected = JSON.parse(fs.readFileSync(path.join(DIR, `identity-${role}.json`))).id;
  assert.equal(id, expected);
  return { role, context, page, id };
}
async function api(actor, method, pathname, body, expected = 200) {
  assert.ok(pathname.startsWith('/api/v1/'));
  const result = await actor.page.evaluate(async ({ method, pathname, body }) => {
    const token = await window.ULAuth.getAccessToken();
    const response = await fetch(pathname, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }, { method, pathname, body });
  assert.equal(result.status, expected, `${actor.role} ${method} ${pathname}: expected ${expected}, got ${result.status} (${result.body?.code || ''})`);
  return result.body;
}
async function goto(actor, route) {
  await actor.page.goto(BASE + route);
  await actor.page.reload(); // Same-document hash navigation can preserve an open sheet.
  await expect.poll(() => actor.page.evaluate(() => window.ULAuth?.getMe()?.id)).toBe(actor.id);
}
async function shot(actor, name) { await actor.page.screenshot({ path: path.join(DIR, `${name}.png`), fullPage: true }); }
async function noWrite(action) { const before = snapshot(); const result = await action(); assert.deepEqual(snapshot(), before); return result; }
async function changedBy(page, pathname, method, action, status = 200) {
  const wait = page.waitForResponse(r => new URL(r.url()).pathname === pathname && r.request().method() === method);
  await action(); const response = await wait; assert.equal(response.status(), status); return response.json();
}
module.exports = { fs, path, assert, chromium, expect, ROOT, DIR, BASE, sql, rows, literal, snapshot, actor, api, goto, shot, noWrite, changedBy };
