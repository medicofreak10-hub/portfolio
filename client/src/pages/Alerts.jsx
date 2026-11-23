import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { ago, inrP } from '../lib/format.js';
import { Spinner } from '../components/ui.jsx';

const KIND = { price: 'Price', move: 'Big move', entry: 'Entry zone', shariah: 'Shariah', score: 'Score', news: 'News', rule: 'Price alert', test: 'Test' };

export default function Alerts() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['alerts'], queryFn: () => api.get('/alerts'), refetchInterval: 60000 });
  useEffect(() => { if (data?.unseen) api.post('/alerts/seen').then(() => qc.invalidateQueries({ queryKey: ['alerts'] })); }, [data?.unseen]);
  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-3">
      <h1 className="px-1 text-base font-bold">Alerts</h1>
      {data.rules.length > 0 && (
        <div className="card p-3">
          <div className="mb-1 text-sm font-semibold">Your price alerts</div>
          <ul className="space-y-1 text-sm">{data.rules.map((r) => <li key={r.id} className="flex items-center justify-between"><span><b>{r.symbol}</b> {r.kind === 'above' ? 'above' : r.kind === 'below' ? 'below' : 'day move ≥'} {r.kind === 'movePct' ? r.value + '%' : inrP(r.value)}</span><button className="text-xs text-down" onClick={async () => { await api.del(`/alert-rules/${r.id}`); qc.invalidateQueries({ queryKey: ['alerts'] }); }}>Remove</button></li>)}</ul>
        </div>
      )}
      {!data.alerts.length && <div className="card p-4 text-sm text-ink2">No alerts yet. You'll be alerted for targets, stop-losses, ±5% moves, entry-zone entries, Shariah status changes, score changes and important news.</div>}
      <ul className="space-y-2">
        {data.alerts.map((a) => {
          const ext = /^https?:/.test(a.url);
          const body = <><div className="flex items-center gap-2 text-[11px] text-ink2"><span className="chip bg-card2">{KIND[a.kind] || a.kind}</span>{ago(a.ts)}{!a.seen && <span className="h-2 w-2 rounded-full bg-down" />}</div><div className="mt-1 text-sm font-semibold">{a.title}</div><div className="text-xs text-ink2">{a.body}</div></>;
          return <li key={a.id}>{ext ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="card block p-3">{body}</a> : <Link to={a.url} className="card block p-3">{body}</Link>}</li>;
        })}
      </ul>
    </div>
  );
}
