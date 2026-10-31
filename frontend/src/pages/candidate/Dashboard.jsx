import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import JobCard from '../../components/common/JobCard';
import Button from '../../components/ui/Button';
import { ProgressBar, Section, StatTile, StatusBadge } from '../../components/ui/data';
import { CardSkeleton, EmptyState, ErrorState } from '../../components/ui/feedback';
import useAuth from '../../hooks/useAuth';
import { useCandidateProfile, useDocumentTitle } from '../../hooks/useData';
import { candidateApi, jobApi } from '../../services';
import { STAGE_LABELS, formatDate } from '../../utils/format';

const Dashboard = () => {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();
  const dash = useQuery({ queryKey: ['candidate-dashboard'], queryFn: candidateApi.dashboard });
  const profile = useCandidateProfile();
  const recommended = useQuery({ queryKey: ['recommended'], queryFn: () => jobApi.recommended({ limit: 5 }) });
  if (dash.isError) return <ErrorState error={dash.error} onRetry={dash.refetch} />;
  const c = dash.data?.counts || {};
  const stages = dash.data?.applicationStages || {};
  const completion = profile.data?.completion;

  return (
    <div>
      <h1 className="text-xl font-bold text-brand-dark">Welcome back, {user.fullName?.split(' ')[0]}</h1>
      <p className="mt-1 text-sm text-brand-gray">Here is what is happening with your job search.</p>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile loading={dash.isPending} icon="description" label="Applications" value={c.applied} to="/candidate/applications" />
        <StatTile loading={dash.isPending} icon="event_upcoming" tone="green" label="Interviews" value={stages.interview_scheduled} to="/candidate/interviews" />
        <StatTile loading={dash.isPending} icon="mail" tone="orange" label="Pending invites" value={c.pendingInvites} to="/candidate/job-invites" />
        <StatTile loading={dash.isPending} icon="bookmark" tone="purple" label="Saved jobs" value={c.saved} to="/candidate/saved-jobs" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-brand-dark">Recommended for you</h2>
            <Link to="/jobs" className="text-xs font-semibold text-brand-blue hover:underline">
              Browse all jobs
            </Link>
          </div>
          {recommended.isPending && <CardSkeleton count={2} />}
          {recommended.data && !recommended.data.data.length && (
            <EmptyState
              icon="auto_awesome"
              title="No recommendations yet"
              description="Add skills and preferences to your profile to get matched jobs."
              action={
                <Button asChild size="sm" variant="primaryBlue">
                  <Link to="/candidate/complete-profile">Complete profile</Link>
                </Button>
              }
            />
          )}
          {recommended.data?.data.map((j) => (
            <JobCard key={j._id} job={j} />
          ))}
        </div>

        <div className="space-y-4">
          {completion && (
            <Section title="Profile strength">
              <p className="mb-2 text-2xl font-bold text-brand-blue">{completion.score}%</p>
              <ProgressBar value={completion.score} />
              {completion.missing?.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-brand-gray">
                  {completion.missing.slice(0, 4).map((m) => (
                    <li key={m.key || m}>• Add {m.label || m}</li>
                  ))}
                </ul>
              )}
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link to="/candidate/complete-profile">Update profile</Link>
              </Button>
            </Section>
          )}
          <Section title="Recent applications">
            {!dash.data?.recentApplications?.length && <p className="text-sm text-brand-gray">You have not applied yet.</p>}
            <ul className="space-y-3">
              {dash.data?.recentApplications?.map((a) => (
                <li key={a._id}>
                  <Link to={`/candidate/ats-tracker?id=${a._id}`} className="block text-sm font-medium text-brand-dark hover:text-brand-blue">
                    {a.job?.title || 'Job removed'}
                  </Link>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-brand-gray-muted">{a.job?.orgSnapshot?.name} · {formatDate(a.createdAt)}</span>
                    <StatusBadge status={a.stage} label={STAGE_LABELS[a.stage]} />
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
