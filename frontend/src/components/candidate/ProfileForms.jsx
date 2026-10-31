import React, { useState } from 'react';
import Button from '../ui/Button';
import { Alert, ConfirmDialog, Modal } from '../ui/feedback';
import { CheckboxField, ChoiceChips, Field, FileDropzone, LocationField, SelectField, SuggestField, TextAreaField, TextField } from '../ui/form';
import { Section } from '../ui/data';
import { useAction, useLookups } from '../../hooks/useData';
import { candidateApi } from '../../services';
import { formatDate, placeLabel, toInputDate, toInputMonth } from '../../utils/format';

const invalidate = ['candidate-me', 'candidate-dashboard'];
const adultMax = new Date(new Date().getFullYear() - 14, 11, 31);
const useForm = (initial) => {
  const [form, setForm] = useState(initial);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  return [form, set, setForm];
};
const SaveBar = ({ pending, label = 'Save' }) => (
  <div className="flex justify-end">
    <Button type="submit" size="sm" variant="primaryBlue" loading={pending}>
      {label}
    </Button>
  </div>
);
const useSave = (onDone) => useAction(candidateApi.update, { success: 'Saved', invalidate, onSuccess: onDone });
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined));

export const BasicForm = ({ data, onDone }) => {
  const { user = {}, profile = {} } = data;
  const lookups = useLookups('gender', 'experience_level', 'journey_status', 'present_job_status', 'marital_status');
  const [form, set] = useForm({
    fullName: user.fullName || '',
    gender: user.gender || '',
    dob: toInputDate(profile.dob),
    experienceLevel: profile.experienceLevel || '',
    journeyStatus: profile.journeyStatus || '',
    presentJobStatus: profile.presentJobStatus || '',
    availabilityStatus: profile.availabilityStatus || '',
    maritalStatus: profile.maritalStatus || '',
    resumeHeadline: profile.resumeHeadline || '',
    profileSummary: profile.profileSummary || '',
    currentLocation: profile.currentLocation || null,
  });
  const save = useSave(onDone);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(clean(form));
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Full name" required value={form.fullName} onChange={set('fullName')} />
        <SelectField label="Gender" options={lookups.gender} value={form.gender} onChange={set('gender')} />
        <TextField label="Date of birth" type="date" max={adultMax} openTo="2000-01-01" value={form.dob} onChange={set('dob')} />
        <SelectField label="Marital status" options={lookups.marital_status} value={form.maritalStatus} onChange={set('maritalStatus')} />
        <SelectField label="Experience" options={lookups.experience_level} value={form.experienceLevel} onChange={set('experienceLevel')} />
        <SelectField label="Job search status" options={lookups.journey_status} value={form.journeyStatus} onChange={set('journeyStatus')} />
        <SelectField label="Present job status" options={lookups.present_job_status} value={form.presentJobStatus} onChange={set('presentJobStatus')} />
        <SelectField
          label="Availability"
          options={[
            { value: 'open_to_work', label: 'Open to work' },
            { value: 'serving_notice', label: 'Serving notice' },
            { value: 'not_available', label: 'Not available' },
          ]}
          value={form.availabilityStatus}
          onChange={set('availabilityStatus')}
        />
      </div>
      <LocationField label="Current location" value={form.currentLocation} onChange={set('currentLocation')} />
      <TextField label="Resume headline" value={form.resumeHeadline} onChange={set('resumeHeadline')} maxLength={250} />
      <TextAreaField label="Profile summary" value={form.profileSummary} onChange={set('profileSummary')} />
      <SaveBar pending={save.isPending} />
    </form>
  );
};

