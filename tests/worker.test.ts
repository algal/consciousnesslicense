import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import worker, { cleanup } from '../src/worker.ts';
import { pkceChallenge } from '../src/x-auth.ts';
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
  assert.match(response.headers.get('Set-Cookie'), /^__Host-bcl=[0-9a-f]{64}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=31536000; Secure$/);
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
  assert.deepEqual(Object.keys(license).sort(), ['handle', 'id', 'issuedAt', 'version', 'xUserId', 'xVerifiedAt']);
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

test('legacy handles stay unverified; only the owner may remove them and new handles require X', async () => {
  const alice = client(), bob = client();
  const first = await start(alice);
  const { licenseId: id } = await (await grade(alice, first)).json();
  // An existing record from before the migration is never implicitly verified.
  await db.prepare('UPDATE licenses SET handle = ? WHERE id = ?').bind('Legacy_handle', id).run();
  assert.equal((await call(`/api/licenses/${id}`, { person: bob, method: 'PATCH', data: { handle: '' } })).status, 403);
  assert.equal((await call(`/api/attempts/${first.id}/submit`, { person: bob, method: 'POST', data: { answers: {} } })).status, 404);
  assert.equal((await call(`/api/licenses/${id}`, { person: alice, method: 'PATCH', data: { handle: 'Invented' } })).status, 400);
  const legacy = await (await call(`/api/licenses/${id}`)).json();
  assert.equal(legacy.handle, 'Legacy_handle');
  assert.equal(legacy.xVerifiedAt, null);
  assert.equal(legacy.xUserId, null);
  const svg = await (await call(`/license/${id}/certificate.svg`)).text();
  assert.match(svg, /@Legacy_handle/);
  assert.match(svg, /SELF-DECLARED · NOT X-VERIFIED/);
  assert.ok(svg.includes(`${origin}/license/${id}`));
  assert.equal((await (await call(`/api/licenses/${id}/editor`, { person: bob })).json()).canEdit, false);
  assert.deepEqual(await (await call(`/api/licenses/${id}/editor`, { person: alice })).json(), { canEdit: true, xAvailable: false });
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

const xEnv = () => ({ DB: db, X_CLIENT_ID: 'test-client', X_CLIENT_SECRET: 'test-secret', X_CALLBACK_URL: `${origin}/auth/x/callback` });
async function issued(person) {
  return (await (await grade(person, await start(person))).json()).licenseId;
}
async function beginX(person, id) {
  const response = await call(`/api/licenses/${id}/verify-x`, { person, method: 'POST', data: {}, env: xEnv() });
  assert.equal(response.status, 200, await response.clone().text());
  assert.match(response.headers.get('Set-Cookie'), /SameSite=Lax/);
  return new URL((await response.json()).url);
}
function finishX(person, auth, extra = 'code=test-code', options = {}) {
  return call(`/auth/x/callback?state=${auth.searchParams.get('state')}&${extra}`, { person, env: xEnv(), ...options });
}
function mockX(t, username = 'Verified_User', id = '12345678') {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    if (url === 'https://api.x.com/2/oauth2/revoke') return Response.json({ revoked: true });
    if (url === 'https://api.x.com/2/oauth2/token') return Response.json({ access_token: 'temporary-test-token', token_type: 'bearer' });
    assert.equal(url, 'https://api.x.com/2/users/me');
    return Response.json({ data: { id, username } });
  });
  return calls;
}

