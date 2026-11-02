import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import UpsellNotice from '../../components/employer/UpsellNotice';
import ReportModal from '../../components/common/ReportModal';
import Button from '../../components/ui/Button';
import { Avatar, Badge, DetailRow, PageHeader, Pagination, Section, SimpleSelect, StatusBadge } from '../../components/ui/data';
import { CardSkeleton, Drawer, EmptyState, ErrorState, Icon, Modal, PageLoader } from '../../components/ui/feedback';
import { CheckboxField, ChoiceChips, Field, SelectField, SuggestField, TagInput, TextAreaField, TextField } from '../../components/ui/form';
import HierarchyField from '../../components/ui/HierarchyField';
import { useAction, useDocumentTitle, useLookups } from '../../hooks/useData';
import useAuth from '../../hooks/useAuth';
import { employerJobApi, talentApi } from '../../services';
import { SCREENING_LABELS, formatCurrency, formatDate, monthsToExperience, placeLabel, timeAgo } from '../../utils/format';
import {
  AGE_OPTIONS,
  CANDIDATES_WITH_OPTIONS,
  CANDIDATE_TYPE_OPTIONS,
  COMPANY_SCOPE_OPTIONS,
  DISTANCE_OPTIONS,
  EXPERIENCE_OPTIONS,
  HIDE_CANDIDATE_OPTIONS,
  LAST_ACTIVE_OPTIONS,
  monthsToYears,
  yearsToMonths,
} from '../../utils/options';

const BLANK = {
  clientHiringFor: '',
  keywords: [],
  mandatoryKeywords: [],
  keywordMode: 'any',
  experienceLevels: [],
  expMin: '',
  expMax: '',
  locations: [],
  distanceKm: '',
  relocateInclude: [],
  relocateExclude: [],
  salaryMin: '',
  salaryMax: '',
  mustHaveKeywords: [],
  excludeKeywords: [],
  industries: [],
  subIndustries: [],
  departments: [],
  functions: [],
  roles: [],
  companyTypes: [],
  companies: [],
  companyScope: 'both',
  employmentTypes: [],
  shifts: [],
  jobModes: [],
  noticePeriods: [],
  assets: [],
  educationLevels: [],
  degrees: [],
  specialisations: [],
  institutions: [],
  educationTypes: [],
  educationStatuses: [],
  passingYearFrom: '',
  passingYearTo: '',
  certifications: [],
  genders: [],
  maritalStatuses: [],
  ageMin: '',
  ageMax: '',
  englishFluency: [],
  languages: [],
  documents: [],
  diversity: [],
  disabilityStatuses: [],
  disabilityTypes: [],
  militaryStatuses: [],
  serviceTypes: [],
  candidateTypes: [],
  candidatesWith: [],
  lastActive: '',
  hide: [],
  sort: 'relevance',
};

const NUMBERS = ['salaryMin', 'salaryMax', 'passingYearFrom', 'passingYearTo', 'ageMin', 'ageMax', 'distanceKm'];

/** Form state -> API filters: drops empty values, months -> years, "all keywords mandatory" -> keywordMode. */
const compact = (f) => {
  const out = Object.fromEntries(
    Object.entries(f)
      .filter(([k, v]) => !['expMin', 'expMax'].includes(k) && v !== '' && v !== null && v !== false && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => [k, NUMBERS.includes(k) ? Number(v) : v]),
  );
  if (f.expMin !== '' && f.expMin !== undefined) out.experienceMin = monthsToYears(f.expMin);
  if (f.expMax !== '' && f.expMax !== undefined) out.experienceMax = monthsToYears(f.expMax);
  if (!out.locations?.length) delete out.distanceKm;
  return out;
};

/** Saved / prefilled filters (years) -> form state (months). */
const fromFilters = (f = {}) => ({
  ...BLANK,
  ...f,
  expMin: yearsToMonths(f.experienceMin),
  expMax: yearsToMonths(f.experienceMax),
  ...Object.fromEntries(NUMBERS.filter((k) => f[k] !== undefined).map((k) => [k, String(f[k])])),
});

const Group = ({ title, children, defaultOpen = false, count = 0 }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-brand-border py-3 last:border-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between text-left text-sm font-semibold text-brand-dark">
        <span className="flex items-center gap-2">
          {title}
          {count > 0 && <span className="rounded-full bg-brand-blue-tint px-1.5 text-[11px] text-brand-blue">{count}</span>}
        </span>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} className="text-brand-gray-muted" />
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
};

