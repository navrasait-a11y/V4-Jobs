import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import Button from './Button';
import { Icon, Spinner } from './feedback';
import { Field } from './form';
import useDebounce from '../../hooks/useDebounce';
import useMediaQuery from '../../hooks/useMediaQuery';
import { lookupApi } from '../../services';

/** The two-level master data lists from the client's Excel ("Upto 5 Multiple Selection & 20 Sub Selection"). */
export const HIERARCHIES = {
  industry: { parentType: 'industry', childType: 'sub_industry', parentLabel: 'industry', parentPlural: 'industries', childLabel: 'sub industry', childPlural: 'sub industries', title: 'Industry and sub industry' },
  department: { parentType: 'department', childType: 'department_function', parentLabel: 'department', parentPlural: 'departments', childLabel: 'function', childPlural: 'functions', title: 'Department and functions' },
};

const Check = ({ on, partial }) => (
  <span className={clsx('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-[1.5px] transition-colors', on || partial ? 'border-brand-blue bg-brand-blue text-white' : 'border-[#B4BCC8] bg-white')}>
    {on && <Icon name="check" size={13} />}
    {!on && partial && <span className="h-0.5 w-2 rounded bg-white" />}
  </span>
);

const SearchBox = ({ value, onChange, placeholder, autoFocus }) => (
  <div className="relative">
    <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-muted" />
    <input
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-10 w-full rounded-lg border border-[#D5DBE4] bg-white pl-9 pr-8 text-sm outline-none transition focus:border-brand-blue focus:shadow-[0_0_0_3px_var(--color-brand-blue-tint)]"
    />
    {value && (
      <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-brand-gray-muted hover:text-brand-dark">
        <Icon name="close" size={16} />
      </button>
    )}
  </div>
);

/** Sub option list (shared by the desktop side panel and the phone accordion). */
const ChildList = ({ items, selected, onToggle, loading, empty, columns }) => {
  if (loading) return <Spinner size={20} className="mx-auto my-6" />;
  if (!items.length) return <p className="px-3 py-6 text-center text-sm text-brand-gray">{empty}</p>;
  return (
    <ul className={clsx('grid gap-0.5', columns && 'sm:grid-cols-2')}>
      {items.map((c) => {
        const on = selected.includes(c);
        return (
          <li key={c}>
            <button type="button" role="checkbox" aria-checked={on} onClick={() => onToggle(c)} className={clsx('flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors', on ? 'bg-brand-blue-tint/70 font-medium text-brand-blue' : 'text-brand-dark hover:bg-brand-tint')}>
              <span className="mt-px">
                <Check on={on} />
              </span>
              <span className="min-w-0">{c}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

/**
 * Industry / department picker (Naukri style).
 *  - Desktop: a parent panel; choosing a parent slides out a second panel on its right with its sub options.
 *  - Phone: a full-screen sheet; tapping a parent opens its sub options right below it (accordion).
 * Up to `maxParents` parents and `maxChildren` sub options. `value` is `{ parents: string[], children: string[] }`.
 */
const HierarchyField = ({ kind = 'industry', label, hint, required, error, value, onChange, maxParents = 5, maxChildren = 20 }) => {
  const id = useId();
  const cfg = HIERARCHIES[kind];
  const desktop = useMediaQuery('(min-width: 768px)');
  const parents = value?.parents || [];
  const children = value?.children || [];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ parents, children });
  const [active, setActive] = useState('');
  const [parentQ, setParentQ] = useState('');
  const [childQ, setChildQ] = useState('');
  const parentTerm = useDebounce(parentQ, 200);
  const activeRowRef = useRef(null);

  const parentList = useQuery({
    queryKey: ['hierarchy-parents', cfg.parentType, parentTerm],
    queryFn: () => lookupApi.search(cfg.parentType, { q: parentTerm || undefined, limit: 100 }),
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });
  // Sub options of every chosen parent plus the open one, so counts and chips stay right.
  const wanted = [...new Set([...draft.parents, active].filter(Boolean))].sort().join('|');
  const childList = useQuery({
    queryKey: ['hierarchy-children', cfg.childType, wanted],
    queryFn: () => lookupApi.search(cfg.childType, { parents: wanted, limit: 500 }),
    enabled: open && Boolean(wanted),
    staleTime: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  // Which saved sub option belongs to which parent, for the grouped chips in the closed field.
  const savedKey = [...parents].sort().join('|');
  const savedChildren = useQuery({
    queryKey: ['hierarchy-children', cfg.childType, savedKey],
    queryFn: () => lookupApi.search(cfg.childType, { parents: savedKey, limit: 500 }),
    enabled: Boolean(savedKey) && children.length > 0,
    staleTime: 10 * 60 * 1000,
  });
  const savedParentOf = useMemo(() => new Map((savedChildren.data || []).map((c) => [c.name, c.parentName])), [savedChildren.data]);

  useEffect(() => {
    if (!open) return undefined;
    setDraft({ parents, children });
    setActive(desktop ? parents[0] || '' : '');
    setParentQ('');
    setChildQ('');
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!desktop && active) setTimeout(() => activeRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
  }, [active, desktop]);

  const byParent = useMemo(() => {
    const map = {};
    for (const c of childList.data || []) (map[c.parentName] ||= []).push(c.name);
    return map;
  }, [childList.data]);

  const toggleParent = (name) => {
    setDraft((d) => {
      if (d.parents.includes(name)) {
        const own = new Set(byParent[name] || []);
        const others = new Set(d.parents.filter((p) => p !== name).flatMap((p) => byParent[p] || []));
        return { parents: d.parents.filter((p) => p !== name), children: d.children.filter((c) => !own.has(c) || others.has(c)) };
      }
      if (d.parents.length >= maxParents) {
        toast.error(`You can choose up to ${maxParents} ${cfg.parentPlural}`);
        return d;
      }
      return { ...d, parents: [...d.parents, name] };
    });
  };
  const toggleChild = (parent) => (name) =>
    setDraft((d) => {
      if (d.children.includes(name)) return { ...d, children: d.children.filter((c) => c !== name) };
      if (d.children.length >= maxChildren) {
        toast.error(`You can choose up to ${maxChildren} ${cfg.childPlural}`);
        return d;
      }
      if (!d.parents.includes(parent) && d.parents.length >= maxParents) {
        toast.error(`You can choose up to ${maxParents} ${cfg.parentPlural}`);
        return d;
      }
      return { parents: d.parents.includes(parent) ? d.parents : [...d.parents, parent], children: [...d.children, name] };
    });

  const openParent = (name) => {
    setActive((a) => (!desktop && a === name ? '' : name));
    setChildQ('');
  };
  const childrenOf = (p) => (byParent[p] || []).filter((c) => !childQ || c.toLowerCase().includes(childQ.toLowerCase()));
  const countFor = (p) => (byParent[p] || []).filter((c) => draft.children.includes(c)).length;
  const loadingChildren = (p) => childList.isFetching && !byParent[p];

  // Saved selection shown in the field, grouped like Naukri: parent with its picked sub options.
  const removeParent = (name) => onChange({ parents: parents.filter((p) => p !== name), children });
  const removeChild = (name) => onChange({ parents, children: children.filter((c) => c !== name) });
  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  const counter = `${draft.parents.length}/${maxParents} ${cfg.parentPlural} · ${draft.children.length}/${maxChildren} ${cfg.childPlural}`;
  const header = (
    <div className="flex items-start justify-between gap-3 border-b border-brand-border px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-brand-dark">{cfg.title}</h2>
        <p className="mt-0.5 text-xs text-brand-gray">{counter}</p>
      </div>
      <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="-mr-1 rounded-full p-1.5 text-brand-gray hover:bg-brand-tint hover:text-brand-dark">
        <Icon name="close" size={20} />
      </button>
    </div>
  );
  const footer = (
    <div className="flex items-center gap-2 border-t border-brand-border bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <button type="button" onClick={() => setDraft({ parents: [], children: [] })} disabled={!draft.parents.length && !draft.children.length} className="text-sm font-semibold text-brand-blue hover:underline disabled:text-brand-gray-muted disabled:no-underline">
        Clear all
      </button>
      <span className="ml-auto hidden text-xs text-brand-gray sm:inline">{draft.parents.length + draft.children.length} selected</span>
      <Button type="button" size="sm" variant="primaryBlue" onClick={apply} className="ml-auto min-w-[110px] sm:ml-0">
        Done
      </Button>
    </div>
  );

  const parentRows = (
    <ul className="divide-y divide-brand-border">
      {parentList.isPending && (
        <li className="p-6">
          <Spinner size={20} className="mx-auto" />
        </li>
      )}
      {(parentList.data || []).map((p) => {
        const on = draft.parents.includes(p.name);
        const n = countFor(p.name);
        const isActive = active === p.name;
        return (
          <li key={p._id} ref={isActive ? activeRowRef : undefined}>
            <div className={clsx('flex items-center gap-1 pl-3 pr-2 transition-colors', isActive ? 'bg-brand-blue-tint/60' : 'hover:bg-brand-tint')}>
              <button type="button" role="checkbox" aria-checked={on} aria-label={`${on ? 'Unselect' : 'Select'} ${p.name}`} onClick={() => toggleParent(p.name)} className="p-1.5">
                <Check on={on} partial={!on && n > 0} />
              </button>
              <button type="button" aria-expanded={isActive} onClick={() => openParent(p.name)} className="flex min-h-[48px] min-w-0 flex-1 items-center justify-between gap-2 py-2 text-left text-sm">
                <span className={clsx('min-w-0', on || isActive ? 'font-semibold text-brand-dark' : 'text-brand-dark')}>{p.name}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {n > 0 && <span className="rounded-full bg-brand-blue px-1.5 py-px text-[11px] font-bold text-white">{n}</span>}
                  <Icon name={desktop ? 'chevron_right' : 'expand_more'} size={20} className={clsx('text-brand-gray-muted transition-transform duration-200', !desktop && isActive && 'rotate-180', desktop && isActive && 'text-brand-blue')} />
                </span>
              </button>
            </div>
            {!desktop && isActive && (
              <div className="animate-fade-in border-t border-brand-border bg-[#FAFBFD] px-3 pb-3 pt-2">
                {(byParent[p.name]?.length || 0) > 8 && (
                  <div className="mb-2">
                    <SearchBox value={childQ} onChange={setChildQ} placeholder={`Search ${cfg.childLabel}`} />
                  </div>
                )}
                <ChildList items={childrenOf(p.name)} selected={draft.children} onToggle={toggleChild(p.name)} loading={loadingChildren(p.name)} empty={`No ${cfg.childLabel} found`} />
              </div>
            )}
          </li>
        );
      })}
      {parentList.data?.length === 0 && <li className="p-6 text-center text-sm text-brand-gray">No {cfg.parentLabel} matches “{parentQ}”.</li>}
    </ul>
  );

  const picker = desktop ? (
    // Desktop: parent panel + sliding side panel.
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-brand-ink/45 p-6 animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label={cfg.title} className={clsx('flex max-h-[min(640px,88vh)] flex-col overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-modal)] transition-[width] duration-300 ease-out', active ? 'w-[min(880px,94vw)]' : 'w-[min(440px,94vw)]')}>
        {header}
        <div className="flex min-h-0 flex-1">
          <div className={clsx('flex min-h-0 flex-col', active ? 'w-[400px] shrink-0 border-r border-brand-border' : 'w-full')}>
            <div className="p-3">
              <SearchBox value={parentQ} onChange={setParentQ} placeholder={`Search ${cfg.parentLabel}`} autoFocus />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{parentRows}</div>
          </div>
          {active && (
            <div key={active} className="flex min-h-0 min-w-0 flex-1 animate-fade-in flex-col bg-[#FAFBFD]">
              <div className="flex items-center gap-2 border-b border-brand-border px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-brand-dark">{active}</p>
                  <p className="text-xs text-brand-gray">Pick the {cfg.childPlural} you want (optional)</p>
                </div>
                <button type="button" aria-label="Close sub list" onClick={() => setActive('')} className="rounded-full p-1 text-brand-gray hover:bg-white hover:text-brand-dark">
                  <Icon name="close" size={18} />
                </button>
              </div>
              <div className="px-4 pt-3">
                <SearchBox value={childQ} onChange={setChildQ} placeholder={`Search ${cfg.childLabel}`} />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                <ChildList items={childrenOf(active)} selected={draft.children} onToggle={toggleChild(active)} loading={loadingChildren(active)} empty={`No ${cfg.childLabel} found`} columns />
              </div>
            </div>
          )}
        </div>
        {footer}
      </div>
    </div>
  ) : (
    // Phone: full-screen sheet with an accordion of sub options under each parent.
    <div role="dialog" aria-modal="true" aria-label={cfg.title} className="fixed inset-0 z-[70] flex flex-col bg-white sheet-up">
      {header}
      <div className="border-b border-brand-border p-3">
        <SearchBox value={parentQ} onChange={setParentQ} placeholder={`Search ${cfg.parentLabel}`} />
      </div>
      {draft.parents.length > 0 && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-brand-border px-3 py-2">
          {draft.parents.map((p) => (
            <button key={p} type="button" onClick={() => toggleParent(p)} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-blue-tint px-2.5 py-1 text-xs font-semibold text-brand-blue">
              {p}
              {countFor(p) > 0 && <span className="text-brand-blue/70">({countFor(p)})</span>}
              <Icon name="close" size={13} />
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">{parentRows}</div>
      {footer}
    </div>
  );

  return (
    <Field label={label} required={required} error={error} hint={hint || `Up to ${maxParents} ${cfg.parentPlural} and ${maxChildren} ${cfg.childPlural}`} htmlFor={id}>
      <div className={clsx('field-control px-2 py-1.5', error && 'is-invalid')}>
        {parents.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5 p-0.5">
            {parents.map((p) => {
              const subs = children.filter((c) => savedParentOf.get(c) === p);
              return (
                <span key={p} className="inline-flex max-w-full items-center gap-1 rounded-full border border-brand-blue/30 bg-brand-blue-tint py-0.5 pl-2.5 pr-1 text-xs font-semibold text-brand-blue">
                  <span className="truncate">{p}</span>
                  {subs.length > 0 && <span className="font-medium text-brand-blue/70">+{subs.length}</span>}
                  <button type="button" aria-label={`Remove ${p}`} onClick={() => removeParent(p)} className="rounded-full p-0.5 hover:bg-brand-blue hover:text-white">
                    <Icon name="close" size={12} />
                  </button>
                </span>
              );
            })}
            {children
              .filter((c) => !parents.includes(savedParentOf.get(c)))
              .map((c) => (
                <span key={c} className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#D5DBE4] bg-white py-0.5 pl-2.5 pr-1 text-xs text-brand-dark">
                  <span className="truncate">{c}</span>
                  <button type="button" aria-label={`Remove ${c}`} onClick={() => removeChild(c)} className="rounded-full p-0.5 hover:bg-brand-tint">
                    <Icon name="close" size={12} />
                  </button>
                </span>
              ))}
          </div>
        )}
        <button id={id} type="button" onClick={() => setOpen(true)} className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-1.5 text-left text-sm text-brand-gray-muted hover:text-brand-dark">
          <span>{parents.length ? `Add or change ${cfg.parentPlural}` : `Choose ${cfg.parentLabel} and ${cfg.childLabel}`}</span>
          <Icon name="expand_more" size={20} />
        </button>
      </div>
      {open && createPortal(picker, document.body)}
    </Field>
  );
};

export default HierarchyField;