export const ResumeForm = ({ data }) => {
  const resume = data.profile?.resume;
  const [parsed, setParsed] = useState(null);
  const upload = useAction(candidateApi.uploadResume, { success: 'Resume uploaded', invalidate, onSuccess: (r) => setParsed(r.parsed) });
  const remove = useAction(candidateApi.deleteResume, { success: 'Resume removed', invalidate });
  const addSkills = useAction((skills) => candidateApi.update({ keySkills: [...new Set([...(data.profile?.keySkills || []), ...skills])].slice(0, 15) }), { success: 'Skills added', invalidate, onSuccess: () => setParsed(null) });
  const download = useAction(candidateApi.resumeLink, { onSuccess: (r) => window.open(r.url, '_blank', 'noopener') });
  return (
    <div className="space-y-3">
      {resume?.name && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-border p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-brand-dark">{resume.name}</p>
            <p className="text-xs text-brand-gray-muted">Uploaded {formatDate(resume.uploadedAt)}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => download.mutate()}>
              Download
            </Button>
            <Button size="sm" variant="dangerGhost" onClick={() => remove.mutate()}>
              Delete
            </Button>
          </div>
        </div>
      )}
      <FileDropzone accept=".pdf,.doc,.docx" maxSizeMb={5} busy={upload.isPending} onFile={upload.mutate} label={resume?.name ? 'Replace your resume' : 'Upload your resume'} hint="PDF, DOC or DOCX up to 5 MB" />
      {parsed?.skills?.length > 0 && (
        <Alert tone="info">
          We found these skills: {parsed.skills.slice(0, 10).join(', ')}.{' '}
          <button className="font-semibold underline" onClick={() => addSkills.mutate(parsed.skills)}>
            Add to profile
          </button>
        </Alert>
      )}
    </div>
  );
};

export const SkillsForm = ({ data, onDone }) => {
  const p = data.profile || {};
  const [form, set] = useForm({ keySkills: p.keySkills || [], itSkills: p.itSkills || [], certifications: p.certifications || [], languages: p.languages || [], englishFluency: p.englishFluency || '' });
  const lookups = useLookups('english_fluency');
  const save = useSave(onDone);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(clean(form));
      }}
    >
      <SuggestField label="Key skills" lookup="key_skill" multiple max={15} allowCreate value={form.keySkills} onChange={set('keySkills')} hint="Up to 15" />
      <SuggestField label="IT skills" lookup="it_skill" multiple max={15} allowCreate value={form.itSkills} onChange={set('itSkills')} />
      <SuggestField label="Certifications" lookup="certification" multiple max={30} allowCreate value={form.certifications} onChange={set('certifications')} />
      <SuggestField label="Languages" lookup="language" multiple max={30} value={form.languages} onChange={set('languages')} />
      <SelectField label="English fluency" options={lookups.english_fluency} value={form.englishFluency} onChange={set('englishFluency')} />
      <SaveBar pending={save.isPending} />
    </form>
  );
};

export const PreferencesForm = ({ data, onDone }) => {
  const p = data.profile || {};
  const pref = p.preferences || {};
  const lookups = useLookups('job_mode', 'employment_type', 'shift', 'notice_period');
  const [form, set] = useForm({
    jobModes: pref.jobModes || [],
    locations: pref.locations || [],
    willingToRelocate: Boolean(pref.willingToRelocate),
    anywhereInIndia: Boolean(pref.anywhereInIndia),
    expectedSalary: pref.expectedSalary || '',
    employmentTypes: pref.employmentTypes || [],
    shifts: pref.shifts || [],
    roles: pref.roles || [],
    currentSalary: p.currentSalary || '',
    noticePeriod: p.noticePeriod || '',
  });
  const save = useSave(onDone);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const { currentSalary, noticePeriod, expectedSalary, ...preferences } = form;
        save.mutate(clean({ currentSalary: Number(currentSalary) || undefined, noticePeriod, preferences: { ...pref, ...preferences, expectedSalary: Number(expectedSalary) || undefined } }));
      }}
    >
      <LocationField label="Preferred locations" multiple max={4} value={form.locations} onChange={set('locations')} hint="Up to 4" />
      <div className="flex flex-wrap gap-4">
        <CheckboxField label="Willing to relocate" checked={form.willingToRelocate} onChange={set('willingToRelocate')} />
        <CheckboxField label="Anywhere in India" checked={form.anywhereInIndia} onChange={set('anywhereInIndia')} />
      </div>
      <Field label="Work mode">
        <ChoiceChips multiple options={lookups.job_mode} value={form.jobModes} onChange={set('jobModes')} />
      </Field>
      <Field label="Employment type">
        <ChoiceChips multiple options={lookups.employment_type} value={form.employmentTypes} onChange={set('employmentTypes')} />
      </Field>
      <Field label="Shift">
        <ChoiceChips multiple options={lookups.shift} value={form.shifts} onChange={set('shifts')} />
      </Field>
      <SuggestField label="Preferred roles" lookup="job_role" multiple max={10} value={form.roles} onChange={set('roles')} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TextField label="Current monthly salary" type="number" min="0" value={form.currentSalary} onChange={set('currentSalary')} />
        <TextField label="Expected monthly salary" type="number" min="0" value={form.expectedSalary} onChange={set('expectedSalary')} />
        <SelectField label="Notice period" options={lookups.notice_period} value={form.noticePeriod} onChange={set('noticePeriod')} />
      </div>
      <SaveBar pending={save.isPending} />
    </form>
  );
};

