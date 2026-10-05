import { authorizationUrl, identifyXUser, randomToken, xConfigured, XUnavailable, type XConfig } from './x-auth.ts';
import { createQuestions, EXAM_VERSION, PASS_MARK, publicQuestions, type Question } from './content.ts';
import { about, certificateSvg, errorPage, exam, guide, home, licensePage, type License } from './render.ts';

export interface Env extends XConfig { DB: D1Database; ASSETS: Fetcher; X_CALLBACK_URL?: string }
type Attempt = { id: string; owner_hash: string; version: string; pass_mark: number; questions: string; result: string | null; created_at: number; touched_at: number };
type LicenseRow = { id: string; handle: string | null; issued_at: string; version: string; x_user_id: string | null; x_verified_at: string | null };
type Result = { passed: boolean; score: number; total: number; passMark: number; licenseId: string | null; review: { prompt: string; selected: string; correct: string; explanation: string; topic: string; sources: Question['sources']; isCorrect: boolean }[] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);
const publicLicense = (l: LicenseRow): License => ({ id: l.id, handle: l.handle, issuedAt: l.issued_at, version: l.version, xUserId: l.handle && l.x_verified_at ? l.x_user_id : null, xVerifiedAt: l.handle ? l.x_verified_at : null });
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
  response.headers.set('Set-Cookie', `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`);
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
  const license = await db.prepare('SELECT id, handle, issued_at, version, x_user_id, x_verified_at FROM licenses WHERE id = ?').bind(id).first<LicenseRow>();
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

