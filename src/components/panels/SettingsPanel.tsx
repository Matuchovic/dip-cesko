'use client';
import { useReducer, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { DEFAULT_SETTINGS, settingsStore, type Settings } from '@/lib/settings';
import { favoritesStore } from '@/lib/favorites';
import { installNow, installStore } from '@/lib/install';
import { onboardingDisabled, reopenOnboarding } from '@/lib/onboarding';
import { setLanguagePreference, useT } from '@/i18n';
import { isLocale, LOCALE_NAMES, LOCALES } from '@/i18n/locales';

function Seg<K extends keyof Settings>({ k, label, options }: { k: K; label: string; options: [Settings[K], string][] }) {
  const v = useStore(settingsStore, (s) => s[k]);
  return (
    <div className="field">
      <span className="label" id={`seg-${String(k)}`}>{label}</span>
      <div className="seg" role="group" aria-labelledby={`seg-${String(k)}`}>
        {options.map(([val, text]) => <button key={String(val)} type="button" aria-pressed={v === val} onClick={() => settingsStore.set({ [k]: val } as Partial<Settings>)}>{text}</button>)}
      </div>
    </div>
  );
}
function Toggle({ k, label, hint }: { k: 'buildings3d' | 'showStops'; label: string; hint?: string }) {
  const v = useStore(settingsStore, (s) => s[k]);
  return (
    <div className="switch-row">
      <span>{label}{hint && <><br /><span className="hint">{hint}</span></>}</span>
      <label className="switch"><input type="checkbox" checked={v} onChange={(e) => settingsStore.set({ [k]: e.target.checked })} aria-label={label} /><span /></label>
    </div>
  );
}

export default function SettingsPanel() {
  const t = useT();
  const language = useStore(settingsStore, (s) => s.language);
  const inst = useStore(installStore, (s) => s);
  // stav přímo z úložiště (na serveru „zapnuto“), bez nastavování stavu v efektu
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const onboardingOff = useSyncExternalStore(() => () => {}, onboardingDisabled, () => false);
  const refreshOnboarding = () => rerender();
  return (
    <>
      <h1>{t('set_title')}</h1>
      <div className="field">
        <label className="label" htmlFor="set-lang">{t('set_language')}</label>
        <select id="set-lang" className="input" value={language} onChange={(e) => setLanguagePreference(isLocale(e.target.value) ? e.target.value : 'auto')}>
          <option value="auto">{t('set_auto')}</option>
          {LOCALES.map((l) => <option key={l} value={l} lang={l}>{LOCALE_NAMES[l]}</option>)}
        </select>
      </div>
      <Seg k="theme" label={t('set_theme')} options={[['light', t('set_light')], ['dark', t('set_dark')], ['system', t('set_system')]]} />
      <Seg k="motion" label={t('set_motion')} options={[['system', t('set_system')], ['full', t('set_full')], ['reduce', t('set_reduced')]]} />
      <Seg k="vehicleStyle" label={t('set_vehicles')} options={[['models', t('set_models')], ['sprites', t('set_sprites')], ['markers', t('set_markers')]]} />
      <Toggle k="buildings3d" label={t('set_buildings')} hint={t('set_buildingsHint')} />
      <Toggle k="showStops" label={t('set_stops')} hint={t('set_stopsHint')} />
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={() => { settingsStore.set({ ...DEFAULT_SETTINGS, language }); }}>{t('set_reset')}</button>
        <button type="button" className="btn btn-ghost" onClick={() => { if (confirm(t('set_clearConfirm'))) favoritesStore.set({ items: [] }); }}>{t('set_clearFav')}</button>
      </div>
      {(inst.installed || inst.prompt || inst.ios) && (<>
        <h2>{t('set_app')}</h2>
        {inst.installed ? <p className="hint">{t('set_installed')}</p>
          : inst.prompt ? <div className="actions"><button type="button" className="btn btn-primary" onClick={() => void installNow()}>{t('set_install')}</button></div>
          : <p className="hint">{t('set_installIos')}</p>}
      </>)}
      <h2>{t('set_onboarding')}</h2>
      <p className="hint">{onboardingOff ? t('set_onboardingOff') : t('set_onboardingOn')}</p>
      <div className="actions"><button type="button" className="btn btn-secondary" onClick={() => { reopenOnboarding(); refreshOnboarding(); }}>{t('set_onboardingShow')}</button></div>
      <h2>{t('set_about')}</h2>
      <p className="hint">{t('set_aboutText')}</p>
      <div className="actions"><Link className="btn btn-secondary" href="/stav">{t('set_status')}</Link><Link className="btn btn-secondary" href="/jizdenky">{t('set_tickets')}</Link></div>
    </>
  );
}
