import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useLive } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import PriceChart from '../components/PriceChart.jsx';
import NewsList from '../components/NewsList.jsx';
import { ScoreRow } from '../components/HoldingCard.jsx';
import { FlashPrice, Change, ShariahBadge, EntryBadge, RsiBar, ScoreRing, Spinner, ErrorBox, Disclaimer, Sheet, Stat, scoreColor, scoreEmoji } from '../components/ui.jsx';
import { inr, inrP, pct, num, crore, istDate, tone, arrow } from '../lib/format.js';

export default function StockDetail() {
  const { symbol } = useParams();
  const { data: d, error, isLoading } = useLive(['stock', symbol], `/stock/${symbol}`);
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ['stock', symbol] }); qc.invalidateQueries({ queryKey: ['portfolio'] }); qc.invalidateQueries({ queryKey: ['watchlist'] }); };
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (d.type === 'mf') return <MfDetail d={d} />;
  const q = d.quote || {};
  const price = q.price ?? d.tech?.price;
  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight">{d.profile.name}</h1>
            <div className="text-xs text-ink2">{d.symbol} · {d.exchange} {d.profile.sector ? `· ${d.profile.sector}` : ''}{d.profile.industry ? ` · ${d.profile.industry}` : ''}</div>
          </div>
          <WatchButton d={d} onDone={refresh} />
        </div>
        <div className="mt-2 flex items-end gap-3">
          <span className="text-3xl font-extrabold"><FlashPrice value={price} render={inrP} /></span>
          <Change value={q.change} pctValue={q.changePct} className="pb-1 text-base" />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <ShariahBadge status={d.shariah?.status} />
          {d.entry?.available && <EntryBadge entry={d.entry} />}
          {q.stale && <span className="chip bg-warn/15">last known price</span>}
        </div>
      </div>

      {d.holding && <HoldingBox d={d} price={price} onDone={refresh} />}
      <PriceChart symbol={d.symbol} entry={d.entry} />
      <KeyStats d={d} price={price} />
      {d.entry && <EntryCard e={d.entry} />}
      {d.scores && <Scores d={d} />}
      <ShariahCard d={d} onDone={refresh} />
      {d.type === 'stock' && <Alternatives d={d} />}
      {d.corporateActions?.length > 0 && <CorporateActions items={d.corporateActions} />}
      <h2 className="section-title">News</h2>
      <NewsList items={d.news} showSymbol={false} />
      {d.type === 'stock' && <ScreenerUpload symbol={d.symbol} source={d.profile.source} years={d.profile.years?.length} onDone={refresh} />}
      {d.profile.summary && <details className="card p-3 text-sm text-ink2"><summary className="cursor-pointer font-semibold text-ink">About the company</summary><p className="mt-2">{d.profile.summary}</p></details>}
    </div>
  );
}

function WatchButton({ d, onDone }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ target: d.watch?.target ?? '', stopLoss: d.watch?.stopLoss ?? d.entry?.stopLoss?.toFixed(2) ?? '' });
  const [rule, setRule] = useState({ kind: 'above', value: '' });
  const [msg, setMsg] = useState('');
  const save = async () => {
    try {
      if (d.watch) await api.put(`/watchlist/${d.watch.id}`, f);
      else await api.post('/watchlist', { symbol: d.symbol, exchange: d.exchange, name: d.profile.name, ...f });
      setOpen(false); onDone();
    } catch (e) { setMsg(e.message); }
  };
  const addRule = async () => { try { await api.post('/alert-rules', { symbol: d.symbol, ...rule }); setMsg('Alert added ✓'); setRule({ ...rule, value: '' }); } catch (e) { setMsg(e.message); } };
  return <>
    <button className="btn-ghost shrink-0 px-3 py-2 text-xs" onClick={() => setOpen(true)}>{d.watch ? '★ Watching' : '☆ Watch'} · 🔔</button>
    <Sheet open={open} onClose={() => setOpen(false)} title={`Alerts for ${d.symbol}`}>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="label">Target price (₹)</span><input className="input" inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></label>
        <label><span className="label">Stop-loss (₹)</span><input className="input" inputMode="decimal" value={f.stopLoss} onChange={(e) => setF({ ...f, stopLoss: e.target.value })} /></label>
      </div>
      <button className="btn-primary mt-3 w-full" onClick={save}>{d.watch ? 'Update watchlist' : 'Add to watchlist'}</button>
      <div className="mt-5 text-sm font-semibold">Extra price alert</div>
      <div className="mt-2 flex gap-2">
        <select className="input w-40" value={rule.kind} onChange={(e) => setRule({ ...rule, kind: e.target.value })}><option value="above">Price above</option><option value="below">Price below</option><option value="movePct">Day move ≥ %</option></select>
        <input className="input" inputMode="decimal" placeholder={rule.kind === 'movePct' ? '5' : '₹'} value={rule.value} onChange={(e) => setRule({ ...rule, value: e.target.value })} />
        <button className="btn-ghost" onClick={addRule}>Add</button>
      </div>
      <p className="mt-2 text-xs text-ink2">±5% daily move alerts are on for all holdings and watchlist stocks (change in Settings). Alerts show in 🔔 and as phone notifications.</p>
      {msg && <div className="mt-2 text-sm">{msg}</div>}
    </Sheet>
  </>;
}

