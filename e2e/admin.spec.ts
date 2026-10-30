import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { enable2fa, signUp, uniqueEmail } from './helpers';

const DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5433/wishwell';
async function sql<T = Record<string, unknown>>(q: string, params: unknown[] = []) {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try { return (await c.query(q, params)).rows as T[]; } finally { await c.end(); }
}

async function logIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

test('platform admin: dashboard, suspend and restore a user, business allowance and pause, audit log', async ({ page, browser }) => {
  // A regular user with a business.
  const ctx = await browser.newContext({ ...test.info().project.use });
  const user = await ctx.newPage();
  const userEmail = uniqueEmail('member');
  const { password } = await signUp(user, 'Rita Member', userEmail);
  await user.request.post('/api/business', { data: { name: `Rita Bakes ${Date.now()}` }, headers: { origin: new URL(user.url()).origin } });
  // Not an admin: the admin area doesn't exist for them.
  await user.goto('/admin');
  await expect(user.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  expect((await user.request.get('/api/admin/users')).status()).toBe(404);

  // The admin (granted from the command line — simulated here in the database).
  const adminEmail = uniqueEmail('admin');
  await signUp(page, 'Ada Admin', adminEmail);
  await sql("update users set role = 'admin' where email = $1", [adminEmail]);
  await enable2fa(page);
  await page.goto('/settings');
  await page.getByRole('link', { name: /Platform admin/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Platform admin' })).toBeVisible();
  await expect(page.getByText('Sign-ups, last 14 days')).toBeVisible();

  // Find and suspend the user.
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Users' }).click();
  await page.getByLabel('Search users').fill(userEmail);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('link', { name: 'Rita Member' }).click();
  await expect(page.getByText('For privacy, admins see counts')).toBeVisible();
  await page.getByRole('button', { name: 'Suspend…' }).click();
  await page.getByLabel('Reason (kept in the audit log)').fill('Reported for spam');
  await page.getByRole('button', { name: 'Suspend account' }).click();
  await expect(page.getByText(/Suspended .* — Reported for spam/)).toBeVisible();

  // Their session is gone and they can't log back in.
  await user.goto('/home');
  await expect(user).toHaveURL(/\/login/);
  await logIn(user, userEmail, password);
  await expect(user.locator('form').getByRole('alert')).toHaveText('This account is suspended. Please contact support.');

  // Their business was paused too; set an allowance, then restore the account.
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Businesses' }).click();
  await page.getByLabel('Search businesses').fill(userEmail);
  await page.getByRole('button', { name: 'Search' }).click();
  const card = page.getByRole('listitem').filter({ hasText: userEmail });
  await expect(card).toContainText('Paused');
  await expect(card).toContainText('Owner suspended: Reported for spam');
  await card.getByRole('textbox', { name: /Monthly allowance/ }).fill('5000');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByRole('status')).toHaveText('Allowance saved');
  await page.goto('/admin/users?filter=suspended');
  await page.getByRole('link', { name: 'Rita Member' }).click();
  await page.getByRole('button', { name: 'Restore account' }).click();
  await expect(page.getByRole('status')).toHaveText('Account restored');
  await logIn(user, userEmail, password);
  await expect(user).toHaveURL(/\/home$/);
  await user.goto('/business');
  await expect(user.getByText(/paused sending/)).toHaveCount(0);

  // Admins can't suspend themselves or other admins.
  const [me] = await sql<{ id: string }>('select id from users where email = $1', [adminEmail]);
  await page.goto(`/admin/users/${me.id}`);
  await expect(page.getByText('can only be changed from the command line')).toBeVisible();

  // Audit log.
  await page.goto('/admin/audit');
  const mine = page.getByRole('row').filter({ hasText: adminEmail });
  for (const a of ['user.suspend', 'business.quota', 'user.unsuspend']) await expect(mine.filter({ hasText: a })).toHaveCount(1);
  await expect(mine.filter({ hasText: 'user.suspend' })).toContainText('Reported for spam');

  // System page renders configuration checks.
  await page.goto('/admin/system');
  await expect(page.getByRole('heading', { name: 'Configuration' })).toBeVisible();
  await ctx.close();
});

test('forgot password: email link sets a new password and logs in; the old password stops working', async ({ page }) => {
  const email = uniqueEmail('forgot');
  await signUp(page, 'Forgetful Fran', email);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('a reset link is on its way');
  const [mail] = await sql<{ body: string }>("select body from outbox where recipient = $1 and subject = 'Reset your Blessly password'", [email]);
  const link = /\/reset\/[\w-]+/.exec(mail.body)![0];
  await page.goto(link);
  await page.getByLabel('New password').fill('a much better password');
  await page.getByLabel('Type it again').fill('a different password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('main').getByRole('alert').or(page.locator('form').getByRole('alert'))).toHaveText('The two passwords don’t match');
  await page.getByLabel('Type it again').fill('a much better password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page).toHaveURL(/\/home$/);
  // The link can't be used twice.
  await page.goto(link);
  await page.getByLabel('New password').fill('yet another password');
  await page.getByLabel('Type it again').fill('yet another password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('link', { name: 'Send a new link' })).toBeVisible();
  await page.context().clearCookies();
  await logIn(page, email, 'correct horse battery');
  await expect(page.locator('form').getByRole('alert')).toHaveText('Email or password is incorrect');
});

test('download my data and delete my account', async ({ page }) => {
  const email = uniqueEmail('leaver');
  const { password } = await signUp(page, 'Leo Leaver', email);
  await page.goto('/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download my data' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^blessly-data-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await (await page.request.get('/api/me/export')).text());
  expect(data.account.email).toBe(email);
  expect(JSON.stringify(data)).not.toContain('passwordHash');

  await page.getByRole('button', { name: 'Delete my account…' }).click();
  const form = page.getByRole('form', { name: 'Delete my account' });
  await expect(form.getByRole('button', { name: 'Delete forever' })).toBeDisabled();
  await form.getByLabel('Your password').fill('wrong password');
  await form.getByLabel('Type DELETE to confirm').fill('DELETE');
  await form.getByRole('button', { name: 'Delete forever' }).click();
  await expect(form.getByRole('alert')).toHaveText('That password isn’t right');
  await form.getByLabel('Your password').fill(password);
  await form.getByRole('button', { name: 'Delete forever' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await sql('select 1 from users where email = $1', [email])).toHaveLength(0);
});

test('support view: admin sees the app as the user, read-only, then exits back to admin', async ({ page, browser }) => {
  const ctx = await browser.newContext({ ...test.info().project.use });
  const user = await ctx.newPage();
  const userEmail = uniqueEmail('helpme');
  await signUp(user, 'Helen Help', userEmail);
  await user.request.post('/api/people', { data: { name: 'Nisha', relationship: 'Friend', occasions: [{ kind: 'birthday', month: 3, day: 4 }] }, headers: { origin: new URL(user.url()).origin } });

  const adminEmail = uniqueEmail('support-admin');
  await signUp(page, 'Sid Support', adminEmail);
  await sql("update users set role = 'admin' where email = $1", [adminEmail]);
  await enable2fa(page);
  const [u] = await sql<{ id: string }>('select id from users where email = $1', [userEmail]);
  await page.goto(`/admin/users/${u.id}`);
  await page.getByRole('button', { name: 'View as user…' }).click();
  await page.getByLabel('Reason (they’ll see it)').fill('Birthday reminder missing');
  await page.getByRole('button', { name: 'Start support view' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('status').filter({ hasText: 'Support view of Helen Help' })).toBeVisible();
  await page.goto('/people');
  await expect(page.getByRole('link', { name: /Nisha/ })).toBeVisible();
  // Changes are blocked.
  const blocked = await page.request.post('/api/people', { data: { name: 'X', relationship: 'Friend' }, headers: { origin: new URL(page.url()).origin } });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).code).toBe('read_only');
  expect((await page.request.get('/api/me/export')).status()).toBe(403);
  // The admin area isn't reachable as the user.
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.goto('/home');
  await page.getByRole('button', { name: 'Exit' }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Platform admin' })).toBeVisible();
  // The user was told.
  await user.goto('/notifications');
  await expect(user.getByText('Blessly support viewed your account')).toBeVisible();
  await expect(user.getByText(/Birthday reminder missing/)).toBeVisible();
  await ctx.close();
});
