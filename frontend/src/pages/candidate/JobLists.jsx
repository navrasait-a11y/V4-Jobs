import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import CompanyCard from '../../components/common/CompanyCard';
import JobCard from '../../components/common/JobCard';
import Button from '../../components/ui/Button';
import { PageHeader, Pagination, StatusBadge, Tabs } from '../../components/ui/data';
import { CardSkeleton, ConfirmDialog, EmptyState, ErrorState, Modal } from '../../components/ui/feedback';
import { LocationField, SelectField, SuggestField, TextField } from '../../components/ui/form';
import { useAction, useCandidateProfile, useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import { alertApi, employerPublicApi, interviewApi, inviteApi, jobApi } from '../../services';
import { formatDateTime, timeAgo, titleCase } from '../../utils/format';

const Loading = ({ query, emptyProps, children }) => {
  if (query.isPending) return <CardSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (!query.data?.data?.length) return <EmptyState {...emptyProps} />;
  return children;
};

export const SavedJobs = () => {
  useDocumentTitle('Saved jobs');
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const params = { limit: 20, ...filters };
  const query = useQuery({ queryKey: ['saved-jobs', params], queryFn: () => jobApi.saved(params) });
  return (
    <div>
      <PageHeader title="Saved Jobs" />
      <Loading
        query={query}
        emptyProps={{
          icon: 'bookmark',
          title: 'No saved jobs',
          description: 'Tap the bookmark on any job to keep it here.',
          action: (
            <Button asChild size="sm" variant="primaryBlue">
              <Link to="/jobs">Find jobs</Link>
            </Button>
          ),
        }}
      >
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {query.data?.data.map((row) => {
            const job = row.job?.title ? row.job : row;
            return <JobCard key={job._id} job={{ ...job, isSaved: true }} />;
          })}
        </div>
      </Loading>
      <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} />
    </div>
  );
};

