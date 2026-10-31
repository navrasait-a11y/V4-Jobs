import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import UpsellNotice from '../../components/employer/UpsellNotice';
import ReportModal from '../../components/common/ReportModal';
import Button from '../../components/ui/Button';
import { Avatar, Badge, DetailRow, PageHeader, Pagination, Section, SimpleSelect, StatusBadge } from '../../components/ui/data';
import { CardSkeleton, Drawer, EmptyState, ErrorState, Icon, Modal, PageLoader } from '../../components/ui/feedback';
import { CheckboxField, ChoiceChips, Field, SelectField, SuggestField, TextAreaField, TextField } from '../../components/ui/form';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import { employerJobApi, talentApi } from '../../services';
import { SCREENING_LABELS, formatCurrency, formatDate, monthsToExperience, placeLabel, timeAgo } from '../../utils/format';

const BLANK = { keywords: [], skills: [], locations: [], experienceMin: '', experienceMax: '', salaryMin: '', salaryMax: '', noticePeriods: [], industries: [], genders: [], withResume: false, verifiedMobile: false, activeIn: '', sort: 'relevance', jobId: null };

const compact = (f) =>
  Object.fromEntries(
    Object.entries(f)
      .filter(([, v]) => v !== '' && v !== null && v !== false && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => [k, ['experienceMin', 'experienceMax', 'salaryMin', 'salaryMax'].includes(k) ? Number(v) : v]),
  );

const FilterForm = ({ form, setForm, onSearch, onSave }) => {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
    >
      <SuggestField label="Keywords" lookup="key_skill" multiple allowCreate value={form.keywords} onChange={set('keywords')} />
      <SuggestField label="Must have skills" lookup="key_skill" multiple allowCreate value={form.skills} onChange={set('skills')} />
      <SuggestField label="Locations" multiple allowCreate max={10} value={form.locations} onChange={set('locations')} hint="Type a city and press Enter" />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Min exp (yrs)" type="number" min="0" value={form.experienceMin} onChange={set('experienceMin')} />
        <TextField label="Max exp (yrs)" type="number" min="0" value={form.experienceMax} onChange={set('experienceMax')} />
        <TextField label="Min salary" type="number" min="0" value={form.salaryMin} onChange={set('salaryMin')} />
        <TextField label="Max salary" type="number" min="0" value={form.salaryMax} onChange={set('salaryMax')} />
      </div>
      <SuggestField label="Industries" lookup="industry" multiple value={form.industries} onChange={set('industries')} />
      <SuggestField label="Notice period" lookup="notice_period" multiple value={form.noticePeriods} onChange={set('noticePeriods')} />
      <Field label="Gender">
        <ChoiceChips multiple options={['Male', 'Female', 'Other']} value={form.genders} onChange={set('genders')} />
      </Field>
      <SelectField label="Active in" options={[['1d', '1 day'], ['7d', '7 days'], ['15d', '15 days'], ['30d', '30 days'], ['2m', '2 months'], ['6m', '6 months'], ['1y', '1 year']].map(([value, label]) => ({ value, label }))} placeholder="Any time" value={form.activeIn} onChange={set('activeIn')} />
      <CheckboxField label="With resume only" checked={form.withResume} onChange={set('withResume')} />
      <CheckboxField label="Verified mobile only" checked={form.verifiedMobile} onChange={set('verifiedMobile')} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primaryBlue">
          Search
        </Button>
        <Button size="sm" variant="outline" onClick={onSave}>
          Save search
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setForm(BLANK)}>
          Reset
        </Button>
      </div>
    </form>
  );
};

const InviteModal = ({ ids, onClose, onDone }) => {
  const [jobId, setJobId] = useState('');
  const [message, setMessage] = useState('');
  const jobs = useQuery({ queryKey: ['employer-jobs', 'options'], queryFn: () => employerJobApi.list({ limit: 200, status: 'active' }) });
  const send = useAction(() => talentApi.invite(jobId, { candidateIds: ids, message: message || undefined }), {
    success: (r) => `${r.invited ?? ids.length} invites sent`,
    invalidate: ['subscriptions'],
    onSuccess: onDone,
  });
  return (
    <Modal open onClose={onClose} title={`Invite ${ids.length} candidate${ids.length > 1 ? 's' : ''}`} footer={<Button size="sm" variant="primaryBlue" disabled={!jobId} loading={send.isPending} onClick={() => send.mutate()}>Send invites</Button>}>
      <div className="space-y-4">
        <UpsellNotice error={send.error} />
        <SelectField label="Job" required options={(jobs.data?.data || []).map((j) => ({ value: j._id, label: j.title }))} value={jobId} onChange={(e) => setJobId(e.target.value)} />
        <TextAreaField label="Message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
    </Modal>
  );
};

