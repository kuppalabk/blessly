import { expect, test } from '@playwright/test';
import path from 'node:path';
import { signUp } from './helpers';

test.use({ permissions: ['microphone', 'camera'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });
const PHOTO = (f: string) => path.join(__dirname, '..', 'public', 'photos', f);

test('card editor: customise a design, add text, sticker, photo, signature and QR, then send it with a voice message', async ({ page, browserName }, info) => {
  test.setTimeout(120_000);
  await signUp(page, 'Meera Editor');
  await page.goto('/create?occasion=birthday');
  await page.getByPlaceholder('e.g. Nisha').fill('Riya');
  await page.getByRole('button', { name: /Customise this design/ }).click();
  await expect(page).toHaveURL(/\/designs\/[0-9a-f-]+$/);
  await expect(page.getByLabel('Card name')).toHaveValue('Birthday card for Riya');
  const stage = page.locator('.editor-stage');
  await expect(stage.locator('canvas')).toBeVisible();

  // Select the greeting by tapping it, and change its words and font.
  const stageBox = async () => { await stage.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollTo(0, 0)); return (await stage.boundingBox())!; };
  let box = await stageBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.56);
  await expect(page.getByRole('region', { name: 'Selected item' })).toBeVisible();
  await page.getByLabel('Text', { exact: true }).fill('Happy 30th!');
  await page.getByRole('region', { name: 'Selected item' }).getByLabel('Font').selectOption('pacifico');

  // Drag it up; undo puts it back, redo moves it again.
  box = await stageBox();
  const before = await stage.locator('.editor-sel').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.56);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3, { steps: 6 });
  await page.mouse.up();
  const after = await stage.locator('.editor-sel').boundingBox();
  expect(after!.y).toBeLessThan(before!.y - 40);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await stage.locator('.editor-sel').boundingBox())!.y).toBeGreaterThan(after!.y + 40);
  await page.getByRole('button', { name: 'Redo' }).click();

  // Sticker, photo, QR code, signature.
  await page.getByRole('button', { name: 'Stickers' }).click();
  await page.getByRole('button', { name: 'Add 🎈' }).click();
  box = await stageBox();
  await page.mouse.click(box.x + 5, box.y + box.height - 5); // deselect
  await expect(stage.locator('.editor-sel')).toHaveCount(0);
  await stage.screenshot({ path: info.outputPath('editor-text-sticker.png') });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Photo to add').setInputFiles(PHOTO('photo-beach.jpg'));
  await expect(page.getByRole('region', { name: 'Selected item' }).getByText('Photo', { exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'QR code' }).click();
  await page.getByLabel(/Link for the QR code/).fill('https://example.com/our-playlist');
  await page.getByRole('button', { name: 'Add QR code' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: '+ Signature or drawing' }).click();
  const pad = (await page.getByLabel('Drawing area').boundingBox())!;
  await page.mouse.move(pad.x + 40, pad.y + 150);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(pad.x + 40 + i * 25, pad.y + 150 - Math.sin(i / 2) * 50);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Add to card' }).click();
  await expect(page.getByRole('region', { name: 'Selected item' }).getByText('Drawing', { exact: true })).toBeVisible();

  // Inside page gets a gradient background.
  await page.getByRole('button', { name: 'Inside' }).click();
  await page.getByRole('button', { name: 'Background' }).click();
  await page.getByRole('button', { name: 'Gradient #ffe4ec to #fff3c4' }).click();
  await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Front' }).click();
  box = await stageBox();
  await page.mouse.click(box.x + 5, box.y + box.height - 5); // deselect
  await stage.screenshot({ path: info.outputPath('editor-front.png') });

  // The PDF downloads with both pages.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Print-ready PDF' }).click()]);
  expect(download.suggestedFilename()).toBe('Birthday card for Riya.pdf');

  // Use it for a wish, with a (fake-microphone) voice message.
  await page.getByRole('button', { name: 'Use this card for a wish' }).click();
  await expect(page).toHaveURL(/\/create\?card=/, { timeout: 20000 });
  await expect(page.getByRole('heading', { name: '3 · Your card' })).toBeVisible();
  await page.getByPlaceholder('e.g. Nisha').fill('Riya');
  await page.getByRole('button', { name: 'Write my wish' }).click();
  await expect(page.getByLabel('Your wish (edit freely)')).not.toHaveValue('', { timeout: 15000 });
  if (browserName === 'chromium') {
    await page.getByRole('button', { name: /Record voice message/ }).click();
    await page.waitForTimeout(2200);
    await page.getByRole('button', { name: '■ Stop' }).click();
    await page.getByRole('button', { name: 'Use this message' }).click();
    await expect(page.getByText(/Voice message · 0:0[1-3]/)).toBeVisible({ timeout: 15000 });
  }
  await page.getByRole('button', { name: 'Save and send' }).click();
  await expect(page).toHaveURL(/\/wishes\/[0-9a-f-]+$/, { timeout: 20000 });
  // The recipient sees the designed card (front, then inside) and can play the message.
  const wishUrl = (await page.getByRole('link', { name: 'Preview wish page' }).getAttribute('href'))!;
  await page.goto(wishUrl);
  const front = page.getByRole('img', { name: /a card from Meera/ });
  await expect(front).toBeVisible();
  expect(await front.getAttribute('src')).toMatch(/^\/api\/files\/[0-9a-f-]+\?t=/);
  await page.getByRole('button', { name: 'Open the card' }).click();
  await expect(page.getByRole('img', { name: /Inside of the card/ })).toBeVisible();
  if (browserName === 'chromium') {
    const audio = page.locator('audio');
    await expect(audio).toHaveCount(1);
    const res = await page.request.get((await audio.getAttribute('src'))!, { headers: { range: 'bytes=0-99' } });
    expect(res.status()).toBe(206);
  }
  await page.screenshot({ path: info.outputPath('wish-page.png'), fullPage: true });
});
