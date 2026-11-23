// Lightweight, offline finance-headline sentiment (no paid AI). Lexicon + phrase rules.
const POS = ['surge', 'surges', 'soar', 'soars', 'jump', 'jumps', 'rally', 'rallies', 'gain', 'gains', 'rise', 'rises', 'climb', 'up', 'upgrade', 'upgraded', 'beat', 'beats', 'record', 'high', 'profit rises', 'profit jumps', 'growth', 'strong', 'bullish', 'buy', 'outperform', 'order win', 'bags', 'wins', 'secures', 'bagged', 'approval', 'approves', 'expansion', 'expands', 'acquire', 'acquisition', 'dividend', 'bonus', 'buyback', 'robust', 'boost', 'boosts', 'positive', 'recovery', 'rebounds', 'rebound', 'target raised', 'raises target', 'contract', 'partnership', 'launches', 'milestone', 'upside', 'top gainer', 'all-time high', 'multibagger', 'healthy', 'turnaround', 'margin expansion', 'inflows', 'net buyers'];
const NEG = ['fall', 'falls', 'drop', 'drops', 'plunge', 'plunges', 'slump', 'slumps', 'crash', 'tumble', 'tumbles', 'decline', 'declines', 'slide', 'slides', 'down', 'downgrade', 'downgraded', 'miss', 'misses', 'loss', 'losses', 'weak', 'bearish', 'sell', 'underperform', 'probe', 'penalty', 'fine', 'fraud', 'raid', 'sebi notice', 'default', 'pledge', 'resigns', 'resignation', 'concern', 'warning', 'cut', 'cuts', 'lower', 'slowdown', 'pressure', 'litigation', 'lawsuit', 'ban', 'recall', 'outflows', 'net sellers', 'top loser', '52-week low', 'profit falls', 'profit declines', 'margin contraction', 'target cut', 'block deal', 'stake sale', 'offloads', 'exits', 'selloff', 'sell-off', 'volatile', 'fear'];

function count(text, list) {
  let n = 0;
  for (const w of list) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(text)) n += w.includes(' ') ? 2 : 1;
  }
  return n;
}

export function sentiment(title = '') {
  const t = title.toLowerCase();
  let p = count(t, POS), n = count(t, NEG);
  if (/\bnot\b|\bfails? to\b/.test(t)) [p, n] = [n * 0.5, n + p * 0.5];
  const score = p - n;
  return { label: score > 0 ? 'Positive' : score < 0 ? 'Negative' : 'Neutral', score };
}

const CA = [
  [/q[1-4]\s?(fy)?\d*\s*results?|quarterly results|results date|earnings|financial results/i, 'Results'],
  [/dividend/i, 'Dividend'],
  [/stock split|sub-division|split/i, 'Split'],
  [/bonus issue|bonus shares|\bbonus\b/i, 'Bonus'],
  [/board meeting|board to consider|board approves/i, 'Board meeting'],
  [/buyback|buy-back/i, 'Buyback'],
  [/rights issue/i, 'Rights'],
];
export function corporateTag(title = '') {
  for (const [re, tag] of CA) if (re.test(title)) return tag;
  return null;
}
