import React, { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Icon, Spinner } from './feedback';
import { DateField, FieldContext, MultiSelect, Select } from './pickers';
import useDebounce from '../../hooks/useDebounce';
import { lookupApi, searchApi } from '../../services';
import SuggestGroups, { flattenGroups } from '../common/SuggestGroups';
import useAuthStore from '../../store/useAuthStore';

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
    <FieldContext.Provider value={{ label: typeof label === 'string' ? label : '', invalid: Boolean(error) }}>{children}</FieldContext.Provider>
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

/**
 * Pill choices. A multiple list longer than `dropdownAfter` options turns into a searchable
 * MultiSelect dropdown, so long lists (industries, skills, benefits) never flood the form.
 */
export const ChoiceChips = ({ options = [], value, onChange, multiple = false, max, className = '', dropdownAfter = 8, placeholder, ariaLabel, invalid }) => {
  const items = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  if (multiple && items.length > dropdownAfter) {
    return <MultiSelect className={className} value={value || []} onChange={onChange} options={items} max={max} placeholder={placeholder || (max ? `Select up to ${max}` : 'Select one or more')} ariaLabel={ariaLabel} title={ariaLabel} invalid={invalid} />;
  }
  return <ChipList items={items} value={value} onChange={onChange} multiple={multiple} max={max} className={className} />;
};

const ChipList = ({ items, value, onChange, multiple, max, className }) => {
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
            'inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all active:scale-[0.97]',
            selected.includes(o.value) ? 'border-brand-blue bg-brand-blue-tint text-brand-blue shadow-[inset_0_0_0_1px_var(--color-brand-blue)]' : 'border-[#D5DBE4] bg-white text-brand-gray hover:border-brand-blue hover:text-brand-blue',
          )}
        >
          {multiple && selected.includes(o.value) && <Icon name="check" size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  );
};

