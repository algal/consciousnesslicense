import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { licensePage, certificateSvg } from '../src/render.ts';
import { bank } from '../src/content.ts';

async function current(page) {
  await expect(page.locator('#question-heading')).toBeVisible();
  return (await (await page.request.get('/api/attempt')).json()).attempt;
}
async function complete(page, attempt, right = 15) {
  for (let i = 0; i < attempt.questions.length; i++) {
    const question = attempt.questions[i];
    const item = bank.find(q => q.prompt === question.prompt)!;
    const answer = item.answers[i < right ? 0 : 1];
    const option = question.options.find(o => o.text === answer);
    await page.locator(`input[value="${option.id}"]`).check();
    await page.getByRole('button', { name: i === 14 ? 'Review & submit' : 'Next question' }).click();
  }
  await page.getByRole('button', { name: 'Submit examination', exact: true }).click();
}

test('desktop launch, keyboard answers, reload, failure, retry, issuance, personalization and PNG', async ({ page, browser }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'An opinion is not a qualification.' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('home-desktop.png'), fullPage: true });
  await page.getByRole('link', { name: 'Take the examination', exact: true }).click();
  const attempt = await current(page);
  await page.locator('input[type=radio]').first().focus();
  await page.keyboard.press('Space');
  await expect(page.locator('input[type=radio]').first()).toBeChecked();
  await page.reload();
  await expect(page.locator('input[type=radio]').first()).toBeChecked();
  await complete(page, attempt, 11);
  await expect(page.getByRole('heading', { name: 'A little further reading.' })).toBeVisible();
  await expect(page.getByText('11 of 15 correct')).toBeVisible();
  await expect(page.getByText('You are not qualified for a license', { exact: false })).toBeVisible();
  await page.locator('.review-item summary').first().click();
  await expect(page.locator('.review-item[open] a').first()).toHaveAttribute('href', /^\/guide#/);
  await page.getByRole('button', { name: 'Take another examination' }).click();
  const retry = await current(page);
  expect(retry.id).not.toBe(attempt.id);
  await complete(page, retry);
  await expect(page.getByRole('heading', { name: 'Your opinion now has paperwork.' })).toBeVisible();
  await expect(page.getByText('LICENSE ISSUED', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Receive your license' }).click();
  const licenseUrl = page.url();
  await expect(page.getByText('Issuance verified', { exact: false })).toBeVisible();
  await expect(page.locator('#personalization')).toBeVisible();
  await expect(page.locator('#license-name')).toHaveText('An informed anonymous bearer.');
  const artwork = page.locator('.license-presentation svg');
  await expect(artwork).toHaveAttribute('viewBox', '0 0 1600 1600');
  await expect(artwork.locator('a[href="https://consciousnesslicense.com/"]')).toHaveText('consciousnesslicense.com');
  await expect(artwork.locator(`a[href="${licenseUrl}"]`)).toHaveText(licenseUrl);
  await expect(artwork).toContainText('CERTIFICATE OF BASIC FAMILIARITY');
  await page.getByLabel('Self-declared X handle').fill('Bureau_Test');
  await page.getByRole('button', { name: 'Save handle' }).click();
  await expect(page.locator('#license-name')).toHaveText('@Bureau_Test');
  await expect(artwork).toContainText('SELF-DECLARED · NOT X-VERIFIED');
  // Exercise the actual WASM renderer in workerd.
  const cardUrl = await page.locator('meta[property="og:image"]').getAttribute('content');
  const cardResponse = await page.request.get(cardUrl!);
  expect(cardResponse.status()).toBe(200);
  expect(cardResponse.headers()['content-type']).toBe('image/png');
  const cardPng = await cardResponse.body();
  expect(cardPng.subarray(1, 4).toString()).toBe('PNG');
  expect(cardPng.readUInt32BE(16)).toBe(1200);
  expect(cardPng.readUInt32BE(20)).toBe(630);
  expect(cardPng.length).toBeLessThan(5_000_000);
  expect(await (await page.request.get(cardUrl!)).body()).toEqual(cardPng);
  await page.screenshot({ path: testInfo.outputPath('license-desktop.png'), fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download license · PNG' }).click();
  const download = await downloadPromise;
  await download.saveAs(testInfo.outputPath('license.png'));
  const png = await readFile(testInfo.outputPath('license.png'));
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1600);
  expect(png.readUInt32BE(20)).toBe(1600);
  expect(png.length).toBeLessThan(5_000_000);
  expect(png.length).toBeGreaterThan(40000);
  const visitor = await browser.newContext();
  const publicPage = await visitor.newPage();
  await publicPage.goto(licenseUrl);
  await expect(publicPage.locator('#license-name')).toHaveText('@Bureau_Test');
  await expect(publicPage.locator('#personalization')).toBeHidden();
  expect((await publicPage.request.get(cardUrl!)).status()).toBe(200);
  expect((await publicPage.request.head(cardUrl!)).headers()['content-type']).toBe('image/png');
  expect((await publicPage.request.get('/license/00000000-0000-4000-8000-000000000000/social.png')).status()).toBe(404);
  await expect(publicPage.locator('meta[property="og:title"]')).toHaveAttribute('content', /@Bureau_Test/);
  await expect(publicPage.locator('body')).not.toContainText('15 of 15');
  await visitor.close();
  await page.getByRole('button', { name: 'Remove name' }).click();
  await expect(page.locator('#license-name')).toHaveText('An informed anonymous bearer.');
  // An old image URL must not keep serving a removed handle from our edge cache.
  expect(await (await page.request.get(cardUrl!)).body()).not.toEqual(cardPng);
  expect(errors).toEqual([]);
});

test('mobile layout, no motion preference, pass with no localStorage, and no missing-page ambiguity', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage unavailable'); } });
  });
  const fits = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/');
  await fits();
  await page.screenshot({ path: testInfo.outputPath('home-mobile.png'), fullPage: true });
  await page.goto('/guide');
  await fits();
  await expect(page.locator('.guide-entry')).toHaveCount(17);
  await page.goto('/exam');
  const attempt = await current(page);
  await fits();
  await page.screenshot({ path: testInfo.outputPath('exam-mobile.png'), fullPage: true });
  await complete(page, attempt);
  expect(await page.locator('.ceremony span').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.getByRole('link', { name: 'Receive your license' }).click();
  await expect(page.locator('#personalization')).toBeVisible();
  await fits();
  expect(await page.locator('.issued').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.screenshot({ path: testInfo.outputPath('license-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 640 });
  await fits();
  const response = await page.goto('/license/00000000-0000-4000-8000-000000000000');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'No record on file.' })).toBeVisible();
});

test('field guide and public-facing pages remain readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8788/guide');
  await expect(page.getByRole('heading', { name: 'What is Mary supposed to learn?' })).toBeVisible();
  await page.goto('http://127.0.0.1:8788/exam');
  await expect(page.getByText('The examination needs JavaScript', { exact: false })).toBeVisible();
  await context.close();
});