const filled = (form, keys) => keys.filter((k) => (Array.isArray(form[k]) ? form[k].length : form[k] !== '' && form[k] !== undefined && form[k] !== BLANK[k])).length;

/** Advanced Candidate Search / side filters ("Other Forms" Excel). */
const FilterForm = ({ form, setForm, onSearch, onSave, consultancy }) => {
  const lookups = useLookups(
    'experience_level',
    'relocate_option',
    'employer_type',
    'employment_type',
    'shift',
    'job_mode',
    'notice_period',
    'education_level',
    'education_type',
    'education_status',
    'english_fluency',
    'diversity_hiring',
    'disability_status',
    'military_status',
    'service_type',
  );
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const years = Array.from({ length: 40 }, (_, i) => String(new Date().getFullYear() + 4 - i));
  return (
    <form
      className="space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
    >
      <Group title="Keywords" defaultOpen count={filled(form, ['keywords', 'clientHiringFor', 'mustHaveKeywords', 'excludeKeywords'])}>
        {consultancy && <SuggestField label="Company you're hiring for" lookup="company_name" allowCreate value={form.clientHiringFor} onChange={set('clientHiringFor')} placeholder="Enter company name" />}
        <TagInput
          label="Keywords"
          max={20}
          value={form.keywords}
          onChange={set('keywords')}
          starred={form.mandatoryKeywords}
          onStarredChange={set('mandatoryKeywords')}
          placeholder="Job titles, skills, roles, companies, name, mobile, email"
          hint="Up to 20. Tap the star to make a keyword mandatory"
        />
        <CheckboxField label="Mark all keywords as mandatory" checked={form.keywordMode === 'all'} onChange={(e) => set('keywordMode')(e.target.checked ? 'all' : 'any')} />
        <TagInput label="Must have keywords" max={15} value={form.mustHaveKeywords} onChange={set('mustHaveKeywords')} placeholder="Add must have keywords" />
        <TagInput label="Exclude keywords" max={15} value={form.excludeKeywords} onChange={set('excludeKeywords')} placeholder="Add excluded keywords" />
      </Group>

      <Group title="Experience & salary" defaultOpen count={filled(form, ['experienceLevels', 'expMin', 'expMax', 'salaryMin', 'salaryMax'])}>
        <Field label="Experience level">
          <ChoiceChips multiple options={lookups.experience_level} value={form.experienceLevels} onChange={set('experienceLevels')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Min exp." options={EXPERIENCE_OPTIONS} value={form.expMin} onChange={set('expMin')} placeholder="Min Exp." />
          <SelectField label="Max exp." options={EXPERIENCE_OPTIONS} value={form.expMax} onChange={set('expMax')} placeholder="Max Exp." />
          <TextField label="Min. in-hand / month" type="number" min="0" value={form.salaryMin} onChange={set('salaryMin')} />
          <TextField label="Max. in-hand / month" type="number" min="0" value={form.salaryMax} onChange={set('salaryMax')} />
        </div>
      </Group>

      <Group title="Locations" count={filled(form, ['locations', 'distanceKm', 'relocateInclude', 'relocateExclude'])}>
        <TagInput label="Locations" max={4} value={form.locations} onChange={set('locations')} placeholder="City and press Enter" hint="Up to 4 (district / city / state)" />
        <SelectField label="Show candidates within" options={DISTANCE_OPTIONS} value={form.distanceKm} onChange={set('distanceKm')} placeholder="Only these locations" />
        <Field label="Include candidates who have mentioned">
          <ChoiceChips multiple options={lookups.relocate_option} value={form.relocateInclude} onChange={set('relocateInclude')} />
        </Field>
        <Field label="Exclude candidates who have mentioned">
          <ChoiceChips multiple options={lookups.relocate_option} value={form.relocateExclude} onChange={set('relocateExclude')} />
        </Field>
      </Group>

      <Group title="Industry, role & company" count={filled(form, ['industries', 'departments', 'roles', 'companyTypes', 'companies'])}>
        <HierarchyField kind="industry" label="Industry" value={{ parents: form.industries, children: form.subIndustries }} onChange={({ parents, children }) => setForm((f) => ({ ...f, industries: parents, subIndustries: children }))} />
        <SuggestField label="Job roles" lookup="job_role" limit={20} multiple max={20} value={form.roles} onChange={set('roles')} />
        <HierarchyField kind="department" label="Department" value={{ parents: form.departments, children: form.functions }} onChange={({ parents, children }) => setForm((f) => ({ ...f, departments: parents, functions: children }))} />
        <Field label="Company type">
          <ChoiceChips multiple options={lookups.employer_type} value={form.companyTypes} onChange={set('companyTypes')} />
        </Field>
        <TagInput label="Search in company name" max={20} value={form.companies} onChange={set('companies')} placeholder="Company name and press Enter" />
        <SelectField label="Select company type" placeholder={null} options={COMPANY_SCOPE_OPTIONS} value={form.companyScope} onChange={set('companyScope')} />
      </Group>

      <Group title="Work preferences" count={filled(form, ['employmentTypes', 'shifts', 'jobModes', 'noticePeriods', 'assets'])}>
        <SuggestField label="Candidate employment type" lookup="employment_type" multiple value={form.employmentTypes} onChange={set('employmentTypes')} />
        <Field label="Shift type">
          <ChoiceChips multiple options={lookups.shift.filter((s) => s !== 'Any')} value={form.shifts} onChange={set('shifts')} />
        </Field>
        <Field label="Work mode">
          <ChoiceChips multiple options={lookups.job_mode.filter((s) => s !== 'Any')} value={form.jobModes} onChange={set('jobModes')} />
        </Field>
        <Field label="Notice period">
          <ChoiceChips multiple options={lookups.notice_period} value={form.noticePeriods} onChange={set('noticePeriods')} />
        </Field>
        <SuggestField label="Assets availability" lookup="asset" limit={30} multiple value={form.assets} onChange={set('assets')} />
      </Group>

      <Group title="Education & certifications" count={filled(form, ['educationLevels', 'degrees', 'specialisations', 'institutions', 'educationTypes', 'educationStatuses', 'passingYearFrom', 'passingYearTo', 'certifications'])}>
        <Field label="Education">
          <ChoiceChips multiple options={lookups.education_level} value={form.educationLevels} onChange={set('educationLevels')} />
        </Field>
        <SuggestField label="Degree / course" lookup="degree" parents={form.educationLevels.join('|') || undefined} multiple value={form.degrees} onChange={set('degrees')} />
        <SuggestField label="Specialisation" lookup="specialisation" multiple value={form.specialisations} onChange={set('specialisations')} />
        <SuggestField label="Institution / college" lookup="institution" multiple allowCreate value={form.institutions} onChange={set('institutions')} />
        <Field label="Education type">
          <ChoiceChips multiple options={lookups.education_type} value={form.educationTypes} onChange={set('educationTypes')} />
        </Field>
        <Field label="Education status">
          <ChoiceChips multiple options={lookups.education_status} value={form.educationStatuses} onChange={set('educationStatuses')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Completion from year" options={years} value={form.passingYearFrom} onChange={set('passingYearFrom')} placeholder="From Year" />
          <SelectField label="To year" options={years} value={form.passingYearTo} onChange={set('passingYearTo')} placeholder="To Year" />
        </div>
        <SuggestField label="Certifications" lookup="certification" multiple allowCreate value={form.certifications} onChange={set('certifications')} />
      </Group>

      <Group title="Diversity & other criteria" count={filled(form, ['genders', 'maritalStatuses', 'ageMin', 'ageMax', 'englishFluency', 'languages', 'documents', 'diversity', 'disabilityStatuses', 'militaryStatuses', 'serviceTypes'])}>
        <Field label="Gender">
          <ChoiceChips multiple options={['Male', 'Female']} value={form.genders} onChange={set('genders')} />
        </Field>
        <Field label="Marital status">
          <ChoiceChips multiple options={['Single', 'Married']} value={form.maritalStatuses} onChange={set('maritalStatuses')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Min. age" options={AGE_OPTIONS.slice(0, -1)} value={form.ageMin} onChange={set('ageMin')} placeholder="Min. Age" />
          <SelectField label="Max. age" options={AGE_OPTIONS.slice(0, -1)} value={form.ageMax} onChange={set('ageMax')} placeholder="Max. Age" />
        </div>
        <Field label="English fluency level">
          <ChoiceChips multiple options={lookups.english_fluency} value={form.englishFluency} onChange={set('englishFluency')} />
        </Field>
        <SuggestField label="Language known" lookup="language" multiple value={form.languages} onChange={set('languages')} />
        <SuggestField label="Documents availability" lookup="candidate_document" limit={40} multiple value={form.documents} onChange={set('documents')} />
        <Field label="Diversity hiring">
          <ChoiceChips multiple options={lookups.diversity_hiring} value={form.diversity} onChange={set('diversity')} />
        </Field>
        <Field label="Disability status">
          <ChoiceChips multiple options={lookups.disability_status} value={form.disabilityStatuses} onChange={set('disabilityStatuses')} />
        </Field>
        {form.disabilityStatuses.some((s) => /^have/i.test(s)) && <SuggestField label="Disability type" lookup="disability_type" limit={30} multiple value={form.disabilityTypes} onChange={set('disabilityTypes')} />}
        <Field label="Military experience">
          <ChoiceChips multiple options={lookups.military_status} value={form.militaryStatuses} onChange={set('militaryStatuses')} />
        </Field>
        <Field label="Service type">
          <ChoiceChips multiple options={lookups.service_type} value={form.serviceTypes} onChange={set('serviceTypes')} />
        </Field>
      </Group>

      <Group title="Show candidates that are" defaultOpen count={filled(form, ['candidateTypes', 'candidatesWith', 'lastActive', 'hide'])}>
        <Field label="Candidates type">
          <ChoiceChips multiple options={CANDIDATE_TYPE_OPTIONS} value={form.candidateTypes} onChange={set('candidateTypes')} />
        </Field>
        <Field label="Candidates with">
          <ChoiceChips multiple options={CANDIDATES_WITH_OPTIONS} value={form.candidatesWith} onChange={set('candidatesWith')} />
        </Field>
        <SelectField label="Last active" options={LAST_ACTIVE_OPTIONS} value={form.lastActive} onChange={set('lastActive')} placeholder="Any time" />
        <Field label="Hide candidates that are">
          <ChoiceChips multiple options={HIDE_CANDIDATE_OPTIONS} value={form.hide} onChange={set('hide')} />
        </Field>
      </Group>

      <div className="sticky bottom-0 flex gap-2 bg-white pt-3">
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

/** "Mark Candidate Status / Interview Stage" (admin-managed list). */
const StageSelect = ({ candidateId, value, onSaved, className }) => {
  const lookups = useLookups('candidate_stage');
  const [stage, setStage] = useState(value || '');
  const save = useAction((v) => talentApi.track(candidateId, { stage: v }), { success: 'Status updated', onSuccess: () => onSaved?.() });
  return (
    <SimpleSelect
      ariaLabel="Mark candidate status / interview stage"
      className={className}
      placeholder="Mark status / stage"
      value={stage}
      onChange={(v) => {
        setStage(v);
        save.mutate(v || '');
      }}
      options={lookups.candidate_stage}
    />
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
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
      <StageSelect candidateId={c.candidateId} value={c.tracking?.stage} className="hidden w-52 shrink-0 self-start sm:block" />
    </div>
  </article>
);

const Candidates = () => {
  useDocumentTitle('Search candidates');
  const [params] = useSearchParams();
  const { organization } = useAuth();
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
        const next = { ...fromFilters(f), jobId: fromJob };
        setForm(next);
        run(next);
      }).catch((e) => toast.error(e.message));
    } else if (saved) {
      talentApi.searches({ tab: 'all', limit: 100 }).then((r) => {
        const hit = r.data.find((s) => s._id === saved);
        if (hit) {
          const next = fromFilters(hit.filters);
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
  const filters = <FilterForm form={form} setForm={setForm} onSearch={() => run()} onSave={() => setSaving(true)} consultancy={organization?.type === 'consultancy'} />;

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
        <aside className="sticky top-[86px] hidden max-h-[calc(100vh-102px)] w-80 shrink-0 self-start overflow-y-auto surface p-4 lg:block">{filters}</aside>
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
            <Field label="Candidate status / interview stage" className="mb-3">
              <StageSelect candidateId={id} value={d.trackingDetail?.stage || c.tracking?.stage} className="w-full" />
            </Field>
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
