import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useStatus } from '../lib/hooks.js';
import { useTheme } from '../lib/theme.js';
import { api } from '../lib/api.js';
import { showLocal } from '../lib/push.js';

const NAV = [
  { to: '/', label: 'Home', icon: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { to: '/holdings', label: 'Holdings', icon: 'M4 6h16M4 12h16M4 18h10' },
  { to: '/watchlist', label: 'Watchlist', icon: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z' },
  { to: '/discover', label: 'Discover', icon: 'M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20zm4 6l-2.5 5.5L8 16l2.5-5.5z' },
  { to: '/news', label: 'News', icon: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5' },
];

function Icon({ d }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

export default function Layout({ children }) {
  const { data: st } = useStatus();
  const { isDark, toggle } = useTheme();
  const loc = useLocation();
  const { data: al } = useQuery({ queryKey: ['alerts'], queryFn: () => api.get('/alerts'), refetchInterval: 60000 });
  const lastSeen = useRef(null);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  // In-app notifications for new alerts while the app is open
  useEffect(() => {
    if (!al?.alerts?.length) return;
    const newest = al.alerts[0].ts;
    if (lastSeen.current && newest > lastSeen.current) {
      for (const a of al.alerts.filter((x) => x.ts > lastSeen.current && x.kind !== 'test').slice(0, 3)) showLocal(a.title, a.body, a.url);
    }
    lastSeen.current = newest;
  }, [al]);

  const m = st?.market;
  return (
    <div className="mx-auto min-h-screen max-w-2xl safe-bottom">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-page/90 px-4 pb-2 pt-[max(env(safe-area-inset-top),0.6rem)] backdrop-blur">
        <div className="flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span className="whitespace-nowrap text-[15px] font-bold tracking-tight">My Halal Portfolio</span>
          </Link>
          <span className={`chip ml-1 whitespace-nowrap ${m?.open ? 'text-up' : 'text-ink2'}`} style={{ background: m?.open ? 'rgb(var(--up) / 0.12)' : 'rgb(var(--card2))' }}>
            <span className={`h-1.5 w-1.5 rounded-full ${m?.open ? 'animate-pulse bg-up' : 'bg-flat'}`} /><span className="hidden min-[460px]:inline">{m ? m.label : '…'}</span><span className="min-[460px]:hidden">{m?.open ? 'Open' : 'Closed'}</span>
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={toggle} className="rounded-full p-2 hover:bg-card2" aria-label="Toggle dark mode" title="Dark / light">{isDark ? '☀️' : '🌙'}</button>
            <Link to="/alerts" className="relative rounded-full p-2 hover:bg-card2" aria-label="Alerts">🔔{al?.unseen ? <span className="absolute right-0.5 top-0.5 min-w-[16px] rounded-full bg-down px-1 text-center text-[10px] font-bold text-white">{al.unseen}</span> : null}</Link>
            <Link to="/settings" className="rounded-full p-2 hover:bg-card2" aria-label="Settings">⚙️</Link>
          </div>
        </div>
        {st?.demo && <div className="mt-2 rounded-lg bg-warn/15 px-3 py-1.5 text-xs text-ink"><b>Demo data</b> — synthetic prices for testing (DATA_MODE=demo). Set DATA_MODE=live in .env for real market data.</div>}
        {!st?.demo && st?.health?.lastErr?.yahoo && <div className="mt-2 rounded-lg bg-down/10 px-3 py-1.5 text-xs">Price source unreachable — showing last known data. ({st.health.lastErr.yahoo.msg.slice(0, 80)})</div>}
      </header>
      <main className="min-w-0 px-3 pt-3">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-2xl">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-brand' : 'text-ink2'}`}>
              <Icon d={n.icon} />{n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function PinGate({ children }) {
  const [need, setNeed] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { const f = () => setNeed(true); window.addEventListener('pin-required', f); return () => window.removeEventListener('pin-required', f); }, []);
  if (!need) return children;
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form className="card w-full max-w-xs p-6 text-center" onSubmit={async (e) => { e.preventDefault(); try { await api.post('/login', { pin }); location.reload(); } catch (x) { setErr(x.message); } }}>
        <img src="/favicon.svg" className="mx-auto mb-3 h-12 w-12" alt="" />
        <h1 className="mb-4 text-lg font-bold">Enter PIN</h1>
        <input className="input text-center text-2xl tracking-[0.5em]" inputMode="numeric" type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus aria-label="PIN" />
        {err && <div className="mt-2 text-sm text-down">{err}</div>}
        <button className="btn-primary mt-4 w-full">Unlock</button>
      </form>
    </div>
  );
}
