import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function SymbolSearch({ onPick, placeholder = 'Search NSE symbol or company…' }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) return setRes([]);
    const t = setTimeout(() => api.get(`/search?q=${encodeURIComponent(q.trim())}`).then(setRes).catch(() => setRes([])), 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative">
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Search symbol" />
      {res.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-card shadow-lg">
          {res.map((r) => (
            <li key={r.symbol + r.exchange}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-card2" onClick={() => { onPick(r); setQ(''); setRes([]); }}><b>{r.symbol}</b> <span className="text-xs text-ink2">{r.exchange} · {r.name}</span></button></li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !res.length && <button type="button" className="mt-1 text-xs text-brand" onClick={() => { onPick({ symbol: q.trim().toUpperCase(), exchange: 'NSE', name: q.trim().toUpperCase() }); setQ(''); }}>Use "{q.trim().toUpperCase()}" as NSE symbol</button>}
    </div>
  );
}
