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
import { useAction, usePublicSettings, useSaveJob } from '../../hooks/useData';
import { jobApi } from '../../services';
import useAuthStore from '../../store/useAuthStore';
import { formatDate, formatExperience, formatLocations, formatSalary, timeAgo, titleCase } from '../../utils/format';
import useSeo from '../../hooks/useSeo';
import AdSlot from '../../components/common/AdSlot';

const Text = ({ value }) => <div className="whitespace-pre-line text-sm leading-relaxed text-brand-gray">{value}</div>;
/** Hides empty rows instead of a dash. */
const Row = ({ label, value }) => (value ? <DetailRow label={label} value={value} /> : null);
const list = (v) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : v);
const range = (a, b, sep = ' to ') => [a, b].filter(Boolean).join(sep);

/**
 * "Mode of Interview" on a job post. Call Now / Request Call Back show only once the candidate has
 * an account (signed in) or applied - the API returns `contactAction` only then.
 */
const InterviewSection = ({ job, user }) => {
  const client = useQueryClient();
  const [requested, setRequested] = useState(Boolean(job.contactAction?.requested));
  const callback = useAction(() => jobApi.requestCallback(job._id), {
    success: 'Call back requested. The recruiter will contact you',
    onSuccess: () => {
      setRequested(true);
      client.invalidateQueries({ queryKey: ['job'] });
    },
  });
  const w = job.walkIn || {};
  const c = job.contact || {};
  const action = job.contactAction;
  const hours = range(c.timeFrom, c.timeTo);
  const days = range(c.dayFrom, c.dayTo);
  if (!job.interviewMode && !hours && !days) return null;
  return (
    <Section title="Interview & contact">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Row label="Mode of interview" value={job.interviewMode} />
        {(hours || days) && <Row label="HR contact timing" value={[days, hours].filter(Boolean).join(', ')} />}
        {job.interviewMode === 'Walk-in' && (
          <>
            <Row label="Walk-in dates" value={range(w.startDate && formatDate(w.startDate), w.endDate && formatDate(w.endDate))} />
            <Row label="Walk-in timing" value={w.timing} />
            {w.durationDays && <Row label="Duration" value={`${w.durationDays} day${w.durationDays > 1 ? 's' : ''}`} />}
            <Row label="Venue" value={w.venue} />
          </>
        )}
      </dl>
      {job.interviewMode === 'Walk-in' && w.mapUrl && (
        <a href={w.mapUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-blue">
          <Icon name="map" size={18} /> Open in Google Maps
        </a>
      )}
      <div className="mt-4 border-t border-brand-border pt-4">
        {action?.type === 'call' && (
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="primaryBlue" size="sm">
              <a href={`tel:+91${action.mobile}`}>
                <Icon name="call" size={18} /> Call Now
              </a>
            </Button>
            <span className="text-sm text-brand-gray">
              {[action.name, `+91 ${action.mobile}`].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}
        {action?.type === 'callback' && (
          <Button variant={requested ? 'outline' : 'primaryBlue'} size="sm" disabled={requested} loading={callback.isPending} onClick={() => callback.mutate()} leftIcon={<Icon name={requested ? 'check_circle' : 'phone_callback'} size={18} />}>
            {requested ? 'Call back requested' : 'Request Call Back'}
          </Button>
        )}
        {!user && job.interviewMode && job.interviewMode !== 'Will Confirm Later' && (
          <p className="text-sm text-brand-gray">Apply or log in to see the Call Now / Request Call Back option.</p>
        )}
      </div>
    </Section>
  );
};


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
  // Keep the page (and an open apply modal) mounted while the job reloads for a user who just signed in.
  const query = useQuery({ queryKey: ['job', id, user?._id], queryFn: () => jobApi.get(id), placeholderData: (prev, prevQuery) => (prevQuery?.queryKey?.[1] === id ? prev : undefined) });
  const job = query.data?.job || query.data;
  const [saved, toggleSave] = useSaveJob(job);
  const similar = useQuery({ queryKey: ['job-similar', job?._id], queryFn: () => jobApi.similar(job._id), enabled: Boolean(job?._id) });
  const seoOrg = job?.consultancyClient?.name && !job?.consultancyClient?.hideName ? job.consultancyClient.name : job?.orgSnapshot?.name;
  useSeo({
    title: job ? `${job.title}${seoOrg ? ` at ${seoOrg}` : ''}${job.locations?.[0]?.city ? `, ${job.locations[0].city}` : ''}` : undefined,
    description: job ? `${job.title} - ${[formatExperience(job), formatSalary(job), formatLocations(job, 3)].filter(Boolean).join(' · ')}. ${String(job.description || '').slice(0, 120)}` : undefined,
    image: job?.orgSnapshot?.logo?.url || job?.orgSnapshot?.logo,
    path: job ? `/jobs/${job.slug}` : undefined,
    type: 'article',
    noindex: job ? job.isOpen === false : false,
  });
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
              <Row label="Role" value={list(job.roles) || job.designation} />
              <Row label="Department" value={list([...(job.departments || []), ...(job.functions || [])])} />
              <Row label="Industry" value={list([...(job.industries || []), ...(job.subIndustries || [])])} />
              <Row label={job.kind === 'internship' ? 'Internship type' : 'Employment type'} value={job.kind === 'internship' ? job.internshipType : list(job.employmentTypes)} />
              <Row label="Work mode" value={list(job.jobModes)} />
              <Row label="Shift" value={list(job.shifts)} />
              <Row label="Experience level" value={list(job.experienceLevels)} />
              <Row label="Salary type" value={job.kind === 'internship' ? job.stipend?.type : job.salary?.type} />
              {job.kind === 'internship' && <Row label="Stipend" value={job.stipend?.paid === false ? 'Unpaid' : 'Paid'} />}
              {job.kind === 'internship' && (job.duration?.value || job.duration?.noFixed) && (
                <Row label="Internship period" value={job.duration.noFixed ? 'No Fixed Duration' : `${job.duration.value} ${job.duration.unit}`} />
              )}
              <Row label="Notice period" value={list(job.noticePeriods?.length ? job.noticePeriods : job.noticePeriod)} />
              <Row label="Ready to relocate" value={list(job.relocateOptions)} />
              <Row label="Perks" value={list(job.perks)} />
              <Row label="Assets needed" value={list(job.assets)} />
              {job.deadlineAt && <Row label="Last date to apply" value={formatDate(job.deadlineAt)} />}
            </dl>
          </Section>
          {(job.education?.levels?.length > 0 || job.education?.degrees?.length > 0 || job.certifications?.length > 0) && (
            <Section title="Education & certifications">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Row label="Education" value={list(job.education?.levels)} />
                <Row label="Degree / course" value={list(job.education?.degrees)} />
                <Row label="Specialisation" value={list(job.education?.specialisations)} />
                <Row label="Institution" value={list(job.education?.institutions)} />
                <Row label="Education type" value={list(job.education?.types)} />
                <Row label="Education status" value={list(job.education?.statuses)} />
                <Row label="Medium" value={list(job.education?.mediums)} />
                {job.education?.marksType && <Row label="Minimum marks" value={`${job.education.marksValue || ''} ${job.education.marksType}`.trim()} />}
                <Row label="Certifications" value={list(job.certifications)} />
              </dl>
            </Section>
          )}
          {(job.genders?.length || job.ageRange?.min || job.englishFluency?.length || job.languages?.length || job.diversity?.length || job.maritalStatuses?.length) > 0 && (
            <Section title="Candidate criteria">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Row label="Gender" value={list(job.genders)} />
                <Row label="Marital status" value={list(job.maritalStatuses)} />
                {job.ageRange?.min && <Row label="Age" value={job.ageRange.max >= 61 ? `${job.ageRange.min}+ Years` : `${job.ageRange.min} - ${job.ageRange.max} Years`} />}
                <Row label="English fluency" value={list(job.englishFluency)} />
                <Row label="Languages" value={list(job.languages)} />
                <Row label="Diversity hiring" value={list(job.diversity)} />
                <Row label="Disability" value={list([...(job.disabilityStatuses || []), ...(job.disabilityTypes || [])])} />
              </dl>
            </Section>
          )}
          <InterviewSection job={job} user={user} />
        </div>

        <aside className="w-full shrink-0 space-y-4 lg:w-80">
          <AdSlot placement="job_detail_sidebar" />
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