test('PKCE matches the RFC 7636 S256 test vector', async () => {
  assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('X starts require owner, same origin, configured callback and credentials', async () => {
  const person = client(), id = await issued(person);
  const path = `/api/licenses/${id}/verify-x`;
  const options = { person, method: 'POST', data: {}, env: xEnv() };
  assert.equal((await call(path, { ...options, person: client() })).status, 403);
  assert.equal((await call(path, { ...options, headers: { Origin: 'https://attacker.test' } })).status, 403);
  assert.equal((await call(path, { ...options, env: { DB: db } })).status, 503);
  assert.equal((await call(path, { ...options, env: { ...xEnv(), X_CALLBACK_URL: 'https://attacker.test/auth/x/callback' } })).status, 503);
  assert.equal((await call(path, { ...options, env: { ...xEnv(), X_CALLBACK_URL: `${origin}/auth/x/callback?extra=1` } })).status, 503);
});

test('OAuth verifies the server-provided identity once; PKCE, client auth and public certificate agree', async t => {
  const person = client(), id = await issued(person);
  const calls = mockX(t);
  const auth = await beginX(person, id);
  assert.equal(auth.origin, 'https://x.com');
  assert.equal(auth.searchParams.get('scope'), 'tweet.read users.read');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(auth.searchParams.get('redirect_uri'), `${origin}/auth/x/callback`);
  assert.equal(auth.searchParams.get('client_id'), 'test-client');
  assert.ok(!auth.href.includes('test-secret'));
  const saved = await db.prepare('SELECT * FROM x_oauth_states WHERE license_id = ?').bind(id).first();
  assert.notEqual(saved.state_hash, auth.searchParams.get('state'));
  assert.equal(await pkceChallenge(saved.verifier), auth.searchParams.get('code_challenge'));
  assert.equal((await finishX(client(), auth)).status, 400);
  assert.equal((await finishX(person, auth, 'code=test-code', { method: 'HEAD' })).status, 405);
  assert.equal(calls.length, 0);
  const responses = await Promise.all([finishX(person, auth), finishX(person, auth)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [303, 400]);
  assert.equal(responses.find(r => r.status === 303).headers.get('Location'), `/license/${id}?x=verified`);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].url, 'https://api.x.com/2/oauth2/revoke');
  assert.equal(calls[2].init.body.get('token'), 'temporary-test-token');
  assert.equal(calls[2].init.body.get('token_type_hint'), 'access_token');
  assert.equal(calls[2].init.headers.Authorization, `Basic ${btoa('test-client:test-secret')}`);
  assert.ok(calls.every(c => c.init.redirect === 'manual'));
  assert.equal(calls[0].init.headers.Authorization, `Basic ${btoa('test-client:test-secret')}`);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body.get('code_verifier'), saved.verifier);
  assert.equal(calls[0].init.body.get('redirect_uri'), `${origin}/auth/x/callback`);
  assert.equal(calls[1].init.headers.Authorization, 'Bearer temporary-test-token');
  const publicRecord = await (await call(`/api/licenses/${id}`)).json();
  assert.equal(publicRecord.handle, 'Verified_User');
  assert.equal(publicRecord.xUserId, '12345678');
  assert.ok(Date.parse(publicRecord.xVerifiedAt));
  const page = await (await call(`/license/${id}`)).text();
  assert.match(page, /X ACCOUNT VERIFIED/);
  assert.match(page, /12345678/);
  assert.doesNotMatch(page, /temporary-test-token|test-secret|owner_hash|code_verifier/);
  assert.equal(await db.prepare('SELECT * FROM x_oauth_states WHERE license_id = ?').bind(id).first(), null);
});

test('expired, superseded and denied sign-ins never call X or alter a record', async t => {
  const person = client(), id = await issued(person), calls = mockX(t);
  const old = await beginX(person, id), auth = await beginX(person, id);
  assert.equal((await finishX(person, old)).status, 400);
  assert.match((await finishX(person, auth, 'error=access_denied&error_description=untrusted')).headers.get('Location'), /x=cancelled$/);
  const expired = await beginX(person, id);
  await db.prepare('UPDATE x_oauth_states SET expires_at = 0 WHERE license_id = ?').bind(id).run();
  assert.equal((await finishX(person, expired)).status, 400);
  assert.equal(calls.length, 0);
  await cleanup(db);
  assert.equal(await db.prepare('SELECT * FROM x_oauth_states WHERE license_id = ?').bind(id).first(), null);
  assert.equal((await (await call(`/api/licenses/${id}`)).json()).handle, null);
});

