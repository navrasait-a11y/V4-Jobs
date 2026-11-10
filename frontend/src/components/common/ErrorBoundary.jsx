import React from 'react';
import { captureError } from '../../utils/monitoring';

class ErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    captureError(error, { componentStack: info?.componentStack?.slice(0, 2000), path: window.location.pathname });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-bold text-brand-dark">Something went wrong</h1>
        <p className="text-sm text-brand-gray">Please reload the page. If this keeps happening, contact support.</p>
        <button onClick={() => window.location.assign('/')} className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white">
          Go to home
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
