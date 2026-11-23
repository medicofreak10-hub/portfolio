import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLive } from '../lib/hooks.js';
import { useTheme } from '../lib/theme.js';
import Indices from '../components/Indices.jsx';
import MoodGauge from '../components/MoodGauge.jsx';
import HoldingCard from '../components/HoldingCard.jsx';
import HeatMap from '../components/HeatMap.jsx';
import Split from '../components/Splits.jsx';
import NewsList from '../components/NewsList.jsx';
import { FlashPrice, Spinner, ErrorBox, Empty, ChangePill } from '../components/ui.jsx';
import { inr, pct, arrow, tone, istTime } from '../lib/format.js';

export function useSparks(rows) {
  const syms = (rows || []).filter((r) => r.type !== 'mf').map((r) => `${r.symbol}:${r.exchange || 'NSE'}`).join(',');
  return useLive(['spark', syms], `/sparklines?symbols=${syms}`, { enabled: !!syms }).data || {};
}

export default function Home() {
  const { data: p, error, isLoading } = useLive('portfolio', '/portfolio');
  const { data: news } = useLive('news-h', '/news', { interval: 10 * 60000 });
  const [view, setView] = useState('list');
  const { isDark } = useTheme();
  const sparks = useSparks(p?.rows);

  return (
    <div className="space-y-3">
      <Indices />
      <MoodGauge />
      {isLoading && <Spinner />}
      <ErrorBox error={error} />
      {p && !p.rows.length && (
        <Empty title="No holdings yet">Import your Zerodha / Groww export or add a holding in <Link className="font-semibold text-brand" to="/settings">Settings → Import</Link>.</Empty>
      )}
      {p && p.rows.length > 0 && <>
        <TotalCard p={p} />
        {p.summary && <div className="card flex gap-2 p-3 text-sm"><span>📝</span><p>{p.summary.text}{p.summary.news && <> <a className="font-semibold text-brand" href={p.summary.news.url} target="_blank" rel="noopener noreferrer">Read →</a></>}</p></div>}
        <Movers p={p} />
        <div className="flex items-center justify-between px-1 pt-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink2">Holdings ({p.rows.length})</h2>
          <div className="seg w-44" role="group" aria-label="View">
            <button aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
            <button aria-pressed={view === 'heat'} onClick={() => setView('heat')}>Heat-map</button>
          </div>
        </div>
        {view === 'heat' ? <HeatMap rows={p.rows} /> : (
          <div className="space-y-2">
            {[...p.rows].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 8).map((r) => <HoldingCard key={r.id} r={r} spark={sparks[r.symbol]} />)}
            {p.rows.length > 8 && <Link to="/holdings" className="btn-ghost w-full">See all {p.rows.length} holdings →</Link>}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Split title="Sector split" items={p.sectorSplit} isDark={isDark} />
          <Split title="Market-cap split" items={p.capSplit} isDark={isDark} />
        </div>
      </>}
      <div className="flex items-center justify-between px-1 pt-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink2">News for your stocks</h2>
        <Link to="/news" className="text-xs font-semibold text-brand">All news →</Link>
      </div>
      <NewsList items={news} limit={5} />
    </div>
  );
}

function TotalCard({ p }) {
  const t = p.total;
  const day = tone(t.dayChangePct, 2);
  return (
    <div className="card overflow-hidden p-4" style={{ background: `linear-gradient(135deg, ${day.bg}, transparent 70%)` }}>
      <div className="text-xs font-semibold uppercase tracking-wide text-ink2">Total value</div>
      <div className="text-[2.4rem] font-extrabold leading-tight tracking-tight"><FlashPrice value={Math.round(t.value)} render={(v) => inr(v)} /></div>
      <div className={`num text-lg font-bold ${day.cls}`}>{arrow(t.dayChange)} {inr(Math.abs(t.dayChange))} <span className="text-base">({pct(t.dayChangePct)})</span> <span className="text-sm font-medium text-ink2">today</span></div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-sm">
        <div><div className="text-[11px] text-muted">Invested</div><div className="num font-semibold">{inr(t.invested)}</div></div>
        <div><div className="text-[11px] text-muted">Total P&amp;L</div><div className={`num font-semibold ${tone(t.pnlPct, 25).cls}`}>{arrow(t.pnl)} {inr(Math.abs(t.pnl))}<div className="text-xs">({pct(t.pnlPct)})</div></div></div>
        <div className="text-right"><div className="text-[11px] text-muted">Stocks XIRR</div><div className="num font-semibold">{t.equityXirr != null ? pct(t.equityXirr, 1) : '—'}</div></div>
      </div>
      <div className="mt-2 text-[11px] text-muted">Updated {istTime(p.asOf)} IST{p.stale ? ' · showing last known prices' : ''}</div>
    </div>
  );
}

function Movers({ p }) {
  if (!p.gainers.length && !p.losers.length) return null;
  const Row = ({ r }) => (
    <Link to={`/stock/${r.symbol}`} className="flex items-center justify-between py-1.5 text-sm">
      <span className="truncate font-medium">{r.symbol}</span><ChangePill pctValue={r.changePct} />
    </Link>
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="card px-3 py-2"><div className="text-xs font-semibold text-up">▲ Top gainers</div>{p.gainers.map((r) => <Row key={r.id} r={r} />)}{!p.gainers.length && <div className="py-1 text-xs text-muted">None today</div>}</div>
      <div className="card px-3 py-2"><div className="text-xs font-semibold text-down">▼ Top losers</div>{p.losers.map((r) => <Row key={r.id} r={r} />)}{!p.losers.length && <div className="py-1 text-xs text-muted">None today</div>}</div>
    </div>
  );
}