/** Option text with the typed part in bold (Naukri style suggestions). */
const Highlight = ({ text = '', term = '' }) => {
  const t = term.trim();
  const i = t ? String(text).toLowerCase().indexOf(t.toLowerCase()) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <b className="font-semibold text-brand-dark">{text.slice(i, i + t.length)}</b>
      {text.slice(i + t.length)}
    </>
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
export const SuggestField = ({ label, required, error, hint, className = '', lookup, parent, parents, limit = 20, multiple = false, max, value, onChange, placeholder, allowCreate = false, disabled = false }) => {
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebounce(text, 250);
  const user = useAuthStore((s) => s.user);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useOutsideClick(close);
  const selected = multiple ? value || [] : [];

  const { data, isFetching } = useQuery({
    queryKey: ['lookup-suggest', lookup, parent, parents, debounced, limit],
    queryFn: () => lookupApi.search(lookup, { q: debounced || undefined, parent, parents: parents || undefined, limit }),
    enabled: open && Boolean(lookup) && !disabled,
    staleTime: 5 * 60 * 1000,
  });
  // Starts-with matches first ("Rea" -> React before Analytical Reasoning), keeping the API's popularity order within each.
  const needle = debounced.trim().toLowerCase();
  const startsRank = (n) => (!needle ? 0 : n.toLowerCase().startsWith(needle) ? 0 : 1);
  const options = [...new Set((data || []).map((o) => o.name))].filter((n) => !selected.includes(n)).sort((a, b) => startsRank(a) - startsRank(b));
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
        <div className={clsx('field-control flex min-h-11 flex-wrap items-center gap-1.5 px-2.5 py-1.5', error && 'is-invalid')}>
          {selected.map((s) => (
            <span key={s} className="inline-flex max-w-full items-center gap-1 rounded-full border border-brand-blue/30 bg-brand-blue-tint py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand-blue">
              <span className="truncate">{s}</span>
              <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(selected.filter((x) => x !== s))} className="rounded-full p-0.5 hover:bg-brand-blue hover:text-white">
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
          <input
            id={id}
            autoComplete="off"
            value={multiple ? text : text || value || ''}
            role="combobox"
            aria-expanded={open}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setActive(-1);
              if (!multiple) onChange(allowCreate ? e.target.value : '');
            }}
            onClick={() => setOpen(true)}
            onKeyDown={(e) => {
              const n = options.length + (showCreate ? 1 : 0);
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setOpen(true);
                setActive((a) => Math.min(a + 1, n - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, -1));
              } else if (e.key === 'Escape') {
                setOpen(false);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (active >= 0 && active < options.length) pick(options[active]);
                else if (active === options.length && showCreate) create();
                else if (options[0] && !showCreate) pick(options[0]);
                else if (showCreate) create();
                setActive(-1);
              } else if (e.key === 'Backspace' && multiple && !text && selected.length) {
                onChange(selected.slice(0, -1));
              }
            }}
            disabled={disabled}
            placeholder={selected.length ? '' : placeholder || 'Type to search'}
            className="h-7 min-w-[100px] flex-1 bg-transparent text-sm text-brand-dark outline-none placeholder:text-brand-gray-muted disabled:cursor-not-allowed"
          />
          {isFetching && <Spinner size={14} />}
        </div>
        {open && (options.length > 0 || showCreate) && (
          <ul role="listbox" className="pop-in absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-brand-border bg-white py-1 shadow-[var(--shadow-hover)]">
            {!text.trim() && options.length > 0 && <li className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-gray-muted">Popular</li>}
            {options.map((o, i) => (
              <li key={o}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} className={clsx('block w-full px-3 py-2 text-left text-sm text-brand-gray', i === active ? 'bg-brand-blue-tint' : 'hover:bg-brand-tint')}>
                  <Highlight text={o} term={text} />
                </button>
              </li>
            ))}
            {showCreate && (
              <li>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={create} className={clsx('flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-brand-blue', active === options.length ? 'bg-brand-blue-tint' : 'hover:bg-brand-blue-tint')}>
                  <Icon name="add" size={16} />
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

/**
 * Free-text entries in box format instead of commas (Excel: keywords, e-mails). Enter, comma or Tab adds a box.
 * With `starred` / `onStarredChange`, each box gets a star that marks it mandatory.
 */
/**
 * Free-text chips (Enter / comma adds one). With `suggest` ("jobs" | "candidates" | "companies") it also
 * shows grouped live suggestions while typing; arrow keys + Enter pick one.
 */
export const TagInput = ({ label, required, error, hint, className = '', value = [], onChange, max = 20, placeholder = 'Type and press Enter', starred, onStarredChange, validate, maxLength = 100, suggest }) => {
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const close = React.useCallback(() => setOpen(false), []);
  const boxRef = useOutsideClick(close);
  const term = useDebounce(text.trim(), 200);
  const sugg = useQuery({
    queryKey: ['search-suggest', suggest, term],
    queryFn: () => searchApi.suggest(term, suggest, 5),
    enabled: Boolean(suggest) && open && term.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
  const matches = suggest && term.length >= 2 ? flattenGroups(sugg.data?.groups, (it) => value.some((v) => v.toLowerCase() === it.label.toLowerCase()), 8) : [];
  const stars = starred || [];
  const add = (raw) => {
    const parts = String(raw)
      .split(',')
      .map((t) => t.trim().slice(0, maxLength))
      .filter(Boolean);
    if (!parts.length) return;
    let next = [...value];
    for (const t of parts) {
      if (next.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
      if (validate && !validate(t)) {
        toast.error(`"${t}" is not valid`);
        continue;
      }
      if (next.length >= max) {
        toast.error(`You can add up to ${max}`);
        break;
      }
      next = [...next, t];
    }
    onChange(next);
    setText('');
    setActive(-1);
  };
  const remove = (t) => {
    onChange(value.filter((x) => x !== t));
    if (onStarredChange && stars.includes(t)) onStarredChange(stars.filter((x) => x !== t));
  };
  return (
    <Field label={label} required={required} error={error} hint={hint} htmlFor={id} className={className}>
      <div className="relative" ref={boxRef}>
      <div className={clsx('field-control flex min-h-11 flex-wrap items-center gap-1.5 px-2.5 py-1.5', error && 'is-invalid')}>
        {value.map((t) => {
          const on = stars.includes(t);
          return (
            <span key={t} className={clsx('inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium', on ? 'bg-[#FFF4E0] text-[#B26A00]' : 'bg-brand-blue-tint text-brand-blue')}>
              {onStarredChange && (
                <button type="button" aria-pressed={on} aria-label={on ? `Make ${t} optional` : `Make ${t} mandatory`} title={on ? 'Mandatory' : 'Mark as mandatory'} onClick={() => onStarredChange(on ? stars.filter((x) => x !== t) : [...stars, t])}>
                  <Icon name="star" size={14} fill={on} />
                </button>
              )}
              {t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => remove(t)}>
                <Icon name="close" size={13} />
              </button>
            </span>
          );
        })}
        <input
          id={id}
          autoComplete="off"
          value={text}
          role={suggest ? 'combobox' : undefined}
          aria-expanded={suggest ? open : undefined}
          onChange={(e) => {
            if (e.target.value.includes(',')) return add(e.target.value);
            setText(e.target.value);
            setActive(-1);
            return setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && matches.length) {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, matches.length - 1));
            } else if (e.key === 'ArrowUp' && matches.length) {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === 'Escape') setOpen(false);
            else if ((e.key === 'Enter' || e.key === 'Tab') && (text.trim() || active >= 0)) {
              e.preventDefault();
              add(active >= 0 && matches[active] ? matches[active].label : text);
            } else if (e.key === 'Backspace' && !text && value.length) remove(value[value.length - 1]);
          }}
          onBlur={() => text.trim() && add(text)}
          placeholder={value.length ? '' : placeholder}
          className="h-7 min-w-[120px] flex-1 bg-transparent text-sm text-brand-dark outline-none placeholder:text-brand-gray-muted"
        />
      </div>
      {open && suggest && (matches.length > 0 || sugg.data?.didYouMean) && (
        <div className="pop-in absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-brand-border bg-white p-1.5 shadow-[var(--shadow-hover)]">
          <SuggestGroups items={matches} term={term} active={active} onPick={(it) => add(it.label)} didYouMean={sugg.data?.didYouMean} onDidYouMean={(w) => add(w)} />
          {text.trim() && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(text)} className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-brand-border px-2 py-2 text-left text-sm text-brand-blue hover:bg-brand-tint">
              <Icon name="add" size={16} /> Add “{text.trim()}”
            </button>
          )}
        </div>
      )}
      </div>
    </Field>
  );
};

export { default as LocationField } from './LocationField';

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
