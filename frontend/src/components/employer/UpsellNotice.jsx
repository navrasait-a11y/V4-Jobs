import React from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../ui/feedback';

/** Shows a buy-plan prompt when an API call failed for lack of credits or plan features. */
const UpsellNotice = ({ error }) => {
  if (error?.status !== 402) return null;
  return (
    <Alert tone="warning" className="mb-4">
      {error.message}{' '}
      <Link to="/employer/packages-billing" className="font-semibold text-brand-blue underline">
        View plans
      </Link>
    </Alert>
  );
};

export default UpsellNotice;
