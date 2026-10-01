'use client';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { DEFAULT_SETTINGS, settingsStore, type Settings } from '@/lib/settings';
import { favoritesStore } from '@/lib/favorites';

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
  return (
    <>
      <h1>Nastavení</h1>
      <Seg k="theme" label="Vzhled" options={[['system', 'Podle systému'], ['light', 'Světlý'], ['dark', 'Tmavý']]} />
      <Seg k="motion" label="Animace" options={[['system', 'Podle systému'], ['full', 'Plné'], ['reduce', 'Omezené']]} />
      <Seg k="vehicleStyle" label="Vozidla na mapě" options={[['sprites', 'Obrázky vozidel'], ['markers', 'Jednoduché značky']]} />
      <Toggle k="buildings3d" label="3D budovy" hint="V nakloněném pohledu; na slabších zařízeních vypněte." />
      <Toggle k="showStops" label="Zastávky na mapě" hint="Od přiblížení úrovně ulic." />
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={() => settingsStore.set(DEFAULT_SETTINGS)}>Obnovit výchozí</button>
        <button type="button" className="btn btn-ghost" onClick={() => { if (confirm('Opravdu smazat všechny oblíbené položky v tomto zařízení?')) favoritesStore.set({ items: [] }); }}>Smazat oblíbené</button>
      </div>
      <h2>O datech</h2>
      <p className="hint">Mapa: © přispěvatelé OpenStreetMap, OpenMapTiles, OpenFreeMap. Doprava: ROPID / PID (CC BY 4.0), Golemio API. Polohu zařízení používáme jen pro zobrazení okolí a hledání spojení; neukládáme ji ani nezapisujeme do logů.</p>
      <div className="actions"><Link className="btn btn-secondary" href="/stav">Stav datových zdrojů</Link><Link className="btn btn-secondary" href="/jizdenky">Jízdenky</Link></div>
    </>
  );
}
