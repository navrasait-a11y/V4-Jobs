import React from 'react';
import { Link } from 'react-router-dom';
import CompanyLogo from './CompanyLogo';
import FollowButton from './FollowButton';
import { Icon } from '../ui/feedback';
import { formatNumber, placeLabel } from '../../utils/format';

const CompanyCard = ({ company, base = '/companies' }) => {
  const href = `${base}/${company.slug || company.username || company._id}`;
  const office = company.offices?.find((o) => o.isPrimary) || company.offices?.[0];
  const jobs = company.stats?.activeJobs ?? company.activeJobs ?? 0;
  return (
    <article className="surface surface-hover group relative flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <CompanyLogo name={company.name} src={company.logo?.url} size={56} />
        <FollowButton organizationId={company._id} className="relative z-10" />
      </div>
      <h3 className="mt-3 flex items-center gap-1 font-bold text-brand-dark transition-colors group-hover:text-brand-blue">
        <Link to={href} className="truncate after:absolute after:inset-0">
          {company.name}
        </Link>
        {company.isVerified && <Icon name="verified" size={16} fill className="shrink-0 text-brand-blue" />}
      </h3>
      <p className="mt-0.5 truncate text-sm text-brand-gray">{company.industries?.[0] || company.organizationType || 'Employer'}</p>
      {office && <p className="mt-0.5 truncate text-xs text-brand-gray-muted">{placeLabel(office)}</p>}
      <p className="mt-auto flex items-center gap-1 pt-4 text-sm font-semibold text-brand-blue">
        {formatNumber(jobs)} open {jobs === 1 ? 'job' : 'jobs'} <Icon name="arrow_forward" size={16} className="transition-transform group-hover:translate-x-0.5" />
      </p>
    </article>
  );
};

export default CompanyCard;
