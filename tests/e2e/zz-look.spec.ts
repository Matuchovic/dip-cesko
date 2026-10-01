import { test } from '@playwright/test';
test('náhled značky a barev', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 860 });
  await page.goto('/');
  await page.waitForTimeout(3500);
  await page.screenshot({ path: '/tmp/b-desk.png' });
  await page.goto('/odjezdy?zastavka=' + encodeURIComponent('U1040'));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/b-dep.png' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const m = await ctx.newPage();
  await m.addInitScript(() => localStorage.setItem('doprava.settings.v1', JSON.stringify({ theme: 'dark', rev: 3 })));
  await m.goto('/');
  await m.waitForTimeout(3500);
  await m.screenshot({ path: '/tmp/b-mob.png' });
  await ctx.close();
});
