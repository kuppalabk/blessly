import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { enable2fa, signUp, uniqueEmail } from './helpers';

const DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5433/wishwell';
async function sql<T = Record<string, unknown>>(q: string, params: unknown[] = []) {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try { return (await c.query(q, params)).rows as T[]; } finally { await c.end(); }
}

test('promo codes and the partner programme, end to end', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const code = `LAUNCH${Date.now() % 100000}`;

  // Admin creates a 20% code for gift cards and shop items.
  const adminCtx = await browser.newContext({ ...test.info().project.use });
  const admin = await adminCtx.newPage();
  const adminEmail = uniqueEmail('promo-admin');
  await signUp(admin, 'Ada Offers', adminEmail);
  await sql("update users set role = 'admin' where email = $1", [adminEmail]);
  await enable2fa(admin);
  await admin.goto('/admin/promotions');
  await admin.getByLabel('Code', { exact: true }).fill(code);
  await admin.getByLabel('Name customers see', { exact: true }).fill('Launch offer');
  await admin.getByLabel('Percentage (1–100)').fill('20');
  await admin.getByRole('button', { name: 'Create code' }).click();
  await expect(admin.getByText('Promo code created.')).toBeVisible();

  // Customer applies the code to a ₹500 gift card, sees the new total, and pays it.
  await signUp(page, 'Gita Giver', uniqueEmail('promo-buyer'));
  await page.goto('/gift-cards');
  await page.getByRole('button', { name: /Bean & Leaf Café/ }).click();
  await page.getByRole('button', { name: '₹500', exact: true }).click();
  await page.getByLabel('Promo code', { exact: true }).fill(code.toLowerCase());
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Launch offer' })).toContainText('₹100');
  await page.getByLabel('Recipient’s name').fill('Jo');
  await page.getByLabel('Recipient’s email').fill(uniqueEmail('jo'));
  await page.getByRole('button', { name: /Buy ₹500 gift card/ }).click();
  await page.getByRole('button', { name: 'Pay ₹400 (test)' }).click();
  await expect(page).toHaveURL(/\/orders\?paid=1/);
  const [o] = await sql<{ amount: number; details: string }>("select amount, details from orders where kind = 'giftcard' order by created_at desc limit 1");
  expect(o.amount).toBe(40000);
  expect(JSON.parse(o.details).promo).toMatchObject({ code, base: 50000, discount: 10000 });
  // The code is recorded, so it can't be used a second time by the same customer.
  await page.goto('/gift-cards');
  await page.getByRole('button', { name: /Bean & Leaf Café/ }).click();
  await page.getByRole('button', { name: '₹500', exact: true }).click();
  await page.getByLabel('Promo code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('already used this code');

  // A partner applies, the admin approves, and the partner sees their link and code.
  const partnerCtx = await browser.newContext({ ...test.info().project.use });
  const partner = await partnerCtx.newPage();
  await signUp(partner, 'Pia Partner', uniqueEmail('promo-partner'));
  await partner.goto('/affiliate');
  await partner.getByRole('button', { name: 'Apply to join', exact: true }).click();
  await expect(partner.getByText('Waiting for review')).toBeVisible();

  await admin.goto('/admin/promotions');
  await admin.locator('li', { hasText: 'Pia Partner' }).getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(admin.getByText('Partner approved.')).toBeVisible();

  await partner.reload();
  await expect(partner.getByText('Your link', { exact: true })).toBeVisible();
  await expect(partner.getByText('Your code', { exact: true })).toBeVisible();
});
