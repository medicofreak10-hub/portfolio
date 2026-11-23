import React, { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useLiveInterval } from '../lib/hooks.js';
import { useTheme } from '../lib/theme.js';
import { inrP, istDate, istTime } from '../lib/format.js';

const RANGES = [['1d', '1D'], ['5d', '1W'], ['1mo', '1M'], ['1y', '1Y'], ['5y', '5Y']];
const IST = 19800; // shift to show IST on the UTC time axis
const DMA = [['sma20', '#2a78d6', '20 DMA'], ['sma50', '#eb6834', '50 DMA'], ['sma200', '#6250d6', '200 DMA']];

export default function PriceChart({ symbol, entry }) {
  const [range, setRange] = useState('1y');
  const [candles, setCandles] = useState(false);
  const el = useRef(null);
  const { isDark } = useTheme();
  const interval = useLiveInterval();
  const [hover, setHover] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ['hist', symbol, range], queryFn: () => api.get(`/stock/${symbol}/history?range=${range}`), refetchInterval: range === '1d' ? interval : false });

  useEffect(() => {
    if (!el.current || !data?.bars?.length) return;
    const css = getComputedStyle(document.documentElement);
    const chart = createChart(el.current, {
      height: 280, autoSize: true,
      layout: { background: { color: css.getPropertyValue('--chart-bg').trim() || 'transparent' }, textColor: css.getPropertyValue('--chart-text').trim(), fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: css.getPropertyValue('--chart-grid').trim() } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: data.intraday, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal }, handleScroll: { vertTouchDrag: false },
      localization: { priceFormatter: (p) => '₹' + p.toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
    });
    const bars = data.bars.map((b) => ({ time: Math.floor(b.t / 1000) + IST, open: b.o, high: b.h, low: b.l, close: b.c, value: b.c }));
    const dedup = bars.filter((b, i) => i === 0 || b.time > bars[i - 1].time);
    const up = dedup[dedup.length - 1].close >= dedup[0].close;
    const upC = css.getPropertyValue('--up').trim().split(' ').join(','), dnC = css.getPropertyValue('--down').trim().split(' ').join(',');
    let main;
    if (candles && !data.line) {
      main = chart.addCandlestickSeries({ upColor: `rgb(${upC})`, downColor: `rgb(${dnC})`, borderVisible: false, wickUpColor: `rgb(${upC})`, wickDownColor: `rgb(${dnC})` });
      main.setData(dedup);
    } else {
      const c = up ? upC : dnC;
      main = chart.addAreaSeries({ lineColor: `rgb(${c})`, topColor: `rgba(${c},0.25)`, bottomColor: `rgba(${c},0.02)`, lineWidth: 2 });
      main.setData(dedup.map(({ time, value }) => ({ time, value })));
    }
    for (const [k, color] of DMA) {
      if (!data[k]) continue;
      const s = chart.addLineSeries({ color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(data.bars.map((b, i) => ({ time: Math.floor(b.t / 1000) + IST, value: data[k][i] })).filter((p, i, a) => p.value != null && (i === 0 || p.time > a[i - 1].time)));
    }
    if (entry?.available && !data.intraday) {
      main.createPriceLine({ price: entry.zoneHigh, color: '#0ca30c', lineWidth: 1, lineStyle: 2, title: 'Entry ↑' });
      main.createPriceLine({ price: entry.zoneLow, color: '#0ca30c', lineWidth: 1, lineStyle: 2, title: 'Entry ↓' });
      main.createPriceLine({ price: entry.stopLoss, color: '#d03b3b', lineWidth: 1, lineStyle: 2, title: 'SL' });
    }
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((p) => {
      if (!p?.time || !p.seriesData) return setHover(null);
      const d = p.seriesData.get(main);
      setHover(d ? { t: (p.time - IST) * 1000, v: d.close ?? d.value } : null);
    });
    return () => chart.remove();
  }, [data, candles, isDark, entry]);

  const last = data?.bars?.[data.bars.length - 1], first = data?.bars?.[0];
  const chg = last && first ? ((last.c - first.c) / first.c) * 100 : null;
  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="seg flex-1" role="group" aria-label="Chart range">
          {RANGES.map(([k, l]) => <button key={k} aria-pressed={range === k} onClick={() => setRange(k)}>{l}</button>)}
        </div>
        {!data?.line && <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setCandles((c) => !c)} aria-pressed={candles}>{candles ? 'Line' : 'Candles'}</button>}
      </div>
      <div className="mb-1 flex h-5 items-center gap-3 text-xs text-ink2">
        {hover ? <span className="num">{data.intraday ? istTime(hover.t) : istDate(hover.t)} · <b className="text-ink">{inrP(hover.v)}</b></span>
          : chg != null && <span className={`num ${chg >= 0 ? 'text-up' : 'text-down'}`}>{chg >= 0 ? '▲' : '▼'} {chg.toFixed(2)}% in {RANGES.find((r) => r[0] === range)[1]}</span>}
        {!data?.intraday && !data?.line && <span className="ml-auto flex gap-2">{DMA.map(([k, c, l]) => <span key={k} className="flex items-center gap-1"><i className="inline-block h-0.5 w-3" style={{ background: c }} />{l}</span>)}</span>}
      </div>
      <div ref={el} className="h-[280px] w-full">{isLoading && <div className="pt-24 text-center text-sm text-muted">Loading chart…</div>}</div>
      {data && !data.bars?.length && <div className="text-center text-sm text-muted">No chart data.</div>}
    </div>
  );
}
