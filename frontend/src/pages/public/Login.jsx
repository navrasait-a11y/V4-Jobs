import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import LoginPanel from '../../components/auth/LoginPanel';
import { Icon } from '../../components/ui/feedback';
import { useDocumentTitle } from '../../hooks/useData';
import useAuthStore, { dashboardPath } from '../../store/useAuthStore';

const perks = [
  ['verified', 'Verified employers', 'Apply to jobs from companies checked by our team.'],
  ['bolt', 'One-click apply', 'Your profile and resume go with every application.'],
  ['timeline', 'Track every application', 'See where you stand, from applied to hired.'],
];

export const AuthShell = ({ title, subtitle, children, footer }) => (
  <div className="min-h-[calc(100vh-70px)] bg-brand-tint px-4 py-8 sm:py-12">
    <div className="mx-auto grid max-w-[960px] overflow-hidden surface shadow-sm md:grid-cols-2">
      <div className="hidden bg-brand-ink p-8 text-white md:block">
        <h2 className="text-2xl font-extrabold">Your next job <span className="text-brand-orange">starts here</span></h2>
        <ul className="mt-6 space-y-5">
          {perks.map(([icon, head, text]) => (
            <li key={head} className="flex gap-3">
              <Icon name={icon} size={22} className="mt-0.5 text-brand-orange" />
              <div>
                <p className="text-sm font-semibold">{head}</p>
                <p className="text-xs text-white/80">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-brand-dark">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-brand-gray">{subtitle}</p>}
        <div className="mt-5">{children}</div>
        {footer && <div className="mt-5 text-center text-sm text-brand-gray">{footer}</div>}
      </div>
    </div>
  </div>
);

const Login = () => {
  useDocumentTitle('Log in');
  const user = useAuthStore((s) => s.user);
  if (user) return <Navigate to={dashboardPath(user.role)} replace />;
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to apply and track your applications"
      footer={
        <>
          New to Freejobwala?{' '}
          <Link to="/register" className="font-semibold text-brand-blue hover:underline">
            Create an account
          </Link>
          <br />
          Hiring?{' '}
          <Link to="/employer/login" className="font-semibold text-brand-blue hover:underline">
            Employer login
          </Link>
        </>
      }
    >
      <LoginPanel role="candidate" />
    </AuthShell>
  );
};

export default Login;
