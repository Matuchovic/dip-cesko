import type { Envelope, VehicleState } from '@/domain/model';

export interface FeedCallbacks {
  onData(env: Envelope<VehicleState[]>, receivedAt: number, fromCache: boolean): void;
  onError(message: string, offline: boolean): void;
}

/**
 * Pravidelné načítání poloh. Frekvence získávání dat je oddělená od animace; při skrytí stránky se
 * dotazování zastaví a po návratu se data hned obnoví. Souběžné požadavky se ruší, chyby mají backoff.
 */
export class VehicleFeed {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ctrl: AbortController | null = null;
  private failures = 0;
  private running = false;

  private soon: ReturnType<typeof setTimeout> | null = null;

  /** Interval i dotaz se vyhodnocují při každém načtení (výřez mapy, přiblížení). */
  constructor(private cb: FeedCallbacks, private interval: number | (() => number) = 10_000, private query: string | (() => string) = '') {}

  private get intervalMs() { return typeof this.interval === 'function' ? this.interval() : this.interval; }

  /** Po posunu mapy načíst nový výřez brzy (s krátkým zpožděním proti zahlcení). */
  refreshSoon(ms = 400) { if (this.soon) clearTimeout(this.soon); this.soon = setTimeout(() => this.refreshNow(), ms); }

  start() {
    if (this.running) return;
    this.running = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('online', this.onOnline);
    void this.tick();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.ctrl?.abort();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('online', this.onOnline);
  }

  refreshNow() { if (this.timer) clearTimeout(this.timer); void this.tick(); }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') { if (this.timer) clearTimeout(this.timer); this.ctrl?.abort(); }
    else this.refreshNow();
  };
  private onOnline = () => this.refreshNow();

  private schedule(ms: number) {
    if (!this.running || document.visibilityState === 'hidden') return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async tick() {
    if (!this.running) return;
    this.ctrl?.abort();
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    const timeout = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const q = typeof this.query === 'function' ? this.query() : this.query;
      const res = await fetch(`/api/vehicles${q}`, { signal: ctrl.signal, cache: 'no-store' });
      if (res.status === 429) throw new Error('Příliš mnoho požadavků – zpomalujeme obnovu.');
      const body = (await res.json()) as Envelope<VehicleState[]>;
      if (!body || !Array.isArray(body.data) || !body.meta) throw new Error('Neplatná odpověď serveru');
      // Chyba zdroje bez dat nesmí smazat vozidla z mapy – ponecháme poslední polohy a zkusíme to brzy znovu.
      if (body.meta.status === 'error' && body.data.length === 0) throw new Error(body.meta.message ?? 'Zdroj poloh je dočasně nedostupný.');
      this.failures = 0;
      this.cb.onData(body, Date.now(), res.headers.get('x-doprava-offline') === '1');
      this.schedule(this.intervalMs);
    } catch (err) {
      if (ctrl.signal.aborted && document.visibilityState === 'hidden') return;
      this.failures++;
      // Síťová chyba (TypeError) = bez spojení se serverem; HTTP chyby jsou jiný stav.
      const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || err instanceof TypeError;
      this.cb.onError(offline ? 'Bez připojení. Zobrazujeme poslední známé polohy.' : err instanceof Error ? err.message : 'Data se nepodařilo načíst.', offline);
      this.schedule(Math.min(15_000, this.intervalMs * 2 ** Math.min(this.failures, 2)));
    } finally {
      clearTimeout(timeout);
    }
  }
}
