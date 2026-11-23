import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useStatus } from '../lib/hooks.js';
import { useTheme } from '../lib/theme.js';
import { enableNotifications, notificationsSupported } from '../lib/push.js';
import SymbolSearch from '../components/SymbolSearch.jsx';
import { inr, num } from '../lib/format.js';
import { ShariahBadge } from '../components/ui.jsx';

export default function Settings() {
  return (
    <div className="space-y-3 pb-4">
      <h1 className="px-1 text-base font-bold">Settings</h1>
      <ImportCard />
      <AddHolding />
      <Purification />
      <Notifications />
      <Preferences />
      <About />
    </div>
  );
}

function ImportCard() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const onFiles = async (files) => {
    if (!files?.length) return;
    setBusy(true); setReport(null);
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    try { const r = await api.post('/import', fd); setReport(r.report); qc.invalidateQueries(); }
    catch (e) { setReport([{ ok: false, file: '', message: e.message }]); }
    setBusy(false);
  };
  return (
    <div className="card p-4">
      <h2 className="font-semibold">Import holdings</h2>
      <p className="mt-1 text-xs text-ink2">Select one or more files at once. Holdings statements replace that broker's holdings; order history adds trades (used for XIRR).</p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink2">
        <li><b>Groww</b>: Stocks → Holdings statement, Order history, and Mutual funds holdings statement (.xlsx)</li>
        <li><b>Zerodha</b>: Kite → Holdings → Download (.csv), or Console → Portfolio → Holdings (.xlsx/.csv), Console → Tradebook (.csv)</li>
        <li><b>Screener.in</b>: company page → Export to Excel (for 10-year fundamentals)</li>
      </ul>
      <label className={`btn-primary mt-3 w-full cursor-pointer ${busy ? 'opacity-60' : ''}`}>
        {busy ? 'Importing…' : '📂 Choose files'}
        <input type="file" multiple accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={(e) => onFiles(e.target.files)} />
      </label>
      {report && <ul className="mt-3 space-y-1 text-xs">{report.map((r, i) => <li key={i} className={r.ok ? 'text-up' : 'text-down'}>{r.ok ? '✓' : '✕'} {r.file && <b>{r.file}: </b>}{r.message}</li>)}</ul>}
      <p className="mt-2 text-[11px] text-muted">Files are read on your computer and stored only in the app's local data folder. Nothing is uploaded anywhere else.</p>
    </div>
  );
}

function AddHolding() {
  const qc = useQueryClient();
  const [f, setF] = useState({ type: 'stock', symbol: '', exchange: 'NSE', name: '', qty: '', avgPrice: '', buyDate: '' });
  const [msg, setMsg] = useState('');
  const save = async (e) => {
    e.preventDefault();
    try { await api.post('/holdings', { ...f, qty: Number(f.qty), avgPrice: Number(f.avgPrice), symbol: f.type === 'mf' ? f.name : f.symbol }); setMsg('Added ✓'); setF({ ...f, symbol: '', name: '', qty: '', avgPrice: '', buyDate: '' }); qc.invalidateQueries({ queryKey: ['portfolio'] }); }
    catch (x) { setMsg(x.message); }
  };
  return (
    <form className="card p-4" onSubmit={save}>
      <h2 className="font-semibold">Add holding manually</h2>
      <div className="seg mt-2" role="group" aria-label="Type">{[['stock', 'Stock'], ['etf', 'ETF'], ['mf', 'Mutual fund']].map(([k, l]) => <button type="button" key={k} aria-pressed={f.type === k} onClick={() => setF({ ...f, type: k })}>{l}</button>)}</div>
      <div className="mt-3 space-y-3">
        {f.type === 'mf' ? (
          <label className="block"><span className="label">Scheme name (as on AMFI, e.g. "Parag Parikh Flexi Cap Fund - Direct Plan - Growth")</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
        ) : <>
          <SymbolSearch onPick={(r) => setF({ ...f, symbol: r.symbol, exchange: r.exchange, name: r.name })} />
          {f.symbol && <div className="text-sm">Selected: <b>{f.symbol}</b> ({f.exchange}) {f.name}</div>}
        </>}
        <div className="grid grid-cols-2 gap-3">
          <label><span className="label">{f.type === 'mf' ? 'Units' : 'Quantity'}</span><input className="input" inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} required /></label>
          <label><span className="label">{f.type === 'mf' ? 'Avg NAV (₹)' : 'Avg price (₹)'}</span><input className="input" inputMode="decimal" value={f.avgPrice} onChange={(e) => setF({ ...f, avgPrice: e.target.value })} required /></label>
        </div>
        <label className="block"><span className="label">Buy date (optional, for XIRR)</span><input className="input" type="date" value={f.buyDate} onChange={(e) => setF({ ...f, buyDate: e.target.value })} /></label>
      </div>
      <button className="btn-primary mt-3 w-full" disabled={f.type !== 'mf' && !f.symbol}>Add</button>
      {msg && <div className="mt-2 text-sm">{msg}</div>}
    </form>
  );
}

