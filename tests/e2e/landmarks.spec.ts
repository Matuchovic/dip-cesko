import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('Památky: místo Jízdenek v menu, hledání, cesta sem, na mapě; jízdenky dál dostupné', async ({ page }) => {
  await page.goto('/');
  const nav = page.locator('nav.tabbar');
  await expect(nav.getByText('Památky')).toBeVisible({ timeout: 30_000 });
  await expect(nav.getByText('Jízdenky')).toHaveCount(0);
  await nav.getByText('Památky').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Památky' })).toBeVisible();
  await expect(page.locator('.lm-card').first()).toBeVisible({ timeout: 20_000 });
  expect(await page.locator('.lm-card').count()).toBeGreaterThanOrEqual(20);
  await page.getByPlaceholder('Hledej památku…').fill('karl');
  await expect(page.locator('.lm-name', { hasText: 'Karlův most' })).toBeVisible();
  const card = page.locator('.lm-card', { has: page.locator('.lm-name', { hasText: 'Karlův most' }) });
  await expect(card.getByRole('link', { name: 'Cesta sem' })).toHaveAttribute('href', /\/spojeni\?toLat=50\.08\d+&toLon=14\.41\d+&toName=Karl/);
  await page.locator('.lm-foot').getByRole('link', { name: 'Jízdenky' }).isVisible();
  await card.getByRole('button', { name: 'Na mapě' }).click();
  await expect(page).toHaveURL(/\/$/);
});
