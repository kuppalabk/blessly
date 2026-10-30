import { expect, test } from '@playwright/test';
import { addPerson, signUp, todayInIndia } from './helpers';

test('sign up, log out and log back in', async ({ page }) => {
  const { email, password } = await signUp(page, 'Asha Rao');
  await expect(page.getByRole('heading', { name: /Hello, Asha|wishes in the next two weeks/ })).toBeVisible();
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/people');
  await expect(page).toHaveURL(/\/login\?next=%2Fpeople/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('wrong password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('form').getByRole('alert')).toHaveText('Email or password is incorrect');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/people$/);
});

test('sign-up shows field errors', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('X');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter a valid email')).toBeVisible();
});

test('full journey: add person, write a wish in Hindi, pick a card, share and sign the wish page', async ({ page, browser }) => {
  await signUp(page, 'Kiran Sharma');
  const soon = todayInIndia(5);
  const personId = await addPerson(page, { name: 'Nisha Kapoor', relationship: 'Best friend', phone: '98765 43210', email: 'nisha@example.com', ...soon });

  // Person page shows the reminder plan
  await expect(page.getByText('In 5 days')).toBeVisible();
  for (const stage of ['Gift ideas', 'Wish drafted', 'Send today']) await expect(page.getByText(stage, { exact: true })).toBeVisible();

  // Home lists her
  await page.goto('/home');
  await expect(page.getByText("Nisha Kapoor's birthday").first()).toBeVisible();

  // Studio, opened from the person page
  await page.goto(`/people/${personId}`);
  await page.getByRole('link', { name: /Write a wish for Nisha/ }).click();
  await expect(page).toHaveURL(/\/create\?person=/);
  await expect(page.getByLabel('Their name on the wish')).toHaveValue('Nisha');
  await page.getByRole('button', { name: 'Write my wish' }).click();
  await expect(page.getByLabel('Your wish (edit freely)')).toHaveValue(/Happy birthday, Nisha!/);
  await page.getByLabel('Language', { exact: true }).selectOption('hi');
  await page.getByRole('button', { name: 'Rewrite' }).click();
  await expect(page.getByLabel('Your wish (edit freely)')).toHaveValue(/जन्मदिन मुबारक, Nisha!/);
  await expect(page.getByRole('img', { name: /जन्मदिन मुबारक, Nisha — design 1$/ })).toBeVisible();

  // Pick design 17 from the second page of designs
  await page.getByRole('button', { name: 'More designs' }).click();
  await page.getByRole('button', { name: /^Design 17:/ }).click();
  await expect(page.getByRole('heading', { name: /design 17 ·/ })).toBeVisible();
  await page.getByRole('button', { name: 'Save and send' }).click();

  // Send page
  await expect(page).toHaveURL(/\/wishes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Send to Nisha' })).toBeVisible();
  const pageUrl = (await page.getByTestId('page-url').textContent())!.trim();
  expect(pageUrl).toMatch(/\/w\/[A-Za-z0-9_-]{12}$/);
  const wa = await page.locator('a[data-channel="whatsapp"]').getAttribute('href');
  expect(wa).toContain('https://wa.me/919876543210?text=');
  expect(decodeURIComponent(wa!.split('text=')[1])).toContain('जन्मदिन मुबारक, Nisha!');
  expect(decodeURIComponent(wa!.split('text=')[1])).toContain(pageUrl);
  expect(await page.locator('a[data-channel="email"]').getAttribute('href')).toMatch(/^mailto:nisha%40example\.com\?subject=/);
  // Social networks get the wish page link.
  expect(await page.locator('a[data-channel="facebook"]').getAttribute('href')).toBe(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`);
  expect(await page.locator('a[data-channel="linkedin"]').getAttribute('href')).toContain(encodeURIComponent(pageUrl));
  expect(await page.locator('a[data-channel="x"]').getAttribute('href')).toContain(encodeURIComponent(pageUrl));

  // Schedule an email for tomorrow, then cancel it
  await page.getByRole('button', { name: 'Schedule' }).click();
  const scheduled = page.getByRole('list', { name: 'Scheduled' });
  await expect(scheduled.getByText('nisha@example.com')).toBeVisible();
  await scheduled.getByRole('button', { name: 'Cancel' }).click();
  await expect(scheduled.getByText('cancelled')).toBeVisible();

  // A guest opens the wish page and signs it
  const guest = await browser.newContext({ timezoneId: 'Europe/London' });
  const g = await guest.newPage();
  await g.goto(pageUrl);
  await expect(g.getByRole('img', { name: /जन्मदिन मुबारक, Nisha — design 17/ })).toBeVisible();
  await expect(g.getByText('Be the first to add a message for Nisha.')).toBeVisible();
  await g.getByLabel('Your name').fill('Arjun');
  await g.getByLabel('Message').fill('Happy 30th! Goa trip round two?');
  await g.getByRole('button', { name: 'Add my wish' }).click();
  await expect(g.getByRole('status')).toHaveText(/your message has been added/);
  await expect(g.getByText('Happy 30th! Goa trip round two?')).toBeVisible();
  await expect(g.getByRole('heading', { name: 'Wishes from friends · 1' })).toBeVisible();
  await guest.close();
});

test('edit and delete a person', async ({ page }) => {
  await signUp(page);
  const id = await addPerson(page, { name: 'Raj Sharma', relationship: 'Father', month: 3, day: 12 });
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Raj K Sharma');
  await page.getByRole('button', { name: '+ Add occasion' }).click();
  await page.getByLabel('Type', { exact: true }).nth(1).selectOption('anniversary');
  await page.getByLabel('Month', { exact: true }).nth(1).selectOption('2');
  await page.getByLabel('Day', { exact: true }).nth(1).fill('30');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('That date does not exist')).toBeVisible();
  await page.getByLabel('Day', { exact: true }).nth(1).fill('29');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Raj K Sharma' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Occasions and reminders' }).getByText('anniversary', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Raj K Sharma' }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page).toHaveURL(/\/people$/);
  await expect(page.getByText('No one here yet')).toBeVisible();
  const res = await page.request.get(`/api/people/${id}`);
  expect(res.status()).toBe(404);
});
