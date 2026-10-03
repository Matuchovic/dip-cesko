'use client';
/* eslint-disable @next/next/no-img-element -- malá ikona aplikace */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '@/lib/store';
import { useI18n, useT } from '@/i18n';
import { getJson, useVisibleInterval } from '@/lib/hooks';
import { mapApi } from '@/lib/app-state';
import { useRouter } from 'next/navigation';
import type { Departure, Envelope, StopGroup, DepartureBoard } from '@/domain/model';
import { MODE_COLOR } from '@/domain/modes';
import StopSearch from '../StopSearch';
import { childSend, createInvite, familyStore, hydrateFamily, join, lookup, pollInvite, refreshAll, savePreset, unlink, type InviteView, type LinkView, type Pending, type Trip } from '@/lib/family/family';
import E3, { type E3Name } from '../icons/E3';

const QrScanner = dynamic(() => import('../family/QrScanner'), { ssr: false });
type View = 'home' | 'add' | 'join' | 'consent' | 'done';

/** Rodičovská kontrola: rodič sleduje spoj, kterým dítě jede; dítě vždy vidí, že se sdílí, a může to vypnout. */
export default function FamilyPanel() {
  const t = useT();
  const { locale } = useI18n();
  const lang = locale === 'en' ? 'en' : 'cs';
  const { ready, links } = useStore(familyStore, (s) => s);
  const [view, setView] = useState<View>('home');
  const [doneRole, setDoneRole] = useState<'parent' | 'child'>('parent');
  const [pending, setPending] = useState<Pending | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { void hydrateFamily(); }, []);
  // QR kód naskenovaný fotoaparátem telefonu otevře /rodina#p=… – rovnou připojit
  useEffect(() => {
    if (typeof location !== 'undefined' && /#p=/.test(location.hash)) {
      const href = location.href; history.replaceState(null, '', location.pathname);
      void lookup({ qr: href }).then((p) => { setPending(p); setView('consent'); }).catch((e) => setErr(errText(t, e)));
    }
  }, [t]);
  useVisibleInterval(() => { void refreshAll(); }, 15_000, []);

  const role = links[0]?.role ?? null;
  if (!ready) return <section className="fam"><p className="hint">{t('loading')}</p></section>;
  return (
    <section className="fam" aria-labelledby="fam-h">
      {view === 'home' && (
        <>
          <h1 id="fam-h">{t('fam_title')}</h1>
          {!role && <Intro onParent={() => setView('add')} onChild={() => setView('join')} t={t} />}
          {role === 'parent' && <ParentHome links={links} onAdd={() => setView('add')} t={t} />}
          {role === 'child' && <ChildHome link={links[0]!} t={t} />}
          {err && <p className="fam-err" role="alert">{err}</p>}
        </>
      )}
      {view === 'add' && <AddChild t={t} lang={lang} onDone={() => { setDoneRole('parent'); setView('done'); }} onBack={() => setView('home')} />}
      {view === 'join' && <JoinParent t={t} onFound={(p) => { setPending(p); setView('consent'); }} onBack={() => setView('home')} />}
      {view === 'consent' && pending && <Consent t={t} lang={lang} pending={pending} onDone={() => { setDoneRole('child'); setView('done'); }} onBack={() => setView('home')} />}
      {view === 'done' && <Done t={t} role={doneRole} onOk={() => setView('home')} />}
    </section>
  );
}

const errText = (t: ReturnType<typeof useT>, e: unknown) => {
  const s = (e as { status?: number })?.status;
  return s === 404 || s === 410 ? t('fam_err_expired') : s === 429 ? t('fam_err_slow') : s === 409 ? t('fam_err_fake') : s === 503 ? t('fam_err_off') : t('fam_err_generic');
};

function Intro({ onParent, onChild, t }: { onParent: () => void; onChild: () => void; t: ReturnType<typeof useT> }) {
  return (
    <div className="fam-intro">
      <p className="fam-lead">{t('fam_lead')}</p>
      <div className="fam-roles">
        <button type="button" className="fam-role" onClick={onParent}><E3 name="parent" size={64} /><b>{t('fam_iamParent')}</b><small>{t('fam_iamParentSub')}</small></button>
        <button type="button" className="fam-role" onClick={onChild}><E3 name="child" size={64} /><b>{t('fam_iamChild')}</b><small>{t('fam_iamChildSub')}</small></button>
      </div>
      <ul className="fam-trust">
        <li><E3 name="lock" size={28} /> {t('fam_trust1')}</li><li><E3 name="tram" size={28} /> {t('fam_trust2')}</li><li><E3 name="eyes" size={28} /> {t('fam_trust3')}</li><li><E3 name="broom" size={28} /> {t('fam_trust4')}</li>
      </ul>
    </div>
  );
}