const EmploymentModal = ({ item, onClose }) => {
  const lookups = useLookups('employment_type', 'job_mode');
  const [form, set] = useForm({
    jobTitle: item?.jobTitle || '',
    employerName: item?.employerName || '',
    employmentType: item?.employmentType || '',
    jobModes: item?.jobModes || [],
    isCurrent: Boolean(item?.isCurrent),
    startDate: toInputMonth(item?.startDate),
    endDate: toInputMonth(item?.endDate),
    monthlySalary: item?.monthlySalary || '',
    description: item?.description || '',
    skills: item?.skills || [],
  });
  const save = useAction(
    () => {
      const body = clean({ ...form, startDate: form.startDate && `${form.startDate}-01`, endDate: form.isCurrent ? undefined : form.endDate && `${form.endDate}-01`, monthlySalary: Number(form.monthlySalary) || undefined });
      return item ? candidateApi.updateItem('employments', item._id, body) : candidateApi.addItem('employments', body);
    },
    { success: 'Employment saved', invalidate, onSuccess: onClose },
  );
  return (
    <Modal open onClose={onClose} title={item ? 'Edit employment' : 'Add employment'} size="lg" footer={<Button type="submit" form="emp-form" size="sm" variant="primaryBlue" loading={save.isPending}>Save</Button>}>
      <form
        id="emp-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SuggestField label="Job title" required lookup="job_title" allowCreate value={form.jobTitle} onChange={set('jobTitle')} />
          <SuggestField label="Employer" required lookup="company_name" allowCreate value={form.employerName} onChange={set('employerName')} />
          <SelectField label="Employment type" options={lookups.employment_type} value={form.employmentType} onChange={set('employmentType')} />
          <TextField label="Monthly salary" type="number" min="0" value={form.monthlySalary} onChange={set('monthlySalary')} />
          <TextField label="Start month" type="month" value={form.startDate} onChange={set('startDate')} />
          {!form.isCurrent && <TextField label="End month" type="month" value={form.endDate} onChange={set('endDate')} />}
        </div>
        <CheckboxField label="I currently work here" checked={form.isCurrent} onChange={set('isCurrent')} />
        <Field label="Work mode">
          <ChoiceChips multiple max={3} options={lookups.job_mode} value={form.jobModes} onChange={set('jobModes')} />
        </Field>
        <SuggestField label="Skills used" lookup="key_skill" multiple max={15} allowCreate value={form.skills} onChange={set('skills')} />
        <TextAreaField label="Description" value={form.description} onChange={set('description')} />
      </form>
    </Modal>
  );
};

