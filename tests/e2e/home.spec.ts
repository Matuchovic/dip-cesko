import { expect, test } from '@playwright/test';

test('domovská obrazovka: nejbližší zastávka, tři odjezdy s radou, uložení místa Domů', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const hero = page.locator('.home-hero');
  await expect(hero.locator('.hero-title')).toBeVisible({ timeout: 30_000 });
  await expect(hero.locator('.eyebrow')).toContainText('Nejbližší zastávka');
  await expect.poll(async () => hero.locator('.dep-row').count(), { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await hero.locator('.dep-row').count()).toBeLessThanOrEqual(3);
  await expect(hero.locator('.dep-row').first().locator('.ok, .warn, .bad')).toHaveText(/Stihneš to|Vyraž hned|Nestihneš/);
  await page.screenshot({ path: '/tmp/look-home.png' });
  await page.getByRole('button', { name: /Domů/ }).click();
  await page.getByRole('combobox').last().fill('Anděl');
  await page.getByRole('option').first().click();
  await expect(page.locator('.place-row', { hasText: 'Domů · Anděl' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Schéma metra' }).first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.place-row', { hasText: 'Domů · Anděl' })).toBeVisible({ timeout: 30_000 });
});
