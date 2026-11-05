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

const parseChips = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
  return String(val)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

/**
 * Search box for jobs (`kind="job"`) or places (`kind="location"`). Focus opens recent and popular
 * options, typing adds live suggestions.
 * For `kind="job"`, supports tag chips (e.g. Node.js ✕, MongoDB ✕) on comma / Enter / suggestion click.
 * Desktop shows a panel under `anchorRef`, phones get a full-screen search sheet.
 */
const JobSearchInput = ({
  kind = 'job',
  value = '',
  onChange,
  onSearch,
  onEnter,
  anchorRef,
  placeholder,
  inputClassName = 'h-11 w-full bg-transparent text-sm text-brand-dark outline-none placeholder:text-brand-gray-muted',
  multi = kind === 'job',
}) => {
  const source = SOURCES[kind];
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState(source.recent);
  const [chips, setChips] = useState(() => (multi ? parseChips(value) : []));
  const [draft, setDraft] = useState('');
  const lastReported = useRef(value);
  const inputRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const sheetInput = useRef(null);

  const scrollToInput = () => {
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
      }
    });
  };

  // Sync external value changes (e.g. navigation or reset)
  useEffect(() => {
    if (!multi) return;
    if (value !== lastReported.current) {
      setChips(parseChips(value));
      lastReported.current = value;
    }
  }, [multi, value]);

  const emitChange = (nextChips, uncommitted = '') => {
    const combined = [...nextChips];
    const cleanDraft = uncommitted.trim();
    if (cleanDraft && !combined.some((c) => c.toLowerCase() === cleanDraft.toLowerCase())) {
      combined.push(cleanDraft);
    }
    const serialized = combined.join(', ');
    lastReported.current = serialized;
    onChange?.(serialized);
    return serialized;
  };

  const addChip = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (chips.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setDraft('');
      return;
    }
    const next = [...chips, trimmed];
    setChips(next);
    setDraft('');
    emitChange(next, '');
    scrollToInput();
  };

  const removeChip = (idx) => {
    const next = chips.filter((_, i) => i !== idx);
    setChips(next);
    emitChange(next, draft);
  };

  const clearAll = () => {
    setChips([]);
    setDraft('');
    emitChange([]);
    inputRef.current?.focus();
  };

  const currentTerm = multi ? draft : value;
  const term = useDebounce(currentTerm, 200);
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

  const matches = found
    .filter((m) => {
      const lower = m.toLowerCase();
      if (multi && chips.some((c) => c.toLowerCase() === lower)) return false;
      return lower !== currentTerm.trim().toLowerCase();
    })
    .slice(0, 6);

  const shownRecent = hasTerm
    ? recent.filter((r) => source.label(r).toLowerCase().includes(term.trim().toLowerCase())).slice(0, 2)
    : recent;
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
    onSearch?.(r);
  };

  const pickTerm = (text) => {
    if (multi) {
      addChip(text);
      close();
      inputRef.current?.focus();
    } else {
      close();
      onSearch?.({ [source.field]: text });
    }
  };

  useEffect(() => {
    if (!open || !phone) return undefined;
    sheetInput.current?.focus();
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
      } else if (multi) {
        if (draft.trim()) {
          e.preventDefault();
          const next = [...chips, draft.trim()];
          setChips(next);
          setDraft('');
          emitChange(next, '');
          close();
          onEnter?.();
        } else {
          close();
          onEnter?.();
        }
      } else if (!phone) {
        close();
        onEnter?.();
      }
    } else if (multi && (e.key === ',' || e.key === 'Tab')) {
      if (draft.trim()) {
        e.preventDefault();
        addChip(draft);
      }
    } else if (multi && e.key === 'Backspace' && !draft && chips.length > 0) {
      e.preventDefault();
      removeChip(chips.length - 1);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    if (multi) {
      if (val.includes(',')) {
        const parts = val.split(',');
        const newItems = parts.slice(0, -1).map((s) => s.trim()).filter(Boolean);
        const remainder = parts[parts.length - 1];
        if (newItems.length > 0) {
          const next = [...chips];
          for (const it of newItems) {
            if (!next.some((c) => c.toLowerCase() === it.toLowerCase())) {
              next.push(it);
            }
          }
          setChips(next);
          setDraft(remainder);
          emitChange(next, remainder);
          setActive(-1);
          setOpen(true);
          scrollToInput();
          return;
        }
      }
      setDraft(val);
      emitChange(chips, val);
      setActive(-1);
      setOpen(true);
      scrollToInput();
    } else {
      onChange(val);
      setActive(-1);
      setOpen(true);
    }
  };

  const handleBlur = () => {
    if (multi && draft.trim()) {
      addChip(draft);
    }
    if (!phone) close();
  };

  const list = (
    <Suggestions
      source={source}
      term={currentTerm}
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

  const hasFieldControl = inputClassName.includes('field-control');

  return (
    <>
      {multi ? (
        <div
          onClick={() => {
            inputRef.current?.focus();
            if (!open) show();
          }}
          className={clsx(
            'relative flex h-11 items-center overflow-hidden transition-colors cursor-text',
            hasFieldControl
              ? clsx('field-control w-full', inputClassName.includes('pl-9') ? 'pl-9 pr-2' : 'px-2.5', open && 'is-open')
              : 'min-w-0 flex-1 pr-1'
          )}
        >
          <div
            ref={scrollContainerRef}
            className="no-scrollbar flex h-full min-w-0 flex-1 items-center gap-1.5 overflow-x-auto whitespace-nowrap py-1"
          >
            {chips.map((chip, idx) => (
              <span
                key={chip + idx}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-[#EBF5FB] border border-[#CBE5F7] px-2 text-xs font-semibold text-[#0A6CB5] shadow-2xs transition-colors hover:bg-[#E1EFF9]"
              >
                <span className="max-w-[130px] truncate sm:max-w-[180px]">{chip}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeChip(idx);
                    inputRef.current?.focus();
                  }}
                  className="rounded p-0.5 text-[#0A6CB5] hover:bg-[#D4E9F7] hover:text-[#064e83] transition cursor-pointer"
                  aria-label={`Remove ${chip}`}
                >
                  <Icon name="close" size={13} />
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              value={draft}
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-label={placeholder}
              placeholder={chips.length > 0 ? (chips.length >= 3 ? '' : '+ Add more') : placeholder}
              onFocus={() => {
                show();
                scrollToInput();
              }}
              onBlur={handleBlur}
              onChange={handleInputChange}
              onKeyDown={onKeyDown}
              className="h-full min-w-[70px] flex-1 shrink-0 bg-transparent text-sm text-brand-dark outline-none placeholder:text-brand-gray-muted"
            />
          </div>
          {(chips.length > 0 || draft) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearAll();
              }}
              className="ml-1 shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-dark transition cursor-pointer"
              title="Clear all"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      ) : (
        <input
          value={value}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-label={placeholder}
          placeholder={placeholder}
          onFocus={show}
          onClick={() => !open && show()}
          onBlur={() => !phone && close()}
          onChange={(e) => {
            onChange(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={inputClassName}
        />
      )}

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
                e.stopPropagation();
                if (multi) {
                  if (draft.trim()) addChip(draft);
                  close();
                  onSearch?.({ [source.field]: [...chips, draft.trim()].filter(Boolean).join(', ') });
                } else {
                  pickTerm(value);
                }
              }}
            >
              <button type="button" onClick={close} aria-label="Close search" className="rounded-md p-2 text-brand-dark">
                <Icon name="arrow_back" size={22} />
              </button>
              <input
                ref={sheetInput}
                value={multi ? draft : value}
                onChange={handleInputChange}
                onKeyDown={onKeyDown}
                autoComplete="off"
                enterKeyHint="search"
                aria-label={placeholder}
                placeholder={multi && chips.length > 0 ? 'Add another skill or role...' : placeholder}
                className="h-11 min-w-0 flex-1 bg-transparent text-base text-brand-dark outline-none placeholder:text-brand-gray-muted"
              />
              {(multi ? draft || chips.length > 0 : value) && (
                <button
                  type="button"
                  onClick={() => {
                    if (multi) {
                      setChips([]);
                      setDraft('');
                      emitChange([]);
                    } else {
                      onChange('');
                    }
                  }}
                  aria-label="Clear search"
                  className="rounded-md p-2 text-brand-gray-muted"
                >
                  <Icon name="close" size={20} />
                </button>
              )}
            </form>
            {multi && chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-brand-border bg-slate-50">
                {chips.map((chip, idx) => (
                  <span
                    key={chip + idx}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#EBF5FB] border border-[#CBE5F7] px-2.5 py-1 text-xs font-semibold text-[#0A6CB5]"
                  >
                    <span>{chip}</span>
                    <button
                      type="button"
                      onClick={() => removeChip(idx)}
                      className="rounded-full p-0.5 text-[#0A6CB5]"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto">{list}</div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default JobSearchInput;
