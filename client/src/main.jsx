import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import './index.css';

const Router = import.meta.env.VITE_STATIC === '1' ? HashRouter : BrowserRouter;
const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 20000, retry: 1, refetchOnWindowFocus: true } } });

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <Router>
        <App />
      </Router>
    </QueryClientProvider>
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.VITE_STATIC !== '1') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
