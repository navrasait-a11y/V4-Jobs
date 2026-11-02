import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { Avatar, Badge, DetailRow, PageHeader, ProgressBar, Section } from '../../components/ui/data';
import { ErrorState, Icon, Modal, PageLoader } from '../../components/ui/feedback';
import {
  CertificationsForm,
  ExperienceSummaryForm,
  IdentityForm,
  ItemList,
  PersonalForm,
  PreferencesForm,
  ResumeDetailsForm,
  ResumeForm,
  SocialForm,
} from '../../components/candidate/ProfileForms';
import useAuth from '../../hooks/useAuth';
import { useAction, useCandidateProfile, useDocumentTitle } from '../../hooks/useData';
import { candidateApi } from '../../services';
import { formatCurrency, formatDate, monthsToExperience, placeLabel } from '../../utils/format';

const Tags = ({ items, empty = 'Not added yet' }) =>
  items?.length ? (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <Badge key={s} tone="blue">
          {s}
        </Badge>
      ))}
    </div>
  ) : (
    <p className="text-sm text-brand-gray-muted">{empty}</p>
  );

const Details = ({ children }) => <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>;

const join = (...parts) => parts.filter(Boolean).join(', ');

/** Each profile part, its form and its modal title. Order follows the client's Excel. */
const EDITORS = {
  identity: ['Username and job status', IdentityForm, 'md'],
  personal: ['About yourself', PersonalForm, 'xl'],
  resumeDetails: ['Resume headline and skills', ResumeDetailsForm, 'lg'],
  experience: ['Experience', ExperienceSummaryForm, 'lg'],
  certifications: ['Certifications', CertificationsForm, 'lg'],
  preferences: ['Job preferences', PreferencesForm, 'xl'],
  social: ['Social profiles and portfolio', SocialForm, 'xl'],
};

const SECTION_LINKS = { photo: 'top', basic: 'personal', contact: 'personal', personal: 'personal', resume: 'resume', headline: 'resume', skills: 'resume', employment: 'work', education: 'education', preferences: 'preferences', languages: 'personal' };

