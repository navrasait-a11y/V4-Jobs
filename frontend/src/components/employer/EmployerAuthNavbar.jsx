import React from 'react';
import { Link } from 'react-router-dom';
import Logo from '../common/Logo';
import { Icon } from '../ui/feedback';

const EmployerAuthNavbar = () => (
  <header className="fixed left-0 right-0 top-0 z-30 w-full border-b border-brand-border bg-white">
    <div className="mx-auto flex h-[80px] max-w-[1120px] items-center justify-between gap-2 px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Logo height={30} />
        <span className="hidden rounded-full bg-brand-ink px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white sm:inline">For Employers</span>
      </div>
      <div className="flex items-center gap-3 text-sm font-medium text-brand-gray sm:gap-6">
        <Link to="/for-employers#sales" className="hidden hover:text-brand-blue sm:inline">
          Contact Sales
        </Link>
        <Link to="/employer/login" className="hidden hover:text-brand-blue sm:inline">
          Login
        </Link>
        <Link to="/login" className="flex items-center gap-1 whitespace-nowrap font-semibold text-brand-blue hover:underline">
          Jobseeker? <Icon name="arrow_forward" size={16} />
        </Link>
      </div>
    </div>
  </header>
);

export default EmployerAuthNavbar;
