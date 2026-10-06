import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import worker, { cleanup } from '../src/worker.ts';
import { postId } from '../src/post-verification.ts';
import { bank, createQuestions, topics } from '../src/content.ts';

let mf, db, directory;
const emulator = () => new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("test"); } };', d1Databases: ['DB'], resourcePersistencePath: directory, compatibilityDate: '2026-10-04' }));
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'bcl-tests-'));
  mf = emulator();
  db = await mf.getD1Database('DB');
  const migrations = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).filter(n => n.endsWith('.sql')).sort()) {
    const migration = await readFile(new URL(name, migrations), 'utf8');
    await db.batch(migration.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  }
});
after(async () => { await mf?.dispose(); if (directory) await rm(directory, { recursive: true, force: true }); });
const origin = 'https://bureau.test';
let address = 1;
function client() {
  const cookie = `__Host-bcl=${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
  const ip = `192.0.2.${address++}`;
  return { cookie, ip };
}
async function call(path, { person = client(), method = 'GET', data, headers = {}, env } = {}) {
  return worker.fetch(new Request(origin + path, { method, headers: { Cookie: person.cookie, Origin: origin, 'CF-Connecting-IP': person.ip, 'Content-Type': 'application/json', ...headers }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }), env ?? { DB: db, ASSETS: { fetch: () => new Response('asset') } });
}
async function start(person, requestId = crypto.randomUUID()) {
  const response = await call('/api/attempts', { person, method: 'POST', data: { requestId } });
  assert.ok(response.ok, await response.clone().text());
  return response.json();
}
async function answerMap(id, correct = 15) {
  const row = await db.prepare('SELECT questions FROM attempts WHERE id = ?').bind(id).first();
  return Object.fromEntries(JSON.parse(row.questions).map((q, i) => [q.id, q.options.find(o => o.correct === (i < correct)).id]));
}
async function grade(person, attempt, correct = 15) {
  return call(`/api/attempts/${attempt.id}/submit`, { person, method: 'POST', data: { answers: await answerMap(attempt.id, correct) } });
}

test('bank balances all 15 examined topics and every item has a source and four distinct choices', () => {
  assert.equal(bank.length, 30);
  assert.equal(new Set(bank.map(q => q.topic)).size, 15);
  for (const item of bank) {
    assert.equal(item.answers.length, 4);
    assert.equal(new Set(item.answers).size, 4);
    assert.ok(topics.find(t => t.id === item.topic)?.sources.length);
  }
  const selections = Array.from({ length: 20 }, createQuestions);
  for (const questions of selections) {
    assert.equal(questions.length, 15);
    assert.equal(new Set(questions.map(q => q.topic)).size, 15);
    assert.ok(questions.every(q => q.options.filter(o => o.correct).length === 1));
  }
  assert.ok(new Set(selections.flat().map(q => q.prompt)).size >= 24);
  assert.ok(new Set(selections.flat().map(q => q.options.findIndex(o => o.correct))).size > 1);
});

test('examination establishes a secure, private browser capability', async () => {
  const response = await call('/exam', { headers: { Cookie: '' } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Set-Cookie'), /^__Host-bcl=[0-9a-f]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=31536000; Secure$/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
});

test('unsubmitted payload has no answer keys, explanations, or owner credential; reload resumes it', async () => {
  const person = client();
  const attempt = await start(person);
  assert.equal(attempt.questions.length, 15);
  assert.equal(attempt.result, null);
  for (const q of attempt.questions) {
    assert.deepEqual(Object.keys(q).sort(), ['id', 'options', 'prompt']);
    for (const option of q.options) assert.deepEqual(Object.keys(option).sort(), ['id', 'text']);
  }
  const restored = await (await call('/api/attempt', { person })).json();
  assert.deepEqual(restored.attempt, attempt);
});

test('12 passes, duplicate concurrent grades mint one persistent license, and scores stay private', async () => {
  const person = client();
  const attempt = await start(person);
  const answers = await answerMap(attempt.id, 12);
  const responses = await Promise.all(Array.from({ length: 6 }, () => call(`/api/attempts/${attempt.id}/submit`, { person, method: 'POST', data: { answers } })));
  const results = await Promise.all(responses.map(r => r.json()));
  assert.ok(results.every(r => r.passed && r.score === 12 && r.licenseId === results[0].licenseId));
  const { count } = await db.prepare('SELECT count(*) AS count FROM licenses WHERE attempt_id = ?').bind(attempt.id).first();
  assert.equal(count, 1);
  const license = await (await call(`/api/licenses/${results[0].licenseId}`, { headers: { Cookie: '' } })).json();
  assert.deepEqual(Object.keys(license).sort(), ['handle', 'id', 'issuedAt', 'verificationPostId', 'version', 'xUserId', 'xVerifiedAt']);
  assert.equal(license.handle, null);
  const resumed = await (await call('/api/attempt', { person })).json();
  assert.deepEqual(resumed.attempt.result, results[0]);
  const publicPage = await (await call(`/license/${license.id}`)).text();
  assert.match(publicPage, /Issuance verified/);
  assert.match(publicPage, /property="og:title"/);
  assert.doesNotMatch(publicPage, /12 of 15|owner_hash/);
});

test('11 fails; forged pass flags cannot issue, repeated changed answers cannot overturn grading, retry is new', async () => {
  const person = client();
  const attempt = await start(person);
  const response = await call(`/api/attempts/${attempt.id}/submit`, { person, method: 'POST', data: { answers: await answerMap(attempt.id, 11), passed: true, score: 15 } });
  const result = await response.json();
  assert.equal(result.passed, false);
  assert.equal(result.licenseId, null);
  assert.equal(result.score, 11);
  assert.equal(result.review.length, 15);
  assert.ok(result.review.every(r => r.sources.length && r.explanation && r.correct));
  assert.deepEqual(await (await grade(person, attempt)).json(), result);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM licenses WHERE attempt_id = ?').bind(attempt.id).first()).n, 0);
  const retry = await start(person);
  assert.notEqual(retry.id, attempt.id);
  assert.equal((await (await grade(person, retry)).json()).passed, true);
});

test('concurrent disagreeing submissions preserve exactly one authoritative determination', async () => {
  const person = client();
  const attempt = await start(person);
  const responses = await Promise.all([grade(person, attempt, 0), grade(person, attempt, 15)]);
  const results = await Promise.all(responses.map(r => r.json()));
  assert.deepEqual(results[0], results[1]);
  const count = (await db.prepare('SELECT count(*) AS n FROM licenses WHERE attempt_id = ?').bind(attempt.id).first()).n;
  assert.equal(count, results[0].passed ? 1 : 0);
});

test('duplicate starts, even after completion, are idempotent', async () => {
  const person = client();
  const requestId = crypto.randomUUID();
  const attempts = await Promise.all([start(person, requestId), start(person, requestId), start(person)]);
  assert.ok(attempts.every(a => a.id === attempts[0].id));
  await grade(person, attempts[0]);
  const recovered = await start(person, attempts[0].id);
  assert.equal(recovered.id, attempts[0].id);
  assert.ok(recovered.result.passed);
});

test('legacy handles stay unverified; only the owner may remove them and self-declarations never imply verification', async () => {
  const alice = client(), bob = client();
  const first = await start(alice);
  const { licenseId: id } = await (await grade(alice, first)).json();
  // An existing record from before the migration is never implicitly verified.
  await db.prepare('UPDATE licenses SET handle = ? WHERE id = ?').bind('Legacy_handle', id).run();
  assert.equal((await call(`/api/licenses/${id}`, { person: bob, method: 'PATCH', data: { handle: '' } })).status, 403);
  assert.equal((await call(`/api/attempts/${first.id}/submit`, { person: bob, method: 'POST', data: { answers: {} } })).status, 404);
  assert.equal((await call(`/api/licenses/${id}`, { person: alice, method: 'PATCH', data: { handle: 'Legacy_handle' } })).status, 200);
  const legacy = await (await call(`/api/licenses/${id}`)).json();
  assert.equal(legacy.handle, 'Legacy_handle');
  assert.equal(legacy.xVerifiedAt, null);
  assert.equal(legacy.xUserId, null);
  const svg = await (await call(`/license/${id}/certificate.svg`)).text();
  assert.match(svg, /@Legacy_handle/);
  assert.match(svg, /SELF-DECLARED · NOT X-VERIFIED/);
  assert.ok(svg.includes(`${origin}/license/${id}`));
  assert.equal((await (await call(`/api/licenses/${id}/editor`, { person: bob })).json()).canEdit, false);
  assert.deepEqual(await (await call(`/api/licenses/${id}/editor`, { person: alice })).json(), { canEdit: true, postAvailable: false, challenge: null });
  const removed = await (await call(`/api/licenses/${id}`, { person: alice, method: 'PATCH', data: { handle: '' } })).json();
  assert.equal(removed.handle, null);
});

test('incomplete and foreign answers, cross-origin writes, missing session, and oversized JSON are rejected', async () => {
  const person = client();
  const attempt = await start(person);
  assert.equal((await call(`/api/attempts/${attempt.id}/submit`, { person, method: 'POST', data: { passed: true } })).status, 400);
  const answers = await answerMap(attempt.id);
  answers[attempt.questions[0].id] = crypto.randomUUID();
  assert.equal((await call(`/api/attempts/${attempt.id}/submit`, { person, method: 'POST', data: { answers } })).status, 400);
  assert.equal((await call('/api/attempts', { person, method: 'POST', data: {}, headers: { Origin: 'https://elsewhere.test' } })).status, 403);
  assert.equal((await call('/api/attempts', { method: 'POST', data: {}, headers: { Cookie: '' } })).status, 401);
  assert.equal((await call('/api/attempts', { person, method: 'POST', data: { value: 'a'.repeat(17000) } })).status, 413);
  assert.equal((await call('/api/attempts', { person, method: 'POST', data: {}, headers: { 'Content-Type': 'text/plain' } })).status, 415);
});

test('a D1 insert failure rolls back grading, allowing a safe retry', async () => {
  const person = client();
  const attempt = await start(person);
  await db.prepare("CREATE TRIGGER fail_issuance BEFORE INSERT ON licenses BEGIN SELECT RAISE(ABORT, 'test storage failure'); END").run();
  try {
    const failed = await grade(person, attempt);
    assert.equal(failed.status, 503);
    assert.equal((await db.prepare('SELECT result FROM attempts WHERE id = ?').bind(attempt.id).first()).result, null);
  } finally { await db.prepare('DROP TRIGGER fail_issuance').run(); }
  assert.equal((await (await grade(person, attempt)).json()).passed, true);
});

test('cleanup deletes temporary attempts and expired limits without deleting issued records or edit access', async () => {
  const person = client();
  const attempt = await start(person);
  const result = await (await grade(person, attempt)).json();
  const pending = await start(client());
  await db.prepare('UPDATE attempts SET touched_at = 0 WHERE id IN (?, ?)').bind(attempt.id, pending.id).run();
  await db.prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES ('expired-test', 1, 0)").run();
  await cleanup(db);
  assert.equal(await db.prepare('SELECT id FROM attempts WHERE id = ?').bind(attempt.id).first(), null);
  assert.equal(await db.prepare('SELECT id FROM attempts WHERE id = ?').bind(pending.id).first(), null);
  assert.equal(await db.prepare("SELECT key FROM rate_limits WHERE key = 'expired-test'").first(), null);
  assert.equal((await call(`/license/${result.licenseId}`)).status, 200);
  const state = await (await call('/api/attempt', { person })).json();
  assert.equal(state.attempt, null);
  assert.equal(state.recentLicense.id, result.licenseId);
  assert.equal((await call(`/api/licenses/${result.licenseId}`, { person, method: 'PATCH', data: { handle: '' } })).status, 200);
});

test('missing records return 404; storage failures return retryable errors without exposing internals', async () => {
  assert.equal((await call(`/license/${crypto.randomUUID()}`)).status, 404);
  assert.equal((await call('/license/not-an-id')).status, 404);
  const response = await call('/api/attempt', { env: { DB: { prepare() { throw new Error('private database details'); } } } });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private database details/);
});

test('request limit is bounded and returns Retry-After', async () => {
  const person = client();
  const stamp = Math.floor(Date.now() / 1000);
  const value = `${Math.floor(stamp / 86400)}:${person.ip}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const hash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
  await db.prepare('INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 120, ?)').bind(`write:${hash}:${Math.floor(stamp / 600)}`, stamp + 600).run();
  const response = await call('/api/attempts', { person, method: 'POST', data: { requestId: crypto.randomUUID() } });
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('Retry-After')) > 0);
});

