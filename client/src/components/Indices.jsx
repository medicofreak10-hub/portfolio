import React from 'react';
import { useLive } from '../lib/hooks.js';
import { FlashPrice, ChangePill } from './ui.jsx';
import { num } from '../lib/format.js';

export default function Indices() {
  const { data } = useLive('indices', '/indices');
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {(data || [{ key: 'NIFTY', name: 'NIFTY 50' }, { key: 'SENSEX', name: 'SENSEX' }, { key: 'BANKNIFTY', name: 'BANK NIFTY' }, { key: 'INDIAVIX', name: 'India VIX' }]).map((i) => (
        <div key={i.key} className="card px-3 py-2">
          <div className="text-[11px] font-semibold text-ink2">{i.name}</div>
          <div className="text-lg font-bold"><FlashPrice value={i.price} render={(v) => (v == null ? '—' : num(v, 2))} /></div>
          {/* VIX up = more fear; colour still follows direction, arrow shows it */}
          <ChangePill pctValue={i.changePct} scale={2} />
        </div>
      ))}
    </div>
  );
}