function HoldingBox({ d, price, onDone }) {
  const h = d.holding;
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ qty: h.qty, avgPrice: h.avgPrice, buyDate: h.buyDate || '' });
  const value = price != null ? price * h.qty : null;
  const pnl = value != null ? value - h.qty * h.avgPrice : null;
  const t = tone((pnl / (h.qty * h.avgPrice)) * 100, 25);
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Your holding</h2><button className="text-xs font-semibold text-brand" onClick={() => setEdit(true)}>Edit</button></div>
      <div className="mt-2 grid grid-cols-3 gap-3">
        <Stat label="Qty" value={num(h.qty, 0)} />
        <Stat label="Avg price" value={inrP(h.avgPrice)} />
        <Stat label="Value" value={inr(value)} />
        <Stat label="Invested" value={inr(h.qty * h.avgPrice)} />
        <div><div className="text-[11px] uppercase tracking-wide text-muted">P&amp;L</div><div className={`num font-semibold ${t.cls}`}>{arrow(pnl)} {inr(Math.abs(pnl))} ({pct((pnl / (h.qty * h.avgPrice)) * 100, 1)})</div></div>
        <Stat label="Broker" value={h.broker || '—'} />
      </div>
      <Sheet open={edit} onClose={() => setEdit(false)} title={`Edit ${d.symbol}`}>
        <div className="grid grid-cols-2 gap-3">
          <label><span className="label">Quantity</span><input className="input" inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></label>
          <label><span className="label">Average price (₹)</span><input className="input" inputMode="decimal" value={f.avgPrice} onChange={(e) => setF({ ...f, avgPrice: e.target.value })} /></label>
          <label className="col-span-2"><span className="label">First buy date (for XIRR, optional)</span><input className="input" type="date" value={f.buyDate} onChange={(e) => setF({ ...f, buyDate: e.target.value })} /></label>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1" onClick={async () => { await api.put(`/holdings/${h.id}`, f); setEdit(false); onDone(); }}>Save</button>
          <button className="btn-ghost text-down" onClick={async () => { if (confirm(`Remove ${d.symbol} from holdings?`)) { await api.del(`/holdings/${h.id}`); setEdit(false); onDone(); } }}>Delete</button>
        </div>
      </Sheet>
    </div>
  );
}