test('provider failures and invalid profiles cannot confer verification or expose provider secrets', async t => {
  const person = client(), id = await issued(person);
  for (const mode of ['token-failure', 'profile-failure', 'bad-id', 'bad-handle', 'network']) {
    t.mock.method(globalThis, 'fetch', async url => {
      if (url.endsWith('/revoke')) return Response.json({ revoked: true });
      if (mode === 'network') throw new Error('secret provider detail');
      if (url.endsWith('/token')) return mode === 'token-failure' ? new Response('secret provider detail', { status: 401 }) : Response.json({ access_token: 'test', token_type: 'bearer' });
      if (mode === 'profile-failure') return new Response('secret provider detail', { status: 402 });
      return Response.json({ data: { id: mode === 'bad-id' ? 123 : '123', username: mode === 'bad-handle' ? '<script>' : 'Valid' } });
    });
    const auth = await beginX(person, id), response = await finishX(person, auth);
    assert.match(response.headers.get('Location'), /x=x-(token|profile)$/);
    assert.doesNotMatch(await response.text(), /secret provider detail/);
    assert.equal((await (await call(`/api/licenses/${id}`)).json()).xUserId, null);
    t.mock.restoreAll();
  }
});

test('verified licenses allow same-account rename, reject transfers, and hide identity on removal', async t => {
  const person = client(), id = await issued(person);
  for (const [name, userId, outcome] of [['Original', '123', 'verified'], ['Renamed', '123', 'verified'], ['Different', '456', 'account-mismatch']]) {
    mockX(t, name, userId);
    const auth = await beginX(person, id);
    assert.match((await finishX(person, auth)).headers.get('Location'), new RegExp(`x=${outcome}$`));
    t.mock.restoreAll();
  }
  assert.equal((await (await call(`/api/licenses/${id}`)).json()).handle, 'Renamed');
  const pending = await beginX(person, id);
  const removed = await (await call(`/api/licenses/${id}`, { person, method: 'PATCH', data: { handle: '' } })).json();
  assert.equal(removed.handle, null);
  assert.equal(removed.xUserId, null);
  assert.equal(removed.xVerifiedAt, null);
  assert.equal((await finishX(person, pending)).status, 400);
  assert.equal((await db.prepare('SELECT x_user_id FROM licenses WHERE id = ?').bind(id).first()).x_user_id, '123');
  mockX(t, 'Different', '456');
  assert.match((await finishX(person, await beginX(person, id))).headers.get('Location'), /x=account-mismatch$/);
});

test('removing a name while token exchange is in flight invalidates the callback', async t => {
  const person = client(), id = await issued(person);
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/revoke')) return Response.json({ revoked: true });
    if (url.endsWith('/token')) {
      assert.equal((await call(`/api/licenses/${id}`, { person, method: 'PATCH', data: { handle: '' } })).status, 200);
      return Response.json({ access_token: 'test', token_type: 'bearer' });
    }
    return Response.json({ data: { id: '123', username: 'TooLate' } });
  });
  assert.match((await finishX(person, await beginX(person, id))).headers.get('Location'), /x=expired$/);
  assert.equal((await (await call(`/api/licenses/${id}`)).json()).handle, null);
});

test('failure to revoke the temporary X token prevents verification', async t => {
  const person = client(), id = await issued(person);
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/token')) return Response.json({ access_token: 'test', token_type: 'bearer' });
    if (url.endsWith('/revoke')) return new Response('secret response detail', { status: 503 });
    return Response.json({ data: { id: '123', username: 'Verified' } });
  });
  const response = await finishX(person, await beginX(person, id));
  assert.match(response.headers.get('Location'), /x=x-revoke$/);
  const license = await (await call(`/api/licenses/${id}`)).json();
  assert.equal(license.xVerifiedAt, null);
  assert.equal(license.handle, null);
});
