import { expect, type Page } from '@playwright/test';

export const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

export async function signUp(page: Page, name = 'Kiran Sharma', email = uniqueEmail('e2e')) {
  await page.goto('/signup');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/home$/);
  return { email, password: 'correct horse battery' };
}

/** Today's month/day in India, matching the browser timezone used by the tests. */
export function todayInIndia(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', month: 'numeric', day: 'numeric' }).formatToParts(d);
  return { month: Number(parts.find((p) => p.type === 'month')!.value), day: Number(parts.find((p) => p.type === 'day')!.value) };
}

export async function addPerson(page: Page, opts: { name: string; relationship?: string; phone?: string; email?: string; month: number; day: number; language?: string }) {
  await page.goto('/people/new');
  await page.getByLabel('Name', { exact: true }).fill(opts.name);
  if (opts.relationship) await page.getByLabel('Relationship').selectOption(opts.relationship);
  if (opts.language) await page.getByLabel('Wish language').selectOption(opts.language);
  if (opts.phone) await page.getByLabel('Mobile (for WhatsApp and SMS)').fill(opts.phone);
  if (opts.email) await page.getByLabel('Email', { exact: true }).fill(opts.email);
  await page.getByLabel('Month', { exact: true }).selectOption(String(opts.month));
  await page.getByLabel('Day', { exact: true }).fill(String(opts.day));
  await page.getByRole('button', { name: 'Save person' }).click();
  await expect(page.getByRole('heading', { level: 1, name: opts.name })).toBeVisible();
  return page.url().split('/').pop()!;
}

/** Turns on two-step verification from Settings (admins need it). Returns the authenticator secret. */
export async function enable2fa(page: Page) {
  const { totp } = await import('../src/server/totp');
  await page.goto('/settings/security');
  await page.getByRole('button', { name: 'Turn on' }).click();
  const secret = (await page.getByTestId('totp-secret').textContent())!.trim();
  await page.getByLabel('2. Enter the 6-digit code it shows').fill(totp(secret));
  await page.getByRole('button', { name: 'Confirm and turn on' }).click();
  await expect(page.getByTestId('recovery-codes')).toBeVisible();
  const codes = (await page.getByTestId('recovery-codes').textContent())!.trim().split(/\s+/);
  await page.getByRole('button', { name: 'I’ve saved them' }).click();
  return { secret, codes };
}
