import { expect, test, type Page } from '@playwright/test';
import type { VehicleState } from '@/domain/model';

interface Demo {
  map: {
    jumpTo(o: Record<string, unknown>): void;
    project(c: [number, number]): { x: number; y: number };
    queryRenderedFeatures(o: { layers: string[] }): unknown[];
    getZoom(): number;
  };
  controller: {
    vehicles: Map<string, VehicleState>;
    ingest(list: VehicleState[], received: number): void;
    modelDiagnostics(): { enabled: boolean; vehicles: number; instances: number; meshes: number; drawCalls: number };
    select(id: string): void;
    raf: number;
  };
  feed: { stop(): void };
}
type W = { __doprava?: Demo };
async function ready(page: Page) {
  await page.goto('/test/rotace');
  await page.waitForFunction(() => (window as unknown as W).__doprava?.controller.vehicles.size === 9);
  await page.waitForFunction(() => (window as unknown as W).__doprava?.controller.modelDiagnostics().enabled === true);
}

test('3D karoserie: vykreslení a výběr mimo střed ve třech natočeních mapy', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  await page.evaluate(() => {
    const d = (window as unknown as W).__doprava!; d.feed.stop();
    const v = d.controller.vehicles.get('demo:vehicle:rot-tram-N')!;
    d.controller.ingest([{ ...v, measuredAt: new Date().toISOString() }], Date.now());
  });
  for (const bearing of [0, 90, 225]) {
    await page.evaluate((b) => (window as unknown as W).__doprava!.map.jumpTo({ center: [14.37835, 50.0604], zoom: 19.3, pitch: 62, bearing: b, padding: { left: 420, right: 100, top: 80, bottom: 0 } }), bearing);
    await expect.poll(() => page.evaluate(() => (window as unknown as W).__doprava!.controller.modelDiagnostics().instances)).toBe(1);
    const result = await page.evaluate(() => {
      const d = (window as unknown as W).__doprava!;
      return { stats: d.controller.modelDiagnostics(), sprites: d.map.queryRenderedFeatures({ layers: ['dop-pieces'] }).length, p: d.map.project([14.37835, 50.0604 - 0.000144]) };
    });
    expect(result.stats.drawCalls).toBeGreaterThan(0);
    expect(result.sprites).toBe(0);
    // Root projects onto the ground; the visible raised middle car is above it.
    await page.mouse.click(result.p.x + 3, result.p.y - 6);
    await expect(page.locator('#vd-title')).toContainText('N 0°');
    await page.getByRole('button', { name: 'Zavřít detail vozidla' }).click();
  }
  await page.evaluate(() => {
    const d = (window as unknown as W).__doprava!;
    d.map.jumpTo({ zoom: 14 }); d.controller.select('demo:vehicle:rot-tram-N');
  });
  await page.getByRole('button', { name: 'Sledovat ve 3D' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__doprava!.map.getZoom())).toBeGreaterThan(17.5);
  // smyčka usne, jakmile doběhne případný pulz nových dat (max. 1,4 s po každém obnovení)
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__doprava!.controller.raf), { timeout: 15_000, intervals: [250] }).toBe(0);
  expect(errors).toEqual([]);
});

test('3D / PNG / značky, filtry, LOD a trvalé nastavení', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  await page.evaluate(() => (window as unknown as W).__doprava!.map.jumpTo({ center: [14.38, 50.06], zoom: 16.8, pitch: 58, bearing: 0 }));
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__doprava!.controller.modelDiagnostics().instances)).toBe(9);
  await page.getByRole('button', { name: 'Tramvaje', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__doprava!.controller.modelDiagnostics().instances)).toBe(5);
  await page.getByRole('button', { name: 'Vše', exact: true }).click();
  await page.getByRole('button', { name: 'Vrstvy mapy' }).click();
  const select = page.getByLabel('Vozidla na mapě');
  await page.evaluate(() => (window as unknown as W).__doprava!.map.jumpTo({ pitch: 0 }));
  await select.selectOption('sprites');
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__doprava!.controller.modelDiagnostics().enabled)).toBe(false);
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__doprava!.map.queryRenderedFeatures({ layers: ['dop-pieces'] }).length)).toBeGreaterThan(0);
  await select.selectOption('markers');
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__doprava!.map.queryRenderedFeatures({ layers: ['dop-pieces'] }).length)).toBe(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__doprava!.map.queryRenderedFeatures({ layers: ['dop-marker'] }).length)).toBeGreaterThan(0);
  await select.selectOption('models');
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__doprava!.controller.modelDiagnostics().instances)).toBe(9);
  await page.evaluate(() => (window as unknown as W).__doprava!.map.jumpTo({ zoom: 14 }));
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__doprava!.controller.modelDiagnostics().instances)).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('doprava.settings.v1')!).vehicleStyle)).toBe('models');
  await page.reload();
  await page.waitForFunction(() => (window as unknown as W).__doprava?.controller.modelDiagnostics().enabled);
});

test('pět kategorií, neznámý směr a úklid geometrie po odfiltrování', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  await page.evaluate(() => {
    const d = (window as unknown as W).__doprava!; d.feed.stop();
    const template = d.controller.vehicles.values().next().value!;
    const modes = ['tram', 'train', 'metro', 'bus', 'trolleybus'] as const;
    const list: VehicleState[] = modes.map((mode, i) => ({ ...template, id: `demo:vehicle:model-${mode}` as VehicleState['id'], route: { ...template.route, mode, shortName: String(i + 1) },
      lon: 14.38 + (i - 2) * 0.0012, lat: 50.06, bearing: 0, measuredAt: new Date().toISOString() }));
    list.push({ ...list[0]!, id: 'demo:vehicle:unknown-heading' as VehicleState['id'], lon: 14.38, lat: 50.0607, bearing: null, bearingSource: null });
    d.controller.ingest(list, Date.now());
    d.map.jumpTo({ center: [14.38, 50.06], zoom: 16.5, pitch: 58, bearing: 0 });
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__doprava!.controller.modelDiagnostics().instances)).toBe(5);
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__doprava!.map.queryRenderedFeatures({ layers: ['dop-marker'] }).length)).toBeGreaterThan(0);
  const stats = await page.evaluate(() => (window as unknown as W).__doprava!.controller.modelDiagnostics());
  expect(stats.drawCalls).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Přívozy', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__doprava!.controller.modelDiagnostics().instances)).toBe(0);
});
