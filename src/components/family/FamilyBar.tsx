'use client';
import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { useT } from '@/i18n';
import { familyStore, hydrateFamily, refreshAll } from '@/lib/family/family';
import { useVisibleInterval } from '@/lib/hooks';
import TLink from '../TLink';
import E3, { type E3Name } from '../icons/E3';

/** Tlačítko pod novinkami: bez rodiny „Rodičovská kontrola“, rodič vidí živý stav dítěte, dítě vidí, že se sdílí. */
export default function FamilyBar() {
  const t = useT();
  const { links } = useStore(familyStore, (s) => s);
  useEffect(() => { void hydrateFamily(); }, []);
  useVisibleInterval(() => { if (familyStore.get().links.length) void refreshAll(); }, 30_000, []);
  const l = links[0];
  let ico: E3Name = 'family', main = t('fam_title'), sub = t('fam_barSetup'), live = false, alert = false;
  if (l?.role === 'parent') {
    const name = l.peerName || t('fam_child');
    const sos = l.sosActive;
    const trip = l.trip && !l.trip.confirmed ? l.trip : null;
    ico = sos ? 'sos' : 'child'; main = sos ? t('fam_sosTitle', { n: name }) : name; alert = sos;
    sub = l.paused ? t('fam_paused') : trip ? `${t('fam_line')} ${trip.line} → ${trip.toName ?? trip.headsign}` : l.trip?.confirmed ? t('fam_arrived', { s: l.trip.toName ?? '' }) : t('fam_idle');
    live = Boolean(trip) && !l.paused;
  } else if (l?.role === 'child') {
    ico = l.paused ? 'pause' : 'eyes'; main = l.paused ? t('fam_privOff') : t('fam_privOn', { n: l.peerName || t('fam_parent') }); sub = t('fam_barGo');
    live = !l.paused;
  }
  return (
    <TLink href="/rodina" className={`fam-bar${alert ? ' alert' : ''}`} aria-label={`${main} – ${sub}`}>
      <span className="fam-bar-ico" aria-hidden><E3 name={ico} size={40} /></span>
      <span className="fam-bar-txt"><b>{main}</b><small>{sub}</small></span>
      {live && <span className="fam-bar-live" aria-hidden><i /></span>}
      <span className="fam-bar-go" aria-hidden>›</span>
    </TLink>
  );
}
