import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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
  await page.getByLabel('X handle (self-declared)').fill('@Bureau_Test');
  await page.getByRole('button', { name: 'Save handle', exact: true }).click();
  await expect(page.locator('#license-name')).toHaveText('@Bureau_Test');
  await page.reload();
  await expect(page.locator('#license-name')).toHaveText('@Bureau_Test');
  await expect(page).toHaveTitle(/@Bureau_Test/);
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
  await expect(publicPage.locator('meta[property="og:title"]')).toHaveAttribute('content', /@Bureau_Test/);
  await expect(publicPage.locator('body')).not.toContainText('15 of 15');
  await visitor.close();
  await page.getByLabel('X handle (self-declared)').fill('');
  await page.getByRole('button', { name: 'Save handle', exact: true }).click();
  await expect(page.locator('#license-name')).toHaveText('An informed anonymous bearer.');
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
