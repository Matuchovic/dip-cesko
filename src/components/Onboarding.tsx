'use client';
/* eslint-disable @next/next/no-img-element -- malé dekorativní ikony aplikace (WebP), optimalizace obrázků zde nepřináší nic */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useStore } from '@/lib/store';
import { closeOnboarding, onboardingStore } from '@/lib/onboarding';
import { installNow, installStore } from '@/lib/install';
import { setPlace } from '@/lib/places';
import { playTramBell, unlockAudio } from '@/lib/sound';
import { setLanguagePreference, useI18n, useT } from '@/i18n';
import StopSearch from './StopSearch';
import E3, { type E3Name } from './icons/E3';

type Perm = 'idle' | 'done' | 'denied' | 'unsupported';
const STEPS = ['welcome', 'map', 'deps', 'bell', 'plan', 'sights', 'news', 'controls', 'setup', 'places'] as const;
type Step = (typeof STEPS)[number];
const ICON = '/icons/icon-256.webp';

/**
 * Úvodní průvodce: deset krátkých kroků, každý jedna funkce, animace ukazuje přesně, kam klepnout.
 * Ovládání: tlačítka, přejetí prstem (mobil), šipky a Esc (počítač). Zobrazuje se při každém spuštění,
 * dokud uživatel nezvolí „Již nezobrazovat“; „Přeskočit“ ho zavře do příštího spuštění.
 */
export default function Onboarding() {
  const open = useStore(onboardingStore, (s) => s.open);
  return open ? <Flow /> : null;
}

