import React, { createContext, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import { Alert, ConfirmDialog, Icon, Modal } from '../ui/feedback';
import { CheckboxField, ChoiceChips, Field, FileDropzone, LocationField, SelectField, SuggestField, TextAreaField, TextField } from '../ui/form';
import HierarchyField from '../ui/HierarchyField';
import { Badge } from '../ui/data';
import useDebounce from '../../hooks/useDebounce';
import { useAction, useLookups } from '../../hooks/useData';
import { authApi, candidateApi } from '../../services';
import { formatCurrency, formatDate, placeLabel, toInputDate, toInputMonth } from '../../utils/format';
import { DISTANCE_OPTIONS } from '../../utils/options';

/*
 * Candidate profile forms. Field lists, labels and selection limits follow the client's
 * "Required Forms" Excel (Candidate Profile sheet); every dropdown reads admin-managed master data.
 */

/**
 * Which profile the forms edit. Default: the signed-in candidate. The admin panel provides the same
 * API shape bound to /admin/candidates/:id/profile, so every form works for any candidate.
 */
export const ProfileApiContext = createContext({ api: candidateApi, invalidate: ['candidate-me', 'candidate-dashboard'] });
export const useProfileApi = () => useContext(ProfileApiContext);
const adultMax = new Date(new Date().getFullYear() - 14, 11, 31);
const USERNAME = /^(?!_)[A-Za-z0-9_]{3,30}(?<!_)$/;
const WORD_LIMIT = 4000;

const useForm = (initial) => {
  const [form, setForm] = useState(initial);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  return [form, set, setForm];
};
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined));
const numberOrUndefined = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));
const words = (text = '') => (text.trim() ? text.trim().split(/\s+/).length : 0);
const withScheme = (url = '') => (url && !/^https?:\/\//i.test(url) ? `https://${url.trim()}` : url.trim());
const useSave = (onDone) => {
  const { api, invalidate } = useProfileApi();
  return useAction(api.update, { success: 'Saved', invalidate, onSuccess: onDone });
};

const SaveBar = ({ pending, label = 'Save', onCancel }) => (
  <div className="flex justify-end gap-2 border-t border-brand-border pt-4">
    {onCancel && (
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    )}
    <Button type="submit" size="sm" variant="primaryBlue" loading={pending}>
      {label}
    </Button>
  </div>
);

const Grid = ({ children, cols = 2 }) => <div className={cols === 3 ? 'grid grid-cols-1 gap-4 sm:grid-cols-3' : 'grid grid-cols-1 gap-4 sm:grid-cols-2'}>{children}</div>;

const FormBlock = ({ title, hint, children }) => (
  <fieldset className="space-y-4">
    <legend className="mb-3 w-full border-b border-brand-border pb-2">
      <span className="text-sm font-semibold text-brand-dark">{title}</span>
      {hint && <span className="mt-0.5 block text-xs text-brand-gray-muted">{hint}</span>}
    </legend>
    {children}
  </fieldset>
);

const YEARS = Array.from({ length: 51 }, (_, y) => ({ value: String(y), label: y === 50 ? '50 Years Plus' : `${y} ${y === 1 ? 'Year' : 'Years'}` }));
const MONTHS = Array.from({ length: 12 }, (_, m) => ({ value: String(m), label: `${m} ${m === 1 ? 'Month' : 'Months'}` }));

/** Total experience as Excel shows it: years (0 to 50 Plus) and months (0 to 11). */
export const ExperienceField = ({ label = 'Total experience', months, onChange, required }) => {
  const total = Number(months) || 0;
  const y = Math.floor(total / 12);
  const m = total % 12;
  return (
    <Field label={label} required={required}>
      <div className="grid grid-cols-2 gap-3">
        <SelectField placeholder="Years" options={YEARS} value={months === '' || months === undefined ? '' : String(y)} onChange={(e) => onChange(Number(e.target.value || 0) * 12 + m)} />
        <SelectField placeholder="Months" options={MONTHS} value={months === '' || months === undefined ? '' : String(m)} onChange={(e) => onChange(y * 12 + Number(e.target.value || 0))} />
      </div>
    </Field>
  );
};

/** Salary in rupees per month. Keeps digits only so the value always reaches the API as a number. */
const SalaryField = ({ label, value, onChange, hint = 'Monthly in-hand, in ₹' }) => (
  <TextField label={label} inputMode="numeric" value={value ?? ''} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 9))} hint={value ? `${formatCurrency(value)} per month` : hint} />
);

/** Repeating rows of a select plus a link (social profiles) or two text fields (portfolio). */
const RowsEditor = ({ rows, onChange, max, addLabel, render, blank }) => (
  <div className="space-y-3">
    {rows.map((row, i) => (
      <div key={i} className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{render(row, (patch) => onChange(rows.map((r, x) => (x === i ? { ...r, ...patch } : r))))}</div>
        <button type="button" onClick={() => onChange(rows.filter((_, x) => x !== i))} aria-label="Remove row" className="mt-7 rounded-md p-2 text-brand-gray-muted hover:bg-brand-tint hover:text-brand-red">
          <Icon name="delete" size={18} />
        </button>
      </div>
    ))}
    {rows.length < max && (
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...rows, blank])}>
        <Icon name="add" size={16} /> {addLabel}
      </Button>
    )}
  </div>
);

