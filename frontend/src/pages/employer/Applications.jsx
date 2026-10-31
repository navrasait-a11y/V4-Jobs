import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import Button from '../../components/ui/Button';
import { Avatar, Badge, DataTable, DetailRow, PageHeader, Pagination, SearchInput, Section, SimpleSelect, StatusBadge, Tabs } from '../../components/ui/data';
import { EmptyState, ErrorState, Icon, Modal, PageLoader } from '../../components/ui/feedback';
import { SelectField, TextAreaField, TextField } from '../../components/ui/form';
import { useAction, useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import useDebounce from '../../hooks/useDebounce';
import { chatApi, employerJobApi, interviewApi, mailboxApi, responseApi } from '../../services';
import { CALLING_LABELS, MESSAGING_LABELS, SCREENING_LABELS, STAGE_LABELS, TIMESPAN_OPTIONS, formatDate, formatDateTime, monthsToExperience, placeLabel, timeAgo, titleCase } from '../../utils/format';

const STAGES = ['applied', 'screened', 'interview_scheduled', 'offered', 'hired', 'rejected'];
const opts = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const inv = ['responses', 'interviews', 'employer-analytics'];

export const ScheduleModal = ({ applicationId, onClose }) => {
  const [form, setForm] = useState({ scheduledAt: '', durationMinutes: 30, mode: 'video', location: '', meetingLink: '', round: '', notes: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = useAction(
    () => responseApi.schedule(applicationId, { ...Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')), scheduledAt: new Date(form.scheduledAt).toISOString(), durationMinutes: Number(form.durationMinutes) }),
    { success: 'Interview scheduled. The candidate has been notified', invalidate: inv, onSuccess: onClose },
  );
  return (
    <Modal open onClose={onClose} title="Schedule interview" footer={<Button type="submit" form="schedule" size="sm" variant="primaryBlue" loading={save.isPending}>Schedule</Button>}>
      <form
        id="schedule"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Date and time" type="datetime-local" min={new Date()} required value={form.scheduledAt} onChange={set('scheduledAt')} />
          <TextField label="Duration (minutes)" type="number" min="5" value={form.durationMinutes} onChange={set('durationMinutes')} />
          <SelectField label="Mode" placeholder={null} options={[{ value: 'video', label: 'Video' }, { value: 'phone', label: 'Phone' }, { value: 'in_person', label: 'In person' }]} value={form.mode} onChange={set('mode')} />
          <TextField label="Round" value={form.round} onChange={set('round')} />
        </div>
        {form.mode === 'video' && <TextField label="Meeting link" type="url" value={form.meetingLink} onChange={set('meetingLink')} />}
        {form.mode === 'in_person' && <TextField label="Location" value={form.location} onChange={set('location')} />}
        <TextAreaField label="Notes" rows={2} value={form.notes} onChange={set('notes')} />
      </form>
    </Modal>
  );
};

const MailModal = ({ candidateId, jobId, name, onClose }) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const send = useAction(() => mailboxApi.send({ to: [candidateId], subject, body: `<p>${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>`, jobId }), { success: 'Mail sent', invalidate: ['mailbox'], onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Mail ${name}`} footer={<Button size="sm" variant="primaryBlue" disabled={!subject || !body} loading={send.isPending} onClick={() => send.mutate()}>Send</Button>}>
      <div className="space-y-4">
        <TextField label="Subject" required value={subject} onChange={(e) => setSubject(e.target.value)} />
        <TextAreaField label="Message" required rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
    </Modal>
  );
};

const InterviewModal = ({ interview, onClose }) => {
  const [when, setWhen] = useState('');
  const [rating, setRating] = useState('');
  const [result, setResult] = useState('');
  const [comments, setComments] = useState('');
  const save = useAction(
    () => interviewApi.update(interview._id, when ? { scheduledAt: new Date(when).toISOString() } : { status: 'completed', feedback: { rating: Number(rating) || undefined, comments: comments || undefined, result: result || undefined } }),
    { success: 'Interview updated', invalidate: inv, onSuccess: onClose },
  );
  return (
    <Modal open onClose={onClose} title="Update interview" footer={<Button size="sm" variant="primaryBlue" loading={save.isPending} onClick={() => save.mutate()}>{when ? 'Reschedule' : 'Save feedback'}</Button>}>
      <div className="space-y-4">
        <TextField label="Reschedule to" type="datetime-local" min={new Date()} value={when} onChange={(e) => setWhen(e.target.value)} hint="Leave empty to mark as completed with feedback" />
        {!when && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField label="Rating" options={['1', '2', '3', '4', '5']} value={rating} onChange={(e) => setRating(e.target.value)} />
              <SelectField label="Result" options={[{ value: 'selected', label: 'Selected' }, { value: 'rejected', label: 'Rejected' }, { value: 'on_hold', label: 'On hold' }]} value={result} onChange={(e) => setResult(e.target.value)} />
            </div>
            <TextAreaField label="Comments" rows={3} value={comments} onChange={(e) => setComments(e.target.value)} />
          </>
        )}
      </div>
    </Modal>
  );
};

const Funnel = ({ jobId }) => {
  const { data } = useQuery({ queryKey: ['responses', 'funnel', jobId], queryFn: () => responseApi.funnel(jobId) });
  const stages = data?.stages || {};
  return (
    <div className="surface mb-4 grid grid-cols-3 gap-3 p-3 sm:grid-cols-6">
      {STAGES.map((s) => (
        <div key={s}>
          <p className="text-lg font-bold tabular-nums text-brand-dark">{stages[s] || 0}</p>
          <p className="text-xs text-brand-gray-muted">{STAGE_LABELS[s]}</p>
        </div>
      ))}
    </div>
  );
};

export const Applications = () => {
  useDocumentTitle('Applications');
  const navigate = useNavigate();
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const [q, setQ] = useState(filters.q || '');
  const [selected, setSelected] = useState([]);
  const [bulkStage, setBulkStage] = useState('');
  const debounced = useDebounce(q, 400);
  useEffect(() => {
    if (debounced !== (filters.q || '')) setFilters({ q: debounced });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  const params = { limit: 20, sort: '-createdAt', ...filters };
  const query = useQuery({ queryKey: ['responses', params], queryFn: () => responseApi.list(params), placeholderData: keepPreviousData });
  const jobs = useQuery({ queryKey: ['employer-jobs', 'options'], queryFn: () => employerJobApi.list({ limit: 200, status: 'active' }) });
  const bulk = useAction(() => responseApi.bulk(selected, { stage: bulkStage }), {
    success: 'Applications updated',
    invalidate: inv,
    onSuccess: () => {
      setSelected([]);
      setBulkStage('');
    },
  });
  const stages = query.data?.meta?.stages || {};
  const { page: _p, ...exportParams } = filters;
  const exporter = useAction(() => responseApi.exportExcel(exportParams), { success: 'Export downloaded' });
  const zipper = useAction(() => responseApi.exportResumes(exportParams), { success: 'Resumes downloaded' });

  const columns = [
    {
      key: 'name',
      header: 'Candidate',
      render: (a) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={a.snapshot?.fullName} size={34} />
          <span className="min-w-0 text-left">
            <span className="block font-medium">{a.snapshot?.fullName}</span>
            <span className="block text-xs text-brand-gray-muted">{a.snapshot?.currentJobTitle || a.snapshot?.email}</span>
          </span>
        </span>
      ),
    },
    { key: 'job', header: 'Job', render: (a) => a.job?.title },
    { key: 'match', header: 'Match', render: (a) => (a.matchScore !== undefined ? <Badge tone="green">{a.matchScore}%</Badge> : '—') },
    { key: 'date', header: 'Applied', render: (a) => formatDate(a.createdAt) },
    { key: 'stage', header: 'Stage', render: (a) => <StatusBadge status={a.stage} label={STAGE_LABELS[a.stage]} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Applications"
        actions={
          <>
            <Button size="sm" variant="outline" loading={exporter.isPending} onClick={() => exporter.mutate()}>
              Export Excel
            </Button>
            <Button size="sm" variant="outline" loading={zipper.isPending} onClick={() => zipper.mutate()}>
              Download resumes
            </Button>
          </>
        }
      />
      <Tabs className="mb-4" value={filters.stage || ''} onChange={(stage) => setFilters({ stage })} tabs={[{ value: '', label: 'All' }, ...STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s], count: stages[s] || 0 }))]} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchInput className="min-w-[220px] flex-1" value={q} onChange={setQ} placeholder="Name, email, mobile" />
        <SimpleSelect ariaLabel="Job" value={filters.job} onChange={(job) => setFilters({ job })} placeholder="All jobs" className="max-w-[220px]" options={(jobs.data?.data || []).map((j) => ({ value: j._id, label: j.title }))} />
        <SimpleSelect ariaLabel="Screening" value={filters.screeningStatus} onChange={(v) => setFilters({ screeningStatus: v })} placeholder="Screening" options={opts(SCREENING_LABELS)} />
        <SimpleSelect ariaLabel="View" value={filters.view} onChange={(view) => setFilters({ view })} placeholder="All responses" options={[{ value: 'new', label: 'New' }, { value: 'viewed', label: 'Viewed' }, { value: 'pending', label: 'Action pending' }]} />
        <SimpleSelect ariaLabel="Time" value={filters.timespan} onChange={(timespan) => setFilters({ timespan })} placeholder="Any time" options={TIMESPAN_OPTIONS} />
      </div>
      {filters.job && <Funnel jobId={filters.job} />}
      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-blue-tint p-2.5 text-sm">
          <b>{selected.length} selected</b>
          <SimpleSelect ariaLabel="Move to stage" value={bulkStage} onChange={setBulkStage} placeholder="Move to stage" options={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))} />
          <Button size="sm" variant="primaryBlue" disabled={!bulkStage} loading={bulk.isPending} onClick={() => bulk.mutate()}>
            Apply
          </Button>
        </div>
      )}
      <DataTable columns={columns} rows={query.data?.data} query={query} selectable selected={selected} onSelect={setSelected} onRowClick={(a) => navigate(`/employer/applications/${a._id}`)} empty={<EmptyState icon="group" title="No applications match" />} />
      <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} />
    </div>
  );
};

export const ApplicationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['responses', 'detail', id], queryFn: () => responseApi.get(id) });
  const [scheduling, setScheduling] = useState(false);
  const [mailing, setMailing] = useState(false);
  const [note, setNote] = useState('');
  useDocumentTitle('Application');
  const update = useAction((body) => responseApi.update(id, body), { success: 'Updated', invalidate: inv });
  const message = useAction(({ candidateId, jobId }) => chatApi.start({ candidateId, jobId }), { onSuccess: () => navigate('/employer/messages') });
  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const { application: a, job, candidate, profile = {}, interviews = [], resumeUrl } = query.data;
  const s = a.snapshot || {};
  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/employer/applications" className="text-sm font-medium text-brand-blue hover:underline">
        ← Applications
      </Link>
      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section>
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={s.fullName} src={candidate?.avatar?.url} size={64} />
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold text-brand-dark">{s.fullName}</h1>
                <p className="text-sm text-brand-gray">{profile.resumeHeadline || s.currentJobTitle}</p>
                <p className="text-xs text-brand-gray-muted">{job?.title}</p>
              </div>
              <StatusBadge status={a.stage} label={STAGE_LABELS[a.stage]} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {resumeUrl && (
                <Button asChild size="sm" variant="primaryBlue">
                  <a href={resumeUrl} target="_blank" rel="noopener noreferrer">
                    View resume
                  </a>
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setScheduling(true)}>
                Schedule interview
              </Button>
              <Button size="sm" variant="outline" onClick={() => message.mutate({ candidateId: a.candidate?._id || a.candidate, jobId: job?._id })}>
                Message
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMailing(true)}>
                Send mail
              </Button>
            </div>
          </Section>
          <Section title="Details">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailRow label="Email" value={s.email} />
              <DetailRow label="Mobile" value={s.mobile} />
              <DetailRow label="Experience" value={monthsToExperience(s.totalExperienceMonths)} />
              <DetailRow label="Current salary" value={s.currentSalary} />
              <DetailRow label="Notice period" value={profile.noticePeriod || s.noticePeriod} />
              <DetailRow label="Location" value={placeLabel(profile.currentLocation)} />
            </dl>
            {profile.keySkills?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {profile.keySkills.map((k) => (
                  <Badge key={k} tone="blue">
                    {k}
                  </Badge>
                ))}
              </div>
            )}
          </Section>
          {a.answers?.length > 0 && (
            <Section title="Screening answers">
              <dl className="space-y-3">
                {a.answers.map((x) => (
                  <DetailRow key={x.question} label={x.question} value={x.answer} />
                ))}
              </dl>
            </Section>
          )}
          {a.coverLetter && (
            <Section title="Cover letter">
              <p className="whitespace-pre-line text-sm text-brand-gray">{a.coverLetter}</p>
            </Section>
          )}
          {interviews.length > 0 && (
            <Section title="Interviews">
              <ul className="space-y-2 text-sm">
                {interviews.map((iv) => (
                  <li key={iv._id} className="flex items-center justify-between gap-2">
                    <span>{formatDateTime(iv.scheduledAt)} · {titleCase(iv.mode)}</span>
                    <StatusBadge status={iv.status} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
        <aside className="space-y-4">
          <Section title="Tracking">
            <div className="space-y-3">
              <SelectField label="Stage" placeholder={null} options={STAGES.map((v) => ({ value: v, label: STAGE_LABELS[v] }))} value={a.stage} onChange={(e) => update.mutate({ stage: e.target.value })} />
              <SelectField label="Screening" options={opts(SCREENING_LABELS)} value={a.screeningStatus || ''} onChange={(e) => update.mutate({ screeningStatus: e.target.value })} />
              <SelectField label="Calling" options={opts(CALLING_LABELS)} value={a.callingStatus || ''} onChange={(e) => update.mutate({ callingStatus: e.target.value })} />
              <SelectField label="Messaging" options={opts(MESSAGING_LABELS)} value={a.messagingStatus?.[0] || ''} onChange={(e) => update.mutate({ messagingStatus: [e.target.value] })} />
            </div>
          </Section>
          <Section title="Notes">
            <TextAreaField rows={3} aria-label="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={!note.trim()}
              onClick={() => {
                update.mutate({ comment: note });
                setNote('');
              }}
            >
              Add note
            </Button>
            <ul className="mt-3 space-y-2 text-xs text-brand-gray">
              {(a.comments || []).map((c, i) => (
                <li key={c._id || i} className="rounded-md bg-brand-tint p-2">
                  {c.body}
                  <span className="mt-0.5 block text-[11px] text-brand-gray-muted">{timeAgo(c.at || c.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Section>
        </aside>
      </div>
      {scheduling && <ScheduleModal applicationId={a._id} onClose={() => setScheduling(false)} />}
      {mailing && <MailModal candidateId={a.candidate?._id || a.candidate} jobId={job?._id} name={s.fullName} onClose={() => setMailing(false)} />}
    </div>
  );
};

export const ATS = () => {
  useDocumentTitle('ATS pipeline');
  const navigate = useNavigate();
  const [filters, setFilters] = useUrlFilters();
  const [over, setOver] = useState(null);
  const jobs = useQuery({ queryKey: ['employer-jobs', 'options'], queryFn: () => employerJobApi.list({ limit: 200, status: 'active' }) });
  const params = { limit: 200, sort: '-createdAt', ...(filters.job ? { job: filters.job } : {}) };
  const query = useQuery({ queryKey: ['responses', 'ats', params], queryFn: () => responseApi.list(params) });
  const move = useAction(({ id, stage }) => responseApi.update(id, { stage }), { success: 'Candidate moved', invalidate: inv });
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const rows = query.data?.data || [];
  return (
    <div>
      <PageHeader title="ATS Pipeline" subtitle="Drag candidates between stages" actions={<SimpleSelect ariaLabel="Job" value={filters.job} onChange={(job) => setFilters({ job })} placeholder="All active jobs" className="max-w-[240px]" options={(jobs.data?.data || []).map((j) => ({ value: j._id, label: j.title }))} />} />
      <div className="flex gap-3 overflow-x-auto pb-3">
        {STAGES.map((stage) => {
          const cards = rows.filter((r) => r.stage === stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                setOver(null);
                const id = e.dataTransfer.getData('text/plain');
                if (id && rows.find((r) => r._id === id)?.stage !== stage) move.mutate({ id, stage });
              }}
              className={clsx('w-64 shrink-0 rounded-xl border p-2.5 transition-colors', over === stage ? 'border-brand-blue bg-brand-blue-tint' : 'border-brand-border bg-white')}
            >
              <p className="mb-2 flex items-center justify-between px-1 text-sm font-bold text-brand-dark">
                {STAGE_LABELS[stage]}
                <span className="rounded-full bg-brand-tint px-2 text-xs text-brand-gray">{cards.length}</span>
              </p>
              <div className="min-h-24 space-y-2">
                {cards.map((a) => (
                  <div key={a._id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', a._id)} onClick={() => navigate(`/employer/applications/${a._id}`)} className="cursor-grab rounded-lg border border-brand-border bg-white p-2.5 shadow-sm hover:border-brand-blue/40">
                    <p className="truncate text-sm font-medium text-brand-dark">{a.snapshot?.fullName}</p>
                    <p className="truncate text-xs text-brand-gray-muted">{a.job?.title}</p>
                    {/* touch devices have no drag and drop */}
                    <select aria-label="Move to stage" value={stage} onClick={(e) => e.stopPropagation()} onChange={(e) => move.mutate({ id: a._id, stage: e.target.value })} className="field-control mt-1.5 h-8 w-full px-1 text-xs md:hidden">
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {STAGE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const Interviews = () => {
  useDocumentTitle('Interviews');
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const params = { limit: 20, ...filters };
  const query = useQuery({ queryKey: ['interviews', params], queryFn: () => interviewApi.list(params) });
  const [editing, setEditing] = useState(null);
  const update = useAction(({ id, body }) => interviewApi.update(id, body), { success: 'Interview updated', invalidate: ['interviews'] });
  const columns = [
    { key: 'candidate', header: 'Candidate', render: (i) => i.candidate?.fullName || i.application?.snapshot?.fullName || '—' },
    { key: 'job', header: 'Job', render: (i) => i.job?.title },
    { key: 'when', header: 'When', render: (i) => formatDateTime(i.scheduledAt) },
    { key: 'mode', header: 'Mode', render: (i) => titleCase(i.mode) },
    { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
  ];
  return (
    <div>
      <PageHeader title="Interviews" actions={<SimpleSelect ariaLabel="Status" value={filters.status} onChange={(status) => setFilters({ status })} placeholder="All" options={['scheduled', 'rescheduled', 'completed', 'cancelled', 'no_show'].map((s) => ({ value: s, label: titleCase(s) }))} />} />
      <DataTable
        columns={columns}
        rows={query.data?.data}
        query={query}
        empty={<EmptyState icon="event" title="No interviews" description="Schedule one from an application." />}
        actions={(i) =>
          ['scheduled', 'rescheduled'].includes(i.status) && (
            <span className="inline-flex gap-1">
              <button aria-label="Reschedule or add feedback" title="Reschedule or feedback" onClick={() => setEditing(i)} className="p-1 text-brand-blue">
                <Icon name="edit_calendar" size={18} />
              </button>
              <button aria-label="Mark completed" title="Completed" onClick={() => update.mutate({ id: i._id, body: { status: 'completed' } })} className="p-1 text-brand-green">
                <Icon name="check_circle" size={18} />
              </button>
              <button aria-label="Mark no show" title="No show" onClick={() => update.mutate({ id: i._id, body: { status: 'no_show' } })} className="p-1 text-brand-orange">
                <Icon name="person_off" size={18} />
              </button>
              <button aria-label="Cancel" title="Cancel" onClick={() => update.mutate({ id: i._id, body: { status: 'cancelled' } })} className="p-1 text-brand-red">
                <Icon name="cancel" size={18} />
              </button>
            </span>
          )
        }
      />
      <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} />
      {editing && <InterviewModal interview={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};