function KeyStats({ d, price }) {
  const p = d.profile, t = d.tech || {}, dv = d.derived || {};
  const hi = d.quote?.high52 ?? t.high52 ?? p.high52, lo = d.quote?.low52 ?? t.low52 ?? p.low52;
  const pos = hi && lo && price ? ((price - lo) / (hi - lo)) * 100 : null;
  return (
    <div className="card p-4">
      <h2 className="mb-2 text-sm font-semibold">Key numbers</h2>
      {pos != null && (
        <div className="mb-3">
          <div className="flex justify-between text-[11px] text-muted"><span>52W low {inrP(lo)}</span><span>52W high {inrP(hi)}</span></div>
          <div className="relative mt-1 h-1.5 rounded-full bg-card2"><div className="absolute -top-1 h-3.5 w-1.5 rounded-full bg-ink" style={{ left: `calc(${Math.max(0, Math.min(100, pos))}% - 3px)` }} /></div>
          <div className="mt-1 text-center text-[11px] text-ink2">{pos.toFixed(0)}% of 52-week range · {hi ? pct(((price - hi) / hi) * 100, 1) : ''} from high</div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="P/E" value={p.pe ? num(p.pe, 1) : '—'} sub={d.scores?.ctx?.industryPE ? `Peers ${num(d.scores.ctx.industryPE, 1)}` : null} />
        <Stat label="ROE" value={dv.roe != null ? pct(dv.roe, 1).replace('+', '') : '—'} />
        <Stat label="ROCE" value={dv.roce != null ? pct(dv.roce, 1).replace('+', '') : '—'} />
        <Stat label="Debt / Equity" value={dv.debtToEquity != null ? num(dv.debtToEquity, 2) : '—'} />
        <Stat label="Market cap" value={crore(p.marketCap)} />
        <Stat label="Div. yield" value={p.dividendYield != null ? p.dividendYield.toFixed(2) + '%' : '—'} />
        <Stat label="Sales CAGR 3y" value={dv.salesCagr3 != null ? pct(dv.salesCagr3, 1) : '—'} />
        <Stat label="Profit CAGR 3y" value={dv.profitCagr3 != null ? pct(dv.profitCagr3, 1) : '—'} />
        <Stat label="Promoter" value={p.promoterHolding != null ? p.promoterHolding.toFixed(1) + '%' : '—'} />
      </div>
      <div className="mt-3"><RsiBar rsi={t.rsi} /></div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-ink2">
        <span>20 DMA <b className="num text-ink">{inrP(t.sma20)}</b></span><span>50 DMA <b className="num text-ink">{inrP(t.sma50)}</b></span><span>200 DMA <b className="num text-ink">{inrP(t.sma200)}</b></span>
      </div>
      <div className="mt-2 text-[11px] text-muted">Fundamentals: {p.source || 'n/a'} · {p.years?.length || 0} yrs of financials</div>
    </div>
  );
}

function EntryCard({ e }) {
  if (!e.available) return <div className="card p-4 text-sm text-ink2">Entry zone: {e.reason}</div>;
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Entry zone</h2><EntryBadge entry={e} /></div>
      <div className="mt-3 rounded-xl bg-up/10 px-3 py-2 text-center">
        <div className="text-[11px] uppercase text-ink2">Entry zone</div>
        <div className="num text-2xl font-extrabold">{inrP(e.zoneLow)} – {inrP(e.zoneHigh)}</div>
        <div className="text-xs text-ink2">based on {e.basis} · price {e.distancePct === 0 ? 'inside zone' : `${pct(e.distancePct, 1)} ${e.distancePct > 0 ? 'above' : 'below'} zone`}</div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <div className="rounded-xl bg-down/10 p-2"><div className="text-[10px] uppercase text-ink2">Stop-loss</div><div className="num text-sm font-bold">{inrP(e.stopLoss)}</div></div>
        <div className="rounded-xl bg-card2 p-2"><div className="text-[10px] uppercase text-ink2">Target 1</div><div className="num text-sm font-bold">{inrP(e.target1)}</div></div>
        <div className="rounded-xl bg-card2 p-2"><div className="text-[10px] uppercase text-ink2">Target 2</div><div className="num text-sm font-bold">{inrP(e.target2)}</div></div>
        <div className="rounded-xl bg-card2 p-2"><div className="text-[10px] uppercase text-ink2">Risk:Reward</div><div className="num text-sm font-bold">1:{e.rr?.toFixed(1)}</div></div>
      </div>
      {e.note && <p className="mt-2 text-sm text-warn">{e.note}</p>}
      <p className="mt-3 rounded-lg bg-warn/15 px-3 py-2 text-xs font-semibold">⚠ Technical guide only, not advice. Built from support levels, 20/50/200 DMA, RSI and recent swing lows.</p>
    </div>
  );
}

const MODEL_TABS = [['multibagger', 'Multibagger'], ['piotroski', 'Piotroski'], ['altman', 'Altman Z'], ['magic', 'Magic Formula'], ['canslim', 'CAN SLIM'], ['coffeecan', 'Coffee Can']];

function Scores({ d }) {
  const [tab, setTab] = useState('multibagger');
  const s = d.scores;
  const summary = { multibagger: s.multibagger?.score, piotroski: s.piotroski?.score, altman: s.altman?.score, magic: s.magic?.norm, magicRank: s.magic?.rank, canslim: s.canslim?.score, coffeecan: s.coffeecan?.label, coffeecanNorm: s.coffeecan?.norm };
  return (
    <div className="card p-4">
      <h2 className="mb-3 text-sm font-semibold">Scores</h2>
      <ScoreRow scores={summary} size={42} />
      <div className="no-scrollbar -mx-1 mt-4 flex gap-1 overflow-x-auto px-1">
        {MODEL_TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`chip whitespace-nowrap px-3 py-1.5 text-xs ${tab === k ? 'bg-ink text-page' : 'bg-card2 text-ink2'}`}>{l}</button>)}
      </div>
      <div className="mt-3">
        {tab === 'multibagger' && <Multibagger m={s.multibagger} hist={d.scoreHistory} />}
        {tab === 'piotroski' && <TestList title={`Piotroski F-Score ${s.piotroski.score ?? '–'}/9 — ${s.piotroski.label}`} tests={s.piotroski.tests} note={s.piotroski.known < 9 ? `${9 - s.piotroski.known} test(s) lacked data and count as not passed.` : 'Financial strength from the last two annual reports.'} />}
        {tab === 'altman' && <Altman a={s.altman} />}
        {tab === 'magic' && <Magic m={s.magic} />}
        {tab === 'canslim' && <TestList title={`CAN SLIM ${s.canslim.score ?? '–'}/7 — ${s.canslim.label}`} tests={s.canslim.tests.map((t) => ({ ...t, label: `${t.key} — ${t.label}`, detail: t.value == null ? 'no data' : typeof t.value === 'number' ? t.value.toFixed(1) : t.value }))} note="William O'Neil's growth + momentum checklist." />}
        {tab === 'coffeecan' && <CoffeeCan c={s.coffeecan} />}
      </div>
      <Disclaimer>Scores describe past data and rules of thumb. Not a guarantee, not a probability, not advice.</Disclaimer>
    </div>
  );
}

