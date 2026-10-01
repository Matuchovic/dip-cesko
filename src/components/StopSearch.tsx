'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { Envelope, StopGroup } from '@/domain/model';
import { modeName, useT } from '@/i18n';
import { getJson } from '@/lib/hooks';
import { LineBadge } from './ui';

interface Result { term: string; state: 'ready' | 'empty' | 'error'; items: StopGroup[]; message: string }

/** Přístupný combobox pro hledání zastávek (bez diakritiky, klávesnice, čtečky obrazovky). */
export default function StopSearch({ label, placeholder, onSelect, initial = '', autoFocus, extraOption }: {
  label: string; placeholder?: string; onSelect: (g: StopGroup | null, label: string) => void; initial?: string; autoFocus?: boolean;
  extraOption?: { label: string; onPick: () => void };
}) {
  const id = useId();
  const t = useT();
  const [q, setQ] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) { setPrevInitial(initial); setQ(initial); }
  const [result, setResult] = useState<Result | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ctrl = useRef<AbortController | null>(null);
  const term = q.trim();
  const searching = open && term.length >= 2;

  useEffect(() => {
    if (!searching) return;
    const timer = setTimeout(async () => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      try {
        const r = await getJson<Envelope<StopGroup[]>>(`/api/stops?q=${encodeURIComponent(term)}`, c.signal);
        const items = r.body?.data ?? [];
        const failed = !r.ok || r.body?.meta.status === 'unavailable' || r.body?.meta.status === 'error';
        setResult({ term, items, state: failed ? 'error' : items.length ? 'ready' : 'empty', message: t('ss_unavailable') });
        setActive(0);
      } catch { /* přerušeno novým dotazem */ }
    }, 200);
    return () => clearTimeout(timer);
  }, [searching, term, t]);

  const current = searching && result?.term === term ? result : null;
  const state = !searching ? 'idle' : current ? current.state : 'loading';
  const items = current?.state === 'ready' ? current.items : [];

  const pick = (g: StopGroup) => { setQ(g.name); setOpen(false); onSelect(g, g.name); };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(Math.max(0, items.length - 1), a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && open && items[active]) { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  const listId = `${id}-list`;
  const showList = open && (state !== 'idle' || Boolean(extraOption));

  return (
    <div className="field">
      <label htmlFor={`${id}-in`}>{label}</label>
      <input id={`${id}-in`} className="input" role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={showList && items[active] ? `${id}-o${active}` : undefined} value={q} placeholder={placeholder} autoComplete="off" autoFocus={autoFocus}
        onChange={(e) => { setQ(e.target.value); setOpen(true); if (!e.target.value) onSelect(null, ''); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} />
      {showList && (
        <ul id={listId} role="listbox" className="combo-list" aria-label={label}>
          {extraOption && <li role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); setQ(extraOption.label); setOpen(false); extraOption.onPick(); }}><strong>{extraOption.label}</strong></li>}
          {state === 'loading' && <li role="option" aria-selected={false} aria-disabled>{t('ss_searching')}</li>}
          {state === 'empty' && <li role="option" aria-selected={false} aria-disabled>{t('ss_none', { q: term })}</li>}
          {state === 'error' && <li role="option" aria-selected={false} aria-disabled>{current?.message}</li>}
          {items.map((g, i) => (
            <li key={g.key} id={`${id}-o${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); pick(g); }}>
              <LineBadge line={modeName(t, g.modes[0] ?? 'other').slice(0, 1)} mode={g.modes[0] ?? 'other'} />
              <span><span className="row-title">{g.name}</span><br /><span className="combo-sub">{[g.municipality, g.modes.map((m) => modeName(t, m)).join(', ')].filter(Boolean).join(' · ')}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
