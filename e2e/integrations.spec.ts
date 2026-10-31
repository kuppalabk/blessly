import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { enable2fa, signUp, uniqueEmail } from './helpers';

const DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5433/wishwell';
async function sql(q: string, params: unknown[] = []) {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try { return (await c.query(q, params)).rows; } finally { await c.end(); }
}

test('super admin saves a Stripe key, sees it masked, and clears it', async ({ page }) => {
  const email = uniqueEmail('owner');
  const { password } = await signUp(page, 'Owner Admin', email);
  await sql("update users set role = 'admin' where email = $1", [email]);
  await enable2fa(page);

  await page.goto('/admin/integrations');
  const row = page.getByTestId('setting-STRIPE_SECRET_KEY');
  await row.locator('input').fill('sk_test_E2E_SECRET_7890');
  await row.getByRole('button', { name: 'Save' }).click();

  await expect(row.getByText('••••7890')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('sk_test_E2E_SECRET');

  // The audit log records the change without the value.
  const rows = await sql("select details from admin_audit where target_id = 'STRIPE_SECRET_KEY' and action = 'setting.save'");
  expect(rows.length).toBeGreaterThan(0);
  expect(JSON.stringify(rows)).not.toContain('sk_test_E2E_SECRET');

  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'Clear' }).click();
  await expect(row.getByText('••••7890')).toHaveCount(0);
});

test('a regular user cannot read or change integration keys', async ({ page }) => {
  await signUp(page, 'Plain User', uniqueEmail('plain'));
  expect((await page.request.get('/api/admin/settings')).status()).toBe(404);
  const origin = new URL(page.url()).origin;
  expect((await page.request.put('/api/admin/settings/STRIPE_SECRET_KEY', { data: { value: 'x' }, headers: { origin } })).status()).toBe(404);
});
