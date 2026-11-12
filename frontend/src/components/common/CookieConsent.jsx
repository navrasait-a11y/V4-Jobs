import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import Button from '../ui/Button';
import { setConsent, useConsent } from '../../utils/consent';

/**
 * Consent notice for optional cookies (advertising). Sign-in and security cookies are essential
 * and always on. The choice is remembered on this device and can be changed from the cookie policy page.
 */
const CookieConsent = () => {
  const consent = useConsent();
  const { pathname } = useLocation();
  if (consent || pathname.startsWith('/admin')) return null;
  return (
    <div role="dialog" aria-live="polite" aria-label="Cookie consent" className="fixed inset-x-0 bottom-0 z-[80] border-t border-brand-border bg-white px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(17,24,39,0.25)] sm:inset-x-auto sm:bottom-4 sm:left-4 sm:max-w-md sm:rounded-xl sm:border">
      <p className="text-sm font-semibold text-brand-dark">We use cookies</p>
      <p className="mt-1 text-[13px] leading-5 text-brand-gray">
        Essential cookies keep you signed in and the site secure. With your permission we also use cookies to show relevant ads. Read our{' '}
        <Link to="/legal/cookie-policy" className="font-semibold text-brand-blue">
          cookie policy
        </Link>{' '}
        and{' '}
        <Link to="/legal/privacy-policy" className="font-semibold text-brand-blue">
          privacy policy
        </Link>
        .
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primaryBlue" onClick={() => setConsent('all')}>
          Accept all
        </Button>
        <Button size="sm" variant="outline" onClick={() => setConsent('essential')}>
          Only essential
        </Button>
      </div>
    </div>
  );
};

export default CookieConsent;
