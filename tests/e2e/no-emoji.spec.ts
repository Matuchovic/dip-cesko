import { expect, test, type Page } from '@playwright/test';

/** Po vykreslení nesmí nikde v aplikaci zůstat emoji – v textu ani v popiscích (aria-label, title, alt, placeholder). */
async function emojiOn(page: Page, where: string): Promise<string[]> {
  return page.evaluate((w) => {
    const re = /\p{Extended_Pictographic}/gu, ok = new Set(['©', '®', '™']);
    const out: string[] = [];
    const add = (txt: string | null, ctx: string) => { for (const m of (txt ?? '').matchAll(re)) if (!ok.has(m[0])) out.push(`${w} · ${ctx}: ${m[0]} v „${(txt ?? '').slice(Math.max(0, (m.index ?? 0) - 20), (m.index ?? 0) + 20)}“`); };
    add(document.body.innerText, 'text');
    document.querySelectorAll('[aria-label],[title],[alt],[placeholder]').forEach((el) => {
      for (const a of ['aria-label', 'title', 'alt', 'placeholder']) add(el.getAttribute(a), a);
    });
    add(document.title, 'title stránky');
    return out;
  }, where);
}

test.use({ viewport: { width: 390, height: 844 } });

test('žádná emoji: všechny sekce, pruh novinek s detailem, celý průvodce a rodičovská kontrola obou stran', async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const never = { cookies: [], origins: [{ origin: baseURL!, localStorage: [{ name: 'doprava.onboarding.v1', value: 'never' }] }] };
  const found: string[] = [];
  const ctx = await browser.newContext({ storageState: never, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  for (const path of ['/', '/spojeni', '/odjezdy', '/oblibene', '/pamatky', '/nastaveni', '/metro', '/stav', '/jizdenky', '/linka?l=22&m=tram', '/rodina']) {
    await page.goto(path);
    await page.waitForTimeout(2200);
    found.push(...(await emojiOn(page, path)));
  }
  // pruh novinek a jeho detail
  await page.goto('/');
  const item = page.locator('.ticker-item').first();
  await item.waitFor({ timeout: 30_000 });
  await item.dispatchEvent('click'); // pruh se pořád posouvá – klik bez čekání na „klid“
  await page.locator('.ticker-detail').waitFor();
  found.push(...(await emojiOn(page, 'detail novinky')));
  await ctx.close();

  // celý průvodce (10 kroků)
  const octx = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });
  const op = await octx.newPage();
  await op.goto('/');
  await op.getByRole('dialog').waitFor({ timeout: 30_000 });
  for (let i = 0; i < 10; i++) {
    await op.waitForTimeout(900);
    found.push(...(await emojiOn(op, `průvodce krok ${i + 1}`)));
    await op.keyboard.press('ArrowRight');
  }
  await octx.close();

  // rodičovská kontrola: rodič i dítě, spárování, cesta
  const pc = await browser.newContext({ storageState: never, viewport: { width: 390, height: 844 } });
  const cc = await browser.newContext({ storageState: never, viewport: { width: 390, height: 844 } });
  const p = await pc.newPage(), c = await cc.newPage();
  await p.goto('/rodina'); await p.getByRole('button', { name: /Jsem rodič/ }).click();
  await expect(p.locator('.fam-code span').first()).not.toHaveText('-', { timeout: 15_000 });
  found.push(...(await emojiOn(p, 'rodič: kód')));
  const code = (await p.locator('.fam-code span').allTextContents()).join('');
  await c.goto('/rodina'); await c.getByRole('button', { name: /Jsem dítě/ }).click();
  found.push(...(await emojiOn(c, 'dítě: připojení')));
  await c.getByLabel('Šestimístný kód').fill(code);
  await expect(c.getByRole('heading', { name: 'Co rodič uvidí?' })).toBeVisible();
  await expect(c.locator('.fam-emoji .e3')).toHaveCount(4); // ověřovací obrázky jsou vlastní ikony
  found.push(...(await emojiOn(c, 'dítě: souhlas')));
  await c.getByLabel('Tvoje jméno').fill('Anička');
  await c.getByRole('button', { name: 'Souhlasím, spojit' }).click();
  await expect(c.getByRole('heading', { name: 'Hotovo, jste spojení!' })).toBeVisible();
  found.push(...(await emojiOn(c, 'dítě: hotovo')));
  await c.getByRole('button', { name: 'Pokračovat' }).click();
  await c.getByRole('combobox', { name: 'Odkud jedeš' }).fill('andel');
  await c.getByRole('option', { name: /Anděl/ }).first().click();
  await c.locator('.fam-deps button').first().click();
  found.push(...(await emojiOn(c, 'dítě: výběr spoje')));
  await c.getByRole('button', { name: 'Přejeď → Jedu' }).press('Enter');
  await expect(c.getByRole('button', { name: /Jsem v cíli/ })).toBeVisible({ timeout: 10_000 });
  found.push(...(await emojiOn(c, 'dítě: jízda')));
  await expect(p.getByRole('heading', { name: 'Dítě je připojené!' })).toBeVisible({ timeout: 15_000 });
  await expect(p.locator('.fam-emoji .e3')).toHaveCount(4);
  found.push(...(await emojiOn(p, 'rodič: ověření')));
  await p.getByRole('button', { name: 'Obrázky sedí' }).click();
  found.push(...(await emojiOn(p, 'rodič: hotovo')));
  await p.getByRole('button', { name: 'Pokračovat' }).click();
  await p.reload();
  await expect(p.locator('.fam-child')).toContainText('Jede linkou', { timeout: 15_000 });
  found.push(...(await emojiOn(p, 'rodič: přehled s cestou')));
  await p.goto('/'); await p.locator('a.fam-bar').waitFor(); await p.waitForTimeout(1500);
  found.push(...(await emojiOn(p, 'rodič: tlačítko pod novinkami')));
  await c.goto('/'); await c.locator('a.fam-bar').waitFor(); await c.waitForTimeout(1500);
  found.push(...(await emojiOn(c, 'dítě: tlačítko pod novinkami')));
  await pc.close(); await cc.close();

  expect(found, found.join('\n')).toEqual([]);
});

test('vlastní ikony se opravdu vykreslují (ne prázdná místa)', async ({ page }) => {
  await page.goto('/pamatky');
  await page.locator('.lm-card').first().waitFor({ timeout: 30_000 });
  const n = await page.locator('.lm-card .lm-ico svg.e3').count();
  expect(n).toBeGreaterThan(3);
  // ikona má skutečný obsah s přechody z jedné společné sady definic
  const ok = await page.evaluate(() => {
    const svg = document.querySelector('.lm-card .lm-ico svg.e3')!;
    const fill = svg.querySelector('[fill^="url(#e3-"]')?.getAttribute('fill') ?? '';
    const id = /url\(#([^)]+)\)/.exec(fill)?.[1];
    return Boolean(id && document.getElementById(id)) && svg.getBoundingClientRect().width > 30;
  });
  expect(ok).toBe(true);
});