/* ------------------------------------------------------------ identity */

/** Excel: profile photo, candidate user name, current job journey status. */
export const IdentityForm = ({ data, onDone, onCancel }) => {
  const { user = {}, profile = {} } = data;
  const lookups = useLookups('journey_status');
  const [form, set] = useForm({ username: user.username || '', journeyStatus: profile.journeyStatus || '', availabilityStatus: profile.availabilityStatus || 'open_to_work' });
  const [taken, setTaken] = useState(false);
  const term = useDebounce(form.username, 400);
  useEffect(() => {
    let live = true;
    setTaken(false);
    if (!term || term === user.username || !USERNAME.test(term)) return undefined;
    authApi
      .availability({ username: term })
      .then((r) => live && setTaken(r.username === false))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [term, user.username]);
  const formatError = form.username && !USERNAME.test(form.username) ? '3 to 30 letters, numbers or _ . Cannot start or end with _' : '';
  const save = useSave(onDone);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (formatError || taken) return;
        save.mutate(clean({ ...form, username: form.username === user.username ? undefined : form.username }));
      }}
    >
      <TextField label="Username" value={form.username} onChange={(e) => set('username')(e.target.value.trim())} error={formatError || (taken ? 'This username is taken' : '')} hint="Your public handle. Letters, numbers and _ only" maxLength={30} autoComplete="off" />
      <SelectField label="Current job journey status" options={lookups.journey_status} value={form.journeyStatus} onChange={set('journeyStatus')} />
      <Field label="Availability">
        <ChoiceChips
          options={[
            { value: 'open_to_work', label: 'Open to work' },
            { value: 'serving_notice', label: 'Serving notice' },
            { value: 'not_available', label: 'Not available' },
          ]}
          value={form.availabilityStatus}
          onChange={(v) => v && set('availabilityStatus')(v)}
        />
      </Field>
      <SaveBar pending={save.isPending} onCancel={onCancel} />
    </form>
  );
};

/* ------------------------------------------------------------ personal */

/** Excel "Tell About Yourself": name to assets. E-mail and mobile change through a verified flow. */
export const PersonalForm = ({ data, onDone, onCancel, settingsPath = '/candidate/settings?tab=account' }) => {
  const { user = {}, profile = {} } = data;
  const lookups = useLookups('gender', 'marital_status', 'guardian_relation', 'caste_category', 'disability_status', 'disability_type', 'military_status', 'service_type', 'english_fluency');
  const [form, set] = useForm({
    fullName: user.fullName || '',
    gender: user.gender || '',
    dob: toInputDate(profile.dob),
    maritalStatus: profile.maritalStatus || '',
    guardianRelation: profile.guardianRelation || '',
    guardianName: profile.guardianName || '',
    category: profile.category || '',
    currentLocation: profile.currentLocation || null,
    hometown: profile.hometown || null,
    disabilityStatus: profile.disability?.status || '',
    disabilityType: profile.disability?.type || '',
    militaryStatus: profile.military?.status || '',
    serviceType: profile.military?.serviceType || '',
    englishFluency: profile.englishFluency || '',
    languages: profile.languages || [],
    assets: profile.assets || [],
    documents: profile.documents || [],
  });
  const hasDisability = /^have/i.test(form.disabilityStatus);
  const served = form.militaryStatus && !/never/i.test(form.militaryStatus);
  const save = useSave(onDone);
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const { disabilityStatus, disabilityType, militaryStatus, serviceType, ...rest } = form;
        save.mutate({
          ...clean(rest),
          ...(form.guardianRelation ? {} : { guardianName: '' }),
          disability: clean({ status: disabilityStatus, type: hasDisability ? disabilityType : '' }),
          military: clean({ status: militaryStatus, serviceType: served ? serviceType : '' }),
          languages: form.languages,
          assets: form.assets,
          documents: form.documents,
        });
      }}
    >
      <FormBlock title="Basic details">
        <Grid>
          <TextField label="Full name" required value={form.fullName} onChange={set('fullName')} autoComplete="name" maxLength={120} />
          <SelectField label="Gender" options={lookups.gender} value={form.gender} onChange={set('gender')} />
          <Field label="Email ID">
            <p className="flex h-11 items-center justify-between gap-2 rounded-[var(--radius-input)] bg-brand-tint px-3 text-sm text-brand-dark">
              <span className="truncate">{user.email || 'Not added'}</span>
              <Link to={settingsPath} className="shrink-0 text-xs font-semibold text-brand-blue">
                Change
              </Link>
            </p>
          </Field>
          <Field label="Mobile number">
            <p className="flex h-11 items-center justify-between gap-2 rounded-[var(--radius-input)] bg-brand-tint px-3 text-sm text-brand-dark">
              <span className="truncate">{user.mobile ? `+91 ${user.mobile}` : 'Not added'}</span>
              <Link to={settingsPath} className="shrink-0 text-xs font-semibold text-brand-blue">
                Change
              </Link>
            </p>
          </Field>
          <TextField label="Date of birth" type="date" max={adultMax} openTo="2000-01-01" value={form.dob} onChange={set('dob')} />
          <SelectField label="Marital status" options={lookups.marital_status} value={form.maritalStatus} onChange={set('maritalStatus')} />
          <SelectField label="Guardian" options={lookups.guardian_relation} value={form.guardianRelation} onChange={set('guardianRelation')} />
          {form.guardianRelation && <TextField label="Name of guardian" value={form.guardianName} onChange={set('guardianName')} maxLength={120} />}
          <SelectField label="Your category" options={lookups.caste_category} value={form.category} onChange={set('category')} />
        </Grid>
      </FormBlock>
      <FormBlock title="Location">
        <Grid>
          <LocationField label="Current location" value={form.currentLocation} onChange={set('currentLocation')} placeholder="Locality, city or state" />
          <LocationField label="Home town" value={form.hometown} onChange={set('hometown')} placeholder="Locality, city or state" />
        </Grid>
      </FormBlock>
      <FormBlock title="Disability and military service" hint="Optional. Some employers hire under inclusive and ex-servicemen programmes.">
        <Grid>
          <SelectField label="Disability status" options={lookups.disability_status} value={form.disabilityStatus} onChange={set('disabilityStatus')} />
          {hasDisability && <SelectField label="Disability / differently-abled" options={lookups.disability_type} value={form.disabilityType} onChange={set('disabilityType')} />}
          <SelectField label="Military experience" options={lookups.military_status} value={form.militaryStatus} onChange={set('militaryStatus')} />
          {served && <SelectField label="Service type" options={lookups.service_type} value={form.serviceType} onChange={set('serviceType')} />}
        </Grid>
      </FormBlock>
      <FormBlock title="Languages, assets and documents">
        <SelectField label="English fluency level" options={lookups.english_fluency} value={form.englishFluency} onChange={set('englishFluency')} />
        <SuggestField label="Languages known" lookup="language" multiple max={10} value={form.languages} onChange={set('languages')} hint="Up to 10" placeholder="Type a language" />
        <SuggestField label="Assets availability" lookup="asset" multiple max={25} value={form.assets} onChange={set('assets')} hint="For example WiFi, laptop, smartphone or two wheeler" placeholder="Type an asset" />
        <SuggestField label="Documents availability" lookup="candidate_document" multiple max={35} value={form.documents} onChange={set('documents')} hint="For example Aadhar card, PAN card or driving license" placeholder="Type a document" />
      </FormBlock>
      <SaveBar pending={save.isPending} onCancel={onCancel} />
    </form>
  );
};

