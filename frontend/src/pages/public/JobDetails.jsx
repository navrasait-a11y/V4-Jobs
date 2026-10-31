import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ApplyModal from '../../components/candidate/ApplyModal';
import CompanyLogo from '../../components/common/CompanyLogo';
import FollowButton from '../../components/common/FollowButton';
import JobCard from '../../components/common/JobCard';
import ReportModal from '../../components/common/ReportModal';
import ShareMenu from '../../components/common/ShareMenu';
import Button from '../../components/ui/Button';
import { Badge, DetailRow, Section } from '../../components/ui/data';
import { Alert, EmptyState, ErrorState, Icon, PageLoader } from '../../components/ui/feedback';
import { useDocumentTitle, usePublicSettings, useSaveJob } from '../../hooks/useData';
import { jobApi } from '../../services';
import useAuthStore from '../../store/useAuthStore';
import { formatDate, formatExperience, formatLocations, formatSalary, timeAgo, titleCase } from '../../utils/format';

const Text = ({ value }) => <div className="whitespace-pre-line text-sm leading-relaxed text-brand-gray">{value}</div>;

function useJsonLd(slug, enabled) {
  useEffect(() => {
    if (!enabled || !slug) return undefined;
    let tag;
    let cancelled = false;
    jobApi
      .jsonLd(slug)
      .then((data) => {
        if (cancelled) return;
        tag = document.createElement('script');
        tag.type = 'application/ld+json';
        tag.text = JSON.stringify(data);
        document.head.appendChild(tag);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      tag?.remove();
    };
  }, [slug, enabled]);
}

const JobDetails = () => {
  const { id } = useParams();
  const client = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const settings = usePublicSettings();
  const [applyOpen, setApplyOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const query = useQuery({ queryKey: ['job', id, user?._id], queryFn: () => jobApi.get(id) });
  const job = query.data?.job || query.data;
  const [saved, toggleSave] = useSaveJob(job);
  const similar = useQuery({ queryKey: ['job-similar', job?._id], queryFn: () => jobApi.similar(job._id), enabled: Boolean(job?._id) });
  useDocumentTitle(job?.title);
  useJsonLd(job?.slug, Boolean(settings.platform?.googleJobsEnabled && job?.googleJobsEnabled !== false));

  if (query.isPending) return <PageLoader />;
  if (query.isError) {
    return (
      <div className="mx-auto max-w-[800px] px-4 py-12">
        {query.error.status === 404 ? (
          <EmptyState
            icon="work_off"
            title="This job is not available"
            action={
              <Button asChild variant="primaryBlue" size="sm">
                <Link to="/jobs">Browse jobs</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState error={query.error} onRetry={query.refetch} />
        )}
      </div>
    );
  }

  const org = job.organizationProfile || job.orgSnapshot || {};
  const snapshot = job.orgSnapshot || {};
  const isOpen = job.isOpen !== false;
  const orgPath = `/${job.organizationType === 'consultancy' ? 'recruiters' : 'companies'}/${snapshot.slug || org.slug}`;
  const canApply = !user || user.role === 'candidate';
  const similarJobs = Array.isArray(similar.data) ? similar.data : similar.data?.items || [];
  const meta = [
    ['work', formatExperience(job)],
    ['payments', formatSalary(job)],
    ['location_on', formatLocations(job, 4)],
    ['schedule', job.employmentTypes?.join(', ')],
  ].filter(([, v]) => v);

  const applyButton = job.hasApplied ? (
    <Button variant="outline" disabled leftIcon={<Icon name="check_circle" size={18} />}>
      Applied
    </Button>
  ) : (
    <Button variant="primary" disabled={!isOpen || !canApply} onClick={() => (job.applyExternalUrl ? window.open(job.applyExternalUrl, '_blank', 'noopener') : setApplyOpen(true))}>
      {isOpen ? 'Apply Now' : 'Job closed'}
    </Button>
  );

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="surface p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <CompanyLogo name={snapshot.name} src={snapshot.logo?.url || snapshot.logo} size={56} />
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold text-brand-dark sm:text-2xl">{job.title}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-brand-gray">
                  <Link to={orgPath} className="hover:text-brand-blue">
                    {job.consultancyClient?.name && !job.consultancyClient?.hideName ? job.consultancyClient.name : snapshot.name}
                  </Link>
                  {snapshot.isVerified && <Icon name="verified" size={16} fill className="text-brand-green" />}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-brand-gray">
                  {meta.map(([icon, v]) => (
                    <span key={icon} className="flex items-center gap-1">
                      <Icon name={icon} size={16} className="text-brand-blue" />
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {job.labels?.map((l) => (
                <Badge key={l} tone={l === 'urgent' ? 'red' : 'orange'}>
                  {titleCase(l)}
                </Badge>
              ))}
              {job.kind === 'internship' && <Badge tone="purple">Internship</Badge>}
              <span className="text-xs text-brand-gray-muted">
                Posted {timeAgo(job.refreshedAt || job.publishedAt)} · {job.openings || 1} opening{job.openings > 1 ? 's' : ''} · {job.stats?.applications || 0} applicants
              </span>
            </div>
            {!isOpen && <Alert tone="warning" className="mt-4">This job is no longer accepting applications.</Alert>}
            {user && user.role !== 'candidate' && <Alert className="mt-4">Log in as a candidate to apply for this job.</Alert>}
            {job.application && (
              <Alert tone="success" className="mt-4">
                You applied {timeAgo(job.application.createdAt)}.{' '}
                <Link to="/candidate/applications" className="font-semibold underline">
                  Track application
                </Link>
              </Alert>
            )}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-brand-border pt-4">
              {applyButton}
              <button onClick={toggleSave} aria-pressed={saved} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border px-4 py-2.5 text-sm font-medium text-brand-gray hover:border-brand-blue">
                <Icon name="bookmark" size={18} fill={saved} className={saved ? 'text-brand-orange' : ''} /> {saved ? 'Saved' : 'Save'}
              </button>
              <ShareMenu load={() => jobApi.share(job._id)} />
              <button onClick={() => setReportOpen(true)} className="ml-auto inline-flex items-center gap-1 px-2 text-xs font-medium text-brand-gray-muted hover:text-brand-red">
                <Icon name="flag" size={16} /> Report
              </button>
            </div>
          </div>

          {job.match && (
            <Section title="Your match">
              <div className="flex items-center gap-4">
                <span className="text-3xl font-bold text-brand-green">{job.match.score}%</span>
                <div className="flex flex-wrap gap-2 text-xs text-brand-gray">
                  {Object.entries(job.match.breakdown || {}).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-brand-tint px-2.5 py-1">
                      {titleCase(k)}: {typeof v === 'number' ? Math.round(v) : String(v)}
                    </span>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {job.description && (
            <Section title="Job description">
              <Text value={job.description} />
            </Section>
          )}
          {job.responsibilities && (
            <Section title="Responsibilities">
              <Text value={job.responsibilities} />
            </Section>
          )}
          {job.keySkills?.length > 0 && (
            <Section title="Key skills">
              <div className="flex flex-wrap gap-2">
                {job.keySkills.map((s) => (
                  <Link key={s} to={`/jobs?skills=${encodeURIComponent(s)}`} className="rounded-full bg-brand-blue-tint px-3 py-1 text-xs font-medium text-brand-blue hover:bg-brand-blue hover:text-white">
                    {s}
                  </Link>
                ))}
              </div>
            </Section>
          )}
          <Section title="Job details">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailRow label="Role" value={job.roles?.join(', ') || job.designation} />
              <DetailRow label="Department" value={job.departments?.join(', ')} />
              <DetailRow label="Industry" value={job.industries?.join(', ')} />
              <DetailRow label="Work mode" value={job.jobModes?.join(', ')} />
              <DetailRow label="Shift" value={job.shifts?.join(', ')} />
              <DetailRow label="Education" value={job.education?.levels?.join(', ')} />
              <DetailRow label="Languages" value={job.languages?.join(', ')} />
              <DetailRow label="Perks" value={job.perks?.join(', ')} />
              {job.duration?.value && <DetailRow label="Duration" value={`${job.duration.value} ${job.duration.unit}`} />}
              {job.deadlineAt && <DetailRow label="Apply by" value={formatDate(job.deadlineAt)} />}
            </dl>
          </Section>
          {job.contact?.showToCandidates && (job.contact.name || job.contact.email || job.contact.mobile) && (
            <Section title="Contact">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <DetailRow label="Name" value={job.contact.name} />
                <DetailRow label="Email" value={job.contact.email} />
                <DetailRow label="Mobile" value={job.contact.mobile} />
              </dl>
            </Section>
          )}
        </div>

        <aside className="w-full shrink-0 space-y-4 lg:w-80">
          <Section title="About the employer">
            <div className="flex items-center gap-3">
              <CompanyLogo name={snapshot.name} src={snapshot.logo?.url || snapshot.logo} size={44} />
              <div className="min-w-0">
                <Link to={orgPath} className="block truncate font-semibold text-brand-dark hover:text-brand-blue">
                  {snapshot.name}
                </Link>
                {org.industries?.[0] && <p className="truncate text-xs text-brand-gray-muted">{org.industries[0]}</p>}
              </div>
            </div>
            {org.about && <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm text-brand-gray">{org.about}</p>}
            {job.organization && <FollowButton organizationId={job.organization._id || job.organization} className="mt-3" />}
          </Section>
          {similarJobs.length > 0 && (
            <div>
              <h2 className="mb-3 font-bold text-brand-dark">Similar jobs</h2>
              <div className="space-y-3">
                {similarJobs.slice(0, 4).map((j) => (
                  <JobCard key={j._id} job={j} compact />
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {canApply && isOpen && !job.hasApplied && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-border bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
          <Button variant="primary" fullWidth onClick={() => (job.applyExternalUrl ? window.open(job.applyExternalUrl, '_blank', 'noopener') : setApplyOpen(true))}>
            Apply now
          </Button>
        </div>
      )}
      {applyOpen && (
        <ApplyModal
          job={job}
          onClose={() => setApplyOpen(false)}
          onApplied={() => {
            setApplyOpen(false);
            client.invalidateQueries({ queryKey: ['job', id] });
          }}
        />
      )}
      {reportOpen && <ReportModal targetType="job" targetId={job._id} onClose={() => setReportOpen(false)} />}
    </div>
  );
};

export default JobDetails;
