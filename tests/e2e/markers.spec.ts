import { expect, test } from '@playwright/test';
type W = { __doprava?: { map: { jumpTo(o: Record<string, unknown>): void; queryRenderedFeatures(o: Record<string, unknown>): { properties: Record<string, unknown> }[]; getSource(id: string): { serialize?: () => { data: { features: unknown[] } } } | undefined };
  controller: { vehicles: Map<string, unknown>; select(id: string, o: Record<string, boolean>): void } } };

test('nové značky: pilulky s linkou a zpožděním, shluky podle druhu, trasa vybraného vozu', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => ((window as unknown as W).__doprava?.controller.vehicles.size ?? 0) >= 3, null, { timeout: 45_000 });
  await page.evaluate(() => (window as unknown as W).__doprava!.map.jumpTo({ center: [14.4045, 50.0712], zoom: 14.6, pitch: 0, bearing: 0 }));
  await expect.poll(async () => page.evaluate(() => (window as unknown as W).__doprava!.map.queryRenderedFeatures({ layers: ['dop-dot'] }).filter((f) => String(f.properties.pill).startsWith('p|')).length), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: '/tmp/look-pills.png' });
  await page.evaluate(() => (window as unknown as W).__doprava!.map.jumpTo({ zoom: 11.2 }));
  await expect.poll(async () => page.evaluate(() => (window as unknown as W).__doprava!.map.queryRenderedFeatures({ layers: ['dop-ov-cluster', 'dop-ov-dot'] }).length), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: '/tmp/look-clusters.png' });
  await page.evaluate(() => { const d = (window as unknown as W).__doprava!; d.map.jumpTo({ center: [14.4045, 50.0712], zoom: 15 }); d.controller.select('demo:vehicle:9350', { fly: false }); });
  await expect.poll(async () => page.evaluate(() => (window as unknown as W).__doprava!.map.queryRenderedFeatures({ layers: ['dop-route', 'dop-route-stops'] }).length), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/look-route.png' });
});
