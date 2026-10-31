import { expect, test, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { Client } from 'pg';
import { signUp, todayInIndia } from './helpers';

const MOCK = 'http://localhost:3199';

async function webhook(page: Page, body: object, secret = 'e2e-app-secret') {
  const raw = JSON.stringify(body);
  const sig = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  return page.request.post('/api/webhooks/whatsapp', { data: raw, headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig } });
}
const change = (phoneId: string, value: object) => ({ object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: phoneId }, ...value } }] }] });

test('business: connect WhatsApp, add and import customers, automatic birthday wish, delivery ticks and STOP', async ({ page }) => {
  const phoneId = String(Date.now()).slice(-10) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  const mobile = '9' + String(Date.now()).slice(-9);
  await signUp(page, 'Priya Mehta');
  await page.goto('/business');
  await expect(page.getByRole('heading', { name: 'Wish every customer, automatically' })).toBeVisible();
  await page.getByLabel('Business name').fill('Sweet Treats');
  await page.getByRole('button', { name: 'Create business workspace' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sweet Treats' })).toBeVisible();
  await expect(page.getByText('WhatsApp not connected')).toBeVisible();

  // Connect WhatsApp: a wrong token is refused by "Meta", the right one connects and loads templates.
  await page.getByRole('navigation', { name: 'Business' }).getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Phone number ID').fill(phoneId);
  await page.getByLabel('WhatsApp Business Account ID').fill('2233445566');
  await page.getByLabel('Permanent access token').fill('EAAG-wrong-token-000000000000');
  await page.getByRole('button', { name: 'Connect WhatsApp' }).click();
  await expect(page.getByRole('form', { name: 'Connect WhatsApp' }).getByRole('alert')).toContainText('Invalid OAuth access token');
  await page.getByLabel('Permanent access token').fill('EAAG-e2e-token-0000000000000');
  await page.getByRole('button', { name: 'Connect WhatsApp' }).click();
  await expect(page.getByText('WhatsApp +91 98765 00000')).toBeVisible();
  await expect(page.getByText('birthday_wish')).toBeVisible();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  // The token is never sent back to the browser.
  expect(JSON.stringify(await (await page.request.get('/api/business')).json())).not.toContain('EAAG');

  // Add a customer whose birthday is today.
  const today = todayInIndia(0);
  await page.goto('/business/customers/new');
  await page.getByLabel('Name', { exact: true }).fill('Nisha Kapoor');
  await page.getByLabel('WhatsApp / mobile').fill(mobile);
  await page.getByLabel('Birthday month').selectOption(String(today.month));
  await page.getByLabel('Birthday day').fill(String(today.day));
  await page.getByLabel('This customer agreed to receive messages from us').check();
  await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByRole('heading', { name: 'Nisha Kapoor' })).toBeVisible();

  // Import more customers from CSV.
  await page.goto('/business/customers/import');
  await page.getByLabel('CSV text').fill(`name,mobile,email,birthday,tags\nAnil Rao,,anil-${phoneId}@example.com,${today.day}/${today.month},vip\n"Kapoor, Meera",+44 7700 9${phoneId.slice(-5)},,14 Mar,vip\nNo Contact,,,,\n`);
  await page.getByRole('button', { name: 'Import customers' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Confirm that these customers agreed');
  await page.getByLabel('Everyone in this file agreed to receive messages from my business').check();
  await page.getByRole('button', { name: 'Import customers' }).click();
  await expect(page.getByRole('status', { name: 'Import result' })).toContainText('2 added · 0 updated · 1 skipped');
  await expect(page.getByText('Row 4: Add a mobile number or an email')).toBeVisible();
  await page.goto('/business/customers?tag=vip');
  await expect(page.getByRole('heading', { name: '2 customers' })).toBeVisible();

  // Switch on birthday wishes on WhatsApp (email for customers without a mobile).
  await page.goto('/business/automations');
  const form = page.getByRole('form', { name: 'Birthday wishes' });
  await form.getByRole('switch').click();
  await form.getByLabel('WhatsApp template').selectOption({ label: 'birthday_wish (en)' });
  await expect(form.getByText('Happy birthday Nisha! Enjoy a free pastry today at Sweet Treats.')).toBeVisible();
  await expect(form.locator('option', { hasText: 'festival_offer' })).toHaveAttribute('disabled', '');
  await form.getByLabel('Send at').selectOption('0');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByRole('status')).toHaveText('Saved');

  // The job runner sends the wish through the WhatsApp API.
  const cron = await page.request.post('/api/cron', { headers: { authorization: 'Bearer e2e-cron-secret' } });
  expect(cron.ok()).toBe(true);
  const sent = (await (await page.request.get(`${MOCK}/__sent`)).json()).filter((s: { phoneNumberId: string }) => s.phoneNumberId === phoneId);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ to: `91${mobile}`, type: 'template', template: { name: 'birthday_wish', language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Nisha' }, { type: 'text', text: 'Sweet Treats' }] }] } });
  await page.goto('/business/messages');
  await expect(page.getByRole('row', { name: /Nisha Kapoor/ })).toContainText('Sent');
  await expect(page.getByRole('row', { name: /Anil Rao/ })).toContainText('Sent'); // by email

  // Delivery receipts: unsigned webhooks are rejected; signed ones move the status forward.
  const unsigned = await page.request.post('/api/webhooks/whatsapp', { data: change(phoneId, { statuses: [{ id: sent[0].id, status: 'read' }] }) });
  expect(unsigned.status()).toBe(401);
  expect((await webhook(page, change(phoneId, { statuses: [{ id: sent[0].id, status: 'delivered', recipient_id: `91${mobile}` }] }))).ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole('row', { name: /Nisha Kapoor/ })).toContainText('Delivered');
  expect((await webhook(page, change(phoneId, { statuses: [{ id: sent[0].id, status: 'read' }] }))).ok()).toBe(true);
  await page.goto('/business');
  await expect(page.getByText('1 read on WhatsApp')).toBeVisible();

  // Meta's webhook verification handshake.
  const verify = await page.request.get('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=e2e-verify-token&hub.challenge=12345');
  expect(await verify.text()).toBe('12345');
  expect((await page.request.get('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token-x&hub.challenge=1')).status()).toBe(403);

  // The customer replies STOP.
  await webhook(page, change(phoneId, { messages: [{ from: `91${mobile}`, id: 'wamid.IN1', type: 'text', text: { body: 'STOP' } }] }));
  await page.goto('/business/customers?q=Nisha');
  await page.getByRole('link', { name: /Nisha Kapoor/ }).click();
  await expect(page.getByText(/Unsubscribed from WhatsApp/)).toBeVisible();

  // A second cron run sends nothing new.
  await page.request.post('/api/cron', { headers: { authorization: 'Bearer e2e-cron-secret' } });
  expect((await (await page.request.get(`${MOCK}/__sent`)).json()).filter((s: { phoneNumberId: string }) => s.phoneNumberId === phoneId)).toHaveLength(1);

  // Schedule and cancel a festival campaign for VIPs.
  await page.goto('/business/campaigns');
  const c = page.getByRole('form', { name: 'New campaign' });
  await c.getByLabel('Campaign name').fill('Diwali greetings');
  await c.getByLabel('Only customers tagged').fill('vip');
  await expect(c.getByText('2 customers who agreed to messages')).toBeVisible();
  await c.getByLabel('WhatsApp template').selectOption({ label: 'birthday_wish (en)' });
  await c.getByRole('button', { name: 'Schedule campaign' }).click();
  const item = page.getByRole('listitem').filter({ hasText: 'Diwali greetings' });
  await expect(item).toContainText('Scheduled');
  await item.getByRole('button', { name: 'Cancel' }).click();
  await expect(item).toContainText('Cancelled');

  // The email customer unsubscribes with the link in their email.
  const db = new Client({ connectionString: process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5433/wishwell' });
  await db.connect();
  const { rows } = await db.query('select unsubscribe_token from customers where email = $1', [`anil-${phoneId}@example.com`]);
  await db.end();
  const ctx = await page.context().browser()!.newContext();
  const guest = await ctx.newPage();
  await guest.goto(`${new URL(page.url()).origin}/u/${rows[0].unsubscribe_token}`);
  await expect(guest.getByRole('heading', { name: 'Messages from Sweet Treats' })).toBeVisible();
  await guest.getByRole('button', { name: 'Unsubscribe' }).click();
  await expect(guest.getByRole('status')).toContainText('won’t send you these messages');
  await ctx.close();
});

test('business pages need a workspace and other businesses’ customers are hidden', async ({ page, browser }) => {
  await signUp(page, 'Owner One');
  await page.goto('/business/customers');
  await expect(page).toHaveURL(/\/business$/);
  await page.getByLabel('Business name').fill('Shop One');
  await page.getByRole('button', { name: 'Create business workspace' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Shop One' })).toBeVisible();
  await page.goto('/business/customers/new');
  await page.getByLabel('Name', { exact: true }).fill('Private Customer');
  await page.getByLabel('Email', { exact: true }).fill(`private-${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByRole('heading', { name: 'Private Customer' })).toBeVisible();
  const id = page.url().split('/').pop();

  const ctx = await browser.newContext({ ...test.info().project.use });
  const other = await ctx.newPage();
  await signUp(other, 'Owner Two');
  expect((await other.request.get(`/api/business/customers/${id}`)).status()).toBe(404);
  await other.request.post('/api/business', { data: { name: 'Shop Two' }, headers: { origin: new URL(other.url()).origin } });
  expect((await other.request.get(`/api/business/customers/${id}`)).status()).toBe(404);
  await ctx.close();
});

