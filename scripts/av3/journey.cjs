'use strict';
const { fs, path, assert, chromium, expect, DIR, BASE, sql, rows, literal, snapshot, actor, api, goto, shot, noWrite, changedBy } = require('./support.cjs');
const report = { startedAt: new Date().toISOString(), results: [] };
const reportPath = path.join(DIR, 'journey.json');
async function step(name, fn) {
  try { const evidence = await fn(); report.results.push({ name, status: 'pass', evidence }); console.log(`PASS ${name}`); }
  catch (error) { report.results.push({ name, status: 'fail', error: error.message }); throw error; }
  finally { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 }); }
}
function privacy(body) {
  const text = JSON.stringify(body);
  for (const value of ['A_PRIVATE', 'B_PRIVATE', '"memo"', '"email"', '"displayName"']) assert.equal(text.includes(value), false, `Public data contains ${value}`);
}
(async () => {
  if (process.env.AV3_RESET_FIXTURE === '1') {
    if (fs.existsSync(reportPath)) fs.copyFileSync(reportPath, path.join(DIR, `journey-attempt-${Date.now()}.json`));
    fs.writeFileSync(path.join(DIR, `before-reset-${Date.now()}.json`), JSON.stringify(snapshot()), { mode: 0o600 });
    sql('TRUNCATE users CASCADE; DELETE FROM video_titles;');
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const A = await actor(browser, 'A'), B = await actor(browser, 'B'), O = await actor(browser, 'O');
    assert.equal(new Set([A.id, B.id, O.id]).size, 3, 'Three distinct Google accounts required');
    const meta = { A: A.id, B: B.id, O: O.id };
    fs.writeFileSync(path.join(DIR, 'actors.json'), JSON.stringify(meta), { mode: 0o600 });
    let category, folder, cloned, reportId;
    const videos = ['dQw4w9WgXcQ', '9bZkp7q19f0', 'kJQP7kiw5Fk'];
    const songs = [];
    const sharePath = () => `/api/v1/categories/${category}/share`;
    const detail = () => api(B, 'GET', `/api/v1/community/folders/${folder}`);
    async function setTier(who, tier) { return api(O, 'PUT', `/api/v1/admin/users/${who.id}/tier-override`, { tier, until: null, reason: 'AV3 isolated local verification' }); }
    async function newSong(who, videoId, categoryIds = []) {
      const body = await api(who, 'POST', '/api/v1/songs', { videoId, title: `${who.role}_PRIVATE title`, a: 10, b: 20, rate: .75 }, 201);
      await api(who, 'PATCH', `/api/v1/songs/${body.song.id}`, { memo: `${who.role}_PRIVATE memo`, categoryIds });
      return body.song.id;
    }
    await step('J0 real JWT / DB role / initial tiers', async () => {
      sql(`UPDATE profiles SET role='owner' WHERE id=${literal(O.id)};`);
      await setTier(A, 'pro');
      assert.equal((await api(A, 'GET', '/api/v1/me')).role, 'user');
      assert.equal((await api(A, 'GET', '/api/v1/me')).tier, 'pro');
      assert.equal((await api(B, 'GET', '/api/v1/me')).tier, 'free');
      assert.equal((await api(O, 'GET', '/api/v1/me')).role, 'owner');
      for (const who of [A, B]) {
        await api(who, 'PATCH', '/api/v1/me', { displayName: `${who.role}_PRIVATE name` });
        await api(who, 'PUT', '/api/v1/community/me/public-name', { publicName: `AV3${who.role}${Date.now().toString().slice(-6)}` });
      }
      return { distinctAccounts: 3, DB: 'disposable PostgreSQL 16', jwt: 'real Supabase access tokens' };
    });
    await step('J1 A publishes in browser -> free B discovers real server folder', async () => {
      category = (await api(A, 'POST', '/api/v1/categories', { name: 'AV3 게시 검수' }, 201)).category.id;
      for (const video of videos) songs.push(await newSong(A, video, [category]));
      await goto(A, '/log.html#community');
      const sw = A.page.locator(`[data-share-public="${category}"]`);
      await expect(sw).toBeVisible();
      const response = await changedBy(A.page, sharePath(), 'PUT', () => sw.click());
      folder = response.share.folderId;
      await expect(sw).toHaveAttribute('aria-checked', 'true');
      await goto(B, '/log.html#community');
      await B.page.locator(`[data-folder-id="${folder}"]`).first().click();
      await expect(B.page.locator('#folderSheetTitle')).toHaveText('AV3 게시 검수');
      const d = await detail(); privacy(d); assert.equal(d.items.length, 3);
      assert.equal(d.items[0].a, 10); assert.equal(d.items[0].b, 20); assert.equal(d.items[0].rate, .75);
      assert.equal((await B.page.locator('#root').innerText()).includes('// i18n-keep'), false);
      await shot(B, 'J1-free-B-folder');
      return { items: d.items.length, source: 'browser -> Ktor -> DB (no API mocks)' };
    });
    await step('J2 free likes/follows + rejected clone leaves entire domain DB unchanged', async () => {
      await changedBy(B.page, `/api/v1/community/folders/${folder}/like`, 'PUT', () => B.page.locator('#folderLike').click());
      await expect(B.page.locator('#folderLike')).toHaveAttribute('aria-checked', 'true');
      await changedBy(B.page, `/api/v1/community/follows/${A.id}`, 'PUT', () => B.page.locator('#folderFollow').click());
      await expect(B.page.locator('#folderFollow')).toHaveAttribute('aria-checked', 'true');
      assert.equal((await api(B, 'PUT', `/api/v1/community/folders/${folder}/like`)).likeCount, 1);
      const failure = await noWrite(() => api(B, 'POST', `/api/v1/community/folders/${folder}/clone`, undefined, 403));
      assert.equal(failure.code, 'TIER_UPGRADE_REQUIRED');
      await noWrite(() => api(B, 'GET', '/api/v1/admin/reports', undefined, 403));
      return { deniedClone: 403, nonOwnerAdmin: 403, snapshot: 'all domain tables, entire row values' };
    });
    await step('J3 same B upgraded -> browser clone -> own library reload + A/B ownership', async () => {
      await setTier(B, 'pro');
      await newSong(B, videos[0]);
      await goto(B, '/log.html#community');
      await B.page.locator(`[data-folder-id="${folder}"]`).first().click();
      const result = await changedBy(B.page, `/api/v1/community/folders/${folder}/clone`, 'POST', () => B.page.locator('#folderClone').click());
      assert.equal(result.imported, 2); assert.equal(result.alreadyInLibrary, 1); assert.equal(result.skippedLimit, 0);
      cloned = result.categoryId;
      await expect(B.page.locator('#folderSheetOk')).toBeVisible();
      const library = (await api(B, 'GET', '/api/v1/songs')).songs;
      assert.equal(library.length, 3);
      assert.equal(rows(`SELECT * FROM song_categories WHERE user_id=${literal(B.id)} AND category_id=${literal(cloned)}`).length, 3);
      await goto(B, '/log.html#songs');
      await expect(B.page.locator('#songList')).toContainText('B_PRIVATE title');
      await shot(B, 'J3-B-own-library');
      for (const [who, id] of [[B, songs[0]], [A, library[0].id]]) {
        await noWrite(() => api(who, 'GET', `/api/v1/songs/${id}`, undefined, 404));
        await noWrite(() => api(who, 'PATCH', `/api/v1/songs/${id}`, { memo: 'unauthorized' }, 404));
      }
      await noWrite(() => api(B, 'PUT', sharePath(), { isPublic: false }, 404));
      return { imported: 2, alreadyInLibrary: 1, persistedLibrary: 3, crossAccount: 'GET/PATCH song and category share rejected' };
    });
    await step('J4 manual republish / folder OFF / global OFF / explicit re-enable', async () => {
      await api(A, 'POST', '/api/v1/practice/save', { songId: songs[0], pos: 12, a: 12, b: 22, rate: .5, date: new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul'}).format(new Date()) });
      assert.equal((await detail()).items.find(i => i.videoId === videos[0]).a, 10);
      await api(A, 'POST', sharePath() + '/republish', {});
      assert.equal((await detail()).items.find(i => i.videoId === videos[0]).a, 12);
      await api(A, 'PATCH', '/api/v1/me', { shareAutosync: true });
      await api(A, 'PUT', sharePath(), { isPublic: true, autoSync: true });
      await api(A, 'DELETE', `/api/v1/songs/${songs[2]}`, undefined, 200);
      assert.equal((await detail()).items.length, 2);
      await api(A, 'PUT', sharePath(), { isPublic: true, autoSync: false });
      songs.push(await newSong(A, 'fJ9rUzIMcZQ', [category]));
      assert.equal((await detail()).items.length, 2);
      await api(A, 'PUT', sharePath(), { isPublic: true, autoSync: true });
      assert.equal((await detail()).items.length, 3);
      await api(A, 'PATCH', '/api/v1/me', { shareAutosync: false });
      assert.equal((await api(A, 'GET', sharePath())).share.autoSync, false);
      await api(A, 'DELETE', `/api/v1/songs/${songs[3]}`, undefined, 200);
      assert.equal((await detail()).items.length, 3);
      return { manualFrozen: true, republish: true, folderOffFrozen: true, globalOffFrozen: true };
    });
    await step('J5 withdrawal hides public folder but preserves B copied library', async () => {
      await api(A, 'PUT', sharePath(), { isPublic: false });
      await api(B, 'GET', `/api/v1/community/folders/${folder}`, undefined, 404);
      assert.equal((await api(B, 'GET', '/api/v1/community/folders')).folders.some(f => f.id === folder), false);
      assert.equal((await api(B, 'GET', '/api/v1/songs')).songs.length, 3);
      assert.equal(rows(`SELECT * FROM shared_folders WHERE id=${literal(folder)} AND NOT is_public AND NOT auto_sync`).length, 1);
      await api(A, 'PUT', sharePath(), { isPublic: true });
      await goto(B, '/log.html#community');
      await expect(B.page.locator(`[data-folder-id="${folder}"]`).first()).toBeVisible();
      return { withdrawn404: true, clonePreserved: true, explicitRepublish: true };
    });
    await step('J6 real report / duplicate rollback / owner hide + audit', async () => {
      const r = await api(B, 'POST', `/api/v1/community/folders/${folder}/reports`, { reason: 'other', detail: 'AV3 local test report' }, 201);
      reportId = r.id || r.reportId;
      assert.equal((await noWrite(() => api(B, 'POST', `/api/v1/community/folders/${folder}/reports`, { reason: 'other' }, 409))).code, 'ALREADY_REPORTED');
      const open = await api(O, 'GET', '/api/v1/admin/reports?status=open');
      if (!reportId) reportId = rows(`SELECT id FROM folder_reports WHERE folder_id=${literal(folder)}`)[0].id;
      assert.ok(JSON.stringify(open).includes(String(reportId)));
      await api(O, 'PATCH', `/api/v1/admin/shared-folders/${folder}`, { hidden: true, hiddenReason: 'AV3 local hide', reason: 'AV3 verification' });
      await api(O, 'PATCH', `/api/v1/admin/reports/${reportId}`, { status: 'resolved', reason: 'AV3 verification' });
      await api(B, 'GET', `/api/v1/community/folders/${folder}`, undefined, 404);
      assert.ok(rows("SELECT action FROM admin_audit WHERE action='folder_hide'").length > 0);
      await api(O, 'PATCH', `/api/v1/admin/shared-folders/${folder}`, { hidden: false, reason: 'AV3 verification restore' });
      return { report: 201, duplicate: 409, hidden404: true, audit: true };
    });
    fs.writeFileSync(path.join(DIR, 'fixture.json'), JSON.stringify({ category, folder, cloned, songs, videos }), { mode: 0o600 });
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
