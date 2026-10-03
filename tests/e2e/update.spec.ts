import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const fakeNewVersion = (page: Page) => page.route('**/api/version', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: '9.9.9', build: 'nove-nasazeni' }) }));
const mark = (page: Page) => page.evaluate(() => { (window as unknown as { __stara?: boolean }).__stara = true; });
// během obnovení stránky dotaz selže – to se počítá jako „ještě stará“ a zkusí se znovu
const isOld = (page: Page) => page.evaluate(() => (window as unknown as { __stara?: boolean }).__stara === true).catch(() => true);

test('nová verze: lišta jen s čísly verzí, křížek ji schová a přechod do jiné sekce načte novou verzi', async ({ page }) => {
  await fakeNewVersion(page);
  await page.goto('/');
  const bar = page.locator('.upd');
  await expect(bar).toBeVisible({ timeout: 15_000 });
  await expect(bar).toContainText('Nová verze');
  await expect(bar.locator('.upd-ver')).toHaveText(/^\d+\.\d+\.\d+ → 9\.9\.9$/);
  await bar.getByRole('button', { name: 'Zavřít, aktualizovat později' }).click();
  await expect(bar).toHaveCount(0);
  await mark(page);
  await page.locator('nav.tabbar').getByText('Odjezdy').click();
  await expect.poll(() => isOld(page), { timeout: 15_000 }).toBe(false); // stránka se načetla znovu
  await expect(page).toHaveURL(/\/odjezdy/);
});

test('tlačítko Aktualizovat: obrazovka načítání a nová verze', async ({ page }) => {
  await fakeNewVersion(page);
  await page.goto('/');
  const bar = page.locator('.upd');
  await expect(bar).toBeVisible({ timeout: 15_000 });
  await mark(page);
  await bar.getByRole('button', { name: 'Aktualizovat', exact: true }).click();
  await expect(page.locator('.upd-boot')).toContainText('Načítám verzi 9.9.9');
  await expect.poll(() => isOld(page), { timeout: 15_000 }).toBe(false);
});

test('karty ve 3D: skleněný rám a náklon za kurzorem', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/pamatky');
  const card = page.locator('.lm-card').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  expect(await card.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('6px');
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.2);
  await expect(card).toHaveClass(/tilting/);
  expect(await card.evaluate((el) => el.style.getPropertyValue('--ry'))).toMatch(/^[1-9]/);
});
