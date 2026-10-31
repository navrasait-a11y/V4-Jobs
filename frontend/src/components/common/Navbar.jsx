import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import Logo from './Logo';
import MobileNavDrawer from './MobileNavDrawer';
import { Avatar } from '../ui/data';
import { Icon } from '../ui/feedback';
import useAuthStore, { dashboardPath } from '../../store/useAuthStore';

const jobsMenu = {
  'Popular categories': [
    ['IT jobs', '/jobs?category=IT Jobs'],
    ['Sales jobs', '/jobs?q=sales'],
    ['Marketing jobs', '/jobs?q=marketing'],
    ['Data Science jobs', '/jobs?q=data science'],
    ['HR jobs', '/jobs?q=hr'],
    ['Engineering jobs', '/jobs?q=engineering'],
  ],
  'Jobs in demand': [
    ['Fresher jobs', '/jobs?experience=0'],
    ['MNC jobs', '/jobs?companyType=MNC'],
    ['Remote jobs', '/jobs?remoteOnly=true'],
    ['Work from home jobs', '/jobs?category=Work From Home Jobs'],
    ['Walk-in events', '/events'],
    ['Internships', '/jobs?kind=internship'],
  ],
  'Jobs by location': [
    ['Jobs in Delhi', '/jobs?location=Delhi'],
    ['Jobs in Mumbai', '/jobs?location=Mumbai'],
    ['Jobs in Bengaluru', '/jobs?location=Bengaluru'],
    ['Jobs in Hyderabad', '/jobs?location=Hyderabad'],
    ['Jobs in Chennai', '/jobs?location=Chennai'],
    ['Jobs in Pune', '/jobs?location=Pune'],
  ],
};

const companiesMenu = [
  ['Explore companies', '/companies', 'apartment'],
  ['Top recruiters', '/recruiters', 'groups'],
  ['Job events', '/events', 'celebration'],
];
const servicesMenu = [
  ['Job alerts', '/job-alerts', 'notifications_active'],
  ['Resume builder', '/candidate/resume-builder', 'description'],
  ['Profile booster', '/candidate/billing', 'rocket_launch'],
  ['Career advice', '/career-advice', 'school'],
  ['Help centre', '/help-center', 'support_agent'],
];
const employersMenu = [
  ['Employer login', '/employer/login', 'login'],
  ['Register as employer', '/employer/register', 'how_to_reg'],
  ['Post a job', '/post-job', 'add_circle'],
  ['Search resumes', '/employer/candidates', 'person_search'],
  ['Hiring solutions', '/for-employers', 'workspace_premium'],
];

const trigger = 'flex items-center gap-0.5 rounded-md px-3 py-2 text-sm font-medium text-brand-gray transition-colors hover:bg-brand-tint hover:text-brand-dark';

const Menu = ({ label, to, items, align = 'left' }) => (
  <div className="group relative">
    <NavLink to={to} className={({ isActive }) => clsx(trigger, isActive && 'text-brand-blue')}>
      {label}
      <Icon name="expand_more" size={18} className="transition-transform group-hover:rotate-180" />
    </NavLink>
    <div className={clsx('invisible absolute top-full z-50 w-64 pt-2 opacity-0 transition-all group-hover:visible group-hover:opacity-100', align === 'right' ? 'right-0' : 'left-0')}>
      <div className="surface p-2 shadow-[var(--shadow-modal)]">
        {items.map(([text, href, icon]) => (
          <Link key={text} to={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-gray transition-colors hover:bg-brand-blue-tint hover:text-brand-blue">
            <Icon name={icon} size={19} /> {text}
          </Link>
        ))}
      </div>
    </div>
  </div>
);

const JobsMenu = () => (
  <div className="group relative">
    <NavLink to="/jobs" className={({ isActive }) => clsx(trigger, isActive && 'text-brand-blue')}>
      Jobs
      <Icon name="expand_more" size={18} className="transition-transform group-hover:rotate-180" />
    </NavLink>
    <div className="invisible absolute left-0 top-full z-50 pt-2 opacity-0 transition-all group-hover:visible group-hover:opacity-100">
      <div className="surface grid w-[640px] grid-cols-3 gap-4 p-6 shadow-[var(--shadow-modal)]">
        {Object.entries(jobsMenu).map(([title, items]) => (
          <div key={title}>
            <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-brand-gray-muted">{title}</h4>
            <ul>
              {items.map(([label, to]) => (
                <li key={label}>
                  <Link to={to} className="block rounded-lg py-1.5 text-sm text-brand-gray transition-colors hover:text-brand-blue">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const Navbar = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const user = useAuthStore((st) => st.user);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  return (
    <>
      <header className={clsx('fixed left-0 right-0 top-0 z-50 border-b bg-white/95 backdrop-blur transition-shadow', scrolled ? 'border-brand-border shadow-[var(--shadow-card)]' : 'border-transparent')}>
        <div className="mx-auto flex h-[70px] max-w-[1240px] items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <button className="-ml-1 rounded-lg p-1 text-brand-dark lg:hidden" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <Icon name="menu" size={26} />
            </button>
            <Logo height={26} />
            <nav className="ml-2 hidden items-center lg:flex" aria-label="Main">
              <JobsMenu />
              <Menu label="Companies" to="/companies" items={companiesMenu} />
              <Menu label="Services" to="/career-advice" items={servicesMenu} />
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {user ? (
              <Link to={dashboardPath(user.role)} className="flex items-center gap-2 rounded-md border border-brand-border p-1 min-[380px]:pr-3 transition-colors hover:border-brand-blue">
                <Avatar name={user.fullName} src={user.avatar?.url} size={32} />
                <span className="hidden whitespace-nowrap text-sm font-semibold text-brand-dark min-[380px]:inline">Dashboard</span>
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden whitespace-nowrap rounded-md border border-brand-blue px-3 py-1.5 text-sm font-semibold text-brand-blue transition-colors hover:bg-brand-blue-tint min-[380px]:inline-flex sm:px-4 sm:py-2">
                  Login
                </Link>
                <Link to="/register" className="whitespace-nowrap rounded-md bg-brand-orange px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark sm:px-4 sm:py-2">
                  Register
                </Link>
              </>
            )}
            <div className="ml-1 hidden border-l border-brand-border pl-2 lg:block">
              <Menu label="For employers" to="/for-employers" items={employersMenu} align="right" />
            </div>
          </div>
        </div>
      </header>
      <MobileNavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
};

export default Navbar;
