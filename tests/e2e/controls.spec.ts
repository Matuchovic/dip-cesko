import { expect, test, type Page } from '@playwright/test';

/** Mobil: tlačítka mapy jsou vždy celá vidět mezi filtry nahoře a panelem/lištou dole – nic se nepřekrývá. */
async function fits(page: Page) {
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    const chips = document.querySelector('.map-top')!.getBoundingClientRect().bottom;
    const lows = ['.panel.sheet-host', '.panel.page-host', '.tabbar', '.ticker', 'a.fam-bar'].map((s) => document.querySelector(s) as HTMLElement | null)
      .filter((x): x is HTMLElement => Boolean(x) && x!.offsetParent !== null).map((x) => x.getBoundingClientRect().top).filter((y) => y > chips);
    const floor = Math.min(...lows);
    const shown = [...document.querySelectorAll<HTMLElement>('.controls .ctrl')].filter((b) => getComputedStyle(b).display !== 'none' && b.offsetParent !== null && getComputedStyle(b.closest('.ctrl-group')!).display !== 'none');
    const bad = shown.filter((b) => { const r = b.getBoundingClientRect(); return r.top < chips - 1 || r.bottom > floor + 1; }).map((b) => b.getAttribute('aria-label'));
    return { shown: shown.map((b) => b.getAttribute('aria-label') ?? ''), bad, space: Math.round(floor - chips) };
  });
}

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('ovládání mapy se vždy vejde mezi filtry a panel (panel schovaný, normální, malý displej)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-hero .dep-row').first()).toBeVisible({ timeout: 30_000 });
  let r = await fits(page);
  expect(r.bad, JSON.stringify(r)).toEqual([]);
  expect(r.shown.some((l) => /poloh/i.test(l))).toBe(true); // „Moje poloha“ je vidět vždy, když je místo

  await page.getByRole('button', { name: 'Schovat panel' }).click();
  r = await fits(page);
  expect(r.bad, JSON.stringify(r)).toEqual([]);
  expect(r.shown.length, JSON.stringify(r)).toBeGreaterThanOrEqual(5); // dost místa → všechna tlačítka

  await page.getByRole('button', { name: 'Rozbalit panel' }).last().click();
  r = await fits(page);
  expect(r.bad, JSON.stringify(r)).toEqual([]);

  await page.setViewportSize({ width: 390, height: 640 }); // malý telefon / rozbalený panel → méně místa
  r = await fits(page);
  expect(r.bad, JSON.stringify(r)).toEqual([]);
});
