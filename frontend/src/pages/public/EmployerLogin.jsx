import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import LoginPanel from '../../components/auth/LoginPanel';
import { Icon } from '../../components/ui/feedback';
import { useDocumentTitle } from '../../hooks/useData';
import useAuthStore, { dashboardPath } from '../../store/useAuthStore';

const benefits = [
  ['work', 'Post jobs and reach relevant candidates', 'Share openings with active jobseekers across India.'],
  ['task_alt', 'Review applications and shortlist talent', 'Filter by experience, skills, notice period and city.'],
  ['event', 'Track interviews and hiring progress', 'Manage your whole pipeline in one place.'],
];

const EmployerLogin = () => {
  useDocumentTitle('Employer login');
  const user = useAuthStore((s) => s.user);
  if (user) return <Navigate to={dashboardPath(user.role)} replace />;
  return (
    <div className="min-h-[calc(100vh-80px)] bg-brand-tint py-8 lg:py-12">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center justify-between gap-10 px-4 lg:flex-row lg:gap-16">
        <div className="w-full lg:w-[560px]">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-blue-tint px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-blue">
            <Icon name="badge" size={14} /> Freejobwala for Employers
          </div>
          <h1 className="mb-3 text-3xl font-bold leading-[1.2] text-brand-dark lg:text-[40px]">
            Find the right talent.
            <br />
            <span className="text-brand-blue">Build your next great team.</span>
          </h1>
          <p className="mb-6 text-base text-brand-gray">Post jobs, discover candidates and manage your hiring in one place.</p>
          <div className="space-y-3.5">
            {benefits.map(([icon, title, desc]) => (
              <div key={title} className="flex items-start gap-3.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#cfdbee] bg-brand-blue-tint text-brand-blue">
                  <Icon name={icon} size={18} />
                </div>
                <div>
                  <p className="text-[15px] font-medium text-brand-dark">{title}</p>
                  <p className="text-xs text-brand-gray-muted">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="w-full max-w-[440px] surface p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-bold text-brand-dark">Employer login</h2>
          <p className="mb-4 mt-1 text-sm text-brand-gray">Access your hiring dashboard</p>
          <LoginPanel role="employer" identifierLabel="Official email or mobile" />
          <p className="mt-5 text-center text-sm text-brand-gray">
            New employer?{' '}
            <Link to="/employer/register" className="font-semibold text-brand-blue hover:underline">
              Register your company
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmployerLogin;
