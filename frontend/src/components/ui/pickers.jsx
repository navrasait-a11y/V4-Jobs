import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isValid, parse, startOfMonth, startOfWeek } from 'date-fns';
import { Icon } from './feedback';

/** Set by <Field> so a control inside it can name its dropdown sheet and show the error state. */
export const FieldContext = createContext({ label: '', invalid: false });

const isPhone = () => window.matchMedia('(max-width: 639px)').matches;

/**
 * Floating panel rendered in a portal so modals and scroll areas never clip it.
 * Opens below the anchor, flips up when there is no room, and becomes a bottom sheet on phones.
 */
export const Popover = ({ anchorRef, open, onClose, width, minWidth = 0, title, children, panelRef }) => {
  const [style, setStyle] = useState(null);
  const [phone, setPhone] = useState(false);
  const ownRef = useRef(null);
  const ref = panelRef || ownRef;

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      if (!a) return;
      setPhone(isPhone());
      const h = ref.current?.offsetHeight || 280;
      const w = Math.min(Math.max(width || a.width, minWidth), window.innerWidth - 16);
      const below = window.innerHeight - a.bottom;
      const top = below < h + 12 && a.top > h + 12 ? a.top - h - 6 : a.bottom + 6;
      setStyle({ top, left: Math.max(8, Math.min(a.left, window.innerWidth - w - 8)), width: w });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef, width, minWidth, ref]);

  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => {
      if (ref.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open, onClose, anchorRef, ref]);

  if (!open || !style) return null;
  return createPortal(
    phone ? (
      <div className="fixed inset-0 z-[80] flex items-end bg-brand-ink/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div ref={ref} className="sheet-up max-h-[75vh] w-full overflow-hidden rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-between border-b border-brand-border px-4 py-3">
            <p className="text-sm font-semibold text-brand-dark">{title || 'Select'}</p>
            <button type="button" onClick={onClose} aria-label="Close" className="text-brand-gray">
              <Icon name="close" />
            </button>
          </div>
          {children}
        </div>
      </div>
    ) : (
      <div ref={ref} style={style} className="pop-in fixed z-[80] overflow-hidden rounded-[var(--radius-input)] border border-brand-border bg-white shadow-[var(--shadow-modal)]">
        {children}
      </div>
    ),
    document.body,
  );
};

const normalize = (options) => options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));

/** Accessible single-select. Search appears automatically on long lists. */
export const Select = ({ id, value, onChange, options = [], placeholder = 'Select', disabled, invalid, title, className = '', buttonClassName, ariaLabel, name, required }) => {
  const items = useMemo(() => normalize(options), [options]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const searchable = items.length > 8;
  const all = useMemo(() => (placeholder === null || required ? items : [{ value: '', label: placeholder }, ...items]), [items, placeholder, required]);
  const shown = q ? all.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : all;
  const current = items.find((o) => String(o.value) === String(value ?? ''));
  const close = useCallback(() => {
    setOpen(false);
    setQ('');
  }, []);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, shown.findIndex((o) => String(o.value) === String(value ?? ''))));
    if (searchable) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (v) => {
    onChange(v);
    close();
    btnRef.current?.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(shown.length, 1));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (shown[active]) pick(shown[active].value);
    } else if (e.key === 'Tab') close();
    return undefined;
  };

  return (
    <div className={clsx('relative', className)}>
      {/* Keeps native "required" validation working on submit. */}
      {required && <input tabIndex={-1} aria-hidden="true" required value={value ?? ''} onChange={() => {}} name={name} className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0" />}
      <button
        ref={btnRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        className={buttonClassName || clsx('field-control flex h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm', invalid && 'is-invalid', open && 'is-open')}
      >
        <span className={clsx('truncate', !current && 'text-brand-gray-muted')}>{current ? current.label : placeholder}</span>
        <Icon name="expand_more" size={20} className={clsx('shrink-0 text-brand-gray-muted transition-transform duration-150', open && 'rotate-180')} />
      </button>
      <Popover anchorRef={btnRef} open={open} onClose={close} title={title || ariaLabel || placeholder}>
        {searchable && (
          <div className="border-b border-brand-border p-2">
            <input ref={searchRef} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} placeholder="Search" aria-label="Search options" className="h-9 w-full rounded-md bg-brand-tint px-3 text-sm outline-none" />
          </div>
        )}
        <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
          {shown.map((o, i) => {
            const selected = String(o.value) === String(value ?? '');
            return (
              <li key={o.value} role="option" aria-selected={selected}>
                <button type="button" tabIndex={-1} onMouseEnter={() => setActive(i)} onClick={() => pick(o.value)} className={clsx('flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm sm:py-2', i === active && 'bg-brand-tint', selected ? 'font-semibold text-brand-blue' : 'text-brand-dark')}>
                  <span>{o.label}</span>
                  {selected && <Icon name="check" size={17} />}
                </button>
              </li>
            );
          })}
          {!shown.length && <li className="px-3 py-3 text-sm text-brand-gray-muted">No matches</li>}
        </ul>
      </Popover>
    </div>
  );
};

