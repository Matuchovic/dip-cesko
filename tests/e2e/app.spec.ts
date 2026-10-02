import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface TestMap {
  jumpTo(o: Record<string, unknown>): void;
  getLayer(id: string): unknown;
  queryRenderedFeatures(o: { layers: string[] }): { properties: Record<string, unknown>; geometry: { coordinates: [number, number] } }[];
  project(c: [number, number]): { x: number; y: number };
}
type W = { __doprava?: { map: TestMap | null; controller: { vehicles: Map<string, unknown> } | null; feed: { refreshNow(): void } } };

const SHOTS = 'docs/screenshots';
mkdirSync(SHOTS, { recursive: true });
const ANDEL = { center: [14.4031, 50.0717], zoom: 17.4, bearing: 0, pitch: 0 };

async function ready(page: Page, min = 1) {
  await page.waitForFunction((n) => {
    const d = (window as unknown as W).__doprava;
    return Boolean(d?.map?.getLayer('dop-pieces')) && (d?.controller?.vehicles.size ?? 0) >= n;
  }, min, { timeout: 45_000 });
}
async function jump(page: Page, opts: Record<string, unknown>) {
  await page.evaluate((o) => (window as unknown as W).__doprava!.map!.jumpTo(o), opts);
  await page.waitForTimeout(1500);
}

const SIZES = [
  { name: '360', width: 360, height: 780, mobile: true },
  { name: '390', width: 390, height: 844, mobile: true },
  { name: '768', width: 768, height: 1024, mobile: true, dpr: 1 },
  { name: '1440', width: 1440, height: 900, mobile: false },
];

for (const s of SIZES) {
  test(`mapa a detail vozidla – ${s.name} px`, async ({ browser }) => {
    test.setTimeout(150_000);
    const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 'dpr' in s ? s.dpr : s.mobile ? 2 : 1, isMobile: s.mobile, hasTouch: s.mobile, locale: 'cs-CZ', timezoneId: 'Europe/Prague' });
    const page = await ctx.newPage();
    await page.goto('/');
    await ready(page);
    await jump(page, s.mobile ? { ...ANDEL, zoom: 17.1, padding: { top: 110, bottom: 210, left: 0, right: 0 } } : { ...ANDEL, padding: { left: 420, top: 64, right: 0, bottom: 0 } });
    await page.screenshot({ path: `${SHOTS}/mapa-${s.name}.png` });
    await page.getByRole('button', { name: 'Seznam vozidel ve výřezu' }).click();
    const rows = page.locator('.vlist .row');
    await expect(rows.first()).toBeVisible();
    await rows.first().click();
    await expect(page.getByText('Ukázková poloha')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sledovat na mapě|Přestat sledovat/ })).toBeVisible();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/detail-${s.name}.png` });
    await ctx.close();
  });
}

test('výběr vozidla klepnutím do mapy (zásah mimo střed)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('doprava.settings.v1', JSON.stringify({ vehicleStyle: 'sprites', rev: 3 })));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await ready(page);
  await jump(page, { ...ANDEL, padding: { left: 420, top: 64, right: 0, bottom: 0 } });
  const pt = await page.evaluate(() => {
    const m = (window as unknown as W).__doprava!.map!;
    const f = m.queryRenderedFeatures({ layers: ['dop-pieces', 'dop-marker'] }).map((x) => ({ p: m.project(x.geometry.coordinates), id: String(x.properties.vid ?? x.properties.id) }))
      .find((x) => x.p.x > 460 && x.p.x < 1320 && x.p.y > 110 && x.p.y < 840);
    return f ? { x: f.p.x, y: f.p.y } : null;
  });
  expect(pt).not.toBeNull();
  await page.mouse.click(pt!.x + 1, pt!.y + 1); // vozidla se plynule pohybují – klik blízko středu části
  await expect(page.locator('#vd-title')).toBeVisible();
});

test('odjezdy: hledání klávesnicí, nula vs. neznámé zpoždění, zrušený spoj, oblíbené', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/odjezdy');
  const box = page.getByRole('combobox', { name: 'Zastávka' });
  await box.fill('andel');
  await expect(page.getByRole('option', { name: /Anděl/ })).toBeVisible();
  await box.press('Enter');
  await expect(page).toHaveURL(/zastavka=/);
  await expect(page.locator('ul[aria-label^="Odjezdy"] li').first()).toBeVisible();
  await expect(page.locator('ul[aria-label^="Odjezdy"] .delay-unknown').first()).toContainText('bez údaje');
  await expect(page.locator('ul[aria-label^="Odjezdy"] .delay-ok').first()).toContainText('včas');
  await expect(page.locator('ul[aria-label^="Odjezdy"] li.canceled, ul[aria-label^="Odjezdy"] .dep-time.canceled').first()).toBeVisible();
  await page.getByRole('button', { name: 'Uložit zastávku do oblíbených' }).click();
  await page.screenshot({ path: `${SHOTS}/odjezdy-1440.png` });
  await page.goto('/oblibene');
  await expect(page.locator('.row-title', { hasText: 'Anděl' })).toBeVisible();
});

test('odjezdy na telefonu 390 px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'cs-CZ', timezoneId: 'Europe/Prague' });
  const page = await ctx.newPage();
  await page.goto('/odjezdy?zastavka=And%C4%9Bl');
  await expect(page.locator('ul[aria-label^="Odjezdy"] li').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/odjezdy-390.png` });
  await ctx.close();
});

