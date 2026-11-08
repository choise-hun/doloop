'use strict';
const { fs, path, assert, DIR, rows, literal } = require('./support.cjs');
const auth = JSON.parse(JSON.parse(fs.readFileSync(path.join(DIR, 'auth-A.json'))).origins[0].localStorage.find(x => x.name === 'ulp:auth').value);
const report = { startedAt: new Date().toISOString(), input: { video: 'dQw4w9WgXcQ', startSec: 10, endSec: 20 }, maxJobs: 1 };
async function request(method, route, body) {
  const r = await fetch('http://127.0.0.1:3105/api/v1' + route, { method, headers: { Authorization: `Bearer ${auth.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  return { status: r.status, body: await r.json() };
}
(async () => {
  try {
    const me = await request('GET', '/me'); assert.equal(me.status, 200);
    const uid = me.body.id;
    const before = rows(`SELECT monthly_credits,purchased_credits FROM profiles WHERE id=${literal(uid)}`)[0];
    const created = await request('POST', '/notes/analyze', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', tags: ['화성'], startSec: 10, endSec: 20 });
    report.requestStatus = created.status;
    if (created.status !== 202) {
      report.status = 'blocked'; report.code = created.body.code; process.exitCode = 1;
      assert.deepEqual(rows(`SELECT monthly_credits,purchased_credits FROM profiles WHERE id=${literal(uid)}`)[0], before);
      return;
    }
    const jobId = created.body.jobId;
    report.reservedCredits = created.body.reservedCredits;
    console.log('GEMINI_JOB_ACCEPTED one 10-second input, polling final result');
    const deadline = Date.now() + 15 * 60 * 1000;
    let job;
    while (Date.now() < deadline) {
      const response = await request('GET', `/notes/jobs/${jobId}`); assert.equal(response.status, 200);
      job = response.body.job || response.body;
      if (['done','failed'].includes(job.status)) break;
      // Bounded async job polling, not a browser timing assertion.
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.ok(['done','failed'].includes(job?.status), 'Gemini job did not reach a terminal state');
    report.jobStatus = job.status; report.chargedCredits = job.chargedCredits;
    report.providerError = job.error;
    const after = rows(`SELECT monthly_credits,purchased_credits FROM profiles WHERE id=${literal(uid)}`)[0];
    const sums = rows(`SELECT bucket,sum(delta)::int AS total FROM credit_ledger WHERE user_id=${literal(uid)} GROUP BY bucket`);
    assert.equal(after.monthly_credits, sums.find(r => r.bucket === 'monthly')?.total || 0);
    assert.equal(after.purchased_credits, sums.find(r => r.bucket === 'purchased')?.total || 0);
    if (job.status === 'failed') {
      assert.equal(job.chargedCredits, 0); assert.deepEqual(after, before);
      report.status = 'external-failure-refund-pass'; process.exitCode = 1;
    } else {
      assert.ok(job.noteId); assert.ok(Number.isInteger(job.chargedCredits));
      assert.equal(before.monthly_credits + before.purchased_credits - after.monthly_credits - after.purchased_credits, job.chargedCredits);
      assert.equal((await request('GET', `/notes/${job.noteId}`)).status, 200);
      report.status = 'pass';
      report.promptTokens = job.promptTokens; report.outputTokens = job.outputTokens; report.thoughtsTokens = job.thoughtsTokens;
    }
    report.ledgerMatchesBalance = true;
    report.limitation = 'Internal credits verified; supplier billing dashboard not inspected';
  } finally {
    fs.writeFileSync(path.join(DIR, 'gemini-live.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(report));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
