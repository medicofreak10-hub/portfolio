import React from 'react';
import { SentimentChip } from './ui.jsx';
import { ago, istTime } from '../lib/format.js';

export default function NewsList({ items, showSymbol = true, limit }) {
  const list = limit ? (items || []).slice(0, limit) : items || [];
  if (!list.length) return <div className="card p-4 text-sm text-ink2">No recent news.</div>;
  return (
    <ul className="card divide-y divide-line">
      {list.map((n) => (
        <li key={n.url + n.title}>
          <a href={n.url} target="_blank" rel="noopener noreferrer" className="block px-3 py-2.5 active:bg-card2">
            <div className="text-sm font-medium leading-snug">{n.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink2">
              <SentimentChip s={n.sentiment} />
              {n.tag && <span className="chip bg-brand/15 text-brand">📅 {n.tag}</span>}
              {showSymbol && n.symbol && <span className="chip bg-card2">{n.symbol}</span>}
              <span>{n.source}</span>·<span title={istTime(n.ts)}>{ago(n.ts)}</span>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
