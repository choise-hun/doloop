'use strict';
const { test, expect } = require('@playwright/test');

for (const width of [390, 768, 960, 961, 1150, 1280]) {
  test(`TB2-L ${width}px registration alignment and guest focus`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route(/youtube\.com|ytimg\.com|doubleclick\.net/, (route) => route.abort());
    await page.goto('/practice.html', { waitUntil: 'domcontentloaded' });
    const add = page.getByTestId('tab-add');
    const upload = add.getByRole('button', { name: '악보 올리기' });
    await expect(upload).toBeVisible({ timeout: 3000 });
    const input = await add.getByRole('textbox').boundingBox();
    const button = await upload.boundingBox();
    expect(button.height).toBeGreaterThanOrEqual(44);
    if (width > 600) {
      expect(button.y).toBeCloseTo(input.y, 0);
      expect(button.height).toBeCloseTo(input.height, 0);
    } else {
      expect(button.x).toBeCloseTo(input.x, 0);
      expect(button.y).toBeGreaterThanOrEqual(input.y + input.height);
    }
    await upload.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('registration.png') });
    await page.keyboard.press('Escape');
    await expect(upload).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

const { setupTabPage, testSongs, yt, UID, observeTabResources, readTabResources, readTabRms } = require('./support/tab-fixtures');

test('TB2-P/C product score Canvas, audio progress and responsive mixer', async ({ page }) => {
  await observeTabResources(page);
  const issues = [];
  const assets = [];
  page.on('response', (response) => { if (new URL(response.url()).pathname.startsWith('/at/')) assets.push([response.url(), response.status()]); });
  await page.addInitScript(() => {
    window.tb2Violations = [];
    window.tb2Styles = [];
    document.addEventListener('securitypolicyviolation', (event) => window.tb2Violations.push(event.effectiveDirective));
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.tagName === 'STYLE' && node.textContent) window.tb2Styles.push(node.textContent);
      }
    }).observe(document, { subtree: true, childList: true });
  });
  page.on('pageerror', (error) => issues.push(error.message));
  await setupTabPage(page);
  await page.setViewportSize({ width: 1150, height: 900 });
  await page.goto('/practice.html?song=' + testSongs[0].id);
  const score = page.getByTestId('tab-score');
  await expect(score).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  await expect(score.locator('canvas').first()).toBeVisible();
  const mixer = page.locator('details[data-align-group*="tab-stage"]');
  const scorePanel = score.locator('..');
  for (const width of [1280, 1150, 961, 960, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width > 960) {
      await expect(mixer).toHaveAttribute('open', '');
      const [scoreBox, mixerBox] = await Promise.all([scorePanel.boundingBox(), mixer.boundingBox()]);
      expect(mixerBox.width).toBeCloseTo(240, 0);
      expect(mixerBox.y).toBeCloseTo(scoreBox.y, 0);
    } else {
      await expect(mixer).not.toHaveAttribute('open', '');
      expect((await mixer.boundingBox()).y).toBeGreaterThan((await scorePanel.boundingBox()).y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: test.info().outputPath('score-' + width + '.png') });
  }
  await page.locator('#playBtn').click();
  await expect(page.locator('#tNow')).not.toHaveText('0:00');
  const audio = await readTabRms(page, 5000);
  expect(audio.peak).toBeGreaterThan(0.005);
  expect(audio.audibleSamples).toBeGreaterThan(15);
  await page.locator('#playBtn').click();
  const hashes = await page.evaluate(() => Promise.all(window.tb2Styles.map(async (style) => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(style));
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
  })));
  expect(hashes).toEqual(expect.arrayContaining(['EIR5s3Qp1PxPxW4Koopu9nVN+I2chNMT0ImH3VG/s+c=', 'ago6aunBhfAMrD80tguQXUt95n6srkO3pzX2dUHs0gs=']));
  expect(await page.evaluate(() => window.tb2Violations)).toEqual([]);
  expect(issues).toEqual([]);
  expect(assets.some(([url, status]) => url.endsWith('/font/Bravura.woff2') && status === 200)).toBe(true);
  const resources = await readTabResources(page);
  expect(resources.worklets).toHaveLength(1);
  expect(resources.contexts[0].modules).toContain('/at/alphaTab.worklet.mjs');
  expect(resources.workers).toEqual(expect.arrayContaining([{ path: '/at/alphaTab.worker.mjs', alive: true }]));
  expect(assets.some(([url, status]) => url.endsWith('/soundfont/sonivox.sf2') && status === 200)).toBe(true);

  for (const song of [testSongs[1], testSongs[0]]) {
    await page.locator('#folderList').getByRole('button', { name: new RegExp(song.title) }).click();
    await expect(page.locator('#songTitle')).toHaveText(song.title);
    await expect(score).toHaveAttribute('data-ready', 'true');
    await score.scrollIntoViewIfNeeded();
    await expect(score.locator('canvas').first()).toBeVisible();
    const play = page.locator('#playBtn');
    await expect(play).toHaveText('▶');
    await play.click();
    expect((await readTabRms(page, 800)).peak).toBeGreaterThan(0.005);
    await play.click();
  }
  const switched = await readTabResources(page);
  expect(switched.contexts).toHaveLength(1);
  expect(switched.workers).toHaveLength(1);
  expect(switched.worklets).toHaveLength(1);
});