function Multibagger({ m, hist }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <ScoreRing score={m.score} size={72} />
        <div>
          <div className="text-base font-bold">{m.band.emoji} {m.band.label}</div>
          <div className="text-xs text-ink2">Multibagger potential score (not a guarantee)</div>
          <div className="text-[11px] text-muted">Data coverage {m.coverage}%</div>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {m.components.map((c) => (
          <details key={c.name} className="rounded-xl bg-card2 px-3 py-2">
            <summary className="flex cursor-pointer items-center gap-2 text-sm">
              <span className="w-28 font-medium">{c.name} <span className="text-[10px] text-muted">{c.weight}%</span></span>
              <div className="h-2 flex-1 rounded-full bg-line"><div className="h-2 rounded-full" style={{ width: `${c.score ?? 0}%`, background: scoreColor(c.score) }} /></div>
              <span className="num w-8 text-right font-semibold">{c.score == null ? '–' : Math.round(c.score)}</span>
            </summary>
            <ul className="mt-2 space-y-1 text-xs">
              {c.metrics.map((x) => (
                <li key={x.label} className="flex justify-between gap-2">
                  <span className="text-ink2">{x.label}{x.hint ? <span className="text-muted"> · {x.hint}</span> : ''}</span>
                  <span className="num shrink-0 font-semibold">{fmtMetric(x)} {x.score != null && <span style={{ color: scoreColor(x.score) }}>●</span>}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
      {(m.strengths.length > 0 || m.flags.length > 0) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {m.strengths.length > 0 && <div className="rounded-xl bg-up/10 p-3 text-xs"><div className="mb-1 font-semibold text-up">▲ Strengths</div><ul className="list-disc space-y-0.5 pl-4">{m.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>}
          {m.flags.length > 0 && <div className="rounded-xl bg-down/10 p-3 text-xs"><div className="mb-1 font-semibold text-down">▼ Red flags</div><ul className="list-disc space-y-0.5 pl-4">{m.flags.map((s) => <li key={s}>{s}</li>)}</ul></div>}
        </div>
      )}
      {hist?.length > 0 && <div className="mt-3 text-xs text-ink2">Monthly history: {hist.map((h) => <span key={h.month} className="mr-2 num">{h.month}: <b>{h.score}</b></span>)}</div>}
    </div>
  );
}
function fmtMetric(x) {
  if (x.value == null) return 'n/a';
  if (typeof x.value === 'string') return x.value;
  if (x.fmt === 'pct') return x.value.toFixed(1) + '%';
  if (x.fmt === 'pp') return (x.value > 0 ? '+' : '') + x.value.toFixed(1) + ' pts';
  if (x.fmt === 'cr') return '₹' + Math.round(x.value).toLocaleString('en-IN') + ' Cr';
  if (x.fmt === 'ratio') return (x.value * 100).toFixed(0) + '%';
  return x.value.toFixed(2) + 'x';
}
function TestList({ title, tests, note }) {
  return (
    <div>
      <div className="font-semibold">{title}</div>
      <ul className="mt-2 space-y-1 text-sm">
        {tests.map((t) => <li key={t.label} className="flex items-start gap-2"><span className={t.pass == null ? 'text-muted' : t.pass ? 'text-up' : 'text-down'}>{t.pass == null ? '–' : t.pass ? '✓' : '✕'}</span><span className="flex-1">{t.label}</span>{t.detail && <span className="num text-xs text-ink2">{t.detail}</span>}</li>)}
      </ul>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </div>
  );
}
function Altman({ a }) {
  const zc = a.label === 'Safe zone' ? 'text-up' : a.label === 'Grey zone' ? 'text-warn' : 'text-down';
  return (
    <div>
      <div className="text-2xl font-bold">Z = {a.score ?? '–'} <span className={`text-base ${zc}`}>{a.label}</span></div>
      <p className="text-xs text-ink2">Bankruptcy-risk model. &gt; 2.99 safe · 1.81–2.99 grey · &lt; 1.81 distress. Less meaningful for asset-light service firms.</p>
      {a.parts && <div className="mt-2 grid grid-cols-5 gap-1 text-center text-xs">{[['A', 'Work. cap/TA'], ['B', 'Ret. earn/TA'], ['C', 'EBIT/TA'], ['D', 'MCap/Liab'], ['E', 'Sales/TA']].map(([k, l]) => <div key={k} className="rounded-lg bg-card2 p-1.5"><div className="text-muted">{l}</div><div className="num font-semibold">{a.parts[k] != null ? a.parts[k].toFixed(2) : '–'}</div></div>)}</div>}
      {a.note && <p className="mt-2 text-xs text-muted">{a.note}</p>}
    </div>
  );
}
function Magic({ m }) {
  return (
    <div>
      <div className="font-semibold">Magic Formula (Greenblatt) {m.rank ? `— rank ${m.rank} of ${m.of}` : ''}</div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-xl bg-card2 p-2"><div className="text-[11px] text-muted">Return on capital</div><div className="num font-bold">{m.roc != null ? m.roc.toFixed(1) + '%' : '–'}</div></div>
        <div className="rounded-xl bg-card2 p-2"><div className="text-[11px] text-muted">Earnings yield</div><div className="num font-bold">{m.ey != null ? m.ey.toFixed(1) + '%' : '–'}</div></div>
        <div className="rounded-xl bg-card2 p-2"><div className="text-[11px] text-muted">Percentile</div><div className="num font-bold">{m.norm ?? '–'}</div></div>
      </div>
      <p className="mt-2 text-xs text-muted">Ranked against all stocks the app has analysed (your holdings, watchlist and the Discover universe). Higher ROC + higher earnings yield = better.</p>
    </div>
  );
}
function CoffeeCan({ c }) {
  return (
    <div>
      <div className="font-semibold">Coffee Can: <span className={c.pass ? 'text-up' : c.label === 'n/a' ? 'text-muted' : 'text-down'}>{c.label}</span></div>
      <p className="text-xs text-ink2">Saurabh Mukherjea: sales growth ≥ 10% and ROCE ≥ 15% every year for 10 years.</p>
      <div className="mt-2 overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-muted"><th className="text-left">Year</th><th className="text-right">Sales growth</th><th className="text-right">ROCE</th><th /></tr></thead>
        <tbody>{c.rows.map((r) => <tr key={r.year}><td>{r.year}</td><td className="num text-right">{r.salesGrowth != null ? r.salesGrowth.toFixed(1) + '%' : '–'}</td><td className="num text-right">{r.roce != null ? r.roce.toFixed(1) + '%' : '–'}</td><td className="text-right">{r.pass == null ? '–' : r.pass ? <span className="text-up">✓</span> : <span className="text-down">✕</span>}</td></tr>)}</tbody></table></div>
      {c.note && <p className="mt-2 text-xs text-muted">{c.note}</p>}
    </div>
  );
}

function ShariahCard({ d, onDone }) {
  const sh = d.shariah;
  const [ov, setOv] = useState(false);
  const [f, setF] = useState({ status: d.override?.status || 'Compliant', note: d.override?.note || '' });
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Shariah screening</h2><ShariahBadge status={sh?.status} /></div>
      <ul className="mt-2 space-y-1.5 text-sm">
        {sh?.checks?.map((c) => (
          <li key={c.name} className="flex items-start gap-2">
            <span className={{ pass: 'text-up', fail: 'text-down', doubt: 'text-warn', na: 'text-muted', info: 'text-brand' }[c.result]}>{{ pass: '✓', fail: '✕', doubt: '?', na: '–', info: 'i' }[c.result]}</span>
            <span className="flex-1">{c.name}</span><span className="text-right text-xs text-ink2">{c.detail}</span>
          </li>
        ))}
      </ul>
      {sh?.purificationPct != null && <p className="mt-2 text-xs text-ink2">Purification: give <b>{sh.purificationPct.toFixed(2)}%</b> of dividends received to charity (interest-income share). Use the calculator in Settings.</p>}
      <p className="mt-2 text-[11px] text-muted">{sh?.source}. Thresholds: debt &lt; 33% of market cap, interest income &lt; 5% of revenue, cash &lt; 33%, receivables &lt; 49% (editable in Settings). Verify with a qualified scholar or an official Shariah index.</p>
      <button className="mt-2 text-xs font-semibold text-brand" onClick={() => setOv(true)}>{d.override ? 'Edit / remove your override' : 'Override status'}</button>
      <Sheet open={ov} onClose={() => setOv(false)} title="Override Shariah status">
        <p className="mb-3 text-sm text-ink2">Use this if your scholar or a trusted screener (e.g. an official index) says otherwise.</p>
        <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option>Compliant</option><option>Doubtful</option><option>Non-compliant</option></select>
        <input className="input mt-2" placeholder="Note / source (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <div className="mt-3 flex gap-2">
          <button className="btn-primary flex-1" onClick={async () => { await api.post('/shariah-override', { symbol: d.symbol, ...f }); setOv(false); setTimeout(onDone, 600); }}>Save</button>
          {d.override && <button className="btn-ghost" onClick={async () => { await api.del(`/shariah-override/${d.symbol}`); setOv(false); setTimeout(onDone, 600); }}>Remove</button>}
        </div>
      </Sheet>
    </div>
  );
}

function Alternatives({ d }) {
  const alts = d.alternatives || [];
  const my = d.scores?.multibagger?.score;
  const me = { symbol: d.symbol, name: d.profile.name, pe: d.profile.pe, roe: d.derived?.roe, salesCagr3: d.derived?.salesCagr3, debtToEquity: d.derived?.debtToEquity, entry: d.entry?.available ? d.entry : null, scores: { multibagger: my }, price: d.quote?.price ?? d.tech?.price, shariah: d.shariah?.status };
  if (!alts.length) return <div className="card p-4 text-sm text-ink2"><b className="text-ink">Alternatives:</b> no Shariah-compliant peer in the same sector scores higher right now{my == null ? ' (score unavailable)' : ''}.</div>;
  const best = alts[0];
  return (
    <div className="space-y-2">
      {my != null && my < 40 && best && (
        <Link to={`/stock/${best.symbol}`} className="card block border-brand/50 bg-brand/5 p-4">
          <div className="text-xs font-semibold uppercase text-brand">🔁 Swap suggestion</div>
          <div className="mt-1 text-sm">{d.symbol} scores <b>{my}</b> (weak). <b>{best.name}</b> ({best.symbol}) in the same sector scores <b>{best.scores.multibagger}</b> and is Shariah-compliant.</div>
          <div className="mt-1 text-[11px] text-muted">Do your own research. Not advice.</div>
        </Link>
      )}
      <div className="card p-3">
        <h2 className="mb-2 text-sm font-semibold">Shariah-compliant alternatives (higher score)</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead><tr className="text-left text-muted"><th className="py-1">Stock</th><th className="text-right">Score</th><th className="text-right">P/E</th><th className="text-right">ROE</th><th className="text-right">Sales 3y</th><th className="text-right">D/E</th><th className="text-right">Entry zone</th></tr></thead>
            <tbody>
              {[{ ...me, mine: true }, ...alts].map((a) => (
                <tr key={a.symbol} className={`border-t border-line ${a.mine ? 'bg-card2' : ''}`}>
                  <td className="py-1.5"><Link to={`/stock/${a.symbol}`} className="font-semibold">{a.symbol}</Link>{a.mine && <span className="ml-1 text-muted">(yours)</span>}<div className="max-w-[140px] truncate text-muted">{a.name}</div></td>
                  <td className="num text-right font-bold" style={{ color: scoreColor(a.scores?.multibagger) }}>{scoreEmoji(a.scores?.multibagger)} {a.scores?.multibagger ?? '–'}</td>
                  <td className="num text-right">{a.pe ? a.pe.toFixed(1) : '–'}</td>
                  <td className="num text-right">{a.roe != null ? a.roe.toFixed(1) + '%' : '–'}</td>
                  <td className="num text-right">{a.salesCagr3 != null ? a.salesCagr3.toFixed(1) + '%' : '–'}</td>
                  <td className="num text-right">{a.debtToEquity != null ? a.debtToEquity.toFixed(2) : '–'}</td>
                  <td className="num text-right">{a.entry ? `${inr(a.entry.zoneLow)}–${inr(a.entry.zoneHigh)} ${a.entry.emoji}` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CorporateActions({ items }) {
  return (
    <div className="card p-3">
      <h2 className="mb-2 text-sm font-semibold">📅 Corporate actions</h2>
      <ul className="space-y-1.5 text-sm">{items.slice(0, 8).map((c, i) => <li key={i} className="flex gap-2"><span className="chip shrink-0 bg-brand/15 text-brand">{c.kind}</span><span className="flex-1 text-ink2">{c.title}</span><span className="num shrink-0 text-xs">{c.date}</span></li>)}</ul>
    </div>
  );
}

function ScreenerUpload({ symbol, source, years, onDone }) {
  const [msg, setMsg] = useState('');
  return (
    <div className="card p-3 text-sm">
      <div className="font-semibold">Better fundamentals (optional)</div>
      <p className="mt-1 text-xs text-ink2">Have {years || 0} yrs of data from {source || 'n/a'}. For 10-year history (Coffee Can, 5-yr CAGR), open the company on screener.in → <b>Export to Excel</b>, then upload it here.</p>
      <label className="btn-ghost mt-2 w-full cursor-pointer">Upload Screener export<input type="file" accept=".xlsx" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        const fd = new FormData(); fd.append('files', f); fd.append('symbol', symbol);
        try { const r = await api.post('/import', fd); setMsg(r.report.map((x) => x.message).join('; ')); setTimeout(onDone, 1500); } catch (x) { setMsg(x.message); }
      }} /></label>
      {msg && <div className="mt-2 text-xs">{msg}</div>}
    </div>
  );
}

function MfDetail({ d }) {
  const h = d.holding; const nav = d.nav?.nav ?? h.lastNav;
  const value = nav * h.qty, inv = h.qty * h.avgPrice, pnl = value - inv;
  return (
    <div className="space-y-3">
      <div className="card p-4">
        <h1 className="text-lg font-bold leading-tight">{h.name}</h1>
        <div className="text-xs text-ink2">{h.category} · Folio {h.folio} · {h.broker}</div>
        <div className="mt-2 text-3xl font-extrabold num">NAV {num(nav, 4)}</div>
        <div className="text-xs text-muted">NAV date {d.nav?.date || '—'} (AMFI){d.nav?.code ? ` · scheme ${d.nav.code}` : ''}</div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Units" value={num(h.qty, 3)} /><Stat label="Value" value={inr(value)} /><Stat label="Invested" value={inr(inv)} />
          <div><div className="text-[11px] uppercase text-muted">P&amp;L</div><div className={`num font-semibold ${tone(pnl).cls}`}>{arrow(pnl)} {inr(Math.abs(pnl))} ({pct((pnl / inv) * 100, 1)})</div></div>
          <Stat label="XIRR (Groww)" value={h.reportedXirr != null ? pct(h.reportedXirr, 2) : '—'} />
        </div>
        <div className="mt-3"><ShariahBadge status={d.shariah?.status} /></div>
        <p className="mt-1 text-xs text-ink2">{d.shariah?.checks?.[0]?.detail}</p>
      </div>
      <PriceChart symbol={d.symbol} />
      <ShariahCard d={{ ...d, symbol: h.symbol, override: d.shariah?.checks?.[0]?.name === 'Manual override' ? { status: d.shariah.status } : null }} onDone={() => location.reload()} />
    </div>
  );
}
