import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => (
  <div className="flex min-h-[calc(100vh-70px)] flex-col items-center justify-center px-4 py-16 text-center">
    <span className="material-symbols-outlined text-brand-blue text-[64px]">travel_explore</span>
    <h1 className="mt-3 text-3xl font-bold text-brand-dark">404</h1>
    <p className="mt-1 text-lg font-semibold text-brand-dark">Page not found</p>
    <p className="mt-2 max-w-sm text-sm text-brand-gray">
      The page you're looking for doesn't exist or may have been moved.
    </p>
    <div className="mt-6 flex gap-3">
      <Link to="/" className="rounded-lg bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-blue-dark">
        Go to Homepage
      </Link>
      <Link to="/jobs" className="rounded-lg border border-brand-border px-5 py-2.5 text-sm font-semibold text-brand-gray hover:bg-gray-50">
        Browse Jobs
      </Link>
    </div>
  </div>
);

export default NotFound;
