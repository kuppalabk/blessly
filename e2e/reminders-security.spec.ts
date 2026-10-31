import { expect, test } from '@playwright/test';
import { addPerson, signUp, todayInIndia, uniqueEmail } from './helpers';

const CRON = { authorization: 'Bearer e2e-cron-secret' };

test('reminder for a birthday today is delivered by the job runner and shows as an alert', async ({ page }) => {
  await signUp(page, 'Meera Iyer');
  await addPerson(page, { name: 'Anaya', relationship: 'Daughter', ...todayInIndia(0) });
  const run = await page.request.post('/api/cron', { headers: CRON });
  expect(run.ok()).toBeTruthy();
  const r = await run.json();
  expect(r.planned).toBeGreaterThanOrEqual(1);
  expect(r.remindersDelivered).toBeGreaterThanOrEqual(1);
  await page.goto('/notifications');
  await expect(page.getByText("It's Anaya's birthday today")).toBeVisible();
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(page.getByRole('button', { name: 'Mark all as read' })).toBeHidden();
  // Running again does not duplicate it
  await page.request.post('/api/cron', { headers: CRON });
  await page.reload();
  await expect(page.getByText("It's Anaya's birthday today")).toHaveCount(1);
});

test('festivals appear in the calendar', async ({ page }) => {
  await signUp(page);
  await page.goto('/calendar?m=2026-12');
  await expect(page.getByRole('heading', { name: 'December 2026' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Christmas/ })).toBeVisible();
});

test('the API rejects cross-account access, bad input and unauthenticated calls', async ({ page, browser }) => {
  await signUp(page, 'Owner');
  const personId = await addPerson(page, { name: 'Private Person', month: 6, day: 1 });
  const wish = await page.request.post('/api/wishes', { data: { occasion: 'birthday', language: 'en', tone: 'short', text: 'Hi', recipientName: 'P', senderName: 'O', personId }, headers: { origin: 'http://localhost:3100' } });
  expect(wish.status()).toBe(201);
  const wishId = (await wish.json()).wish.id;

  const other = await browser.newContext();
  const op = await other.newPage();
  await signUp(op, 'Intruder', uniqueEmail('intruder'));
  expect((await op.request.get(`/api/people/${personId}`)).status()).toBe(404);
  expect((await op.request.get(`/api/wishes/${wishId}`)).status()).toBe(404);
  expect((await op.request.delete(`/api/people/${personId}`, { headers: { origin: 'http://localhost:3100' } })).status()).toBe(404);
  expect((await op.request.post(`/api/wishes`, { data: { occasion: 'birthday', language: 'en', tone: 'short', text: 'x', recipientName: 'a', senderName: 'b', personId }, headers: { origin: 'http://localhost:3100' } })).status()).toBe(404);
  await other.close();

  const anon = await browser.newContext();
  expect((await anon.request.get('/api/people')).status()).toBe(401);
  expect((await anon.request.post('/api/cron')).status()).toBe(401);
  expect((await anon.request.get('/w/doesnotexist1')).status()).toBe(404);
  expect((await anon.request.post('/api/people', { data: {}, headers: { origin: 'https://evil.example' } })).status()).toBe(403);
  await anon.close();

  const bad = await page.request.post('/api/people', { data: { name: '', relationship: 'Friend', occasions: [{ kind: 'birthday', month: 13, day: 1 }] }, headers: { origin: 'http://localhost:3100' } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).fields).toHaveProperty('name');
});
