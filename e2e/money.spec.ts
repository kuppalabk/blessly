import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import path from 'node:path';
import { enable2fa, signUp, uniqueEmail } from './helpers';

const DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5433/wishwell';
async function sql<T = Record<string, unknown>>(q: string, params: unknown[] = []) {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try { return (await c.query(q, params)).rows as T[]; } finally { await c.end(); }
}
const MUG = `Hand-painted mug ${Date.now() % 100000}`;
const PHOTO = path.join(__dirname, '..', 'public', 'photos', 'photo-beach.jpg');

test('group gift: organiser shares a link, a guest chips in through the test checkout', async ({ page, browser }) => {
  await signUp(page, 'Olu Organiser');
  await page.goto('/money');
  await expect(page.getByText('Test mode.')).toBeVisible();
  await page.goto('/pots');
  await page.getByLabel('Name', { exact: true }).fill('Leaving gift for Sam');
  await page.getByLabel('Who it’s for').fill('Sam');
  await page.getByLabel('Target (optional)').fill('5000');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Leaving gift for Sam' })).toBeVisible();
  const link = (await page.getByTestId('pot-link').textContent())!.trim();

  const guestCtx = await browser.newContext();
  const g = await guestCtx.newPage();
  await g.goto(new URL(link).pathname);
  await g.getByRole('button', { name: '₹1,000', exact: true }).click();
  await g.getByLabel('Your name').fill('Ann');
  await g.getByLabel('Message (optional)').fill('Good luck Sam!');
  await g.getByRole('button', { name: /Chip in ₹1,000/ }).click();
  await expect(g).toHaveURL(/\/pay\//);
  await expect(g.getByText('Leaving gift for Sam')).toBeVisible();
  await g.getByRole('button', { name: 'Pay ₹1,000 (test)' }).click();
  await expect(g.getByText('Thank you! Your contribution has been received.')).toBeVisible();
  await expect(g.getByText(/₹1,000 from 1 person · target ₹5,000/)).toBeVisible();
  // A declined card takes nothing.
  await g.getByLabel('Amount (INR)').fill('250');
  await g.getByLabel('Your name').fill('Ann');
  await g.getByRole('button', { name: /Chip in ₹250/ }).click();
  await g.getByRole('button', { name: 'Simulate a declined card' }).click();
  await expect(g.getByText(/didn’t go through/)).toBeVisible();
  await guestCtx.close();

  await page.reload();
  await expect(page.getByRole('cell', { name: /Ann/ })).toBeVisible();
  await page.getByRole('button', { name: 'Pay out ₹1,000' }).click();
  await expect(page.getByText(/Payout of ₹1,000 requested/)).toBeVisible();
});

test('gift card: buy one for a friend; they open it from the email link', async ({ page }) => {
  await signUp(page, 'Gita Giver');
  await page.goto('/gift-cards');
  await page.getByRole('button', { name: /Bean & Leaf Café/ }).click();
  await page.getByRole('button', { name: '₹500' }).click();
  await page.getByLabel('Recipient’s name').fill('Jo');
  const to = uniqueEmail('jo');
  await page.getByLabel('Recipient’s email').fill(to);
  await page.getByRole('button', { name: /Buy ₹500 gift card/ }).click();
  await page.getByRole('button', { name: 'Pay ₹500 (test)' }).click();
  await expect(page).toHaveURL(/\/orders\?paid=1/);
  await expect(page.getByText('Bean & Leaf Café gift card')).toBeVisible();
  await expect(page.getByText('Delivered')).toBeVisible();
  const [mail] = await sql<{ body: string }>('select body from outbox where recipient = $1', [to]);
  const url = mail.body.match(/https?:\/\/\S+\/g\/[\w-]+/)![0];
  await page.goto(new URL(url).pathname);
  await expect(page.getByTestId('gift-code')).toHaveText(/^TEST-BEAN-/);
});

test('marketplace: a seller is approved, lists a product, a buyer orders it, the seller ships; a printed card is ordered', async ({ page, browser }) => {
  test.setTimeout(120_000);
  // Seller applies.
  await signUp(page, 'Sana Seller');
  await page.goto('/partners');
  const seller = page.getByRole('form', { name: 'Apply as a seller' });
  await seller.getByLabel('Shop name').fill('Clay & Co');
  await seller.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Waiting for review')).toBeVisible();

  // Admin approves the seller.
  const adminCtx = await browser.newContext({ ...test.info().project.use });
  const admin = await adminCtx.newPage();
  const adminEmail = uniqueEmail('money-admin');
  await signUp(admin, 'Ada Money', adminEmail);
  await sql("update users set role = 'admin' where email = $1", [adminEmail]);
  await enable2fa(admin);
  await admin.goto('/admin/money');
  await admin.locator('.card-box', { hasText: 'Clay & Co · seller' }).getByRole('button', { name: 'Approve' }).click();
  await expect(admin.locator('.card-box', { hasText: 'Clay & Co · seller' })).toHaveCount(0);

  // Seller lists a product; admin approves it.
  await page.reload();
  await page.getByLabel('Product', { exact: true }).fill(MUG);
  await page.getByLabel('Price', { exact: true }).fill('499');
  await page.getByRole('button', { name: 'Add product (sent for review)' }).click();
  await expect(page.getByText(/₹499 · 10 in stock · waiting for review/)).toBeVisible();
  await page.getByLabel('Photo', { exact: true }).setInputFiles(PHOTO);
  await expect(page.locator('img[src^="/api/files/"]')).toBeVisible({ timeout: 15000 });
  await admin.reload();
  await admin.locator('.card-box', { hasText: MUG }).getByRole('button', { name: 'Approve' }).click();
  await expect(admin.locator('.card-box', { hasText: MUG })).toHaveCount(0);

  // A buyer orders it.
  const buyerCtx = await browser.newContext({ ...test.info().project.use });
  const buyer = await buyerCtx.newPage();
  await signUp(buyer, 'Bea Buyer');
  await buyer.goto('/shop');
  const card = buyer.locator('article', { hasText: MUG });
  await card.getByRole('button', { name: 'Buy' }).click();
  await card.getByLabel('Recipient’s name').fill('Asha');
  await card.getByLabel('Address line 1').fill('12 MG Road');
  await card.getByLabel('Town or city').fill('Pune');
  await card.getByLabel('Postcode / PIN').fill('411001');
  await card.getByRole('button', { name: 'Continue to payment' }).click();
  await buyer.getByRole('button', { name: 'Pay ₹499 (test)' }).click();
  await expect(buyer.getByText(MUG)).toBeVisible();

  // The seller ships it with tracking; the buyer sees it.
  await page.reload();
  await expect(page.getByText(/12 MG Road, Pune, 411001, IN/)).toBeVisible();
  await page.getByLabel('Tracking number').fill('DTDC123');
  await page.getByRole('button', { name: 'Mark shipped' }).click();
  await expect(page.getByRole('button', { name: 'Mark delivered' })).toBeVisible();
  await expect(page.getByText(/Balance: ₹449.10/)).toBeVisible(); // 499 − 10% commission
  await buyer.goto('/orders');
  await expect(buyer.getByText(/tracking DTDC123/)).toBeVisible();
  await expect(buyer.getByText('On its way')).toBeVisible();

  // Print and post a designed card.
  await buyer.goto('/designs');
  await buyer.getByRole('button', { name: 'Start a new card' }).click();
  await expect(buyer).toHaveURL(/\/designs\/[0-9a-f-]+$/);
  await buyer.getByRole('button', { name: '✉️ Print and post it' }).click();
  await expect(buyer).toHaveURL(/\/print$/, { timeout: 20000 });
  await buyer.getByLabel('How many').fill('2');
  await buyer.getByLabel('Recipient’s name').fill('Dadi');
  await buyer.getByLabel('Address line 1').fill('4 Lake View');
  await buyer.getByLabel('Town or city').fill('Kolkata');
  await buyer.getByLabel('Postcode / PIN').fill('700001');
  await buyer.getByRole('button', { name: 'Continue to payment' }).click();
  await buyer.getByRole('button', { name: 'Pay ₹498 (test)' }).click();
  await expect(buyer.getByText('Printing')).toBeVisible();
  await adminCtx.close(); await buyerCtx.close();
});
