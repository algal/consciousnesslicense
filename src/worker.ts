import { bearerToken, fetchPost, matchesProof, postId, proofText, randomToken, PostUnavailable, type PostConfig } from './post-verification.ts';
import { createQuestions, EXAM_VERSION, PASS_MARK, publicQuestions, type Question } from './content.ts';
import { about, certificateSvg, errorPage, exam, guide, home, licensePage, type License } from './render.ts';

export interface Env extends PostConfig { DB: D1Database; ASSETS: Fetcher }
type Attempt = { id: string; owner_hash: string; version: string; pass_mark: number; questions: string; result: string | null; created_at: number; touched_at: number };
type LicenseRow = { id: string; handle: string | null; issued_at: string; version: string; x_user_id: string | null; x_verified_at: string | null; verification_post_id: string | null };
type Result = { passed: boolean; score: number; total: number; passMark: number; licenseId: string | null; review: { prompt: string; selected: string; correct: string; explanation: string; topic: string; sources: Question['sources']; isCorrect: boolean }[] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);
const publicLicense = (l: LicenseRow): License => ({ id: l.id, handle: l.handle, issuedAt: l.issued_at, version: l.version, xUserId: l.handle && l.x_verified_at ? l.x_user_id : null, xVerifiedAt: l.handle ? l.x_verified_at : null, verificationPostId: l.handle && l.x_verified_at ? l.verification_post_id : null });
class HttpError extends Error {
  status: number;
  retryAfter?: number;
  constructor(status: number, message: string, retryAfter?: number) { super(message); this.status = status; this.retryAfter = retryAfter; }
}
const json = (data: unknown, status = 200) => Response.json(data, { status });
const html = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
async function hash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
}
function cookieName(request: Request) { return new URL(request.url).protocol === 'https:' ? '__Host-bcl' : 'bcl-local'; }
function capability(request: Request) {
  const name = cookieName(request);
  const value = request.headers.get('Cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1);
  return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
}
function setCapability(response: Response, request: Request) {
  const token = capability(request) ?? [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
  response.headers.set('Set-Cookie', `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`);
  return response;
}
async function owner(request: Request) {
  const token = capability(request);
  if (!token) throw new HttpError(401, 'Your private browser session is missing. Reopen the examination with cookies enabled.');
  return hash(token);
}
async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.split(';')[0].trim().match(/^application\/json$/i)) throw new HttpError(415, 'Send this request as JSON.');
  const limit = 16384;
  const declared = Number(request.headers.get('Content-Length'));
  if (declared > limit) throw new HttpError(413, 'This submission is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A JSON request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new HttpError(413, 'This submission is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw new HttpError(400, 'The request body must be a JSON object.'); }
}
async function throttle(db: D1Database, key: string, limit: number, seconds: number) {
  const stamp = now();
  const window = Math.floor(stamp / seconds);
  const row = await db.prepare(`INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = MIN(count + 1, ?)
    RETURNING count`).bind(`${key}:${window}`, (window + 1) * seconds, limit + 1).first<{ count: number }>();
  if (!row || row.count > limit) throw new HttpError(429, 'The filing desk is receiving too many requests. Please try again shortly; your existing work is safe.', (window + 1) * seconds - stamp);
}
async function guardMutation(request: Request, env: Env) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) throw new HttpError(403, 'This action must be made from the Bureau website.');
  // Cloudflare supplies this header in production. Local requests share a development bucket.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const ipKey = await hash(`${Math.floor(now() / DAY)}:${ip}`);
  await throttle(env.DB, `write:${ipKey}`, 120, 600);
}
async function getAttempt(db: D1Database, id: string, ownerHash: string) {
  const attempt = await db.prepare('SELECT * FROM attempts WHERE id = ? AND owner_hash = ?').bind(id, ownerHash).first<Attempt>();
  if (!attempt) throw new HttpError(404, 'That private examination file is unavailable. You can start another examination.');
  return attempt;
}
function attemptPayload(attempt: Attempt) {
  return { id: attempt.id, version: attempt.version, passMark: attempt.pass_mark,
    questions: publicQuestions(JSON.parse(attempt.questions)), result: attempt.result ? JSON.parse(attempt.result) : null };
}
async function findLicense(db: D1Database, id: string) {
  if (!UUID.test(id)) throw new HttpError(404, 'There is no issued license at this address. Check the complete URL.');
  const license = await db.prepare('SELECT id, handle, issued_at, version, x_user_id, x_verified_at, verification_post_id FROM licenses WHERE id = ?').bind(id).first<LicenseRow>();
  if (!license) throw new HttpError(404, 'There is no issued license at this address. Check the complete URL.');
  return publicLicense(license);
}

