import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { inr } from '../lib/format.js';

// Categorical palette in fixed order (validated light/dark steps); 8+ slices fold into "Other".
const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'];
const OTHER = '#898781';

function fold(items, max = 7) {
  if (items.length <= max) return items;
  const head = items.slice(0, max - 1);
  const rest = items.slice(max - 1);
  return [...head, { name: 'Other', value: rest.reduce((s, x) => s + x.value, 0), pct: rest.reduce((s, x) => s + x.pct, 0) }];
}

export default function Split({ title, items, isDark }) {
  const data = fold((items || []).filter((x) => x.value > 0));
  const pal = isDark ? DARK : LIGHT;
  const colorOf = (d, i) => (d.name === 'Other' ? OTHER : pal[i % pal.length]);
  return (
    <div className="card min-w-0 p-3">
      <div className="mb-1 text-sm font-semibold">{title}</div>
      <div className="flex items-center gap-3">
        <div className="h-32 w-32 shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="100%" paddingAngle={1.5} stroke="var(--chart-bg)" strokeWidth={2} isAnimationActive>
                {data.map((d, i) => <Cell key={d.name} fill={colorOf(d, i)} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [inr(v), n]} contentStyle={{ background: 'var(--chart-bg)', border: '1px solid var(--chart-grid)', borderRadius: 8, fontSize: 12 }} itemStyle={{ color: 'var(--chart-text)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="min-w-0 flex-1 space-y-1 text-xs">
          {data.map((d, i) => (
            <li key={d.name} className="flex items-center gap-2">
              <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorOf(d, i) }} />
              <span className="truncate text-ink2">{d.name}</span>
              <span className="num ml-auto font-semibold">{d.pct.toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