test('attempt snapshots retain their pass threshold across subsequent exam changes', async () => {
  const person = client();
  const attempt = await start(person);
  await db.prepare('UPDATE attempts SET pass_mark = 13, version = ? WHERE id = ?').bind('snapshot-test', attempt.id).run();
  const restored = await (await call('/api/attempt', { person })).json();
  assert.equal(restored.attempt.passMark, 13);
  const result = await (await grade(person, attempt, 12)).json();
  assert.equal(result.passed, false);
  assert.equal(result.passMark, 13);
});

test('issued records and edit ownership survive an actual local database runtime restart', async () => {
  const person = client();
  const attempt = await start(person);
  const result = await (await grade(person, attempt)).json();
  await mf.dispose();
  mf = emulator();
  db = await mf.getD1Database('DB');
  assert.equal((await call(`/license/${result.licenseId}`)).status, 200);
  const restored = await (await call('/api/attempt', { person })).json();
  assert.equal(restored.attempt.result.licenseId, result.licenseId);
  assert.equal((await call(`/api/licenses/${result.licenseId}`, { person, method: 'PATCH', data: { handle: '' } })).status, 200);
});

test('production license URLs and SVG preserve the issued record on the chosen origin', async () => {
  const person = client();
  const attempt = await start(person);
  const result = await (await grade(person, attempt)).json();
  const publicOrigin = 'https://consciousnesslicense.com';
  const url = `${publicOrigin}/license/${result.licenseId}`;
  // Old examination data can expire without breaking a permanent public record.
  await db.prepare('DELETE FROM attempts WHERE id = ?').bind(attempt.id).run();
  const page = await worker.fetch(new Request(url), { DB: db });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
  assert.ok(html.includes(`readonly value="${url}"`));
  const image = await worker.fetch(new Request(`${url}/certificate.svg`), { DB: db });
  assert.equal(image.status, 200);
  assert.match(image.headers.get('Content-Type'), /image\/svg\+xml/);
  const svg = await image.text();
  assert.match(svg, /width="1600" height="1600"/);
  assert.ok(svg.includes(`href="${publicOrigin}/"`));
  assert.ok(svg.includes(`href="${url}"`));
  assert.ok(svg.includes(url));
  assert.match(svg, /consciousnesslicense\.com<\/text>/);
  assert.doesNotMatch(svg, /localhost|127\.0\.0\.1|bureau\.test/);
});