async function submit(request: Request, env: Env, attempt: Attempt) {
  // A repeat, including a lost-response retry, always returns the first committed result.
  if (attempt.result) return json(JSON.parse(attempt.result));
  const data = await readJson(request);
  if (!data.answers || typeof data.answers !== 'object' || Array.isArray(data.answers)) throw new HttpError(400, 'Answer every question before submitting.');
  const answers = data.answers as Record<string, unknown>;
  const questions = JSON.parse(attempt.questions) as Question[];
  if (Object.keys(answers).length !== questions.length) throw new HttpError(400, 'Answer every question before submitting.');
  const review = questions.map(q => {
    const selected = q.options.find(o => o.id === answers[q.id]);
    if (!selected) throw new HttpError(400, 'Each answer must be one of the options in this examination.');
    return { prompt: q.prompt, selected: selected.text, correct: q.options.find(o => o.correct)!.text, isCorrect: selected.correct, explanation: q.explanation, topic: q.topic, sources: q.sources };
  });
  const score = review.filter(r => r.isCorrect).length;
  const result: Result = { passed: score >= attempt.pass_mark, score, total: questions.length, passMark: attempt.pass_mark, review, licenseId: score >= attempt.pass_mark ? crypto.randomUUID() : null };
  // D1 batch is transactional. The conditional update makes the FIRST submission authoritative.
  // The insert reads THAT persisted result, never a losing concurrent request's candidate.
  const committed = await env.DB.batch([
    env.DB.prepare('UPDATE attempts SET result = ?, touched_at = ? WHERE id = ? AND owner_hash = ? AND result IS NULL').bind(JSON.stringify(result), now(), attempt.id, attempt.owner_hash),
    env.DB.prepare(`INSERT INTO licenses (id, attempt_id, owner_hash, issued_at, version)
      SELECT json_extract(result, '$.licenseId'), id, owner_hash, ?, version FROM attempts
      WHERE id = ? AND owner_hash = ? AND json_extract(result, '$.passed') = 1
      ON CONFLICT(attempt_id) DO NOTHING`).bind(new Date().toISOString(), attempt.id, attempt.owner_hash),
    env.DB.prepare('SELECT result FROM attempts WHERE id = ? AND owner_hash = ?').bind(attempt.id, attempt.owner_hash),
  ]);
  const saved = committed[2].results[0] as { result: string } | undefined;
  if (!saved) throw new HttpError(404, 'This examination file has expired. Please start another examination.');
  return json(JSON.parse(saved.result));
}