// UI fixtures only; real Worker/D1 tests validate the proof and atomic update.
test('post preparation, error recovery, verification at the same URL, mobile PNG and name removal', async ({ page }, testInfo) => {
  const origin = 'http://127.0.0.1:8788', id = '00000000-0000-4000-8000-000000000001';
  let license = { id, handle: 'longest_handle_', issuedAt: '2026-10-05T00:00:00Z', version: 'C–01', xUserId: null, xVerifiedAt: null, verificationPostId: null };
  const proof = { nonce: 'a'.repeat(32), handle: license.handle, text: `I have earned my Consciousness License.\n${origin}/license/${id}`, expiresAt: Math.floor(Date.now()/1000)+1800, checksRemaining: 3 };
  let challenge = null, failedOnce = false;
  await page.route(`**/license/${id}*`, route => route.fulfill({ contentType: 'text/html', body: licensePage(license, origin) }));
  await page.route(`**/license/${id}/certificate.svg`, route => route.fulfill({ contentType: 'image/svg+xml', body: certificateSvg(license, origin) }));
  await page.route(`**/api/licenses/${id}/editor`, route => route.fulfill({ json: { canEdit: true, postAvailable: true, challenge } }));
  await page.route(`**/api/licenses/${id}/post-challenge`, async route => { challenge = proof; await route.fulfill({ json: proof }); });
  await page.route(`**/api/licenses/${id}/verify-post`, async route => {
    expect(route.request().postDataJSON()).toEqual({ url: 'https://x.com/longest_handle_/status/123', nonce: proof.nonce });
    if (!failedOnce) { failedOnce = true; await route.fulfill({ status: 503, json: { error: 'X is temporarily unavailable. Please try again.' } }); return; }
    license = { ...license, xUserId: '123456789', xVerifiedAt: new Date().toISOString(), verificationPostId: '123' };
    challenge = null;
    await route.fulfill({ json: license });
  });
  await page.route(`**/api/licenses/${id}`, async route => {
    expect(route.request().postDataJSON()).toEqual({ handle: '' });
    license = { ...license, handle: null, xUserId: null, xVerifiedAt: null, verificationPostId: null };
    await route.fulfill({ json: license });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/license/${id}`);
  await page.getByRole('button', { name: 'Prepare verification post' }).click();
  await expect(page.locator('#proof-text')).toHaveValue(proof.text);
  const compose = new URL(await page.locator('#compose-post').getAttribute('href'));
  expect(compose.origin).toBe('https://x.com');
  expect(compose.searchParams.get('text')).toBe(proof.text);
  expect(compose.searchParams.get('text')).not.toContain(proof.nonce);
  expect(compose.searchParams.get('text')).not.toContain('BCL-');
  await page.reload();
  await expect(page.locator('#proof-text')).toHaveValue(proof.text);
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('post-verification-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.getByLabel('URL of your published post').fill('https://x.com/longest_handle_/status/123');
  await page.getByRole('button', { name: 'Verify submitted post' }).click();
  await expect(page.locator('#handle-status')).toContainText('X is temporarily unavailable');
  await expect(page.locator('.license-presentation svg')).not.toContainText('X ACCOUNT VERIFIED');
  await page.getByRole('button', { name: 'Verify submitted post' }).click();
  await expect(page.locator('#auth-status')).toContainText('Your X account is verified');
  expect(new URL(page.url()).pathname).toBe(`/license/${id}`);
  await expect(page.locator('.license-presentation svg')).toContainText('X ACCOUNT VERIFIED');
  await expect(page.getByRole('link', { name: 'View the verification post' })).toHaveAttribute('href', 'https://x.com/i/status/123');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download license · PNG' }).click();
  await (await downloadPromise).saveAs(testInfo.outputPath('verified-license.png'));
  await page.getByRole('button', { name: 'Remove name' }).click();
  await expect(page.locator('#license-name')).toHaveText('An informed anonymous bearer.');
  await expect(page.locator('.license-presentation svg')).not.toContainText('X ACCOUNT VERIFIED');
});
