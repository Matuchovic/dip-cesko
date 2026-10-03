'use client';
/* eslint-disable @next/next/no-img-element -- malé dekorativní ikony aplikace, optimalizace obrázků zde nepřináší nic */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { closeOnboarding, onboardingStore } from '@/lib/onboarding';
import { installNow, installStore } from '@/lib/install';
import { setPlace } from '@/lib/places';
import { setLanguagePreference, useI18n, useT } from '@/i18n';
import StopSearch from './StopSearch';

const STEPS = 7;
type Perm = 'idle' | 'done' | 'denied' | 'unsupported';

/** Animovaný úvodní průvodce (čeština a angličtina): jazyk, mapa, odjezdy, plocha, upozornění, poloha, místa. */
export default function Onboarding() {
  const open = useStore(onboardingStore, (s) => s.open);
  return open ? <OnboardingFlow /> : null;
}

/** Vnitřek se při každém otevření připojí znovu, takže začíná od prvního kroku. */
function OnboardingFlow() {
  const inst = useStore(installStore, (s) => s);
  const t = useT();
  const { locale } = useI18n();
  const [step, setStep] = useState(0);
  const [installState, setInstallState] = useState<Perm>('idle');
  const [notif, setNotif] = useState<Perm>('idle');
  const [geo, setGeo] = useState<Perm>('idle');
  const [picking, setPicking] = useState<'home' | 'work' | null>(null);
  const [saved, setSaved] = useState<{ home?: string; work?: string }>({});
  const [burst, setBurst] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => { dialog.current?.focus(); }, []);
  const installDone = installState === 'done' || inst.installed;

  const lang = locale === 'en' ? 'en' : 'cs';
  const next = () => {
    if (step < STEPS - 1) { setStep(step + 1); return; }
    setBurst(true);
    setTimeout(() => { setBurst(false); closeOnboarding('done'); }, 1100);
  };
  const doInstall = async () => {
    if (inst.installed) { setInstallState('done'); return; }
    if (inst.prompt) { await installNow(); setInstallState('done'); return; }
    setInstallState('done'); // iPhone: ukázka postupu Sdílet → Přidat na plochu
  };
  const doNotify = async () => {
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

  const actionLabel = (state: Perm, idle: string, done: string) => state === 'done' ? done : state === 'denied' ? t('ob_denied') : state === 'unsupported' ? t('ob_unsupported') : idle;

  return (
    <div className="ob-backdrop" role="dialog" aria-modal="true" aria-labelledby="ob-title" ref={dialog} tabIndex={-1}>
      <div className="ob-blob a" /><div className="ob-blob b" /><div className="ob-blob c" />
      <div className="ob-top">
        <div className="ob-prog" aria-hidden>{Array.from({ length: STEPS }, (_, i) => <i key={i}><b style={{ width: i <= step ? '100%' : '0%' }} /></i>)}</div>
        <button type="button" className="ob-skip" onClick={() => closeOnboarding('skip')}>{t('ob_skip')}</button>
      </div>
      <div className="ob-screen" key={step}>
        <div className={`ob-ill${[0, 3, 4, 5].includes(step) ? ' compact' : ''}`} aria-hidden>
          {step === 0 && <div className="ob-logo"><img src="/icons/icon-192.png" srcSet="/icons/icon-512.png 2x" alt="" width={150} height={150} /><span className="ob-shine" /></div>}
          {step === 1 && <MiniMap />}
          {step === 2 && <MiniDepartures t={t} />}
          {step === 3 && <div className={`ob-home${installDone ? ' done' : ''}`}><div className="grid">{['#FFB4A2', '#A2D2FF', '#CDB4DB', '#BDE0FE', '#FFC8DD', '#CAFFBF'].map((c) => <span key={c} style={{ background: c }} />)}<img src="/icons/icon-192.png" alt="" className="app" /></div><div className="share">＋ {t('ob_addHome')}</div></div>}
          {step === 4 && <div className={`ob-notif${notif === 'done' ? ' show' : ''}`}><div className="phone" /><div className="banner"><img src="/icons/icon-192.png" alt="" /><span><b>{t('ob_notifTitle')}</b><br />{t('ob_notifSub')}</span></div></div>}
          {step === 5 && <div className="ob-geo"><i /><i /><i /><b /></div>}
          {step === 6 && <div className="ob-places"><span className={`pin home${saved.home ? ' on' : ''}`}>{t('place_home')}</span><span className={`pin work${saved.work ? ' on' : ''}`}>{t('place_work')}</span></div>}
        </div>
        <p className="ob-eyebrow st" style={{ animationDelay: '.1s' }}>{t(`ob_e${step}` as never)}</p>
        <h2 id="ob-title" className="ob-h st" style={{ animationDelay: '.18s' }}>{t(`ob_h${step}` as never)}</h2>
        <p className="ob-p st" style={{ animationDelay: '.26s' }}>{t(`ob_p${step}` as never)}</p>
        {step === 0 && (
          <div className="ob-lang st" style={{ animationDelay: '.45s' }} role="radiogroup" aria-label={t('set_language')}>
            {(['cs', 'en'] as const).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={lang === l} className={`ob-lc${lang === l ? ' on' : ''}`} onClick={() => setLanguagePreference(l)}>
                <Flag l={l} />{l === 'cs' ? 'Čeština' : 'English'}<span className="rad" />
              </button>
            ))}
          </div>
        )}
        {step === 3 && <button type="button" className={`ob-act st${installDone ? ' done' : ''}`} style={{ animationDelay: '.4s' }} onClick={() => void doInstall()}>{actionLabel(installDone ? 'done' : installState, inst.prompt ? t('set_install') : t('ob_showHow'), inst.installed ? t('set_installed') : t('ob_installDone'))}</button>}
        {step === 4 && <button type="button" className={`ob-act st${notif === 'done' ? ' done' : notif !== 'idle' ? ' warn' : ''}`} style={{ animationDelay: '.4s' }} onClick={() => void doNotify()}>{actionLabel(notif, t('ob_notifBtn'), t('ob_notifDone'))}</button>}
        {step === 5 && <button type="button" className={`ob-act st${geo === 'done' ? ' done' : geo !== 'idle' ? ' warn' : ''}`} style={{ animationDelay: '.4s' }} onClick={doGeo}>{actionLabel(geo, t('ob_geoBtn'), t('ob_geoDone'))}</button>}
        {step === 6 && (picking ? (
          <div className="ob-pick st"><StopSearch label={t(picking === 'home' ? 'place_home' : 'place_work')} placeholder={t('place_pick')} autoFocus
            onSelect={(g) => { if (g) { setPlace(picking, { name: g.name, key: g.key, lat: g.lat, lon: g.lon }); setSaved((s) => ({ ...s, [picking]: g.name })); setPicking(null); } }} /></div>
        ) : (
          <div className="ob-two st" style={{ animationDelay: '.4s' }}>
            <button type="button" className={`ob-act${saved.home ? ' done' : ''}`} onClick={() => setPicking('home')}>{saved.home ? `${t('place_home')} · ${saved.home}` : t('place_home')}</button>
            <button type="button" className={`ob-act${saved.work ? ' done' : ''}`} onClick={() => setPicking('work')}>{saved.work ? `${t('place_work')} · ${saved.work}` : t('place_work')}</button>
          </div>
        ))}
      </div>
      <div className="ob-bottom">
        <button type="button" className="ob-cta" onClick={next}>{step === STEPS - 1 ? t('ob_start') : t('ob_next')}</button>
        <button type="button" className="ob-never" onClick={() => closeOnboarding('never')}>{t('ob_never')}</button>
      </div>
      {burst && <Confetti />}
    </div>
  );
}

