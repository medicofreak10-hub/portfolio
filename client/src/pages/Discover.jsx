import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { ScoreRing, ShariahBadge, EntryBadge, Spinner, Disclaimer } from '../components/ui.jsx';
import { crore } from '../lib/format.js';

export default function Discover() {
  const [sector, setSector] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['discover', sector], queryFn: () => api.get(`/discover${sector ? `?sector=${encodeURIComponent(sector)}` : ''}`), refetchInterval: (q) => (q.state.data?.crawl?.crawling ? 8000 : 10 * 60000) });
  return (
    <div className="space-y-3">
      <div className="card p-3">
        <h1 className="text-base font-bold">Discover</h1>
        <p className="text-xs text-ink2">Top 20 Shariah-compliant small &amp; mid caps by Multibagger potential score, from a curated universe of ~120 NSE stocks screened by the app.</p>
        <select className="input mt-2" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector filter">
          <option value="">All sectors</option>{data?.sectors?.map((s) => <option key={s}>{s}</option>)}
        </select>
        {data?.crawl?.crawling && <div className="mt-2 text-xs text-warn">Analysing universe… {data.crawl.analysed} done</div>}
      </div>
      {isLoading && <Spinner />}
      {data?.items?.length === 0 && <div className="card p-4 text-sm text-ink2">No results yet — the app analyses the universe in the background (takes a few minutes on first run).</div>}
      <ol className="space-y-2">
        {data?.items?.map((s, i) => (
          <li key={s.symbol}>
            <Link to={`/stock/${s.symbol}`} className="card flex items-center gap-3 p-3">
              <span className="w-5 text-center text-sm font-bold text-muted">{i + 1}</span>
              <ScoreRing score={s.scores?.multibagger} size={46} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{s.symbol} <span className="text-xs font-normal text-ink2">{s.cap}</span></div>
                <div className="truncate text-xs text-ink2">{s.name} · {s.industry || s.sector}</div>
                <div className="mt-1 flex flex-wrap gap-1"><ShariahBadge status={s.shariah} compact /><EntryBadge entry={s.entry} compact /></div>
              </div>
              <div className="text-right text-[11px] text-ink2">
                <div>MCap {crore(s.marketCap)}</div>
                <div>P/E {s.pe ? s.pe.toFixed(1) : '–'} · ROE {s.roe != null ? s.roe.toFixed(0) + '%' : '–'}</div>
                <div>Sales 3y {s.salesCagr3 != null ? s.salesCagr3.toFixed(0) + '%' : '–'}</div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
      <Disclaimer>Multibagger potential score (not a guarantee). Shariah status is screened by the app — verify before investing. Not investment advice.</Disclaimer>
    </div>
  );
}
