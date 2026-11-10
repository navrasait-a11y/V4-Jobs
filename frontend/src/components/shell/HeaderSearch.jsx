import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Icon } from '../ui/feedback';
import SuggestGroups, { flattenGroups } from '../common/SuggestGroups';
import useDebounce from '../../hooks/useDebounce';
import { searchApi, talentApi } from '../../services';

const CONFIG = {
  employer: {
    placeholder: 'Search candidates: skills, title, name, mobile',
    scope: 'candidates',
    to: (q) => `/employer/candidates?keywords=${encodeURIComponent(q)}`,
    advanced: '/employer/candidates',
    advancedLabel: 'Advanced candidate search',
  },
  candidate: {
    placeholder: 'Search jobs: title, skill, company',
    scope: 'jobs',
    to: (q) => `/jobs?keywords=${encodeURIComponent(q)}`,
    advanced: '/jobs',
    advancedLabel: 'Advanced job search',
  },
};

/**
 * PRD "Search Bar Shortcut": header search that expands on desktop. Shows recent searches (employers),
 * then live grouped suggestions while typing; arrow keys + Enter pick, Esc closes.
 */
const HeaderSearch = ({ role }) => {
  const cfg = CONFIG[role];
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ref = useRef(null);
  const term = useDebounce(text.trim(), 180);
  const recent = useQuery({ queryKey: ['header-recent-searches'], queryFn: () => talentApi.recentSearches(), enabled: open && role === 'employer', staleTime: 60 * 1000 });
  const sugg = useQuery({
    queryKey: ['search-suggest', cfg?.scope, term],
    queryFn: () => searchApi.suggest(term, cfg.scope, 5),
    enabled: Boolean(cfg) && open && term.length >= 2,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (!cfg) return null;
  const go = (q) => {
    const v = String(q || '').trim();
    if (!v) return;
    setOpen(false);
    setText('');
    setActive(-1);
    navigate(cfg.to(v));
  };
  const typing = term.length >= 2;
  const items = typing ? [] : (recent.data || []).filter((r) => r.summary).slice(0, 6);
  const matches = typing ? flattenGroups(sugg.data?.groups, () => false, 9) : [];
  // A company suggestion opens that company's page for job seekers; everything else runs a search.
  const pick = (it) => {
    if (it.group?.key !== 'companies') searchApi.track(it.label, cfg.scope).catch(() => {});
    if (it.group?.key !== 'companies' || role !== 'candidate' || !it.path) return go(it.label);
    setOpen(false);
    setText('');
    return navigate(it.path);
  };
  const count = items.length + matches.length;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') return setOpen(false);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      return setActive((a) => Math.min(a + 1, count - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      return setActive((a) => Math.max(a - 1, -1));
    }
    if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      return active < items.length ? go(items[active].summary) : pick(matches[active - items.length]);
    }
    return undefined;
  };

  return (
    <div ref={ref} className="relative hidden md:block">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(text);
        }}
        className={clsx('flex h-9 items-center gap-1.5 rounded-full border bg-brand-tint px-3 transition-all', open ? 'w-80 border-brand-blue bg-white shadow-[0_0_0_3px_var(--color-brand-blue-tint)] lg:w-96' : 'w-56 border-brand-border lg:w-64')}
      >
        <Icon name="search" size={18} className="text-brand-gray-muted" />
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={cfg.placeholder}
          aria-label={cfg.placeholder}
          role="combobox"
          aria-expanded={open}
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-brand-dark outline-none placeholder:text-brand-gray-muted"
        />
        {text && (
          <button type="button" aria-label="Clear search" onClick={() => setText('')} className="rounded-full p-0.5 text-brand-gray-muted hover:text-brand-dark">
            <Icon name="close" size={16} />
          </button>
        )}
      </form>
      {open && (
        <div className="absolute right-0 top-11 z-40 max-h-[70vh] w-full overflow-y-auto rounded-xl border border-brand-border bg-white p-1.5 shadow-[var(--shadow-hover)]">
          {items.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-brand-gray-muted">Recent searches</p>
              {items.map((r, i) => (
                <button key={r._id} type="button" onClick={() => go(r.summary)} className={clsx('flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-brand-dark', active === i ? 'bg-brand-blue-tint' : 'hover:bg-brand-tint')}>
                  <Icon name="history" size={16} className="text-brand-gray-muted" />
                  <span className="truncate">{r.summary}</span>
                </button>
              ))}
            </>
          )}
          {typing && <SuggestGroups items={matches} term={term} active={active} offset={items.length} onPick={pick} didYouMean={sugg.data?.didYouMean} onDidYouMean={go} />}
          {typing && (
            <button type="button" onClick={() => go(text)} className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-brand-border px-2 py-2 text-left text-sm text-brand-dark hover:bg-brand-tint">
              <Icon name="search" size={16} className="text-brand-blue" />
              <span className="truncate">
                Search for <b>“{text.trim()}”</b>
              </span>
            </button>
          )}
          <Link to={cfg.advanced} onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-brand-blue hover:bg-brand-blue-tint">
            <Icon name="tune" size={16} /> {cfg.advancedLabel}
          </Link>
        </div>
      )}
    </div>
  );
};

export default HeaderSearch;
