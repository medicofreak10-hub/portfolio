import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useLive } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import SymbolSearch from '../components/SymbolSearch.jsx';
import { ScoreRow } from '../components/HoldingCard.jsx';
import { FlashPrice, ChangePill, ShariahBadge, EntryBadge, RsiBar, Spinner, Empty, Disclaimer } from '../components/ui.jsx';
import { inrP, pct } from '../lib/format.js';

export default function Watchlist() {
  const { data, isLoading } = useLive('watchlist', '/watchlist');
  const qc = useQueryClient();
  const [err, setErr] = useState('');
  const add = async (r) => { try { setErr(''); await api.post('/watchlist', r); qc.invalidateQueries({ queryKey: ['watchlist'] }); } catch (e) { setErr(e.message); } };
  return (
    <div className="space-y-3">
      <SymbolSearch onPick={add} placeholder="Add to watchlist: search symbol…" />
      {err && <div className="text-sm text-down">{err}</div>}
      {isLoading && <Spinner />}
      {data && !data.length && <Empty title="Watchlist is empty">Search above to add stocks or ETFs.</Empty>}
      {data?.map((w) => {
        const q = w.quote || {}, a = w.analysis || {};
        const toT = w.target && q.price ? ((w.target - q.price) / q.price) * 100 : null;
        const toSL = w.stopLoss && q.price ? ((w.stopLoss - q.price) / q.price) * 100 : null;
        return (
          <div key={w.id} className="card p-3">
            <div className="flex items-start gap-2">
              <Link to={`/stock/${w.symbol}`} className="min-w-0 flex-1"><div className="font-semibold">{w.symbol}</div><div className="truncate text-xs text-ink2">{w.name}</div></Link>
              <div className="text-right"><div className="text-lg font-bold"><FlashPrice value={q.price} render={inrP} /></div><ChangePill pctValue={q.changePct} /></div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-card2 px-2 py-1.5">🎯 Target <b className="num">{w.target ? inrP(w.target) : '—'}</b>{toT != null && <span className="text-ink2"> ({pct(toT, 1)})</span>}</div>
              <div className="rounded-lg bg-card2 px-2 py-1.5">🛑 Stop-loss <b className="num">{w.stopLoss ? inrP(w.stopLoss) : '—'}</b>{toSL != null && <span className="text-ink2"> ({pct(toSL, 1)})</span>}</div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5"><ShariahBadge status={a.shariah} /><EntryBadge entry={a.entry} /></div>
            {a.entry && <div className="num mt-1 text-xs text-ink2">Entry {inrP(a.entry.zoneLow)}–{inrP(a.entry.zoneHigh)} · SL {inrP(a.entry.stopLoss)} · T1 {inrP(a.entry.target1)} · T2 {inrP(a.entry.target2)} · R:R 1:{a.entry.rr?.toFixed(1)}</div>}
            <div className="mt-2"><RsiBar rsi={a.rsi} /></div>
            {a.scores && <div className="mt-2"><ScoreRow scores={a.scores} size={32} /></div>}
            <div className="mt-2 flex justify-end gap-3 text-xs">
              <Link className="font-semibold text-brand" to={`/stock/${w.symbol}`}>Set target / alerts</Link>
              <button className="text-down" onClick={async () => { await api.del(`/watchlist/${w.id}`); qc.invalidateQueries({ queryKey: ['watchlist'] }); }}>Remove</button>
            </div>
          </div>
        );
      })}
      <Disclaimer>Entry zones are a technical guide only, not advice.</Disclaimer>
    </div>
  );
}
