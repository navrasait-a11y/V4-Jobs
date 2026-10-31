import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import AppRoutes from './routes/AppRoutes';
import HelpChatWidget from './components/common/HelpChatWidget';
import ErrorBoundary from './components/common/ErrorBoundary';
import ScrollToTop from './components/common/ScrollToTop';
import OfflineBanner from './components/common/OfflineBanner';
import useAuthStore from './store/useAuthStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      retry: (count, error) => count < 2 && !(error?.status >= 400 && error?.status < 500),
    },
  },
});

function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ScrollToTop />
          <OfflineBanner />
          <AppRoutes />
          <HelpChatWidget />
        </BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 3500, style: { fontSize: 14, maxWidth: 380, borderRadius: 8, padding: '8px 12px', color: '#111827', border: '1px solid #E6EAF0', boxShadow: '0 8px 24px -8px rgba(17,24,39,0.2)' }, success: { iconTheme: { primary: '#12885A', secondary: '#fff' } } }} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