// ---------- rodič: přidání dítěte ----------
function AddChild({ t, lang, onDone, onBack }: { t: ReturnType<typeof useT>; lang: 'cs' | 'en'; onDone: () => void; onBack: () => void }) {
  const [inv, setInv] = useState<InviteView | null>(null);
  const [svg, setSvg] = useState('');
  const [left, setLeft] = useState(600);
  const [name, setName] = useState(t('fam_defaultParent'));
  const [err, setErr] = useState<string | null>(null);
  const [joined, setJoined] = useState<string[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const i = await createInvite();
        const QR = (await import('qrcode')).default;
        const markup = await QR.toString(i.qr, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0F2341', light: '#0000' } });
        if (alive) { setErr(null); setInv(i); setSvg(markup); }
      } catch (e) { if (alive) setErr(errText(t, e)); }
    })();
    return () => { alive = false; };
  }, [attempt, t]);
  const start = () => setAttempt((n) => n + 1);
  useEffect(() => {
    if (!inv || joined) return;
    const exp = Date.parse(inv.expiresAt);
    const id = setInterval(async () => {
      setLeft(Math.max(0, Math.round((exp - Date.now()) / 1000)));
      try { const l = await pollInvite(inv, name.trim() || t('fam_defaultParent'), lang); if (l) { setJoined(l.emojis); clearInterval(id); } } catch { /* zkusí znovu */ }
    }, 2000);
    return () => clearInterval(id);
  }, [inv, joined, name, lang, t]);
  if (joined) return (
    <div className="fam-card fam-center">
      <span className="fam-big"><E3 name="party" size={72} /></span><h2>{t('fam_childJoined')}</h2><p>{t('fam_verifyHint')}</p>
      <div className="fam-emoji" aria-label={t('fam_verify')}>{joined.map((e, i) => <span key={i}><E3 name={e as E3Name} size={42} /></span>)}</div>
      <button type="button" className="btn btn-primary" onClick={onDone}>{t('fam_verifyOk')}</button>
    </div>
  );
  return (
    <div className="fam-pair">
      <button type="button" className="fam-back" onClick={onBack}>← {t('onb_back')}</button>
      <p className="fam-eb">{t('fam_family')}</p>
      <h2>{t('fam_addChild')}</h2>
      <p className="fam-sub">{t('fam_addChildSub')}</p>
      <label className="field"><span>{t('fam_yourName')}</span><input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} /></label>
      {err ? <p className="fam-err" role="alert">{err} <button type="button" className="linkish" onClick={start}>{t('fam_retry')}</button></p> : (
        <>
          <div className="fam-qrwrap"><div className="fam-qr">{svg ? <span dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="fam-qr-skel" />}<img className="fam-qr-logo" src="/icons/icon-256.webp" alt="" width={44} height={44} /><span className="fam-sweep" /></div></div>
          <div className="fam-code" aria-label={t('fam_codeAria')}>{(inv?.code ?? '------').split('').map((d, i) => <span key={i} style={{ '--i': i } as CSSProperties}>{d}</span>)}</div>
          <div className="fam-timer"><small><span>{t('fam_valid')}</span><span>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span></small><b><i style={{ width: `${(left / 600) * 100}%` }} /></b></div>
          <p className="fam-wait"><span className="fam-dots"><i /><i /><i /></span>{t('fam_waiting')}</p>
        </>
      )}
    </div>
  );
}

// ---------- dítě: připojení ----------
function JoinParent({ t, onFound, onBack }: { t: ReturnType<typeof useT>; onFound: (p: Pending) => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cam, setCam] = useState(false);
  const go = async (by: { code?: string; qr?: string }) => {
    setBusy(true); setErr(null);
    try { onFound(await lookup(by)); } catch (e) { setErr(errText(t, e)); }
    setBusy(false);
  };
  return (
    <div className="fam-pair">
      <button type="button" className="fam-back" onClick={onBack}>← {t('onb_back')}</button>
      <p className="fam-eb">{t('fam_step1')}</p>
      <h2>{t('fam_joinTitle')}</h2>
      <p className="fam-sub">{t('fam_joinSub')}</p>
      {cam ? <QrScanner onCode={(txt) => { setCam(false); void go({ qr: txt }); }} onClose={() => setCam(false)} label={t('fam_scanHint')} /> : (
        <button type="button" className="fam-scan-cta" onClick={() => setCam(true)}><span className="fam-scan-ico"><i /><i /><i /><i /></span>{t('fam_scan')}</button>
      )}
      <p className="fam-or">{t('fam_orCode')}</p>
      <input className="input fam-code-in" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="••••••" value={code}
        onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) void go({ code: v }); }} aria-label={t('fam_codeAria')} />
      {busy && <p className="hint">{t('loading')}</p>}
      {err && <p className="fam-err" role="alert">{err}</p>}
    </div>
  );
}