function Purification() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['purification'], queryFn: () => api.get('/purification') });
  const [f, setF] = useState({ symbol: '', amount: '', date: '' });
  const [calc, setCalc] = useState({ amount: '', pct: '' });
  const add = async (e) => { e.preventDefault(); await api.post('/dividends', f); setF({ symbol: f.symbol, amount: '', date: '' }); qc.invalidateQueries({ queryKey: ['purification'] }); };
  return (
    <div className="card p-4">
      <h2 className="font-semibold">☪ Dividend purification</h2>
      <p className="mt-1 text-xs text-ink2">Amount to give in charity = dividend received × company's impure-income share (interest income ÷ revenue). Record dividends as you receive them.</p>
      <div className="mt-3 rounded-xl bg-card2 p-3">
        <div className="text-xs font-semibold">Quick calculator</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input className="input" inputMode="decimal" placeholder="Dividend ₹" value={calc.amount} onChange={(e) => setCalc({ ...calc, amount: e.target.value })} aria-label="Dividend amount" />
          <input className="input" inputMode="decimal" placeholder="Impure %" value={calc.pct} onChange={(e) => setCalc({ ...calc, pct: e.target.value })} aria-label="Impure income percent" />
        </div>
        <div className="mt-2 text-sm">Give in charity: <b className="num">{calc.amount && calc.pct ? inr((Number(calc.amount) * Number(calc.pct)) / 100, 2) : '—'}</b></div>
      </div>
      <form className="mt-3 grid grid-cols-3 gap-2" onSubmit={add}>
        <select className="input col-span-3" value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} required aria-label="Stock">
          <option value="">Record a dividend for…</option>{data?.items?.map((i) => <option key={i.symbol} value={i.symbol}>{i.symbol} — {i.name}</option>)}
        </select>
        <input className="input col-span-1" inputMode="decimal" placeholder="₹ amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required aria-label="Amount" />
        <input className="input col-span-1" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Date" />
        <button className="btn-ghost col-span-1">Add</button>
      </form>
      {data && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted"><th className="py-1">Stock</th><th>Status</th><th className="text-right">Impure %</th><th className="text-right">Dividends</th><th className="text-right">To purify</th></tr></thead>
            <tbody>{data.items.map((i) => <tr key={i.symbol} className="border-t border-line"><td className="py-1.5 font-semibold">{i.symbol}</td><td><ShariahBadge status={i.status} compact /></td><td className="num text-right">{i.purificationPct != null ? i.purificationPct.toFixed(2) + '%' : '—'}</td><td className="num text-right">{inr(i.received, 2)}</td><td className="num text-right font-semibold">{i.purify != null ? inr(i.purify, 2) : '—'}</td></tr>)}</tbody>
            <tfoot><tr className="border-t border-line font-bold"><td colSpan={4} className="py-1.5">Total to give</td><td className="num text-right">{inr(data.total, 2)}</td></tr></tfoot>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">When interest income isn't reported separately, "other income" is used as an upper bound. Ask your scholar about purifying capital gains.</p>
    </div>
  );
}

