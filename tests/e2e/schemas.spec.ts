import { expect, test } from '@playwright/test';

test('živé schéma metra: všechny stanice, soupravy a přechod z domovské obrazovky', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Schéma metra' }).first().click();
  await expect(page).toHaveURL(/\/metro$/);
  await expect(page.getByRole('heading', { name: 'Živé schéma metra' })).toBeVisible();
  await expect(page.locator('.metro-svg circle.metro-station, .metro-svg circle.metro-transfer')).toHaveCount(61);
  await expect.poll(async () => page.locator('.metro-train').count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(4);
});

test('schéma linky: zastávky a vozy linky, odkaz z detailu vozidla', async ({ page }) => {
  await page.goto('/linka?l=7&m=tram');
  await expect(page.getByRole('heading', { name: 'Schéma linky' })).toBeVisible();
  await expect.poll(async () => page.locator('.line-stop').count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => page.locator('.line-vehicle').count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  await page.goto('/linka?l=..%2F..&m=tram');
  await expect(page.getByText('Neplatná linka.')).toBeVisible();
});

test('bezpečnost: přísná CSP s nonce na stránkách, neplatné vstupy API odmítnuty', async ({ page, request }) => {
  const res = await request.get('/');
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect((await request.get('/api/trip?vehicle=../../etc')).status()).toBe(400);
  expect((await request.get('/api/vehicles?line=%3Cscript%3E')).status()).toBe(400);
  expect((await request.get('/api/vehicles?mode=rocket')).status()).toBe(400);
  // aplikace se s přísnou CSP normálně spustí (skripty s nonce běží)
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) errors.push(m.text()); });
  await page.goto('/odjezdy');
  await expect(page.getByRole('heading', { name: 'Odjezdy' })).toBeVisible();
  expect(errors).toEqual([]);
});
