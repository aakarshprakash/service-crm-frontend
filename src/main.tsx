import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import '@/lib/i18n';
import './index.css';
import App from './App';

// After a new deploy, a tab left open still holds old chunk URLs — clicking into a
// not-yet-loaded route then 404s (Vite fires this event instead of throwing). Reload
// once per tab session to pick up the new build; the flag stops a genuinely broken
// chunk from reloading forever (a second reload wouldn't fetch it either).
window.addEventListener('vite:preloadError', () => {
  const key = 'servicecrm.reloadedForStaleChunk';
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  window.location.reload();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Don't hammer the API on auth / permission / validation errors.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
