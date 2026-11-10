import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Icon } from '../ui/feedback';
import SuggestGroups, { flattenGroups } from './SuggestGroups';
import useDebounce from '../../hooks/useDebounce';
import { searchApi } from '../../services';

/**
 * Company / recruiter search: typing filters the list (value / onChange) and shows matching companies;
 * picking one opens its page. Arrow keys + Enter pick, Esc closes.
 */
const CompanySearchBox = ({ value, onChange, placeholder = 'Search companies', type }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ref = useRef(null);
  const term = useDebounce(String(value || '').trim(), 200);
  const q = useQuery({
    queryKey: ['search-suggest', 'companies', term],
    queryFn: () => searchApi.suggest(term, 'companies', 8),
    enabled: open && term.length >= 2,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    const down = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, []);
  const items = term.length >= 2 ? flattenGroups(q.data?.groups, (it) => (type === 'consultancy' ? !it.path?.startsWith('/recruiters') : type === 'company' ? !it.path?.startsWith('/companies') : false), 8) : [];
  const pick = (it) => {
    setOpen(false);
    if (it.path) navigate(it.path);
  };

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <div className="field-control flex h-11 items-center gap-2 px-3">
        <Icon name="search" size={18} className="shrink-0 text-brand-gray-muted" />
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && items.length) {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === 'Enter') {
              if (active >= 0 && items[active]) pick(items[active]);
              else setOpen(false);
            } else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={open}
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-brand-dark outline-none placeholder:text-brand-gray-muted"
        />
        {value && (
          <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="rounded-full p-0.5 text-brand-gray-muted hover:text-brand-dark">
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
      {open && items.length > 0 && (
        <div className="pop-in absolute z-30 mt-1.5 max-h-80 w-full overflow-y-auto rounded-xl border border-brand-border bg-white p-1.5 shadow-[var(--shadow-hover)]">
          <SuggestGroups items={items} term={term} active={active} onPick={pick} />
        </div>
      )}
    </div>
  );
};

export default CompanySearchBox;
