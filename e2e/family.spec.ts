import { expect, test, type Page } from '@playwright/test';
import { signUp, todayInIndia, uniqueEmail } from './helpers';

function isoInIndia(offsetDays: number) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offsetDays * 86400000));
}

async function runCron(page: Page) {
  const r = await page.request.post('/api/cron', { headers: { authorization: 'Bearer e2e-cron-secret' } });
  expect(r.ok()).toBe(true);
  return r.json();
}

test('family circle: invite a relative, share a birthday, plan an event, split tasks and sign the group card', async ({ page, browser }) => {
  // Kiran creates the circle.
  await signUp(page, 'Kiran Sharma');
  await page.getByRole('navigation', { name: 'Main' }).last().getByRole('link', { name: 'Family', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Family Circle', exact: true })).toBeVisible();
  await expect(page.getByLabel('Circle name')).toHaveValue('The Sharma family');
  await page.getByRole('button', { name: 'Create family circle' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'The Sharma family' })).toBeVisible();
  const familyUrl = page.url();

  // Create an invite link (with a WhatsApp share).
  await page.getByRole('button', { name: 'Create invite link' }).click();
  const link = page.getByTestId('invite-link');
  await expect(link).toContainText('/join/');
  const inviteUrl = (await link.textContent())!.trim();
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /wa\.me\/\?text=.*join/);

  // Share Dadi's birthday with the family.
  await page.getByRole('link', { name: '+ Share someone' }).click();
  await expect(page.getByLabel('Share with family')).toHaveValue(/[0-9a-f-]{36}/);
  const bday = todayInIndia(10);
  await page.getByLabel('Name', { exact: true }).fill('Dadi Sharma');
  await page.getByLabel('Relationship').selectOption('Grandparent');
  await page.getByLabel('Month', { exact: true }).selectOption(String(bday.month));
  await page.getByLabel('Day', { exact: true }).fill(String(bday.day));
  await page.getByRole('button', { name: 'Save person' }).click();
  await expect(page.getByText(/Shared with The Sharma family/)).toBeVisible();

  // Aarav opens the invite link logged out, signs up and joins.
  const ctx2 = await browser.newContext({ ...test.info().project.use, timezoneId: 'Asia/Kolkata' });
  const aarav = await ctx2.newPage();
  await aarav.goto(inviteUrl);
  await expect(aarav).toHaveURL(/\/login\?next=%2Fjoin%2F/);
  await expect(aarav.getByText(/invited to a family circle/)).toBeVisible();
  await aarav.getByRole('link', { name: 'Create an account' }).click();
  await aarav.getByLabel('Your name').fill('Aarav Sharma');
  await aarav.getByLabel('Email').fill(uniqueEmail('aarav'));
  await aarav.getByLabel('Password').fill('correct horse battery');
  await aarav.getByRole('button', { name: 'Create account' }).click();
  await expect(aarav.getByText('Kiran Sharma invited you to')).toBeVisible();
  await aarav.getByRole('button', { name: 'Join the family circle' }).click();
  await expect(aarav).toHaveURL(/\/family\/[0-9a-f-]{36}$/);
  await expect(aarav.getByRole('heading', { level: 1, name: 'The Sharma family' })).toBeVisible();
  // Aarav sees the shared birthday (read-only) on People.
  await aarav.goto('/people');
  await expect(aarav.getByText('Shared by Kiran Sharma')).toBeVisible();
  await aarav.getByRole('link', { name: /Dadi Sharma/ }).click();
  await expect(aarav.getByText(/Only Kiran can edit/)).toBeVisible();
  await expect(aarav.getByRole('link', { name: 'Edit' })).toHaveCount(0);

  // Kiran is told Aarav joined.
  await page.goto('/notifications');
  await expect(page.getByText('Aarav Sharma joined your family circle')).toBeVisible();

  // Kiran plans the birthday dinner.
  await page.goto(familyUrl);
  await page.getByText('+ Add a family event').click();
  await page.getByLabel('What’s happening').fill("Dadi's 80th birthday dinner");
  await page.getByLabel('For', { exact: true }).selectOption({ label: 'Dadi Sharma' });
  await page.getByLabel('Date', { exact: true }).fill(isoInIndia(10));
  await page.getByLabel('Time', { exact: true }).fill('19:30');
  await page.getByLabel('Where (optional)').fill('Home, Pune');
  await page.getByRole('button', { name: 'Add event' }).click();
  await expect(page.getByRole('heading', { level: 1, name: "Dadi's 80th birthday dinner" })).toBeVisible();
  const eventUrl = page.url();
  await page.getByRole('button', { name: 'Going', exact: true }).click();
  await expect(page.getByText('1 going · 0 maybe')).toBeVisible();

  // Kiran assigns the cake to Aarav, and starts the group card.
  await page.getByLabel('New task').fill('Order the cake');
  await page.getByLabel('Assign to').selectOption({ label: 'Aarav Sharma' });
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('article', { name: 'Order the cake' })).toContainText('Aarav Sharma');
  await page.getByRole('button', { name: 'Start the group card' }).click();
  await expect(page.getByText('1 of 2 family signed')).toBeVisible();

  // Aarav gets alerts, RSVPs, starts his task and signs the card.
  await aarav.goto('/notifications');
  await expect(aarav.getByText("New family event: Dadi's 80th birthday dinner")).toBeVisible();
  await expect(aarav.getByText('Kiran Sharma asked you to: Order the cake')).toBeVisible();
  await expect(aarav.getByText('Sign the group card for Dadi')).toBeVisible();
  await aarav.goto(eventUrl);
  await aarav.getByRole('button', { name: 'Maybe' }).click();
  await expect(aarav.getByText('1 going · 1 maybe')).toBeVisible();
  await aarav.getByRole('article', { name: 'Order the cake' }).getByRole('button', { name: 'Start' }).click();
  await expect(aarav.getByRole('region', { name: /In progress \(1\)/ })).toContainText('Order the cake');
  await aarav.getByRole('link', { name: 'Sign the card' }).click();
  await expect(aarav.getByLabel('Your name')).toHaveValue('Aarav Sharma');
  await aarav.getByLabel('Message').fill('Happy 80th Dadi! See you at dinner.');
  await aarav.getByRole('button', { name: 'Add my wish' }).click();
  await expect(aarav.getByText('Thanks — your message has been added.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('2 of 2 family signed')).toBeVisible();

  // The event shows on both calendars and home screens.
  await aarav.goto('/home');
  await expect(aarav.getByRole('link', { name: /Dadi's 80th birthday dinner/ })).toBeVisible();

  // Shared birthday reminders reach Aarav too when the jobs run.
  await runCron(page);
  const plan = await aarav.request.get('/api/upcoming');
  expect(JSON.stringify(await plan.json())).toContain("Dadi Sharma's birthday");
  await ctx2.close();
});

test('invite links: bad links, viewers and permission checks', async ({ page, browser }) => {
  await signUp(page, 'Meena Iyer');
  await page.goto('/join/not-a-real-token-1234');
  await expect(page.getByRole('heading', { name: 'This invite link doesn’t work' })).toBeVisible();

  await page.goto('/family');
  await page.getByRole('button', { name: 'Create family circle' }).click();
  await expect(page).toHaveURL(/\/family\/[0-9a-f-]{36}$/);
  const familyId = page.url().split('/').pop()!;
  await page.getByLabel('Invite as').selectOption('viewer');
  await page.getByRole('button', { name: 'Create invite link' }).click();
  const inviteUrl = (await page.getByTestId('invite-link').textContent())!.trim();

  const ctx2 = await browser.newContext({ ...test.info().project.use, timezoneId: 'Asia/Kolkata' });
  const viewer = await ctx2.newPage();
  await signUp(viewer, 'Ravi Iyer');
  await viewer.goto(inviteUrl);
  await expect(viewer.getByText(/join as: Can view/)).toBeVisible();
  await viewer.getByRole('button', { name: 'Join the family circle' }).click();
  await expect(viewer).toHaveURL(/\/family\/[0-9a-f-]{36}$/);
  await expect(viewer.getByText('People in this circle')).toBeVisible();
  // Viewers can't add events, tasks, or invite.
  await expect(viewer.getByText('+ Add a family event')).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: 'Add task' })).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: 'Create invite link' })).toHaveCount(0);
  const denied = await viewer.request.post(`/api/families/${familyId}/events`, { data: { title: 'X', eventDate: isoInIndia(3) }, headers: { origin: new URL(viewer.url()).origin } });
  expect(denied.status()).toBe(403);
  // A stranger gets 404 for the circle.
  const ctx3 = await browser.newContext();
  const stranger = await ctx3.newPage();
  await signUp(stranger, 'Stranger');
  expect((await stranger.request.get(`/api/families/${familyId}`)).status()).toBe(404);
  await stranger.goto(`/family/${familyId}`);
  await expect(stranger.getByText(/not found|could not be found/i)).toBeVisible();
  await ctx2.close();
  await ctx3.close();
});

test('push: settings offer phone notifications and the API stores a device', async ({ page }) => {
  await signUp(page, 'Push Tester');
  const info = await (await page.request.get('/api/push')).json();
  expect(info.publicKey).toMatch(/^B[A-Za-z0-9_-]{60,}/);
  expect(info.devices).toBe(0);
  const origin = new URL(page.url()).origin;
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-test-device', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };
  const r = await page.request.post('/api/push', { data: sub, headers: { origin } });
  expect(r.status()).toBe(201);
  expect((await r.json()).devices).toBe(1);
  // Cross-site subscribe is blocked.
  expect((await page.request.post('/api/push', { data: sub, headers: { origin: 'https://evil.example' } })).status()).toBe(403);
  const del = await page.request.delete('/api/push', { data: { endpoint: sub.endpoint }, headers: { origin } });
  expect((await del.json()).devices).toBe(0);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Phone notifications' })).toBeVisible();
});
