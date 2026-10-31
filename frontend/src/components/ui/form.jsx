import React, { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Icon, Spinner } from './feedback';
import { DateField, Select } from './pickers';
import useDebounce from '../../hooks/useDebounce';
import { lookupApi } from '../../services';
import useAuthStore from '../../store/useAuthStore';
import { placeLabel } from '../../utils/format';

const control = 'field-control w-full px-3 text-sm placeholder:text-brand-gray-muted';
const errored = 'is-invalid';

export const Field = ({ label, required, error, hint, htmlFor, className = '', children }) => (
  <div className={className}>
    {label && (
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-brand-dark">
        {label}
        {required && <span className="text-brand-red"> *</span>}
      </label>
    )}
    {children}
    {error && (
      <p className="mt-1 text-xs text-brand-red" role="alert">
        {error}
      </p>
    )}
    {hint && !error && <p className="mt-1 text-xs text-brand-gray-muted">{hint}</p>}
  </div>
);

const DATE_MODES = { date: 'date', month: 'month', 'datetime-local': 'datetime' };

export const TextField = ({ label, required, error, hint, className = '', inputClassName = '', type, ...props }) => {
  const id = useId();
  const { value, onChange, min, max, openTo, disabled, placeholder } = props;
  return (
    <Field label={label} required={required} error={error} hint={hint} htmlFor={id} className={className}>
      {DATE_MODES[type] ? (
        <DateField id={id} mode={DATE_MODES[type]} value={value} onChange={(v) => onChange?.({ target: { value: v, type: 'text' } })} min={min} max={max} openTo={openTo} disabled={disabled} placeholder={placeholder} required={required} invalid={Boolean(error)} />
      ) : (
        <input id={id} type={type} required={required} aria-invalid={Boolean(error)} className={clsx(control, 'h-11', error && errored, inputClassName)} {...props} />
      )}
    </Field>
  );
};

export const PasswordField = ({ label = 'Password', required, error, hint, className = '', ...props }) => {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <Field label={label} required={required} error={error} hint={hint} htmlFor={id} className={className}>
      <div className="relative">
        <input id={id} required={required} type={show ? 'text' : 'password'} aria-invalid={Boolean(error)} className={clsx(control, 'h-11 pr-10', error && errored)} {...props} />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray-muted hover:text-brand-blue">
          <Icon name={show ? 'visibility_off' : 'visibility'} size={20} />
        </button>
      </div>
    </Field>
  );
};

export const MobileField = ({ label = 'Mobile Number', required, error, hint, className = '', value, onChange, ...props }) => {
  const id = useId();
  return (
    <Field label={label} required={required} error={error} hint={hint} htmlFor={id} className={className}>
      <div className="flex">
        <span className="flex items-center rounded-l-lg border border-r-0 border-brand-border bg-brand-tint px-3 text-sm text-brand-gray">+91</span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          maxLength={10}
          required={required}
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value.replace(/\D/g, ''))}
          aria-invalid={Boolean(error)}
          className={clsx(control, 'h-11 rounded-l-none', error && errored)}
          {...props}
        />
      </div>
    </Field>
  );
};

export const TextAreaField = ({ label, required, error, hint, className = '', rows = 4, ...props }) => {
  const id = useId();
  return (
    <Field label={label} required={required} error={error} hint={hint} htmlFor={id} className={className}>
      <textarea id={id} rows={rows} required={required} aria-invalid={Boolean(error)} className={clsx(control, 'resize-y py-2.5', error && errored)} {...props} />
    </Field>
  );
};

/** options: string[] | { value, label }[]. onChange receives an event-like object, as a native select does. */
export const SelectField = ({ label, required, error, hint, options = [], placeholder = 'Select', className = '', value, onChange, disabled }) => {
  const id = useId();
  return (
    <Field label={label} required={required} error={error} hint={hint} htmlFor={id} className={className}>
      <Select id={id} title={label} value={value} onChange={(v) => onChange?.({ target: { value: v, type: 'select' } })} options={options} placeholder={placeholder} required={required} invalid={Boolean(error)} disabled={disabled} />
    </Field>
  );
};

export const CheckboxField = ({ label, description, className = '', ...props }) => (
  <label className={clsx('flex cursor-pointer items-start gap-2.5 text-sm text-brand-gray', className)}>
    <input type="checkbox" className="mt-0.5" {...props} />
    <span>
      {label}
      {description && <span className="block text-xs text-brand-gray-muted">{description}</span>}
    </span>
  </label>
);