const EducationModal = ({ item, onClose }) => {
  const lookups = useLookups('education_level', 'education_status', 'education_type');
  const [form, set] = useForm({ level: item?.level || '', degree: item?.degree || '', specialisation: item?.specialisation || '', institution: item?.institution || '', status: item?.status || '', educationType: item?.educationType || '', startDate: toInputMonth(item?.startDate), endDate: toInputMonth(item?.endDate), marks: item?.marks || '', isHighest: Boolean(item?.isHighest) });
  const save = useAction(
    () => {
      const body = clean({ ...form, startDate: form.startDate && `${form.startDate}-01`, endDate: form.endDate && `${form.endDate}-01` });
      return item ? candidateApi.updateItem('educations', item._id, body) : candidateApi.addItem('educations', body);
    },
    { success: 'Education saved', invalidate, onSuccess: onClose },
  );
  return (
    <Modal open onClose={onClose} title={item ? 'Edit education' : 'Add education'} size="lg" footer={<Button type="submit" form="edu-form" size="sm" variant="primaryBlue" loading={save.isPending}>Save</Button>}>
      <form
        id="edu-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Level" required options={lookups.education_level} value={form.level} onChange={set('level')} />
          <SuggestField label="Degree" lookup="degree" allowCreate value={form.degree} onChange={set('degree')} />
          <SuggestField label="Specialisation" lookup="specialisation" allowCreate value={form.specialisation} onChange={set('specialisation')} />
          <SuggestField label="Institution" lookup="institution" allowCreate value={form.institution} onChange={set('institution')} />
          <SelectField label="Status" options={lookups.education_status} value={form.status} onChange={set('status')} />
          <SelectField label="Type" options={lookups.education_type} value={form.educationType} onChange={set('educationType')} />
          <TextField label="Start month" type="month" value={form.startDate} onChange={set('startDate')} />
          <TextField label="End month" type="month" value={form.endDate} onChange={set('endDate')} />
          <TextField label="Marks" value={form.marks} onChange={set('marks')} />
        </div>
        <CheckboxField label="This is my highest education" checked={form.isHighest} onChange={set('isHighest')} />
      </form>
    </Modal>
  );
};

/** Add, edit and delete rows for `employments` or `educations`. */
export const ItemList = ({ kind, items = [] }) => {
  const [editing, setEditing] = useState(null);
  const [removeId, setRemoveId] = useState(null);
  const remove = useAction((id) => candidateApi.removeItem(kind, id), { success: 'Removed', invalidate, onSuccess: () => setRemoveId(null) });
  const FormModal = kind === 'employments' ? EmploymentModal : EducationModal;
  const period = (i) => `${formatDate(i.startDate, 'MMM yyyy')} - ${i.isCurrent ? 'Present' : formatDate(i.endDate, 'MMM yyyy')}`;
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i._id} className="flex items-start justify-between gap-2 rounded-lg border border-brand-border p-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-dark">{kind === 'employments' ? i.jobTitle : [i.degree, i.level].filter(Boolean)[0]}</p>
            <p className="text-sm text-brand-gray">{kind === 'employments' ? i.employerName : i.institution}</p>
            <p className="text-xs text-brand-gray-muted">{period(i)}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>
              Edit
            </Button>
            <Button size="sm" variant="dangerGhost" onClick={() => setRemoveId(i._id)}>
              Delete
            </Button>
          </div>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => setEditing({})}>
        Add {kind === 'employments' ? 'employment' : 'education'}
      </Button>
      {editing && <FormModal item={editing._id ? editing : null} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={Boolean(removeId)} onClose={() => setRemoveId(null)} title="Delete this entry?" danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(removeId)} />
    </div>
  );
};

export const ProfileSummary = ({ data }) => {
  const p = data.profile || {};
  return (
    <Section title="Summary">
      <p className="text-sm text-brand-gray">{p.resumeHeadline || 'Add a headline'}</p>
      {p.currentLocation && <p className="mt-1 text-xs text-brand-gray-muted">{placeLabel(p.currentLocation)}</p>}
    </Section>
  );
};