const postEnv = () => ({ DB: db, X_BEARER_TOKEN: 'test-app-token', X_DAILY_LOOKUP_LIMIT: '10000' });
async function issued(person) { return (await (await grade(person, await start(person))).json()).licenseId; }
async function prepare(person, id, handle = 'ProofUser') {
  const response = await call(`/api/licenses/${id}/post-challenge`, { person, method: 'POST', data: { handle }, env: postEnv() });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
async function verify(person, id, challenge, post = '1234567890', env = postEnv()) {
  return call(`/api/licenses/${id}/verify-post`, { person, method: 'POST', data: { nonce: challenge.nonce, url: `https://x.com/arbitrary/status/${post}` }, env });
}
function proofResponse(challenge, id, options = {}) {
  return { data: { id: options.postId ?? '1234567890', author_id: options.authorId ?? '777',
    created_at: new Date((challenge.expiresAt - 1800 + 1) * 1000).toISOString(),
    text: challenge.text.replace(`${origin}/license/${id}`, 'https://t.co/example'),
    entities: { urls: [{ expanded_url: `${origin}/license/${id}` }] }, ...options.data },
    includes: { users: [{ id: options.authorId ?? '777', username: challenge.handle, protected: false, ...options.user }] } };
}

test('post URLs accept normal X links but reject arbitrary hosts, credentials, paths, and fake IDs', () => {
  for (const url of ['https://x.com/name/status/123?s=20', 'https://twitter.com/name/status/123', 'https://x.com/i/web/status/123', 'https://x.com/name/status/123/photo/1']) assert.equal(postId(url), '123');
  for (const url of ['https://x.com.evil.test/name/status/123','http://x.com/name/status/123','https://x.com@evil.test/name/status/123','https://user@x.com/name/status/123','https://x.com/name/status/0','https://x.com/name/status/123/anything','https://localhost/123']) assert.equal(postId(url), null);
});

test('post preparation is private, owner-only, origin guarded, expiring, and replaces the internal request without changing the public post', async () => {
  const person = client(), id = await issued(person);
  const path = `/api/licenses/${id}/post-challenge`, opts = { person, method: 'POST', data: { handle: 'ProofUser' }, env: postEnv() };
  assert.equal((await call(path, { ...opts, person: client() })).status, 403);
  assert.equal((await call(path, { ...opts, headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await call(path, { ...opts, env: { DB: db } })).status, 503);
  const first = await prepare(person, id), second = await prepare(person, id);
  assert.notEqual(first.nonce, second.nonce);
  assert.equal(second.text, `I have earned my Consciousness License.\n${origin}/license/${id}`);
  assert.equal(first.text, second.text);
  assert.ok(!second.text.includes(second.nonce));
  assert.ok(second.text.includes(`${origin}/license/${id}`));
  const visitor = await (await call(`/api/licenses/${id}/editor`, { env: postEnv() })).json();
  assert.equal(visitor.challenge, null);
  const ownerView = await (await call(`/api/licenses/${id}/editor`, { person, env: postEnv() })).json();
  assert.equal(ownerView.challenge.nonce, second.nonce);
  assert.doesNotMatch(await (await call(`/license/${id}`)).text(), new RegExp(second.nonce));
  assert.equal((await verify(person, id, first)).status, 400);
  await db.prepare('UPDATE post_challenges SET expires_at = 0 WHERE license_id = ?').bind(id).run();
  assert.equal((await verify(person, id, second)).status, 400);
  await cleanup(db);
  assert.equal(await db.prepare('SELECT license_id FROM post_challenges WHERE license_id = ?').bind(id).first(), null);
});

test('one submitted post verifies the account and concurrent or repeated submissions do not pay twice', async t => {
  const person = client(), id = await issued(person);
  await call(`/api/licenses/${id}`, { person, method: 'PATCH', data: { handle: 'ProofUser' } });
  const before = await call(`/license/${id}`);
  assert.match(await before.text(), /SELF-DECLARED · NOT X-VERIFIED/);
  const challenge = await prepare(person, id);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++;
    assert.equal(new URL(url).origin, 'https://api.x.com');
    assert.equal(new URL(url).pathname, '/2/tweets/1234567890');
    assert.equal(init.headers.Authorization, 'Bearer test-app-token');
    assert.equal(init.redirect, 'manual');
    await new Promise(resolve => setTimeout(resolve, 40));
    return Response.json(proofResponse(challenge, id));
  });
  const replies = await Promise.all([verify(person, id, challenge), verify(person, id, challenge)]);
  assert.ok(replies.some(reply => reply.status === 200));
  assert.ok(replies.every(reply => [200,409].includes(reply.status)));
  assert.equal(calls, 1);
  assert.equal((await verify(person, id, challenge)).status, 200);
  assert.equal(calls, 1);
  const license = await (await call(`/api/licenses/${id}`)).json();
  assert.equal(license.handle, 'ProofUser');
  assert.equal(license.xUserId, '777');
  assert.equal(license.verificationPostId, '1234567890');
  assert.ok(license.xVerifiedAt);
  const html = await (await call(`/license/${id}`)).text();
  assert.match(html, /X ACCOUNT VERIFIED/);
  assert.ok(html.includes(`readonly value="${origin}/license/${id}"`));
  const svg = await (await call(`/license/${id}/certificate.svg`)).text();
  assert.match(svg, /X ACCOUNT VERIFIED/);
  assert.ok(svg.includes(`${origin}/license/${id}`));
  assert.ok(html.includes('https://x.com/i/status/1234567890'));
  assert.doesNotMatch(html, /test-app-token/);
  assert.equal((await call('/auth/x/callback?code=fake&state=fake')).status, 404);
  assert.equal((await call(`/api/licenses/${id}/verify-x`, { person, method: 'POST', data: {} })).status, 404);
});

test('wrong author, old post, missing ownership statement, wrong URL, retweet, and protected account cannot verify', async t => {
  for (const mode of ['author','old','future','statement','url','retweet','protected']) {
    const person = client(), id = await issued(person), challenge = await prepare(person, id);
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      const response = proofResponse(challenge, id);
      if (mode === 'author') response.includes.users[0].username = 'Impostor';
      if (mode === 'old') response.data.created_at = '2000-01-01T00:00:00Z';
      if (mode === 'future') response.data.created_at = new Date((challenge.expiresAt + 100) * 1000).toISOString();
      if (mode === 'statement') response.data.text = response.data.text.replace('I have earned my Consciousness License.', 'Look at this license.');
      if (mode === 'url') response.data.entities.urls[0].expanded_url += '/different';
      if (mode === 'retweet') response.data.referenced_tweets = [{ type: 'retweeted', id: '999' }];
      if (mode === 'protected') response.includes.users[0].protected = true;
      return Response.json(response);
    });
    assert.equal((await verify(person, id, challenge)).status, 400, mode);
    assert.equal((await (await call(`/api/licenses/${id}`)).json()).xVerifiedAt, null);
    if (!['retweet','protected'].includes(mode)) {
      assert.equal((await verify(person, id, challenge)).status, 400);
      assert.equal(calls, 1, 'Invalid proof should be cached');
    }
    t.mock.restoreAll();
  }
});

