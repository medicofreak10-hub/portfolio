// Map app symbols to Yahoo tickers.
export const INDICES = [
  { key: 'NIFTY', name: 'NIFTY 50', yahoo: '^NSEI' },
  { key: 'SENSEX', name: 'SENSEX', yahoo: '^BSESN' },
  { key: 'BANKNIFTY', name: 'BANK NIFTY', yahoo: '^NSEBANK' },
  { key: 'INDIAVIX', name: 'India VIX', yahoo: '^INDIAVIX' },
];

export function yahooTicker(symbol, exchange = 'NSE') {
  if (!symbol) return symbol;
  if (symbol.startsWith('^') || symbol.includes('.')) return symbol;
  const idx = INDICES.find((i) => i.key === symbol);
  if (idx) return idx.yahoo;
  return exchange === 'BSE' ? `${symbol}.BO` : `${symbol}.NS`;
}
