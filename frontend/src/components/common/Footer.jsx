import React from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo';

const footerColumns = [
  {
    title: 'Job seekers',
    links: [
      ['Search jobs', '/jobs'],
      ['Companies', '/companies'],
      ['Recruiters', '/recruiters'],
      ['Job alerts', '/job-alerts'],
      ['Job events', '/events'],
      ['Career advice', '/career-advice'],
    ],
  },
  {
    title: 'Employers',
    links: [
      ['Employer login', '/employer/login'],
      ['Register as employer', '/employer/register'],
      ['Post a job', '/post-job'],
      ['Search candidates', '/employer/candidates'],
      ['Hiring solutions', '/for-employers'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['About us', '/about-us'],
      ['Help centre', '/help-center'],
      ['Contact us', '/help-center#contact'],
      ['Privacy policy', '/legal/privacy-policy'],
      ['Terms and conditions', '/legal/terms-and-conditions'],
      ['Cookie policy', '/legal/cookie-policy'],
    ],
  },
];

const Footer = () => (
  <footer className="w-full bg-brand-ink text-white/70">
    <div className="mx-auto max-w-[1240px] px-4 pb-8 pt-12 sm:px-6">
      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo height={28} onDark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">Freejobwala connects jobseekers with verified employers across India. Find your next job or hire great talent.</p>
        </div>
        {footerColumns.map((col) => (
          <div key={col.title}>
            <h3 className="mb-3 text-sm font-bold text-white">{col.title}</h3>
            <ul className="space-y-2 text-sm">
              {col.links.map(([label, to]) => (
                <li key={label}>
                  <Link to={to} className="transition-colors hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-6 text-xs text-white/50">
        <span>© {new Date().getFullYear()} Freejobwala. All rights reserved.</span>
        <Link to="/admin/login" className="hover:text-white">
          Admin login
        </Link>
      </div>
    </div>
  </footer>
);

export default Footer;