test('removal or a new challenge during a lookup invalidates the old proof', async t => {
  for (const change of ['remove','replace']) {
    const person = client(), id = await issued(person), challenge = await prepare(person, id);
    t.mock.method(globalThis, 'fetch', async () => {
      if (change === 'remove') await call(`/api/licenses/${id}`, { person, method: 'PATCH', data: { handle: '' } });
      else await prepare(person, id);
      return Response.json(proofResponse(challenge, id));
    });
    assert.equal((await verify(person, id, challenge)).status, 409);
    assert.equal((await (await call(`/api/licenses/${id}`)).json()).xVerifiedAt, null);
    t.mock.restoreAll();
  }
});

test('previously verified identities survive migration, prevent transfers, and permit same-account refresh', async t => {
  const person = client(), id = await issued(person);
  await db.prepare('UPDATE licenses SET handle = ?, x_user_id = ?, x_verified_at = ? WHERE id = ?').bind('Original', '777', '2026-10-05T00:00:00Z', id).run();
  assert.match(await (await call(`/license/${id}`)).text(), /X ACCOUNT VERIFIED/);
  assert.equal((await call(`/api/licenses/${id}`, { person, method: 'PATCH', data: { handle: 'Invented' } })).status, 400);
  assert.equal((await call(`/api/licenses/${id}`, { person, method: 'PATCH', data: { handle: '' } })).status, 200);
  let challenge = await prepare(person, id, 'Renamed');
  t.mock.method(globalThis, 'fetch', async () => Response.json(proofResponse(challenge, id, { authorId: '888' })));
  assert.equal((await verify(person, id, challenge)).status, 400);
  assert.equal((await (await call(`/api/licenses/${id}`)).json()).xUserId, null);
  t.mock.restoreAll();
  challenge = await prepare(person, id, 'Renamed');
  t.mock.method(globalThis, 'fetch', async () => Response.json(proofResponse(challenge, id)));
  assert.equal((await verify(person, id, challenge)).status, 200);
  assert.equal((await (await call(`/api/licenses/${id}`)).json()).handle, 'Renamed');
});

