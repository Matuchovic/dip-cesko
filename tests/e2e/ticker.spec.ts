import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('běžící pruh novinek: jede pod menu u spodního okraje, klepnutím detail s křížkem, křížkem se schová', async ({ page }) => {
  await page.goto('/');
  const ticker = page.getByRole('region', { name: 'Novinky a mimořádnosti v provozu' });
  await expect(ticker).toBeVisible({ timeout: 30_000 });
  // je nad spodní lištou, ne přes ni, a panel končí nad ním
  const tb = (await page.locator('nav.tabbar').boundingBox())!, tk = (await ticker.boundingBox())!, sh = (await page.locator('main.sheet-host').boundingBox())!;
  // pruh je pod menu, pod ním tlačítko Rodičovské kontroly až u spodního okraje; panel končí nad menu
  expect(tk.y).toBeGreaterThanOrEqual(tb.y + tb.height - 1);
  const fb = (await page.locator('a.fam-bar').boundingBox())!;
  expect(fb.y).toBeGreaterThanOrEqual(tk.y + tk.height - 1);
  expect(fb.y + fb.height).toBeGreaterThanOrEqual(844 - 1);
  expect(sh.y + sh.height).toBeLessThanOrEqual(tb.y + 1);
  // text se posouvá
  const x0 = await page.locator('.ticker-track').evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(1200);
  const x1 = await page.locator('.ticker-track').evaluate((el) => getComputedStyle(el).transform);
  expect(x1).not.toBe(x0);
  // najetí / dotyk pruh zastaví (jinak se text stále posouvá) – pak klepnout na novinku
  await page.locator('.ticker-viewport').hover();
  await page.locator('.ticker-item').first().click({ force: true });
  await expect(page.locator('.ticker-detail')).toBeVisible();
  await page.locator('.ticker-detail-x').click();
  await expect(page.locator('.ticker-detail')).toHaveCount(0);
  await page.getByRole('button', { name: 'Schovat pruh novinek' }).click();
  await expect(ticker).toHaveCount(0);
  // popisky spodní lišty jsou vidět celé (žádné posunutí pod okraj)
  await expect(page.locator('nav.tabbar').getByText('Odjezdy')).toBeInViewport();
});
