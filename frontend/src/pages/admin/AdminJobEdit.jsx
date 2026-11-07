import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { JobCandidates } from '../../components/admin/AdminActions';
import JobPostForm, { JOB_BLANK, jobFormErrors, jobToForm, toJobPayload } from '../../components/employer/JobPostForm';
import Button from '../../components/ui/Button';
import { Badge, Section, StatTile, StatusBadge } from '../../components/ui/data';
import { Alert, ErrorState, Icon, PageLoader } from '../../components/ui/feedback';
import { CheckboxField, ChoiceChips, Field, SelectField, TextField } from '../../components/ui/form';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import { adminApi } from '../../services';
import { formatDateTime, formatNumber, titleCase, toInputDate } from '../../utils/format';

const STATUSES = ['draft', 'pending', 'admin_review', 'active', 'closed', 'expired', 'rejected', 'trashed'];
const LABELS = ['premium', 'starred', 'featured', 'actively_hiring', 'urgent'];
const opts = (list) => list.map((v) => ({ value: v, label: titleCase(v) }));
const READ_ONLY = ['status', 'slug', '_id', 'uid', 'organization', 'organizationType', 'postedBy', 'stats', 'orgSnapshot', 'createdAt', 'updatedAt', 'collaborators', 'callbackRequests'];

/** PRD Job Actions: "Edit Job - Sectors, Departments, Designation, Publish / Deadline / Expiry Date, Address, Open Positions ...". */
const AdminJobEdit = () => {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['admin', 'job', id], queryFn: () => adminApi.get(`/jobs/${id}`) });
  const job = q.data?.job || q.data;
  const [form, setForm] = useState(JOB_BLANK);
  const [admin, setAdmin] = useState({ status: 'draft', statusReason: '', labels: [], publishedAt: '', deadlineAt: '', expiresAt: '', applyExternalUrl: '', googleJobsEnabled: true });
  const [errors, setErrors] = useState({});
  const [assigning, setAssigning] = useState(false);
  useDocumentTitle(job?.title || 'Edit job');
  useEffect(() => {
    if (!job) return;
    setForm(jobToForm(job));
    setAdmin({
      status: job.status,
      statusReason: job.statusReason || '',
      labels: job.labels || [],
      publishedAt: toInputDate(job.publishedAt),
      deadlineAt: toInputDate(job.deadlineAt),
      expiresAt: toInputDate(job.expiresAt),
      applyExternalUrl: job.applyExternalUrl || '',
      googleJobsEnabled: job.googleJobsEnabled !== false,
    });
  }, [job]);
  const setA = (k) => (e) => setAdmin((a) => ({ ...a, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const save = useAction(
    () => {
      const body = toJobPayload(form);
      for (const k of READ_ONLY) delete body[k];
      delete body.deadlineAt;
      return adminApi.patch(`/jobs/${id}`, {
        ...body,
        status: admin.status,
        statusReason: admin.statusReason || undefined,
        labels: admin.labels,
        publishedAt: admin.publishedAt || undefined,
        deadlineAt: admin.deadlineAt || undefined,
        expiresAt: admin.expiresAt || undefined,
        applyExternalUrl: admin.applyExternalUrl,
        googleJobsEnabled: admin.googleJobsEnabled,
      });
    },
    { success: 'Job saved', invalidate: ['admin'], silent: true, onSuccess: () => toast.success('Job saved'), onError: (e) => { setErrors(e.fieldErrors || {}); toast.error(e.message); } },
  );
  if (q.isPending) return <PageLoader />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const consultancy = job.organizationType === 'consultancy';

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link to="/admin/jobs" className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue">
        <Icon name="arrow_back" size={16} /> Jobs
      </Link>
      <div className="surface flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold text-brand-dark">
            {job.title} <StatusBadge status={job.status} /> {job.kind === 'internship' && <Badge tone="purple">Internship</Badge>}
          </h1>
          <p className="text-sm text-brand-gray">
            <Link to={`/admin/employers/${job.organization?._id || job.organization}`} className="font-medium text-brand-blue hover:underline">
              {job.orgSnapshot?.name}
            </Link>{' '}
            · <span className="font-mono text-xs">{job.uid}</span> · created {formatDateTime(job.createdAt)}
          </p>
          {job.statusReason && <p className="mt-1 text-xs text-brand-red">{job.statusReason}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link to={`/admin/responses?job=${id}`}>View responses</Link></Button>
          <Button size="sm" variant="outline" onClick={() => setAssigning(true)}>Assign / invite candidates</Button>
          {job.slug && <Button asChild size="sm" variant="ghost"><a href={`/jobs/${job.slug}`} target="_blank" rel="noopener noreferrer" aria-label="Open public job"><Icon name="open_in_new" size={18} /></a></Button>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon="visibility" label="Views" value={formatNumber(job.stats?.views || 0)} />
        <StatTile icon="description" label="Responses" value={formatNumber(job.stats?.applications || 0)} />
        <StatTile icon="star" label="Shortlisted" value={formatNumber(job.stats?.shortlisted || 0)} />
        <StatTile icon="phone_callback" label="Call back requests" value={formatNumber(job.callbackRequests || 0)} />
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const local = jobFormErrors(form, { requireAll: admin.status === 'active' });
          setErrors(local);
          if (Object.keys(local).length) return toast.error('Please fix the highlighted fields');
          return save.mutate();
        }}
      >
        <Section title="Admin controls">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SelectField label="Status" placeholder={null} options={opts(STATUSES)} value={admin.status} onChange={setA('status')} />
            <TextField className="sm:col-span-2" label="Status reason (sent to the employer on reject)" value={admin.statusReason} onChange={setA('statusReason')} />
            <TextField label="Publish date" type="date" value={admin.publishedAt} onChange={setA('publishedAt')} />
            <TextField label="Last date to apply" type="date" value={admin.deadlineAt} onChange={setA('deadlineAt')} />
            <TextField label="Expiry date" type="date" value={admin.expiresAt} onChange={setA('expiresAt')} />
            <TextField className="sm:col-span-2" label="External apply URL" value={admin.applyExternalUrl} onChange={setA('applyExternalUrl')} />
            <CheckboxField className="sm:mt-8" label="Show on Google Jobs" checked={admin.googleJobsEnabled} onChange={setA('googleJobsEnabled')} />
          </div>
          <Field className="mt-4" label="Job labels">
            <ChoiceChips multiple options={opts(LABELS)} value={admin.labels} onChange={setA('labels')} />
          </Field>
        </Section>
        {Object.keys(errors).length > 0 && <Alert tone="error">{Object.values(errors).join('. ')}</Alert>}
        <JobPostForm form={form} setForm={setForm} errors={errors} consultancy={consultancy} />
        <div className="sticky bottom-0 flex justify-end gap-2 surface p-3">
          <Button type="button" size="sm" variant="ghost" onClick={() => setForm(jobToForm(job))}>Reset</Button>
          <Button type="submit" size="sm" variant="primaryBlue" loading={save.isPending}>Save job</Button>
        </div>
      </form>
      {assigning && <JobCandidates job={job} onClose={() => setAssigning(false)} />}
    </div>
  );
};

export default AdminJobEdit;
