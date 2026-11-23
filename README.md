# My Halal Portfolio

A personal, **read-only** stock portfolio tracker for Indian markets (NSE/BSE) with Shariah screening, live prices, news, entry zones and stock scores. It runs on your own computer, and you open it on your phone as an app.

> This app never places trades and has no broker login. Your data stays in the `data/` folder on your computer.
> Scores, entry zones and Shariah status are guides only. They are not investment or religious advice.

## Features
- **Holdings**: imports Groww (stocks, mutual funds, order history) and Zerodha (Kite or Console holdings, tradebook) exports. You can also add or edit holdings by hand. Covers stocks, ETFs and mutual funds (NAV from AMFI). Shows quantity, average price, live price, value, day change, P&L in ₹ and %, and XIRR.
- **Live tracking**: prices refresh every minute from 9:15 to 15:30 IST, with "Market closed" shown at other times. NIFTY 50, SENSEX, BANK NIFTY and India VIX sit at the top. Prices flash green or red when they change. Each holding has an intraday sparkline, and the full chart covers 1D/1W/1M/1Y/5Y with 20/50/200 DMA, candles and entry-zone lines.
- **Market Mood Index**: shows Tickertape's MMI when it can be reached. Otherwise the app calculates its own **"Mood Index (calculated)"** from VIX, NIFTY vs its 50/200 DMA, advance/decline, FII/DII flows and gold-vs-equity returns. It shows a speedometer gauge, a 30-day history chart and a one-line tip.
- **News**: news for each stock you hold plus Indian market news, each tagged Positive, Negative or Neutral. Results, dividends, splits, bonuses and board meetings are highlighted.
- **Shariah screening**: each stock is marked Compliant, Non-compliant or Doubtful. Checks are business activity, debt / market cap < 33%, interest income < 5%, and cash and receivables limits (you can change these thresholds). You get an alert when a status changes. You can override a status yourself. Includes a dividend purification calculator.
- **Entry zones**: built from support levels, DMAs, RSI and swing lows. Shows the zone, stop-loss, Target 1 and Target 2, and risk:reward, with a 🟢🟡🔵🟠🔴 status badge.
- **Scores**: Multibagger potential (0–100, with a full breakdown), Piotroski F-Score, Altman Z, Magic Formula, CAN SLIM and Coffee Can.
- **Alternatives and Discover**: Shariah-compliant peers in the same sector with higher scores, a swap suggestion when a stock is weak, and the top 20 compliant small and mid caps.
- **Alerts**: target, stop-loss, ±5% moves, entering an entry zone, Shariah status changes, score changes and news. They arrive as browser or phone notifications, plus an evening email summary.
- **Design**: mobile-first, dark and light mode, Indian number format (₹1,23,456), IST times, colour-blind-friendly ▲▼ arrows, heat-map view, and installable as an app (PWA).

## Data sources (all free)
| Data | Source | Notes |
|---|---|---|
| Stock/ETF/index prices, charts | Yahoo Finance (unofficial) | About 1–2 minutes delayed |
| Fundamentals | Yahoo Finance + optional Screener.in Excel export | Yahoo has about 4 years of Indian financials. Upload a Screener export on a stock's page for 10 years. |
| Mutual fund NAV | AMFI (official) + mfapi.in | Updated once a day |
| Breadth, FII/DII, corporate actions, holidays | NSE website (unofficial) | Sometimes blocks scripts. The app falls back to cached data. |
| News | Google News, Economic Times, Moneycontrol RSS | |
| Market Mood Index | Tickertape (unofficial endpoint) → calculated fallback | |

**Optional paid upgrades (not needed):** Zerodha Kite Connect (about ₹500/month) for tick-by-tick prices and automatic holdings sync. Trendlyne, Tijori or EODHD for clean 10-year fundamentals.

---

## How to run it (step by step)

### 1. Install Node.js (one time)
Download the **LTS** version (20 or newer) from https://nodejs.org and install it. To check, open a terminal (Windows: *Command Prompt*; Mac: *Terminal*) and type `node -v`.

### 2. Get the code
```bash
git clone https://github.com/medicofreak10-hub/portfolio.git
cd portfolio
git checkout claude/sleepy-ptolemy-fzqbzg   # until this branch is merged
```

### 3. Install and build (one time, and again after each update)
```bash
npm run setup
```