export const ChoiceChips = ({ options = [], value, onChange, multiple = false, max, className = '' }) => {
  const items = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const selected = multiple ? value || [] : [value];
  const toggle = (v) => {
    if (!multiple) return onChange(v === value ? '' : v);
    if (selected.includes(v)) return onChange(selected.filter((x) => x !== v));
    if (max && selected.length >= max) return toast.error(`You can select up to ${max}`);
    return onChange([...selected, v]);
  };
  return (
    <div className={clsx('flex flex-wrap gap-2', className)}>
      {items.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={selected.includes(o.value)}
          onClick={() => toggle(o.value)}
          className={clsx(
            'rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors',
            selected.includes(o.value) ? 'border-brand-blue bg-brand-blue-tint text-brand-blue' : 'border-brand-border text-brand-gray hover:border-brand-blue',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};

/** Closes a popover on outside click. */
function useOutsideClick(onOutside) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => ref.current && !ref.current.contains(e.target) && onOutside();
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOutside]);
  return ref;
}

/**
 * Type-ahead over master data (or any async source). Single value (string) or multiple (string[]).
 * `allowCreate` keeps free text; for user-addable lookup types the option is also stored server-side.
 */
export const SuggestField = ({ label, required, error, hint, className = '', lookup, parent, multiple = false, max, value, onChange, placeholder, allowCreate = false }) => {
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(text, 250);
  const user = useAuthStore((s) => s.user);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useOutsideClick(close);
  const selected = multiple ? value || [] : [];

  const { data, isFetching } = useQuery({
    queryKey: ['lookup-suggest', lookup, parent, debounced],
    queryFn: () => lookupApi.search(lookup, { q: debounced || undefined, parent, limit: 20 }),
    enabled: open && Boolean(lookup),
    staleTime: 5 * 60 * 1000,
  });
  const options = (data || []).map((o) => o.name).filter((n) => !selected.includes(n));
  const showCreate = allowCreate && text.trim() && !options.some((o) => o.toLowerCase() === text.trim().toLowerCase());

  const pick = (name) => {
    if (multiple) {
      if (max && selected.length >= max) return toast.error(`You can add up to ${max}`);
      onChange([...selected, name]);
      setText('');
    } else {
      onChange(name);
      setText('');
      setOpen(false);
    }
  };
  const create = () => {
    const name = text.trim();
    pick(name);
    if (user && lookup) lookupApi.suggest(lookup, name).catch(() => {});
  };

  return (
    <Field label={label} required={required} error={error} hint={hint} htmlFor={id} className={className}>
      <div className="relative" ref={ref}>
        <div className={clsx('flex min-h-11 flex-wrap items-center gap-1.5 rounded-[var(--radius-input)] border border-[#D5DBE4] bg-white px-2.5 py-1.5 transition-shadow focus-within:border-brand-blue focus-within:shadow-[0_0_0_3px_rgba(10,108,181,0.14)]', error && 'border-brand-red')}>
          {selected.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-md bg-brand-blue-tint px-2 py-1 text-xs font-medium text-brand-blue">
              {s}
              <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(selected.filter((x) => x !== s))}>
                <Icon name="close" size={13} />
              </button>
            </span>
          ))}
          <input
            id={id}
            autoComplete="off"
            value={multiple ? text : text || value || ''}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              if (!multiple) onChange(allowCreate ? e.target.value : '');
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (options[0] && !showCreate) pick(options[0]);
                else if (showCreate) create();
              } else if (e.key === 'Backspace' && multiple && !text && selected.length) {
                onChange(selected.slice(0, -1));
              }
            }}
            placeholder={selected.length ? '' : placeholder || 'Type to search'}
            className="h-7 min-w-[100px] flex-1 bg-transparent text-sm text-brand-dark outline-none placeholder:text-brand-gray-muted"
          />
          {isFetching && <Spinner size={14} />}
        </div>
        {open && (options.length > 0 || showCreate) && (
          <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-brand-border bg-white py-1 shadow-[var(--shadow-hover)]">
            {options.map((o) => (
              <li key={o}>
                <button type="button" onClick={() => pick(o)} className="block w-full px-3 py-2 text-left text-sm text-brand-dark hover:bg-brand-blue-tint">
                  {o}
                </button>
              </li>
            ))}
            {showCreate && (
              <li>
                <button type="button" onClick={create} className="block w-full px-3 py-2 text-left text-sm font-medium text-brand-blue hover:bg-brand-blue-tint">
                  Add “{text.trim()}”
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </Field>
  );
};

/** Location picker backed by /locations. value: place object (or array when multiple). */
export const LocationField = ({ label, required, error, hint, className = '', multiple = false, max, value, onChange, placeholder = 'Search city or locality' }) => {
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(text, 250);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useOutsideClick(close);
  const selected = multiple ? value || [] : [];

  const { data } = useQuery({
    queryKey: ['locations', debounced],
    queryFn: () => lookupApi.locations({ q: debounced || undefined, popular: debounced ? undefined : true, limit: 15 }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const toPlace = (l) => Object.fromEntries(Object.entries({ locality: l.locality, district: l.district, city: l.city, state: l.state, country: l.country, location: l._id }).filter(([, v]) => v));
  const pick = (l) => {
    const place = toPlace(l);
    if (multiple) {
      if (max && selected.length >= max) return toast.error(`You can add up to ${max} locations`);
      onChange([...selected, place]);
    } else onChange(place);
    setText('');
    setOpen(false);
  };
  const custom = () => {
    const city = text.trim();
    if (!city) return;
    pick({ city, country: 'India' });
  };

  return (
    <Field label={label} required={required} error={error} hint={hint} htmlFor={id} className={className}>
      <div className="relative" ref={ref}>
        <div className={clsx('flex min-h-11 flex-wrap items-center gap-1.5 rounded-[var(--radius-input)] border border-[#D5DBE4] bg-white px-2.5 py-1.5 transition-shadow focus-within:border-brand-blue focus-within:shadow-[0_0_0_3px_rgba(10,108,181,0.14)]', error && 'border-brand-red')}>
          <Icon name="location_on" size={18} className="text-brand-gray-muted" />
          {selected.map((p, i) => (
            <span key={`${p.city}-${i}`} className="inline-flex items-center gap-1 rounded-md bg-brand-blue-tint px-2 py-1 text-xs font-medium text-brand-blue">
              {placeLabel(p)}
              <button type="button" aria-label="Remove location" onClick={() => onChange(selected.filter((_, x) => x !== i))}>
                <Icon name="close" size={13} />
              </button>
            </span>
          ))}
          <input
            id={id}
            autoComplete="off"
            value={multiple ? text : text || placeLabel(value) || ''}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              if (!multiple && value) onChange(null);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                custom();
              }
            }}
            placeholder={selected.length ? '' : placeholder}
            className="h-7 min-w-[100px] flex-1 bg-transparent text-sm text-brand-dark outline-none placeholder:text-brand-gray-muted"
          />
        </div>
        {open && (data?.length > 0 || text.trim()) && (
          <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-brand-border bg-white py-1 shadow-[var(--shadow-hover)]">
            {(data || []).map((l) => (
              <li key={l._id}>
                <button type="button" onClick={() => pick(l)} className="block w-full px-3 py-2 text-left text-sm text-brand-dark hover:bg-brand-blue-tint">
                  {l.displayName}
                </button>
              </li>
            ))}
            {text.trim() && !(data || []).some((l) => l.city.toLowerCase() === text.trim().toLowerCase()) && (
              <li>
                <button type="button" onClick={custom} className="block w-full px-3 py-2 text-left text-sm font-medium text-brand-blue hover:bg-brand-blue-tint">
                  Use “{text.trim()}”
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </Field>
  );
};

export const FileDropzone = ({ accept, maxSizeMb = 5, hint, onFile, disabled, busy, label = 'Drag and drop your file here' }) => {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const handle = (file) => {
    if (!file) return;
    if (file.size > maxSizeMb * 1024 * 1024) return toast.error(`File is too large. Maximum size is ${maxSizeMb} MB`);
    onFile(file);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files?.[0]);
      }}
      className={clsx('rounded-xl border-2 border-dashed p-8 text-center transition-colors', over ? 'border-brand-blue bg-brand-blue-tint' : 'border-brand-border')}
    >
      {busy ? <Spinner className="mx-auto" /> : <Icon name="cloud_upload" size={36} className="text-brand-blue" />}
      <p className="mt-2 text-sm font-medium text-brand-dark">{busy ? 'Uploading...' : label}</p>
      <button type="button" disabled={disabled || busy} onClick={() => inputRef.current?.click()} className="mt-1 text-sm font-semibold text-brand-blue hover:underline disabled:opacity-50">
        Browse files
      </button>
      {hint && <p className="mt-2 text-xs text-brand-gray-muted">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          handle(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
};
