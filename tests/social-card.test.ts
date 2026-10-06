import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialCardSvg } from '../src/social-card.ts';
import { licensePage } from '../src/render.ts';

const license = { id: '00000000-0000-4000-8000-000000000001', handle: 'Bureau_Test', issuedAt: '2026-10-05T00:00:00Z', version: 'C–01', xUserId: null, xVerifiedAt: null, verificationPostId: null };

test('preview celebrates issuance without changing or asserting account verification', () => {
  const svg = socialCardSvg(license);
  assert.equal(svg, socialCardSvg({ ...license, xUserId: '123', xVerifiedAt: '2026-10-05T01:00:00Z', verificationPostId: '456' }));
  assert.match(svg, /@Bureau_Test/);
  assert.doesNotMatch(svg, /VERIFIED|<image|<script|href=/);
  const anonymous = socialCardSvg({ ...license, handle: null });
  assert.doesNotMatch(anonymous, /@Bureau_Test/);
  assert.match(anonymous, /anonymous bearer/);
});

test('card metadata exposes an absolute PNG URL without private state, and escapes supplied text', () => {
  const page = licensePage(license, 'https://bureau.test');
  assert.match(page, /name="twitter:card" content="summary_large_image"/);
  assert.match(page, /property="og:image" content="https:\/\/bureau.test\/license\/00000000-0000-4000-8000-000000000001\/social.png\?v=1&amp;name=Bureau_Test"/);
  assert.match(page, /property="og:image:width" content="1200"/);
  assert.match(page, /property="og:image:height" content="630"/);
  assert.match(page, /name="twitter:image:alt"/);
  assert.doesNotMatch(socialCardSvg({ ...license, handle: '<script>&"' }), /<script>/);
});