export const Following = () => {
  useDocumentTitle('Following');
  const query = useQuery({ queryKey: ['following'], queryFn: () => employerPublicApi.following({ limit: 200 }) });
  return (
    <div>
      <PageHeader title="Following" subtitle="Employers you follow. You hear about their new jobs first." />
      <Loading query={query} emptyProps={{ icon: 'domain', title: 'You are not following anyone', description: 'Follow companies to get notified of new jobs.' }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {query.data?.data.map((row) => {
            const org = row.organization?.name ? row.organization : row;
            return <CompanyCard key={org._id} company={org} base={org.type === 'consultancy' ? '/recruiters' : '/companies'} />;
          })}
        </div>
      </Loading>
    </div>
  );
};

export const JobInvites = () => {
  useDocumentTitle('Job invites');
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const params = { limit: 20, ...filters };
  const query = useQuery({ queryKey: ['invites', params], queryFn: () => inviteApi.list(params) });
  const decline = useAction(inviteApi.decline, { success: 'Invite declined', invalidate: ['invites', 'candidate-dashboard'] });
  return (
    <div>
      <PageHeader title="Job Invites" subtitle="Recruiters who think you are a good fit" />
      <Tabs className="mb-4" value={filters.status || ''} onChange={(status) => setFilters({ status })} tabs={['', 'sent', 'viewed', 'applied', 'declined'].map((s) => ({ value: s, label: s ? titleCase(s) : 'All' }))} />
      <Loading query={query} emptyProps={{ icon: 'mail', title: 'No invites here' }}>
        <div className="space-y-3">
          {query.data?.data.map((inv) => (
            <div key={inv._id}>
              {inv.job?.title ? (
                <JobCard
                  job={inv.job}
                  footer={
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 text-xs text-brand-gray">
                        <StatusBadge status={inv.status} /> {inv.message && <span className="ml-2">{inv.message}</span>}
                      </p>
                      {['sent', 'viewed'].includes(inv.status) && (
                        <div className="flex gap-2">
                          <Button size="sm" variant="dangerGhost" onClick={() => decline.mutate(inv._id)}>
                            Decline
                          </Button>
                          <Button asChild size="sm" variant="primary">
                            <Link to={`/jobs/${inv.job.slug || inv.job._id}`}>View and apply</Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  }
                />
              ) : (
                <p className="surface p-4 text-sm text-brand-gray">This job is no longer available.</p>
              )}
            </div>
          ))}
        </div>
      </Loading>
      <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} />
    </div>
  );
};

export const CandidateInterviews = () => {
  useDocumentTitle('Interviews');
  const query = useQuery({ queryKey: ['interviews'], queryFn: () => interviewApi.list({ limit: 50 }) });
  const respond = useAction(({ id, response }) => interviewApi.respond(id, response), { success: 'Response sent', invalidate: ['interviews'] });
  return (
    <div>
      <PageHeader title="Interviews" />
      <Loading query={query} emptyProps={{ icon: 'event', title: 'No interviews scheduled' }}>
        <div className="space-y-3">
          {query.data?.data.map((iv) => (
            <div key={iv._id} className="surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-brand-dark">{iv.job?.title}</p>
                  <p className="text-sm text-brand-gray">{iv.job?.orgSnapshot?.name} {iv.round && `· ${iv.round}`}</p>
                </div>
                <StatusBadge status={iv.status} />
              </div>
              <p className="mt-2 text-sm text-brand-dark">{formatDateTime(iv.scheduledAt)} · {iv.durationMinutes} min · {titleCase(iv.mode)}</p>
              {iv.location && <p className="text-sm text-brand-gray">{iv.location}</p>}
              {iv.meetingLink && (
                <a href={iv.meetingLink} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-blue underline">
                  Join meeting
                </a>
              )}
              {['scheduled', 'rescheduled'].includes(iv.status) && !iv.candidateResponse && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="primaryBlue" onClick={() => respond.mutate({ id: iv._id, response: 'accepted' })}>
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => respond.mutate({ id: iv._id, response: 'declined' })}>
                    Decline
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Loading>
    </div>
  );
};

const AlertForm = ({ alert, onClose }) => {
  const { data: me } = useCandidateProfile();
  const prefill = useQuery({ queryKey: ['alert-prefill'], queryFn: alertApi.prefill, enabled: !alert });
  const c = alert?.criteria || {};
  const [form, setForm] = useState({ name: alert?.name || '', frequency: alert?.frequency || 'daily', jobTitle: c.jobTitle || '', keySkills: c.keySkills || [], locations: c.locations || [], min: c.expectedSalary?.min || '', max: c.expectedSalary?.max || '' });
  useEffect(() => {
    const p = prefill.data?.criteria;
    if (p) setForm((f) => ({ ...f, jobTitle: f.jobTitle || p.jobTitle || '', keySkills: f.keySkills.length ? f.keySkills : p.keySkills || [], locations: f.locations.length ? f.locations : p.locations || [] }));
  }, [prefill.data]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const save = useAction(
    () => {
      const body = {
        name: form.name || form.jobTitle,
        frequency: form.frequency,
        email: alert?.email || me?.user?.email,
        mobile: alert?.mobile || me?.user?.mobile,
        channels: alert?.channels || ['email', 'in_app', 'push'],
        criteria: { ...c, jobTitle: form.jobTitle, keySkills: form.keySkills, locations: form.locations, kind: c.kind || 'any', ...(form.min || form.max ? { expectedSalary: { min: Number(form.min) || undefined, max: Number(form.max) || undefined } } : {}) },
      };
      return alert ? alertApi.update(alert._id, body) : alertApi.create(body);
    },
    { success: 'Job alert saved', invalidate: ['job-alerts'], onSuccess: onClose },
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={alert ? 'Edit job alert' : 'New job alert'}
      footer={
        <Button type="submit" form="alert-form" size="sm" variant="primaryBlue" loading={save.isPending}>
          Save
        </Button>
      }
    >
      <form
        id="alert-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <TextField label="Alert name" value={form.name} onChange={set('name')} />
        <SuggestField label="Job title" required lookup="job_title" allowCreate value={form.jobTitle} onChange={set('jobTitle')} />
        <SuggestField label="Key skills" lookup="key_skill" multiple max={15} allowCreate value={form.keySkills} onChange={set('keySkills')} />
        <LocationField label="Locations" multiple max={3} value={form.locations} onChange={set('locations')} />
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Min monthly salary" type="number" min="0" value={form.min} onChange={set('min')} />
          <TextField label="Max monthly salary" type="number" min="0" value={form.max} onChange={set('max')} />
        </div>
        <SelectField label="Frequency" placeholder={null} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} value={form.frequency} onChange={set('frequency')} />
      </form>
    </Modal>
  );
};

export const JobAlerts = () => {
  useDocumentTitle('Job alerts');
  const [tab, setTab] = useState('alerts');
  const [editing, setEditing] = useState(null);
  const [removeId, setRemoveId] = useState(null);
  const query = useQuery({ queryKey: ['job-alerts'], queryFn: () => alertApi.list({ limit: 10 }) });
  const responses = useQuery({ queryKey: ['job-alerts', 'responses'], queryFn: () => alertApi.responses({ limit: 20 }), enabled: tab === 'responses' });
  const toggle = useAction(({ id, isActive }) => alertApi.update(id, { isActive }), { invalidate: ['job-alerts'] });
  const remove = useAction(alertApi.remove, { success: 'Alert deleted', invalidate: ['job-alerts'], onSuccess: () => setRemoveId(null) });
  return (
    <div>
      <PageHeader
        title="Job Alerts"
        subtitle="Up to 10 alerts"
        actions={
          <Button size="sm" variant="primary" onClick={() => setEditing({})}>
            New alert
          </Button>
        }
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'alerts', label: 'My alerts' },
          { value: 'responses', label: 'Jobs received' },
        ]}
      />
      {tab === 'alerts' ? (
        <Loading query={query} emptyProps={{ icon: 'notifications_active', title: 'No alerts yet', description: 'Create one and get matching jobs automatically.' }}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {query.data?.data.map((a) => (
              <div key={a._id} className="surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-brand-dark">{a.name}</p>
                    <p className="text-xs text-brand-gray-muted">{titleCase(a.frequency)} · {(a.criteria?.keySkills || []).slice(0, 3).join(', ')}</p>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-brand-gray">
                    <input type="checkbox" checked={a.isActive} onChange={(e) => toggle.mutate({ id: a._id, isActive: e.target.checked })} /> Active
                  </label>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="dangerGhost" onClick={() => setRemoveId(a._id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Loading>
      ) : (
        <Loading query={responses} emptyProps={{ icon: 'inbox', title: 'No jobs delivered yet' }}>
          <div className="space-y-3">
            {responses.data?.data.map((r) => {
              const job = r.job?.title ? r.job : r;
              return <JobCard key={r._id} job={job} footer={r.sentAt ? <p className="text-xs text-brand-gray-muted">Sent {timeAgo(r.sentAt)}</p> : null} />;
            })}
          </div>
        </Loading>
      )}
      {editing && <AlertForm alert={editing._id ? editing : null} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={Boolean(removeId)} onClose={() => setRemoveId(null)} title="Delete alert?" danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(removeId)} />
    </div>
  );
};