function Consent({ t, lang, pending, onDone, onBack }: { t: ReturnType<typeof useT>; lang: 'cs' | 'en'; pending: Pending; onDone: () => void; onBack: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="fam-pair">
      <button type="button" className="fam-back" onClick={onBack}>← {t('onb_back')}</button>
      <p className="fam-eb">{t('fam_step2')}</p>
      <h2>{t('fam_consentTitle')}</h2>
      <ul className="fam-consent">
        <li><i><E3 name="tram" size={30} /></i><span>{t('fam_c1')}<small>{t('fam_c1s')}</small></span></li>
        <li><i><E3 name="bell" size={30} /></i><span>{t('fam_c2')}<small>{t('fam_c2s')}</small></span></li>
        <li className="no"><i><E3 name="pin" size={30} /></i><span>{t('fam_c3')}<small>{t('fam_c3s')}</small></span></li>
        <li><i><E3 name="pause" size={30} /></i><span>{t('fam_c4')}<small>{t('fam_c4s')}</small></span></li>
      </ul>
      <p className="fam-sub">{t('fam_verifyHint')}</p>
      <div className="fam-emoji">{pending.emojis.map((e, i) => <span key={i}><E3 name={e as E3Name} size={42} /></span>)}</div>
      <label className="field"><span>{t('fam_yourNameKid')}</span><input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder={t('fam_namePh')} /></label>
      {err && <p className="fam-err" role="alert">{err}</p>}
      <button type="button" className="btn btn-primary fam-agree" disabled={busy || !name.trim()} onClick={async () => {
        setBusy(true); setErr(null);
        try { await join(pending, name.trim(), lang); onDone(); } catch (e) { setErr(errText(t, e)); }
        setBusy(false);
      }}>{t('fam_agree')}</button>
    </div>
  );
}

function Done({ t, role, onOk }: { t: ReturnType<typeof useT>; role: 'parent' | 'child'; onOk: () => void }) {
  const C = ['#9EC1FF', '#FFAFC8', '#A7EBC4', '#FFD58A', '#C9B6FF', '#6FA8FF'];
  return (
    <div className="fam-card fam-center fam-done">
      <div className="fam-conf" aria-hidden>{Array.from({ length: 30 }, (_, i) => { const a = (i / 30) * Math.PI * 2, v = 90 + ((i * 37) % 120); return <i key={i} style={{ background: C[i % 6], '--x': `${Math.cos(a) * v}px`, '--y': `${Math.sin(a) * v + 50}px`, '--r': `${(i * 83) % 540}deg` } as CSSProperties} />; })}</div>
      <div className="fam-pairav"><span className="fam-av"><E3 name="parent" size={64} /></span><span className="fam-lock"><E3 name="lock" size={30} /></span><span className="fam-av"><E3 name="child" size={64} /></span></div>
      <svg className="fam-chk" viewBox="0 0 90 90" aria-hidden><circle cx="45" cy="45" r="40" /><path d="M28 46l11 11 23-24" /></svg>
      <h2>{role === 'parent' ? t('fam_doneParent') : t('fam_doneChild')}</h2>
      <p>{role === 'parent' ? t('fam_doneParentSub') : t('fam_doneChildSub')}</p>
      <button type="button" className="btn btn-primary" onClick={onOk}>{t('fam_continue')}</button>
    </div>
  );
}

