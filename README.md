# NSE Intelligence Dashboard — 100% Free

## ✦ Everything here is FREE. Zero cost. No credit card.

| Component | Free Tool | Cost |
|-----------|-----------|------|
| Hosting | GitHub Pages | Free forever |
| Live market data | Yahoo Finance (via CORS proxy) | Free |
| NSE Options Chain | NSE API (via GAS proxy) | Free |
| Signal Engine | Built-in rule-based engine | Free |
| CORS Proxy | Google Apps Script | Free (Google account) |
| Charts | TradingView Lightweight Charts | Free (open source) |
| Indicators | TechnicalIndicators.js | Free (open source) |

---

## Deploy in 5 Minutes

### Step 1: GitHub Pages (2 min)
```bash
git init
git add index.html gas-proxy.gs README.md
git commit -m "NSE Intelligence Dashboard"
git remote add origin https://github.com/YOURUSERNAME/nse-dashboard.git
git push -u origin main
```
Go to **Repo Settings → Pages → Branch: main → Save**

Your URL: `https://YOURUSERNAME.github.io/nse-dashboard`

---

### Step 2: Free Google Apps Script Proxy for Live NSE Data (3 min)

This gives you 100% live data from NSE India including real options chain, FII/DII, and VIX.

1. Go to [script.google.com](https://script.google.com) (free Google account)
2. Click **New Project**
3. Delete all existing code in the editor
4. Open `gas-proxy.gs` from this zip and **copy all its contents**
5. Paste into the Google Apps Script editor
6. Click **Deploy → New Deployment**
7. Select type: **Web App**
8. Set **Execute as: Me**
9. Set **Who has access: Anyone**
10. Click **Deploy**
11. Copy the Web App URL (looks like `https://script.google.com/macros/s/AKfycb.../exec`)
12. Open your dashboard → click the **"Optional: Add Your Free Google Apps Script Proxy"** section
13. Paste the URL → click **Save**

That's it. The dashboard will now fetch real-time NSE data for free through your Google Apps Script.

**Google Apps Script limits (free tier):**
- 6 minutes execution per call (more than enough)
- 20,000 URL fetch calls per day (more than enough)
- No cost, no credit card

---

## How the Signal Engine Works (No AI API Needed)

The **Signals** tab uses a built-in rule-based engine that runs 100% in your browser:

### Indicators scored (weighted):
| Indicator | Weight | How scored |
|-----------|--------|-----------|
| RSI (14) | 20% | <30 bullish, >70 bearish, zones in between |
| MACD (12,26,9) | 20% | Crossover direction + histogram sign |
| Bollinger Bands | 15% | Position within bands (% bandwidth) |
| EMA crossover | 15% | Price vs EMA20/50/200 + Golden/Death cross |
| PCR (Put-Call Ratio) | 15% | >1.2 bullish, <0.8 bearish |
| India VIX | 10% | Level affects position sizing |
| FII/DII flow | 5% | 3-day average net buying/selling |

### Output:
- **Direction** — BULLISH / BEARISH / NEUTRAL
- **Confidence** — 1-10 based on how many indicators agree
- **Exact strike prices** — computed from ATM + step size per index
- **Strategy** — Bull Call Spread / Bear Put Spread / Iron Condor / Long CE / Long PE
- **Index levels** — Entry, Target 1, Target 2, Stop Loss
- **Max Loss / Profit per lot** — in rupees
- **Key support & resistance levels**

### Safe Risk = Spreads (defined risk, no naked positions)
### Moderate = ATM directional options
### Aggressive = Slightly OTM options for higher reward

---

## Data When CORS Proxies Are Unavailable

If all CORS proxies fail AND you haven't set up the Google Apps Script proxy, the dashboard shows **realistic demo data** based on actual April 2, 2026 NSE closing prices:

| Index | Price | Change |
|-------|-------|--------|
| Nifty 50 | ₹22,161 | -1.85% |
| Bank Nifty | ₹49,497 | -1.69% |
| Sensex | ₹72,683 | -1.86% |
| Fin Nifty | ₹21,202 | -1.76% |
| Mid Cap Nifty | ₹11,200 | -1.71% |
| India VIX | 19.5 | +12.1% |

The signal engine still works perfectly with demo data — all calculations are done locally.

---

## ⚠️ Disclaimer
Signals are rule-based and for educational purposes only. Options trading involves substantial risk of loss. This is NOT financial advice. Always consult a SEBI-registered investment advisor before trading.
