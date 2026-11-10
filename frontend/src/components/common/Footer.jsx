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

const CITIES = ['Delhi', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata', 'Jaipur', 'Noida', 'Gurugram', 'Ahmedabad', 'Lucknow'];
const ROLES = ['Sales Executive', 'Customer Support', 'Data Entry', 'Accountant', 'Telecaller', 'Delivery Boy', 'Software Developer', 'Marketing Executive', 'HR Executive', 'Teacher'];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Crawlable links to the landing pages (Naukri-style "Jobs by city / role"). */
const PopularLinks = () => (
  <div className="mt-10 grid gap-6 border-t border-white/10 pt-8 text-xs md:grid-cols-2">
    {[
      ['Jobs by city', CITIES.map((c) => [`Jobs in ${c}`, `/jobs-in-${slug(c)}`])],
      ['Jobs by role', ROLES.map((r) => [`${r} jobs`, `/${slug(r)}-jobs`])],
    ].map(([title, links]) => (
      <div key={title}>
        <h3 className="mb-2.5 text-sm font-bold text-white">{title}</h3>
        <ul className="flex flex-wrap gap-x-1 gap-y-1.5">
          {links.map(([label, to], i) => (
            <li key={to} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden className="text-white/25">|</span>}
              <Link to={to} className="hover:text-white">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

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
      <PopularLinks />
      <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-6 text-xs text-white/50">
        <span>© {new Date().getFullYear()} Freejobwala. All rights reserved.</span>
        <Link to="/admin/login" className="hover:text-white">
          Admin login
        </Link>
      </div>
    </div>
  </footer>
);

export default Footer;
