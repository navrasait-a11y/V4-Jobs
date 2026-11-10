import React from 'react';
import { clsx } from 'clsx';
import { Icon } from '../ui/feedback';

/** Text with the typed part in bold. */
export const Highlight = ({ text = '', term = '' }) => {
  const t = String(term).trim();
  const s = String(text);
  const i = t ? s.toLowerCase().indexOf(t.toLowerCase()) : -1;
  if (i < 0) return s;
  return (
    <>
      {s.slice(0, i)}
      <b className="font-semibold text-brand-dark">{s.slice(i, i + t.length)}</b>
      {s.slice(i + t.length)}
    </>
  );
};

/** Flattens API groups into one list (for keyboard navigation), keeping the group on each item. */
export const flattenGroups = (groups = [], skip = () => false, max = 10) => {
  const out = [];
  for (const g of groups) for (const item of g.items || []) if (!skip(item) && out.length < max) out.push({ ...item, group: g });
  return out;
};

const initials = (name = '') =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/**
 * Grouped suggestion rows (Job titles / Skills / Companies / Locations) with icons, the typed part in
 * bold and a count on the right. `items` is the flat list from flattenGroups; `offset` shifts the
 * active index when other rows (recent searches) come first.
 */
const SuggestGroups = ({ items, term, active = -1, offset = 0, onPick, didYouMean, onDidYouMean }) => {
  if (!items.length && !didYouMean) return null;
  return (
    <div role="listbox">
      {didYouMean && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onDidYouMean?.(didYouMean)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-brand-gray hover:bg-brand-tint">
          <Icon name="spellcheck" size={18} className="shrink-0 text-brand-orange" />
          <span>
            Did you mean <b className="text-brand-blue">{didYouMean}</b>?
          </span>
        </button>
      )}
      {items.map((it, i) => {
        const header = i === 0 || items[i - 1].group.key !== it.group.key;
        const isActive = i + offset === active;
        return (
          <React.Fragment key={`${it.group.key}-${it.label}`}>
            {header && <h3 className="px-2 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-brand-gray-muted">{it.group.label}</h3>}
            <button
              type="button"
              role="option"
              aria-selected={isActive}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(it)}
              className={clsx('flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm text-brand-gray transition-colors', isActive ? 'bg-brand-blue-tint' : 'hover:bg-brand-tint')}
            >
              {it.group.key === 'companies' ? (
                it.logo ? (
                  <img src={it.logo} alt="" className="h-6 w-6 shrink-0 rounded border border-brand-border object-contain" />
                ) : (
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-brand-blue-tint text-[10px] font-bold text-brand-blue">{initials(it.label)}</span>
                )
              ) : (
                <Icon name={it.group.icon || 'search'} size={18} className="shrink-0 text-brand-gray-muted" />
              )}
              <span className="min-w-0 flex-1 truncate">
                <Highlight text={it.label} term={term} />
              </span>
              {it.verified && <Icon name="verified" size={15} className="shrink-0 text-brand-blue" />}
              {it.meta && <span className="shrink-0 text-xs text-brand-gray-muted">{it.meta}</span>}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default SuggestGroups;
