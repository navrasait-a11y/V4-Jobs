import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Icon } from '../ui/feedback';
import { talentApi } from '../../services';

const CONFIG = {
  employer: {
    placeholder: 'Search candidates: skills, title, name, mobile',
    to: (q) => `/employer/candidates?keywords=${encodeURIComponent(q)}`,
    advanced: '/employer/candidates',
    advancedLabel: 'Advanced candidate search',
  },
  candidate: {
    placeholder: 'Search jobs: title, skill, company',
    to: (q) => `/jobs?keywords=${encodeURIComponent(q)}`,
    advanced: '/jobs',
    advancedLabel: 'Advanced job search',
  },
};

/**
 * PRD "Search Bar Shortcut": header search that expands on desktop, with recent searches
 * (employers) and a link to the full filter page.
 */
const HeaderSearch = ({ role }) => {
  const cfg = CONFIG[role];
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const recent = useQuery({ queryKey: ['header-recent-searches'], queryFn: () => talentApi.recentSearches(), enabled: open && role === 'employer', staleTime: 60 * 1000 });
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (!cfg) return null;
  const go = (q) => {
    const v = q.trim();
    if (!v) return;
    setOpen(false);
    setText('');
    navigate(cfg.to(v));
  };
  const items = (recent.data || []).filter((r) => r.summary).slice(0, 6);
  return (
    <div ref={ref} className="relative hidden md:block">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(text);
        }}
        className={clsx('flex h-9 items-center gap-1.5 rounded-full border border-brand-border bg-brand-tint px-3 transition-all', open ? 'w-80 lg:w-96' : 'w-56 lg:w-64')}
      >
        <Icon name="search" size={18} className="text-brand-gray-muted" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder={cfg.placeholder}
          aria-label={cfg.placeholder}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-brand-dark outline-none placeholder:text-brand-gray-muted"
        />
      </form>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-full rounded-xl border border-brand-border bg-white py-2 shadow-[var(--shadow-hover)]">
          {items.length > 0 && (
            <>
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase text-brand-gray-muted">Recent searches</p>
              {items.map((r) => (
                <button key={r._id} type="button" onClick={() => go(r.summary)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-brand-dark hover:bg-brand-blue-tint">
                  <Icon name="history" size={16} className="text-brand-gray-muted" />
                  <span className="truncate">{r.summary}</span>
                </button>
              ))}
            </>
          )}
          <Link to={cfg.advanced} onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-brand-blue hover:bg-brand-blue-tint">
            <Icon name="tune" size={16} /> {cfg.advancedLabel}
          </Link>
        </div>
      )}
    </div>
  );
};

export default HeaderSearch;
