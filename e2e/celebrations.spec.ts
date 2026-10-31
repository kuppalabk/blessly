import { expect, test } from '@playwright/test';
import path from 'node:path';
import { Client } from 'pg';
import { signUp } from './helpers';

const DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5433/wishwell';
async function sql<T = Record<string, unknown>>(q: string, params: unknown[] = []) {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try { return (await c.query(q, params)).rows as T[]; } finally { await c.end(); }
}
const PHOTO = path.join(__dirname, '..', 'public', 'photos', 'photo-beach.jpg');

test('celebration: host plans an invite-only party, a guest RSVPs and posts a photo, the host sees it all', async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  await signUp(page, 'Ravi Host');
  await page.goto('/celebrations/new');
  await page.getByLabel('Name of the celebration').fill('Asha turns 30');
  await page.getByLabel('Who it’s for (optional)').fill('Asha');
  const date = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByLabel('Starts').fill('19:30');
  await page.getByLabel('Venue').fill('The Garden Room');
  await page.getByLabel('Address').fill('1 High St, London');
  await page.getByLabel(/Invited guests only/).check();
  await page.getByLabel('People per invitation').selectOption('3');
  await page.getByLabel('Ask about dietary needs').check();
  await page.getByRole('button', { name: 'Create celebration page' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Asha turns 30' })).toBeVisible({ timeout: 15000 });

  await page.getByLabel(/Add guests/).fill('Meena Shah, meena@example.com\nGran +44 7700 900123');
  await page.getByRole('button', { name: 'Add guests' }).click();
  await expect(page.getByText('Added 2 guests')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); // clear of the bottom tab bar
  await page.getByRole('button', { name: /Email invitations \(1\)/ }).click();
  await expect(page.getByText('Invitations emailed to 1 guest')).toBeVisible();
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /wa\.me\/447700900123\?text=.*Asha%20turns%2030/);

  const slug = (await page.getByTestId('celebration-link').textContent())!.trim().split('/c/')[1];
  const [mail] = await sql<{ body: string }>("select body from outbox where recipient = 'meena@example.com' and subject like '%Asha turns 30%' order by created_at desc limit 1");
  const personal = mail.body.match(/http\S+\/c\/\S+/)![0];
  expect(personal).toContain(`/c/${slug}?g=`);

  // A stranger can't open an invite-only page.
  const stranger = await browser.newContext();
  const sp = await stranger.newPage();
  await sp.goto(`/c/${slug}`);
  await expect(sp.getByRole('heading', { name: 'This celebration is for invited guests' })).toBeVisible();
  await stranger.close();

  // The guest opens their invitation.
  const guestCtx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true });
  const gp = await guestCtx.newPage();
  await gp.goto(new URL(personal).pathname + new URL(personal).search);
  await expect(gp.getByRole('heading', { level: 1, name: 'Asha turns 30' })).toBeVisible();
  await expect(gp.getByText('Meena Shah, Ravi Host invites you')).toBeVisible();
  await expect(gp.getByRole('timer')).toBeVisible();
  await gp.getByRole('button', { name: 'Yes, I’ll be there' }).click();
  await gp.getByLabel('How many people, including you?').selectOption('2');
  await gp.getByLabel('Dietary needs (optional)').fill('Vegetarian');
  await gp.getByRole('button', { name: 'Send my answer' }).click();
  await expect(gp.getByText(/You’re coming · 2 people/)).toBeVisible();
  // The calendar file downloads.
  const ics = await gp.request.get(`/c/${slug}/calendar.ics${new URL(personal).search}`);
  expect(ics.headers()['content-type']).toContain('text/calendar');
  expect(await ics.text()).toContain('SUMMARY:Asha turns 30');
  // A message with a photo.
  await gp.getByLabel('Your message').fill('Can’t wait to celebrate you!');
  await gp.getByLabel('Photo or video (optional)').setInputFiles(PHOTO);
  await gp.getByRole('button', { name: 'Post message' }).click();
  await expect(gp.getByText('Posted — thank you!')).toBeVisible({ timeout: 15000 });
  await expect(gp.getByRole('img', { name: 'Photo from Meena Shah' })).toBeVisible();
  // Coming back later without the link: the device remembers it.
  await gp.goto(`/c/${slug}`);
  await expect(gp.getByText(/You’re coming · 2 people/)).toBeVisible();
  await gp.screenshot({ path: info.outputPath('celebration-guest.png'), fullPage: true });
  await guestCtx.close();

  // The host sees the answer, the dietary need, the message — and a notification.
  await page.reload();
  await expect(page.getByText('Vegetarian')).toBeVisible();
  await expect(page.getByRole('cell', { name: /Meena Shah \+1/ })).toBeVisible();
  await page.getByRole('tab', { name: /Messages/ }).click();
  await expect(page.getByText('Can’t wait to celebrate you!')).toBeVisible();
  await page.getByRole('tab', { name: 'Updates' }).click();
  await page.getByLabel(/Post an update/).fill('We have moved inside — same address.');
  await page.getByRole('button', { name: 'Post update' }).click();
  await expect(page.getByText('Update posted and emailed to 1 guest')).toBeVisible();
  const csv = await page.request.get(page.url().replace(/\/celebrations\/([\w-]+)$/, '/api/celebrations/$1/guests-csv'));
  expect(await csv.text()).toContain('Meena Shah,meena@example.com,,yes,2,Vegetarian');
  await page.goto('/notifications');
  await expect(page.getByText('Meena Shah is coming (2 people)')).toBeVisible();
});

test('wishlist: owner adds gifts, a friend reserves one without spoiling the surprise', async ({ page, browser }) => {
  await signUp(page, 'Priya Owner');
  await page.goto('/wishlists');
  await page.getByLabel('Name', { exact: true }).fill('Priya’s birthday');
  await page.getByRole('button', { name: 'Create wishlist' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Priya’s birthday' })).toBeVisible();
  for (const [title, price] of [['Smeg kettle', '8999'], ['Board game', '1499']]) {
    await page.getByLabel('What is it?').fill(title);
    await page.getByLabel('Price (optional)').fill(price);
    await page.getByRole('button', { name: 'Add to list' }).click();
    await expect(page.getByRole('list', { name: 'Items' }).getByText(title)).toBeVisible();
  }
  const link = (await page.getByTestId('wishlist-link').textContent())!.trim();
  const friendCtx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const fp = await friendCtx.newPage();
  await fp.goto(new URL(link).pathname);
  await expect(fp.getByText('₹8,999')).toBeVisible();
  await fp.getByRole('listitem').filter({ hasText: 'Smeg kettle' }).getByRole('button', { name: 'I’ll get this' }).click();
  await fp.getByLabel('Your name').fill('Neha');
  await fp.getByLabel(/Email/).fill('neha@example.com');
  await fp.getByRole('button', { name: 'Reserve' }).click();
  await expect(fp.getByText('You’re getting this')).toBeVisible();
  await fp.getByLabel('Bought it').check();
  await expect(fp.getByLabel('Bought it')).toBeChecked();
  await friendCtx.close();

  await page.reload();
  await expect(page.getByText(/1 gift has been reserved/)).toBeVisible();
  await expect(page.getByText('Neha')).toHaveCount(0);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Reveal my gifts' }).click();
  await expect(page.getByText(/Reserved 1 of 1 — Neha \(bought\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Send thank-yous' }).click();
  await expect(page.getByText('Thank-you emailed to 1 person')).toBeVisible();
});
