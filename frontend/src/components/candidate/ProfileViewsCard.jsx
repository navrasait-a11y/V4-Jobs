import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Section } from '../ui/data';
import { Icon } from '../ui/feedback';
import { candidateApi } from '../../services';
import { formatNumber, timeAgo } from '../../utils/format';

const initials = (name = '') =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/** Compact "Who viewed your profile" card: 30-day count, latest viewers (locked ones blurred), link to the full page. */
const ProfileViewsCard = ({ className = '' }) => {
  const q = useQuery({ queryKey: ['profile-views', { days: 30, type: 'all', page: 1, limit: 5 }], queryFn: () => candidateApi.profileViews({ days: 30, limit: 5 }), staleTime: 60 * 1000 });
  const d = q.data;
  const s = d?.summary;
  return (
    <Section
      title="Who viewed your profile"
      className={className}
      actions={
        <Link to="/candidate/profile-views" className="text-xs font-semibold text-brand-blue hover:underline">
          See all →
        </Link>
      }
    >
      {q.isPending ? (
        <div className="h-24 animate-pulse rounded-lg bg-brand-tint" />
      ) : (
        <>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-brand-dark">{formatNumber(s?.total || 0)}</p>
            <p className="pb-1 text-xs text-brand-gray">views in 30 days</p>
            {s?.change !== null && s?.change !== undefined && (
              <span className={`mb-1 ml-auto text-xs font-semibold ${s.change >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                {s.change >= 0 ? '▲' : '▼'} {Math.abs(s.change)}%
              </span>
            )}
          </div>
          {d?.viewers?.length ? (
            <ul className="mt-3 space-y-2.5">
              {d.viewers.slice(0, 4).map((v) => (
                <li key={v.key} className="flex items-center gap-2.5">
                  {v.locked || v.anonymous ? (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand-gray-muted">
                      <Icon name={v.anonymous ? 'visibility_off' : 'lock'} size={16} />
                    </span>
                  ) : v.organization?.logo ? (
                    <img src={v.organization.logo} alt="" className="h-8 w-8 shrink-0 rounded-lg border border-brand-border object-contain p-0.5" />
                  ) : (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-blue-tint text-[11px] font-bold text-brand-blue">{initials(v.organization?.name)}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    {v.locked ? (
                      <span aria-label="Hidden company" className="block select-none truncate text-sm font-medium text-brand-dark blur-[4px]">
                        Hidden Company Ltd
                      </span>
                    ) : (
                      <span className="block truncate text-sm font-medium text-brand-dark">{v.anonymous ? 'A recruiter (private)' : v.organization?.name}</span>
                    )}
                    <span className="block truncate text-xs text-brand-gray-muted">
                      {[v.hint?.industry, timeAgo(v.lastViewedAt)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-brand-gray">No recruiter views yet. A complete profile gets found more often.</p>
          )}
          {!d?.access?.premium && s?.locked > 0 && (
            <Link to="/candidate/billing" className="mt-3 flex items-center gap-1.5 rounded-lg bg-brand-orange-tint px-3 py-2 text-xs font-semibold text-brand-orange-dark hover:underline">
              <Icon name="workspace_premium" size={16} /> {s.locked} more viewer{s.locked > 1 ? 's' : ''} hidden. Unlock with Profile Booster
            </Link>
          )}
        </>
      )}
    </Section>
  );
};

export default ProfileViewsCard;
