import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import LoginPanel from '../../components/auth/LoginPanel';
import Logo from '../../components/common/Logo';
import { useDocumentTitle } from '../../hooks/useData';
import useAuthStore, { dashboardPath, isAdminRole } from '../../store/useAuthStore';

const AdminLogin = () => {
  useDocumentTitle('Admin login');
  const user = useAuthStore((s) => s.user);
  if (isAdminRole(user?.role)) return <Navigate to={dashboardPath(user.role)} replace />;
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-tint p-4">
      <div className="w-full max-w-[420px] surface p-6 shadow-sm sm:p-8">
        <Logo height={32} />
        <h1 className="mt-5 text-xl font-bold text-brand-dark">Admin console</h1>
        <p className="mb-5 mt-1 text-sm text-brand-gray">Sign in with your administrator account</p>
        <LoginPanel role="admin" identifierLabel="Admin email" allowOtp={false} allowGoogle={false} />
        <Link to="/" className="mt-5 block text-center text-sm text-brand-gray hover:text-brand-blue">
          Back to website
        </Link>
      </div>
    </div>
  );
};

export default AdminLogin;
