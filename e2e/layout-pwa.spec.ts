import { expect, test } from '@playwright/test';
import { addPerson, signUp, todayInIndia } from './helpers';

const PAGES = ['/home', '/people', '/create', '/family', '/calendar', '/notifications', '/settings', '/cards', '/business', '/albums', '/plans', '/pricing'];

test('layout: no horizontal scrolling and screens render', async ({ page }, info) => {
  test.setTimeout(150_000);
  const cspErrors: string[] = [];
  page.on('console', (m) => { if (/Content Security Policy|Refused to (load|execute|apply|connect)/i.test(m.text())) cspErrors.push(m.text()); });
  await signUp(page, 'Layout Tester');
  await addPerson(page, { name: 'Nisha Kapoor', relationship: 'Best friend', phone: '9876543210', ...todayInIndia(3) });
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/screens/${info.project.name}${path.replace(/\//g, '_')}.png`, fullPage: true });
  }
  // A wish page in a right-to-left language
  await page.goto('/create?occasion=eid');
  await page.getByLabel('Their name on the wish').fill('Fatima');
  await page.getByLabel('Language', { exact: true }).selectOption('ar');
  await page.getByRole('button', { name: 'Write my wish' }).click();
  await expect(page.getByLabel('Your wish (edit freely)')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: 'Save and send' }).click();
  await expect(page).toHaveURL(/\/wishes\//);
  await page.screenshot({ path: `test-results/screens/${info.project.name}_send.png`, fullPage: true });
  const url = (await page.getByTestId('page-url').textContent())!.trim();
  await page.goto(url);
  await expect(page.getByRole('img', { name: /عيد مبارك/ })).toBeVisible();
  await page.screenshot({ path: `test-results/screens/${info.project.name}_wishpage.png`, fullPage: true });
  expect(cspErrors, 'pages blocked by the Content Security Policy').toEqual([]);
  const headers = (await page.request.get('/home')).headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
});

test('PWA: manifest, icons and service worker', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await page.request.get(href!)).json();
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBeTruthy();
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/$/);
});