function Notifications() {
  const { data: st } = useStatus();
  const [msg, setMsg] = useState('');
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  return (
    <div className="card p-4">
      <h2 className="font-semibold">🔔 Notifications &amp; email</h2>
      <p className="mt-1 text-xs text-ink2">Browser notification status: <b>{perm}</b>{!window.isSecureContext && ' · Phone push needs HTTPS (see README: Tailscale / Cloudflare Tunnel). Alerts still appear in 🔔 and while the app is open.'}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!notificationsSupported()} onClick={async () => { try { const r = await enableNotifications(st?.pushKey); setMsg(r.pushOk ? 'Notifications enabled, including push when the app is closed ✓' : 'Notifications enabled while the app is open ✓'); } catch (e) { setMsg(e.message); } }}>Enable notifications</button>
        <button className="btn-ghost" onClick={async () => { await api.post('/push/test'); setMsg('Test alert sent — check 🔔'); }}>Send test alert</button>
      </div>
      <div className="mt-4 border-t border-line pt-3 text-sm">
        Evening email summary: {st?.email ? <b className="text-up">configured ✓</b> : <b className="text-warn">not configured</b>}
        <p className="text-xs text-ink2">{st?.email ? 'Sent on trading days at the time below.' : 'Add GMAIL_USER, GMAIL_APP_PASSWORD and EMAIL_TO to your .env file, then restart.'}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a className="btn-ghost" href="/api/email/preview" target="_blank" rel="noopener noreferrer">Preview email</a>
          {st?.email && <button className="btn-ghost" onClick={async () => { try { await api.post('/email/test'); setMsg('Email sent ✓'); } catch (e) { setMsg(e.message); } }}>Send now</button>}
        </div>
      </div>
      {msg && <div className="mt-2 text-sm">{msg}</div>}
    </div>
  );
}

function Preferences() {
  const qc = useQueryClient();
  const { data: s } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings') });
  const [f, setF] = useState(null);
  const { theme, setTheme } = useTheme();
  const [msg, setMsg] = useState('');
  useEffect(() => { if (s) setF(s); }, [s]);
  if (!f) return null;
  const sh = f.shariah;
  const save = async () => { await api.put('/settings', f); setMsg('Saved ✓ — re-screening in background'); qc.invalidateQueries(); };
  return (
    <div className="card p-4">
      <h2 className="font-semibold">Preferences</h2>
      <div className="mt-3"><span className="label">Theme</span><div className="seg">{[['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => <button key={k} aria-pressed={theme === k} onClick={() => setTheme(k)}>{l}</button>)}</div></div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label><span className="label">Big-move alert (± %)</span><input className="input" inputMode="decimal" value={f.moveAlertPct} onChange={(e) => setF({ ...f, moveAlertPct: e.target.value })} /></label>
        <label><span className="label">Evening email time (IST)</span><input className="input" type="time" value={f.summaryTime} onChange={(e) => setF({ ...f, summaryTime: e.target.value })} /></label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.emailEnabled} onChange={(e) => setF({ ...f, emailEnabled: e.target.checked })} /> Send evening email</label>
      <div className="mt-4 text-sm font-semibold">Shariah thresholds</div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {[['debtLimit', 'Debt / market cap < %'], ['interestIncomeLimit', 'Interest income / revenue < %'], ['cashLimit', 'Cash / market cap < %'], ['receivablesLimit', 'Receivables / market cap < %']].map(([k, l]) => (
          <label key={k}><span className="label">{l}</span><input className="input" inputMode="decimal" value={sh[k]} onChange={(e) => setF({ ...f, shariah: { ...sh, [k]: e.target.value } })} /></label>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted">Defaults follow S&amp;P/TASIS-style screens. AAOIFI uses 30% for debt and cash.</p>
      <button className="btn-primary mt-3 w-full" onClick={save}>Save preferences</button>
      {msg && <div className="mt-2 text-sm">{msg}</div>}
    </div>
  );
}

function About() {
  const { data: st } = useStatus();
  return (
    <div className="card p-4 text-xs text-ink2">
      <h2 className="mb-1 text-sm font-semibold text-ink">About &amp; safety</h2>
      <ul className="list-disc space-y-1 pl-4">
        <li><b>Read-only.</b> This app never places, modifies or cancels trades and has no broker login.</li>
        <li>Your data lives only in the <code>data/</code> folder on your computer. <a className="text-brand" href="/api/export">Download a backup</a>.</li>
        <li>Data: Yahoo Finance (prices, ~1–2 min delayed), NSE (breadth, FII/DII, corporate actions), AMFI (MF NAV), Google News / ET / Moneycontrol RSS (news). All free, unofficial where noted.</li>
        <li>Mode: <b>{st?.demo ? 'Demo data' : 'Live data'}</b> · Universe analysed: {st?.crawl?.analysed ?? 0}</li>
        <li>Scores, entry zones and Shariah screening are guides only, not investment or religious advice.</li>
      </ul>
    </div>
  );
}