/* -------------------------------------------------------------- resume */

export const ResumeForm = ({ data }) => {
  const { api, invalidate } = useProfileApi();
  const resume = data.profile?.resume;
  const [parsed, setParsed] = useState(null);
  const upload = useAction(api.uploadResume, { success: 'Resume uploaded', invalidate, onSuccess: (r) => setParsed(r.parsed) });
  const remove = useAction(api.deleteResume, { success: 'Resume removed', invalidate });
  const addSkills = useAction((skills) => api.update({ keySkills: [...new Set([...(data.profile?.keySkills || []), ...skills])].slice(0, 15) }), { success: 'Skills added', invalidate, onSuccess: () => setParsed(null) });
  const download = useAction(api.resumeLink, { onSuccess: (r) => window.open(r.url, '_blank', 'noopener') });
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-3">
      {resume?.name && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-border p-3">
          <div className="flex min-w-0 items-center gap-3">
            <Icon name="description" size={28} className="shrink-0 text-brand-blue" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-brand-dark">{resume.name}</p>
              <p className="text-xs text-brand-gray-muted">Uploaded {formatDate(resume.uploadedAt)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" loading={download.isPending} onClick={() => download.mutate()}>
              Download
            </Button>
            <Button size="sm" variant="dangerGhost" onClick={() => setConfirm(true)}>
              Delete
            </Button>
          </div>
        </div>
      )}
      <FileDropzone accept=".pdf,.doc,.docx" maxSizeMb={5} busy={upload.isPending} onFile={upload.mutate} label={resume?.name ? 'Replace your resume' : 'Upload your resume'} hint="PDF, DOC or DOCX up to 5 MB" />
      {parsed?.skills?.length > 0 && (
        <Alert tone="info">
          We found these skills in your resume: {parsed.skills.slice(0, 10).join(', ')}.{' '}
          <button type="button" className="font-semibold underline" onClick={() => addSkills.mutate(parsed.skills)}>
            Add to key skills
          </button>
        </Alert>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Delete your resume?" message="Employers will not be able to download it until you upload a new one." danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(undefined, { onSuccess: () => setConfirm(false) })} />
    </div>
  );
};

/** Excel resume block: headline / career objective, IT skills and key skills (up to 15 each). */
export const ResumeDetailsForm = ({ data, onDone, onCancel }) => {
  const p = data.profile || {};
  const [form, set] = useForm({ resumeHeadline: p.resumeHeadline || '', profileSummary: p.profileSummary || '', itSkills: p.itSkills || [], keySkills: p.keySkills || [] });
  const save = useSave(onDone);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ ...form });
      }}
    >
      <TextField label="Resume headline" value={form.resumeHeadline} onChange={set('resumeHeadline')} maxLength={250} hint={`${form.resumeHeadline.length}/250. One line recruiters read first`} placeholder="e.g. Sales executive with 3 years in FMCG field sales" />
      <TextAreaField label="Career objective" rows={4} value={form.profileSummary} onChange={set('profileSummary')} maxLength={5000} hint={`${form.profileSummary.length}/5000`} />
      <SuggestField label="Key skills" lookup="key_skill" multiple max={20} allowCreate value={form.keySkills} onChange={set('keySkills')} hint={`${form.keySkills.length}/20 selected`} placeholder="Type a skill and press Enter" />
      <SuggestField label="IT skills" lookup="it_skill" multiple max={15} allowCreate value={form.itSkills} onChange={set('itSkills')} hint={`${form.itSkills.length}/15 selected`} placeholder="e.g. MS Excel, Tally, Python" />
      <SaveBar pending={save.isPending} onCancel={onCancel} />
    </form>
  );
};

