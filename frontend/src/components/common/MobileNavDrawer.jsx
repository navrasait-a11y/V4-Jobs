import React from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo';
import { Icon } from '../ui/feedback';
import useAuthStore, { dashboardPath } from '../../store/useAuthStore';

const links = [
  { label: 'Find Jobs', to: '/jobs' },
  { label: 'Companies', to: '/companies' },
  { label: 'Recruiters', to: '/recruiters' },
  { label: 'Job Events', to: '/events' },
  { label: 'Job Alerts', to: '/job-alerts' },
  { label: 'Career Advice', to: '/career-advice' },
  { label: 'About Us', to: '/about-us' },
  { label: 'Help Center', to: '/help-center' },
  { label: 'For Employers', to: '/for-employers' },
];

const MobileNavDrawer = ({ open, onClose }) => {
  const user = useAuthStore((s) => s.user);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-brand-border p-4">
          <Logo height={28} onClick={onClose} />
          <button onClick={onClose} aria-label="Close menu" className="text-brand-gray hover:text-brand-dark">
            <Icon name="close" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          {links.map((link) => (
            <Link key={link.to} to={link.to} onClick={onClose} className="block rounded-md px-3 py-2.5 text-sm font-medium text-brand-dark hover:bg-brand-tint">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex gap-2 border-t border-brand-border p-3">
          {user ? (
            <Link to={dashboardPath(user.role)} onClick={onClose} className="flex-1 rounded-md bg-brand-blue py-2 text-center text-sm font-medium text-white">
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" onClick={onClose} className="flex-1 rounded-md border border-brand-blue py-2 text-center text-sm font-medium text-brand-blue">
                Login
              </Link>
              <Link to="/register" onClick={onClose} className="flex-1 rounded-md bg-brand-orange py-2 text-center text-sm font-medium text-white">
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileNavDrawer;