test('spojení: validace a stav nepřipojeného plánovače', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/spojeni');
  await page.getByRole('button', { name: 'Vyhledat spojení' }).click();
  await expect(page.getByText('Vyberte výchozí místo i cíl ze seznamu.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Odkud' }).fill('andel');
  await page.getByRole('option', { name: /Anděl/ }).click();
  await page.getByRole('combobox', { name: 'Kam' }).fill('mustek');
  await page.getByRole('option', { name: /Můstek/ }).click();
  await page.getByRole('button', { name: 'Vyhledat spojení' }).click();
  await expect(page.getByText('Plánovač spojení není připojen')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/spojeni-1440.png` });
});

test('výpadek připojení a návrat do aplikace', async ({ browser }) => {
  // Service worker se v Chromiu emulaci offline nepodřizuje – test ověřuje chování aplikace bez něj.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', locale: 'cs-CZ', timezoneId: 'Europe/Prague' });
  const page = await context.newPage();
  await page.goto('/');
  await ready(page);
  const pill = page.locator('.topbar-right .pill');
  await expect(pill).toContainText('Ukázková data');
  await context.setOffline(true);
  await page.evaluate(() => (window as unknown as W).__doprava!.feed.refreshNow());
  await expect(pill).toContainText('Offline');
  await context.setOffline(false);
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); (window as unknown as W).__doprava!.feed.refreshNow(); });
  await expect(pill).toContainText('Ukázková data');
  await context.close();
});

test('natočení PNG: S/V/J/Z nezávisle na natočení mapy', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('doprava.settings.v1', JSON.stringify({ vehicleStyle: 'sprites', rev: 3 })));
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/test/rotace');
  await ready(page, 9);
  for (const bearing of [0, 90, 225]) {
    await jump(page, { center: [14.38, 50.06], zoom: 17, bearing, pitch: 0, padding: { left: 420, top: 64, right: 0, bottom: 0 } });
    const rot = await page.evaluate(() => Object.fromEntries((window as unknown as W).__doprava!.map!.queryRenderedFeatures({ layers: ['dop-pieces'] }).map((f) => [String(f.properties.vid), Number(f.properties.rot)])));
    for (const m of ['tram', 'train']) {
      expect([rot[`demo:vehicle:rot-${m}-N`], rot[`demo:vehicle:rot-${m}-E`], rot[`demo:vehicle:rot-${m}-S`], rot[`demo:vehicle:rot-${m}-W`]]).toEqual([0, 90, 180, 270]);
    }
    await page.screenshot({ path: `${SHOTS}/rotace-mapa-${bearing}.png` });
  }
  // Detailní výřezy: každé vozidlo zvlášť při přiblížení 19,3 a natočení mapy 0° a 90°.
  for (const bearing of [0, 90]) for (const m of ['tram', 'train']) for (const [i, dir] of ['N', 'E', 'S', 'W'].entries()) {
    const lngLat: [number, number] = [14.38 + (i - 1.5) * 0.0011, 50.06 + (m === 'tram' ? 0.0004 : -0.0004)];
    await jump(page, { center: lngLat, zoom: 19.3, bearing, pitch: 0, padding: { left: 420, top: 64, right: 0, bottom: 0 } });
    const p = await page.evaluate((c) => (window as unknown as W).__doprava!.map!.project(c), lngLat);
    await page.screenshot({ path: `${SHOTS}/rotace-zoom-${bearing}-${m}-${dir}.png`, clip: { x: p.x - 160, y: p.y - 160, width: 320, height: 320 } });
  }
});

test('API: validace vstupů, bezpečnostní hlavičky a chráněná diagnostika', async ({ request }) => {
  expect((await request.get('/api/vehicles?bbox=foo')).status()).toBe(400);
  expect((await request.get('/api/stops?q=a')).status()).toBe(400);
  expect((await request.get('/api/stops?bbox=10,40,20,55')).status()).toBe(400);
  expect((await request.get('/api/departures')).status()).toBe(400);
  expect((await request.post('/api/plan', { data: { from: 1 } })).status()).toBe(400);
  const plan = await request.post('/api/plan', { data: { from: { lat: 50.07, lon: 14.4, label: 'A' }, to: { lat: 50.08, lon: 14.42, label: 'B' }, dateTime: '2026-10-01T14:00:00+02:00', arriveBy: false } });
  expect(plan.status()).toBe(503);
  expect((await plan.json()).status).toBe('unavailable');
  expect((await request.get('/api/admin/health')).status()).toBe(401);
  expect((await request.get('/api/admin/health', { headers: { authorization: 'Bearer spatny-token-xyz' } })).status()).toBe(401);
  const ok = await request.get('/api/admin/health', { headers: { authorization: 'Bearer e2e-admin-token-123' } });
  expect(ok.status()).toBe(200);
  expect(JSON.stringify(await ok.json())).not.toContain('e2e-admin-token-123');
  const h = (await request.get('/')).headers();
  expect(h['content-security-policy']).toContain("worker-src 'self' blob:");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect((await (await request.get('/api/vehicles')).json()).meta.status).toBe('demo');
});