/* ---------------------------------------------------------- experience */

/** Experience level and total experience sit above the employment list. */
export const ExperienceSummaryForm = ({ data, onDone, onCancel }) => {
  const p = data.profile || {};
  const lookups = useLookups('experience_level', 'present_job_status');
  const [form, set] = useForm({ experienceLevel: p.experienceLevel || '', presentJobStatus: p.presentJobStatus || '', totalMonths: p.totalExperienceMonths ?? '' });
  const save = useSave(onDone);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const months = Number(form.totalMonths) || 0;
        save.mutate(clean({ experienceLevel: form.experienceLevel, presentJobStatus: form.presentJobStatus, totalExperience: { years: Math.floor(months / 12), months: months % 12 } }));
      }}
    >
      <Field label="Experience level" required>
        <ChoiceChips options={lookups.experience_level} value={form.experienceLevel} onChange={(v) => v && set('experienceLevel')(v)} />
      </Field>
      <Grid>
        <ExperienceField months={form.totalMonths} onChange={set('totalMonths')} />
        <SelectField label="Present job status" options={lookups.present_job_status} value={form.presentJobStatus} onChange={set('presentJobStatus')} />
      </Grid>
      <SaveBar pending={save.isPending} onCancel={onCancel} />
    </form>
  );
};

