'use strict';
const { fs, path, assert, DIR, BASE, rows, snapshot } = require('./support.cjs');
(async () => {
  const before = snapshot();
  const root = await fetch(BASE + '/'); assert.equal(root.status, 200);
  const html = await root.text(); assert.ok(html.includes('id="root"'));
  const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  assert.equal((await fetch(BASE + asset)).status, 200);
  assert.deepEqual(await (await fetch(BASE + '/api/health')).json(), { ok: true });
  for (const route of ['/api/v1/me', '/api/v1/curation/home', '/api/v1/community/folders']) {
    const response = await fetch(BASE + route); assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'UNAUTHORIZED');
  }
  assert.deepEqual(snapshot(), before);
  const migrations = rows('SELECT version,success FROM flyway_schema_history WHERE version IS NOT NULL ORDER BY installed_rank');
  assert.equal(migrations.at(-1).version, '9'); assert.ok(migrations.every(m => m.success));
  const result = { status: 'pass', time: new Date().toISOString(), checks: ['Ktor SPA', 'JS asset', 'health', '3 unauthenticated 401s', 'DB full snapshot unchanged', 'Flyway V9'] };
  fs.writeFileSync(path.join(DIR, 'preflight.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(result));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