// ---------- rodič: přehled dětí ----------
function ParentHome({ links, onAdd, t }: { links: LinkView[]; onAdd: () => void; t: ReturnType<typeof useT> }) {
  return (
    <div className="fam-list">
      {links.map((l) => <ChildCard key={l.id} l={l} t={t} />)}
      <button type="button" className="fam-add" onClick={onAdd}>＋ {t('fam_addChild')}</button>
    </div>
  );
}
const hhmm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : '');
function ChildCard({ l, t }: { l: LinkView; t: ReturnType<typeof useT> }) {
  const router = useRouter();
  const [eta, setEta] = useState<number | null>(null);
  const trip = l.trip && !l.trip.confirmed ? l.trip : null;
  // dojezd do cíle živě: stejný spoj v tabuli cílové zastávky
  useVisibleInterval(() => {
    if (!trip?.to) { setEta(null); return; }
    void getJson<Envelope<DepartureBoard>>(`/api/departures?stop=${encodeURIComponent(trip.to)}&limit=40`).then((r) => {
      const d = r.body?.data.departures.find((x) => (trip.tripId && x.tripId === trip.tripId) || (x.route.shortName === trip.line && x.headsign === trip.headsign));
      setEta(d ? Math.max(0, Math.round((Date.parse(d.predictedAt ?? d.scheduledAt ?? '') - Date.now()) / 60_000)) : null);
    });
  }, 30_000, [trip?.to, trip?.tripId]);
  const sos = l.sosActive ? l.msgs.find((m) => m.kind === 'sos') : undefined;
  const sosPos = sos?.data && typeof sos.data.lat === 'number' ? { lat: sos.data.lat as number, lon: sos.data.lon as number } : null;
  const delay = l.auto.find((a) => a.kind === 'delay')?.min ?? null;
  const status = l.paused ? <><E3 name="pause" size={15} /> {t('fam_paused')}</> : trip ? (eta !== null ? t('fam_etaMin', { n: eta }) : t('fam_onTheWay')) : l.trip?.confirmed ? <><E3 name="finish" size={15} /> {t('fam_arrived', { s: l.trip.toName ?? '' })}</> : t('fam_idle');
  const name = l.peerName || t('fam_child');
  return (
    <article className={`fam-child${sos ? ' sos' : ''}`}>
      {sos && (
        <div className="fam-sos" role="alert"><b><E3 name="sos" size={30} /> {t('fam_sosTitle', { n: name })}</b><span>{hhmm(sos.at)}{sosPos ? '' : ` · ${t('fam_sosNoLoc')}`}</span>
          {sosPos && <button type="button" className="btn" onClick={() => { mapApi.controller?.flyTo(sosPos.lon, sosPos.lat, 17); router.push('/'); }}><E3 name="map" size={20} /> {t('fam_showMap')}</button>}</div>
      )}
      <header><E3 name="child" size={52} /><span><b>{name}</b><small>{status}</small></span>{!l.paused && trip && <span className="fam-live"><i />{t('fam_live')}</span>}</header>
      {trip && (
        <div className="fam-trip"><span className="fam-line" style={{ background: MODE_COLOR[(trip.mode as keyof typeof MODE_COLOR)] ?? '#C8102E' }}>{trip.line}</span>
          <span><b>{trip.fromName} → {trip.toName ?? trip.headsign}</b><small>{t('fam_boardedAt', { t: hhmm(trip.boardedAt) })}{delay ? <> · <E3 name="clock" size={14} /> {t('fam_delay', { n: delay })}</> : ''}</small></span>
          {eta !== null && <span className="fam-eta">{eta}<small>min</small></span>}</div>
      )}
      <ol className="fam-tl">
        {[...l.msgs.filter((m) => m.kind !== 'hello').map((m) => ({ at: m.at, ...msgText(t, m.kind, m.data) })), ...l.auto.map((a) => ({ at: a.at, ...autoText(t, a) }))]
          .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 6).map((x, i) => <li key={i}><span><E3 name={x.icon} size={18} /> {x.txt}</span><time>{hhmm(x.at)}</time></li>)}
      </ol>
      <footer><span className="fam-verify" title={t('fam_verify')}>{l.emojis.map((e, i) => <E3 key={i} name={e as E3Name} size={18} />)}</span><button type="button" className="linkish" onClick={() => { if (confirm(t('fam_unlinkQ', { n: name }))) void unlink(l.id); }}>{t('fam_unlink')}</button></footer>
    </article>
  );
}
type Line = { icon: E3Name; txt: string };
function msgText(t: ReturnType<typeof useT>, kind: string, d: Record<string, unknown> | null): Line {
  const line = String(d?.line ?? ''), to = String(d?.toName ?? d?.headsign ?? '');
  switch (kind) {
    case 'board': return { icon: 'tram', txt: t('fam_ev_board', { l: line, s: to }) };
    case 'arrive': return { icon: 'finish', txt: t('fam_ev_arrive') };
    case 'sos': return { icon: 'sos', txt: t('fam_ev_sos') };
    case 'pause': return { icon: 'pause', txt: t('fam_ev_pause') };
    case 'resume': return { icon: 'play', txt: t('fam_ev_resume') };
    case 'end': return { icon: 'check', txt: t('fam_ev_end') };
    default: return { icon: 'pin', txt: kind };
  }
}
function autoText(t: ReturnType<typeof useT>, a: { kind: string; line: string; min?: number; stopName?: string | null }): Line {
  switch (a.kind) {
    case 'delay': return { icon: 'clock', txt: t('fam_auto_delay', { l: a.line, n: a.min ?? 0 }) };
    case 'arrived': return { icon: 'pin', txt: t('fam_auto_arrived', { l: a.line, s: a.stopName ?? '' }) };
    case 'noconfirm': return { icon: 'warn', txt: t('fam_auto_noconfirm') };
    case 'canceled': return { icon: 'cross', txt: t('fam_auto_canceled', { l: a.line }) };
    default: return { icon: 'pin', txt: a.kind };
  }
}