const EmploymentModal = ({ item, onClose }) => {
  const { api, invalidate } = useProfileApi();
  const lookups = useLookups('employer_type', 'employment_type', 'job_mode', 'shift', 'salary_type', 'notice_period');
  const [form, set, setForm] = useForm({
    jobTitle: item?.jobTitle || '',
    employerName: item?.employerName || '',
    employerType: item?.employerType || '',
    employmentType: item?.employmentType || '',
    jobModes: item?.jobModes || [],
    location: item?.location || null,
    shift: item?.shift || '',
    isCurrent: Boolean(item?.isCurrent),
    startDate: toInputMonth(item?.startDate),
    endDate: toInputMonth(item?.endDate),
    salaryType: item?.salaryType || '',
    monthlySalary: item?.monthlySalary ?? '',
    perks: item?.perks || [],
    noticePeriod: item?.noticePeriod || '',
    description: item?.description || '',
    skills: item?.skills || [],
    industries: item?.industries || [],
    subIndustries: item?.subIndustries || [],
    departments: item?.departments || [],
    functions: item?.functions || [],
    roles: item?.roles || [],
  });
  const [error, setError] = useState('');
  const count = words(form.description);
  const save = useAction(
    () => {
      const body = clean({
        ...form,
        jobModes: form.jobModes.filter((m) => m !== 'Any'),
        startDate: form.startDate && `${form.startDate}-01`,
        endDate: form.isCurrent ? undefined : form.endDate && `${form.endDate}-01`,
        noticePeriod: form.isCurrent ? form.noticePeriod : undefined,
        monthlySalary: numberOrUndefined(form.monthlySalary),
      });
      return item ? api.updateItem('employments', item._id, body) : api.addItem('employments', body);
    },
    { success: 'Work experience saved', invalidate, onSuccess: onClose },
  );
  const submit = (e) => {
    e.preventDefault();
    if (!form.jobTitle.trim() || !form.employerName.trim()) return setError('Add the job title and the employer name');
    if (!form.startDate) return setError('Select the month you started');
    if (!form.isCurrent && !form.endDate) return setError('Select the month you left, or mark this as your current company');
    if (!form.isCurrent && form.endDate < form.startDate) return setError('End date cannot be before the start date');
    if (count > WORD_LIMIT) return setError(`Job description is limited to ${WORD_LIMIT} words`);
    setError('');
    return save.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={item ? 'Edit work experience' : 'Add work experience'}
      size="xl"
      footer={
        <Button type="submit" form="emp-form" size="sm" variant="primaryBlue" loading={save.isPending}>
          Save
        </Button>
      }
    >
      <form id="emp-form" className="space-y-6" onSubmit={submit}>
        {error && <Alert tone="error">{error}</Alert>}
        <FormBlock title="Role and company">
          <Grid>
            <SuggestField label="Job title / role" required lookup="job_title" allowCreate value={form.jobTitle} onChange={set('jobTitle')} placeholder="e.g. Sales Executive" />
            <SuggestField label="Employer name" required lookup="company_name" allowCreate value={form.employerName} onChange={set('employerName')} placeholder="Company you work or worked for" />
            <SelectField label="Employer type" options={lookups.employer_type} value={form.employerType} onChange={set('employerType')} />
            <SelectField label="Employment type" options={lookups.employment_type.filter((t) => t !== 'Any')} value={form.employmentType} onChange={set('employmentType')} />
            <LocationField label="Work office location" value={form.location} onChange={set('location')} placeholder="City, state" />
            <SelectField label="Job shift type" options={lookups.shift.filter((t) => t !== 'Any')} value={form.shift} onChange={set('shift')} />
          </Grid>
          <Field label="Job mode type" hint="Up to 3">
            <ChoiceChips multiple max={3} options={lookups.job_mode.filter((t) => t !== 'Any')} value={form.jobModes} onChange={set('jobModes')} />
          </Field>
        </FormBlock>
        <FormBlock title="Duration">
          <Field label="Currently working in this company?" required>
            <ChoiceChips
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              value={form.isCurrent ? 'yes' : 'no'}
              onChange={(v) => v && set('isCurrent')(v === 'yes')}
            />
          </Field>
          <Grid>
            <TextField label="Work start date" required type="month" max={new Date()} value={form.startDate} onChange={set('startDate')} />
            {!form.isCurrent && <TextField label="Work end date" required type="month" max={new Date()} value={form.endDate} onChange={set('endDate')} />}
            {form.isCurrent && <SelectField label="Notice period / availability to join" options={lookups.notice_period} value={form.noticePeriod} onChange={set('noticePeriod')} />}
          </Grid>
        </FormBlock>
        <FormBlock title="Salary and perks">
          <Grid>
            <SelectField label="Salary type" options={lookups.salary_type} value={form.salaryType} onChange={set('salaryType')} />
            <SalaryField label="Monthly in-hand salary" value={form.monthlySalary} onChange={set('monthlySalary')} />
          </Grid>
          <SuggestField label="Additional perks" lookup="perk" multiple max={40} value={form.perks} onChange={set('perks')} placeholder="e.g. PF, Health Insurance, Cab" />
        </FormBlock>
        <FormBlock title="Work done">
          <TextAreaField label="Job description and key responsibilities" rows={6} value={form.description} onChange={set('description')} hint={`${count}/${WORD_LIMIT} words`} error={count > WORD_LIMIT ? `Keep it under ${WORD_LIMIT} words` : ''} />
          <SuggestField label="Key skills used" lookup="key_skill" multiple max={15} allowCreate value={form.skills} onChange={set('skills')} hint={`${form.skills.length}/15`} />
          <HierarchyField kind="industry" label="Industry" value={{ parents: form.industries, children: form.subIndustries }} onChange={({ parents, children }) => setForm((f) => ({ ...f, industries: parents, subIndustries: children }))} />
          <HierarchyField kind="department" label="Department / functions" value={{ parents: form.departments, children: form.functions }} onChange={({ parents, children }) => setForm((f) => ({ ...f, departments: parents, functions: children }))} />
          <SuggestField label="Job roles" lookup="job_role" limit={15} multiple max={10} value={form.roles} onChange={set('roles')} hint="Up to 10" placeholder="Type a role, e.g. Accountant" />
        </FormBlock>
      </form>
    </Modal>
  );
};

/* ----------------------------------------------------------- education */

const GRADES = ['A', 'B', 'C', 'D', 'E', 'F'];
/** Education levels that have course and specialisation lists in the client's Excel. */
export const COURSE_LEVELS = ['ITI', 'Diploma', 'Graduate', 'Post Graduate', 'Doctorate', 'Other'];
const DIVISIONS = ['1st', '2nd', '3rd', 'Passed'];

/** Marks input that matches the marks type: grade letter, division, percentage or CGPA. */
export const MarksField = ({ type, value, onChange }) => {
  const t = (type || '').toLowerCase();
  if (t === 'grade') return <SelectField label="Grade" options={GRADES} value={value} onChange={onChange} />;
  if (t === 'division') return <SelectField label="Division" options={DIVISIONS} value={value} onChange={onChange} />;
  if (t === 'percentage' || t === 'cgpa') {
    const max = t === 'cgpa' ? 10 : 100;
    return (
      <TextField
        label={t === 'cgpa' ? 'CGPA (out of 10)' : 'Percentage'}
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 5);
          if (v === '' || Number(v) <= max) onChange({ target: { value: v } });
        }}
        hint={t === 'cgpa' ? 'For example 8.5' : '0 to 100'}
      />
    );
  }
  return <TextField label="Marks" value={value} onChange={onChange} disabled placeholder="Choose the marks type first" />;
};

