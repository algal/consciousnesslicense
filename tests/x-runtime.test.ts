import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Run the actual auth module inside workerd, rather than Node's fetch. Outbound
// traffic is intercepted outside the runtime so Request/fetch validation remains real.
for (const scenario of ['success', 'token-redirect', 'profile-redirect', 'revoke-failure']) {
  test(`Workers runtime OAuth: ${scenario}`, async () => {
    const module = stripTypeScriptTypes(await readFile(new URL('../src/x-auth.ts', import.meta.url), 'utf8')).replaceAll('export ', '');
    const calls = [];
    const runtime = new Miniflare(convertV4MiniflareOptions({
      modules: true, compatibilityDate: '2026-10-04',
      script: `${module}\nexport default { async fetch() {
        try { return Response.json(await identifyXUser({X_CLIENT_ID:'fake-client', X_CLIENT_SECRET:'fake-secret'}, 'fake-code', 'a'.repeat(64), 'https://bureau.test/auth/x/callback')); }
        catch(error) { return Response.json({stage:error.stage, status:error.status}, {status:502}); }
      } };`,
      outboundService: async request => {
        calls.push(request.url);
        assert.equal(new URL(request.url).origin, 'https://api.x.com');
        if (request.url.endsWith('/token')) {
          assert.equal(request.method, 'POST');
          assert.equal(request.headers.get('Authorization'), `Basic ${btoa('fake-client:fake-secret')}`);
          const body = new URLSearchParams(await request.text());
          assert.equal(body.get('code_verifier'), 'a'.repeat(64));
          if (scenario === 'token-redirect') return new Response(null, { status: 302, headers: { Location: 'https://attacker.test' } });
          return Response.json({ access_token: 'fake-access-token', token_type: 'bearer' });
        }
        if (request.url.endsWith('/me')) {
          assert.equal(request.headers.get('Authorization'), 'Bearer fake-access-token');
          if (scenario === 'profile-redirect') return new Response(null, { status: 302, headers: { Location: 'https://attacker.test' } });
          return Response.json({ data: { id: '123', username: 'RuntimeTest' } });
        }
        assert.equal(request.url, 'https://api.x.com/2/oauth2/revoke');
        assert.equal(request.method, 'POST');
        assert.deepEqual(Object.fromEntries(new URLSearchParams(await request.text())), {
          token: 'fake-access-token', token_type_hint: 'access_token', client_id: 'fake-client',
        });
        return scenario === 'revoke-failure' ? new Response('unavailable', { status: 503 }) : Response.json({ revoked: true });
      },
    }));
    try {
      const response = await runtime.dispatchFetch('https://bureau.test');
      if (scenario === 'success') {
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { id: '123', username: 'RuntimeTest' });
      } else {
        assert.equal(response.status, 502);
        assert.deepEqual(await response.json(), { stage: scenario.split('-')[0], status: scenario === 'revoke-failure' ? 503 : 302 });
      }
      assert.deepEqual(calls, scenario === 'token-redirect' ? ['https://api.x.com/2/oauth2/token'] :
        ['https://api.x.com/2/oauth2/token', 'https://api.x.com/2/users/me', 'https://api.x.com/2/oauth2/revoke']);
    } finally { await runtime.dispose(); }
  });
}
