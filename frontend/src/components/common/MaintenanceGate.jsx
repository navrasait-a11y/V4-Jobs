import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Logo from './Logo';
import Button from '../ui/Button';
import { Icon } from '../ui/feedback';
import { usePublicSettings } from '../../hooks/useData';
import { lookupApi } from '../../services';
import { setMaintenanceHandler } from '../../services/api';
import useAuthStore, { isAdminRole } from '../../store/useAuthStore';

const RECHECK_MS = 60 * 1000;

/**
 * Admin switch "maintenance mode": visitors see this screen instead of the site. Admins and the
 * admin panel stay open, so the switch can always be turned off again.
 *
 * Public settings are cached for a couple of minutes, so the screen also opens the moment any API
 * call answers 503 MAINTENANCE, and closes again once a fresh settings read says the site is back.
 */
const MaintenanceGate = ({ children }) => {
  const settings = usePublicSettings();
  const role = useAuthStore((s) => s.user?.role);
  const { pathname } = useLocation();
  const client = useQueryClient();
  const [signalled, setSignalled] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setMaintenanceHandler(() => setSignalled(true));
    return () => setMaintenanceHandler(() => {});
  }, []);

  const exempt = isAdminRole(role) || pathname.startsWith('/admin');
  const closed = (signalled || Boolean(settings.platform?.maintenanceMode)) && !exempt;

  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      const fresh = await lookupApi.settingsFresh();
      client.setQueryData(['settings-public'], fresh);
      if (!fresh['platform.maintenanceMode']) {
        setSignalled(false);
        client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'settings-public' });
      }
    } catch {
      /* still down or offline: keep the screen */
    } finally {
      setChecking(false);
    }
  }, [client]);

  useEffect(() => {
    if (!closed) return undefined;
    const timer = setInterval(recheck, RECHECK_MS);
    return () => clearInterval(timer);
  }, [closed, recheck]);

  if (!closed) return children;
  const { maintenanceMessage, supportEmail } = settings.platform || {};
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-brand-tint px-4 py-12 text-center">
      <Logo />
      <span className="mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-white text-brand-blue shadow-sm">
        <Icon name="construction" size={32} />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-brand-dark sm:text-3xl">We'll be back shortly</h1>
      <p className="mt-2 max-w-md text-sm text-brand-gray sm:text-base">
        {maintenanceMessage || 'Freejobwala is getting a quick upgrade. Your profile, applications and job posts are safe. Please check back in a little while.'}
      </p>
      <Button className="mt-6" variant="primaryBlue" loading={checking} onClick={recheck}>
        Try again
      </Button>
      {supportEmail && (
        <p className="mt-6 text-sm text-brand-gray">
          Need help right now?{' '}
          <a className="font-semibold text-brand-blue" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>
        </p>
      )}
    </main>
  );
};

export default MaintenanceGate;
