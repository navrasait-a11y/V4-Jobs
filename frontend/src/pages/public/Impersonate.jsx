import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setAccessToken } from '../../services/api';
import { EmptyState, PageLoader } from '../../components/ui/feedback';
import Button from '../../components/ui/Button';
import useAuthStore, { dashboardPath } from '../../store/useAuthStore';
import { clearImpersonation, readImpersonationHash, saveImpersonation } from '../../utils/impersonation';

/**
 * Admin "login as". The admin panel opens this page in a new tab with the user's session in the
 * URL fragment (never sent to a server). The session is kept for this tab only, so the admin's own
 * login in other tabs is untouched, and a reload keeps working until the 2-hour session ends.
 */
const Impersonate = () => {
  const navigate = useNavigate();
  const [failed, setFailed] = useState('');
  // Read once, during the first render: effects may run twice (React StrictMode), and the first run
  // removes the token from the address bar.
  const [tokens] = useState(() => readImpersonationHash(window.location.hash));

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', '/impersonate'); // drop the token from the address bar and history
    if (!tokens) {
      setFailed('This link has no session in it. Use "Login as" in the admin panel again.');
      return;
    }
    clearImpersonation();
    if (tokens.refreshToken) saveImpersonation({ refreshToken: tokens.refreshToken, sameTab: tokens.sameTab, startedAt: Date.now() });
    setAccessToken(tokens.accessToken);
    let live = true;
    useAuthStore
      .getState()
      .loadMe()
      .then((d) => live && navigate(dashboardPath(d.user.role), { replace: true }))
      .catch((e) => {
        clearImpersonation();
        setAccessToken(null);
        if (live) setFailed(e.message || 'The session could not be opened.');
      });
    return () => {
      live = false;
    };
  }, [navigate, tokens]);

  if (failed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-tint p-4">
        <EmptyState
          icon="no_accounts"
          title="Could not open this account"
          description={`${failed} "Login as" sessions are valid for 2 hours.`}
          action={
            <Button asChild size="sm" variant="primaryBlue">
              <Link to="/admin/overview">Back to admin panel</Link>
            </Button>
          }
          className="max-w-md bg-white"
        />
      </div>
    );
  }
  return <PageLoader className="min-h-screen" />;
};

export default Impersonate;
