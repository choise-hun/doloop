'use strict';
// Real mutation commits first; only response delivery is delayed/lost. This is NOT a server rollback test.
const { fs, path, assert, chromium, expect, DIR, BASE, actor, api, goto, shot } = require('./support.cjs');
const result = { startedAt: new Date().toISOString(), model: 'real server commit + controlled response delivery', cases: [] };
const session = role => {
  const state = JSON.parse(fs.readFileSync(path.join(DIR, `auth-${role}.json`)));
  return JSON.parse(state.origins[0].localStorage.find(x => x.name === 'ulp:auth').value);
};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
(async () => {
  const browser = await chromium.launch();
  try {
    const f = JSON.parse(fs.readFileSync(path.join(DIR, 'fixture.json')));
    const stableB = await actor(browser, 'B');
    const bFolder = (await api(stableB, 'PUT', `/api/v1/categories/${f.cloned}/share`, { isPublic: true, title: 'AV3 B 대상' })).share.folderId;
    await stableB.context.close();
    for (const sourceRole of ['A', 'B']) for (const op of ['like', 'follow', 'clone', 'report']) for (const outcome of ['success', 'response500']) for (const transition of ['otherFolder', 'reopen', 'otherAccount']) {
      const who = await actor(browser, sourceRole);
      const ownIdentity = JSON.parse(fs.readFileSync(path.join(DIR, `identity-${sourceRole}.json`))).id;
      const otherRole = sourceRole === 'A' ? 'B' : 'A';
      const otherIdentity = JSON.parse(fs.readFileSync(path.join(DIR, `identity-${otherRole}.json`))).id;
      const target = sourceRole === 'A' ? bFolder : f.folder;
      const alternate = sourceRole === 'A' ? f.folder : bFolder;
      const endpoint = op === 'follow' ? `/api/v1/community/follows/${otherIdentity}` : `/api/v1/community/folders/${target}/${{like:'like',clone:'clone',report:'reports'}[op]}`;
      const method = ['like', 'follow'].includes(op) ? 'PUT' : 'POST';
      const committed = deferred(), release = deferred();
      let cloneCategory;
      try {
        if (op === 'like') await api(who, 'DELETE', endpoint);
        if (op === 'follow') await api(who, 'DELETE', endpoint);
        if (op === 'report') {
          const { sql, literal } = require('./support.cjs');
          sql(`DELETE FROM folder_reports WHERE folder_id=${literal(target)} AND reporter_id=${literal(ownIdentity)};`);
        }
        await goto(who, '/log.html#community');
        await who.page.locator(`[data-folder-id="${target}"]`).first().click();
        await expect(who.page.locator('#folderSheetTitle')).toBeVisible();
        await who.page.route(BASE + endpoint, async route => {
          if (route.request().method() !== method) return route.continue();
          try {
            const response = await route.fetch();
            assert.equal(response.status(), op === 'report' ? 201 : 200);
            const body = await response.json();
            cloneCategory = body.categoryId;
            committed.resolve(body);
            await release.promise;
            if (outcome === 'response500') await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, source: 'server', status: 500, code: 'INTERNAL_ERROR', message: 'AV3 post-commit response loss', retryAfter: null }) });
            else await route.fulfill({ response });
          } catch (error) { committed.reject(error); throw error; }
        });
        const selector = { like:'#folderLike', follow:'#folderFollow', clone:'#folderClone', report:'#folderReportSubmit' }[op];
        if (op === 'report') {
          await who.page.locator('#folderReportBtn').click();
          await who.page.locator('#folderReportReason').selectOption('other');
          await who.page.locator('#folderReportDetail').fill('AV3 local race');
        }
        await who.page.locator(selector).click();
        await committed.promise;
        if (transition === 'otherAccount') {
          const targetSession = session(otherRole);
          await who.page.evaluate(async s => {
            const { error } = await window.ULAuth.getClient().auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
            if (error) throw new Error(error.message);
          }, targetSession);
          await expect.poll(() => who.page.evaluate(() => window.ULAuth.getMe()?.id)).toBe(otherIdentity);
          await who.page.locator(`[data-folder-id="${alternate}"]`).first().click();
        } else {
          await who.page.locator('#folderClose').click();
          await who.page.locator(`[data-folder-id="${transition === 'reopen' ? target : alternate}"]`).first().click();
        }
        await expect(who.page.locator('#folderSheetTitle')).toBeVisible();
        const snapshot = () => who.page.locator('#folderSheet').evaluate(el => ({ title: el.querySelector('#folderSheetTitle')?.textContent, like: el.querySelector('#folderLike')?.getAttribute('aria-checked'), follow: el.querySelector('#folderFollow')?.getAttribute('aria-checked'), ok: el.querySelector('#folderSheetOk')?.textContent || '', error: el.querySelector('#folderSheetAlert')?.textContent || '' }));
        const before = await snapshot();
        const delivered = who.page.waitForResponse(r => new URL(r.url()).pathname === endpoint && r.request().method() === method);
        release.resolve(); await delivered;
        // Event loop paint barrier lets promise callbacks and React state commits run without a sleep.
        await who.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        assert.deepEqual(await snapshot(), before);
        result.cases.push({ sourceRole, op, outcome, transition, status: 'pass' });
        console.log(`PASS ${sourceRole} ${op} ${outcome} ${transition}`);
        if (cloneCategory) {
          // The original sender owns this post-commit clone even after switching browser identity.
          const cleanup = await actor(browser, sourceRole);
          await api(cleanup, 'DELETE', `/api/v1/categories/${cloneCategory}`);
          await cleanup.context.close();
        }
      } catch (error) {
        release.resolve();
        result.cases.push({ sourceRole, op, outcome, transition, status: 'fail', error: error.message });
        await shot(who, 'race-failure');
        throw error;
      } finally {
        fs.writeFileSync(path.join(DIR, 'races.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
        await who.context.close();
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