function Flow() {
  const t = useT();
  const { locale } = useI18n();
  const inst = useStore(installStore, (s) => s);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [install, setInstall] = useState<Perm>('idle');
  const [notif, setNotif] = useState<Perm>(() => (typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'done' : 'idle'));
  const [geo, setGeo] = useState<Perm>('idle');
  const [picking, setPicking] = useState<'home' | 'work' | null>(null);
  const [saved, setSaved] = useState<{ home?: string; work?: string }>({});
  const [finishing, setFinishing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const step: Step = STEPS[i]!;
  const last = i === STEPS.length - 1;
  const lang = locale === 'en' ? 'en' : 'cs';
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  const go = (n: number) => { if (n < 0 || n >= STEPS.length || n === i) return; setDir(n > i ? 1 : -1); setI(n); };
  const next = () => {
    if (!last) { go(i + 1); return; }
    setFinishing(true);
    setTimeout(() => closeOnboarding('done'), 1500);
  };

  useEffect(() => { root.current?.focus(); }, []);
  // průvodce je vykreslený → kryt z prvního vykreslení plynule zmizí (pod ním je už průvodce, ne aplikace)
  useEffect(() => {
    const html = document.documentElement;
    if (!html.dataset.onb) return;
    const a = setTimeout(() => { html.dataset.onb = 'out'; }, 380);
    const b = setTimeout(() => { if (html.dataset.onb === 'out') delete html.dataset.onb; }, 720);
    return () => { clearTimeout(a); clearTimeout(b); }; // při znovupřipojení se časovače nastaví znovu
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
      else if (e.key === 'Escape') { e.preventDefault(); closeOnboarding('skip'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const doInstall = async () => {
    if (inst.installed) { setInstall('done'); return; }
    if (inst.prompt) { await installNow(); setInstall('done'); return; }
    setInstall('done'); // iPhone: návod Sdílet → Přidat na plochu je přímo v řádku
  };
  const doNotify = async () => {
    unlockAudio();
    if (typeof Notification === 'undefined') { setNotif('unsupported'); return; }
    const r = await Notification.requestPermission();
    if (r !== 'granted') { setNotif('denied'); return; }
    setNotif('done');
    try { const reg = await navigator.serviceWorker?.ready; await reg?.showNotification('DopravaČR', { body: t('ob_notifTest'), icon: '/icons/icon-192.png', badge: '/icons/favicon-32.png' }); } catch { /* bez service workeru */ }
  };
  const doGeo = () => {
    if (!navigator.geolocation) { setGeo('unsupported'); return; }
    navigator.geolocation.getCurrentPosition(() => setGeo('done'), () => setGeo('denied'), { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 });
  };

  const k = (s: string) => t(`onb_${step}_${s}` as never);

  return (
    <div className={`onb${finishing ? ' finishing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="onb-h" ref={root} tabIndex={-1}
      onPointerDown={(e) => { if (!(e.target as HTMLElement).closest('input, button, a, .onb-noswipe')) swipe.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        const s = swipe.current; swipe.current = null;
        if (!s) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) { if (dx < 0) next(); else go(i - 1); }
      }}>
      <div className="onb-aurora" aria-hidden><i /><i /><i /><i /></div>
      <div className="onb-card">
        <header className="onb-top">
          <button type="button" className="onb-back" onClick={() => go(i - 1)} disabled={i === 0} aria-label={t('onb_back')}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="onb-prog" role="tablist" aria-label={t('onb_progress')}>
            {STEPS.map((s, n) => (
              <button key={s} type="button" role="tab" aria-selected={n === i} aria-label={t('onb_stepN', { n: n + 1 })} className={n < i ? 'done' : n === i ? 'on' : ''} onClick={() => go(n)}><i /></button>
            ))}
          </div>
          <button type="button" className="onb-skip" onClick={() => closeOnboarding('skip')}>{t('ob_skip')}<span aria-hidden>×</span></button>
        </header>

        <div className={`onb-body ${dir > 0 ? 'fwd' : 'bwd'}`} key={step} aria-live="polite">
          <div className="onb-art" aria-hidden>{art(step, t, lang)}</div>
          <div className="onb-copy">
            <p className="onb-eyebrow"><span className="onb-num">{i + 1}/{STEPS.length}</span>{k('e')}</p>
            <h2 id="onb-h" className="onb-h">{k('h')}</h2>
            <p className="onb-p">{k('p')}</p>
            {step === 'welcome' && (
              <div className="onb-lang" role="radiogroup" aria-label={t('set_language')}>
                {(['cs', 'en'] as const).map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={lang === l} className={`onb-lc${lang === l ? ' on' : ''}`} onClick={() => setLanguagePreference(l)}>
                    <Flag l={l} />{l === 'cs' ? 'Čeština' : 'English'}<span className="onb-rad" />
                  </button>
                ))}
              </div>
            )}
            {step === 'map' && (
              <ul className="onb-legend">
                <li><i style={{ background: '#16A34A' }} />{t('onb_map_l1')}</li>
                <li><i style={{ background: '#E8A317' }} />{t('onb_map_l2')}</li>
                <li><i style={{ background: '#DC2626' }} />{t('onb_map_l3')}</li>
              </ul>
            )}
            {step === 'bell' && (
              <button type="button" className="onb-act" onClick={() => { unlockAudio(); playTramBell(); }}><E3 name="bell" size={22} /> {t('onb_bell_play')}</button>
            )}
            {step === 'setup' && (
              <ul className="onb-setup">
                <SetupRow icon="install" title={t('onb_setup_install')} sub={ios ? t('onb_setup_installIos') : t('onb_setup_installSub')} state={inst.installed ? 'done' : install} onClick={() => void doInstall()} t={t} />
                <SetupRow icon="bell" title={t('onb_setup_notif')} sub={t('onb_setup_notifSub')} state={notif} onClick={() => void doNotify()} t={t} />
                <SetupRow icon="pin" title={t('onb_setup_geo')} sub={t('onb_setup_geoSub')} state={geo} onClick={doGeo} t={t} />
              </ul>
            )}
            {step === 'places' && (picking ? (
              <div className="onb-pick onb-noswipe"><StopSearch label={t(picking === 'home' ? 'place_home' : 'place_work')} placeholder={t('place_pick')} autoFocus
                onSelect={(g) => { if (g) { setPlace(picking, { name: g.name, key: g.key, lat: g.lat, lon: g.lon }); setSaved((s) => ({ ...s, [picking]: g.name })); setPicking(null); } }} /></div>
            ) : (
              <div className="onb-two">
                <button type="button" className={`onb-act${saved.home ? ' done' : ''}`} onClick={() => setPicking('home')}><E3 name="home" size={22} /> {saved.home ? `${t('place_home')} · ${saved.home}` : t('place_home')}</button>
                <button type="button" className={`onb-act${saved.work ? ' done' : ''}`} onClick={() => setPicking('work')}><E3 name="work" size={22} /> {saved.work ? `${t('place_work')} · ${saved.work}` : t('place_work')}</button>
              </div>
            ))}
          </div>
        </div>

        <footer className="onb-foot">
          <button type="button" className="onb-never" onClick={() => closeOnboarding('never')}>{t('ob_never')}</button>
          <button type="button" className="onb-cta" onClick={next}>
            <span>{last ? t('ob_start') : t('ob_next')}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </footer>
        <p className="onb-hint" aria-hidden>{t('onb_hint')}</p>
      </div>
      {finishing && <Finish text={t('onb_done')} />}
    </div>
  );
}

function SetupRow({ icon, title, sub, state, onClick, t }: { icon: E3Name; title: string; sub: string; state: Perm; onClick: () => void; t: ReturnType<typeof useT> }) {
  const label = state === 'done' ? t('onb_setup_done') : state === 'denied' ? t('ob_denied') : state === 'unsupported' ? t('ob_unsupported') : t('onb_setup_on');
  return (
    <li className={`onb-row ${state}`}>
      <span className="onb-row-ico" aria-hidden><E3 name={icon} size={38} /></span>
      <span className="onb-row-text"><strong>{title}</strong><small>{sub}</small></span>
      <button type="button" className="onb-row-btn" onClick={onClick} disabled={state === 'done'}>{state === 'done' ? <><E3 name="check" size={16} /> </> : ''}{label}</button>
    </li>
  );
}

function Flag({ l }: { l: 'cs' | 'en' }) {
  return l === 'cs'
    ? <svg width="34" height="24" viewBox="0 0 34 24" aria-hidden><rect width="34" height="12" fill="#fff" /><rect y="12" width="34" height="12" fill="#D7141A" /><path d="M0 0 L17 12 L0 24 Z" fill="#11457E" /><rect width="34" height="24" fill="none" stroke="#E3E8EF" /></svg>
    : <svg width="34" height="24" viewBox="0 0 34 24" aria-hidden><rect width="34" height="24" fill="#012169" /><path d="M0 0 L34 24 M34 0 L0 24" stroke="#fff" strokeWidth="5" /><path d="M0 0 L34 24 M34 0 L0 24" stroke="#C8102E" strokeWidth="2" /><path d="M17 0 V24 M0 12 H34" stroke="#fff" strokeWidth="7" /><path d="M17 0 V24 M0 12 H34" stroke="#C8102E" strokeWidth="4" /></svg>;
}

/** Pulzující kroužek „sem klepni“ – přesně ukazuje, kde se v aplikaci klepe. */
function Tap({ x, y, delay = 0, label, drag }: { x: string; y: string; delay?: number; label?: string; drag?: boolean }) {
  return (
    <span className={`onb-tap${drag ? ' drag' : ''}`} style={{ left: x, top: y, '--d': `${delay}s` } as CSSProperties}>
      <i /><b />{label && <em>{label}</em>}
    </span>
  );
}

const Pill = ({ l, c, ring, dark }: { l: string; c: string; ring: string; dark?: boolean }) => (
  <span className="onb-pill" style={{ background: c, boxShadow: `0 0 0 3px ${ring}, 0 6px 14px rgba(15,35,65,.25)`, color: dark ? '#2B2100' : '#fff' }}>{l}</span>
);

function art(step: Step, t: ReturnType<typeof useT>, lang: 'cs' | 'en'): ReactNode {
  switch (step) {
    case 'welcome': return (
      <div className="a-welcome">
        <span className="a-ring r1" /><span className="a-ring r2" /><span className="a-ring r3" />
        <div className="a-orbit">{[['22', '#C8102E'], ['A', '#00A562'], ['B', '#F8B322'], ['C', '#E2001A'], ['135', '#0B7AB8'], ['S9', '#1F4FB5']].map(([l, c], n) => (
          <span key={l} style={{ '--n': n } as CSSProperties}><Pill l={l!} c={c!} ring="#fff" dark={l === 'B'} /></span>))}</div>
        <div className="a-logo"><img src={ICON} alt="" width={168} height={168} /><span className="a-shine" /></div>
      </div>
    );
    case 'map': return (
      <div className="a-frame a-map">
        <svg viewBox="0 0 320 300" className="a-map-svg">
          <rect width="320" height="300" fill="#F2EFE8" />
          <path d="M-10 230 C60 200 120 250 180 220 S290 190 330 210 L330 300 L-10 300Z" fill="#BCD9F2" />
          <rect x="196" y="24" width="90" height="62" rx="14" fill="#D9ECD2" />
          <g stroke="#fff" strokeWidth="13" fill="none" strokeLinecap="round"><path d="M0 70 L320 96" /><path id="am-a" d="M-10 150 C80 130 200 170 330 140" /><path d="M96 0 L120 300" /><path id="am-b" d="M228 -10 C206 120 246 200 214 310" /></g>
          <path className="a-route" d="M-10 150 C80 130 200 170 330 140" fill="none" stroke="#1F6FEB" strokeWidth="5" strokeLinecap="round" />
          {[['22', '#C8102E', '#16A34A', 0, 'a'], ['9', '#C8102E', '#E8A317', 0.45, 'a'], ['135', '#0B7AB8', '#16A34A', 0.15, 'b'], ['B', '#F8B322', '#DC2626', 0.65, 'b']].map(([l, c, ring, o, r]) => {
            const w = String(l).length * 8 + 20;
            return (
              <g key={String(l)}>
                <animateMotion dur="16s" repeatCount="indefinite" begin={`${-Number(o) * 16}s`}><mpath href={`#am-${r}`} /></animateMotion>
                <circle r="12" fill="none" stroke={String(ring)} strokeWidth="2" className="a-pulse" />
                <rect x={-w / 2 - 3} y="-15" width={w + 6} height="30" rx="15" fill={String(ring)} /><rect x={-w / 2} y="-12" width={w} height="24" rx="12" fill={String(c)} />
                <text y="5" textAnchor="middle" fontSize="13" fontWeight="800" fill={l === 'B' ? '#2B2100' : '#fff'}>{String(l)}</text>
              </g>
            );
          })}
        </svg>
        <span className="a-chip c1"><E3 name="clock" size={15} /> 2 min</span><span className="a-chip c2"><E3 name="clock" size={15} /> 6 min</span>
        <Tap x="42%" y="47%" delay={0.6} label={t('onb_tap')} />
      </div>
    );
    case 'deps': return (
      <div className="a-frame a-deps">
        <p className="a-eb"><E3 name="walk" size={16} /> {t('onb_deps_near')}</p><p className="a-stop">Národní třída</p>
        {([['22', '#C8102E', 'Bílá Hora', 'ok', 'check', t('onb_deps_t1'), 4], ['9', '#C8102E', 'Spojovací', 'go', 'run', t('onb_deps_t2'), 2], ['B', '#F8B322', 'Zličín', 'no', 'noentry', t('onb_deps_t3'), 1]] as const).map(([l, c, d, cls, tic, tag, m], n) => (
          <div key={String(l) + n} className="a-row" style={{ '--n': n } as CSSProperties}>
            <span className="a-bd" style={{ background: String(c), color: l === 'B' ? '#2B2100' : '#fff' }}>{String(l)}</span>
            <span className="a-mid"><b>{String(d)}</b><span className={`a-tag ${cls}`}><E3 name={tic} size={14} /> {String(tag)}</span></span>
            <span className="a-cd">{String(m)}<small>min</small></span>
          </div>
        ))}
      </div>
    );
    case 'bell': return (
      <div className="a-frame a-bell">
        <div className="a-notif"><img src={ICON} alt="" width={36} height={36} /><span><b><E3 name="tram" size={15} /> 22 · {t('onb_bell_n1')}</b><br /><E3 name="pin" size={14} /> Národní třída, {t('onb_bell_n2')}<br /><E3 name="check" size={14} /> {t('onb_bell_n3')}</span></div>
        <div className="a-row a-bellrow"><span className="a-bd" style={{ background: '#C8102E' }}>22</span><span className="a-mid"><b>Vypich</b><span className="a-tag ok"><E3 name="check" size={14} /> {t('onb_deps_t1')}</span></span>
          <span className="a-bellbtn"><E3 name="bell" size={26} /></span><span className="a-cd">8<small>min</small></span></div>
        <div className="a-menu"><small>{t('watch_pick')}</small><span>2 min</span><span className="hi">5 min</span><span>10 min</span></div>
        <Tap x="70%" y="62%" delay={0.5} />
      </div>
    );
    case 'plan': return (
      <div className="a-frame a-plan">
        <div className="a-field"><small>{t('onb_plan_from')}</small><span className="a-type t1"><E3 name="pin" size={16} /> {t('onb_plan_here')}</span></div>
        <div className="a-field"><small>{t('onb_plan_to')}</small><span className="a-type t2"><E3 name="finish" size={16} /> {lang === 'en' ? 'Prague Castle' : 'Pražský hrad'}</span></div>
        <div className="a-trip">
          <div className="a-leg"><i className="walk" /><E3 name="walk" size={15} /> 3 min</div>
          <div className="a-leg"><i style={{ background: '#00A562' }} /><span className="a-bd sm" style={{ background: '#00A562' }}>A</span> Můstek → Malostranská · 3 {t('onb_plan_stops')}</div>
          <div className="a-leg"><i style={{ background: '#C8102E' }} /><span className="a-bd sm" style={{ background: '#C8102E' }}>22</span> → Pražský hrad · 2 {t('onb_plan_stops')}</div>
          <div className="a-leg"><i className="walk" /><E3 name="walk" size={15} /> 2 min</div>
          <p className="a-total">{t('onb_plan_total')} <b>19 min</b></p>
        </div>
      </div>
    );
    case 'sights': return (
      <div className="a-sights">
        {([['castle', lang === 'en' ? 'Prague Castle' : 'Pražský hrad', 'tram', '22', '#C8102E', 2], ['bridge', lang === 'en' ? 'Charles Bridge' : 'Karlův most', 'metro', 'A', '#00A562', 6], ['church', 'Vyšehrad', 'metro', 'C', '#E2001A', 7]] as const).map(([ic, n, mi, l, c, w], k) => (
          <div key={String(n)} className={`a-scard s${k}`}>
            <span className="a-sico"><E3 name={ic} size={44} /></span><b>{String(n)}</b>
            <span className="a-sstop"><E3 name={mi} size={16} /> <span className="a-bd sm" style={{ background: String(c) }}>{String(l)}</span> · {String(w)} min {t('onb_sights_walk')}</span>
            <span className="a-sbtn">{t('lm_route')}</span>
          </div>
        ))}
        <Tap x="68%" y="80%" delay={0.9} />
      </div>
    );
    case 'news': return (
      <div className="a-frame a-news">
        <div className="a-sheet"><b>Národní třída</b><span /><span /></div>
        <div className="a-detail"><E3 name="works" size={22} /> <b>Vinohradská</b><br />{t('onb_news_d')}<i>×</i></div>
        <div className="a-tabs">{(['map', 'route', 'clock', 'star', 'landmark'] as const).map((x) => <span key={x}><E3 name={x} size={22} /></span>)}</div>
        <div className="a-ticker"><b>● {t('tick_live')}</b><span className="a-track"><E3 name="works" size={15} /> Vinohradská: {t('onb_news_t1')} &nbsp;•&nbsp; <E3 name="metro" size={15} /> Metro C: {t('onb_news_t2')} &nbsp;•&nbsp; <E3 name="works" size={15} /> Vinohradská: {t('onb_news_t1')}</span></div>
        <Tap x="50%" y="86%" delay={1} />
      </div>
    );
    case 'controls': return (
      <div className="a-frame a-ctrl">
        <div className="a-mapbg" />
        <div className="a-csheet"><span className="a-grip" /><span className="a-chev"><svg width="16" height="10" viewBox="0 0 16 10" aria-hidden><path d="M2 2l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span><b>Národní třída</b><span className="a-x">×</span><i /><i /></div>
        <Tap x="50%" y="33%" delay={0.4} drag label={t('onb_controls_drag')} />
        <div className="a-upd"><img src={ICON} alt="" width={28} height={28} /><span><b>{t('upd_title')}</b><small>0.14.0 → 0.15.0</small></span><em>{t('upd_btn')}</em></div>
      </div>
    );
    case 'setup': return (
      <div className="a-setup">
        {(['install', 'bell', 'pin'] as const).map((x, n) => <span key={x} className="a-bubble" style={{ '--n': n } as CSSProperties}><E3 name={x} size={58} /><i><E3 name="check" size={22} /></i></span>)}
      </div>
    );
    case 'places': return (
      <div className="a-frame a-places">
        <svg viewBox="0 0 320 260" className="a-map-svg"><rect width="320" height="260" fill="#F2EFE8" /><g stroke="#fff" strokeWidth="12" fill="none"><path d="M0 70 L320 100" /><path d="M-10 180 C90 160 210 200 330 170" /><path d="M110 0 L140 260" /></g>
          <path className="a-route dash" d="M70 200 C130 110 180 140 245 70" fill="none" stroke="#1F6FEB" strokeWidth="5" strokeLinecap="round" strokeDasharray="10 9" /></svg>
        <span className="a-pin p1"><E3 name="home" size={18} /> {t('place_home')}</span><span className="a-pin p2"><E3 name="work" size={18} /> {t('place_work')}</span>
        <span className="a-leave"><E3 name="run" size={18} /> {t('onb_places_leave')}</span>
      </div>
    );
  }
}

function Finish({ text }: { text: string }) {
  const C: [string, string][] = [['22', '#C8102E'], ['A', '#00A562'], ['B', '#F8B322'], ['C', '#E2001A'], ['135', '#0B7AB8'], ['9', '#C8102E'], ['S9', '#1F4FB5']];
  return (
    <div className="onb-finish" aria-live="assertive">
      <div className="onb-check"><svg viewBox="0 0 52 52" width="104" height="104" aria-hidden><circle cx="26" cy="26" r="24" /><path d="M14 27l8 8 16-17" /></svg><b>{text}</b></div>
      {Array.from({ length: 36 }, (_, n) => {
        const a = (n / 36) * Math.PI * 2, v = 160 + ((n * 67) % 240);
        const [l, c] = C[n % C.length]!;
        return <span key={n} className="onb-conf" style={{ background: c, color: l === 'B' ? '#2B2100' : '#fff', '--dx': `${Math.cos(a) * v}px`, '--dy': `${Math.sin(a) * v}px`, '--r': `${((n * 97) % 720) - 360}deg` } as CSSProperties}>{l}</span>;
      })}
    </div>
  );
}
