import React from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { Icon } from '../ui/feedback';

const FACTORS = [
  ['skills', 'Key skills', 'psychology'],
  ['role', 'Job role', 'badge'],
  ['experience', 'Experience', 'work_history'],
  ['location', 'Location', 'location_on'],
  ['salary', 'Expected salary', 'payments'],
  ['education', 'Education', 'school'],
];

const tone = (v) => (v >= 75 ? { bar: 'bg-brand-green', text: 'text-brand-green', ring: '#12885A', label: 'Strong match' } : v >= 45 ? { bar: 'bg-brand-orange', text: 'text-brand-orange', ring: '#F07C00', label: 'Good match' } : { bar: 'bg-brand-red', text: 'text-brand-red', ring: '#C62828', label: 'Low match' });

/** Circular score: an SVG ring so it stays crisp at any size. */
const Ring = ({ value }) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  const t = tone(value);
  return (
    <div className="relative h-24 w-24 shrink-0" role="img" aria-label={`${value}% match`}>
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#E9EEF5" strokeWidth="8" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={t.ring} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * Math.max(0, Math.min(100, value))) / 100} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold leading-none text-brand-dark">{value}%</span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-gray-muted">match</span>
      </span>
    </div>
  );
};

/**
 * "How well you match this job", built from the explainable score the API computes: one bar per
 * factor, plus which of the job's key skills you have and which you could add.
 */
const MatchCard = ({ match, applied }) => {
  if (!match) return null;
  const t = tone(match.score);
  const known = FACTORS.filter(([k]) => match.breakdown?.[k] !== null && match.breakdown?.[k] !== undefined);
  const unknown = FACTORS.filter(([k]) => !known.some(([x]) => x === k));
  const missing = match.missingSkills || [];
  const matched = match.matchedSkills || [];
  return (
    <section className="surface p-5" aria-labelledby="match-title">
      <div className="flex flex-wrap items-center gap-5">
        <Ring value={match.score} />
        <div className="min-w-0 flex-1">
          <h2 id="match-title" className="text-[15px] font-bold text-brand-dark">
            How well you match this job
          </h2>
          <p className={clsx('mt-0.5 text-sm font-semibold', t.text)}>{t.label}</p>
          <p className="mt-1 text-[13px] leading-5 text-brand-gray">
            {match.score >= 75 ? 'Your profile fits what this employer is looking for.' : applied ? 'Keep your profile updated so the recruiter sees your best side.' : 'You can still apply. Adding the missing details below raises your chances.'}
          </p>
        </div>
      </div>

      <ul className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {known.map(([k, label, icon]) => {
          const v = match.breakdown[k];
          return (
            <li key={k}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 font-medium text-brand-dark">
                  <Icon name={icon} size={16} className="text-brand-gray-muted" /> {label}
                </span>
                <span className={clsx('text-xs font-semibold tabular-nums', tone(v).text)}>{v}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E9EEF5]">
                <div className={clsx('h-full rounded-full transition-[width] duration-700', tone(v).bar)} style={{ width: `${Math.max(v, 3)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {unknown.length > 0 && <p className="mt-3 text-xs text-brand-gray-muted">Not counted (missing in the job or your profile): {unknown.map(([, l]) => l.toLowerCase()).join(', ')}.</p>}

      {(matched.length > 0 || missing.length > 0) && (
        <div className="mt-5 space-y-3 border-t border-brand-border pt-4">
          {matched.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-gray-muted">Skills you have</p>
              <div className="flex flex-wrap gap-1.5">
                {matched.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-brand-green">
                    <Icon name="check" size={13} /> {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {missing.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-gray-muted">Skills this job asks for</p>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((s) => (
                  <span key={s} className="rounded-full border border-dashed border-[#C9D1DC] px-2.5 py-1 text-xs text-brand-gray">
                    {s}
                  </span>
                ))}
              </div>
              <Link to="/candidate/profile#resume" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-blue">
                Have any of these? Add them to your profile <Icon name="arrow_forward" size={14} />
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default MatchCard;