// ---------- dítě ----------
function ChildHome({ link, t }: { link: LinkView; t: ReturnType<typeof useT> }) {
  const presets = useStore(familyStore, (s) => s.presets);
  const [from, setFrom] = useState<StopGroup | null>(null);
  const [deps, setDeps] = useState<Departure[]>([]);
  const [pick, setPick] = useState<Departure | null>(null);
  const [dest, setDest] = useState<{ key: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [editPreset, setEditPreset] = useState<'school' | 'home' | null>(null);
  const trip = link.trip && !link.trip.confirmed ? link.trip : null;
  const parent = link.peerName || t('fam_parent');
  useEffect(() => {
    if (!from) return;
    void getJson<Envelope<DepartureBoard>>(`/api/departures?stop=${encodeURIComponent(from.key)}&limit=12`).then((r) => setDeps((r.body?.data.departures ?? []).filter((d) => !d.isCanceled).slice(0, 8)));
  }, [from]);
  const say = (s: string) => { setNote(s); setTimeout(() => setNote(null), 4000); };
  const board = async () => {
    if (!pick || !from || !pick.scheduledAt) return;
    setBusy(true);
    const tr: Trip = { line: pick.route.shortName, mode: pick.route.mode, headsign: pick.headsign, from: from.key, fromName: from.name, to: dest?.key ?? null, toName: dest?.name ?? null, scheduledAt: pick.scheduledAt, tripId: pick.tripId };
    try { await childSend('board', { line: tr.line, headsign: tr.headsign, fromName: tr.fromName, toName: tr.toName }, tr); say(t('fam_sentBoard', { n: parent })); setPick(null); } catch { say(t('fam_err_generic')); }
    setBusy(false);
  };
  const sos = async () => {
    let pos: { lat: number; lon: number; acc: number } | null = null;
    try { pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) }), rej, { enableHighAccuracy: true, timeout: 6000, maximumAge: 30_000 })); } catch { /* bez polohy */ }
    try { await childSend('sos', pos ? { ...pos } : {}); say(t('fam_sentSos', { n: parent })); } catch { say(t('fam_err_generic')); }
  };
  return (
    <div className="fam-kid">
      <div className={`fam-priv${link.paused ? ' off' : ''}`}>
        <span className="fam-pdot" />{link.paused ? t('fam_privOff') : t('fam_privOn', { n: parent })}
        <button type="button" role="switch" aria-checked={!link.paused} aria-label={t('fam_share')} className="fam-sw" onClick={() => void childSend(link.paused ? 'resume' : 'pause', {})} />
      </div>
      {note && <p className="fam-toast" role="status">{note}</p>}
      {trip ? (
        <div className="fam-card">
          <div className="fam-trip big"><span className="fam-line" style={{ background: MODE_COLOR[(trip.mode as keyof typeof MODE_COLOR)] ?? '#C8102E' }}>{trip.line}</span><span><b>{trip.fromName} → {trip.toName ?? trip.headsign}</b><small>{t('fam_boardedAt', { t: hhmm(trip.boardedAt) })}</small></span></div>
          <div className="fam-row2">
            <button type="button" className="btn fam-ok" onClick={() => void childSend('arrive', {}).then(() => say(t('fam_sentArrive', { n: parent })))}><E3 name="finish" size={26} /> {t('fam_iArrived')}</button>
            <HoldSos onFire={() => void sos()} label={t('fam_sos')} />
          </div>
          <p className="hint fam-center-t">{t('fam_sosHint')}</p>
          <button type="button" className="linkish" onClick={() => void childSend('end', {})}>{t('fam_endTrip')}</button>
        </div>
      ) : (
        <>
          <div className="fam-presets">
            {(['school', 'home'] as const).map((id) => { const p = presets.find((x) => x.id === id); return (
              <button key={id} type="button" className={`fam-preset${dest?.key && dest.key === p?.key ? ' on' : ''}`} onClick={() => (p ? setDest({ key: p.key, name: p.name }) : setEditPreset(id))}>
                <span><E3 name={id === 'school' ? 'school' : 'home'} size={44} /></span><b>{id === 'school' ? t('fam_toSchool') : t('fam_toHome')}</b><small>{p ? p.name : t('fam_setStop')}</small>
              </button>); })}
          </div>
          {editPreset && <div className="fam-card"><StopSearch label={editPreset === 'school' ? t('fam_toSchool') : t('fam_toHome')} placeholder={t('place_pick')} autoFocus onSelect={(g) => { if (g) { void savePreset({ id: editPreset, key: g.key, name: g.name }); setDest({ key: g.key, name: g.name }); setEditPreset(null); } }} /></div>}
          <div className="fam-card">
            <StopSearch label={t('fam_from')} placeholder={t('place_pick')} onSelect={(g) => { setFrom(g); setPick(null); }} />
            {from && <ul className="fam-deps">{deps.map((d) => (
              <li key={d.id}><button type="button" className={pick?.id === d.id ? 'on' : ''} onClick={() => setPick(d)}><span className="fam-line" style={{ background: MODE_COLOR[d.route.mode] }}>{d.route.shortName}</span><b>{d.headsign}</b><time>{hhmm(d.predictedAt ?? d.scheduledAt)}</time></button></li>))}</ul>}
          </div>
          {pick && <Slide label={t('fam_slide')} busy={busy} onDone={() => void board()} />}
        </>
      )}
      <p className="fam-foot"><span className="fam-verify">{link.emojis.map((e, i) => <E3 key={i} name={e as E3Name} size={18} />)}</span> · <button type="button" className="linkish" onClick={() => { if (confirm(t('fam_unlinkQ', { n: parent }))) void unlink(link.id); }}>{t('fam_unlink')}</button></p>
    </div>
  );
}