### 4. Create your settings file
```bash
# Mac / Linux
cp .env.example .env
# Windows
copy .env.example .env
```
Open `.env` in a text editor. At minimum, set an **APP_PIN** (for example `APP_PIN=4826`) so nobody else on your Wi-Fi can open the app. Email settings are covered below.

### 5. Start the app
```bash
npm start
```
The terminal prints something like:
```
On this computer:  http://localhost:8080
On your phone (same Wi-Fi): http://192.168.1.23:8080
```
Open the first link on your computer.

### 6. Import your holdings
In the app go to ⚙️ **Settings → Import holdings → Choose files** and select all your exports at once:
- Groww: *Stocks Holdings Statement*, *Stocks Order History* and *Mutual Funds Holdings Statement* (.xlsx)
- Zerodha: Kite → Holdings → Download, or Console → Holdings / Tradebook

GOLDCASE and NIFTYBEES start in the **Watchlist**. Your order history shows them as sold, so they are not in your holdings. To add them as holdings, use **Settings → Add holding manually**.

The app then analyses about 120 stocks for Discover in the background. This takes about 5 minutes the first time.

### 7. Open it on your phone
**Quick way (same Wi-Fi):** connect your phone to the same Wi-Fi as the computer and open the "On your phone" address in Chrome or Safari.

**To install it as an app and get notifications when it's closed**, the browser needs **HTTPS**. The easiest free, private way is **Tailscale**:
1. Install Tailscale on your computer and phone (https://tailscale.com/download) and sign in with the same account on both.
2. On the computer, run: `tailscale serve --bg 8080`
3. It prints an address like `https://my-laptop.tail1234.ts.net`. Open it on your phone. This also works away from home on mobile data.
4. **Android (Chrome):** menu ⋮ → *Install app* / *Add to Home screen*.
   **iPhone (Safari):** Share → *Add to Home Screen*. Then open the app from the Home Screen icon. On iPhone, notifications only work from the installed app (iOS 16.4+).
5. In the app: ⚙️ Settings → **Enable notifications** → **Send test alert**.

(Alternative: `cloudflared tunnel --url http://localhost:8080` gives a public HTTPS link. If you use it, **always** set `APP_PIN`.)

> The computer must stay on and `npm start` must keep running for live updates, alerts and the evening email. Your phone shows the last loaded data when offline.

### 8. Evening email (Gmail)
1. Turn on 2-Step Verification on your Google account.
2. Go to Google Account → Security → **App passwords**, create one called "Portfolio", and copy the 16-character password.
3. In `.env`:
   ```
   GMAIL_USER=yourname@gmail.com
   GMAIL_APP_PASSWORD=abcdabcdabcdabcd
   EMAIL_TO=yourname@gmail.com
   ```
4. Restart `npm start`. Use Settings → **Preview email** / **Send now** to test. It is sent on trading days at 18:00 IST by default; you can change the time in Settings.

### Updating later
```bash
git pull
npm run setup
npm start
```

---

## Other commands
| Command | What it does |
|---|---|
| `npm run demo` | Runs with **synthetic demo data** (offline testing). A yellow banner says so. |
| `npm run dev` | Development mode with hot reload (opens on port 5173) |
| `npm test` | Runs the automated tests |
| `npm run vapid` | Generates fixed push-notification keys for `.env` (optional; otherwise they are created automatically in `data/`) |

## Privacy and safety
- **Read-only**: there is no order or trade code anywhere, and the tests check that no such endpoint exists.
- Keys and passwords belong in `.env` only. `.env`, `data/` and any `.xlsx`/`.csv` broker exports are in `.gitignore`, so they are never committed.
- All data (holdings, trades, alerts) is stored in `data/db.json` on your computer. Back it up from Settings → *Download a backup*.
- Only market data is fetched from the sources above. Your holdings are never sent anywhere.

## Limitations to know
- Yahoo and NSE endpoints are unofficial and can change or rate-limit. When they fail, the app shows the last known data.
- Shariah screening is computed from Yahoo/Screener financials and may differ from official screeners. Use the override if your scholar says otherwise. Gold ETFs are marked Doubtful and conventional index ETFs and mutual funds are marked Non-compliant, each with the reason.
- XIRR marked with `*` is approximate when you bought shares before your trade history starts. Holdings under 2 months show no XIRR, because annualising such short periods is misleading.
- FII/DII *trend*, promoter pledge and shareholding history need paid data. The scores use what is freely available and show their data coverage.
