import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import JobPostForm, { JOB_BLANK, JOB_STEPS, jobFormErrors, jobToForm, toJobPayload } from '../../components/employer/JobPostForm';
import JobReview from '../../components/employer/JobReview';
import { StepNav, Stepper, useSteps } from '../../components/ui/stepper';
import Button from '../../components/ui/Button';
import { PageHeader, SearchInput, Section } from '../../components/ui/data';
import { Alert } from '../../components/ui/feedback';
import { CheckboxField, SelectField } from '../../components/ui/form';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import useDebounce from '../../hooks/useDebounce';
import { adminApi } from '../../services';
import { titleCase } from '../../utils/format';

const STEPS = [...JOB_STEPS, { key: 'publish', title: 'Review & publish', short: 'Publish', fields: ['organizationId', 'publish', 'featured'] }];

/** PRD: "Admin can Post a Job Vacancy, Post an Internship on Behalf of employers" (scratch or prefill). */
const AdminPostJob = () => {
  useDocumentTitle('Post job for employer');
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const debounced = useDebounce(q, 300);
  const [org, setOrg] = useState(null);
  const [prefillFrom, setPrefillFrom] = useState('');
  const [form, setForm] = useState(JOB_BLANK);
  const [errors, setErrors] = useState({});
  const [publish, setPublish] = useState(true);
  const [featured, setFeatured] = useState(false);
  const { step, reached, goTo, next, validateAll, showErrors, errorSteps, last } = useSteps(STEPS, { validate: () => jobFormErrors(form, { requireAll: publish }), setErrors, watch: form });

  const orgs = useQuery({ queryKey: ['admin-employers-pick', debounced], queryFn: () => adminApi.list('/employers', { q: debounced || undefined, status: 'active', limit: 20 }), enabled: !org });
  const previous = useQuery({
    queryKey: ['admin-jobs-prefill', org?._id, form.kind],
    queryFn: () => adminApi.list('/jobs', { organization: org._id, kind: form.kind, limit: 100 }),
    enabled: Boolean(org),
  });

  const pickPrefill = async (id) => {
    setPrefillFrom(id);
    if (!id) return setForm((f) => ({ ...JOB_BLANK, kind: f.kind }));
    try {
      const j = await adminApi.get(`/jobs/${id}`);
      const next = jobToForm(j.job || j);
      setForm({ ...next, deadlineAt: '', walkIn: { ...next.walkIn, startDate: '', endDate: '' } });
    } catch (e) {
      toast.error(e.message);
    }
    return undefined;
  };

  const submit = useAction(() => adminApi.post('/jobs', { ...toJobPayload(form), organizationId: org._id, publish, featured, ...(prefillFrom ? { prefillFrom } : {}) }), {
    silent: true,
    onSuccess: (job) => {
      toast.success(publish ? 'Job posted for the employer' : 'Draft saved for the employer');
      navigate(`/admin/jobs?q=${encodeURIComponent(job.title || '')}`);
    },
    onError: (e) => {
      setErrors(e.fieldErrors || {});
      showErrors(e.fieldErrors);
      toast.error(e.message);
    },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Post a job / internship for an employer"
        subtitle="The job is posted under the employer's account. No credits are used."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/jobs">Back to jobs</Link>
          </Button>
        }
      />
      <Section title="Employer">
        {org ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-brand-dark">
              <b>{org.name}</b> · {titleCase(org.type || '')} {org.uid && <span className="text-brand-gray-muted">({org.uid})</span>}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOrg(null);
                setPrefillFrom('');
                setForm(JOB_BLANK);
                goTo(0);
              }}
            >
              Change employer
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <SearchInput value={q} onChange={setQ} placeholder="Search company / consultancy by name, ID, e-mail or mobile" />
            <ul className="max-h-64 divide-y divide-brand-border overflow-y-auto rounded-lg border border-brand-border">
              {(orgs.data?.data || []).map((o) => (
                <li key={o._id}>
                  <button type="button" onClick={() => setOrg(o)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-blue-tint">
                    <span className="truncate font-medium text-brand-dark">{o.name}</span>
                    <span className="shrink-0 text-xs text-brand-gray-muted">
                      {titleCase(o.type || '')} {o.uid}
                    </span>
                  </button>
                </li>
              ))}
              {orgs.data && !orgs.data.data.length && <li className="px-3 py-2 text-sm text-brand-gray">No active employer found</li>}
            </ul>
          </div>
        )}
      </Section>

      {org && (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!last) return next();
            if (!validateAll()) return undefined;
            return submit.mutate();
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.target.tagName === 'INPUT' && !last && e.preventDefault()}
        >
          <Stepper steps={STEPS} current={step} reached={reached} onStep={goTo} errorSteps={errorSteps(errors)} />
          {step === 0 && (
            <Section title="How do you want to start?">
              <SelectField
                label={`Begin from scratch or prefill from this employer's previous ${form.kind === 'internship' ? 'internships' : 'jobs'}`}
                placeholder="Begin from scratch"
                options={(previous.data?.data || []).map((j) => ({ value: j._id, label: `${j.title} (${j.status})` }))}
                value={prefillFrom}
                onChange={(e) => pickPrefill(e.target.value)}
              />
            </Section>
          )}
          {last && Object.keys(errors).length > 0 && <Alert tone="error">{Object.values(errors).join('. ')}</Alert>}
          {!last && <JobPostForm step={step} form={form} setForm={setForm} errors={errors} consultancy={org.type === 'consultancy'} />}
          {last && (
            <>
              <JobReview form={form} onEdit={goTo} />
              <Section title="Publishing">
                <div className="flex flex-wrap gap-6">
                  <CheckboxField label="Publish now" description="Off saves a draft in the employer's account" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
                  <CheckboxField label="Featured" description="Shows the job in featured slots" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
                </div>
              </Section>
            </>
          )}
          <StepNav
            current={step}
            total={STEPS.length}
            onBack={() => goTo(step - 1)}
            onNext={next}
            submitLabel={publish ? (form.kind === 'internship' ? 'Post internship' : 'Post job') : 'Save draft'}
            loading={submit.isPending}
          />
        </form>
      )}
    </div>
  );
};

export default AdminPostJob;
