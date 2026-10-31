import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { Avatar, Badge, PageHeader, ProgressBar, Section } from '../../components/ui/data';
import { ErrorState, Icon, Modal, PageLoader } from '../../components/ui/feedback';
import { BasicForm, ItemList, PreferencesForm, ResumeForm, SkillsForm } from '../../components/candidate/ProfileForms';
import useAuth from '../../hooks/useAuth';
import { useAction, useCandidateProfile, useDocumentTitle } from '../../hooks/useData';
import { candidateApi } from '../../services';
import { monthsToExperience, placeLabel } from '../../utils/format';

const Tags = ({ items }) =>
  items?.length ? (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <Badge key={s} tone="blue">
          {s}
        </Badge>
      ))}
    </div>
  ) : (
    <p className="text-sm text-brand-gray-muted">Not added yet</p>
  );

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
  const close = () => setEditing(null);
  const edit = (key) => (
    <Button size="sm" variant="ghost" onClick={() => setEditing(key)}>
      Edit
    </Button>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="surface p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <button onClick={() => avatarRef.current?.click()} aria-label="Change photo" className="relative w-fit">
            <Avatar name={user.fullName} src={user.avatar?.url} size={80} />
            <span className="absolute bottom-0 right-0 rounded-full bg-brand-blue p-1 text-white">
              <Icon name="photo_camera" size={14} />
            </span>
          </button>
          <input ref={avatarRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && avatar.mutate(e.target.files[0])} />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1.5 text-xl font-bold text-brand-dark">
              {user.fullName}
              {user.isVerified && <Icon name="verified" size={18} fill className="text-brand-green" />}
            </h1>
            <p className="text-sm text-brand-gray">{profile.resumeHeadline || 'Add a headline to stand out'}</p>
            <p className="mt-1 text-xs text-brand-gray-muted">{[placeLabel(profile.currentLocation), user.email, user.mobile].filter(Boolean).join(' · ')}</p>
          </div>
          {edit('basic')}
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-brand-gray">
            <span>Profile strength</span>
            <span className="font-semibold text-brand-blue">{completion.score || 0}%</span>
          </div>
          <ProgressBar value={completion.score || 0} />
        </div>
      </div>

      <Section title="Resume">
        <ResumeForm data={query.data} />
      </Section>
      <Section title="Skills" actions={edit('skills')}>
        <Tags items={profile.keySkills} />
      </Section>
      <Section title="Employment">
        <ItemList kind="employments" items={profile.employments} />
      </Section>
      <Section title="Education">
        <ItemList kind="educations" items={profile.educations} />
      </Section>
      <Section title="Job preferences" actions={edit('preferences')}>
        <p className="mb-2 text-sm text-brand-gray">Total experience: {monthsToExperience((profile.totalExperience?.years || 0) * 12 + (profile.totalExperience?.months || 0))}</p>
        <Tags items={[...(profile.preferences?.locations || []).map((l) => l.city), ...(profile.preferences?.jobModes || [])]} />
      </Section>

      <Modal open={editing === 'basic'} onClose={close} title="Basic details" size="lg">
        <BasicForm data={query.data} onDone={close} />
      </Modal>
      <Modal open={editing === 'skills'} onClose={close} title="Skills" size="lg">
        <SkillsForm data={query.data} onDone={close} />
      </Modal>
      <Modal open={editing === 'preferences'} onClose={close} title="Job preferences" size="lg">
        <PreferencesForm data={query.data} onDone={close} />
      </Modal>
    </div>
  );
};

const STEPS = ['Basic details', 'Resume', 'Employment', 'Education', 'Skills', 'Preferences'];

export const CompleteProfile = () => {
  useDocumentTitle('Complete your profile');
  const navigate = useNavigate();
  const query = useCandidateProfile();
  const [step, setStep] = useState(0);
  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const next = () => (step === STEPS.length - 1 ? navigate('/candidate/profile') : setStep((s) => s + 1));
  const { profile = {}, completion = {} } = query.data;
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
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${i === step ? 'bg-brand-blue text-white' : i < step ? 'bg-brand-green-tint text-brand-green' : 'bg-white text-brand-gray'}`}>
            {i + 1}. {s}
          </button>
        ))}
      </div>
      <Section title={STEPS[step]}>
        {step === 0 && <BasicForm data={query.data} onDone={next} />}
        {step === 1 && <ResumeForm data={query.data} />}
        {step === 2 && <ItemList kind="employments" items={profile.employments} />}
        {step === 3 && <ItemList kind="educations" items={profile.educations} />}
        {step === 4 && <SkillsForm data={query.data} onDone={next} />}
        {step === 5 && <PreferencesForm data={query.data} onDone={next} />}
        {[1, 2, 3].includes(step) && (
          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="primaryBlue" onClick={next}>
              Continue
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
};

export default Profile;
