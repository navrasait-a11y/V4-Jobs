import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ProfileViewsCard from '../../components/candidate/ProfileViewsCard';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import BillingPanel from '../../components/shared/BillingPanel';
import { PageHeader, Section, SimpleSelect, StatTile } from '../../components/ui/data';
import { ErrorState } from '../../components/ui/feedback';
import { useDocumentTitle } from '../../hooks/useData';
import { analyticsApi } from '../../services';
import { TIMESPAN_OPTIONS } from '../../utils/format';

export { ResumeBuilder } from './ResumeBuilder';

export const CandidateBilling = () => {
  useDocumentTitle('Profile booster');
  return (
    <div>
      <PageHeader title="Profile Booster" subtitle="Get seen first by recruiters" />
      <BillingPanel audience="candidate" />
    </div>
  );
};

export const CandidateAnalytics = () => {
  useDocumentTitle('Analytics');
  const [timespan, setTimespan] = useState('30d');
  const query = useQuery({ queryKey: ['candidate-analytics', timespan], queryFn: () => analyticsApi.candidate({ timespan }) });
  const d = query.data;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  return (
    <div>
      <PageHeader title="Analytics" actions={<SimpleSelect ariaLabel="Time range" value={timespan} onChange={setTimespan} options={TIMESPAN_OPTIONS} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile loading={query.isPending} icon="visibility" label="Profile views" value={d?.profileViews?.total} />
        <StatTile loading={query.isPending} icon="download" tone="green" label="Resume downloads" value={d?.resumeDownloads?.total} />
        <StatTile loading={query.isPending} icon="search" tone="orange" label="Search appearances" value={d?.searchAppearances} />
        <StatTile loading={query.isPending} icon="percent" tone="purple" label="Application view rate" value={`${d?.applicationPerformance?.viewRate ?? 0}%`} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Profile views" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d?.profileViews?.daily || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F0" vertical={false} />
                <XAxis dataKey="_id" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip />
                <Area dataKey="count" name="Views" stroke="#0151A0" fill="#EDF4FC" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <ProfileViewsCard />
      </div>
      {d?.skillTrends?.length > 0 && (
        <Section title="Skills in demand" className="mt-4">
          <div className="flex flex-wrap gap-2">
            {d.skillTrends.map((s) => (
              <span key={s.skill} className={`rounded-full px-3 py-1 text-xs font-medium ${s.youHaveIt ? 'bg-brand-green-tint text-brand-green' : 'bg-brand-tint text-brand-gray'}`}>
                {s.skill} · {s.activeJobs}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-brand-gray-muted">Green skills are already on your profile.</p>
        </Section>
      )}
    </div>
  );
};


