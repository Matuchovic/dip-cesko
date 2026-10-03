import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

async function controls(page: Page) {
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    const top = document.querySelector('.map-top')!.getBoundingClientRect().bottom;
    const lim = Math.min(...['.panel.sheet-host', '.tabbar', '.ticker', 'a.fam-bar'].map((s) => document.querySelector(s)).filter((e): e is Element => Boolean(e)).map((e) => e.getBoundingClientRect().top));
    const btns = [...document.querySelectorAll('.controls .ctrl')].filter((b) => (b as HTMLElement).offsetParent !== null).map((b) => b.getBoundingClientRect());
    const c = document.querySelector('.controls') as HTMLElement;
    return { top, lim, n: btns.length, minY: Math.min(...btns.map((b) => b.top)), maxY: Math.max(...btns.map((b) => b.bottom)), dbg: `${c.style.getPropertyValue('--ctrl-top')}/${c.style.getPropertyValue('--ctrl-bottom')} rect ${JSON.stringify(c.getBoundingClientRect())}` };
  });
}

test('mobil: ovládání mapy je vždy mezi filtry a panelem – sbalený, výchozí i rozbalený panel; nic se nepřekrývá', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-hero .dep-row').first()).toBeVisible({ timeout: 30_000 });
  for (const [label, act] of [
    ['výchozí', async () => undefined],
    ['schovaný panel', async () => { await page.getByRole('button', { name: 'Schovat panel' }).click(); }],
    ['znovu rozbalený panel', async () => { await page.getByRole('button', { name: 'Rozbalit panel' }).last().click(); }],
  ] as const) {
    await act();
    // počkat, až panel i sloupec doběhnou (animace), pak měřit
    await expect.poll(async () => { const x = await controls(page); return x.n === 0 || (x.minY >= x.top && x.maxY <= x.lim); }, { timeout: 4000 }).toBe(true);
    const r = await controls(page);
    if (label === 'schovaný panel') expect(r.n, label).toBe(5); // dost místa → všechna tlačítka
    if (r.n > 0) {
      expect(r.minY, `${label}: pod filtry`).toBeGreaterThanOrEqual(r.top);
      expect(r.maxY, `${label}: nad panelem (${r.dbg})`).toBeLessThanOrEqual(r.lim);
    }
  }
});

test('první spuštění: nejdřív průvodce, aplikace pod ním neproblikne', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const w = window as unknown as { __onb: { v: string; onb: boolean; app: boolean }[] };
    w.__onb = [];
    const rec = () => w.__onb.push({ v: document.documentElement.dataset.onb ?? 'none', onb: Boolean(document.querySelector('.onb')), app: Boolean(document.querySelector('.app')) });
    // sledovat celý dokument: prvek <html> v době spuštění skriptu ještě nemusí být ten konečný
    new MutationObserver(rec).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-onb'] });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // kryt je tam ještě před spuštěním aplikace
  const cover = await page.evaluate(() => ({ v: document.documentElement.dataset.onb ?? 'none', c: getComputedStyle(document.body, '::after').content }));
  expect(cover.v === '1' || cover.v === 'out').toBe(true);
  expect(cover.c).not.toBe('none');
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.onb ?? 'none'), { timeout: 5000 }).toBe('none');
  const log = await page.evaluate(() => (window as unknown as { __onb: { v: string; onb: boolean }[] }).__onb);
  const out = log.find((x) => x.v === 'out');
  expect(out?.onb, JSON.stringify(log)).toBe(true); // kryt mizí až ve chvíli, kdy je pod ním průvodce
  await ctx.close();

  // kdo zvolil „Již nezobrazovat“, nemá kryt vůbec
  const ctx2 = await browser.newContext({ storageState: { cookies: [], origins: [{ origin: baseURL!, localStorage: [{ name: 'doprava.onboarding.v1', value: 'never' }] }] }, viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await p2.goto('/', { waitUntil: 'domcontentloaded' });
  expect(await p2.evaluate(() => document.documentElement.dataset.onb ?? 'none')).toBe('none');
  await ctx2.close();
});