const EducationModal = ({ item, onClose }) => {
  const { api, invalidate } = useProfileApi();
  const lookups = useLookups('education_level', 'education_status', 'education_type', 'education_medium', 'marks_type');
  const [form, set, setForm] = useForm({
    level: item?.level || '',
    degree: item?.degree || '',
    specialisation: item?.specialisation || '',
    institution: item?.institution || '',
    status: item?.status || '',
    educationType: item?.educationType || '',
    medium: item?.medium || '',
    startDate: toInputMonth(item?.startDate),
    endDate: toInputMonth(item?.endDate),
    marksType: item?.marksType || '',
    marks: item?.marks || '',
    isHighest: Boolean(item?.isHighest),
  });
  const [error, setError] = useState('');
  const basic = /no education|below 10th/i.test(form.level);
  const hasCourses = COURSE_LEVELS.includes(form.level);
  const pursuing = /pursuing/i.test(form.status);
  const save = useAction(
    () => {
      const body = clean({ ...form, startDate: form.startDate && `${form.startDate}-01`, endDate: form.endDate && `${form.endDate}-01` });
      return item ? api.updateItem('educations', item._id, body) : api.addItem('educations', body);
    },
    { success: 'Education saved', invalidate, onSuccess: onClose },
  );
  const submit = (e) => {
    e.preventDefault();
    if (!form.level) return setError('Choose the level of education');
    if (form.startDate && form.endDate && form.endDate < form.startDate) return setError('End date cannot be before the start date');
    setError('');
    return save.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={item ? 'Edit education' : 'Add education'}
      size="xl"
      footer={
        <Button type="submit" form="edu-form" size="sm" variant="primaryBlue" loading={save.isPending}>
          Save
        </Button>
      }
    >
      <form id="edu-form" className="space-y-6" onSubmit={submit}>
        {error && <Alert tone="error">{error}</Alert>}
        <FormBlock title="Qualification">
          <Grid>
            <SelectField label="Level of education" required options={lookups.education_level} value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value, degree: '', specialisation: '' }))} />
            {hasCourses && <SuggestField label="Degree / course" lookup="degree" parents={form.level} limit={60} allowCreate value={form.degree} onChange={(v) => setForm((f) => ({ ...f, degree: v, specialisation: '' }))} placeholder="Type or pick a course" />}
            {hasCourses && (
              <SuggestField
                label="Specialisation"
                lookup="specialisation"
                parents={form.degree ? `${form.level}>${form.degree}` : undefined}
                limit={100}
                allowCreate
                disabled={!form.degree}
                value={form.specialisation}
                onChange={set('specialisation')}
                placeholder={form.degree ? 'Type or pick a specialisation' : 'Choose the course first'}
              />
            )}
            {!basic && <SuggestField label="Institution / college name" lookup="institution" allowCreate value={form.institution} onChange={set('institution')} placeholder="Type to search or add" />}
          </Grid>
        </FormBlock>
        <FormBlock title="Course details">
          <Grid>
            <SelectField label="Education status" options={lookups.education_status} value={form.status} onChange={set('status')} />
            <SelectField label="Education type" options={lookups.education_type} value={form.educationType} onChange={set('educationType')} />
            <SelectField label="Education medium" options={lookups.education_medium} value={form.medium} onChange={set('medium')} />
            <span className="hidden sm:block" />
            <TextField label="Start date" type="month" max={new Date()} value={form.startDate} onChange={set('startDate')} />
            <TextField label={pursuing ? 'End date (expected)' : 'End date'} type="month" value={form.endDate} onChange={set('endDate')} />
            <SelectField label="Marks type" options={lookups.marks_type} value={form.marksType} onChange={(e) => setForm((f) => ({ ...f, marksType: e.target.value, marks: '' }))} />
            <MarksField type={form.marksType} value={form.marks} onChange={set('marks')} />
          </Grid>
          <CheckboxField label="Mark as highest education" checked={form.isHighest} onChange={set('isHighest')} />
        </FormBlock>
      </form>
    </Modal>
  );
};

/** Excel: extra certification courses, up to 10, admin-managed list with user additions. */
export const CertificationsForm = ({ data, onDone, onCancel }) => {
  const [certifications, setCertifications] = useState(data.profile?.certifications || []);
  const save = useSave(onDone);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ certifications });
      }}
    >
      <SuggestField label="Certification courses" lookup="certification" limit={12} multiple max={10} allowCreate value={certifications} onChange={setCertifications} hint={`${certifications.length}/10 selected`} placeholder="e.g. Tally, Digital Marketing" />
      <SaveBar pending={save.isPending} onCancel={onCancel} />
    </form>
  );
};

