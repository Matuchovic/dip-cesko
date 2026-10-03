import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('rodičovská kontrola: tlačítko pod novinkami, spárování kódem se souhlasem dítěte, stejné ověřovací obrázky, cesta, pauza, zrušení', async ({ browser, baseURL }) => {
  const storage = { cookies: [], origins: [{ origin: baseURL!, localStorage: [{ name: 'doprava.onboarding.v1', value: 'never' }] }] };
  const pctx = await browser.newContext({ storageState: storage, viewport: { width: 390, height: 844 } });
  const cctx = await browser.newContext({ storageState: storage, viewport: { width: 390, height: 844 } });
  const parent = await pctx.newPage(), child = await cctx.newPage();

  // tlačítko pod novinkami vede do Rodičovské kontroly
  await parent.goto('/');
  const bar = parent.locator('a.fam-bar');
  await expect(bar).toBeVisible({ timeout: 30_000 });
  await expect(bar).toContainText('Rodičovská kontrola');
  const tk = (await parent.locator('.ticker').boundingBox())!, fb = (await bar.boundingBox())!;
  expect(fb.y).toBeGreaterThanOrEqual(tk.y + tk.height - 1); // je pod novinkami
  await bar.click();
  await expect(parent.getByRole('heading', { name: 'Rodičovská kontrola' })).toBeVisible();

  // rodič: přidat dítě → kód
  await parent.getByRole('button', { name: /Jsem rodič/ }).click();
  await expect(parent.locator('.fam-code span').first()).not.toHaveText('-', { timeout: 15_000 });
  const code = (await parent.locator('.fam-code span').allTextContents()).join('');
  expect(code).toMatch(/^\d{6}$/);
  await expect(parent.locator('.fam-qr svg')).toBeVisible();

  // dítě: kód → souhlas → jméno
  await child.goto('/rodina');
  await child.getByRole('button', { name: /Jsem dítě/ }).click();
  await child.getByLabel('Šestimístný kód').fill(code);
  await expect(child.getByRole('heading', { name: 'Co rodič uvidí?' })).toBeVisible();
  const kidEmoji = (await child.locator('.fam-emoji span').allTextContents()).join('');
  await child.getByLabel('Tvoje jméno').fill('Anička');
  await child.getByRole('button', { name: 'Souhlasím, spojit' }).click();
  await expect(child.getByRole('heading', { name: 'Hotovo, jste spojení!' })).toBeVisible();
  await child.getByRole('button', { name: 'Pokračovat' }).click();

  // rodič: dítě připojené, obrázky na obou telefonech stejné
  await expect(parent.getByRole('heading', { name: 'Dítě je připojené!' })).toBeVisible({ timeout: 15_000 });
  expect((await parent.locator('.fam-emoji span').allTextContents()).join('')).toBe(kidEmoji);
  await parent.getByRole('button', { name: 'Obrázky sedí' }).click();
  await parent.getByRole('button', { name: 'Pokračovat' }).click();
  await expect(parent.locator('.fam-child')).toContainText('Anička', { timeout: 15_000 });
  await expect(child.locator('.fam-priv')).toContainText('vidí tvoje cesty', { timeout: 15_000 });

  // dítě: vybere spoj a přejetím potvrdí „Jedu“
  await child.getByRole('combobox', { name: 'Odkud jedeš' }).fill('andel');
  await child.getByRole('option', { name: /Anděl/ }).first().click();
  await child.locator('.fam-deps button').first().click();
  await child.getByRole('button', { name: 'Přejeď → Jedu' }).press('Enter');
  await expect(child.locator('.fam-toast')).toContainText('ví, že jedeš', { timeout: 10_000 });
  await expect(child.getByRole('button', { name: /Jsem v cíli/ })).toBeVisible();

  // rodič vidí cestu
  await parent.reload();
  await expect(parent.locator('.fam-child')).toContainText('Jede linkou', { timeout: 15_000 });
  await expect(parent.locator('.fam-live')).toBeVisible();

  // dítě vypne sdílení → rodič to vidí
  await child.getByRole('switch', { name: 'Sdílení cest' }).click();
  await expect(child.locator('.fam-priv')).toContainText('Sdílení je vypnuté', { timeout: 10_000 });
  await parent.reload();
  await expect(parent.locator('.fam-child')).toContainText('sdílení je vypnuté', { timeout: 15_000 });

  // rodič zruší spojení → u dítěte zmizí
  parent.once('dialog', (d) => void d.accept());
  await parent.getByRole('button', { name: 'Zrušit spojení' }).click();
  await expect(parent.getByRole('button', { name: /Jsem rodič/ })).toBeVisible({ timeout: 10_000 });
  await child.reload();
  await expect(child.getByRole('button', { name: /Jsem dítě/ })).toBeVisible({ timeout: 15_000 });
  await pctx.close(); await cctx.close();
});
