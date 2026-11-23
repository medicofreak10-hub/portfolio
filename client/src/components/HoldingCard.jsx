import React from 'react';
import { Link } from 'react-router-dom';
import { FlashPrice, ChangePill, ShariahBadge, EntryBadge, Sparkline, ScoreRing, RsiBar } from './ui.jsx';
import { inr, inrP, pct, num, tone, arrow } from '../lib/format.js';

export const MODELS = [
  ['multibagger', 'Multibagger', (s) => s.multibagger, 100],
  ['piotroski', 'Piotroski', (s) => s.piotroski, 9],
  ['altman', 'Altman Z', (s) => s.altman, 4],
  ['magic', 'Magic F.', (s) => s.magic, 100],
  ['canslim', 'CAN SLIM', (s) => s.canslim, 7],
  ['coffeecan', 'Coffee Can', (s) => s.coffeecanNorm, 100],
];

export function ScoreRow({ scores, size = 38 }) {
  if (!scores) return null;
  return (
    <div className="flex justify-between gap-1">
      {MODELS.map(([k, label, get, max]) => {
        const v = get(scores);
        const disp = k === 'altman' && v != null ? v.toFixed(1) : k === 'coffeecan' ? (scores.coffeecan?.startsWith('Passes') ? '✓' : scores.coffeecan === 'Fails' ? '✕' : '–') : v;
        return <ScoreRing key={k} score={k === 'altman' && v != null ? Math.min(v, 4) : v} max={max} display={disp} size={size} label={label} />;
      })}
    </div>
  );
}

export default function HoldingCard({ r, spark, expanded }) {
  const t = tone(r.pnlPct, 25);
  const a = r.analysis || {};
  return (
    <Link to={`/stock/${r.symbol}`} className="card block p-3 active:scale-[0.995]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{r.type === 'mf' ? r.name : r.symbol}</span>
            {r.type !== 'stock' && <span className="chip bg-card2 text-ink2">{r.type === 'mf' ? 'MF' : 'ETF'}</span>}
          </div>
          <div className="truncate text-xs text-ink2">{r.type === 'mf' ? `${num(r.qty, 3)} units · avg NAV ${num(r.avgPrice, 2)}` : `${r.name} · ${r.qty} @ ${inrP(r.avgPrice)}`}</div>
        </div>
        {r.type !== 'mf' && <Sparkline data={spark} />}
        <div className="text-right">
          <div className="text-lg font-bold leading-tight"><FlashPrice value={r.price} render={(v) => inrP(v)} /></div>
          <ChangePill pctValue={r.changePct} />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div><div className="text-muted">Value</div><div className="num font-semibold">{inr(r.value)}</div></div>
        <div><div className="text-muted">Total P&amp;L</div><div className={`num font-semibold ${t.cls}`}>{arrow(r.pnl)} {inr(Math.abs(r.pnl))} <span className="font-normal">({pct(r.pnlPct, 1)})</span></div></div>
        <div className="text-right"><div className="text-muted">Today · XIRR</div><div className="num"><span className={tone(r.dayChange).cls}>{arrow(r.dayChange)} {inr(Math.abs(r.dayChange))}</span> · <span title={r.xirrNote}>{r.xirr != null ? pct(r.xirr, 1) + (r.xirrApprox ? '*' : '') : '—'}</span></div></div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ShariahBadge status={a.shariah} compact={!expanded} />
        <EntryBadge entry={a.entry} compact />
        {r.weight > 0 && <span className="chip bg-card2 text-ink2">{r.weight.toFixed(1)}% of portfolio</span>}
      </div>
      {expanded && r.type !== 'mf' && (
        <div className="mt-3 space-y-2 border-t border-line pt-2">
          <RsiBar rsi={a.rsi} />
          <ScoreRow scores={a.scores} size={34} />
        </div>
      )}
    </Link>
  );
}