/** Potvrzení přejetím – omylem se nespustí. Klávesnice: Enter. */
function Slide({ label, onDone, busy }: { label: string; onDone: () => void; busy: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const st = useRef<{ x0: number; max: number } | null>(null);
  return (
    <div className="fam-slide" ref={track} role="button" tabIndex={0} aria-label={label} onKeyDown={(e) => { if (e.key === 'Enter') onDone(); }}>
      <div className="fam-fill" style={{ width: 60 + x }} /><span className="fam-slide-t">{busy ? '…' : label}</span>
      <span className="fam-knob" style={{ left: 4 + x }}
        onPointerDown={(e) => { st.current = { x0: e.clientX - x, max: (track.current?.clientWidth ?? 300) - 60 }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (st.current) setX(Math.max(0, Math.min(st.current.max, e.clientX - st.current.x0))); }}
        onPointerUp={() => { const s = st.current; st.current = null; if (s && x > s.max * 0.75) { setX(s.max); onDone(); setTimeout(() => setX(0), 900); } else setX(0); }}><E3 name="tram" size={38} /></span>
    </div>
  );
}
/** SOS se pošle až po podržení 1,5 s – kroužek ukazuje průběh. */
function HoldSos({ onFire, label }: { onFire: () => void; label: string }) {
  const [p, setP] = useState(0);
  const tm = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (tm.current) clearInterval(tm.current); tm.current = null; setP(0); };
  return (
    <button type="button" className="fam-sos-btn" aria-label={label}
      onPointerDown={() => { let v = 0; tm.current = setInterval(() => { v += 5; setP(v); if (v >= 100) { stop(); if (navigator.vibrate) navigator.vibrate([80, 60, 80]); onFire(); } }, 75); }}
      onPointerUp={stop} onPointerLeave={stop} onKeyDown={(e) => { if (e.key === 'Enter') onFire(); }}>
      <svg viewBox="0 0 60 60" aria-hidden><circle cx="30" cy="30" r="26" style={{ strokeDashoffset: 163 - 163 * p / 100 }} /></svg>SOS
    </button>
  );
}
