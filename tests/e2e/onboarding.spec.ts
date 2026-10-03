import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });

test('úvodní průvodce: jazyk, kroky, Přeskočit (příště znovu) a Již nezobrazovat (natrvalo)', async ({ page, context }) => {
  await page.goto('/');
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible({ timeout: 30_000 });
  await expect(dlg.getByRole('heading', { name: 'DopravaČR' })).toBeVisible();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: '/tmp/look-onb-0.png' });
  await dlg.getByRole('radio', { name: 'English' }).click();
  await expect(dlg.getByText('Choose your language.', { exact: false })).toBeVisible();
  await dlg.getByRole('button', { name: 'Continue' }).click();
  await expect(dlg.getByRole('heading', { name: 'See every vehicle live' })).toBeVisible();
  await dlg.getByRole('button', { name: 'Continue' }).click();
  await dlg.getByRole('button', { name: 'Continue' }).click();
  await expect(dlg.getByRole('heading', { name: 'Add the app to your home screen' })).toBeVisible();
  await page.waitForTimeout(900);
  await page.screenshot({ path: '/tmp/look-onb-3.png' });
  await dlg.getByRole('radio', { name: 'English' }).count(); // jen pro stabilitu
  await dlg.getByRole('button', { name: 'Skip' }).click();
  await expect(dlg).toBeHidden();
  // nové spuštění (nová karta = nová relace): průvodce se ukáže znovu
  const p2 = await context.newPage();
  await p2.goto('/');
  await expect(p2.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  await p2.getByRole('button', { name: /Don.t show again|Již nezobrazovat/ }).click();
  await expect(p2.getByRole('dialog')).toBeHidden();
  const p3 = await context.newPage();
  await p3.goto('/');
  await p3.waitForTimeout(2500);
  await expect(p3.getByRole('dialog')).toHaveCount(0);
  // Nastavení: znovu zapnout
  await p3.goto('/nastaveni');
  await p3.getByRole('button', { name: /Show the guide|Zobrazit průvodce/ }).click();
  await expect(p3.getByRole('dialog')).toBeVisible();
});
