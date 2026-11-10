import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Icon, Spinner } from './feedback';
import { Field } from './form';
import { Highlight } from '../common/SuggestGroups';
import CurrentLocationButton from '../common/CurrentLocationButton';
import useDebounce from '../../hooks/useDebounce';
import useMediaQuery from '../../hooks/useMediaQuery';
import { lookupApi, searchApi } from '../../services';
import { placeLabel } from '../../utils/format';

const toPlace = (l) => Object.fromEntries(Object.entries({ locality: l.locality, district: l.district, city: l.city, state: l.state, country: l.country, location: l._id }).filter(([, v]) => v));
const subtitle = (l) => [l.locality || l.district ? l.city : '', l.state].filter(Boolean).join(', ');
const title = (l) => l.locality || l.district || l.city;

/** Popular cities (empty box) or ranked matches (typing), with "did you mean" for typos. */
function useLocationOptions(text, enabled) {
  const term = useDebounce(text.trim(), 200);
  const popular = useQuery({ queryKey: ['locations', 'popular'], queryFn: () => lookupApi.locations({ popular: true, limit: 12 }), enabled, staleTime: 30 * 60 * 1000 });
  const found = useQuery({
    queryKey: ['search-suggest', 'locations', term],
    queryFn: () => searchApi.suggest(term, 'locations', 8),
    enabled: enabled && term.length >= 2,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
  const typing = term.length >= 2;
  return {
    typing,
    term,
    loading: typing && found.isFetching && !found.data,
    items: typing ? (found.data?.groups?.[0]?.items || []).map((i) => i.place) : [],
    didYouMean: typing ? found.data?.didYouMean : null,
    popular: popular.data || [],
  };
}

/* Last few places picked on this device (no account data, just labels), newest first. */
const RECENT_KEY = 'fjw.recentPlaces';
const placeKey = (l) => [l.locality, l.district, l.city, l.state].filter(Boolean).join('|').toLowerCase();
export function readRecentPlaces() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.slice(0, 4) : [];
  } catch {
    return [];
  }
}
function rememberPlace(place) {
  try {
    const clean = Object.fromEntries(Object.entries(place).filter(([k]) => ['locality', 'district', 'city', 'state', 'country', 'location'].includes(k)));
    const next = [clean, ...readRecentPlaces().filter((l) => placeKey(l) !== placeKey(clean))].slice(0, 4);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
}

const Row = ({ l, term, active, onPick }) => (
  <button type="button" role="option" aria-selected={active} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(l)} className={clsx('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors', active ? 'bg-brand-blue-tint' : 'hover:bg-brand-tint')}>
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-tint text-brand-gray">
      <Icon name={l.locality || l.district ? 'pin_drop' : 'location_city'} size={17} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm text-brand-gray">
        <Highlight text={title(l)} term={term} />
      </span>
      {subtitle(l) && <span className="block truncate text-xs text-brand-gray-muted">{subtitle(l)}</span>}
    </span>
  </button>
);

