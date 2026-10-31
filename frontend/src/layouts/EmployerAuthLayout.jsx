import React from 'react';
import { Outlet } from 'react-router-dom';
import EmployerAuthNavbar from '../components/employer/EmployerAuthNavbar';
import EmployerAuthFooter from '../components/employer/EmployerAuthFooter';

// Dedicated B2B shell for the pre-login employer funnel (Employer Login /
// Sales Enquiry / For-Employers landing). Deliberately NOT the candidate
// Navbar/Footer — matches the standalone header+footer in the Stitch
// "freejobwala_employer_login" export.
const EmployerAuthLayout = () => {
  return (
    <div>
      <EmployerAuthNavbar />
      <main className="pt-[80px]">
        <Outlet />
      </main>
      <EmployerAuthFooter />
    </div>
  );
};

export default EmployerAuthLayout;
