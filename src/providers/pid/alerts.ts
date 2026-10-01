import { XMLParser } from 'fast-xml-parser';
import { nsId } from '@/domain/ids';
import type { Alert } from '@/domain/model';

export const PID_ALERTS_URL = 'https://pid.cz/feed/rss-mimoradnosti';
export const PID_WEB_HOST = 'pid.cz';

const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
/** Externí text zobrazujeme pouze jako prostý text – značky se odstraní. */
export const toPlainText = (html: string, max = 600) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, max);

export function parseAlertsRss(xml: string): Alert[] {
  const parser = new XMLParser({ ignoreAttributes: true, processEntities: false, htmlEntities: false, parseTagValue: false, trimValues: true });
  const doc = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
  const items = doc.rss?.channel?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list.slice(0, 50).flatMap((it, i): Alert[] => {
    const o = it as Record<string, unknown>;
    const title = typeof o.title === 'string' ? toPlainText(o.title, 200) : '';
    if (!title) return [];
    let link: string | null = null;
    if (typeof o.link === 'string') {
      try { const u = new URL(o.link); if (u.protocol === 'https:' && (u.hostname === PID_WEB_HOST || u.hostname.endsWith(`.${PID_WEB_HOST}`))) link = u.toString(); } catch { link = null; }
    }
    const pub = typeof o.pubDate === 'string' ? Date.parse(o.pubDate) : NaN;
    const guid = typeof o.guid === 'string' ? o.guid : `${title}-${i}`;
    return [{ id: nsId('pid', 'alert', guid.slice(0, 200)), title, summary: typeof o.description === 'string' ? toPlainText(o.description) : '', link, publishedAt: Number.isFinite(pub) ? new Date(pub).toISOString() : null }];
  });
}
