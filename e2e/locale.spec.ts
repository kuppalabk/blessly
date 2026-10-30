import { expect, test } from '@playwright/test';

test('locale: Arabic sets right-to-left direction and the page language', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'ww_lang', value: 'ar', url: baseURL! }]);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('locale: Hindi sets left-to-right direction and the page language', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'ww_lang', value: 'hi', url: baseURL! }]);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});
