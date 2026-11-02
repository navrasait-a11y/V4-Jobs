import React, { useEffect, useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import Button from './Button';
import { Icon, Modal, Spinner } from './feedback';
import { Field } from './form';
import useDebounce from '../../hooks/useDebounce';
import { lookupApi } from '../../services';

/** The two-level master data lists from the client's Excel ("Upto 5 Multiple Selection & 20 Sub Selection"). */
export const HIERARCHIES = {
  industry: { parentType: 'industry', childType: 'sub_industry', parentLabel: 'industry', childLabel: 'sub industry', title: 'Industry and sub industry' },
  department: { parentType: 'department', childType: 'department_function', parentLabel: 'department', childLabel: 'function', title: 'Department and functions' },
};

const Check = ({ on }) => (
  <span className={clsx('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-brand-blue bg-brand-blue text-white' : 'border-[#AEB7C4] bg-white')}>
    {on && <Icon name="check" size={12} />}
  </span>
);

/**
 * Pick up to `maxParents` parents (industries / departments) and up to `maxChildren` of their sub
 * options. `value` is `{ parents: string[], children: string[] }`.
 */
const HierarchyField = ({ kind = 'industry', label, hint, required, error, value, onChange, maxParents = 5, maxChildren = 20 }) => {
  const id = useId();
  const cfg = HIERARCHIES[kind];
  const parents = value?.parents || [];
  const children = value?.children || [];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ parents, children });
  const [active, setActive] = useState('');
  const [parentQ, setParentQ] = useState('');
  const [childQ, setChildQ] = useState('');
  const parentTerm = useDebounce(parentQ, 200);

  const parentList = useQuery({
    queryKey: ['hierarchy-parents', cfg.parentType, parentTerm],
    queryFn: () => lookupApi.search(cfg.parentType, { q: parentTerm || undefined, limit: 100 }),
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });
  // Sub options of every chosen parent, so each saved sub option can be shown under its parent.
  const chosenKey = draft.parents.join('|');
  const childList = useQuery({
    queryKey: ['hierarchy-children', cfg.childType, chosenKey, active],
    queryFn: () => lookupApi.search(cfg.childType, { parents: [...new Set([...draft.parents, active].filter(Boolean))].join('|'), limit: 500 }),
    enabled: open && Boolean(chosenKey || active),
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (!open) return;
    setDraft({ parents, children });
    setActive(parents[0] || '');
    setParentQ('');
    setChildQ('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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
        toast.error(`You can choose up to ${maxParents} ${cfg.parentLabel === 'industry' ? 'industries' : 'departments'}`);
        return d;
      }
      return { ...d, parents: [...d.parents, name] };
    });
    setActive(name);
    setChildQ('');
  };
  const toggleChild = (name) =>
    setDraft((d) => {
      if (d.children.includes(name)) return { ...d, children: d.children.filter((c) => c !== name) };
      if (d.children.length >= maxChildren) {
        toast.error(`You can choose up to ${maxChildren} ${cfg.childLabel === 'function' ? 'functions' : 'sub industries'}`);
        return d;
      }
      return { parents: d.parents.includes(active) ? d.parents : [...d.parents, active].slice(0, maxParents), children: [...d.children, name] };
    });

  const activeChildren = (byParent[active] || []).filter((c) => !childQ || c.toLowerCase().includes(childQ.toLowerCase()));
  const countFor = (p) => (byParent[p] || []).filter((c) => draft.children.includes(c)).length;
  const removeParent = (name) => onChange({ parents: parents.filter((p) => p !== name), children });
  const removeChild = (name) => onChange({ parents, children: children.filter((c) => c !== name) });

  return (
    <Field label={label} required={required} error={error} hint={hint || `Up to ${maxParents} ${cfg.parentLabel === 'industry' ? 'industries' : 'departments'} and ${maxChildren} ${cfg.childLabel === 'function' ? 'functions' : 'sub industries'}`} htmlFor={id}>
      <div className={clsx('rounded-[var(--radius-input)] border bg-white p-2', error ? 'border-brand-red' : 'border-[#D5DBE4]')}>
        {parents.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {parents.map((p) => (
              <span key={p} className="inline-flex items-center gap-1 rounded-md bg-brand-blue-tint px-2 py-1 text-xs font-semibold text-brand-blue">
                {p}
                <button type="button" aria-label={`Remove ${p}`} onClick={() => removeParent(p)}>
                  <Icon name="close" size={13} />
                </button>
              </span>
            ))}
            {children.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-md border border-brand-border px-2 py-1 text-xs text-brand-dark">
                {c}
                <button type="button" aria-label={`Remove ${c}`} onClick={() => removeChild(c)}>
                  <Icon name="close" size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
        <button id={id} type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-sm text-brand-gray-muted hover:text-brand-dark">
          <span>{parents.length ? `Change ${cfg.parentLabel === 'industry' ? 'industries' : 'departments'}` : `Choose ${cfg.parentLabel} and ${cfg.childLabel}`}</span>
          <Icon name="expand_more" size={20} />
        </button>
      </div>

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={cfg.title}
          subtitle={`${draft.parents.length}/${maxParents} ${cfg.parentLabel === 'industry' ? 'industries' : 'departments'} · ${draft.children.length}/${maxChildren} ${cfg.childLabel === 'function' ? 'functions' : 'sub industries'}`}
          size="xl"
          footer={
            <>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ parents: [], children: [] })}>
                Clear all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primaryBlue"
                onClick={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                Done
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
            <div className="min-w-0">
              <input value={parentQ} onChange={(e) => setParentQ(e.target.value)} placeholder={`Search ${cfg.parentLabel}`} aria-label={`Search ${cfg.parentLabel}`} className="field-control mb-2 h-10 w-full px-3 text-sm" />
              <ul className="max-h-[42vh] overflow-y-auto rounded-lg border border-brand-border md:max-h-[52vh]">
                {parentList.isPending && (
                  <li className="p-4">
                    <Spinner size={18} className="mx-auto" />
                  </li>
                )}
                {(parentList.data || []).map((p) => {
                  const on = draft.parents.includes(p.name);
                  const n = countFor(p.name);
                  return (
                    <li key={p._id} className={clsx('flex items-center gap-2 border-b border-brand-border px-3 py-2 last:border-0', active === p.name && 'bg-brand-tint')}>
                      <button type="button" aria-label={on ? `Unselect ${p.name}` : `Select ${p.name}`} aria-pressed={on} onClick={() => toggleParent(p.name)}>
                        <Check on={on} />
                      </button>
                      <button type="button" onClick={() => setActive(p.name)} className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm text-brand-dark">
                        <span className="min-w-0">{p.name}</span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-brand-gray-muted">
                          {n > 0 && <span className="rounded-full bg-brand-blue px-1.5 text-[11px] font-semibold text-white">{n}</span>}
                          <Icon name="chevron_right" size={18} />
                        </span>
                      </button>
                    </li>
                  );
                })}
                {parentList.data?.length === 0 && <li className="p-4 text-center text-sm text-brand-gray">No match. Try another word.</li>}
              </ul>
            </div>
            <div className="min-w-0">
              {active ? (
                <>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 text-sm font-semibold text-brand-dark">{active}</p>
                    <input value={childQ} onChange={(e) => setChildQ(e.target.value)} placeholder={`Search ${cfg.childLabel}`} aria-label={`Search ${cfg.childLabel}`} className="field-control h-9 w-full px-3 text-sm sm:w-56" />
                  </div>
                  {childList.isFetching && !byParent[active] ? (
                    <Spinner size={20} className="mx-auto mt-6" />
                  ) : (
                    <div className="grid max-h-[42vh] grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2 md:max-h-[50vh]">
                      {activeChildren.map((c) => {
                        const on = draft.children.includes(c);
                        return (
                          <button key={c} type="button" onClick={() => toggleChild(c)} aria-pressed={on} className={clsx('flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm', on ? 'bg-brand-blue-tint text-brand-blue' : 'text-brand-dark hover:bg-brand-tint')}>
                            <span className="mt-0.5">
                              <Check on={on} />
                            </span>
                            <span className="min-w-0">{c}</span>
                          </button>
                        );
                      })}
                      {!activeChildren.length && <p className="col-span-full py-6 text-center text-sm text-brand-gray">No {cfg.childLabel} matches.</p>}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full min-h-[160px] flex-col items-center justify-center rounded-lg bg-brand-tint p-6 text-center text-sm text-brand-gray">
                  <Icon name="touch_app" size={28} className="mb-2 text-brand-blue" />
                  Choose a {cfg.parentLabel} on the left to see its {cfg.childLabel === 'function' ? 'functions' : 'sub industries'}.
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </Field>
  );
};

export default HierarchyField;