test('TB2-R latest selection wins delayed download, history and account boundary', async ({ page }) => {
  await observeTabResources(page);
  let notifyDownload;
  const started = new Promise((resolve) => { notifyDownload = resolve; });
  let releaseDownload;
  const delayed = new Promise((resolve) => { releaseDownload = resolve; });
  const foreign = '00000000-0000-4000-8000-000000000022';
  let owner = UID;
  let slow = true;
  await setupTabPage(page, {
    async file(route, song) {
      if (song !== testSongs[0] || !slow) return false;
      notifyDownload();
      await delayed;
      await route.abort();
      return true;
    },
    async api(route, pathname) {
      if (owner === foreign && pathname === '/api/v1/songs/' + testSongs[2].id) {
        await route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
        return true;
      }
      return false;
    },
  });
  const row = (song) => page.locator('#folderList').getByRole('button', { name: new RegExp(song.title) });
  await page.goto('/practice.html?song=' + testSongs[0].id + '&v=' + yt.videoId);
  await started;
  await row(testSongs[1]).click();
  await row(testSongs[2]).click();
  const score = page.getByTestId('tab-score');
  await expect(score).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#songTitle')).toHaveText(testSongs[2].title);
  await expect(page).toHaveURL(new RegExp('song=' + testSongs[2].id));
  releaseDownload();
  slow = false;
  await expect(row(testSongs[2])).toHaveAttribute('aria-current', 'true');
  const contexts = (await readTabResources(page)).contexts.length;

  await row(yt).click();
  await expect(score).toBeHidden();
  await expect(page).toHaveURL(new RegExp('v=' + yt.videoId + '$'));
  await page.goBack();
  await expect(score).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#songTitle')).toHaveText(testSongs[2].title);
  expect((await readTabResources(page)).contexts.length).toBe(contexts);

  const getOwners = () => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('ulp-tab-files', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const get = db.transaction('files').objectStore('files').getAllKeys();
      get.onsuccess = () => { db.close(); resolve(get.result.map(([uid]) => uid)); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  }));
  await expect.poll(getOwners).toContain(UID);

  owner = foreign;
  await page.evaluate((uid) => window.tb2Auth(uid), foreign);
  await expect(score.getByRole('status')).toHaveText('악보를 찾을 수 없습니다.');
  await expect(page.locator('#playBtn')).toBeDisabled();
  await expect(score).toHaveAttribute('data-ready', 'false');
  await expect.poll(async () => (await readTabResources(page)).contexts.every((ctx) => ctx.closed)).toBe(true);

  await expect.poll(getOwners).not.toContain(UID);
});

