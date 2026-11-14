import React, { Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { PageLoader } from '../ui/feedback';

/**
 * React Router runs every navigation as a React transition. While the next page's code is still
 * downloading, React keeps the old page on screen - the address bar has already changed, so it
 * looks like the click did nothing. A Suspense boundary keyed by the path is *new* for each page,
 * and React always shows a new boundary's fallback, so the loader appears the moment you click.
 * The key also gives every page (and every /item/:id) a fresh state instead of the previous one's.
 */
const RouteSuspense = ({ children, fallback, className = 'min-h-[50vh]' }) => {
  const { pathname } = useLocation();
  return (
    <Suspense key={pathname} fallback={fallback || <PageLoader className={className} />}>
      {children}
    </Suspense>
  );
};

export default RouteSuspense;
