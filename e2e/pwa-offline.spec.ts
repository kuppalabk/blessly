import { expect, test } from '@playwright/test';

test('PWA: the offline page is served and the manifest is installable', async ({ page }) => {
  const res = await page.request.get('/offline');
  expect(res.ok()).toBeTruthy();
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.start_url).toBeTruthy();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBeTruthy();
});

test('PWA: service worker file is served with JavaScript type', async ({ page }) => {
  const res = await page.request.get('/sw.js');
  expect(res.ok()).toBeTruthy();
  expect(res.headers()['content-type']).toMatch(/javascript/);
});
