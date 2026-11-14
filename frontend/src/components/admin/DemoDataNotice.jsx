import React from 'react';
import { Alert } from '../ui/feedback';
import { formatNumber } from '../../utils/format';

/**
 * Shown while pre-launch demo records are still in the database. Every number on the page is read
 * from the database, so until they are removed the totals include them.
 */
const DemoDataNotice = ({ demo, className = 'mb-4' }) => {
  if (!demo) return null;
  const parts = [
    [demo.jobs, 'jobs'],
    [demo.employers, 'employers'],
    [demo.accounts, 'user accounts'],
    [demo.applications, 'applications'],
  ].filter(([n]) => n);
  return (
    <Alert tone="warning" className={className}>
      <span>
        <b>Demo data is still in the database</b> ({parts.map(([n, label]) => `${formatNumber(n)} ${label}`).join(', ')}). The figures below are real database totals and include it.
        Remove it before launch by running <code className="rounded bg-white/70 px-1 font-mono text-[12px]">npm run demo:remove</code> in the backend folder.
      </span>
    </Alert>
  );
};

export default DemoDataNotice;
