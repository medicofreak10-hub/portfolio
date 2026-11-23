import React, { useState } from 'react';
import { useLive } from '../lib/hooks.js';
import NewsList from '../components/NewsList.jsx';
import { Spinner } from '../components/ui.jsx';

export default function News() {
  const [tab, setTab] = useState('mine');
  const [sent, setSent] = useState('all');
  const mine = useLive('news-h', '/news', { interval: 10 * 60000 });
  const market = useLive('news-m', '/news?scope=market', { interval: 10 * 60000, enabled: tab === 'market' });
  const ca = useLive('ca', '/corporate-actions', { interval: 60 * 60000, enabled: tab === 'actions' });
  const src = tab === 'mine' ? mine : market;
  const items = (src.data || []).filter((n) => sent === 'all' || n.sentiment === sent);
  return (
    <div className="space-y-3">
      <div className="seg" role="group" aria-label="News feed">
        {[['mine', 'My stocks'], ['market', 'Market'], ['actions', 'Corporate actions']].map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab !== 'actions' ? <>
        <div className="flex gap-1.5">
          {['all', 'Positive', 'Negative', 'Neutral'].map((s) => <button key={s} onClick={() => setSent(s)} className={`chip px-3 py-1 ${sent === s ? 'bg-ink text-page' : 'bg-card2 text-ink2'}`}>{s === 'all' ? 'All' : (s === 'Positive' ? '▲ ' : s === 'Negative' ? '▼ ' : '■ ') + s}</button>)}
        </div>
        {src.isLoading ? <Spinner /> : <NewsList items={items} />}
        <p className="px-1 text-[11px] text-muted">Sentiment is auto-tagged from the headline by a simple word list — read the article before acting. 📅 marks results, dividends, splits, bonus and board meetings.</p>
      </> : (
        ca.isLoading ? <Spinner /> : (
          <ul className="card divide-y divide-line">
            {(ca.data || []).map((c, i) => <li key={i} className="flex gap-2 px-3 py-2.5 text-sm"><span className="chip shrink-0 bg-brand/15 text-brand">{c.kind}</span><span className="flex-1"><b>{c.symbol}</b> <span className="text-ink2">{c.title}</span></span><span className="num shrink-0 text-xs">{c.date}</span></li>)}
            {!ca.data?.length && <li className="p-4 text-sm text-ink2">No corporate actions found (source: NSE).</li>}
          </ul>
        )
      )}
    </div>
  );
}