test('daily paid-read cap rejects checks before network access; provider failures leave issuance untouched', async t => {
  const person = client(), id = await issued(person), challenge = await prepare(person, id);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('secret provider details', { status: 402 }); });
  assert.equal((await verify(person, id, challenge, '1234567890', { ...postEnv(), X_DAILY_LOOKUP_LIMIT: '0' })).status, 429);
  assert.equal(calls, 0);
  const response = await verify(person, id, challenge);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret provider details/);
  assert.equal(calls, 1);
  assert.equal((await (await call(`/api/licenses/${id}`)).json()).xVerifiedAt, null);
});

test('unauthorized and cross-origin verification submissions never call X', async t => {
  const person = client(), id = await issued(person), challenge = await prepare(person, id);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('must not call X'); });
  assert.equal((await verify(client(), id, challenge)).status, 403);
  assert.equal((await call(`/api/licenses/${id}/verify-post`, { person, method: 'POST', data: { nonce: challenge.nonce, url: 'https://x.com/name/status/123' }, env: postEnv(), headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal(calls, 0);
});

test('global paid-read reservation remains bounded under concurrent checks on different licenses', async t => {
  const alice = client(), bob = client();
  const first = await issued(alice), second = await issued(bob);
  const a = await prepare(alice, first), b = await prepare(bob, second);
  await db.prepare("DELETE FROM rate_limits WHERE key LIKE 'all-post-checks:%'").run();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(null, { status: 503 }); });
  const replies = await Promise.all([
    verify(alice, first, a, '1234567890', { ...postEnv(), X_DAILY_LOOKUP_LIMIT: '1' }),
    verify(bob, second, b, '1234567891', { ...postEnv(), X_DAILY_LOOKUP_LIMIT: '1' }),
  ]);
  assert.deepEqual(replies.map(r => r.status).sort(), [429,503]);
  assert.equal(calls, 1);
});