const MONTHS = Array.from({ length: 12 }, (_, i) => format(new Date(2000, i, 1), 'MMM'));
const FORMATS = { date: 'yyyy-MM-dd', month: 'yyyy-MM', datetime: "yyyy-MM-dd'T'HH:mm" };
const DISPLAY = { date: 'd MMM yyyy', month: 'MMM yyyy', datetime: 'd MMM yyyy, h:mm a' };

const parseValue = (value, mode) => {
  if (!value) return null;
  const d = parse(value, FORMATS[mode], new Date());
  return isValid(d) ? d : null;
};

const Header = ({ view, setView, minYear, maxYear, showMonth }) => {
  const years = [];
  for (let y = maxYear; y >= minYear; y -= 1) years.push({ value: y, label: String(y) });
  const small = 'h-8 rounded-md px-2 text-sm font-semibold text-brand-dark hover:bg-brand-tint';
  return (
    <div className="flex items-center justify-between gap-1 px-2 pt-2">
      {showMonth && (
        <button type="button" aria-label="Previous month" onClick={() => setView(addMonths(view, -1))} className="rounded-md p-1 text-brand-gray hover:bg-brand-tint">
          <Icon name="chevron_left" />
        </button>
      )}
      <div className="flex flex-1 justify-center gap-1">
        {showMonth && (
          <select aria-label="Month" value={view.getMonth()} onChange={(e) => setView(new Date(view.getFullYear(), Number(e.target.value), 1))} className={small}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Year" value={view.getFullYear()} onChange={(e) => setView(new Date(Number(e.target.value), view.getMonth(), 1))} className={small}>
          {years.map((y) => (
            <option key={y.value} value={y.value}>
              {y.label}
            </option>
          ))}
        </select>
      </div>
      {showMonth && (
        <button type="button" aria-label="Next month" onClick={() => setView(addMonths(view, 1))} className="rounded-md p-1 text-brand-gray hover:bg-brand-tint">
          <Icon name="chevron_right" />
        </button>
      )}
    </div>
  );
};

/** Date, month or date-time field. Value is the same string a native input would give. */
export const DateField = ({ id, value, onChange, mode = 'date', min, max, disabled, invalid, placeholder, openTo, required, name }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const selected = parseValue(value, mode);
  const minDate = min ? new Date(min) : null;
  const maxDate = max ? new Date(max) : null;
  const [view, setView] = useState(selected || (openTo ? new Date(openTo) : maxDate && maxDate < new Date() ? maxDate : new Date()));
  const [time, setTime] = useState(selected ? format(selected, 'HH:mm') : '10:00');
  const nowYear = new Date().getFullYear();
  const minYear = minDate?.getFullYear() ?? nowYear - 80;
  const maxYear = maxDate?.getFullYear() ?? nowYear + 10;
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (open && selected) setView(selected);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const blocked = (d) => (minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) || (maxDate && d > maxDate);
  const emit = (d, t = time) => {
    if (mode === 'datetime') {
      const [h, m] = t.split(':').map(Number);
      const next = new Date(d);
      next.setHours(h, m, 0, 0);
      onChange(format(next, FORMATS.datetime));
    } else onChange(format(d, FORMATS[mode]));
  };
  const days = useMemo(() => eachDayOfInterval({ start: startOfWeek(startOfMonth(view)), end: endOfWeek(endOfMonth(view)) }), [view]);

  return (
    <div className="relative">
      {required && <input tabIndex={-1} aria-hidden="true" required value={value ?? ''} onChange={() => {}} name={name} className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0" />}
      <button ref={btnRef} id={id} type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-invalid={invalid || undefined} onClick={() => setOpen((o) => !o)} className={clsx('field-control flex h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm', invalid && 'is-invalid', open && 'is-open')}>
        <span className={clsx('truncate', !selected && 'text-brand-gray-muted')}>{selected ? format(selected, DISPLAY[mode]) : placeholder || (mode === 'month' ? 'Select month' : 'Select date')}</span>
        <Icon name="calendar_today" size={18} className="shrink-0 text-brand-gray-muted" />
      </button>
      <Popover anchorRef={btnRef} open={open} onClose={close} width={296} title={mode === 'month' ? 'Select month' : 'Select date'}>
        <Header view={view} setView={setView} minYear={minYear} maxYear={maxYear} showMonth={mode !== 'month'} />
        {mode === 'month' ? (
          <div className="grid grid-cols-3 gap-1 p-2">
            {MONTHS.map((m, i) => {
              const d = new Date(view.getFullYear(), i, 1);
              const on = selected && isSameMonth(selected, d);
              return (
                <button
                  key={m}
                  type="button"
                  disabled={blocked(d)}
                  onClick={() => {
                    emit(d);
                    close();
                  }}
                  className={clsx('h-10 rounded-md text-sm font-medium disabled:opacity-30', on ? 'bg-brand-blue text-white' : 'text-brand-dark hover:bg-brand-tint')}
                >
                  {m}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-2">
            <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-brand-gray-muted">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <span key={d} className="py-1">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const on = selected && isSameDay(selected, d);
                const today = isSameDay(d, new Date());
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    disabled={blocked(d)}
                    aria-pressed={Boolean(on)}
                    onClick={() => {
                      emit(d);
                      if (mode === 'date') close();
                    }}
                    className={clsx('mx-auto h-9 w-9 rounded-md text-sm disabled:opacity-25', on ? 'bg-brand-blue font-semibold text-white' : 'hover:bg-brand-tint', !on && (isSameMonth(d, view) ? 'text-brand-dark' : 'text-brand-gray-muted/60'), today && !on && 'ring-1 ring-brand-orange')}
                  >
                    {format(d, 'd')}
                  </button>
                );
              })}
            </div>
            {mode === 'datetime' && (
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-brand-border pt-2">
                <label className="flex items-center gap-2 text-sm text-brand-gray">
                  Time
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => {
                      setTime(e.target.value);
                      if (selected) emit(selected, e.target.value);
                    }}
                    className="h-9 rounded-md border border-brand-border px-2 text-sm"
                  />
                </label>
                <button type="button" onClick={close} className="rounded-md bg-brand-blue px-3 py-1.5 text-sm font-semibold text-white">
                  Done
                </button>
              </div>
            )}
          </div>
        )}
        {value && (
          <div className="border-t border-brand-border px-3 py-2 text-right">
            <button
              type="button"
              onClick={() => {
                onChange('');
                close();
              }}
              className="text-xs font-semibold text-brand-gray hover:text-brand-red"
            >
              Clear
            </button>
          </div>
        )}
      </Popover>
    </div>
  );
};


/**
 * Multi-select dropdown (Naukri style): the field shows the picked values as removable chips; the
 * panel has search, checkboxes, "Select all" / "Clear" and a Done button. Becomes a bottom sheet on
 * phones (Popover). value: string[]; options: string[] | { value, label }[].
 */
export const MultiSelect = ({ id, value = [], onChange, options = [], placeholder = 'Select', max, title: titleProp, invalid: invalidProp, disabled, className = '', ariaLabel: ariaProp, chipLimit = 3 }) => {
  const field = useContext(FieldContext);
  const ariaLabel = ariaProp || field.label || undefined;
  const title = titleProp || field.label || undefined;
  const invalid = invalidProp || field.invalid;
  const items = useMemo(() => normalize(options), [options]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const btnRef = useRef(null);
  const searchRef = useRef(null);
  const selected = value || [];
  const labelOf = (v) => items.find((o) => String(o.value) === String(v))?.label || v;
  const shown = q ? items.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : items;
  const close = useCallback(() => {
    setOpen(false);
    setQ('');
  }, []);
  useEffect(() => {
    if (open && items.length > 8) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open, items.length]);

  const toggle = (v) => {
    if (selected.includes(v)) return onChange(selected.filter((x) => x !== v));
    if (max && selected.length >= max) return undefined;
    return onChange([...selected, v]);
  };
  const atMax = Boolean(max && selected.length >= max);

  return (
    <div className={clsx('relative', className)}>
      <div
        ref={btnRef}
        id={id}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel || title || placeholder}
        aria-invalid={invalid || undefined}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          } else if (e.key === 'Escape') close();
          else if (e.key === 'Backspace' && selected.length) onChange(selected.slice(0, -1));
        }}
        className={clsx('field-control flex min-h-11 w-full cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-left text-sm', invalid && 'is-invalid', open && 'is-open', disabled && 'cursor-not-allowed opacity-60')}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {!selected.length && <span className="px-0.5 text-brand-gray-muted">{placeholder}</span>}
          {selected.slice(0, chipLimit).map((v) => (
            <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-full border border-brand-blue/30 bg-brand-blue-tint py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand-blue">
              <span className="truncate">{labelOf(v)}</span>
              <button
                type="button"
                aria-label={`Remove ${labelOf(v)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(selected.filter((x) => x !== v));
                }}
                className="rounded-full p-0.5 hover:bg-brand-blue hover:text-white"
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
          {selected.length > chipLimit && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-xs font-semibold text-brand-gray">+{selected.length - chipLimit} more</span>}
        </div>
        <Icon name="expand_more" size={20} className={clsx('shrink-0 text-brand-gray-muted transition-transform duration-150', open && 'rotate-180')} />
      </div>
      <Popover anchorRef={btnRef} open={open} onClose={close} title={title || ariaLabel || placeholder} minWidth={260}>
        {items.length > 8 && (
          <div className="border-b border-brand-border p-2">
            <div className="relative">
              <Icon name="search" size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-gray-muted" />
              <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && close()} placeholder="Search" aria-label="Search options" className="h-9 w-full rounded-md border border-brand-border pl-8 pr-2 text-sm outline-none focus:border-brand-blue focus:shadow-[0_0_0_3px_var(--color-brand-blue-tint)]" />
            </div>
          </div>
        )}
        <div className="flex items-center justify-between border-b border-brand-border px-3 py-1.5 text-xs">
          <span className="text-brand-gray">
            {selected.length ? `${selected.length} selected` : 'None selected'}
            {max ? ` · up to ${max}` : ''}
          </span>
          <span className="flex gap-3">
            {!max && shown.length > 1 && (
              <button type="button" onClick={() => onChange([...new Set([...selected, ...shown.map((o) => o.value)])])} className="font-semibold text-brand-blue">
                Select all
              </button>
            )}
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="font-semibold text-brand-red">
                Clear
              </button>
            )}
          </span>
        </div>
        <ul role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto py-1">
          {shown.map((o) => {
            const on = selected.includes(o.value);
            const blocked = !on && atMax;
            return (
              <li key={o.value} role="option" aria-selected={on}>
                <label className={clsx('flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm', on ? 'bg-brand-blue-tint/60 text-brand-dark' : 'text-brand-dark hover:bg-brand-tint', blocked && 'cursor-not-allowed opacity-45')}>
                  <input type="checkbox" checked={on} disabled={blocked} onChange={() => toggle(o.value)} />
                  <span className="flex-1">{o.label}</span>
                </label>
              </li>
            );
          })}
          {!shown.length && <li className="px-3 py-4 text-center text-sm text-brand-gray-muted">No match for “{q}”</li>}
        </ul>
        <div className="flex justify-end border-t border-brand-border p-2">
          <button type="button" onClick={close} className="rounded-md bg-brand-blue px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-blue-dark">
            Done
          </button>
        </div>
      </Popover>
    </div>
  );
};
