import { expect, test } from '@playwright/test';
import { enable2fa, signUp, uniqueEmail } from './helpers';
import { totp } from '../src/server/totp';

const nextGoogleUser = (who: { sub: string; email: string; name: string }) => fetch('http://localhost:3198/__next', { method: 'POST', body: JSON.stringify(who) });

test('Continue with Google: new account, no password; later sets a password and connects again', async ({ page }) => {
  const email = uniqueEmail('olivia');
  await nextGoogleUser({ sub: `g-${Date.now()}`, email, name: 'Olivia Google' });
  await page.goto('/signup');
  await page.getByRole('link', { name: 'Continue with Google' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/settings/security');
  await expect(page.getByText('Not set — you sign in with the options below')).toBeVisible();
  await expect(page.getByText(`Connected · ${email}`)).toBeVisible();
  // Can't remove the only way in.
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.locator('p.error')).toContainText('Set a password first');
  await page.getByLabel('Set a password').fill('a brand new password');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText('Password set.')).toBeVisible();
  // Signing in with Google again goes to the same account.
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByRole('link', { name: 'Continue with Google' }).click();
  await expect(page).toHaveURL(/\/home$/);
  // A tampered callback is refused.
  await page.context().clearCookies();
  await page.goto('/api/auth/oauth/google/callback?code=x&state=forged');
  await expect(page).toHaveURL(/\/login\?error=expired/);
  await expect(page.locator('p.error')).toContainText('took too long');
});

test('two-step verification and phone codes', async ({ page }) => {
  const { email, password } = await signUp(page, 'Tara Twostep');
  const { secret, codes } = await enable2fa(page);
  expect(codes).toHaveLength(10);
  // Add a mobile number (the code is shown on screen in test mode).
  const phone = `+4477009${String(Date.now()).slice(-5)}`;
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Add number' }).click();
  const code = (await page.getByTestId('dev-code').locator('b').textContent())!;
  await page.getByLabel('Code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('Number verified.')).toBeVisible();

  // Password + authenticator code.
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/login\/2fa/);
  expect((await page.request.get('/api/me/security')).status()).toBe(401); // no session yet
  await page.getByLabel('Code').fill('000000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('p.error')).toContainText('isn’t right');
  await page.getByLabel('Code').fill(totp(secret, Date.now() + 30_000));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/home$/);

  // Text-message code + a recovery code (lost phone).
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByRole('link', { name: /Sign in with a text message code/ }).click();
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Text me a code' }).click();
  const smsCode = (await page.getByTestId('dev-code').locator('b').textContent())!;
  await page.getByLabel('Code').fill(smsCode);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/login\/2fa/);
  await page.getByRole('button', { name: /Use a recovery code/ }).click();
  await page.getByLabel('Recovery code').fill(codes[0]);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/settings/security');
  await expect(page.getByText('9 recovery codes left.')).toBeVisible();
});
