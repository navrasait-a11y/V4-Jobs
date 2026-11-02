import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import UpsellNotice from '../../components/employer/UpsellNotice';
import JobPostForm, { JOB_BLANK, jobFormErrors, jobToForm, toJobPayload } from '../../components/employer/JobPostForm';
import Button from '../../components/ui/Button';
import { PageHeader, Section } from '../../components/ui/data';
import { Alert, PageLoader } from '../../components/ui/feedback';
import { CheckboxField, ChoiceChips, Field, TextField } from '../../components/ui/form';
import useAuth from '../../hooks/useAuth';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import { employerJobApi, orgApi } from '../../services';

const READ_ONLY = ['status', 'slug', '_id', 'uid', 'organization', 'organizationType', 'postedBy', 'stats', 'orgSnapshot', 'createdAt', 'updatedAt', 'collaborators', 'callbackRequests'];

/** "Other User Can View/Edit Job": team members who can manage this job. */
const CollaboratorPicker = ({ value, onChange, me }) => {
  const team = useQuery({ queryKey: ['employer-team-all'], queryFn: () => orgApi.team({ limit: 100 }), staleTime: 60 * 1000 });
  const members = (team.data?.data || []).filter((m) => String(m._id) !== String(me) && m.status !== 'trashed');
  if (!members.length) return <p className="text-sm text-brand-gray">Add team members in Employees to let them view and edit this job.</p>;
  return (
    <Field label="Other users who can view / edit this job">
      <ChoiceChips multiple options={members.map((m) => ({ value: String(m._id), label: m.fullName || m.email }))} value={value} onChange={onChange} />
    </Field>
  );
};

const PostJob = () => {
  const { id: routeId } = useParams();
  useDocumentTitle(routeId ? 'Edit job' : 'Post a job');
  const navigate = useNavigate();
  const { organization, user } = useAuth();
  const consultancy = organization?.type === 'consultancy';
  const [jobId, setJobId] = useState(routeId || null);
  const [form, setForm] = useState(JOB_BLANK);
  const [extra, setExtra] = useState({ applyExternalUrl: '', googleJobsEnabled: true, collaborators: [] });
  const [errors, setErrors] = useState({});
  const [featured, setFeatured] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [status, setStatus] = useState('draft');
  const loaded = useRef(!routeId);
  const savedCollaborators = useRef([]);

  const existing = useQuery({ queryKey: ['employer-job', routeId], queryFn: () => employerJobApi.get(routeId), enabled: Boolean(routeId) });
  useEffect(() => {
    if (!existing.data) return;
    const j = existing.data.job || existing.data;
    setForm(jobToForm(j));
    setStatus(j.status);
    savedCollaborators.current = (j.collaborators || []).map(String);
    setExtra({ applyExternalUrl: j.applyExternalUrl || '', googleJobsEnabled: j.googleJobsEnabled !== false, collaborators: savedCollaborators.current });
    loaded.current = true;
  }, [existing.data]);

  const editable = !routeId || status === 'draft';
  const saveDraft = async () => {
    const payload = toJobPayload(form);
    for (const k of READ_ONLY) delete payload[k];
    const body = { ...payload, applyExternalUrl: extra.applyExternalUrl, googleJobsEnabled: extra.googleJobsEnabled };
    let id = jobId;
    if (id) await employerJobApi.update(id, body);
    else {
      const created = await employerJobApi.create({ ...body, publish: false });
      id = created._id || created.job?._id;
      setJobId(id);
    }
    return id;
  };
  const saveCollaborators = async (id) => {
    if ([...extra.collaborators].sort().join() === [...savedCollaborators.current].sort().join()) return;
    await employerJobApi.collaborators(id, extra.collaborators).catch(() => toast.error('Could not update the users who can edit this job'));
  };

  // Draft auto-save ("Draft or Resume Form In Case of any Error"): once a title exists and the job is still a draft.
  const snapshot = useMemo(() => JSON.stringify([form, extra.applyExternalUrl, extra.googleJobsEnabled]), [form, extra]);
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

  const onError = (e) => {
    setErrors(e.fieldErrors || {});
    if (e.status !== 402) toast.error(e.message);
  };
  const publish = useAction(
    async () => {
      const id = await saveDraft();
      lastSaved.current = snapshot;
      await saveCollaborators(id);
      return employerJobApi.publish(id, { featured });
    },
    {
      invalidate: ['employer-jobs', 'subscriptions'],
      silent: true,
      onSuccess: (j) => {
        const st = j.status || j.job?.status;
        toast.success(st === 'active' ? 'Your job is live' : 'Job submitted for review');
        navigate('/employer/jobs');
      },
      onError,
    },
  );
  const update = useAction(
    async () => {
      const id = await saveDraft();
      await saveCollaborators(id);
      return id;
    },
    { success: 'Job updated', invalidate: ['employer-jobs'], onSuccess: () => navigate('/employer/jobs'), onError },
  );

  if (routeId && existing.isPending) return <PageLoader />;
  const fieldErrors = Object.entries(errors).filter(([k]) => !['title', 'description', 'locations'].includes(k));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={routeId ? 'Edit job' : form.kind === 'internship' ? 'Post an internship' : 'Post a job'} subtitle={savedAt ? `Draft saved at ${savedAt.toLocaleTimeString()}` : 'Drafts save automatically, so you can resume any time'} />
      <UpsellNotice error={publish.error} />
      {fieldErrors.length > 0 && (
        <Alert tone="error" className="mb-4">
          {fieldErrors.map(([k, m]) => `${k}: ${m}`).join('. ')}
        </Alert>
      )}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const local = jobFormErrors(form, { requireAll: editable });
          setErrors(local);
          if (Object.keys(local).length) return toast.error('Please fix the highlighted fields');
          return editable ? publish.mutate() : update.mutate();
        }}
      >
        <JobPostForm
          form={form}
          setForm={setForm}
          errors={errors}
          consultancy={consultancy}
          collaborators={<CollaboratorPicker me={user?._id} value={extra.collaborators} onChange={(collaborators) => setExtra((x) => ({ ...x, collaborators }))} />}
        />
        <Section title="Application settings">
          <div className="space-y-4">
            <TextField label="External apply URL" value={extra.applyExternalUrl} onChange={(e) => setExtra((x) => ({ ...x, applyExternalUrl: e.target.value }))} placeholder="Leave empty to collect applications here" />
            <CheckboxField label="List on Google Jobs" checked={extra.googleJobsEnabled} onChange={(e) => setExtra((x) => ({ ...x, googleJobsEnabled: e.target.checked }))} />
            {editable && <CheckboxField label="Feature this job (uses 1 featured credit)" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />}
          </div>
        </Section>

        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 surface p-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/employer/jobs')}>
            Back to jobs
          </Button>
          <Button type="submit" size="sm" variant="primary" loading={publish.isPending || update.isPending}>
            {editable ? (form.kind === 'internship' ? 'Post an internship' : 'Post a job') : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default PostJob;