test('TB2-U multipart upload, mixed-list selection and one signed URL refresh', async ({ page }) => {
  const fs = require('node:fs');
  const path = require('node:path');
  const uploaded = testSongs[2];
  let signed = 0;
  let storage = 0;
  let posts = 0;
  await setupTabPage(page, {
    async api(route, pathname, query) {
      if (pathname === '/api/v1/songs/tab') {
        posts++;
        const request = route.request();
        expect(request.method()).toBe('POST');
        expect(request.headers()['content-type']).toMatch(/^multipart\/form-data; boundary=/);
        expect(request.postDataBuffer().toString()).toContain('filename="B.xml"');
        await route.fulfill({ status: 201, json: { song: uploaded } });
        return true;
      }
      if (pathname === '/api/v1/songs') expect(query.getAll('include')).toEqual(['tab']);
      if (pathname.endsWith('/tab-file')) signed++;
      return false;
    },
    async file(route) {
      expect(route.request().headers()).not.toHaveProperty('authorization');
      expect(route.request().headers()).not.toHaveProperty('cookie');
      if (++storage === 1) {
        await route.fulfill({ status: 403, headers: { 'access-control-allow-origin': '*' } });
        return true;
      }
      return false;
    },
  });
  await page.goto('/practice.html');
  await expect(page.locator('#folderList')).toContainText(yt.title);
  const open = page.getByTestId('tab-add').getByRole('button', { name: '악보 올리기' });
  await open.click();
  const dialog = page.getByRole('dialog');
  const file = dialog.locator('input[type=file]');
  await file.setInputFiles({ name: 'invalid.gp5', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid') });
  await expect(dialog.getByRole('alert')).toContainText('.gp, .xml, .mxl');
  const fixture = path.resolve(__dirname, '../../개발산출물/자료/TB-0_재현물/fixtures/B.xml');
  await file.setInputFiles({ name: 'B.xml', mimeType: 'application/xml', buffer: fs.readFileSync(fixture) });
  await page.screenshot({ path: test.info().outputPath('authenticated-registration.png') });
  await dialog.getByRole('button', { name: '등록', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('tab-score')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#folderList').getByRole('button', { name: /TB2 B.xml/ })).toHaveCount(1);
  await expect(page.locator('#songTitle')).toHaveText(uploaded.title);
  expect({ signed, storage, posts }).toEqual({ signed: 2, storage: 2, posts: 1 });
});

test('TB2-U delayed 201 after account change stays out of PLAYER', async ({ page }) => {
  let finish;
  const waitForFinish = new Promise((resolve) => { finish = resolve; });
  let notify;
  const requested = new Promise((resolve) => { notify = resolve; });
  let completed;
  const responseEnded = new Promise((resolve) => { completed = resolve; });
  await setupTabPage(page, {
    async api(route, pathname) {
      if (pathname !== '/api/v1/songs/tab') return false;
      notify();
      await waitForFinish;
      try {
        await route.fulfill({ status: 201, json: { song: { ...testSongs[0], title: 'Late upload result' } } });
      } finally { completed(); }
      return true;
    },
  });
  await page.goto('/practice.html');
  await expect(page.locator('#folderList')).toContainText(yt.title);
  await page.getByTestId('tab-add').getByRole('button', { name: '악보 올리기' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'fake.gp', mimeType: 'application/octet-stream', buffer: Buffer.from('transport fixture'),
  });
  await dialog.getByRole('button', { name: '등록', exact: true }).click();
  await requested;
  await expect(dialog.getByRole('button', { name: '등록 중' })).toBeDisabled();
  await page.evaluate(() => window.tb2Auth(null));
  await expect(dialog).toBeHidden();
  finish();
  await responseEnded;
  await expect(page.locator('#songTitle')).not.toContainText('Late upload result');
  await expect(page).not.toHaveURL(/song=/);
});

test('TB2-R only the latest TAB drains after the active MIDI slot finishes', async ({ page }) => {
  await page.addInitScript(() => {
    const add = Worker.prototype.addEventListener;
    const post = Worker.prototype.postMessage;
    const held = [];
    let delaying = true;
    window.tb2Render = { started: 0, held: 0, release: () => {
      delaying = false;
      for (const release of held.splice(0)) release();
    } };
    Worker.prototype.postMessage = function(message, ...transfer) {
      if (message?.cmd === 'alphaSynth.loadMidi') window.tb2Render.started++;
      return post.call(this, message, ...transfer);
    };
    Worker.prototype.addEventListener = function(type, listener, options) {
      if (type !== 'message' || typeof listener !== 'function') return add.call(this, type, listener, options);
      return add.call(this, type, (event) => {
        if (delaying && event.data?.cmd === 'alphaSynth.midiLoaded') {
          held.push(() => listener(event));
          window.tb2Render.held++;
        } else {
          listener(event);
        }
      }, options);
    };
  });
  await setupTabPage(page);
  await page.goto('/practice.html?song=' + testSongs[0].id);
  const score = page.getByTestId('tab-score');
  const start = () => page.evaluate(() => window.tb2Render.started);
  await expect.poll(() => page.evaluate(() => window.tb2Render.held)).toBeGreaterThan(0);
  const initialLoads = await start();
  const latestFile = page.waitForResponse((response) => response.url().includes('/tb2-fixtures/B.xml'));
  const pick = (song) => page.locator('#folderList').getByRole('button', { name: new RegExp(song.title) }).click();
  await pick(testSongs[1]);
  await pick(testSongs[2]);
  await expect(page.locator('#songTitle')).toHaveText(testSongs[2].title);
  await (await latestFile).finished();
  await expect(score).toHaveAttribute('data-ready', 'false');
  expect(await start()).toBe(initialLoads);
  await page.evaluate(() => window.tb2Render.release());
  await expect(score).toHaveAttribute('data-ready', 'true');
  expect(await start()).toBe(initialLoads + 1);
  await expect(page.locator('#songTitle')).toHaveText(testSongs[2].title);
  await expect(page.locator('#playBtn')).toHaveText('▶');
});

test('TB2-C product policy rejects extra Worker, font and inline permissions', async ({ page }) => {
  await page.route('https://blocked.invalid/**', (route) => route.abort());
  await page.route('**/at/tb2-policy.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `
      const blob = URL.createObjectURL(new Blob(['void 0'], { type: 'text/javascript' }));
      window.tb2PolicyErrors = [];
      try { new Worker('https://blocked.invalid/worker.js').terminate(); }
      catch (error) { window.tb2PolicyErrors.push(error.name); }
      try { new Worker(blob).terminate(); } catch { /* Chromium may throw synchronously on CSP violation */ }
      try { Function('return 1')(); } catch (error) { window.tb2PolicyErrors.push(error.name); }
      URL.revokeObjectURL(blob);
    `,
  }));
  await page.goto('/practice.html');
  const read = () => page.evaluate(() => window.tb2Policy);
  await page.evaluate(async () => {
    window.tb2Policy = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.tb2Policy.push([event.effectiveDirective, event.blockedURI]);
    });
    const probe = document.createElement('script');
    probe.src = '/at/tb2-policy.js';
    document.head.appendChild(probe);
    const style = document.createElement('style');
    style.textContent = '.tb2-test { color: red }';
    document.head.appendChild(style);
    const target = document.createElement('div');
    target.setAttribute('style', 'color: red');
    document.body.appendChild(target);
    await new FontFace('Tb2Probe', 'url(https://blocked.invalid/font.woff2)').load().catch(() => undefined);
    style.remove();
    target.remove();
  });
  await expect.poll(read).toEqual(expect.arrayContaining([
    ['worker-src', 'blob'],
    ['font-src', 'https://blocked.invalid/font.woff2'],
    ['script-src', 'eval'],
    ['style-src-elem', 'inline'],
    ['style-src-attr', 'inline'],
  ]));
  expect(await page.evaluate(() => window.tb2PolicyErrors)).toEqual(['SecurityError', 'EvalError']);
});

test('TB2-A HOME and TRAILS render TAB song and session links without a YouTube thumbnail', async ({ page }) => {
  const song = testSongs[0];
  const sessionId = '00000000-0000-4000-8000-000000000120';
  let trailRead = false;
  await setupTabPage(page, {
    async api(route, pathname, query) {
      if (pathname !== '/api/v1/sessions' || query.get('include') !== 'tab') return false;
      trailRead = true;
      const date = query.get('today');
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      await route.fulfill({ json: { calendar: [], summary: {}, sessions: [{
        id: sessionId, songId: song.id, songTitle: song.title, songArtist: '',
        mediaType: 'tab', videoId: null, date, seconds: 30, loops: 1,
        a: 2, b: 8, rate: 0.75, takes: [],
      }] } });
      return true;
    },
  });
  await page.goto('/index.html');
  await expect(page.locator('#recentSongTitle')).toHaveAttribute('href', 'practice.html?song=' + song.id);
  await expect(page.locator('#recentSongThumb')).toHaveText('TAB');
  await expect(page.locator('img#recentSongThumb')).toHaveCount(0);
  await page.goto('/log.html');
  const session = page.locator('[data-session-id="' + sessionId + '"]');
  await expect(session.locator('a[href*="practice.html"]')).toHaveAttribute('href',
    'practice.html?song=' + song.id + '&a=2&b=8&r=0.75');
  await expect(session.locator('[data-share-action]')).toHaveCount(0);
  expect(trailRead).toBe(true);
  await page.goto('/log.html#songs');
  await expect(page.locator('a[href="practice.html?song=' + song.id + '"]').first()).toBeVisible();
});

test('TB2-P restored original-time controls and track mute precedence', async ({ page }) => {
  await observeTabResources(page);
  await setupTabPage(page);
  await page.setViewportSize({ width: 1150, height: 900 });
  await page.goto('/practice.html?song=' + testSongs[0].id + '&a=2&b=8&r=0.75&t=3');
  const score = page.getByTestId('tab-score');
  await expect(score).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#tDur')).toHaveText('1:04');
  await expect(page.locator('#tNow')).toHaveText('0:03');
  const staff = page.getByRole('button', { name: '오선지', exact: true });
  await staff.click();
  await expect(staff).toHaveAttribute('aria-pressed', 'true');
  await expect(score.locator('canvas').first()).toBeVisible();
  const solo = page.getByRole('button', { name: 'Guitar 솔로' });
  const mute = page.getByRole('button', { name: 'Guitar 뮤트' });
  await solo.click();
  await mute.click();
  await expect(solo).toHaveAttribute('aria-pressed', 'true');
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  const play = page.locator('#playBtn');
  await play.click();
  expect((await readTabRms(page, 1100)).peak).toBeLessThan(0.001);
  await mute.click();
  expect((await readTabRms(page, 1100)).peak).toBeGreaterThan(0.005);
  await play.click();
  await expect(play).toHaveText('▶');
  const resources = await readTabResources(page);
  expect(resources.contexts).toHaveLength(1);
  expect(resources.worklets).toHaveLength(1);
});
