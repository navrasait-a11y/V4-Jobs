import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Icon } from '../ui/feedback';
import { Popover } from '../ui/pickers';
import useDebounce from '../../hooks/useDebounce';
import { lookupApi } from '../../services';
import { clearRecent, readRecent, recentLabel, removeRecent } from '../../utils/recentSearches';

const isPhone = () => window.matchMedia('(max-width: 639px)').matches;
const cityNames = (rows) => [...new Set(rows.map((l) => l.city).filter(Boolean))];

/** What each search box suggests. Location shows the cities from recent searches. */
const SOURCES = {
  job: {
    field: 'q',
    icon: 'search',
    sheetLabel: 'Search jobs',
    popularTitle: 'Popular searches',
    recent: readRecent,
    label: recentLabel,
    editable: true,
    popular: async () => (await lookupApi.search('job_title', { limit: 8 })).map((o) => o.name),
    find: async (q) => {
      const [titles, skills] = await Promise.all([lookupApi.search('job_title', { q, limit: 5 }), lookupApi.search('key_skill', { q, limit: 5 })]);
      return [...new Set([...titles, ...skills].map((o) => o.name))];
    },
  },
  location: {
    field: 'location',
    icon: 'location_on',
    sheetLabel: 'Search location',
    popularTitle: 'Popular cities',
    recent: () => [...new Set(readRecent().map((r) => r.location).filter(Boolean))].map((location) => ({ location })),
    label: (r) => r.location,
    editable: false,
    popular: async () => cityNames(await lookupApi.locations({ popular: true, limit: 8 })),
    find: async (q) => cityNames(await lookupApi.locations({ q, limit: 10 })),
  },
};