const FolderModal = ({ ids, onClose }) => {
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const { data } = useQuery({ queryKey: ['folders'], queryFn: () => talentApi.folders({ tab: 'mine' }) });
  const add = useAction(
    async () => {
      const id = folder || (await talentApi.addFolder({ name }))._id;
      return talentApi.addToFolder(id, ids);
    },
    { success: 'Added to folder', invalidate: ['folders'], onSuccess: onClose },
  );
  return (
    <Modal open onClose={onClose} title="Add to folder" size="sm" footer={<Button size="sm" variant="primaryBlue" disabled={!folder && !name.trim()} loading={add.isPending} onClick={() => add.mutate()}>Add</Button>}>
      <div className="space-y-4">
        <SelectField label="Folder" options={(data?.folders || []).map((f) => ({ value: f._id, label: f.name }))} placeholder="New folder" value={folder} onChange={(e) => setFolder(e.target.value)} />
        {!folder && <TextField label="New folder name" value={name} onChange={(e) => setName(e.target.value)} />}
      </div>
    </Modal>
  );
};

const CandidateCard = ({ c, selected, onToggle }) => (
  <article className="surface p-4 transition-shadow hover:shadow-[var(--shadow-hover)]">
    <div className="flex gap-3">
      <input type="checkbox" aria-label={`Select ${c.name}`} checked={selected} onChange={onToggle} className="mt-1 h-4 w-4 shrink-0 accent-brand-blue" />
      <Avatar name={c.name} src={c.avatar?.url} size={48} />
      <div className="min-w-0 flex-1">
        <Link to={`/employer/candidates/${c.candidateId}`} className="flex items-center gap-1 font-semibold text-brand-dark hover:text-brand-blue">
          {c.name}
          {c.isVerified && <Icon name="verified" size={15} fill className="text-brand-green" />}
        </Link>
        <p className="text-sm text-brand-gray">{[c.currentJobTitle, c.currentEmployer].filter(Boolean).join(' at ') || c.resumeHeadline}</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-brand-gray-muted">
          <span>{monthsToExperience(c.totalExperienceMonths)}</span>
          {c.currentSalary && <span>{formatCurrency(c.currentSalary)}/mo</span>}
          {c.currentLocation && <span>{placeLabel(c.currentLocation)}</span>}
          {c.noticePeriod && <span>{c.noticePeriod}</span>}
          {c.lastActiveAt && <span>Active {timeAgo(c.lastActiveAt)}</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.matchScore !== undefined && <Badge tone="green">{c.matchScore}% match</Badge>}
          {c.isBoosted && <Badge tone="orange">Boosted</Badge>}
          {c.hasResume && <Badge tone="gray">Resume</Badge>}
          {(c.keySkills || []).slice(0, 5).map((s) => (
            <Badge key={s} tone="blue">
              {s}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  </article>
);

const Candidates = () => {
  useDocumentTitle('Search candidates');
  const [params] = useSearchParams();
  const [form, setForm] = useState(BLANK);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [inviting, setInviting] = useState(false);
  const [filing, setFiling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const search = useMutation({ mutationFn: ({ filters, p }) => talentApi.search(filters, { page: p, limit: 20 }) });
  const run = (filters = form, p = 1) => {
    setFilterOpen(false);
    search.mutate({ filters: compact(filters), p });
  };
  const fromJob = params.get('job');
  const saved = params.get('search');
  useEffect(() => {
    if (fromJob) {
      talentApi.fromJob(fromJob).then((f) => {
        const next = { ...BLANK, ...f, jobId: fromJob };
        setForm(next);
        run(next);
      }).catch((e) => toast.error(e.message));
    } else if (saved) {
      talentApi.searches({ tab: 'all', limit: 100 }).then((r) => {
        const hit = r.data.find((s) => s._id === saved);
        if (hit) {
          const next = { ...BLANK, ...hit.filters };
          setForm(next);
          run(next);
        }
      }).catch(() => {});
    } else run(BLANK);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSearch = useAction(() => talentApi.saveSearch({ name, filters: compact(form) }), {
    success: 'Search saved',
    invalidate: ['saved-searches'],
    onSuccess: () => {
      setSaving(false);
      setName('');
    },
  });
  const rows = search.data?.data || [];
  const filters = <FilterForm form={form} setForm={setForm} onSearch={() => run()} onSave={() => setSaving(true)} />;

  return (
    <div>
      <PageHeader
        title="Search Candidates"
        subtitle={search.data ? `${search.data.meta?.total ?? 0}${search.data.meta?.capped ? '+' : ''} candidates` : undefined}
        actions={
          <>
            <Button size="sm" variant="outline" className="lg:hidden" onClick={() => setFilterOpen(true)}>
              Filters
            </Button>
            <SimpleSelect
              ariaLabel="Sort"
              value={form.sort}
              onChange={(sort) => {
                const next = { ...form, sort };
                setForm(next);
                run(next);
              }}
              options={[{ value: 'relevance', label: 'Relevance' }, { value: 'freshness', label: 'Recently updated' }, { value: 'last_active', label: 'Last active' }]}
            />
          </>
        }
      />
      <UpsellNotice error={search.error} />
      <div className="flex gap-4">
        <aside className="hidden w-72 shrink-0 self-start surface p-4 lg:block">{filters}</aside>
        <div className="min-w-0 flex-1">
          {selected.length > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-brand-blue-tint p-2.5 text-sm">
              <b>{selected.length} selected</b>
              <Button size="sm" variant="primaryBlue" onClick={() => setInviting(true)}>
                Invite to job
              </Button>
              <Button size="sm" variant="outline" onClick={() => setFiling(true)}>
                Add to folder
              </Button>
            </div>
          )}
          {search.isPending && <CardSkeleton count={4} />}
          {search.isError && search.error.status !== 402 && <ErrorState error={search.error} onRetry={() => run()} />}
          {search.isSuccess && !rows.length && <EmptyState icon="person_search" title="No candidates match" description="Try widening your filters." />}
          <div className="space-y-3">
            {rows.map((c) => (
              <CandidateCard key={c.candidateId} c={c} selected={selected.includes(c.candidateId)} onToggle={() => setSelected((s) => (s.includes(c.candidateId) ? s.filter((x) => x !== c.candidateId) : [...s, c.candidateId]))} />
            ))}
          </div>
          <Pagination meta={search.data?.meta} onPage={(p) => run(form, p)} />
        </div>
      </div>
      <Drawer open={filterOpen} onClose={() => setFilterOpen(false)} title="Filters" width="max-w-sm">
        {filters}
      </Drawer>
      {inviting && (
        <InviteModal
          ids={selected}
          onClose={() => setInviting(false)}
          onDone={() => {
            setInviting(false);
            setSelected([]);
          }}
        />
      )}
      {filing && (
        <FolderModal
          ids={selected}
          onClose={() => {
            setFiling(false);
            setSelected([]);
          }}
        />
      )}
      <Modal open={saving} onClose={() => setSaving(false)} title="Save search" size="sm" footer={<Button size="sm" variant="primaryBlue" disabled={!name.trim()} loading={saveSearch.isPending} onClick={() => saveSearch.mutate()}>Save</Button>}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      </Modal>
    </div>
  );
};

export const CandidateResumeDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  useDocumentTitle('Candidate');
  const query = useQuery({ queryKey: ['talent-candidate', id], queryFn: () => talentApi.candidate(id) });
  const [contact, setContact] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [filing, setFiling] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [comment, setComment] = useState('');
  const unlock = useAction(() => talentApi.unlock(id), { silent: true, invalidate: ['subscriptions'], onSuccess: setContact, onError: (e) => e.status !== 402 && toast.error(e.message) });
  const resume = useAction(() => talentApi.resume(id), { silent: true, invalidate: ['subscriptions'], onSuccess: (r) => window.open(r.url, '_blank', 'noopener'), onError: (e) => e.status !== 402 && toast.error(e.message) });
  const track = useAction((body) => talentApi.track(id, body), { success: 'Saved', invalidate: ['talent-candidate'] });
  const block = useAction(() => talentApi.block(id), { success: 'Candidate blocked', onSuccess: () => navigate('/employer/candidates') });
  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const d = query.data;
  const c = d.candidate || d.card || d;
  const p = d.profile || d;
  const shown = contact || (c.contactUnlocked ? c : null);
  const name = c.name || c.fullName;
  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/employer/candidates" className="text-sm font-medium text-brand-blue hover:underline">
        ← Search
      </Link>
      <UpsellNotice error={unlock.error || resume.error} />
      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section>
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={name} src={c.avatar?.url} size={64} />
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold text-brand-dark">{name}</h1>
                <p className="text-sm text-brand-gray">{p.resumeHeadline}</p>
                <p className="text-xs text-brand-gray-muted">{placeLabel(p.currentLocation)}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(c.hasResume ?? Boolean(p.resume?.name)) && (
                <Button size="sm" variant="primaryBlue" loading={resume.isPending} onClick={() => resume.mutate()}>
                  Download resume
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setInviting(true)}>
                Invite to job
              </Button>
              <Button size="sm" variant="outline" onClick={() => setFiling(true)}>
                Add to folder
              </Button>
              <Button size="sm" variant="ghost" onClick={() => block.mutate()}>
                Block
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReporting(true)}>
                Report
              </Button>
            </div>
          </Section>
          {p.profileSummary && (
            <Section title="Summary">
              <p className="whitespace-pre-line text-sm text-brand-gray">{p.profileSummary}</p>
            </Section>
          )}
          {p.keySkills?.length > 0 && (
            <Section title="Skills">
              <div className="flex flex-wrap gap-1.5">
                {p.keySkills.map((s) => (
                  <Badge key={s} tone="blue">
                    {s}
                  </Badge>
                ))}
              </div>
            </Section>
          )}
          {p.employments?.length > 0 && (
            <Section title="Employment">
              <ul className="space-y-3 text-sm">
                {p.employments.map((e) => (
                  <li key={e._id}>
                    <p className="font-semibold text-brand-dark">{e.jobTitle}, {e.employerName}</p>
                    <p className="text-xs text-brand-gray-muted">{formatDate(e.startDate, 'MMM yyyy')} - {e.isCurrent ? 'Present' : formatDate(e.endDate, 'MMM yyyy')}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {p.educations?.length > 0 && (
            <Section title="Education">
              <ul className="space-y-2 text-sm text-brand-gray">
                {p.educations.map((e) => (
                  <li key={e._id}>{[e.degree || e.level, e.specialisation, e.institution].filter(Boolean).join(', ')}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>
        <aside className="space-y-4">
          <Section title="Contact">
            {shown ? (
              <dl className="space-y-3">
                <DetailRow label="Email" value={shown.email} />
                <DetailRow label="Mobile" value={shown.mobile} />
              </dl>
            ) : (
              <>
                <p className="mb-2 text-sm text-brand-gray">{c.email} · {c.mobile}</p>
                <Button size="sm" variant="primary" loading={unlock.isPending} onClick={() => unlock.mutate()}>
                  Unlock contact (1 credit)
                </Button>
              </>
            )}
          </Section>
          <Section title="Tracking">
            <SelectField label="Screening" options={Object.entries(SCREENING_LABELS).map(([value, label]) => ({ value, label }))} value={d.trackingDetail?.screeningStatus || ''} onChange={(e) => track.mutate({ screeningStatus: e.target.value })} />
            <TextAreaField className="mt-3" label="Comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={!comment.trim()}
              onClick={() => {
                track.mutate({ comment });
                setComment('');
              }}
            >
              Add comment
            </Button>
          </Section>
          {d.applications?.length > 0 && (
            <Section title="Applications to you">
              <ul className="space-y-2 text-sm">
                {d.applications.map((a) => (
                  <li key={a._id} className="flex items-center justify-between gap-2">
                    <Link to={`/employer/applications/${a._id}`} className="truncate text-brand-dark hover:text-brand-blue">
                      {a.job?.title}
                    </Link>
                    <StatusBadge status={a.stage} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </aside>
      </div>
      {inviting && <InviteModal ids={[id]} onClose={() => setInviting(false)} onDone={() => setInviting(false)} />}
      {filing && <FolderModal ids={[id]} onClose={() => setFiling(false)} />}
      {reporting && <ReportModal targetType="candidate" targetId={id} onClose={() => setReporting(false)} />}
    </div>
  );
};

export default Candidates;
