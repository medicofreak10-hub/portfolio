import React, { useEffect, useRef, useState } from 'react';
import { arrow, pct, tone, inrP } from '../lib/format.js';

export function Change({ value, pctValue, className = '', size = 'sm', showAbs = true, scale = 5 }) {
  const t = tone(pctValue ?? value, scale);
  return (
    <span className={`num ${t.cls} ${className}`} style={{ fontWeight: t.weight }}>
      {arrow(pctValue ?? value)} {showAbs && value != null ? inrP(Math.abs(value)) + ' ' : ''}{pctValue != null ? `(${pct(pctValue)})` : ''}
    </span>
  );
}

export function ChangePill({ pctValue, scale = 5 }) {
  const t = tone(pctValue, scale);
  return <span className={`chip num ${t.cls}`} style={{ background: t.bg, fontWeight: t.weight }}>{arrow(pctValue)} {pct(pctValue)}</span>;
}

// Price that flashes green/red when it changes.
export function FlashPrice({ value, render, className = '' }) {
  const prev = useRef(value);
  const [cls, setCls] = useState('');
  useEffect(() => {
    if (prev.current != null && value != null && value !== prev.current) {
      setCls(value > prev.current ? 'flash-up' : 'flash-down');
      const t = setTimeout(() => setCls(''), 1250);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return <span className={`num px-0.5 ${cls} ${className}`}>{render ? render(value) : value}</span>;
}

const SH = {
  Compliant: { icon: '✓', cls: 'text-up', bg: 'rgb(var(--up) / 0.12)' },
  'Non-compliant': { icon: '✕', cls: 'text-down', bg: 'rgb(var(--down) / 0.12)' },
  Doubtful: { icon: '?', cls: 'text-warn', bg: 'rgb(var(--warn) / 0.15)' },
};
export function ShariahBadge({ status, compact = false }) {
  if (!status) return <span className="chip bg-card2 text-muted">☪ …</span>;
  const s = SH[status] || SH.Doubtful;
  return <span className={`chip ${s.cls}`} style={{ background: s.bg }} title={`Shariah: ${status}`}>☪ {s.icon}{compact ? '' : ' ' + status}</span>;
}

const EZ = {
  in: { cls: 'text-up', bg: 'rgb(var(--up) / 0.12)' },
  near: { cls: 'text-warn', bg: 'rgb(var(--warn) / 0.15)' },
  wait: { cls: 'text-brand', bg: 'rgb(42 120 214 / 0.12)', style: { color: '#2a78d6' } },
  overbought: { cls: 'text-serious', bg: 'rgb(var(--serious) / 0.15)' },
  exit: { cls: 'text-down', bg: 'rgb(var(--down) / 0.12)' },
};
export function EntryBadge({ entry, compact = false }) {
  if (!entry) return null;
  const s = EZ[entry.status] || EZ.wait;
  return <span className={`chip ${s.cls}`} style={{ background: s.bg, ...(s.style || {}) }} title={entry.label}>{entry.emoji} {compact ? shortEntry(entry.status) : entry.label}</span>;
}
const shortEntry = (s) => ({ in: 'Entry zone', near: 'Near zone', wait: 'Wait', overbought: 'Overbought', exit: 'Exit warning' }[s] || s);

export function SentimentChip({ s }) {
  const m = { Positive: ['▲', 'text-up', 'rgb(var(--up) / 0.12)'], Negative: ['▼', 'text-down', 'rgb(var(--down) / 0.12)'], Neutral: ['■', 'text-flat', 'rgb(var(--flat) / 0.15)'] }[s] || ['■', 'text-flat', 'rgb(var(--flat) / 0.15)'];
  return <span className={`chip ${m[1]}`} style={{ background: m[2] }}>{m[0]} {s}</span>;
}

export function RsiBar({ rsi }) {
  if (rsi == null) return <span className="text-xs text-muted">RSI —</span>;
  const color = rsi < 30 ? 'rgb(var(--up))' : rsi > 70 ? 'rgb(var(--down))' : 'rgb(var(--flat))';
  const label = rsi < 30 ? 'oversold' : rsi > 70 ? 'overbought' : 'normal';
  return (
    <div className="flex items-center gap-2" title={`RSI ${rsi.toFixed(0)} (${label})`}>
      <span className="w-14 text-xs text-ink2">RSI <b className="num text-ink">{rsi.toFixed(0)}</b></span>
      <div className="relative h-1.5 flex-1 rounded-full bg-card2">
        <div className="absolute inset-y-0 left-[30%] right-[30%] bg-line" />
        <div className="absolute -top-1 h-3.5 w-1 rounded-full" style={{ left: `calc(${Math.min(100, Math.max(0, rsi))}% - 2px)`, background: color }} />
      </div>
      <span className="text-[10px] text-muted">{rsi < 30 ? '▼ ' : rsi > 70 ? '▲ ' : ''}{label}</span>
    </div>
  );
}

export function scoreColor(score) {
  if (score == null) return 'rgb(var(--flat))';
  return score >= 80 ? '#0ca30c' : score >= 60 ? '#e0a000' : score >= 40 ? '#ec835a' : '#d03b3b';
}
export function scoreEmoji(score) { return score == null ? '⚪' : score >= 80 ? '🟢' : score >= 60 ? '🟡' : score >= 40 ? '🟠' : '🔴'; }

export function ScoreRing({ score, size = 44, label, max = 100, display, onClick }) {
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  const norm = score == null ? 0 : Math.max(0, Math.min(1, score / max));
  const col = scoreColor(max === 100 ? score : norm * 100);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className="flex flex-col items-center gap-0.5" aria-label={`${label || 'Score'} ${score ?? 'n/a'}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--card2))" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${norm * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" fontSize={size * 0.3} fontWeight="700" fill="rgb(var(--ink))">{display ?? (score == null ? '–' : score)}</text>
      </svg>
      {label && <span className="text-[10px] leading-tight text-ink2">{label}</span>}
    </Tag>
  );
}

export function Sparkline({ data, width = 84, height = 30 }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`).join(' ');
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={up ? 'rgb(var(--up))' : 'rgb(var(--down))'} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-5 pb-8 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button className="rounded-full bg-card2 px-3 py-1 text-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" />{label}</div>;
}
export function Empty({ title, children }) {
  return <div className="card p-6 text-center"><div className="font-semibold">{title}</div><div className="mt-1 text-sm text-ink2">{children}</div></div>;
}
export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="card border-down/40 p-4 text-sm text-down">⚠ {String(error.message || error)}</div>;
}
export function Disclaimer({ children }) {
  return <p className="mt-2 px-1 text-[11px] leading-snug text-muted">{children}</p>;
}
export function Stat({ label, value, sub, className = '' }) {
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="num text-base font-semibold">{value}</div>
      {sub && <div className="text-xs text-ink2">{sub}</div>}
    </div>
  );
}
