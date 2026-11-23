import React, { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, CartesianGrid } from 'recharts';
import { useLive } from '../lib/hooks.js';

export const ZONES = [
  { from: 0, to: 30, color: '#0a6b2f', label: 'Extreme Fear' },
  { from: 30, to: 50, color: '#6cc46c', label: 'Fear' },
  { from: 50, to: 70, color: '#f0932b', label: 'Greed' },
  { from: 70, to: 100, color: '#d03b3b', label: 'Extreme Greed' },
];
const zoneFor = (v) => ZONES.find((z) => v < z.to) || ZONES[3];

function polar(cx, cy, r, v) { const a = Math.PI * (1 - v / 100); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; }
function arc(cx, cy, r, a, b) { const [x1, y1] = polar(cx, cy, r, a), [x2, y2] = polar(cx, cy, r, b); return `M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`; }

export function Gauge({ value, size = 220 }) {
  const cx = size / 2, cy = size * 0.55, r = size * 0.42;
  const [nx, ny] = polar(cx, cy, r * 0.82, value ?? 50);
  return (
    <svg viewBox={`${-size * 0.07} 0 ${size * 1.14} ${size * 0.62}`} width="100%" style={{ maxWidth: size }} role="img" aria-label={`Mood ${value}`}>
      {ZONES.map((z) => <path key={z.label} d={arc(cx, cy, r, z.from + 0.6, z.to - 0.6)} stroke={z.color} strokeWidth={size * 0.075} fill="none" strokeLinecap="butt" />)}
      {[0, 30, 50, 70, 100].map((t) => { const [x, y] = polar(cx, cy, r + size * 0.07, t); return <text key={t} x={x} y={y} fontSize={size * 0.045} textAnchor="middle" fill="rgb(var(--muted))">{t}</text>; })}
      {value != null && <>
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="rgb(var(--ink))" strokeWidth="3" strokeLinecap="round" style={{ transition: 'all .8s' }} />
        <circle cx={cx} cy={cy} r={size * 0.03} fill="rgb(var(--ink))" />
      </>}
    </svg>
  );
}

export default function MoodGauge() {
  const { data, error } = useLive('mood', '/mood');
  const [showHist, setShowHist] = useState(false);
  if (error) return <div className="card p-4 text-sm text-ink2">Mood index unavailable right now.</div>;
  const v = data?.value;
  const z = v != null ? zoneFor(v) : null;
  const hist = data?.history || [];
  const prevClose = hist.length > 1 ? hist[hist.length - 2] : null;
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink2">{data?.label || 'Market Mood'}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="num text-4xl font-extrabold">{v ?? '—'}</span>
            {z && <span className="chip text-white" style={{ background: z.color }}>{z.label}</span>}
          </div>
          {prevClose && <div className="text-xs text-muted">Prev. close {prevClose.value} · {new Date(prevClose.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>}
        </div>
        <div className="w-[46%] max-w-[200px]"><Gauge value={v} /></div>
      </div>
      {data?.tip && <p className="mt-2 rounded-xl bg-card2 px-3 py-2 text-sm">💡 {data.tip}</p>}
      <button className="mt-2 text-xs font-semibold text-brand" onClick={() => setShowHist((s) => !s)}>{showHist ? 'Hide' : 'Show'} 30-day history {data && !data.official ? '& components' : ''}</button>
      {showHist && (
        <div className="mt-2">
          <div className="h-40">
            <ResponsiveContainer>
              <LineChart data={hist} margin={{ top: 6, right: 6, bottom: 0, left: -24 }}>
                {ZONES.map((zz) => <ReferenceArea key={zz.label} y1={zz.from} y2={zz.to} fill={zz.color} fillOpacity={0.08} />)}
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(8, 10) + '/' + d.slice(5, 7)} tick={{ fontSize: 10, fill: 'var(--chart-text)' }} minTickGap={24} />
                <YAxis domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} tick={{ fontSize: 10, fill: 'var(--chart-text)' }} />
                <Tooltip contentStyle={{ background: 'var(--chart-bg)', border: '1px solid var(--chart-grid)', borderRadius: 8, fontSize: 12 }} formatter={(val) => [val, 'Mood']} labelFormatter={(d) => new Date(d).toLocaleDateString('en-IN', { dateStyle: 'medium' })} />
                <Line type="monotone" dataKey="value" stroke="rgb(var(--ink))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {data?.components?.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              {data.components.map((c) => (
                <div key={c.name} className="rounded-lg bg-card2 px-2 py-1.5">
                  <div className="text-ink2">{c.name}</div>
                  <div className="num font-semibold">{typeof c.value === 'number' ? c.value.toFixed(2) : c.value} → <span style={{ color: zoneFor(c.score).color }}>{Math.round(c.score)}</span></div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted">{data?.official ? 'Source: Tickertape MMI.' : 'Calculated by this app from India VIX, NIFTY vs 50/200 DMA, advance/decline, FII/DII flows and equity-vs-gold returns. History before today is back-filled from VIX/NIFTY/gold only.'} 0–30 Extreme Fear · 30–50 Fear · 50–70 Greed · 70–100 Extreme Greed.</p>
        </div>
      )}
    </div>
  );
}
