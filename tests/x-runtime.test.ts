import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

for (const scenario of ['success', 'redirect', 'unavailable']) {
  test(`Workers runtime post lookup: ${scenario}`, async () => {
    const module = stripTypeScriptTypes(await readFile(new URL('../src/post-verification.ts', import.meta.url), 'utf8')).replaceAll('export ', '');
    let calls = 0;
    const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-10-04',
      script: `${module}\nexport default { async fetch() {
        try { return Response.json(await fetchPost({X_BEARER_TOKEN:'fake-app-token'}, '123')); }
        catch(error) { return Response.json({status:error.status}, {status:502}); }
      } };`,
      outboundService: async request => {
        calls++;
        const url = new URL(request.url);
        assert.equal(url.origin, 'https://api.x.com');
        assert.equal(url.pathname, '/2/tweets/123');
        assert.equal(url.searchParams.get('expansions'), 'author_id');
        assert.equal(request.headers.get('Authorization'), 'Bearer fake-app-token');
        if (scenario === 'redirect') return new Response(null, { status: 302, headers: { Location: 'https://attacker.test' } });
        if (scenario === 'unavailable') return new Response(null, { status: 404 });
        return Response.json({ data: { id: '123', author_id: '777', created_at: '2026-10-05T00:00:00Z', text: 'Proof', entities: { urls: [{ expanded_url: 'https://bureau.test/license/test' }] } }, includes: { users: [{ id: '777', username: 'RuntimeTest', protected: false }] } });
      },
    }));
    try {
      const response = await runtime.dispatchFetch('https://bureau.test');
      assert.equal(response.status, scenario === 'success' ? 200 : 502);
      const data = await response.json();
      if (scenario === 'success') { assert.equal(data.username, 'RuntimeTest'); assert.equal(data.authorId, '777'); }
      else assert.equal(data.status, scenario === 'redirect' ? 302 : 404);
      assert.equal(calls, 1);
    } finally { await runtime.dispose(); }
  });
}
