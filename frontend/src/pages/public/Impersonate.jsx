import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setAccessToken } from '../../services/api';
import { PageLoader } from '../../components/ui/feedback';
import useAuthStore, { dashboardPath } from '../../store/useAuthStore';

/** Admin "login as": the token arrives in the URL fragment, which never reaches a server. */
const Impersonate = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const token = decodeURIComponent(window.location.hash.slice(1));
    window.history.replaceState(null, '', '/impersonate');
    if (!token) {
      navigate('/', { replace: true });
      return;
    }
    setAccessToken(token);
    useAuthStore
      .getState()
      .loadMe()
      .then((d) => navigate(dashboardPath(d.user.role), { replace: true }))
      .catch(() => navigate('/', { replace: true }));
  }, [navigate]);
  return <PageLoader className="min-h-screen" />;
};

export default Impersonate;
