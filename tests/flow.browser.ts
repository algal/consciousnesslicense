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
  await expect(page.getByRole('button', { name: 'Verify with X' })).toBeDisabled();
  await expect(page.locator('#handle-status')).toContainText('X sign-in is not available at this address');
  // Loopback is deliberately not an OAuth callback host. Arbitrary handle edits are rejected.
  const invented = await page.request.patch(`/api/licenses/${licenseUrl.split('/').pop()}`, {
    headers: { Origin: 'http://127.0.0.1:8788' }, data: { handle: 'Bureau_Test' },
  });
  expect(invented.status()).toBe(400);
  await page.reload();
  await expect(page.locator('#license-name')).toHaveText('An informed anonymous bearer.');
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
  await expect(publicPage.locator('#license-name')).toHaveText('An informed anonymous bearer.');
  await expect(publicPage.locator('#personalization')).toBeHidden();
  await expect(publicPage.locator('meta[property="og:title"]')).toHaveAttribute('content', /An anonymous bearer/);
  await expect(publicPage.locator('body')).not.toContainText('15 of 15');
  await visitor.close();
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

// Render verified fixtures through the real templates without a test-only production auth bypass.
// Provider exchange and persistence are tested separately against D1 in worker.test.ts.
test('verified mobile artwork, download, and removal UI use the authoritative record', async ({ page }, testInfo) => {
  const origin = 'http://127.0.0.1:8788';
  const id = '00000000-0000-4000-8000-000000000001';
  let license = { id, handle: 'longest_handle_', issuedAt: '2026-10-05T00:00:00Z', version: 'C–01', xUserId: '123456789', xVerifiedAt: '2026-10-05T00:00:00Z' };
  await page.route(`**/license/${id}*`, route => route.fulfill({ contentType: 'text/html', body: licensePage(license, origin) }));
  await page.route(`**/license/${id}/certificate.svg`, route => route.fulfill({ contentType: 'image/svg+xml', body: certificateSvg(license, origin) }));
  await page.route(`**/api/licenses/${id}/editor`, route => route.fulfill({ json: { canEdit: true, xAvailable: true } }));
  await page.route(`**/api/licenses/${id}/verify-x`, route => route.fulfill({ status: 503, json: { error: 'X is temporarily unavailable. Please try again.' } }));
  await page.route(`**/api/licenses/${id}`, async route => {
    expect(route.request().postDataJSON()).toEqual({ handle: '' });
    license = { ...license, handle: null, xUserId: null, xVerifiedAt: null };
    await route.fulfill({ json: license });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/license/${id}`);
  await expect(page.locator('#license-name')).toHaveText('@longest_handle_');
  await expect(page.locator('.license-presentation svg')).toContainText('X ACCOUNT VERIFIED');
  await expect(page.locator('.verification-notes')).toContainText('123456789');
  await page.screenshot({ path: testInfo.outputPath('verified-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download license · PNG' }).click();
  await (await downloadPromise).saveAs(testInfo.outputPath('verified-license.png'));
  await page.getByRole('button', { name: 'Refresh X verification' }).click();
  await expect(page.locator('#handle-status')).toContainText('X is temporarily unavailable');
  await expect(page.getByRole('button', { name: 'Refresh X verification' })).toBeEnabled();
  await page.getByRole('button', { name: 'Remove name' }).click();
  await expect(page.locator('#license-name')).toHaveText('An informed anonymous bearer.');
  await expect(page.locator('#auth-status')).toContainText('Your license is now anonymous');
  await expect(page.locator('.license-presentation svg')).not.toContainText('X ACCOUNT VERIFIED');
  await page.goto(`/license/${id}?x=x-token`);
  await expect(page.locator('#auth-status')).toBeInViewport();
  await expect(page.locator('#auth-status')).toContainText('could not complete the token exchange');
  await page.goto(`/license/${id}?x=verified`);
  await expect(page.locator('#auth-status')).toContainText('No X verification is currently on file');
});
