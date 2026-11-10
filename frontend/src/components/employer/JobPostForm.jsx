import React from 'react';
import Button from '../ui/Button';
import { Section, SimpleSelect } from '../ui/data';
import { Icon } from '../ui/feedback';
import { CheckboxField, ChoiceChips, Field, LocationField, MobileField, SelectField, SuggestField, TagInput, TextAreaField, TextField } from '../ui/form';
import HierarchyField from '../ui/HierarchyField';
import { MarksField } from '../candidate/ProfileForms';
import { useLookups } from '../../hooks/useData';
import { toInputDate } from '../../utils/format';
import { AGE_OPTIONS, CHOICE_TYPES, DISTANCE_OPTIONS, EXPERIENCE_OPTIONS, INTERNSHIP_PERIOD_OPTIONS, QUESTION_TYPE_OPTIONS, STIPEND_OPTIONS, WEEKDAYS, monthsToYears, wordCount, yearsToMonths } from '../../utils/options';

/**
 * Post a Job / Post an Internship ("Other Forms" Excel, 20-Oct-2026). Shared by the employer panel
 * (server drafts) and the no-login page (local drafts). Form state keeps experience in months and
 * numbers as strings; `toJobPayload` converts to the API shape.
 */

export const JOB_LOOKUPS = [
  'employment_type',
  'salary_type',
  'job_mode',
  'shift',
  'notice_period',
  'experience_level',
  'relocate_option',
  'education_level',
  'education_type',
  'education_status',
  'marks_type',
  'english_fluency',
  'diversity_hiring',
  'disability_status',
  'interview_mode',
  'internship_type',
  'perk',
];

