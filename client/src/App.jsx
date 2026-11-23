import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout, { PinGate } from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import { Spinner } from './components/ui.jsx';

const Holdings = lazy(() => import('./pages/Holdings.jsx'));
const StockDetail = lazy(() => import('./pages/StockDetail.jsx'));
const Watchlist = lazy(() => import('./pages/Watchlist.jsx'));
const Discover = lazy(() => import('./pages/Discover.jsx'));
const News = lazy(() => import('./pages/News.jsx'));
const Alerts = lazy(() => import('./pages/Alerts.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

export default function App() {
  return (
    <PinGate>
      <Layout>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/holdings" element={<Holdings />} />
            <Route path="/stock/:symbol" element={<StockDetail />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/news" element={<News />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
      </Layout>
    </PinGate>
  );
}
