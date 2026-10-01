// Ověří skutečný tvar odpovědí Golemio proti polím, která používá adaptér (src/providers/pid/golemio.ts).
// Použití: GOLEMIO_API_KEY=... npm run verify:golemio   (klíč se nevypisuje)
const key = process.env.GOLEMIO_API_KEY;
if (!key) { console.error('Nastavte proměnnou GOLEMIO_API_KEY.'); process.exit(2); }
const headers = { 'X-Access-Token': key, accept: 'application/json' };
async function get(p) {
  const r = await fetch(`https://api.golemio.cz${p}`, { headers, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return r.json();
}
const pick = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
let missing = 0;
function report(name, items, paths) {
  console.log(`\n== ${name}: ${items.length} položek`);
  for (const p of paths) {
    const n = items.filter((i) => pick(i, p) !== undefined && pick(i, p) !== null).length;
    if (n === 0) missing++;
    console.log(`${n === 0 ? '✗' : '✓'} ${p}: ${n}/${items.length}`);
  }
}
try {
  const vp = await get('/v2/vehiclepositions?preferredTimezone=Europe%2FPrague');
  report('vehiclepositions', vp.features ?? [], ['geometry.coordinates', 'properties.last_position.bearing', 'properties.last_position.speed', 'properties.last_position.origin_timestamp',
    'properties.last_position.delay.actual', 'properties.last_position.state_position', 'properties.last_position.is_canceled', 'properties.trip.gtfs.trip_id', 'properties.trip.gtfs.route_id',
    'properties.trip.gtfs.route_short_name', 'properties.trip.gtfs.route_type', 'properties.trip.gtfs.trip_headsign', 'properties.trip.vehicle_registration_number',
    'properties.trip.vehicle_type.description_cs', 'properties.trip.wheelchair_accessible', 'properties.trip.air_conditioned']);
  const db = await get('/v2/pid/departureboards?aswIds[]=1040_1&aswIds[]=1040_2&limit=10&preferredTimezone=Europe%2FPrague');
  report('departureboards (Anděl A+B)', db.departures ?? [], ['departure_timestamp.scheduled', 'departure_timestamp.predicted', 'delay.is_available', 'delay.seconds',
    'route.short_name', 'route.type', 'trip.id', 'trip.headsign', 'trip.is_canceled', 'trip.is_at_stop', 'trip.is_wheelchair_accessible', 'stop.platform_code']);
  console.log(missing ? `\nPozor: ${missing} očekávaných polí chybí – upravte schéma v golemio.ts.` : '\nVšechna očekávaná pole nalezena.');
  process.exit(missing ? 1 : 0);
} catch (err) {
  console.error(`Ověření selhalo: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