const Profile = () => {
  useDocumentTitle('My profile');
  const { user, loadMe } = useAuth();
  const query = useCandidateProfile();
  const [editing, setEditing] = useState(null);
  const avatarRef = useRef(null);
  const avatar = useAction(candidateApi.uploadAvatar, { success: 'Photo updated', invalidate: ['candidate-me'], onSuccess: loadMe });
  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const { profile = {}, completion = {} } = query.data;
  const me = query.data.user || user;
  const pref = profile.preferences || {};
  const close = () => {
    setEditing(null);
    loadMe();
  };
  const edit = (key, label = 'Edit') => (
    <Button size="sm" variant="ghost" onClick={() => setEditing(key)}>
      <Icon name="edit" size={16} /> {label}
    </Button>
  );
  const missing = (completion.sections || []).filter((s) => !s.done);
  const [title, Form, size] = EDITORS[editing] || [];

  return (
    <div className="mx-auto max-w-5xl space-y-4" id="top">
      <div className="surface p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <button onClick={() => avatarRef.current?.click()} aria-label="Change profile photo" className="relative w-fit shrink-0">
            <Avatar name={me.fullName} src={me.avatar?.url} size={84} />
            <span className="absolute bottom-0 right-0 rounded-full bg-brand-blue p-1.5 text-white">
              <Icon name="photo_camera" size={14} />
            </span>
          </button>
          <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && avatar.mutate(e.target.files[0])} />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-1.5 text-xl font-bold text-brand-dark">
              {me.fullName}
              {me.isVerified && <Icon name="verified" size={18} fill className="text-brand-green" />}
              {me.username && <span className="text-sm font-medium text-brand-gray-muted">@{me.username}</span>}
            </h1>
            <p className="text-sm text-brand-gray">{profile.resumeHeadline || 'Add a resume headline to stand out'}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-brand-gray-muted">
              {profile.journeyStatus && <Badge tone="orange">{profile.journeyStatus}</Badge>}
              <span>{[placeLabel(profile.currentLocation), me.email, me.mobile && `+91 ${me.mobile}`].filter(Boolean).join(' · ')}</span>
            </div>
          </div>
          {edit('identity')}
        </div>
        <div className="mt-5">
          <div className="mb-1 flex justify-between text-xs text-brand-gray">
            <span>Profile strength</span>
            <span className="font-semibold text-brand-blue">{completion.score || 0}%</span>
          </div>
          <ProgressBar value={completion.score || 0} />
          {missing.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-brand-gray-muted">Add to improve:</span>
              {missing.map((s) => (
                <a key={s.key} href={`#${SECTION_LINKS[s.key] || 'top'}`} className="rounded-full border border-brand-border px-2.5 py-1 font-medium text-brand-dark hover:border-[#AEB7C4] hover:bg-brand-tint">
                  {s.label} <span className="text-brand-green">+{s.weight}%</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <div id="personal">
        <Section title="About yourself" actions={edit('personal')}>
          <Details>
            <DetailRow label="Gender" value={me.gender} />
            <DetailRow label="Date of birth" value={profile.dob && formatDate(profile.dob, 'dd MMM yyyy')} />
            <DetailRow label="Marital status" value={profile.maritalStatus} />
            <DetailRow label="Guardian" value={join(profile.guardianRelation, profile.guardianName)} />
            <DetailRow label="Category" value={profile.category} />
            <DetailRow label="Current location" value={placeLabel(profile.currentLocation)} />
            <DetailRow label="Home town" value={placeLabel(profile.hometown)} />
            <DetailRow label="Disability" value={join(profile.disability?.status, profile.disability?.type)} />
            <DetailRow label="Military experience" value={join(profile.military?.status, profile.military?.serviceType)} />
            <DetailRow label="English fluency" value={profile.englishFluency} />
            <DetailRow label="Languages known" value={profile.languages?.join(', ')} />
            <DetailRow label="Assets and licences" value={profile.assets?.join(', ')} />
          </Details>
        </Section>
      </div>

      <div id="resume" className="space-y-4">
        <Section title="Resume">
          <ResumeForm data={query.data} />
        </Section>
        <Section title="Resume headline and skills" actions={edit('resumeDetails')}>
          <div className="space-y-4">
            <DetailRow label="Resume headline" value={profile.resumeHeadline} />
            {profile.profileSummary && <DetailRow label="Career objective" value={profile.profileSummary} />}
            <div>
              <p className="mb-1.5 text-xs text-brand-gray-muted">Key skills</p>
              <Tags items={profile.keySkills} />
            </div>
            <div>
              <p className="mb-1.5 text-xs text-brand-gray-muted">IT skills</p>
              <Tags items={profile.itSkills} />
            </div>
          </div>
        </Section>
      </div>

      <div id="work">
        <Section title="Work experience" actions={edit('experience', 'Edit summary')}>
          <Details>
            <DetailRow label="Experience level" value={profile.experienceLevel} />
            <DetailRow label="Total experience" value={profile.totalExperienceMonths ? monthsToExperience(profile.totalExperienceMonths) : profile.experienceLevel === 'Fresher' ? 'Fresher' : ''} />
            <DetailRow label="Present job status" value={profile.presentJobStatus} />
          </Details>
          <div className="mt-5">
            <ItemList kind="employments" items={profile.employments} />
          </div>
        </Section>
      </div>

      <div id="education" className="space-y-4">
        <Section title="Education">
          <ItemList kind="educations" items={profile.educations} />
        </Section>
        <Section title="Certifications" actions={edit('certifications')}>
          <Tags items={profile.certifications} empty="Add courses and certificates you have completed" />
        </Section>
      </div>

      <div id="preferences">
        <Section title="Job preferences" actions={edit('preferences')}>
          <Details>
            <DetailRow label="Looking for" value={(pref.jobTypes || []).map((t) => (t === 'job' ? 'Jobs' : 'Internships')).join(', ')} />
            <DetailRow label="Preferred locations" value={[...(pref.locations || []).map(placeLabel), pref.anywhereInIndia && 'Anywhere in India'].filter(Boolean).join(' · ')} />
            <DetailRow label="Willing to relocate" value={pref.willingToRelocate ? 'Yes' : pref.locations?.length ? 'No' : ''} />
            <DetailRow label="Job mode" value={pref.jobModes?.join(', ')} />
            <DetailRow label="Shift" value={pref.shifts?.join(', ')} />
            <DetailRow label="Employment type" value={pref.employmentTypes?.join(', ')} />
            <DetailRow label="Expected salary" value={pref.expectedSalary ? `${formatCurrency(pref.expectedSalary)} per month` : ''} />
            <DetailRow label="Notice period" value={pref.noticePeriod || profile.noticePeriod} />
            <DetailRow label="Industry" value={pref.industries?.join(', ')} />
            <DetailRow label="Department" value={pref.departments?.join(', ')} />
            <DetailRow label="Job roles" value={pref.roles?.join(', ')} />
            <DetailRow label="Preferred skills" value={pref.skills?.join(', ')} />
          </Details>
        </Section>
      </div>

      <div id="social">
        <Section title="Social profiles and portfolio" actions={edit('social')}>
          {profile.socialProfiles?.length || profile.portfolios?.length ? (
            <ul className="space-y-2 text-sm">
              {[...(profile.socialProfiles || []).map((s) => [s.platform, s.url]), ...(profile.portfolios || []).map((s) => [s.name, s.url])].map(([label, url]) => (
                <li key={`${label}-${url}`} className="flex min-w-0 items-center gap-2">
                  <Icon name="link" size={16} className="shrink-0 text-brand-gray-muted" />
                  <span className="shrink-0 font-medium text-brand-dark">{label}</span>
                  <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-brand-blue hover:underline">
                    {url.replace(/^https?:\/\//, '')}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-brand-gray-muted">Add LinkedIn, GitHub or any project link employers can open.</p>
          )}
        </Section>
      </div>

      {Form && (
        <Modal open onClose={() => setEditing(null)} title={title} size={size}>
          <Form data={query.data} onDone={close} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
};

const STEPS = [
  ['About yourself', 'personal'],
  ['Resume', 'resume'],
  ['Work experience', 'work'],
  ['Education', 'education'],
  ['Preferences', 'preferences'],
  ['Social and portfolio', 'social'],
];

export const CompleteProfile = () => {
  useDocumentTitle('Complete your profile');
  const navigate = useNavigate();
  const { loadMe } = useAuth();
  const query = useCandidateProfile();
  const [step, setStep] = useState(0);
  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const next = () => {
    window.scrollTo({ top: 0 });
    if (step === STEPS.length - 1) {
      loadMe();
      navigate('/candidate/profile');
    } else setStep((s) => s + 1);
  };
  const { profile = {}, completion = {} } = query.data;
  const key = STEPS[step][1];
  const continueBar = (
    <div className="mt-5 flex justify-end gap-2 border-t border-brand-border pt-4">
      <Button size="sm" variant="ghost" onClick={next}>
        Skip
      </Button>
      <Button size="sm" variant="primaryBlue" onClick={next}>
        Continue
      </Button>
    </div>
  );
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Complete your profile"
        subtitle={`${completion.score || 0}% complete. A stronger profile gets more recruiter views.`}
        actions={
          <Link to="/candidate/dashboard" className="text-sm font-medium text-brand-blue">
            Skip for now
          </Link>
        }
      />
      <ol className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {STEPS.map(([label], i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(i)}
              aria-current={i === step ? 'step' : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${i === step ? 'bg-brand-blue text-white' : i < step ? 'bg-brand-green-tint text-brand-green' : 'bg-white text-brand-gray'}`}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>
      <Section title={STEPS[step][0]}>
        {key === 'personal' && <PersonalForm data={query.data} onDone={next} />}
        {key === 'resume' && (
          <div className="space-y-6">
            <ResumeForm data={query.data} />
            <ResumeDetailsForm data={query.data} onDone={next} />
          </div>
        )}
        {key === 'work' && (
          <div className="space-y-6">
            <ExperienceSummaryForm data={query.data} onDone={() => query.refetch()} />
            <ItemList kind="employments" items={profile.employments} />
            {continueBar}
          </div>
        )}
        {key === 'education' && (
          <div className="space-y-6">
            <ItemList kind="educations" items={profile.educations} />
            <CertificationsForm data={query.data} onDone={next} />
          </div>
        )}
        {key === 'preferences' && <PreferencesForm data={query.data} onDone={next} />}
        {key === 'social' && <SocialForm data={query.data} onDone={next} />}
      </Section>
    </div>
  );
};

export default Profile;
