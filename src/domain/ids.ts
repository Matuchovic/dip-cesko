export type ProviderId = 'pid' | 'demo';
export type IdKind = 'vehicle' | 'trip' | 'route' | 'stop' | 'group' | 'alert' | 'departure';
export type NsId<K extends IdKind> = string & { readonly __ns: K };

/** Identifikátory z různých zdrojů mají oddělený jmenný prostor: provider:druh:původní-id. */
export function nsId<K extends IdKind>(provider: ProviderId, kind: K, raw: string | number): NsId<K> {
  const value = String(raw).trim();
  if (!value) throw new Error(`Prázdné ID (${provider}:${kind})`);
  return `${provider}:${kind}:${value}` as NsId<K>;
}

export function parseNsId(id: string): { provider: ProviderId; kind: IdKind; raw: string } | null {
  const m = /^(pid|demo):(vehicle|trip|route|stop|group|alert|departure):(.+)$/.exec(id);
  if (!m) return null;
  return { provider: m[1] as ProviderId, kind: m[2] as IdKind, raw: m[3] as string };
}