/** Add, edit and delete rows for `employments` or `educations`. */
export const ItemList = ({ kind, items = [] }) => {
  const { api, invalidate } = useProfileApi();
  const [editing, setEditing] = useState(null);
  const [removeId, setRemoveId] = useState(null);
  const remove = useAction((id) => api.removeItem(kind, id), { success: 'Removed', invalidate, onSuccess: () => setRemoveId(null) });
  const FormModal = kind === 'employments' ? EmploymentModal : EducationModal;
  const isWork = kind === 'employments';
  const period = (i) => [formatDate(i.startDate, 'MMM yyyy'), i.isCurrent ? 'Present' : formatDate(i.endDate, 'MMM yyyy')].filter((x) => x && x !== '—').join(' - ');
  const sorted = [...items].sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0) || new Date(b.startDate || 0) - new Date(a.startDate || 0));
  return (
    <div className="space-y-3">
      {sorted.length === 0 && <p className="text-sm text-brand-gray-muted">{isWork ? 'Add your current and previous jobs, internships or apprenticeships.' : 'Add your education from the highest level down.'}</p>}
      {sorted.map((i) => (
        <article key={i._id} className="flex items-start justify-between gap-3 rounded-lg border border-brand-border p-4">
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-brand-dark">
              {isWork ? i.jobTitle : [i.degree, i.specialisation].filter(Boolean).join(', ') || i.level}
              {isWork && i.isCurrent && <Badge tone="green">Current</Badge>}
              {!isWork && i.isHighest && <Badge tone="blue">Highest</Badge>}
            </p>
            <p className="text-sm text-brand-gray">{isWork ? [i.employerName, i.employerType].filter(Boolean).join(' · ') : [i.institution, !i.degree ? '' : i.level].filter(Boolean).join(' · ')}</p>
            <p className="text-xs text-brand-gray-muted">
              {[period(i), isWork ? i.employmentType : i.status, isWork && placeLabel(i.location), isWork && i.monthlySalary ? `${formatCurrency(i.monthlySalary)}/month` : '', !isWork && i.marks ? `${i.marksType || 'Marks'}: ${i.marks}` : '']
                .filter(Boolean)
                .join(' · ')}
            </p>
            {isWork && i.skills?.length > 0 && <p className="text-xs text-brand-gray">Skills: {i.skills.join(', ')}</p>}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(i)} aria-label="Edit">
              <Icon name="edit" size={18} />
            </Button>
            <Button size="sm" variant="dangerGhost" onClick={() => setRemoveId(i._id)} aria-label="Delete">
              <Icon name="delete" size={18} />
            </Button>
          </div>
        </article>
      ))}
      <Button size="sm" variant="outline" onClick={() => setEditing({})}>
        <Icon name="add" size={16} /> Add {isWork ? 'work experience' : 'education'}
      </Button>
      {editing && <FormModal item={editing._id ? editing : null} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={Boolean(removeId)} onClose={() => setRemoveId(null)} title="Delete this entry?" danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(removeId)} />
    </div>
  );
};

/* --------------------------------------------------------- preferences */

