import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import UpsellNotice from '../../components/employer/UpsellNotice';
import Button from '../../components/ui/Button';
import { PageHeader, Section, SimpleSelect } from '../../components/ui/data';
import { Alert, Icon, PageLoader } from '../../components/ui/feedback';
import { CheckboxField, ChoiceChips, Field, LocationField, SelectField, SuggestField, TextAreaField, TextField } from '../../components/ui/form';
import useAuth from '../../hooks/useAuth';
import { useAction, useDocumentTitle, useLookups } from '../../hooks/useData';
import { employerJobApi } from '../../services';
import { toInputDate } from '../../utils/format';

const BLANK = {
  kind: 'job',
  title: '',
  designation: '',
  description: '',
  responsibilities: '',
  keySkills: [],
  industries: [],
  departments: [],
  roles: [],
  employmentTypes: [],
  jobModes: [],
  shifts: [],
  openings: 1,
  experience: { min: 0, max: '' },
  salary: { min: '', max: '', period: 'monthly', hidden: false },
  perks: [],
  stipend: { min: '', max: '' },
  duration: { value: '', unit: 'months' },
  education: { levels: [] },
  gender: 'any',
  languages: [],
  noticePeriod: '',
  locations: [],
  isRemote: false,
  consultancyClient: { name: '', hideName: false },
  contact: { name: '', email: '', mobile: '', showToCandidates: false },
  questions: [],
  applyExternalUrl: '',
  deadlineAt: '',
  googleJobsEnabled: true,
};

const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

const stripEmpty = (obj) =>
  Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== '' && v !== undefined && v !== null)
      .map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? stripEmpty(v) : v]),
  );

/** Drops empty values at every depth so drafts save with whatever has been filled so far. */
function toPayload(f) {
  const body = {
    ...f,
    openings: num(f.openings),
    experience: { min: num(f.experience.min) ?? 0, max: num(f.experience.max) },
    salary: { ...f.salary, min: num(f.salary.min), max: num(f.salary.max) },
    stipend: f.kind === 'internship' ? { ...f.stipend, min: num(f.stipend?.min), max: num(f.stipend?.max) } : undefined,
    duration: f.kind === 'internship' && f.duration?.value ? { ...f.duration, value: num(f.duration.value) } : undefined,
    consultancyClient: f.consultancyClient?.name ? f.consultancyClient : undefined,
    questions: f.questions.filter((q) => q.question.trim()),
  };
  return stripEmpty(body);
}

const QuestionEditor = ({ value, onChange }) => {
  const update = (i, patch) => onChange(value.map((q, x) => (x === i ? { ...q, ...patch } : q)));
  return (
    <div className="space-y-3">
      {value.map((q, i) => (
        <div key={i} className="rounded-lg border border-brand-border p-3">
          <div className="flex items-start gap-2">
            <TextField className="flex-1" label={`Question ${i + 1}`} value={q.question} onChange={(e) => update(i, { question: e.target.value })} />
            <button type="button" aria-label="Remove question" onClick={() => onChange(value.filter((_, x) => x !== i))} className="mt-8 text-brand-gray-muted hover:text-brand-red">
              <Icon name="delete" size={18} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <SimpleSelect ariaLabel="Answer type" value={q.type} onChange={(v) => update(i, { type: v })} options={[{ value: 'text', label: 'Text' }, { value: 'yes_no', label: 'Yes / No' }, { value: 'number', label: 'Number' }, { value: 'choice', label: 'Choice' }]} />
            <CheckboxField label="Required" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} />
          </div>
          {q.type === 'choice' && <TextField className="mt-2" label="Options (comma separated)" value={(q.options || []).join(',')} onChange={(e) => update(i, { options: e.target.value.split(',') })} />}
        </div>
      ))}
      {value.length < 10 && (
        <Button size="sm" variant="outline" onClick={() => onChange([...value, { question: '', type: 'text', required: false, options: [] }])}>
          Add question
        </Button>
      )}
    </div>
  );
};

