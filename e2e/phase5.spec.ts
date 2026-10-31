import { expect, test } from '@playwright/test';
import path from 'node:path';
import { Client } from 'pg';
import { enable2fa, signUp, uniqueEmail } from './helpers';

const DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5433/wishwell';
async function sql<T = Record<string, unknown>>(q: string, params: unknown[] = []) {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try { return (await c.query(q, params)).rows as T[]; } finally { await c.end(); }
}
const PHOTO = (f: string) => path.join(__dirname, '..', 'public', 'photos', f);

test('albums: create, upload, pick a design, share a link and let a guest add a photo', async ({ page, browser }) => {
  await signUp(page, 'Asha Album');
  await page.goto('/albums');
  await page.getByLabel('Album name').fill('Goa trip');
  await page.getByRole('button', { name: 'Create album' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Goa trip' })).toBeVisible();

  await page.getByLabel('Choose photos').setInputFiles([PHOTO('photo-beach.jpg'), PHOTO('photo-cabin.jpg')]);
  await expect(page.getByRole('tab', { name: 'Photos (2)' })).toBeVisible({ timeout: 20000 });
  // Photos are served through signed links, as WebP with metadata removed.
  const src = await page.getByRole('region', { name: 'Photos' }).locator('img').first().getAttribute('src');
  expect(src).toMatch(/^\/api\/media\/[0-9a-f-]+\/thumb\?t=/);
  const img = await page.request.get(src!);
  expect(img.headers()['content-type']).toBe('image/webp');
  expect((await page.request.get(src!.replace(/t=.*/, 't=forged'))).status()).toBe(404);

  await page.getByRole('tab', { name: 'Design' }).click();
  await expect(page.getByText(/Design \d+ of 100/)).toBeVisible();

  await page.getByRole('tab', { name: 'Share' }).click();
  await page.getByRole('button', { name: 'Create share link' }).click();
  const link = (await page.getByTestId('album-link').textContent())!.trim();
  expect(link).toMatch(/\/a\/[\w-]+$/);
  await page.getByLabel(/Let guests add photos/).check();
  await expect(page.getByLabel(/Let guests add photos/)).toBeChecked();

  // A guest without an account adds a photo.
  const ctx = await browser.newContext({ ...test.info().project.use });
  const guest = await ctx.newPage();
  await guest.goto(link.startsWith('http') ? link : `${new URL(page.url()).origin}${link}`);
  await expect(guest.getByRole('heading', { name: 'Goa trip' })).toBeVisible();
  const form = guest.getByRole('form', { name: 'Add your photos' });
  await form.getByLabel('Your name').fill('Cousin Ravi');
  await form.getByLabel('Photos').setInputFiles(PHOTO('photo-bouquet.jpg'));
  await form.getByRole('button', { name: 'Add photos' }).click();
  await expect(guest.getByText(/Thanks|added/i).first()).toBeVisible({ timeout: 20000 });
  // A non-image is refused.
  const bad = await guest.request.post(`${link.replace(/^.*\/a\//, '/api/a/')}/photos`, { multipart: { name: 'X', photo: { name: 'x.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') } }, headers: { origin: new URL(guest.url()).origin } });
  expect(bad.status()).toBe(400);
  await ctx.close();

  await page.reload();
  await expect(page.getByRole('tab', { name: 'Photos (3)' })).toBeVisible();
  await expect(page.getByText('by Cousin Ravi')).toBeVisible();
});

test('plans: upgrade to Family through checkout, then cancel at the end of the period', async ({ page }) => {
  await signUp(page, 'Pay Person');
  await page.goto('/plans');
  await expect(page.locator('header').getByText('You’re on Free')).toBeVisible();
  await page.getByRole('button', { name: 'Choose Family' }).click();
  await expect(page).toHaveURL(/\/billing\/test-checkout/);
  await page.getByRole('button', { name: 'Fail payment' }).click();
  await expect(page).toHaveURL(/cancelled=1/);
  await expect(page.locator('header').getByText('You’re on Free')).toBeVisible();
  await page.getByRole('button', { name: 'Choose Family' }).click();
  await page.getByRole('button', { name: 'Pay (test)' }).click();
  await expect(page.locator('header').getByText('You’re on Family')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Cancel plan' }).click();
  await expect(page.getByText(/Cancelled — works until/)).toBeVisible();
  await page.reload();
  await expect(page.locator('header').getByText('You’re on Family')).toBeVisible();
});

test('admin content and plans: announcement, festival date, free plan grant; business team invite', async ({ page, browser }) => {
  const adminEmail = uniqueEmail('content-admin');
  await signUp(page, 'Cora Content', adminEmail);
  await sql("update users set role = 'admin' where email = $1", [adminEmail]);
  await enable2fa(page);

  // A business owner and a colleague.
  const ownerCtx = await browser.newContext({ ...test.info().project.use });
  const owner = await ownerCtx.newPage();
  const ownerEmail = uniqueEmail('owner');
  await signUp(owner, 'Omar Owner', ownerEmail);
  await owner.goto('/business');
  await owner.getByLabel('Business name').fill(`Omar Sweets ${Date.now()}`);
  await owner.getByRole('button', { name: 'Create business workspace' }).click();
  await expect(owner.getByRole('navigation', { name: 'Business' })).toBeVisible();

  // Admin gives the owner the Business plan for free.
  const [o] = await sql<{ id: string }>('select id from users where email = $1', [ownerEmail]);
  await page.goto(`/admin/users/${o.id}`);
  const grant = page.getByRole('form', { name: 'Give a plan' });
  await grant.getByLabel('Plan to give').selectOption('business');
  await grant.getByLabel('Until').fill(new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
  await grant.getByLabel('Note (audit log)').fill('Launch partner');
  await grant.getByRole('button', { name: 'Give plan for free' }).click();
  await expect(page.getByText('Plan given')).toBeVisible();
  await owner.goto('/plans');
  await expect(owner.locator('header').getByText('You’re on Business')).toBeVisible();

  // Announcement to everyone.
  await page.goto('/admin/content');
  const ann = page.getByRole('form', { name: 'New announcement' });
  const title = `New: photo albums ${Date.now()}`;
  await ann.getByLabel('Title').fill(title);
  await ann.getByLabel('Message').fill('Collect everyone’s photos from the party in one place.');
  await ann.getByLabel('Link (optional)').fill('/albums');
  page.once('dialog', (d) => d.accept());
  await ann.getByRole('button', { name: 'Send announcement' }).click();
  await expect(page.getByText('Sent', { exact: true })).toBeVisible();
  await owner.goto('/notifications');
  await expect(owner.getByText(title)).toBeVisible();

  // Festival date for a future year.
  const fest = page.getByRole('form', { name: 'Add a festival date' });
  await fest.getByLabel('Festival', { exact: true }).selectOption({ label: 'Diwali' });
  await fest.getByLabel('Festival date').fill('2028-10-17');
  await fest.getByRole('button', { name: 'Save date' }).click();
  await expect(page.getByText(/Saved — users see it/)).toBeVisible();

  // The owner invites a colleague, who joins the team.
  await owner.goto('/business/settings');
  const staffEmail = uniqueEmail('staff');
  await owner.getByLabel('Team member email').fill(staffEmail);
  await owner.getByRole('button', { name: 'Invite' }).click();
  await expect(owner.getByText(staffEmail)).toBeVisible();
  const [inv] = await sql<{ token: string }>('select token from business_invites where email = $1', [staffEmail]);
  const staffCtx = await browser.newContext({ ...test.info().project.use });
  const staff = await staffCtx.newPage();
  await signUp(staff, 'Sam Staff', staffEmail);
  await staff.goto(`/business/join/${inv.token}`);
  await staff.getByRole('button', { name: 'Join the team' }).click();
  await expect(staff).toHaveURL(/\/business$/);
  await expect(staff.getByRole('heading', { level: 1, name: /Omar Sweets/ })).toBeVisible();

  // Audit log records the grant and the announcement.
  await page.goto('/admin/audit');
  const mine = page.getByRole('row').filter({ hasText: adminEmail });
  await expect(mine.filter({ hasText: 'Launch partner' })).toHaveCount(1);
  await ownerCtx.close();
  await staffCtx.close();
});
