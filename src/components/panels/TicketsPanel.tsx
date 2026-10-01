'use client';
import { useT } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
import { IconExternal } from '../icons';

const CHANNELS: { n: 1 | 2 | 3 | 4 | 5 | 6; href: string }[] = [
  { n: 1, href: 'https://pid.cz/informace-k-cestovani/mobilni-aplikace/' },
  { n: 2, href: 'https://pid.cz/jizdne-a-tarif/jak-poridit-jizdenku/' },
  { n: 3, href: 'https://pid.cz/jizdne-a-tarif#praha' },
  { n: 4, href: 'https://pid.cz/tarif-web/calc.php' },
  { n: 5, href: 'https://pid.cz/kontakty/prodejni-mista/' },
  { n: 6, href: 'https://oneticket.cz/tariff' },
];

export default function TicketsPanel() {
  const t = useT();
  return (
    <>
      <h1>{t('tk_title')}</h1>
      <div className="card" role="note">
        <strong>{t('tk_notIntegrated')}</strong>
        <p className="hint">{t('tk_notIntegratedText')}</p>
        <dl className="kv">
          <dt>{t('tk_buy')}</dt><dd>{t('tk_no')}</dd>
          <dt>{t('tk_prices')}</dt><dd>{t('tk_noPrices')}</dd>
          <dt>{t('tk_coupons')}</dt><dd>{t('tk_no')}</dd>
        </dl>
      </div>
      <h2>{t('tk_official')}</h2>
      <ul className="list">
        {CHANNELS.map((c) => (
          <li key={c.href}>
            <a className="row" href={c.href} target="_blank" rel="noopener noreferrer">
              <span className="row-main"><span className="row-title">{t(`tk_c${c.n}t` as MessageKey)}</span><span className="row-sub" style={{ whiteSpace: 'normal' }}>{t(`tk_c${c.n}d` as MessageKey)}</span></span>
              <IconExternal size={18} />
            </a>
          </li>
        ))}
      </ul>
      <p className="footer-note">{t('tk_footer')}</p>
    </>
  );
}
