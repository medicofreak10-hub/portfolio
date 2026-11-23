import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, Treemap } from 'recharts';
import { pct, arrow } from '../lib/format.js';

// Tile size = value; colour = today's % change (diverging green/red, grey at 0). Arrows keep it colour-blind safe.
function colorFor(p) {
  if (p == null) return 'rgb(var(--card2))';
  const k = Math.min(Math.abs(p) / 4, 1);
  if (Math.abs(p) < 0.05) return '#7d7c76';
  const [r, g, b] = p > 0 ? [12, 140, 12] : [208, 59, 59];
  const mix = (c) => Math.round(125 + (c - 125) * (0.35 + 0.65 * k));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function Tile(props) {
  const { x, y, width, height, name, changePct, onPick, symbol } = props;
  if (width <= 0 || height <= 0) return null;
  const small = width < 60 || height < 36;
  return (
    <g onClick={() => onPick?.(symbol)} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={width} height={height} fill={colorFor(changePct)} stroke="var(--chart-bg)" strokeWidth={2} rx={6} />
      {!small && <text x={x + 6} y={y + 16} fill="#fff" fontSize={12} fontWeight={700}>{String(name).slice(0, Math.floor(width / 7.5))}</text>}
      {width > 40 && height > 22 && <text x={x + 6} y={y + (small ? 15 : 32)} fill="#fff" fontSize={11}>{arrow(changePct)} {pct(changePct, 1)}</text>}
    </g>
  );
}

export default function HeatMap({ rows }) {
  const nav = useNavigate();
  const data = rows.filter((r) => r.value > 0).map((r) => ({ name: r.type === 'mf' ? r.name.split(' ').slice(0, 2).join(' ') : r.symbol, symbol: r.symbol, size: r.value, changePct: r.changePct }));
  return (
    <div className="card p-2">
      <div className="h-72">
        <ResponsiveContainer>
          <Treemap data={data} dataKey="size" isAnimationActive={false} content={<Tile onPick={(s) => nav(`/stock/${s}`)} />} />
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-ink2">
        <span>▼ −4%</span>
        <span className="h-2 w-28 rounded" style={{ background: `linear-gradient(90deg, ${colorFor(-4)}, ${colorFor(-1)}, #7d7c76, ${colorFor(1)}, ${colorFor(4)})` }} />
        <span>+4% ▲</span>
        <span className="ml-2">size = value</span>
      </div>
    </div>
  );
}