const Suggestions = ({ source, term, recent, popular, matches, active, onRecent, onRemove, onClear, onPick }) => {
  const typing = term.trim().length >= 2;
  const needle = term.trim().toLowerCase();
  const shown = typing ? recent.filter((r) => source.label(r).toLowerCase().includes(needle)).slice(0, 2) : recent;
  const row = (i) => clsx('flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left text-sm text-brand-dark hover:bg-brand-tint', i === active && 'bg-brand-tint');
  return (
    <div className="p-2" onMouseDown={(e) => e.preventDefault()}>
      {shown.length > 0 && (
        <section>
          <div className="flex items-center justify-between px-2 py-1.5">
            <h3 className="text-xs font-semibold text-brand-gray-muted">Recent searches</h3>
            {!typing && source.editable && (
              <button type="button" onClick={onClear} className="text-xs font-medium text-brand-blue hover:underline">
                Clear all
              </button>
            )}
          </div>
          <ul>
            {shown.map((r, i) => (
              <li key={source.label(r)} className="flex items-center">
                <button type="button" onClick={() => onRecent(r)} className={row(i)}>
                  <Icon name="history" size={18} className="shrink-0 text-brand-gray-muted" />
                  <span className="truncate">{source.label(r)}</span>
                </button>
                {source.editable && (
                  <button type="button" onClick={() => onRemove(r)} aria-label={`Remove ${source.label(r)}`} className="rounded p-1.5 text-brand-gray-muted hover:text-brand-dark">
                    <Icon name="close" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {typing && matches.length > 0 && (
        <section className={shown.length ? 'mt-1 border-t border-brand-border pt-1' : ''}>
          <h3 className="px-2 py-1.5 text-xs font-semibold text-brand-gray-muted">Suggestions</h3>
          <ul>
            {matches.map((m, i) => (
              <li key={m}>
                <button type="button" onClick={() => onPick(m)} className={clsx(row(i + shown.length), 'w-full')}>
                  <Icon name={source.icon} size={18} className="shrink-0 text-brand-gray-muted" />
                  <span className="truncate">{m}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!typing && popular.length > 0 && (
        <section className={shown.length ? 'mt-1 border-t border-brand-border pt-1' : ''}>
          <h3 className="px-2 py-1.5 text-xs font-semibold text-brand-gray-muted">{source.popularTitle}</h3>
          <div className="flex flex-wrap gap-2 px-2 pb-2">
            {popular.map((p) => (
              <button key={p} type="button" onClick={() => onPick(p)} className="rounded-full border border-brand-border px-3 py-1 text-[13px] text-brand-dark hover:border-[#AEB7C4] hover:bg-brand-tint">
                {p}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

/**
 * Search box for jobs (`kind="job"`) or places (`kind="location"`). Focus opens recent and popular
 * options, typing adds live suggestions.
 * Desktop shows a panel under `anchorRef`, phones get a full-screen search sheet.
 */
const JobSearchInput = ({ kind = 'job', value, onChange, onSearch, onEnter, anchorRef, placeholder, inputClassName = 'h-11 w-full bg-transparent text-sm text-brand-dark outline-none placeholder:text-brand-gray-muted' }) => {
  const source = SOURCES[kind];
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState(source.recent);
  const sheetInput = useRef(null);
  const term = useDebounce(value, 200);
  const hasTerm = term.trim().length >= 2;

  const { data: popular = [] } = useQuery({
    queryKey: ['search-popular', kind],
    queryFn: source.popular,
    enabled: open,
    staleTime: 30 * 60 * 1000,
  });
  const { data: found = [] } = useQuery({
    queryKey: ['search-suggest', kind, term],
    queryFn: () => source.find(term),
    enabled: open && hasTerm,
    staleTime: 5 * 60 * 1000,
  });
  const matches = found.filter((m) => m.toLowerCase() !== value.trim().toLowerCase()).slice(0, 6);
  const shownRecent = hasTerm ? recent.filter((r) => source.label(r).toLowerCase().includes(term.trim().toLowerCase())).slice(0, 2) : recent;
  const hasContent = shownRecent.length > 0 || (hasTerm ? matches.length > 0 : popular.length > 0);

  const show = () => {
    setRecent(source.recent());
    setPhone(isPhone());
    setActive(-1);
    setOpen(true);
  };
  const close = () => setOpen(false);
  const pickRecent = (r) => {
    close();
    onSearch(r);
  };
  const pickTerm = (text) => {
    close();
    onSearch({ [source.field]: text });
  };

  useEffect(() => {
    if (!open || !phone) return undefined;
    sheetInput.current?.focus();
    // The tap that opened the sheet finishes after this, and can pull focus back to the page input.
    const again = setTimeout(() => sheetInput.current?.focus(), 80);
    return () => clearTimeout(again);
  }, [open, phone]);
  useEffect(() => {
    if (!open || !phone) return undefined;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, [open, phone]);

  const onKeyDown = (e) => {
    const count = shownRecent.length + (hasTerm ? matches.length : 0);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, count - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Enter') {
      if (open && active >= 0) {
        e.preventDefault();
        if (active < shownRecent.length) pickRecent(shownRecent[active]);
        else pickTerm(matches[active - shownRecent.length]);
      } else if (!phone) {
        close();
        onEnter?.();
      }
    }
  };

  const list = (
    <Suggestions
      source={source}
      term={value}
      recent={recent}
      popular={popular}
      matches={matches}
      active={active}
      onRecent={pickRecent}
      onPick={pickTerm}
      onRemove={(r) => setRecent(removeRecent(r))}
      onClear={() => setRecent(clearRecent())}
    />
  );

  return (
    <>
      <input
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-label={placeholder}
        placeholder={placeholder}
        onFocus={show}
        onClick={() => !open && show()}
        onBlur={() => !phone && close()} // two boxes share one anchor, so outside-click alone misses this
        onChange={(e) => {
          onChange(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={inputClassName}
      />
      {!phone && (
        <Popover anchorRef={anchorRef} open={open && hasContent} onClose={close}>
          <div className="max-h-[360px] overflow-y-auto">{list}</div>
        </Popover>
      )}
      {phone &&
        open &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label={source.sheetLabel} className="fixed inset-0 z-[70] flex flex-col bg-white animate-fade-in">
            <form
              className="flex items-center gap-2 border-b border-brand-border p-2"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation(); // portals still bubble to the page's search form
                pickTerm(value);
              }}
            >
              <button type="button" onClick={close} aria-label="Close search" className="rounded-md p-2 text-brand-dark">
                <Icon name="arrow_back" size={22} />
              </button>
              <input ref={sheetInput} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} autoComplete="off" enterKeyHint="search" aria-label={placeholder} placeholder={placeholder} className="h-11 min-w-0 flex-1 bg-transparent text-base text-brand-dark outline-none placeholder:text-brand-gray-muted" />
              {value && (
                <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="rounded-md p-2 text-brand-gray-muted">
                  <Icon name="close" size={20} />
                </button>
              )}
            </form>
            <div className="flex-1 overflow-y-auto">{list}</div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default JobSearchInput;