function Flag({ l }: { l: 'cs' | 'en' }) {
  return l === 'cs'
    ? <svg width="34" height="24" viewBox="0 0 34 24" aria-hidden><rect width="34" height="12" fill="#fff" /><rect y="12" width="34" height="12" fill="#D7141A" /><path d="M0 0 L17 12 L0 24 Z" fill="#11457E" /><rect width="34" height="24" fill="none" stroke="#E3E8EF" /></svg>
    : <svg width="34" height="24" viewBox="0 0 34 24" aria-hidden><rect width="34" height="24" fill="#012169" /><path d="M0 0 L34 24 M34 0 L0 24" stroke="#fff" strokeWidth="5" /><path d="M0 0 L34 24 M34 0 L0 24" stroke="#C8102E" strokeWidth="2" /><path d="M17 0 V24 M0 12 H34" stroke="#fff" strokeWidth="7" /><path d="M17 0 V24 M0 12 H34" stroke="#C8102E" strokeWidth="4" /></svg>;
}

function MiniMap() {
  const pills: [string, string, string, number, string][] = [['22', '#E1251B', '#0E9F5A', 0, 'a'], ['9', '#E1251B', '#E8A317', 0.5, 'a'], ['B', '#F8B322', '#0E9F5A', 0.25, 'b'], ['135', '#0B7AB8', '#0E9F5A', 0.7, 'b']];
  return (
    <div className="ob-map">
      <svg viewBox="0 0 300 290" width="300" height="290">
        <path d="M0 60 L300 90" stroke="#fff" strokeWidth="16" /><path id="ob-ra" d="M-10 150 C80 130 200 170 310 140" stroke="#fff" strokeWidth="18" fill="none" />
        <path d="M90 0 L120 290" stroke="#fff" strokeWidth="12" /><path id="ob-rb" d="M220 -10 C200 120 240 200 210 300" stroke="#fff" strokeWidth="14" fill="none" />
        {pills.map(([l, c, ring, o, r], k) => {
          const w = l.length * 8 + 18;
          return (
            <g key={k}>
              <animateMotion dur="18s" repeatCount="indefinite" begin={`${-o * 18}s`}><mpath href={`#ob-r${r}`} /></animateMotion>
              <circle r="10" fill="none" stroke={c} strokeWidth="2" className="ob-pulse" style={{ animationDelay: `${k * 0.6}s` }} />
              <rect x={-w / 2 - 3} y="-14" width={w + 6} height="28" rx="14" fill={ring} /><rect x={-w / 2} y="-11" width={w} height="22" rx="11" fill={c} />
              <text y="4.5" textAnchor="middle" fontSize="12.5" fontWeight="800" fill={l === 'B' ? '#2B2100' : '#fff'}>{l}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MiniDepartures({ t }: { t: ReturnType<typeof useT> }) {
  const [s, setS] = useState(250);
  useEffect(() => { const id = setInterval(() => setS((v) => (v <= 1 ? 600 : v - 1)), 120); return () => clearInterval(id); }, []);
  return (
    <div className="ob-deps">
      <div className="stop">Vodičkova</div>
      <div className="r"><span className="bd">22</span><span><b>Bílá Hora</b><br /><em>{t('adv_ok', { n: 2 })}</em></span><span className="cd">{Math.ceil(s / 60)}<small>min</small></span></div>
      <div className="r"><span className="bd">9</span><span><b>Spojovací</b><br /><small>{t('platformShort', { p: 'A' })} · {t('delayShort_onTime')}</small></span><span className="cd">{Math.ceil((s + 180) / 60)}<small>min</small></span></div>
    </div>
  );
}

function Confetti() {
  const C: [string, string][] = [['22', '#E1251B'], ['A', '#00A562'], ['B', '#F8B322'], ['C', '#E2001A'], ['135', '#0B7AB8'], ['9', '#E1251B']];
  return <div className="ob-confetti" aria-hidden>{Array.from({ length: 24 }, (_, k) => {
    const a = (k / 24) * Math.PI - Math.PI, v = 180 + ((k * 53) % 220);
    return <span key={k} style={{ background: C[k % 6]![1], color: C[k % 6]![0] === 'B' ? '#2B2100' : '#fff', ['--dx' as string]: `${Math.cos(a) * v}px`, ['--dy' as string]: `${Math.sin(a) * v}px`, ['--r' as string]: `${((k * 97) % 540) - 270}deg` }}>{C[k % 6]![0]}</span>;
  })}</div>;
}