function callbackUrl(request: Request, env: Env): string | null {
  // Explicit deployment configuration prevents arbitrary Host headers choosing a callback.
  if (!xConfigured(env) || !env.X_CALLBACK_URL) return null;
  try {
    const configured = new URL(env.X_CALLBACK_URL);
    if (configured.protocol !== 'https:' || configured.origin !== new URL(request.url).origin ||
        configured.pathname !== '/auth/x/callback' || configured.search || configured.hash || configured.username || configured.password) return null;
    return configured.href;
  } catch { return null; }
}
type OAuthState = { license_id: string; verifier: string; redirect_uri: string; state_hash: string };
const authRedirect = (id: string, outcome: string) => new Response(null, { status: 303, headers: { Location: `/license/${id}?x=${outcome}` } });
async function xCallback(request: Request, env: Env): Promise<Response> {
  const redirectUri = callbackUrl(request, env);
  if (!redirectUri) throw new HttpError(503, 'X verification is not configured at this address. Your license remains available.');
  const params = new URL(request.url).searchParams;
  const state = params.get('state');
  if (!state || !/^[0-9a-f]{64}$/.test(state) || params.getAll('state').length !== 1) throw new HttpError(400, 'This X sign-in is invalid. Return to your license and start again.');
  const ownerHash = await owner(request);
  // Atomic consumption: a callback is usable once, only by the initiating browser.
  const saved = await env.DB.prepare(`DELETE FROM x_oauth_states
    WHERE state_hash = ? AND owner_hash = ? AND redirect_uri = ? AND expires_at > ?
    RETURNING license_id, verifier, redirect_uri, state_hash`).bind(await hash(state), ownerHash, redirectUri, now()).first<OAuthState>();
  if (!saved) throw new HttpError(400, 'This X sign-in has expired or was already used. Return to your license and start again.');
  if (params.has('error')) return authRedirect(saved.license_id, params.get('error') === 'access_denied' ? 'cancelled' : 'unavailable');
  const code = params.get('code');
  if (!code || code.length > 4096 || params.getAll('code').length !== 1) return authRedirect(saved.license_id, 'unavailable');
  let identity;
  try { identity = await identifyXUser(env, code, saved.verifier, saved.redirect_uri); }
  catch (error) {
    // Only fixed stage names and HTTP status codes are diagnostic output.
    if (error instanceof XUnavailable) {
      console.warn('BCL X verification failure', error.stage, error.status ?? 'network-or-response');
      return authRedirect(saved.license_id, `x-${error.stage}`);
    }
    return authRedirect(saved.license_id, 'unavailable');
  }
  // The nonce also invalidates callbacks already in flight when a name is removed
  // or a newer sign-in starts. The first verified account permanently binds the license.
  const updated = await env.DB.prepare(`UPDATE licenses SET handle = ?, x_user_id = ?, x_verified_at = ?, x_auth_nonce = NULL
    WHERE id = ? AND owner_hash = ? AND x_auth_nonce = ? AND (x_user_id IS NULL OR x_user_id = ?)
    RETURNING id`).bind(identity.username, identity.id, new Date().toISOString(), saved.license_id, ownerHash, saved.state_hash, identity.id).first();
  if (updated) return authRedirect(saved.license_id, 'verified');
  const bound = await env.DB.prepare('SELECT x_user_id FROM licenses WHERE id = ? AND owner_hash = ?').bind(saved.license_id, ownerHash).first<{ x_user_id: string | null }>();
  return authRedirect(saved.license_id, bound?.x_user_id && bound.x_user_id !== identity.id ? 'account-mismatch' : 'expired');
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (path === '/auth/x/callback') {
    if (method !== 'GET') throw new HttpError(405, 'X sign-in requires a browser redirect.');
    return xCallback(request, env);
  }
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
      const recent = await env.DB.prepare('SELECT id, handle, issued_at, version, x_user_id, x_verified_at FROM licenses WHERE owner_hash = ? ORDER BY issued_at DESC LIMIT 1').bind(ownerHash).first<LicenseRow>();
      return json({ attempt: attempt ? attemptPayload(attempt) : null, recentLicense: recent ? publicLicense(recent) : null });
    }
    const apiLicense = path.match(/^\/api\/licenses\/([^/]+)(\/editor)?$/);
    if (apiLicense) {
      const license = await findLicense(env.DB, apiLicense[1]);
      if (!apiLicense[2]) return json(license);
      const token = capability(request);
      const owns = token ? await env.DB.prepare('SELECT id FROM licenses WHERE id = ? AND owner_hash = ?').bind(license.id, await hash(token)).first() : null;
      return json({ canEdit: !!owns, xAvailable: !!callbackUrl(request, env) });
    }
    throw new HttpError(404, 'The requested page or record is not on file.');
  }
  if (method !== 'POST' && method !== 'PATCH') throw new HttpError(405, 'That request method is not supported.');
  const isStart = path === '/api/attempts' && method === 'POST';
  const gradePath = path.match(/^\/api\/attempts\/([^/]+)\/submit$/);
  const verifyPath = method === 'POST' && path.match(/^\/api\/licenses\/([^/]+)\/verify-x$/);
  const editPath = path.match(/^\/api\/licenses\/([^/]+)$/);
  if (!(isStart || verifyPath || (gradePath && method === 'POST') || (editPath && method === 'PATCH'))) throw new HttpError(404, 'The requested action is not on file.');
  const ownerHash = await owner(request);
  await guardMutation(request, env);
  if (verifyPath) {
    await readJson(request);
    const redirectUri = callbackUrl(request, env);
    if (!redirectUri) throw new HttpError(503, 'X sign-in is currently unavailable at this address. Your license remains available.');
    const owns = await env.DB.prepare('SELECT id FROM licenses WHERE id = ? AND owner_hash = ?').bind(verifyPath[1], ownerHash).first();
    if (!owns) throw new HttpError(403, 'This browser does not hold editing access to that license.');
    await throttle(env.DB, `x-signin:${ownerHash}`, 10, 600);
    await throttle(env.DB, 'all-x-signins', 1000, 3600);
    const state = randomToken(), verifier = randomToken(), stateHash = await hash(state);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM x_oauth_states WHERE owner_hash = ? OR expires_at <= ?').bind(ownerHash, now()),
      env.DB.prepare('UPDATE licenses SET x_auth_nonce = NULL WHERE owner_hash = ? AND x_auth_nonce IS NOT NULL').bind(ownerHash),
      env.DB.prepare('UPDATE licenses SET x_auth_nonce = ? WHERE id = ? AND owner_hash = ?').bind(stateHash, verifyPath[1], ownerHash),
      env.DB.prepare('INSERT INTO x_oauth_states (state_hash, owner_hash, license_id, verifier, redirect_uri, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(stateHash, ownerHash, verifyPath[1], verifier, redirectUri, now() + 600),
    ]);
    // Upgrade older Strict cookies so the browser carries its capability back from X.
    return setCapability(json({ url: await authorizationUrl(env, state, verifier, redirectUri) }), request);
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
    if (data.handle !== '') throw new HttpError(400, 'Sign in with X to add a verified handle. An empty handle removes the name.');
    const result = await env.DB.batch([
      env.DB.prepare('DELETE FROM x_oauth_states WHERE license_id = ? AND owner_hash = ?').bind(editPath[1], ownerHash),
      env.DB.prepare(`UPDATE licenses SET handle = NULL, x_verified_at = NULL, x_auth_nonce = NULL
        WHERE id = ? AND owner_hash = ? RETURNING id, handle, issued_at, version, x_user_id, x_verified_at`).bind(editPath[1], ownerHash),
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
    db.prepare('DELETE FROM x_oauth_states WHERE expires_at <= ?').bind(stamp),
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
