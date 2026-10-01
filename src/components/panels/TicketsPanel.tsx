import { IconExternal } from '../icons';

const CHANNELS = [
  { title: 'Mobilní aplikace PID Lítačka', text: 'Oficiální aplikace PID pro nákup jízdenek v Praze a Středočeském kraji.', href: 'https://pid.cz/informace-k-cestovani/mobilni-aplikace/' },
  { title: 'Jak pořídit jízdenku PID', text: 'Přehled oficiálních prodejních kanálů: automaty, předprodej, aplikace a další.', href: 'https://pid.cz/jizdne-a-tarif/jak-poridit-jizdenku/' },
  { title: 'Ceník jízdného v Praze', text: 'Aktuální ceny podle tarifu PID.', href: 'https://pid.cz/jizdne-a-tarif#praha' },
  { title: 'Tarifní kalkulačka PID', text: 'Výpočet jízdného pro cestu přes tarifní pásma.', href: 'https://pid.cz/tarif-web/calc.php' },
  { title: 'Prodejní místa PID', text: 'Automaty, kontaktní místa a pokladny (otevřená data PID).', href: 'https://pid.cz/kontakty/prodejni-mista/' },
  { title: 'Celostátní tarif OneTicket', text: 'Informace o celostátním tarifu pro cesty mimo integrované systémy.', href: 'https://oneticket.cz/tariff' },
];

export default function TicketsPanel() {
  return (
    <>
      <h1>Jízdenky</h1>
      <div className="card" role="note">
        <strong>Prodej v aplikaci není integrován</strong>
        <p className="hint">Platný jízdní doklad vyžaduje smluvní integraci s organizátorem dopravy a platební bránou. Proto zde nevydáváme žádné jízdenky ani QR kódy. Níže jsou ověřené oficiální kanály.</p>
        <dl className="kv">
          <dt>Nákup jízdenek</dt><dd>Neintegrováno</dd>
          <dt>Ceny v aplikaci</dt><dd>Neintegrováno (odkaz na oficiální ceník)</dd>
          <dt>Kupóny / Lítačka</dt><dd>Neintegrováno</dd>
        </dl>
      </div>
      <h2>Oficiální možnosti pořízení</h2>
      <ul className="list">
        {CHANNELS.map((c) => (
          <li key={c.href}>
            <a className="row" href={c.href} target="_blank" rel="noopener noreferrer">
              <span className="row-main"><span className="row-title">{c.title}</span><span className="row-sub" style={{ whiteSpace: 'normal' }}>{c.text}</span></span>
              <IconExternal size={18} />
            </a>
          </li>
        ))}
      </ul>
      <p className="footer-note">Odkazy vedou na weby provozovatelů (pid.cz, oneticket.cz). Ověřeno 1. 10. 2026.</p>
    </>
  );
}