/** Shared list body for the desktop dropdown and the phone sheet. */
const Options = ({ o, text, active, onPick, onCustom, onDidYouMean, picked = [], showCustom }) => {
  const taken = new Set(picked.map((p) => String(p.locality || p.district || p.city || '').toLowerCase()));
  const recent = readRecentPlaces().filter((l) => !taken.has(title(l).toLowerCase()));
  if (!o.typing) {
    const popular = o.popular.filter((l) => !taken.has(title(l).toLowerCase()));
    return (
      <div className="p-1.5">
        <CurrentLocationButton onPlace={onPick} />
        {recent.length > 0 && (
          <div className="mt-1 border-t border-brand-border pt-1">
            <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-gray-muted">Recent</p>
            {recent.map((l) => (
              <button key={placeKey(l)} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(l)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-brand-dark hover:bg-brand-tint">
                <Icon name="history" size={18} className="shrink-0 text-brand-gray-muted" />
                <span className="truncate">{placeLabel(l)}</span>
              </button>
            ))}
          </div>
        )}
        {popular.length > 0 && (
          <div className="mt-1 border-t border-brand-border p-2 pt-2.5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-brand-gray-muted">Popular cities</p>
            <div className="flex flex-wrap gap-2">
              {popular.map((l) => (
                <button key={l._id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(l)} className="rounded-full border border-brand-border bg-white px-3 py-1.5 text-[13px] text-brand-dark hover:border-brand-blue hover:text-brand-blue">
                  {title(l)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div role="listbox" className="p-1.5">
      {o.didYouMean && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onDidYouMean(o.didYouMean)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-brand-gray hover:bg-brand-tint">
          <Icon name="spellcheck" size={18} className="text-brand-orange" /> Showing places for <b className="text-brand-blue">{o.didYouMean}</b>
        </button>
      )}
      {o.loading && <Spinner size={18} className="mx-auto my-4" />}
      {o.items.map((l, i) => (
        <Row key={l._id} l={l} term={o.term} active={i === active} onPick={onPick} />
      ))}
      {showCustom && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onCustom} className={clsx('mt-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-brand-blue', active === o.items.length ? 'bg-brand-blue-tint' : 'hover:bg-brand-blue-tint')}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-blue-tint">
            <Icon name="add_location_alt" size={17} />
          </span>
          Use “{text.trim()}”
        </button>
      )}
    </div>
  );
};

/**
 * City / locality picker (Naukri style). Desktop: dropdown under the field with popular cities, ranked
 * suggestions and arrow-key navigation. Phones: tapping opens a full-screen search sheet.
 * Value: a place `{ locality, district, city, state, country, location }`, or a list with `multiple`.
 */
const LocationField = ({ label, required, error, hint, className = '', multiple = false, max, value, onChange, placeholder = 'Search city or locality' }) => {
  const id = useId();
  const desktop = useMediaQuery('(min-width: 640px)');
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const sheetInput = useRef(null);
  const selected = multiple ? value || [] : [];
  const o = useLocationOptions(text, open);
  const full = Boolean(multiple && max && selected.length >= max);
  // "Use <typed text>" only when nothing known starts with it (a new or very small place).
  const showCustom = Boolean(text.trim()) && o.typing && !o.loading && !o.items.some((l) => title(l).toLowerCase().startsWith(text.trim().toLowerCase()));

  useEffect(() => {
    if (!open || !desktop) return undefined;
    const down = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open, desktop]);
  useEffect(() => {
    if (!open || desktop) return undefined;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => sheetInput.current?.focus(), 60);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = overflow;
    };
  }, [open, desktop]);

  const pick = (l) => {
    const place = toPlace(l);
    rememberPlace(place);
    if (multiple) {
      if (selected.some((p) => placeLabel(p) === placeLabel(place))) return setText('');
      if (full) return toast.error(`You can add up to ${max} locations`);
      onChange([...selected, place]);
      setText('');
      setActive(-1);
      if (max && selected.length + 1 >= max) setOpen(false);
      return undefined;
    }
    onChange(place);
    setText('');
    setOpen(false);
    return undefined;
  };
  const custom = () => text.trim() && pick({ city: text.trim(), country: 'India' });
  const remove = (i) => onChange(selected.filter((_, x) => x !== i));

  const onKeyDown = (e) => {
    const n = o.items.length + (showCustom ? 1 : 0);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, n - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && active < o.items.length) pick(o.items[active]);
      else if (o.items.length && active < 0) pick(o.items[0]);
      else if (showCustom) custom();
    } else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Backspace' && multiple && !text && selected.length) remove(selected.length - 1);
  };

  const chips = selected.map((p, i) => (
    <span key={`${placeLabel(p)}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-full border border-brand-blue/30 bg-brand-blue-tint py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand-blue">
      <span className="truncate">{placeLabel(p)}</span>
      <button type="button" aria-label={`Remove ${placeLabel(p)}`} onClick={() => remove(i)} className="rounded-full p-0.5 hover:bg-brand-blue hover:text-white">
        <Icon name="close" size={12} />
      </button>
    </span>
  ));
  const optionProps = { o, text, active, onPick: pick, onCustom: custom, onDidYouMean: (c) => setText(c), picked: multiple ? selected : value ? [value] : [], showCustom };

  return (
    <Field label={label} required={required} error={error} hint={hint} htmlFor={id} className={className}>
      <div className="relative" ref={boxRef}>
        <div className={clsx('field-control flex min-h-11 flex-wrap items-center gap-1.5 px-2.5 py-1.5', error && 'is-invalid', open && desktop && 'is-open')} onClick={() => !desktop && setOpen(true)}>
          <Icon name="location_on" size={18} className="text-brand-gray-muted" />
          {chips}
          <input
            id={id}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            readOnly={!desktop}
            value={multiple ? text : text || placeLabel(value) || ''}
            onChange={(e) => {
              setText(e.target.value);
              setActive(-1);
              setOpen(true);
              if (!multiple && value) onChange(null);
            }}
            onFocus={() => desktop && setOpen(true)}
            onClick={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={full ? '' : selected.length ? 'Add another' : placeholder}
            disabled={full && desktop}
            className="h-7 min-w-[100px] flex-1 bg-transparent text-sm text-brand-dark outline-none placeholder:text-brand-gray-muted"
          />
          {!multiple && value && !text && (
            <button type="button" aria-label="Clear location" onClick={() => onChange(null)} className="rounded-full p-0.5 text-brand-gray-muted hover:text-brand-dark">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        {open && desktop && <div className="pop-in absolute z-40 mt-1.5 max-h-80 w-full overflow-y-auto rounded-xl border border-brand-border bg-white shadow-[var(--shadow-hover)]">{<Options {...optionProps} />}</div>}
      </div>

      {open &&
        !desktop &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label={label || 'Choose location'} className="sheet-up fixed inset-0 z-[80] flex flex-col bg-white">
            <div className="flex items-center gap-2 border-b border-brand-border px-3 py-2.5">
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-brand-gray hover:bg-brand-tint">
                <Icon name="arrow_back" size={22} />
              </button>
              <div className="relative flex-1">
                <input
                  ref={sheetInput}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setActive(-1);
                  }}
                  onKeyDown={onKeyDown}
                  placeholder={placeholder}
                  aria-label={placeholder}
                  autoComplete="off"
                  className="h-11 w-full rounded-lg border border-brand-blue bg-white px-3 pr-9 text-base outline-none shadow-[0_0_0_3px_var(--color-brand-blue-tint)]"
                />
                {text && (
                  <button type="button" aria-label="Clear" onClick={() => setText('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-gray-muted">
                    <Icon name="close" size={18} />
                  </button>
                )}
              </div>
            </div>
            {multiple && selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-b border-brand-border px-3 py-2">
                {chips}
                {max && <span className="self-center text-xs text-brand-gray-muted">{selected.length}/{max}</span>}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Options {...optionProps} />
            </div>
            {multiple && (
              <div className="border-t border-brand-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button type="button" onClick={() => setOpen(false)} className="h-11 w-full rounded-lg bg-brand-blue text-sm font-semibold text-white">
                  Done{selected.length ? ` (${selected.length})` : ''}
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </Field>
  );
};

export default LocationField;
