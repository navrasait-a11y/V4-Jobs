import React from 'react';
import { ChoiceChips, Field, LocationField, SelectField, SuggestField, TextField } from '../ui/form';
import { useLookups } from '../../hooks/useData';
import { formatCurrency } from '../../utils/format';
import HierarchyField from '../ui/HierarchyField';
import { COURSE_LEVELS, ExperienceField } from './ProfileForms';

/*
 * Job alert criteria, shared by the candidate's alert manager and the guest alert page.
 * Fields and limits follow the "Set Job Alert" sheet of the client's Excel.
 */

export const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

/** Form state from a saved alert (or from the profile prefill). */
export const criteriaForm = (c = {}) => ({
  experienceLevel: c.experienceLevel || '',
  totalExperienceMonths: c.totalExperienceMonths ?? '',
  jobTitle: c.jobTitle || '',
  keySkills: c.keySkills || [],
  presentJobStatus: c.presentJobStatus || '',
  currentSalary: c.currentSalary ?? '',
  locations: (c.locations || []).slice(0, 3),
  industries: c.industries || [],
  subIndustries: c.subIndustries || [],
  departments: c.departments || [],
  functions: c.functions || [],
  roles: c.roles || [],
  educationLevels: c.educationLevels || [],
  degrees: c.degrees || [],
  specialisations: c.specialisations || [],
});

/** API criteria from form state. Values the form does not show (job modes, kind) are kept from `base`. */
export const toCriteria = (form, base = {}) => {
  const out = {
    ...base,
    experienceLevel: form.experienceLevel || undefined,
    totalExperienceMonths: form.totalExperienceMonths === '' ? undefined : Number(form.totalExperienceMonths),
    jobTitle: form.jobTitle || undefined,
    keySkills: form.keySkills,
    presentJobStatus: form.presentJobStatus || undefined,
    currentSalary: form.currentSalary === '' ? undefined : Number(form.currentSalary),
    locations: form.locations,
    industries: form.industries,
    subIndustries: form.subIndustries,
    departments: form.departments,
    functions: form.functions,
    roles: form.roles,
    educationLevels: form.educationLevels,
    degrees: form.degrees,
    specialisations: form.specialisations,
    kind: base.kind || 'any',
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
};

/** At least one thing to match on, or the alert would send every job. */
export const criteriaError = (form) =>
  form.jobTitle || form.keySkills.length || form.roles.length || form.departments.length || form.industries.length ? '' : 'Add a job title, a key skill or a role so we know which jobs to send';

const Block = ({ title, children }) => (
  <fieldset className="space-y-4">
    <legend className="mb-3 w-full border-b border-brand-border pb-2 text-sm font-semibold text-brand-dark">{title}</legend>
    {children}
  </fieldset>
);

export const AlertCriteriaFields = ({ form, set, setForm }) => {
  const lookups = useLookups('experience_level', 'present_job_status', 'education_level');
  const fresher = /fresher/i.test(form.experienceLevel);
  const courseLevels = form.educationLevels.filter((l) => COURSE_LEVELS.includes(l));
  return (
    <div className="space-y-6">
      <Block title="About you">
        <Field label="Your experience level">
          <ChoiceChips options={lookups.experience_level} value={form.experienceLevel} onChange={set('experienceLevel')} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!fresher && <ExperienceField months={form.totalExperienceMonths} onChange={set('totalExperienceMonths')} />}
          <SelectField label="Present job status" options={lookups.present_job_status} value={form.presentJobStatus} onChange={set('presentJobStatus')} />
          <SuggestField label={fresher ? 'Job title you want' : 'Current job title / role'} lookup="job_title" allowCreate value={form.jobTitle} onChange={set('jobTitle')} placeholder="e.g. Sales Executive" />
          {!fresher && (
            <TextField
              label="Current in-hand salary"
              inputMode="numeric"
              value={form.currentSalary}
              onChange={(e) => set('currentSalary')(e.target.value.replace(/\D/g, '').slice(0, 9))}
              hint={form.currentSalary ? `${formatCurrency(form.currentSalary)} per month` : 'Monthly, in ₹'}
            />
          )}
        </div>
        <SuggestField label="Key skills" lookup="key_skill" multiple max={15} allowCreate value={form.keySkills} onChange={set('keySkills')} hint={`${form.keySkills.length}/15. Type to see suggestions`} placeholder="e.g. Field Sales, MS Excel" />
      </Block>
      <Block title="Jobs you want">
        <LocationField label="Preferred job locations" multiple max={3} value={form.locations} onChange={set('locations')} hint="Up to 3. District, city or state" placeholder="e.g. Jagatpura, Jaipur" />
        <HierarchyField kind="industry" label="Industry" value={{ parents: form.industries, children: form.subIndustries }} onChange={({ parents, children }) => setForm((f) => ({ ...f, industries: parents, subIndustries: children }))} />
        <HierarchyField kind="department" label="Department / functions" value={{ parents: form.departments, children: form.functions }} onChange={({ parents, children }) => setForm((f) => ({ ...f, departments: parents, functions: children }))} />
        <SuggestField label="Job roles" lookup="job_role" limit={15} multiple max={10} value={form.roles} onChange={set('roles')} hint="Up to 10" placeholder="Type a role, e.g. Accountant" />
      </Block>
      <Block title="Education">
        <Field label="Level of education" hint="Up to 5, lowest to highest">
          <ChoiceChips multiple max={5} options={lookups.education_level} value={form.educationLevels} onChange={(v) => set('educationLevels')(lookups.education_level.filter((l) => v.includes(l)))} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SuggestField label="Degree / course" lookup="degree" parents={courseLevels.join('|') || undefined} limit={60} multiple max={5} value={form.degrees} onChange={set('degrees')} hint={courseLevels.length ? 'Up to 5' : 'Up to 5. Choose ITI, Diploma, Graduate or higher above to filter'} />
          <SuggestField label="Specialisation" lookup="specialisation" parents={form.degrees.join('|') || undefined} limit={100} multiple max={5} disabled={!form.degrees.length} value={form.specialisations} onChange={set('specialisations')} hint="Up to 5" placeholder={form.degrees.length ? 'Type to search' : 'Choose a course first'} />
        </div>
      </Block>
    </div>
  );
};