/** Excel "Your Job Preferences & Expectations". */
export const PreferencesForm = ({ data, onDone, onCancel }) => {
  const p = data.profile || {};
  const pref = p.preferences || {};
  const lookups = useLookups('job_mode', 'employment_type', 'shift', 'notice_period', 'relocate_option');
  const [form, set, setForm] = useForm({
    jobTypes: pref.jobTypes?.length ? pref.jobTypes : ['job'],
    jobModes: pref.jobModes || [],
    locations: (pref.locations || []).slice(0, 4),
    distanceKm: pref.distanceKm ? String(pref.distanceKm) : '',
    relocation: pref.relocation || [],
    expectedSalary: pref.expectedSalary ?? '',
    employmentType: pref.employmentTypes?.[0] || '',
    shifts: pref.shifts || [],
    skills: pref.skills || [],
    industries: pref.industries || [],
    subIndustries: pref.subIndustries || [],
    departments: pref.departments || [],
    functions: pref.functions || [],
    roles: pref.roles || [],
    noticePeriod: pref.noticePeriod || p.noticePeriod || '',
  });
  const [error, setError] = useState('');
  const save = useSave(onDone);
  // "No- Not Willing To Relocate" cannot sit with a "Yes" option.
  const relocation = (values) => {
    const added = values.find((v) => !form.relocation.includes(v));
    if (added && /^no/i.test(added)) return set('relocation')([added]);
    return set('relocation')(values.filter((v) => !/^no/i.test(v) || !added));
  };
  const pickAny = (key) => (values) => set(key)(values.includes('Any') && !form[key].includes('Any') ? ['Any'] : values.filter((v) => v !== 'Any'));
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.jobTypes.length) return setError('Choose jobs, internships or both');
        setError('');
        const { employmentType, expectedSalary, noticePeriod, distanceKm, ...rest } = form;
        return save.mutate({
          noticePeriod: noticePeriod || undefined,
          preferences: {
            ...rest,
            distanceKm: distanceKm ? Number(distanceKm) : null,
            employmentTypes: employmentType ? [employmentType] : [],
            expectedSalary: numberOrUndefined(expectedSalary),
            noticePeriod: noticePeriod || undefined,
          },
        });
      }}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <FormBlock title="What you are looking for">
        <Field label="Looking for" required>
          <ChoiceChips
            multiple
            options={[
              { value: 'job', label: 'Jobs' },
              { value: 'internship', label: 'Internships' },
            ]}
            value={form.jobTypes}
            onChange={set('jobTypes')}
          />
        </Field>
        <Field label="Preferred job mode type" hint="Up to 3">
          <ChoiceChips multiple max={3} options={lookups.job_mode} value={form.jobModes} onChange={pickAny('jobModes')} />
        </Field>
        <Field label="Preferred job shift type" hint="Up to 3">
          <ChoiceChips multiple max={3} options={lookups.shift} value={form.shifts} onChange={pickAny('shifts')} />
        </Field>
        <Grid>
          <SelectField label="Employment type" options={lookups.employment_type} value={form.employmentType} onChange={set('employmentType')} />
          <SelectField label="Notice period / availability to join" options={lookups.notice_period} value={form.noticePeriod} onChange={set('noticePeriod')} />
          <SalaryField label="Expected monthly in-hand salary" value={form.expectedSalary} onChange={set('expectedSalary')} />
        </Grid>
      </FormBlock>
      <FormBlock title="Where">
        <LocationField label="Preferred job locations" multiple max={4} value={form.locations} onChange={set('locations')} hint="Up to 4" />
        <SelectField label="Show jobs within" options={DISTANCE_OPTIONS} value={form.distanceKm} onChange={set('distanceKm')} placeholder="Only these locations" />
        <Field label="Ready to relocate" hint="Up to 4">
          <ChoiceChips multiple max={4} options={lookups.relocate_option} value={form.relocation} onChange={relocation} />
        </Field>
      </FormBlock>
      <FormBlock title="Skills and roles">
        <SuggestField label="Key skills" lookup="key_skill" multiple max={20} allowCreate value={form.skills} onChange={set('skills')} hint={`${form.skills.length}/20`} />
        <HierarchyField kind="industry" label="Industry" value={{ parents: form.industries, children: form.subIndustries }} onChange={({ parents, children }) => setForm((f) => ({ ...f, industries: parents, subIndustries: children }))} />
        <HierarchyField kind="department" label="Department / functions" value={{ parents: form.departments, children: form.functions }} onChange={({ parents, children }) => setForm((f) => ({ ...f, departments: parents, functions: children }))} />
        <SuggestField label="Job roles" lookup="job_role" limit={20} multiple max={15} value={form.roles} onChange={set('roles')} hint="Up to 15" placeholder="Type a role, e.g. Accountant" />
      </FormBlock>
      <SaveBar pending={save.isPending} onCancel={onCancel} />
    </form>
  );
};

/* ------------------------------------------------------ social & links */

/** Excel "Social Profiles & Portfolio": platform + link, and project name + link. */
export const SocialForm = ({ data, onDone, onCancel }) => {
  const p = data.profile || {};
  const lookups = useLookups('social_platform');
  const [socials, setSocials] = useState(p.socialProfiles?.length ? p.socialProfiles : []);
  const [portfolios, setPortfolios] = useState(p.portfolios?.length ? p.portfolios : []);
  const [error, setError] = useState('');
  const save = useSave(onDone);
  const submit = (e) => {
    e.preventDefault();
    const s = socials.filter((r) => r.platform || r.url).map((r) => ({ platform: r.platform, url: withScheme(r.url) }));
    const f = portfolios.filter((r) => r.name || r.url).map((r) => ({ name: r.name?.trim(), url: withScheme(r.url) }));
    if (s.some((r) => !r.platform || !r.url)) return setError('Each social profile needs a platform and a link');
    if (f.some((r) => !r.name || !r.url)) return setError('Each project needs a name and a link');
    setError('');
    return save.mutate({ socialProfiles: s, portfolios: f });
  };
  return (
    <form className="space-y-6" onSubmit={submit}>
      {error && <Alert tone="error">{error}</Alert>}
      <FormBlock title="Online social profiles">
        <RowsEditor
          rows={socials}
          onChange={setSocials}
          max={10}
          addLabel="Add social profile"
          blank={{ platform: '', url: '' }}
          render={(row, patch) => (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr]">
              <SelectField label="Platform" options={lookups.social_platform} value={row.platform} onChange={(e) => patch({ platform: e.target.value })} />
              <TextField label="Profile link" inputMode="url" autoCapitalize="off" value={row.url} onChange={(e) => patch({ url: e.target.value })} placeholder="https://" />
            </div>
          )}
        />
      </FormBlock>
      <FormBlock title="Projects and portfolio">
        <RowsEditor
          rows={portfolios}
          onChange={setPortfolios}
          max={20}
          addLabel="Add project"
          blank={{ name: '', url: '' }}
          render={(row, patch) => (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[220px_1fr]">
              <TextField label="Project / portfolio name" value={row.name} onChange={(e) => patch({ name: e.target.value })} maxLength={150} />
              <TextField label="Link" inputMode="url" autoCapitalize="off" value={row.url} onChange={(e) => patch({ url: e.target.value })} placeholder="https://" />
            </div>
          )}
        />
      </FormBlock>
      <SaveBar pending={save.isPending} onCancel={onCancel} />
    </form>
  );
};