const GENDERS = ['Male', 'Female', 'Other'];
const MARITAL = ['Single', 'Married'];
const DESCRIPTION_WORDS = 5000;
const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 ? '30' : '00';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${m} ${h < 12 ? 'AM' : 'PM'}`;
});

export const JOB_BLANK = {
  kind: 'job',
  title: '',
  description: '',
  keySkills: [],
  industries: [],
  subIndustries: [],
  departments: [],
  functions: [],
  roles: [],
  employmentType: '',
  jobMode: '',
  shifts: [],
  openings: '1',
  experienceLevels: [],
  expMin: '',
  expMax: '',
  salary: { min: '', max: '', type: '', hidden: false },
  perks: [],
  internshipType: '',
  internshipPeriod: '',
  stipend: { paid: 'Paid', type: '', min: '', max: '', hidden: false },
  education: {
    levels: [],
    degrees: [],
    specialisations: [],
    institutions: [],
    types: [],
    statuses: [],
    mediums: [],
    marksType: '',
    marksValue: '',
  },
  certifications: [],
  genders: [],
  maritalStatuses: [],
  ageMin: '',
  ageMax: '',
  englishFluency: [],
  languages: [],
  diversity: [],
  disabilityStatuses: [],
  disabilityTypes: [],
  assets: [],
  noticePeriods: [],
  locations: [],
  distanceKm: '',
  relocateOptions: [],
  consultancyClient: { name: '', hideName: false },
  interviewMode: '',
  walkIn: {
    startDate: '',
    endDate: '',
    durationDays: '',
    timing: '',
    contactName: '',
    contactMobile: '',
    contactEmail: '',
    venue: '',
    mapUrl: '',
  },
  contact: {
    name: '',
    mobile: '',
    email: '',
    timeFrom: '',
    timeTo: '',
    dayFrom: '',
    dayTo: '',
  },
  questions: [],
  responseAlerts: { daily: false, everyResponse: false, emails: [] },
  deadlineAt: '',
};

const str = (v) => (v === undefined || v === null ? '' : String(v));

/** API job -> form state. */
export function jobToForm(j) {
  const perMonth = { days: 30, weeks: 4, months: 1 }[j.duration?.unit] || 1;
  const months = Math.min(11, Math.max(0, Math.round((j.duration?.value || 0) / perMonth)));
  return {
    ...JOB_BLANK,
    ...j,
    openings: str(j.openings || 1),
    employmentType: j.employmentTypes?.[0] || '',
    jobMode: j.jobModes?.[0] || '',
    expMin: j.experience?.min || j.experience?.min === 0 ? yearsToMonths(j.experience.min) : '',
    expMax: yearsToMonths(j.experience?.max),
    salary: {
      ...JOB_BLANK.salary,
      ...j.salary,
      min: str(j.salary?.min),
      max: str(j.salary?.max),
    },
    internshipPeriod: j.duration?.noFixed ? 'none' : months ? String(months) : '',
    stipend: {
      ...JOB_BLANK.stipend,
      ...j.stipend,
      paid: j.stipend?.paid === false ? 'Unpaid' : 'Paid',
      min: str(j.stipend?.min),
      max: str(j.stipend?.max),
    },
    education: { ...JOB_BLANK.education, ...j.education },
    genders: j.genders?.length ? j.genders : j.gender && j.gender !== 'any' ? [j.gender[0].toUpperCase() + j.gender.slice(1)] : [],
    ageMin: str(j.ageRange?.min),
    ageMax: str(j.ageRange?.max),
    noticePeriods: j.noticePeriods?.length ? j.noticePeriods : j.noticePeriod ? [j.noticePeriod] : [],
    distanceKm: str(j.distanceKm),
    consultancyClient: {
      ...JOB_BLANK.consultancyClient,
      ...j.consultancyClient,
    },
    walkIn: {
      ...JOB_BLANK.walkIn,
      ...j.walkIn,
      startDate: toInputDate(j.walkIn?.startDate),
      endDate: toInputDate(j.walkIn?.endDate),
      durationDays: str(j.walkIn?.durationDays),
    },
    contact: { ...JOB_BLANK.contact, ...j.contact },
    responseAlerts: { ...JOB_BLANK.responseAlerts, ...j.responseAlerts },
    deadlineAt: toInputDate(j.deadlineAt),
    questions: (j.questions || []).map((q) => ({
      ...q,
      type: q.type === 'choice' ? 'single_choice' : q.type === 'yes_no' ? 'single_choice' : q.type,
      options: q.type === 'yes_no' ? ['Yes', 'No'] : q.options || [],
    })),
  };
}

const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

/** Drops empty strings / undefined at every depth so drafts save whatever is filled so far. */
const clean = (v) => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out = Object.fromEntries(
      Object.entries(v)
        .map(([k, x]) => [k, clean(x)])
        .filter(([, x]) => x !== '' && x !== undefined && x !== null && !(typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length)),
    );
    return out;
  }
  return v;
};

/** Form state -> API body. */
export function toJobPayload(f) {
  const internship = f.kind === 'internship';
  const period = f.internshipPeriod;
  const body = {
    kind: f.kind,
    title: f.title,
    description: f.description,
    keySkills: f.keySkills,
    industries: f.industries,
    subIndustries: f.subIndustries,
    departments: f.departments,
    functions: f.functions,
    roles: f.roles,
    employmentTypes: !internship && f.employmentType ? [f.employmentType] : [],
    jobModes: f.jobMode ? [f.jobMode] : [],
    isRemote: /remote/i.test(f.jobMode || ''),
    shifts: f.shifts,
    openings: num(f.openings),
    experienceLevels: f.experienceLevels,
    experience: internship ? undefined : { min: monthsToYears(f.expMin) ?? 0, max: monthsToYears(f.expMax) },
    salary: internship
      ? undefined
      : {
          ...f.salary,
          period: 'monthly',
          min: num(f.salary.min),
          max: num(f.salary.max),
        },
    perks: f.perks,
    internshipType: internship ? f.internshipType : undefined,
    duration: internship && period ? (period === 'none' ? { noFixed: true } : { value: Number(period), unit: 'months', noFixed: false }) : undefined,
    stipend: internship
      ? {
          paid: f.stipend.paid !== 'Unpaid',
          type: f.stipend.paid === 'Unpaid' ? undefined : f.stipend.type,
          min: f.stipend.paid === 'Unpaid' ? undefined : num(f.stipend.min),
          max: f.stipend.paid === 'Unpaid' ? undefined : num(f.stipend.max),
          hidden: f.stipend.hidden,
        }
      : undefined,
    education: f.education,
    certifications: f.certifications,
    genders: f.genders,
    maritalStatuses: f.maritalStatuses,
    ageRange: f.ageMin || f.ageMax ? { min: num(f.ageMin) ?? 18, max: num(f.ageMax) ?? 61 } : undefined,
    englishFluency: f.englishFluency,
    languages: f.languages,
    diversity: f.diversity,
    disabilityStatuses: f.disabilityStatuses,
    disabilityTypes: f.disabilityStatuses.some((s) => /^have/i.test(s)) ? f.disabilityTypes : [],
    assets: f.assets,
    noticePeriods: f.noticePeriods,
    locations: f.locations,
    distanceKm: f.distanceKm ? Number(f.distanceKm) : undefined,
    relocateOptions: f.relocateOptions,
    consultancyClient: f.consultancyClient?.name ? f.consultancyClient : undefined,
    interviewMode: f.interviewMode,
    walkIn: f.interviewMode === 'Walk-in' ? { ...f.walkIn, durationDays: num(f.walkIn.durationDays) } : undefined,
    contact: f.contact,
    questions: f.questions
      .filter((q) => q.question.trim())
      .map((q) => ({
        question: q.question.trim(),
        type: q.type,
        required: Boolean(q.required),
        options: CHOICE_TYPES.includes(q.type) ? q.options.map((o) => o.trim()).filter(Boolean) : [],
      })),
    responseAlerts: f.responseAlerts,
    deadlineAt: f.deadlineAt || undefined,
  };
  return clean(body);
}

/** Client-side checks the API also enforces, with the Excel wording. */
export function jobFormErrors(f, { requireAll = false } = {}) {
  const e = {};
  if (f.title.trim().length < 2) e.title = 'Enter the title';
  const words = wordCount(f.description);
  if (words > DESCRIPTION_WORDS) e.description = `Keep it within ${DESCRIPTION_WORDS} words (now ${words})`;
  if (f.expMin && f.expMax && Number(f.expMax) < Number(f.expMin)) e.expMax = 'Max experience must be more than min';
  if (f.salary.min && f.salary.max && Number(f.salary.max) < Number(f.salary.min)) e.salaryMax = 'Max salary must be more than min';
  if (f.stipend.min && f.stipend.max && Number(f.stipend.max) < Number(f.stipend.min)) e.stipendMax = 'Max stipend must be more than min';
  if (f.ageMin && f.ageMax && Number(f.ageMax) < Number(f.ageMin)) e.ageMax = 'Max age must be more than min';
  if (f.walkIn.startDate && f.walkIn.endDate && f.walkIn.endDate < f.walkIn.startDate) e.walkInEnd = 'End date is before the start date';
  if (requireAll) {
    if (words < 4) e.description = 'Describe the role';
    if (!f.locations.length) e.locations = 'Add at least one location';
  }
  return e;
}

/**
 * The form split into steps (Naukri style). `sections` index the Section blocks below; `fields` are
 * the error keys each step owns, so "Next" only checks what the step shows.
 */
export const JOB_STEPS = [
  {
    key: 'basics',
    title: 'Basic details',
    short: 'Basics',
    sections: [0],
    fields: ['kind', 'title', 'keySkills', 'consultancyClient', 'employmentType', 'internshipType', 'internshipPeriod', 'jobMode', 'salary', 'salaryMax', 'stipend', 'stipendMax', 'perks', 'experienceLevels', 'expMin', 'expMax', 'experience', 'locations', 'distanceKm', 'openings', 'relocateOptions', 'deadlineAt'],
  },
  { key: 'description', title: 'Description & industry', short: 'Description', sections: [1], fields: ['description', 'industries', 'subIndustries', 'departments', 'functions', 'roles', 'shifts', 'noticePeriods', 'assets'] },
  {
    key: 'criteria',
    title: 'Candidate criteria',
    short: 'Criteria',
    sections: [2, 3],
    fields: ['education', 'certifications', 'genders', 'maritalStatuses', 'ageMin', 'ageMax', 'ageRange', 'englishFluency', 'languages', 'diversity', 'disabilityStatuses', 'disabilityTypes'],
  },
  { key: 'interview', title: 'Interview & responses', short: 'Interview', sections: [4, 5, 6], fields: ['interviewMode', 'walkIn', 'walkInEnd', 'contact', 'questions', 'responseAlerts', 'collaborators'] },
];

const QuestionEditor = ({ value, onChange }) => {
  const update = (i, patch) => onChange(value.map((q, x) => (x === i ? { ...q, ...patch } : q)));
  return (
    <div className="space-y-3">
      {value.map((q, i) => (
        <div key={i} className="rounded-lg border border-brand-border p-3">
          <div className="flex items-start gap-2">
            <TextField className="flex-1" label={`Question ${i + 1}`} value={q.question} onChange={(e) => update(i, { question: e.target.value })} maxLength={500} />
            <button type="button" aria-label="Remove question" onClick={() => onChange(value.filter((_, x) => x !== i))} className="mt-8 text-brand-gray-muted hover:text-brand-red">
              <Icon name="delete" size={18} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <SimpleSelect ariaLabel="Answer type" value={q.type} onChange={(v) => update(i, { type: v || 'short_answer' })} options={QUESTION_TYPE_OPTIONS} />
            <CheckboxField label="Required" checked={Boolean(q.required)} onChange={(e) => update(i, { required: e.target.checked })} />
          </div>
          {CHOICE_TYPES.includes(q.type) && (
            <TagInput className="mt-2" label="Options" max={10} maxLength={200} value={q.options || []} onChange={(options) => update(i, { options })} placeholder="Type an option and press Enter" />
          )}
        </div>
      ))}
      {value.length < 10 && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onChange([
              ...value,
              {
                question: '',
                type: 'short_answer',
                required: false,
                options: [],
              },
            ])
          }
        >
          Add question
        </Button>
      )}
    </div>
  );
};

const Grid = ({ children, cols = 2 }) => <div className={cols === 3 ? 'grid grid-cols-1 gap-4 sm:grid-cols-3' : 'grid grid-cols-1 gap-4 sm:grid-cols-2'}>{children}</div>;

/**
 * Every section of the Excel form. `consultancy` shows "Company You're Hiring For"; `collaborators` is
 * the team picker slot (employer panel only).
 */
const JobPostForm = ({ form, setForm, errors = {}, consultancy, collaborators, step }) => {
  const show = (n) => step === undefined || step === null || JOB_STEPS[step]?.sections.includes(n);
  const lookups = useLookups(...JOB_LOOKUPS);
  const internship = form.kind === 'internship';
  const word = internship ? 'Internship' : 'Job';
  const set = (k) => (e) =>
    setForm((f) => ({
      ...f,
      [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e,
    }));
  const setIn = (group, k) => (e) =>
    setForm((f) => ({
      ...f,
      [group]: {
        ...f[group],
        [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e,
      },
    }));
  const words = wordCount(form.description);
  const hasDisability = form.disabilityStatuses.some((s) => /^have/i.test(s));
  const callMode = ['Candidates Can Call Me Directly', 'Candidates Can Call Other Recruiter'].includes(form.interviewMode);
  const relocate = (values) => {
    const added = values.find((v) => !form.relocateOptions.includes(v));
    set('relocateOptions')(added && /^no/i.test(added) ? [added] : values.filter((v) => !/^no/i.test(v) || !added));
  };
  const walkInDays = (start, end) => (start && end && end >= start ? String(Math.round((new Date(end) - new Date(start)) / 86400000) + 1) : form.walkIn.durationDays);

  return (
    <div className="space-y-4 animate-fade-in" key={step ?? 'all'}>
      {show(0) && (
        <Section title={`Employer & ${word.toLowerCase()} details`}>
          <div className="space-y-4">
            <ChoiceChips
              options={[
                { value: 'job', label: 'Job' },
                { value: 'internship', label: 'Internship' },
              ]}
              value={form.kind}
              onChange={(v) => v && set('kind')(v)}
            />
            {consultancy && (
              <Grid>
                <SuggestField label="Company you're hiring for" lookup="company_name" allowCreate value={form.consultancyClient.name} onChange={setIn('consultancyClient', 'name')} placeholder="Enter company name" />
                <CheckboxField className="sm:mt-8" label="Hide company name to candidates" checked={form.consultancyClient.hideName} onChange={setIn('consultancyClient', 'hideName')} />
              </Grid>
            )}
            <SuggestField label={`${word} title`} required lookup="job_title" allowCreate value={form.title} onChange={set('title')} error={errors.title} placeholder="Type or select an existing suggestion" />
            <SuggestField label="Key skills" lookup="key_skill" limit={20} multiple max={15} allowCreate value={form.keySkills} onChange={set('keySkills')} hint={`${form.keySkills.length}/15`} />

            {internship ? (
              <>
                <Grid cols={3}>
                  <SelectField label="Internship type" options={lookups.internship_type} value={form.internshipType} onChange={set('internshipType')} />
                  <SelectField label="Internship period" options={INTERNSHIP_PERIOD_OPTIONS} value={form.internshipPeriod} onChange={set('internshipPeriod')} />
                  <SelectField label="Internship mode" options={lookups.job_mode.filter((m) => m !== 'Any')} value={form.jobMode} onChange={set('jobMode')} />
                </Grid>
                <Field label="Stipend">
                  <ChoiceChips options={STIPEND_OPTIONS} value={form.stipend.paid} onChange={(v) => v && setIn('stipend', 'paid')(v)} />
                </Field>
                {form.stipend.paid !== 'Unpaid' && (
                  <Grid cols={3}>
                    <SelectField label="Stipend type" options={lookups.salary_type} value={form.stipend.type} onChange={setIn('stipend', 'type')} />
                    <TextField label="Min. in-hand stipend / month" type="number" min="0" value={form.stipend.min} onChange={setIn('stipend', 'min')} />
                    <TextField label="Max. in-hand stipend / month" type="number" min="0" value={form.stipend.max} onChange={setIn('stipend', 'max')} error={errors.stipendMax} />
                  </Grid>
                )}
                <CheckboxField label="Hide stipend details from candidates" checked={form.stipend.hidden} onChange={setIn('stipend', 'hidden')} />
              </>
            ) : (
              <>
                <Grid>
                  <SelectField label="Employment type" options={lookups.employment_type.filter((t) => !/internship|^any$/i.test(t))} value={form.employmentType} onChange={set('employmentType')} />
                  <SelectField label="Salary type" options={lookups.salary_type} value={form.salary.type} onChange={setIn('salary', 'type')} />
                  <TextField label="Min. in-hand salary / month" type="number" min="0" value={form.salary.min} onChange={setIn('salary', 'min')} />
                  <TextField label="Max. in-hand salary / month" type="number" min="0" value={form.salary.max} onChange={setIn('salary', 'max')} error={errors.salaryMax} />
                </Grid>
                <CheckboxField label="Hide salary details from candidates" checked={form.salary.hidden} onChange={setIn('salary', 'hidden')} />
              </>
            )}
            <SuggestField
              label="Additional benefits"
              lookup="perk"
              limit={40}
              multiple
              max={10}
              value={form.perks}
              onChange={set('perks')}
              hint={`Up to 10 (${form.perks.length}/10)`}
              placeholder="Type or pick a benefit"
            />

            <Field label="Experience level">
              <ChoiceChips multiple options={lookups.experience_level} value={form.experienceLevels} onChange={set('experienceLevels')} />
            </Field>
            {!internship && (
              <Grid cols={3}>
                <SelectField label="Min. experience" options={EXPERIENCE_OPTIONS} value={form.expMin} onChange={set('expMin')} placeholder="Min Exp." />
                <SelectField label="Max. experience" options={EXPERIENCE_OPTIONS} value={form.expMax} onChange={set('expMax')} placeholder="Max Exp." error={errors.expMax} />
                <SelectField label="Job mode" options={lookups.job_mode.filter((m) => m !== 'Any')} value={form.jobMode} onChange={set('jobMode')} />
              </Grid>
            )}
            <LocationField label={`${word} locations`} multiple max={4} value={form.locations} onChange={set('locations')} error={errors.locations} hint="Up to 4. At least one is needed to publish" />
            <Grid>
              <SelectField label="Show candidates within" options={DISTANCE_OPTIONS} value={form.distanceKm} onChange={set('distanceKm')} placeholder="Only these locations" />
              <TextField label="Number of vacancy" type="number" min="1" value={form.openings} onChange={set('openings')} />
            </Grid>
            <Field label="Ready to relocate">
              <ChoiceChips multiple options={lookups.relocate_option} value={form.relocateOptions} onChange={relocate} />
            </Field>
            <TextField label="Last date to apply" type="date" min={new Date()} value={form.deadlineAt} onChange={set('deadlineAt')} />
          </div>
        </Section>
      )}

      {show(1) && (
        <Section title={`${word} description & industry`}>
          <div className="space-y-4">
            <TextAreaField label={`${word} description`} rows={8} value={form.description} onChange={set('description')} error={errors.description} hint={`${words}/${DESCRIPTION_WORDS} words. Required to publish`} />
            <Grid>
              <HierarchyField
                kind="industry"
                label={`${internship ? 'Internship ' : ''}Industry`}
                value={{
                  parents: form.industries,
                  children: form.subIndustries,
                }}
                onChange={({ parents, children }) =>
                  setForm((f) => ({
                    ...f,
                    industries: parents,
                    subIndustries: children,
                  }))
                }
              />
              <HierarchyField
                kind="department"
                label={`${internship ? 'Internship ' : ''}Department`}
                value={{ parents: form.departments, children: form.functions }}
                onChange={({ parents, children }) =>
                  setForm((f) => ({
                    ...f,
                    departments: parents,
                    functions: children,
                  }))
                }
              />
            </Grid>
            <SuggestField
              label={`${word} roles`}
              lookup="job_role"
              limit={20}
              multiple
              max={20}
              value={form.roles}
              onChange={set('roles')}
              hint={`Up to 20 (${form.roles.length}/20)`}
              placeholder="Type or select an existing suggestion"
            />
            <Field label="Shift type">
              <ChoiceChips multiple options={lookups.shift.filter((s) => s !== 'Any')} value={form.shifts} onChange={set('shifts')} />
            </Field>
            <Field label="Notice period">
              <ChoiceChips multiple options={lookups.notice_period} value={form.noticePeriods} onChange={set('noticePeriods')} />
            </Field>
            <SuggestField label="Assets availability" lookup="asset" limit={30} multiple max={30} value={form.assets} onChange={set('assets')} placeholder="For example laptop, bike, WiFi" />
          </div>
        </Section>
      )}

      {show(2) && (
        <Section title="Education criteria & certifications">
          <div className="space-y-4">
            <Field label="Education">
              <ChoiceChips multiple options={lookups.education_level} value={form.education.levels} onChange={setIn('education', 'levels')} />
            </Field>
            <Grid>
              <SuggestField
                label="Degree / course"
                lookup="degree"
                parents={form.education.levels.join('|') || undefined}
                multiple
                max={50}
                value={form.education.degrees}
                onChange={setIn('education', 'degrees')}
                hint="Pick the education level first to narrow the list"
              />
              <SuggestField label="Specialisation" lookup="specialisation" multiple max={50} value={form.education.specialisations} onChange={setIn('education', 'specialisations')} />
              <SuggestField label="Institution / college name" lookup="institution" multiple max={50} allowCreate value={form.education.institutions} onChange={setIn('education', 'institutions')} />
              <SuggestField label="Education medium" lookup="language" multiple max={50} value={form.education.mediums} onChange={setIn('education', 'mediums')} />
            </Grid>
            <Grid>
              <Field label="Education type">
                <ChoiceChips multiple options={lookups.education_type} value={form.education.types} onChange={setIn('education', 'types')} />
              </Field>
              <Field label="Education status">
                <ChoiceChips multiple options={lookups.education_status} value={form.education.statuses} onChange={setIn('education', 'statuses')} />
              </Field>
              <SelectField
                label="Marks type"
                options={lookups.marks_type}
                value={form.education.marksType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    education: {
                      ...f.education,
                      marksType: e.target.value,
                      marksValue: '',
                    },
                  }))
                }
              />
              <MarksField type={form.education.marksType} value={form.education.marksValue} onChange={setIn('education', 'marksValue')} />
            </Grid>
            <SuggestField label="Extra certifications" lookup="certification" limit={15} multiple max={50} allowCreate value={form.certifications} onChange={set('certifications')} />
          </div>
        </Section>
      )}

      {show(3) && (
        <Section title="Candidate diversity & other criteria">
          <div className="space-y-4">
            <Grid>
              <Field label="Gender">
                <ChoiceChips multiple options={GENDERS} value={form.genders} onChange={set('genders')} />
              </Field>
              <Field label="Marital status">
                <ChoiceChips multiple options={MARITAL} value={form.maritalStatuses} onChange={set('maritalStatuses')} />
              </Field>
              <SelectField label="Min. age" options={AGE_OPTIONS.slice(0, -1)} value={form.ageMin} onChange={set('ageMin')} placeholder="Min. Age" />
              <SelectField label="Max. age" options={AGE_OPTIONS} value={form.ageMax} onChange={set('ageMax')} placeholder="Max. Age" error={errors.ageMax} />
            </Grid>
            <Field label="English fluency level">
              <ChoiceChips multiple options={lookups.english_fluency} value={form.englishFluency} onChange={set('englishFluency')} />
            </Field>
            <SuggestField label="Language known" lookup="language" multiple max={50} value={form.languages} onChange={set('languages')} />
            <Field label="Diversity hiring">
              <ChoiceChips multiple options={lookups.diversity_hiring} value={form.diversity} onChange={set('diversity')} />
            </Field>
            <Grid>
              <Field label="Disability status">
                <ChoiceChips multiple options={lookups.disability_status} value={form.disabilityStatuses} onChange={set('disabilityStatuses')} />
              </Field>
              {hasDisability && <SuggestField label="Disability type" lookup="disability_type" limit={30} multiple max={30} value={form.disabilityTypes} onChange={set('disabilityTypes')} />}
            </Grid>
          </div>
        </Section>
      )}

      {show(4) && (
        <Section title="Communication mode & preference">
          <div className="space-y-4">
            <SelectField
              label="Mode of interview"
              options={lookups.interview_mode}
              value={form.interviewMode}
              onChange={set('interviewMode')}
              hint="Call Now or Request Call Back shows on the post only after a candidate applies or signs in"
            />
            {form.interviewMode === 'Walk-in' && (
              <div className="space-y-4 rounded-lg border border-brand-border p-3">
                <p className="text-sm font-semibold text-brand-dark">Walk-in details</p>
                <Grid cols={3}>
                  <TextField
                    label="Walk-in start date"
                    type="date"
                    min={new Date()}
                    value={form.walkIn.startDate}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        walkIn: {
                          ...f.walkIn,
                          startDate: e.target.value,
                          durationDays: walkInDays(e.target.value, f.walkIn.endDate),
                        },
                      }))
                    }
                  />
                  <TextField
                    label="Walk-in end date"
                    type="date"
                    min={form.walkIn.startDate || new Date()}
                    value={form.walkIn.endDate}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        walkIn: {
                          ...f.walkIn,
                          endDate: e.target.value,
                          durationDays: walkInDays(f.walkIn.startDate, e.target.value),
                        },
                      }))
                    }
                    error={errors.walkInEnd}
                  />
                  <TextField label="Duration (days)" type="number" min="1" value={form.walkIn.durationDays} onChange={setIn('walkIn', 'durationDays')} />
                  <TextField label="Walk-in timing" value={form.walkIn.timing} onChange={setIn('walkIn', 'timing')} placeholder="10:00 AM - 04:00 PM" maxLength={60} />
                  <TextField label="Contact person name" value={form.walkIn.contactName} onChange={setIn('walkIn', 'contactName')} />
                  <MobileField label="Contact person number" value={form.walkIn.contactMobile} onChange={setIn('walkIn', 'contactMobile')} />
                  <TextField label="Contact person email ID" type="email" value={form.walkIn.contactEmail} onChange={setIn('walkIn', 'contactEmail')} />
                  <TextField className="sm:col-span-2" label="Google Map URL" value={form.walkIn.mapUrl} onChange={setIn('walkIn', 'mapUrl')} placeholder="https://maps.google.com/..." />
                </Grid>
                <TextAreaField label="Walk-in venue address" rows={2} value={form.walkIn.venue} onChange={setIn('walkIn', 'venue')} maxLength={500} />
              </div>
            )}
            <Grid cols={3}>
              <TextField label="HR / contact person name" value={form.contact.name} onChange={setIn('contact', 'name')} />
              <MobileField
                label="HR / contact person number"
                required={callMode && !form.contact.mobile && form.interviewMode === 'Candidates Can Call Other Recruiter'}
                value={form.contact.mobile}
                onChange={setIn('contact', 'mobile')}
              />
              <TextField label="HR / contact person email" type="email" value={form.contact.email} onChange={setIn('contact', 'email')} />
            </Grid>
            <Grid>
              <Field label="HR / contact timing">
                <div className="flex items-center gap-2">
                  <SimpleSelect ariaLabel="From time" value={form.contact.timeFrom} onChange={setIn('contact', 'timeFrom')} options={TIMES} placeholder="From" className="flex-1" />
                  <span className="text-sm text-brand-gray">to</span>
                  <SimpleSelect ariaLabel="To time" value={form.contact.timeTo} onChange={setIn('contact', 'timeTo')} options={TIMES} placeholder="To" className="flex-1" />
                </div>
              </Field>
              <Field label="HR / contact days">
                <div className="flex items-center gap-2">
                  <SimpleSelect ariaLabel="From day" value={form.contact.dayFrom} onChange={setIn('contact', 'dayFrom')} options={WEEKDAYS} placeholder="From" className="flex-1" />
                  <span className="text-sm text-brand-gray">to</span>
                  <SimpleSelect ariaLabel="To day" value={form.contact.dayTo} onChange={setIn('contact', 'dayTo')} options={WEEKDAYS} placeholder="To" className="flex-1" />
                </div>
              </Field>
            </Grid>
          </div>
        </Section>
      )}

      {show(5) && (
        <Section title="Candidate screening questions">
          <QuestionEditor value={form.questions} onChange={set('questions')} />
        </Section>
      )}

      {show(6) && (
        <Section title="Collaborate with other users">
          <div className="space-y-3">
            {collaborators}
            <CheckboxField label="Receive a daily response summary" checked={form.responseAlerts.daily} onChange={setIn('responseAlerts', 'daily')} />
            <CheckboxField label="Receive every new response" checked={form.responseAlerts.everyResponse} onChange={setIn('responseAlerts', 'everyResponse')} />
            <TagInput
              label="Other e-mail IDs to receive responses"
              max={10}
              value={form.responseAlerts.emails}
              onChange={setIn('responseAlerts', 'emails')}
              validate={(t) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)}
              placeholder="name@company.com, press Enter"
              hint="Up to 10. They get the daily summary and new responses you switched on above"
            />
          </div>
        </Section>
      )}
    </div>
  );
};

export default JobPostForm;