const PostJob = () => {
  const { id: routeId } = useParams();
  useDocumentTitle(routeId ? 'Edit job' : 'Post a job');
  const navigate = useNavigate();
  const { organization } = useAuth();
  const consultancy = organization?.type === 'consultancy';
  const lookups = useLookups('employment_type', 'job_mode', 'shift', 'perk', 'notice_period', 'education_level');
  const [jobId, setJobId] = useState(routeId || null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [featured, setFeatured] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const loaded = useRef(!routeId);

  const existing = useQuery({ queryKey: ['employer-job', routeId], queryFn: () => employerJobApi.get(routeId), enabled: Boolean(routeId) });
  useEffect(() => {
    if (!existing.data) return;
    const j = existing.data.job || existing.data;
    setForm({ ...BLANK, ...j, experience: { ...BLANK.experience, ...j.experience }, salary: { ...BLANK.salary, ...j.salary }, stipend: { ...BLANK.stipend, ...j.stipend }, duration: { ...BLANK.duration, ...j.duration }, education: { ...BLANK.education, ...j.education }, consultancyClient: { ...BLANK.consultancyClient, ...j.consultancyClient }, contact: { ...BLANK.contact, ...j.contact }, deadlineAt: toInputDate(j.deadlineAt) });
    loaded.current = true;
  }, [existing.data]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const setIn = (group, k) => (e) => setForm((f) => ({ ...f, [group]: { ...f[group], [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e } }));

  const editable = !routeId || form.status === 'draft';
  const saveDraft = async () => {
    const payload = toPayload(form);
    if (jobId) {
      const { status: _s, slug: _sl, _id, organization: _o, stats: _st, orgSnapshot: _os, createdAt: _c, updatedAt: _u, ...patch } = payload;
      await employerJobApi.update(jobId, patch);
      return jobId;
    }
    const created = await employerJobApi.create({ ...payload, publish: false });
    const id = created._id || created.job?._id;
    setJobId(id);
    return id;
  };

  // Draft auto-save: only once a title exists and the job is still a draft.
  const snapshot = useMemo(() => JSON.stringify(form), [form]);
  const lastSaved = useRef(snapshot);
  useEffect(() => {
    if (!loaded.current || !editable || form.title.trim().length < 3 || snapshot === lastSaved.current) return undefined;
    const t = setTimeout(async () => {
      try {
        await saveDraft();
        lastSaved.current = snapshot;
        setSavedAt(new Date());
      } catch {
        /* the explicit save reports errors */
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  const publish = useAction(
    async () => {
      const id = await saveDraft();
      lastSaved.current = snapshot;
      return employerJobApi.publish(id, { featured });
    },
    {
      invalidate: ['employer-jobs', 'subscriptions'],
      silent: true,
      onSuccess: (j) => {
        const status = j.status || j.job?.status;
        toast.success(status === 'active' ? 'Your job is live' : 'Job submitted for review');
        navigate('/employer/jobs');
      },
      onError: (e) => {
        setErrors(e.fieldErrors || {});
        if (e.status !== 402) toast.error(e.message);
      },
    },
  );
  const update = useAction(saveDraft, { success: 'Job updated', invalidate: ['employer-jobs'], onSuccess: () => navigate('/employer/jobs') });

  if (routeId && existing.isPending) return <PageLoader />;
  const internship = form.kind === 'internship';

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={routeId ? 'Edit job' : 'Post a job'} subtitle={savedAt ? `Draft saved at ${savedAt.toLocaleTimeString()}` : 'Drafts save automatically'} />
      <UpsellNotice error={publish.error} />
      {Object.keys(errors).length > 0 && <Alert tone="error" className="mb-4">{Object.entries(errors).map(([k, m]) => `${k}: ${m}`).join('. ')}</Alert>}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (editable) publish.mutate();
          else update.mutate();
        }}
      >
        <Section title="Basics">
          <div className="space-y-4">
            <ChoiceChips options={[{ value: 'job', label: 'Job' }, { value: 'internship', label: 'Internship' }]} value={form.kind} onChange={(v) => v && set('kind')(v)} />
            <SuggestField label="Job title" required lookup="job_title" allowCreate value={form.title} onChange={set('title')} error={errors.title} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Designation" value={form.designation} onChange={set('designation')} />
              <TextField label="Openings" type="number" min="1" value={form.openings} onChange={set('openings')} />
            </div>
            {consultancy && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField label="Client name" value={form.consultancyClient.name} onChange={setIn('consultancyClient', 'name')} />
                <CheckboxField className="sm:mt-8" label="Hide client name from candidates" checked={form.consultancyClient.hideName} onChange={setIn('consultancyClient', 'hideName')} />
              </div>
            )}
            <TextAreaField label="Job description" rows={7} value={form.description} onChange={set('description')} error={errors.description} hint="Required to publish" />
            <TextAreaField label="Responsibilities" rows={4} value={form.responsibilities} onChange={set('responsibilities')} />
            <SuggestField label="Key skills" lookup="key_skill" multiple max={30} allowCreate value={form.keySkills} onChange={set('keySkills')} error={errors.keySkills} />
          </div>
        </Section>

        <Section title="Location and work type">
          <div className="space-y-4">
            <LocationField label="Job locations" multiple max={15} value={form.locations} onChange={set('locations')} error={errors.locations} hint="At least one, required to publish" />
            <CheckboxField label="This is a remote job" checked={form.isRemote} onChange={set('isRemote')} />
            <Field label="Work mode">
              <ChoiceChips multiple options={lookups.job_mode} value={form.jobModes} onChange={set('jobModes')} />
            </Field>
            <Field label="Employment type">
              <ChoiceChips multiple options={lookups.employment_type} value={form.employmentTypes} onChange={set('employmentTypes')} />
            </Field>
            <Field label="Shift">
              <ChoiceChips multiple options={lookups.shift} value={form.shifts} onChange={set('shifts')} />
            </Field>
          </div>
        </Section>

        <Section title={internship ? 'Stipend and duration' : 'Experience and salary'}>
          {internship ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <TextField label="Min stipend" type="number" min="0" value={form.stipend.min} onChange={setIn('stipend', 'min')} />
              <TextField label="Max stipend" type="number" min="0" value={form.stipend.max} onChange={setIn('stipend', 'max')} />
              <TextField label="Duration" type="number" min="1" value={form.duration.value} onChange={setIn('duration', 'value')} />
              <SelectField label="Unit" placeholder={null} options={['days', 'weeks', 'months']} value={form.duration.unit} onChange={setIn('duration', 'unit')} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField label="Min experience (years)" type="number" min="0" value={form.experience.min} onChange={setIn('experience', 'min')} />
                <TextField label="Max experience (years)" type="number" min="0" value={form.experience.max} onChange={setIn('experience', 'max')} />
                <TextField label="Min salary" type="number" min="0" value={form.salary.min} onChange={setIn('salary', 'min')} />
                <TextField label="Max salary" type="number" min="0" value={form.salary.max} onChange={setIn('salary', 'max')} />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <SelectField label="Salary period" placeholder={null} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} value={form.salary.period} onChange={setIn('salary', 'period')} />
                <CheckboxField className="sm:mt-6" label="Hide salary from candidates" checked={form.salary.hidden} onChange={setIn('salary', 'hidden')} />
              </div>
              <Field label="Perks">
                <ChoiceChips multiple options={lookups.perk} value={form.perks} onChange={set('perks')} />
              </Field>
            </div>
          )}
        </Section>

        <Section title="Candidate requirements">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SuggestField label="Industries" lookup="industry" multiple max={5} value={form.industries} onChange={set('industries')} />
            <SuggestField label="Departments" lookup="department" multiple value={form.departments} onChange={set('departments')} />
            <SuggestField label="Roles" lookup="job_role" multiple max={10} value={form.roles} onChange={set('roles')} />
            <SuggestField label="Languages" lookup="language" multiple value={form.languages} onChange={set('languages')} />
            <SelectField label="Notice period" options={lookups.notice_period} value={form.noticePeriod} onChange={set('noticePeriod')} />
            <SelectField label="Gender" placeholder={null} options={[{ value: 'any', label: 'Any' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'transgender', label: 'Transgender' }, { value: 'other', label: 'Other' }]} value={form.gender} onChange={set('gender')} />
          </div>
          <Field label="Education" className="mt-4">
            <ChoiceChips multiple options={lookups.education_level} value={form.education.levels || []} onChange={setIn('education', 'levels')} />
          </Field>
        </Section>

        <Section title="Screening questions">
          <QuestionEditor value={form.questions} onChange={set('questions')} />
        </Section>

        <Section title="Application settings">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Application deadline" type="date" min={new Date()} value={form.deadlineAt} onChange={set('deadlineAt')} />
              <TextField label="External apply URL" type="url" value={form.applyExternalUrl} onChange={set('applyExternalUrl')} />
              <TextField label="Contact name" value={form.contact.name} onChange={setIn('contact', 'name')} />
              <TextField label="Contact email" type="email" value={form.contact.email} onChange={setIn('contact', 'email')} />
            </div>
            <CheckboxField label="Show contact details to candidates" checked={form.contact.showToCandidates} onChange={setIn('contact', 'showToCandidates')} />
            <CheckboxField label="List on Google Jobs" checked={form.googleJobsEnabled} onChange={set('googleJobsEnabled')} />
            {editable && <CheckboxField label="Feature this job (uses 1 featured credit)" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />}
          </div>
        </Section>

        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 surface p-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/employer/jobs')}>
            Back to jobs
          </Button>
          <Button type="submit" size="sm" variant="primary" loading={publish.isPending || update.isPending}>
            {editable ? 'Publish job' : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default PostJob;
