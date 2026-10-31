import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import PanelLayout from '../components/shell/PanelLayout';
import VerifyContactBanner from '../components/shell/VerifyContactBanner';
import { Avatar, ProgressBar } from '../components/ui/data';
import { Icon } from '../components/ui/feedback';
import { candidateNav } from '../config/nav';
import useAuth from '../hooks/useAuth';
import { candidateApi } from '../services';

const topLinks = [
  { label: 'Jobs', to: '/jobs' },
  { label: 'Companies', to: '/companies' },
  { label: 'Find Recruiters', to: '/recruiters' },
  { label: 'Career Advice', to: '/career-advice' },
];
const profileMenu = [
  { label: 'My Profile', to: '/candidate/profile', icon: 'account_circle' },
  { label: 'Notifications', to: '/candidate/notifications', icon: 'notifications' },
  { label: 'Settings', to: '/candidate/settings', icon: 'settings' },
];

const SidebarHeader = () => {
  const { user } = useAuth();
  const { data } = useQuery({ queryKey: ['candidate-me'], queryFn: candidateApi.me });
  const score = data?.completion?.score ?? 0;
  return (
    <div className="border-b border-brand-border p-4">
      <Link to="/candidate/profile" className="flex items-center gap-3">
        <Avatar name={user.fullName} src={user.avatar?.url} size={44} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand-dark">{user.fullName}</p>
          <p className="truncate text-xs text-brand-gray-muted">{data?.profile?.resumeHeadline || data?.profile?.experienceLevel || 'Jobseeker'}</p>
        </div>
      </Link>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[11px] text-brand-gray">
          <span>Profile strength</span>
          <span className="font-semibold text-brand-blue">{score}%</span>
        </div>
        <ProgressBar value={score} />
      </div>
    </div>
  );
};

const SidebarFooter = () => (
  <div className="border-t border-brand-border p-3">
    <Link to="/candidate/billing" className="block rounded-md border border-brand-border p-3 hover:border-brand-orange">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-dark">
        <Icon name="rocket_launch" size={16} className="text-brand-orange" /> Profile Booster
      </p>
      <p className="mt-0.5 text-xs text-brand-gray">Appear first in recruiter searches</p>
    </Link>
  </div>
);

const CandidateLayout = () => (
  <PanelLayout
    nav={candidateNav}
    role="candidate"
    topLinks={topLinks}
    sidebarHeader={<SidebarHeader />}
    sidebarFooter={<SidebarFooter />}
    banner={<VerifyContactBanner />}
    profileMenu={profileMenu}
    subtitle="Jobseeker"
    messagesPath="/candidate/messages"
    notificationsPath="/candidate/notifications"
  />
);

export default CandidateLayout;
