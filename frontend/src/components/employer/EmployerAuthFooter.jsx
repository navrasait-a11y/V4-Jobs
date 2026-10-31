import React from 'react';
import { Link } from 'react-router-dom';

// Slim B2B footer matching Stitch "freejobwala_employer_login" — deliberately
// NOT the full 4-column candidate Footer.
const EmployerAuthFooter = () => {
  return (
    <footer className="w-full bg-white border-t border-brand-border py-6">
      <div className="max-w-[1120px] mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-brand-gray-muted">
        <div className="flex flex-wrap items-center gap-6">
          <Link to="/about-us" className="hover:text-brand-blue transition-colors">About Us</Link>
          <Link to="/legal/employer-terms" className="hover:text-brand-blue transition-colors">Terms &amp; Conditions</Link>
          <Link to="/legal/privacy-policy" className="hover:text-brand-blue transition-colors">Privacy Policy</Link>
          <Link to="/help-center" className="hover:text-brand-blue transition-colors">Help &amp; Support</Link>
          <Link to="/" className="font-medium text-brand-blue hover:text-brand-blue-dark transition-colors">Jobseeker Home</Link>
        </div>
        <div>© 2026 Freejobwala. All rights reserved.</div>
      </div>
    </footer>
  );
};

export default EmployerAuthFooter;
