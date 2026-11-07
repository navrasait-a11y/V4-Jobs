import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import PanelLayout from '../components/shell/PanelLayout';
import HeaderSearch from '../components/shell/HeaderSearch';
import VerifyContactBanner from '../components/shell/VerifyContactBanner';
import Button from '../components/ui/Button';
import { Avatar } from '../components/ui/data';
import { Icon } from '../components/ui/feedback';
import { employerNav } from '../config/nav';
import useAuth from '../hooks/useAuth';
import { billingApi } from '../services';
import { titleCase } from '../utils/format';

const profileMenu = [
  { label: 'Company Profile', to: '/employer/settings', icon: 'apartment' },
  { label: 'Notifications', to: '/employer/notifications', icon: 'notifications' },
  { label: 'Packages & Billing', to: '/employer/packages-billing', icon: 'credit_card' },
];

const SidebarHeader = () => {
  const { organization } = useAuth();
  return (
    <div className="border-b border-brand-border p-4">
      <Link to="/employer/settings" className="flex items-center gap-3">
        <Avatar name={organization?.name} src={organization?.logo?.url} size={44} square />
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-sm font-semibold text-brand-dark">
            <span className="truncate">{organization?.name}</span>
            {organization?.isVerified && <Icon name="verified" size={15} fill className="text-brand-green" />}
          </p>
          <p className="truncate text-xs text-brand-gray-muted">{titleCase(organization?.type || 'employer')}</p>
        </div>
      </Link>
    </div>
  );
};

const SidebarFooter = () => {
  const { data } = useQuery({ queryKey: ['subscriptions'], queryFn: billingApi.subscriptions });
  const credits = data?.credits || {};
  return (
    <div className="border-t border-brand-border p-3">
      <Link to="/employer/packages-billing" className="block rounded-md border border-brand-border p-3 text-xs text-brand-dark hover:border-brand-blue">
        <p className="font-bold">Available credits</p>
        <p className="mt-1 text-brand-gray">
          {credits.job_post ?? 0} job posts · {credits.resume_view ?? 0} resume views
        </p>
      </Link>
    </div>
  );
};

const OrgBanner = () => {
  const { organization } = useAuth();
  if (!organization || organization.status === 'active') return <VerifyContactBanner />;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-brand-amber-tint px-4 py-2 text-xs text-brand-dark">
      <Icon name="hourglass_top" size={16} />
      <span>
        Your account is <b>{titleCase(organization.status)}</b>. Jobs go live after admin approval.
      </span>
      <Link to="/employer/settings?tab=verification" className="font-semibold text-brand-blue underline">
        Complete verification
      </Link>
    </div>
  );
};

const EmployerLayout = () => (
  <PanelLayout
    nav={employerNav}
    role="employer"
    sidebarHeader={<SidebarHeader />}
    sidebarFooter={<SidebarFooter />}
    banner={<OrgBanner />}
    topExtra={
      <>
        <HeaderSearch role="employer" />
        <Link to="/employer/saved-searches?tab=folders" title="Saved profiles" aria-label="Saved profiles" className="rounded-full p-2 text-brand-gray hover:bg-brand-tint hover:text-brand-dark">
          <Icon name="bookmarks" size={22} />
        </Link>
      <span className="hidden md:block">
        <Button asChild size="sm" variant="primary">
          <Link to="/employer/jobs/post">Post a job</Link>
        </Button>
      </span>
      </>
    }
    profileMenu={profileMenu}
    subtitle="Employer"
    messagesPath="/employer/messages"
    notificationsPath="/employer/notifications"
  />
);

export default EmployerLayout;
