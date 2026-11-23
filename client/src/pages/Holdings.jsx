import React, { useMemo, useState } from 'react';
import { useLive } from '../lib/hooks.js';
import HoldingCard from '../components/HoldingCard.jsx';
import HeatMap from '../components/HeatMap.jsx';
import { Spinner, ErrorBox, Empty, Disclaimer } from '../components/ui.jsx';
import { useSparks } from './Home.jsx';
import { Link } from 'react-router-dom';

const SORTS = { value: (a, b) => (b.value || 0) - (a.value || 0), today: (a, b) => (b.changePct ?? -99) - (a.changePct ?? -99), pnl: (a, b) => (b.pnlPct ?? -999) - (a.pnlPct ?? -999), score: (a, b) => (b.analysis?.scores?.multibagger ?? -1) - (a.analysis?.scores?.multibagger ?? -1), name: (a, b) => a.symbol.localeCompare(b.symbol) };

export default function Holdings() {
  const { data: p, error, isLoading } = useLive('portfolio', '/portfolio');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('value');
  const [view, setView] = useState('cards');
  const sparks = useSparks(p?.rows);
  const rows = useMemo(() => (p?.rows || []).filter((r) => filter === 'all' || (filter === 'stock' ? r.type !== 'mf' : r.type === 'mf')).sort(SORTS[sort]), [p, filter, sort]);
  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-3">
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <div className="seg flex-1" role="group" aria-label="Filter">
          {[['all', 'All'], ['stock', 'Stocks & ETFs'], ['mf', 'Mutual funds']].map(([k, l]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <select className="input py-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
          <option value="value">Sort: Value</option><option value="today">Sort: Today %</option><option value="pnl">Sort: Total P&amp;L %</option><option value="score">Sort: Multibagger score</option><option value="name">Sort: Name</option>
        </select>
        <div className="seg w-40 shrink-0" role="group" aria-label="View">
          <button aria-pressed={view === 'cards'} onClick={() => setView('cards')}>Cards</button>
          <button aria-pressed={view === 'heat'} onClick={() => setView('heat')}>Heat</button>
        </div>
      </div>
      {!rows.length && <Empty title="Nothing here">Import holdings in <Link to="/settings" className="text-brand">Settings</Link>.</Empty>}
      {view === 'heat' ? <HeatMap rows={rows} /> : rows.map((r) => <HoldingCard key={r.id} r={r} spark={sparks[r.symbol]} expanded />)}
      <Disclaimer>* XIRR marked with an asterisk is approximate (some shares were bought before your trade history starts). MF XIRR is taken from your Groww statement. Scores: Multibagger (0–100), Piotroski (0–9), Altman Z, Magic Formula percentile, CAN SLIM (0–7), Coffee Can (pass/fail). Not a guarantee; not advice.</Disclaimer>
    </div>
  );
}
