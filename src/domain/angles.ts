/** Normalizace úhlu do intervalu <0, 360). */
export function normalizeDeg(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r === 0 ? 0 : r;
}

/** Nejkratší rozdíl from → to v intervalu (-180, 180> – řeší přechod přes 359°/0°. */
export function shortestDelta(from: number, to: number): number {
  const d = normalizeDeg(to - from);
  return d > 180 ? d - 360 : d;
}

export function lerpAngle(from: number, to: number, t: number): number {
  return normalizeDeg(from + shortestDelta(from, to) * t);
}

export function isValidBearing(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 360;
}

/**
 * Hodnota pro MapLibre `icon-rotate` při `icon-rotation-alignment: map`.
 * MapLibre sám kompenzuje natočení mapy, proto se zde natočení mapy NEPŘIČÍTÁ (zohledňuje se právě jednou).
 */
export function spriteIconRotate(vehicleBearing: number, frontDirectionDeg: number): number {
  return normalizeDeg(vehicleBearing - frontDirectionDeg);
}

/** Model výsledného úhlu čela na obrazovce (pro testy a dokumentaci): 0 = nahoru, 90 = doprava. */
export function screenAngleOfFront(vehicleBearing: number, mapBearing: number, frontDirectionDeg: number): number {
  const iconRotate = spriteIconRotate(vehicleBearing, frontDirectionDeg);
  return normalizeDeg(frontDirectionDeg + iconRotate - mapBearing);
}
