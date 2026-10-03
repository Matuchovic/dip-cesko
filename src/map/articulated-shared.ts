/**
 * Data článkových vozidel bez závislosti na three.js – aby je mapa mohla použít,
 * aniž by se hned na startu stahovala 3D knihovna.
 */
/** Vzhled podle dodaných ilustrací: bílá karoserie, černý pás oken, barevný spodek a čelo. */
export interface Livery { base: number; roof: number; accent: string; glass: string; body: string; bidirectional: boolean }
export const LIVERY: Record<string, Livery> = {
  'tram-top-redwhite': { base: 0.32, roof: 3.3, accent: '#C8102E', glass: '#14171C', body: '#F3F4F6', bidirectional: false },
  'train-top-bluewhite': { base: 0.55, roof: 4.05, accent: '#1F4FB5', glass: '#14171C', body: '#F2F3F5', bidirectional: true },
};
export const ARTICULATED_ASSETS = Object.keys(LIVERY);
export const roofHeight = (assetId: string) => LIVERY[assetId]?.roof ?? 3.4;