type Challenge = { license_id: string; owner_hash: string; nonce: string; handle: string; record_url: string; created_at: number; expires_at: number; checks: number; claim_id: string | null; busy_until: number; last_post_id: string | null; last_error: string | null };
const challengePayload = (c: Challenge) => ({ nonce: c.nonce, handle: c.handle, text: proofText(c.record_url), expiresAt: c.expires_at, checksRemaining: Math.max(0, 3 - c.checks) });
function dailyLookupLimit(env: Env) {
  const value = env.X_DAILY_LOOKUP_LIMIT ?? '100';
  return /^[0-9]{1,6}$/.test(value) ? Math.min(Number(value), 100000) : 0;
}
async function verifyPost(request: Request, env: Env, id: string, ownerHash: string) {
  const data = await readJson(request);
  const post = postId(data.url);
  if (!post) throw new HttpError(400, 'Paste the HTTPS URL of your published X post.');
  const license = await env.DB.prepare('SELECT * FROM licenses WHERE id = ? AND owner_hash = ?').bind(id, ownerHash).first<LicenseRow>();
  if (!license) throw new HttpError(403, 'This browser does not hold editing access to that license.');
  // Lost-response retries of a successful verification cost nothing.
  if (license.handle && license.x_verified_at && license.verification_post_id === post) return json(publicLicense(license));
  if (!bearerToken(env)) throw new HttpError(503, 'Post verification is temporarily unavailable. Your license remains available.');
  const challenge = await env.DB.prepare('SELECT * FROM post_challenges WHERE license_id = ? AND owner_hash = ?').bind(id, ownerHash).first<Challenge>();
  if (!challenge || challenge.nonce !== data.nonce || challenge.expires_at <= now()) throw new HttpError(400, 'Prepare a new verification post; this request has expired or been replaced.');
  if (challenge.last_post_id === post && challenge.last_error) throw new HttpError(400, challenge.last_error);
  if (challenge.checks >= 3) throw new HttpError(429, 'This verification request has used its three checks. Prepare a new verification post.');
  const claim = randomToken();
  // Claim before calling X: simultaneous submissions cannot trigger duplicate paid reads.
  const acquired = await env.DB.prepare(`UPDATE post_challenges SET claim_id = ?, busy_until = ?, checks = checks + 1
    WHERE license_id = ? AND owner_hash = ? AND nonce = ? AND expires_at > ? AND busy_until <= ? AND checks < 3 RETURNING nonce`)
    .bind(claim, now() + 60, id, ownerHash, challenge.nonce, now(), now()).first();
  if (!acquired) throw new HttpError(409, 'A verification is already running or this request has changed. Please wait and reload.');
  let paid = false;
  try {
    await throttle(env.DB, `post-checks:${ownerHash}`, 10, DAY);
    await throttle(env.DB, 'all-post-checks', dailyLookupLimit(env), DAY);
    paid = true;
    const proof = await fetchPost(env, post);
    if (!matchesProof(proof, challenge, now())) throw new HttpError(400, 'The post must be by the declared account, published within this request’s 30-minute window, and contain the complete prepared text. Publish a new post and submit its URL.');
    if (license.x_user_id && license.x_user_id !== proof.authorId) throw new HttpError(400, 'This license is bound to another X account. Publish from the originally verified account.');
    const updated = await env.DB.prepare(`UPDATE licenses SET handle = ?, x_user_id = ?, x_verified_at = ?, verification_post_id = ?
      WHERE id = ? AND owner_hash = ? AND (x_user_id IS NULL OR x_user_id = ?)
      AND EXISTS (SELECT 1 FROM post_challenges WHERE license_id = ? AND nonce = ? AND claim_id = ? AND expires_at > ?)
      RETURNING id, handle, issued_at, version, x_user_id, x_verified_at, verification_post_id`)
      .bind(proof.username, proof.authorId, new Date().toISOString(), post, id, ownerHash, proof.authorId, id, challenge.nonce, claim, now()).first<LicenseRow>();
    if (!updated) throw new HttpError(409, 'Your license changed while verification was running. Reload to see its current record.');
    await env.DB.prepare('DELETE FROM post_challenges WHERE license_id = ? AND claim_id = ?').bind(id, claim).run();
    return json(publicLicense(updated));
  } catch (error) {
    // Cache failed proof checks so repeatedly submitting the same post is free.
    // Provider failures may be retried manually after a short cooldown.
    if (paid && error instanceof HttpError && error.status === 400) {
      await env.DB.prepare('UPDATE post_challenges SET last_post_id = ?, last_error = ? WHERE license_id = ? AND claim_id = ?').bind(post, error.message, id, claim).run();
    }
    if (error instanceof PostUnavailable) {
      console.warn('BCL post lookup failure', error.status ?? 'network-or-response');
      if ([403, 404, 422].includes(error.status ?? 0)) throw new HttpError(400, 'X could not supply that public, original post and its author. Check the URL and make sure the account is public.');
      throw new HttpError(503, 'The Bureau could not retrieve the post from X. Please try again in a minute; your license has not changed.');
    }
    throw error;
  } finally {
    await env.DB.prepare('UPDATE post_challenges SET claim_id = NULL, busy_until = ? WHERE license_id = ? AND claim_id = ?').bind(paid ? now() + 30 : 0, id, claim).run();
  }
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (method === 'GET' || method === 'HEAD') {
    if (path === '/') return html(home());
    if (path === '/guide') return html(guide());
    if (path === '/about') return html(about());
    if (path === '/exam') return setCapability(html(exam()), request);
    if (['/styles.css', '/exam.js', '/license.js', '/favicon.svg'].includes(path)) return env.ASSETS.fetch(request);
    if (path === '/robots.txt') return new Response('User-agent: *\nDisallow: /api/\nDisallow: /exam\nDisallow: /auth/\n', { headers: { 'Content-Type': 'text/plain' } });
    const record = path.match(/^\/license\/([^/]+)(\/certificate\.svg)?$/);
    if (record) {
      const license = await findLicense(env.DB, record[1]);
      if (record[2]) return new Response(certificateSvg(license, url.origin), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Content-Disposition': `attachment; filename="consciousness-license-${license.id}.svg"` } });
      return html(licensePage(license, url.origin));
    }
    if (path === '/api/attempt') {
      const ownerHash = await owner(request);
      const attempt = await env.DB.prepare('SELECT * FROM attempts WHERE owner_hash = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').bind(ownerHash).first<Attempt>();
      if (attempt && !attempt.result) await env.DB.prepare('UPDATE attempts SET touched_at = ? WHERE id = ? AND owner_hash = ?').bind(now(), attempt.id, ownerHash).run();
      const recent = await env.DB.prepare('SELECT id, handle, issued_at, version, x_user_id, x_verified_at, verification_post_id FROM licenses WHERE owner_hash = ? ORDER BY issued_at DESC LIMIT 1').bind(ownerHash).first<LicenseRow>();
      return json({ attempt: attempt ? attemptPayload(attempt) : null, recentLicense: recent ? publicLicense(recent) : null });
    }
    const apiLicense = path.match(/^\/api\/licenses\/([^/]+)(\/editor)?$/);
    if (apiLicense) {
      const license = await findLicense(env.DB, apiLicense[1]);
      if (!apiLicense[2]) return json(license);
      const token = capability(request);
      const owns = token ? await env.DB.prepare('SELECT id FROM licenses WHERE id = ? AND owner_hash = ?').bind(license.id, await hash(token)).first() : null;
      const pending = owns ? await env.DB.prepare('SELECT * FROM post_challenges WHERE license_id = ? AND expires_at > ?').bind(license.id, now()).first<Challenge>() : null;
      return json({ canEdit: !!owns, postAvailable: !!bearerToken(env), challenge: pending ? challengePayload(pending) : null });
    }
    throw new HttpError(404, 'The requested page or record is not on file.');
  }
  if (method !== 'POST' && method !== 'PATCH') throw new HttpError(405, 'That request method is not supported.');
  const isStart = path === '/api/attempts' && method === 'POST';
  const gradePath = path.match(/^\/api\/attempts\/([^/]+)\/submit$/);
  const verifyPath = method === 'POST' && path.match(/^\/api\/licenses\/([^/]+)\/verify-post$/);
  const challengePath = method === 'POST' && path.match(/^\/api\/licenses\/([^/]+)\/post-challenge$/);
  const editPath = path.match(/^\/api\/licenses\/([^/]+)$/);
  if (!(isStart || verifyPath || challengePath || (gradePath && method === 'POST') || (editPath && method === 'PATCH'))) throw new HttpError(404, 'The requested action is not on file.');
  const ownerHash = await owner(request);
  await guardMutation(request, env);
  if (verifyPath) return verifyPost(request, env, verifyPath[1], ownerHash);
  if (challengePath) {
    const data = await readJson(request);
    const handle = typeof data.handle === 'string' ? data.handle.trim().replace(/^@/, '') : '';
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new HttpError(400, 'Enter an X handle: 1–15 letters, numbers, or underscores.');
    const license = await env.DB.prepare('SELECT * FROM licenses WHERE id = ? AND owner_hash = ?').bind(challengePath[1], ownerHash).first<LicenseRow>();
    if (!license) throw new HttpError(403, 'This browser does not hold editing access to that license.');
    if (!bearerToken(env)) throw new HttpError(503, 'Post verification is temporarily unavailable.');
    await throttle(env.DB, `post-preparations:${ownerHash}`, 10, 3600);
    const pending = await env.DB.prepare(`INSERT INTO post_challenges (license_id, owner_hash, nonce, handle, record_url, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(license_id) DO UPDATE SET nonce = excluded.nonce, handle = excluded.handle,
      record_url = excluded.record_url, created_at = excluded.created_at, expires_at = excluded.expires_at, checks = 0,
      claim_id = NULL, busy_until = 0, last_post_id = NULL, last_error = NULL RETURNING *`)
      .bind(challengePath[1], ownerHash, randomToken(), handle, `${url.origin}/license/${license.id}`, now(), now() + 1800).first<Challenge>();
    return json(challengePayload(pending!));
  }
  if (isStart) {
    const data = await readJson(request);
    // Stable request IDs let a delayed duplicate start recover its original attempt, even after grading.
    if (typeof data.requestId !== 'string' || !UUID.test(data.requestId)) throw new HttpError(400, 'An examination request ID is required.');
    const previous = await env.DB.prepare('SELECT * FROM attempts WHERE id = ? AND owner_hash = ?').bind(data.requestId, ownerHash).first<Attempt>();
    if (previous) return json(attemptPayload(previous));
    const pending = await env.DB.prepare('SELECT * FROM attempts WHERE owner_hash = ? AND result IS NULL').bind(ownerHash).first<Attempt>();
    if (pending) return json(attemptPayload(pending));
    await throttle(env.DB, `starts:${ownerHash}`, 20, 3600);
    await throttle(env.DB, 'all-starts', 2000, 3600);
    await env.DB.prepare('INSERT OR IGNORE INTO attempts (id, owner_hash, version, pass_mark, questions, created_at, touched_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(data.requestId, ownerHash, EXAM_VERSION, PASS_MARK, JSON.stringify(createQuestions()), now(), now()).run();
    const created = await env.DB.prepare('SELECT * FROM attempts WHERE owner_hash = ? AND (id = ? OR result IS NULL) ORDER BY created_at DESC, rowid DESC LIMIT 1').bind(ownerHash, data.requestId).first<Attempt>();
    if (!created) throw new HttpError(409, 'That request ID is unavailable. Reopen the examination and try again.');
    return json(attemptPayload(created), 201);
  }
  if (gradePath && method === 'POST') {
    return submit(request, env, await getAttempt(env.DB, gradePath[1], ownerHash));
  }
  if (editPath && method === 'PATCH') {
    const data = await readJson(request);
    const handle = typeof data.handle === 'string' ? data.handle.trim().replace(/^@/, '') : null;
    if (handle === null || (handle && !/^[A-Za-z0-9_]{1,15}$/.test(handle))) throw new HttpError(400, 'Enter 1–15 letters, numbers, or underscores, or leave blank for an anonymous license.');
    // Once bound to a verified account, changing its handle needs a new proof.
    const current = await env.DB.prepare('SELECT * FROM licenses WHERE id = ? AND owner_hash = ?').bind(editPath[1], ownerHash).first<LicenseRow>();
    if (!current) throw new HttpError(403, 'This browser does not hold editing access to that license.');
    if (current.x_user_id && handle) throw new HttpError(400, 'Verify a new post from the same account to refresh its handle, or leave the name blank.');
    const result = await env.DB.batch([
      env.DB.prepare('DELETE FROM post_challenges WHERE license_id = ? AND owner_hash = ?').bind(editPath[1], ownerHash),
      env.DB.prepare(`UPDATE licenses SET handle = ?, x_verified_at = NULL, verification_post_id = NULL
        WHERE id = ? AND owner_hash = ? AND (? IS NULL OR x_user_id IS NULL)
        RETURNING id, handle, issued_at, version, x_user_id, x_verified_at, verification_post_id`).bind(handle || null, editPath[1], ownerHash, handle || null),
    ]);
    const updated = result[1].results[0] as LicenseRow | undefined;
    if (!updated) throw new HttpError(403, 'This browser does not hold editing access to that license.');
    return json(publicLicense(updated));
  }
  throw new HttpError(404, 'The requested action is not on file.');
}

export async function cleanup(db: D1Database, stamp = now()) {
  await db.batch([
    db.prepare('DELETE FROM attempts WHERE result IS NOT NULL AND touched_at < ?').bind(stamp - 7 * DAY),
    db.prepare('DELETE FROM attempts WHERE result IS NULL AND touched_at < ?').bind(stamp - 30 * DAY),
    db.prepare('DELETE FROM post_challenges WHERE expires_at <= ?').bind(stamp),
    db.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(stamp),
  ]);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let response: Response;
    try { response = await route(request, env); }
    catch (error) {
      const status = error instanceof HttpError ? error.status : 503;
      const message = error instanceof HttpError ? error.message : 'The filing office could not reach its records. Please try again. A repeated submission will recover the same result if it was already saved.';
      // Never log request bodies, cookies, IPs, handles, or database exception details.
      if (!(error instanceof HttpError)) console.error('BCL storage or processing failure');
      response = new URL(request.url).pathname.startsWith('/api/') ? json({ error: message }, status) : html(errorPage(status, message), status);
      if (error instanceof HttpError && error.retryAfter) response.headers.set('Retry-After', String(error.retryAfter));
      if (status === 405) response.headers.set('Allow', 'GET, HEAD, POST, PATCH');
    }
    response = new Response(request.method === 'HEAD' ? null : response.body, response);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.headers.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    return response;
  },
  async scheduled(_event: ScheduledController, env: Env) { await cleanup(env.DB); },
} satisfies ExportedHandler<Env>;
