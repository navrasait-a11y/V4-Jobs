import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Button from '../../components/ui/Button';
import { Icon } from '../../components/ui/feedback';
import { MobileField, SelectField, TextAreaField, TextField } from '../../components/ui/form';
import { useAction, useLookups } from '../../hooks/useData';
import { billingApi, cmsApi } from '../../services';
import { formatCurrency } from '../../utils/format';
import useSeo from '../../hooks/useSeo';

const features = [
  ['work', 'Job posting', 'Publish jobs and internships with screening questions.'],
  ['person_search', 'Resume database', 'Search candidates and unlock verified contact details.'],
  ['view_kanban', 'Hiring pipeline', 'Move applicants from applied to hired, with your team.'],
  ['event', 'Interviews', 'Schedule rounds with automatic reminders.'],
  ['groups', 'Team access', 'Add recruiters with roles, permissions and quotas.'],
  ['monitoring', 'Analytics', 'Track job performance and sources of hire.'],
];

const blank = { fullName: '', mobile: '', workEmail: '', employerType: 'company', designation: '', companyName: '', industry: '', teamSize: '', location: '', message: '' };

const SalesForm = () => {
  const [form, setForm] = useState(blank);
  const lookups = useLookups('industry', 'company_size');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const send = useAction(() => cmsApi.salesEnquiry(Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''))), { success: 'Thanks. Our sales team will call you soon', onSuccess: () => setForm(blank) });
  return (
    <form
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      <TextField label="Full name" required value={form.fullName} onChange={set('fullName')} />
      <MobileField required value={form.mobile} onChange={set('mobile')} />
      <TextField label="Work email" type="email" required value={form.workEmail} onChange={set('workEmail')} />
      <SelectField label="You are" required placeholder={null} options={[{ value: 'company', label: 'Company' }, { value: 'consultancy', label: 'Consultancy' }, { value: 'freelancer', label: 'Freelancer' }]} value={form.employerType} onChange={set('employerType')} />
      <TextField label="Designation" required value={form.designation} onChange={set('designation')} />
      <TextField label="Company name" required value={form.companyName} onChange={set('companyName')} />
      <SelectField label="Industry" required options={lookups.industry} value={form.industry} onChange={set('industry')} />
      <SelectField label="Team size" required options={lookups.company_size} value={form.teamSize} onChange={set('teamSize')} />
      <TextField label="Location" required className="sm:col-span-2" value={form.location} onChange={set('location')} />
      <TextAreaField label="How can we help?" rows={3} className="sm:col-span-2" value={form.message} onChange={set('message')} />
      <Button type="submit" variant="primary" className="sm:col-span-2" loading={send.isPending}>
        Talk to sales
      </Button>
    </form>
  );
};

const EmployerLanding = () => {
  useSeo({ title: 'Hire on Freejobwala - post jobs and search resumes', description: 'Post jobs and internships, search a verified resume database, track applicants and hire faster with Freejobwala.', path: '/for-employers' });
  const { data: plans } = useQuery({ queryKey: ['plans', 'employer'], queryFn: () => billingApi.plans('employer') });
  return (
    <div>
      <section className="bg-brand-ink">
        <div className="mx-auto max-w-[1120px] px-4 py-14 text-center sm:py-20">
          <h1 className="text-3xl font-bold text-white md:text-5xl">Hire the right talent faster</h1>
          <p className="mx-auto mt-3 max-w-xl text-white/75">Post jobs, search candidates, manage applications and track hiring in one place.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/employer/register" className="rounded-full bg-brand-orange px-7 py-3 text-sm font-semibold text-white hover:bg-brand-orange-dark">
              Get started
            </Link>
            <a href="#sales" className="rounded-full border border-white/40 px-7 py-3 text-sm font-semibold text-white hover:bg-white/10">
              Contact sales
            </a>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-[1120px] px-4 py-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(([icon, title, desc]) => (
            <div key={title} className="rounded-xl border border-brand-border p-5">
              <Icon name={icon} size={26} className="text-brand-blue" />
              <p className="mt-2 font-semibold text-brand-dark">{title}</p>
              <p className="mt-1 text-sm text-brand-gray">{desc}</p>
            </div>
          ))}
        </div>
      </section>
      {plans?.length > 0 && (
        <section className="bg-brand-tint py-12">
          <div className="mx-auto max-w-[1120px] px-4">
            <h2 className="mb-6 text-center text-2xl font-bold text-brand-dark">Plans</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((p) => (
                <div key={p._id} className="surface p-5">
                  <p className="font-bold text-brand-dark">{p.name}</p>
                  <p className="mt-1 text-2xl font-bold text-brand-blue">{formatCurrency(p.price)}</p>
                  <p className="text-xs text-brand-gray-muted">{p.durationDays} days · excl. GST</p>
                  <ul className="mt-3 space-y-1 text-sm text-brand-gray">
                    {(p.highlights || []).map((h) => (
                      <li key={h}>• {h}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      <section id="sales" className="mx-auto max-w-[800px] scroll-mt-24 px-4 py-12">
        <h2 className="mb-6 text-center text-2xl font-bold text-brand-dark">Talk to our sales team</h2>
        <SalesForm />
      </section>
    </div>
  );
};

export default EmployerLanding;
