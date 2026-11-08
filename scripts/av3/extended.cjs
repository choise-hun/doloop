'use strict';
const { fs, path, assert, chromium, expect, DIR, sql, rows, literal, actor, api, goto, shot, noWrite } = require('./support.cjs');
const report = { startedAt: new Date().toISOString(), results: [] };
async function step(name, fn) {
  try { report.results.push({ name, status: 'pass', evidence: await fn() }); console.log(`PASS ${name}`); }
  catch (error) { report.results.push({ name, status: 'fail', error: error.message }); throw error; }
  finally { fs.writeFileSync(path.join(DIR, 'extended.json'), JSON.stringify(report, null, 2), { mode: 0o600 }); }
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const A = await actor(browser, 'A'), B = await actor(browser, 'B'), O = await actor(browser, 'O');
    const f = JSON.parse(fs.readFileSync(path.join(DIR, 'fixture.json')));
    const share = `/api/v1/categories/${f.category}/share`;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    await step('J6b real practice consent/log/84-day privacy + browser LOG', async () => {
      await api(A, 'POST', '/api/v1/practice/save', { songId: f.songs[0], pos: 12, date: today, addSeconds: 120, addLoops: 2 });
      await api(A, 'PATCH', '/api/v1/me', { sharePracticeLog: true });
      let logs = await api(B, 'GET', '/api/v1/community/logs?scope=all');
      const entry = logs.logs.find(l => l.user.id === A.id);
      assert.ok(entry); assert.equal(entry.days.at(-1).seconds, 120);
      assert.equal(JSON.stringify(logs).includes('A_PRIVATE'), false);
      await goto(B, '/log.html#community'); await B.page.locator('#chipLog').click();
      await expect(B.page.locator(`[data-user-id="${A.id}"]`)).toBeVisible();
      await shot(B, 'J6b-real-practice-log');
      await api(A, 'PATCH', '/api/v1/me', { sharePracticeLog: false });
      logs = await api(B, 'GET', '/api/v1/community/logs?scope=all');
      assert.equal(logs.logs.some(l => l.user.id === A.id), false);
      return { consentOnVisible: true, consentOffHidden: true, privateTextHidden: true, seconds: 120 };
    });
    await step('J7 real-account grace boundary fixture / cleanup / resubscription', async () => {
      await api(A, 'PATCH', '/api/v1/me', { shareAutosync: true });
      await api(A, 'PUT', share, { isPublic: true, autoSync: true });
      await api(O, 'PUT', `/api/v1/admin/users/${A.id}/tier-override`, { tier: 'free', until: null, reason: 'AV3 grace before boundary' });
      assert.equal((await api(A, 'GET', '/api/v1/me')).tier, 'pro');
      assert.equal((await api(A, 'GET', share)).share.isPublic, true);
      const purchased = rows(`SELECT purchased_credits FROM profiles WHERE id=${literal(A.id)}`)[0].purchased_credits;
      // Only the labelled disposable DB. This is a time fixture, not an actual 30-day wait/cron.
      sql(`UPDATE profiles SET credit_cycle_next_at=now()-interval '1 second' WHERE id=${literal(A.id)};`);
      assert.equal((await api(A, 'GET', '/api/v1/me')).tier, 'free');
      await api(B, 'GET', `/api/v1/community/folders/${f.folder}`, undefined, 404);
      // The existing management contract processes a due cycle before applying its override.
      await api(O, 'PUT', `/api/v1/admin/users/${A.id}/tier-override`, { tier: 'free', until: null, reason: 'AV3 process due cycle fixture' });
      let state = (await api(A, 'GET', share)).share;
      assert.equal(state.isPublic, false); assert.equal(state.autoSync, false);
      let balance = rows(`SELECT monthly_credits,purchased_credits FROM profiles WHERE id=${literal(A.id)}`)[0];
      assert.equal(balance.monthly_credits, 0); assert.equal(balance.purchased_credits, purchased);
      await api(O, 'PUT', `/api/v1/admin/users/${A.id}/tier-override`, { tier: 'pro', until: null, reason: 'AV3 resubscription fixture' });
      state = (await api(A, 'GET', share)).share;
      assert.equal(state.isPublic, false); assert.equal(state.autoSync, false);
      balance = rows(`SELECT monthly_credits,purchased_credits FROM profiles WHERE id=${literal(A.id)}`)[0];
      const sum = rows(`SELECT bucket,sum(delta)::int AS total FROM credit_ledger WHERE user_id=${literal(A.id)} GROUP BY bucket`);
      assert.equal(balance.monthly_credits, sum.find(r => r.bucket === 'monthly').total);
      assert.equal(balance.purchased_credits, sum.find(r => r.bucket === 'purchased')?.total || 0);
      await api(A, 'PUT', share, { isPublic: true });
      return { graceRetainsPro: true, expiredFree: true, cleanup: true, noAutoRepublish: true, ledgerMatchesBalance: true, limitation: 'isolated date fixture + admin API, not production cron/OIDC or real 30-day passage' };
    });
    await step('J8 Gemini missing-key rejection has no job/ledger/domain mutation', async () => {
      const r = await noWrite(() => api(A, 'POST', '/api/v1/notes/analyze', { url: `https://www.youtube.com/watch?v=${f.videos[0]}`, tags: ['화성'], startSec: 10, endSec: 20 }, 503));
      assert.equal(r.code, 'GEMINI_UNAVAILABLE');
      return { status: 503, code: r.code, snapshotUnchanged: true, liveAnalysis: 'blocked: SYSTEM_GEMINI_API_KEY not configured' };
    });
    await step('J3b category quota rejects clone without any domain row changes', async () => {
      const me = await api(B, 'GET', '/api/v1/me');
      let cats = (await api(B, 'GET', '/api/v1/categories')).categories;
      while (cats.length < me.limits.categories) {
        await api(B, 'POST', '/api/v1/categories', { name: `AV3 한도 ${cats.length}` }, 201);
        cats = (await api(B, 'GET', '/api/v1/categories')).categories;
      }
      assert.equal(cats.length, me.limits.categories);
      const result = await noWrite(() => api(B, 'POST', `/api/v1/community/folders/${f.folder}/clone`, undefined, 403));
      assert.equal(result.code, 'CATEGORY_LIMIT_EXCEEDED');
      // Restore only disposable filler categories so later browser clone race tests have room.
      for (const cat of cats.filter(c => c.name.startsWith('AV3 한도 '))) await api(B, 'DELETE', `/api/v1/categories/${cat.id}`);
      return { categoryLimit: me.limits.categories, code: result.code, snapshotUnchanged: true };
    });
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
