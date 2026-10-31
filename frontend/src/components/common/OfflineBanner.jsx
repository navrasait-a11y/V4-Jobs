import React, { useEffect, useState } from 'react';

const OfflineBanner = () => {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[90] bg-brand-ink py-1.5 text-center text-xs font-medium text-white">
      You are offline. Changes will not be saved until you reconnect.
    </div>
  );
};

export default OfflineBanner;
