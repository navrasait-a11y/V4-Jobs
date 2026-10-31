import React from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import CompanyLogo from './CompanyLogo';
import { Badge } from '../ui/data';
import { Icon } from '../ui/feedback';
import { useSaveJob } from '../../hooks/useData';
import { formatExperience, formatLocations, formatSalary, timeAgo } from '../../utils/format';

const Meta = ({ icon, children }) => (
  <span className="flex min-w-0 items-center gap-1.5">
    <Icon name={icon} size={17} className="shrink-0 text-brand-gray-muted" />
    <span className="truncate">{children}</span>
  </span>
);

const JobCard = ({ job, compact = false, className = '', footer }) => {
  const [saved, toggleSave] = useSaveJob(job);
  const org = job.orgSnapshot || {};
  const href = `/jobs/${job.slug || job._id}`;
  const skills = job.keySkills || [];
  const company = job.consultancyClient?.name && !job.consultancyClient?.hideName ? job.consultancyClient.name : org.name;

  return (
    <article className={clsx('surface surface-hover group relative p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold leading-snug text-brand-dark transition-colors group-hover:text-brand-blue sm:text-base">
            <Link to={href} className="after:absolute after:inset-0">
              {job.title}
            </Link>
          </h3>
          <p className="mt-1 flex items-center gap-1 text-sm font-medium text-brand-gray">
            <span className="truncate">{company}</span>
            {org.isVerified && <Icon name="verified" size={15} fill className="shrink-0 text-brand-blue" />}
          </p>
        </div>
        <CompanyLogo name={org.name} src={org.logo?.url || org.logo} size={compact ? 42 : 50} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-medium text-brand-gray">
        <Meta icon="work_outline">{formatExperience(job)}</Meta>
        <Meta icon="payments">{formatSalary(job)}</Meta>
        <Meta icon="location_on">{formatLocations(job)}</Meta>
      </div>

      {!compact && skills.length > 0 && <p className="mt-2.5 truncate text-[13px] text-brand-gray-muted">{skills.slice(0, 6).join(' · ')}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-brand-gray-muted">
        {job.matchScore !== undefined && <span className="font-semibold text-brand-green">{job.matchScore}% match</span>}
        {job.hasApplied && <Badge tone="blue">Applied</Badge>}
        {job.labels?.includes('urgent') && <Badge tone="red">Urgent</Badge>}
        {job.isFeatured && <Badge tone="orange">Featured</Badge>}
        {job.kind === 'internship' && <Badge tone="purple">Internship</Badge>}
        <span className="ml-auto">{timeAgo(job.refreshedAt || job.publishedAt)}</span>
        <button onClick={toggleSave} aria-label={saved ? 'Remove from saved jobs' : 'Save job'} aria-pressed={saved} className={clsx('relative z-10 -my-1 inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold transition-colors hover:bg-brand-tint', saved ? 'text-brand-orange' : 'text-brand-gray')}>
          <Icon name="bookmark" size={19} fill={saved} />
          <span className="hidden sm:inline">{saved ? 'Saved' : 'Save'}</span>
        </button>
      </div>
      {footer && <div className="relative z-10 mt-3 border-t border-brand-border pt-3">{footer}</div>}
    </article>
  );
};

export default JobCard;
