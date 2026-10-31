import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { PageLoader } from '../components/ui/feedback';
import useAuthStore, { dashboardPath, isAdminRole } from '../store/useAuthStore';

const LOGIN = { admin: '/admin/login', employer: '/employer/login', candidate: '/login' };

/** Waits for session restore, then checks the role of the panel. */
const ProtectedRoute = ({ role }) => {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status === 'loading') return <PageLoader className="min-h-screen" />;
  if (!user) return <Navigate to={LOGIN[role] || '/login'} replace state={{ from: location.pathname + location.search }} />;
  const allowed = role === 'admin' ? isAdminRole(user.role) : user.role === role;
  if (!allowed) return <Navigate to={dashboardPath(user.role)} replace />;
  return <Outlet />;
};

export default ProtectedRoute;
