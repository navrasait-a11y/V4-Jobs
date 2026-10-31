import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import BillingPanel from '../../components/shared/BillingPanel';
import Button from '../../components/ui/Button';
import { PageHeader, Section, SimpleSelect, StatTile } from '../../components/ui/data';
import { ErrorState, PageLoader } from '../../components/ui/feedback';
import { TextAreaField, TextField } from '../../components/ui/form';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import { analyticsApi, candidateApi } from '../../services';
import { TIMESPAN_OPTIONS, formatDate } from '../../utils/format';

export const CandidateBilling = () => {
  useDocumentTitle('Profile booster');
  return (
    <div>
      <PageHeader title="Profile Booster" subtitle="Get seen first by recruiters" />
      <BillingPanel audience="candidate" />
    </div>
  );
};

export const CandidateAnalytics = () => {
  useDocumentTitle('Analytics');
  const [timespan, setTimespan] = useState('30d');
  const query = useQuery({ queryKey: ['candidate-analytics', timespan], queryFn: () => analyticsApi.candidate({ timespan }) });
  const d = query.data;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  return (
    <div>
      <PageHeader title="Analytics" actions={<SimpleSelect ariaLabel="Time range" value={timespan} onChange={setTimespan} options={TIMESPAN_OPTIONS} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile loading={query.isPending} icon="visibility" label="Profile views" value={d?.profileViews?.total} />
        <StatTile loading={query.isPending} icon="download" tone="green" label="Resume downloads" value={d?.resumeDownloads?.total} />
        <StatTile loading={query.isPending} icon="search" tone="orange" label="Search appearances" value={d?.searchAppearances} />
        <StatTile loading={query.isPending} icon="percent" tone="purple" label="Application view rate" value={`${d?.applicationPerformance?.viewRate ?? 0}%`} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Profile views" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d?.profileViews?.daily || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F0" vertical={false} />
                <XAxis dataKey="_id" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip />
                <Area dataKey="count" name="Views" stroke="#0151A0" fill="#EDF4FC" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Companies viewing you">
          {!d?.recentViewers?.length && <p className="text-sm text-brand-gray">No views yet.</p>}
          <ul className="space-y-2 text-sm">
            {d?.recentViewers?.map((v, i) => (
              <li key={v.organization?._id || i} className="flex justify-between gap-2">
                <span className="truncate text-brand-dark">{v.organization?.name || 'Employer'}</span>
                <span className="shrink-0 text-xs text-brand-gray-muted">{formatDate(v.lastViewedAt)}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      {d?.skillTrends?.length > 0 && (
        <Section title="Skills in demand" className="mt-4">
          <div className="flex flex-wrap gap-2">
            {d.skillTrends.map((s) => (
              <span key={s.skill} className={`rounded-full px-3 py-1 text-xs font-medium ${s.youHaveIt ? 'bg-brand-green-tint text-brand-green' : 'bg-brand-tint text-brand-gray'}`}>
                {s.skill} · {s.activeJobs}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-brand-gray-muted">Green skills are already on your profile.</p>
        </Section>
      )}
    </div>
  );
};

export const ResumeBuilder = () => {
  useDocumentTitle('Resume builder');
  const query = useQuery({ queryKey: ['resume-builder'], queryFn: candidateApi.resumeBuilder });
  const [form, setForm] = useState(null);
  useEffect(() => {
    if (query.data) setForm(query.data);
  }, [query.data]);
  const save = useAction(() => candidateApi.saveResumeBuilder(form), { success: 'Resume saved', invalidate: ['resume-builder'] });
  if (query.isPending || !form) return query.isError ? <ErrorState error={query.error} onRetry={query.refetch} /> : <PageLoader />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setPersonal = (k) => (e) => setForm((f) => ({ ...f, personal: { ...f.personal, [k]: e.target.value } }));
  const me = form.personal || {};
  const skills = Array.isArray(form.skills) ? form.skills : [];
  const jobs = form.employments || [];
  const edu = form.educations || [];
  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="Resume Builder"
          subtitle="Pre-filled from your profile. Print or save as PDF."
          actions={
            <>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                Print / PDF
              </Button>
              <Button size="sm" variant="primaryBlue" loading={save.isPending} onClick={() => save.mutate()}>
                Save
              </Button>
            </>
          }
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Details" className="print:hidden">
          <div className="space-y-4">
            <TextField label="Full name" value={me.fullName || ''} onChange={setPersonal('fullName')} />
            <TextField label="Headline" value={form.headline || ''} onChange={set('headline')} />
            <TextField label="Email" value={me.email || ''} onChange={setPersonal('email')} />
            <TextField label="Mobile" value={me.mobile || ''} onChange={setPersonal('mobile')} />
            <TextAreaField label="Summary" rows={5} value={form.summary || ''} onChange={set('summary')} />
            <TextField label="Skills (comma separated)" value={skills.join(', ')} onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value.split(',').map((s) => s.trimStart()) }))} />
          </div>
        </Section>
        <section className="surface p-6 print:border-0">
          <h2 className="text-2xl font-bold text-brand-dark">{me.fullName}</h2>
          <p className="text-sm text-brand-blue">{form.headline}</p>
          <p className="text-xs text-brand-gray">{[me.email, me.mobile].filter(Boolean).join(' · ')}</p>
          {form.summary && <p className="mt-3 whitespace-pre-line text-sm text-brand-gray">{form.summary}</p>}
          {jobs.length > 0 && <h3 className="mt-4 border-b border-brand-border pb-1 text-sm font-bold text-brand-dark">Experience</h3>}
          {jobs.map((j, i) => (
            <div key={j._id || i} className="mt-2 text-sm">
              <p className="font-semibold text-brand-dark">{j.jobTitle}, {j.employerName}</p>
              <p className="text-xs text-brand-gray-muted">{formatDate(j.startDate, 'MMM yyyy')} - {j.isCurrent ? 'Present' : formatDate(j.endDate, 'MMM yyyy')}</p>
              {j.description && <p className="whitespace-pre-line text-brand-gray">{j.description}</p>}
            </div>
          ))}
          {edu.length > 0 && <h3 className="mt-4 border-b border-brand-border pb-1 text-sm font-bold text-brand-dark">Education</h3>}
          {edu.map((e, i) => (
            <p key={e._id || i} className="mt-2 text-sm text-brand-gray">
              {[e.degree || e.level, e.specialisation, e.institution].filter(Boolean).join(', ')}
            </p>
          ))}
          {skills.length > 0 && (
            <>
              <h3 className="mt-4 border-b border-brand-border pb-1 text-sm font-bold text-brand-dark">Skills</h3>
              <p className="mt-2 text-sm text-brand-gray">{skills.join(', ')}</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
