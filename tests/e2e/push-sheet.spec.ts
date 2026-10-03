import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('mobil: panel jde schovat a vytáhnout; zvonek u odjezdu srozumitelně hlásí stav serveru', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  await page.goto('/');
  await expect(page.locator('.home-hero .dep-row').first()).toBeVisible({ timeout: 30_000 });
  const sheet = page.locator('main.sheet-host');
  const tall = (await sheet.boundingBox())!.height;
  await page.getByRole('button', { name: 'Schovat panel' }).click();
  await expect.poll(async () => (await sheet.boundingBox())!.height, { timeout: 5_000 }).toBeLessThan(120);
  await expect(page.locator('.hero-title')).toBeVisible(); // název zastávky zůstává vidět
  await page.getByRole('button', { name: 'Rozbalit panel' }).last().click();
  await expect.poll(async () => (await sheet.boundingBox())!.height, { timeout: 5_000 }).toBeGreaterThan(tall - 20);
  // zvonek: v ukázkovém režimu bez nastaveného serveru upozornění
  await page.locator('.watch-btn').first().click();
  await page.getByRole('menuitem', { name: '5 min předem' }).click();
  await expect(page.locator('.watch-msg')).toHaveText(/nejsou na serveru zapnutá|nejdřív přidej aplikaci|Na upozornění je už pozdě/);
  // psaní nezvětší stránku: pole mají na dotykových zařízeních aspoň 16 px (zde kontrola pravidla v CSS)
  expect(await page.evaluate(() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.cssText.includes('pointer: coarse') && r.cssText.includes('16px')); } catch { return false; } }))).toBe(true);
});
