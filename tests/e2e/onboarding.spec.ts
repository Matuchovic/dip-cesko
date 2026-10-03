import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });

test('úvodní průvodce: 10 kroků se všemi funkcemi, jazyk, šipky, dokončení; Přeskočit (příště znovu) a Již nezobrazovat (natrvalo)', async ({ page, context }) => {
  await page.goto('/');
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible({ timeout: 30_000 });
  await expect(dlg.getByRole('heading', { name: 'DopravaČR' })).toBeVisible();
  await expect(dlg.locator('.onb-prog button')).toHaveCount(10);
  await dlg.getByRole('radio', { name: 'English' }).click();
  await expect(dlg.getByText('pick your language', { exact: false })).toBeVisible();
  await dlg.getByRole('radio', { name: 'Čeština' }).click();
  const heads = ['Vidíš každé vozidlo naživo', 'Víš, jestli to stihneš', 'Zvonek ti připomene odjezd', 'Najdi cestu odkudkoli kamkoli', 'Památky a jak se k nim dostaneš',
    'Výluky uvidíš jako první', 'Ovládání, které zvládne každý', 'Zapni si to na 3 klepnutí', 'Domů a do práce jedním klepnutím'];
  for (const h of heads) {
    await dlg.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(dlg.getByRole('heading', { name: h })).toBeVisible();
  }
  await expect(dlg.locator('.onb-setup li')).toHaveCount(0); // poslední krok: místa
  await page.keyboard.press('ArrowLeft');
  await expect(dlg.getByRole('heading', { name: 'Zapni si to na 3 klepnutí' })).toBeVisible();
  await expect(dlg.locator('.onb-setup li')).toHaveCount(3);
  await page.keyboard.press('ArrowRight');
  await dlg.getByRole('button', { name: 'Začít jezdit' }).click();
  await expect(page.locator('.onb-finish')).toBeVisible();
  await expect(dlg).toBeHidden({ timeout: 6000 });
  // nové spuštění (nová karta = nová relace): průvodce se ukáže znovu; Přeskočit ho zavře
  const p2 = await context.newPage();
  await p2.goto('/');
  await expect(p2.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  await p2.getByRole('button', { name: 'Přeskočit' }).click();
  await expect(p2.getByRole('dialog')).toBeHidden();
  const p3 = await context.newPage();
  await p3.goto('/');
  await expect(p3.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  await p3.getByRole('button', { name: 'Již nezobrazovat' }).click();
  await expect(p3.getByRole('dialog')).toBeHidden();
  const p4 = await context.newPage();
  await p4.goto('/');
  await p4.waitForTimeout(2500);
  await expect(p4.getByRole('dialog')).toHaveCount(0);
  await p4.goto('/nastaveni');
  await p4.getByRole('button', { name: 'Zobrazit průvodce' }).click();
  await expect(p4.getByRole('dialog')).toBeVisible();
});
