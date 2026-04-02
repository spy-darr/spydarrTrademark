# NSE Intelligence Dashboard v2

Real-time NSE/BSE options trading intelligence dashboard — pure HTML/CSS/JS, deployable on GitHub Pages (free hosting).

## What's Fixed in v2
- ✅ Accurate live prices via Yahoo Finance (multi-proxy fallback)
- ✅ AI Signals now give **exact strike prices**, specific option legs, and precise index entry/exit
- ✅ Technicals chart now loads correctly on tab switch
- ✅ Sentiment gauge loads with real FII/DII + VIX data
- ✅ Options chain shows real PCR, Max Pain, OI bars
- ✅ Multiple CORS proxy fallback chain (allorigins → corsproxy → codetabs)

## File Structure
```
nse-dashboard/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── config.js       ← Index config, lot sizes, strike steps
│   ├── api.js          ← Yahoo Finance + NSE data + mock fallbacks
│   ├── indicators.js   ← RSI, MACD, BB, EMA, ATR, VWAP
│   ├── charts.js       ← Lightweight Charts + mini sparklines
│   ├── options.js      ← Options chain, PCR, Max Pain, OI bars
│   ├── sentiment.js    ← FII/DII, VIX, sentiment gauge
│   ├── signals.js      ← AI signal engine (Claude API)
│   └── main.js         ← App controller, tab routing, auto-refresh
└── README.md
```

## GitHub Pages Deployment (5 minutes)
```bash
git init
git add .
git commit -m "NSE Intelligence v2"
git remote add origin https://github.com/YOURUSERNAME/nse-dashboard.git
git push -u origin main
```
**Repo Settings → Pages → Branch: main → / (root) → Save**

Live at: `https://YOURUSERNAME.github.io/nse-dashboard`

## Data Sources
| Source | Data | Notes |
|--------|------|-------|
| Yahoo Finance | Live quotes, OHLCV history | Via CORS proxy |
| NSE India API | Options chain, FII/DII, VIX | Via CORS proxy |
| allorigins.win | Primary CORS proxy | Free, no signup |
| corsproxy.io | Fallback proxy | Free |
| codetabs.com | Second fallback | Free |

**If all proxies fail**, the dashboard falls back to realistic demo data so it still works visually.

## AI Signals — Claude API Note
The AI Signals tab calls the Anthropic Claude API directly from the browser.

**For GitHub Pages deployment**, you need a small backend proxy to keep your API key safe. Easiest free option:

### Option A: Netlify Function (Free tier, 125k calls/month)
Create `netlify/functions/claude-proxy.js`:
```javascript
const fetch = require('node-fetch');
exports.handler = async (event) => {
  const body = JSON.parse(event.body);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { statusCode: 200, body: JSON.stringify(data) };
};
```
Set `ANTHROPIC_API_KEY` in Netlify environment variables. Then update the fetch URL in `js/signals.js` to `/.netlify/functions/claude-proxy`.

### Option B: Test locally
The Claude API works directly when previewed inside Claude.ai.

## Libraries Used (All Free/Open Source)
- [Lightweight Charts v4](https://github.com/tradingview/lightweight-charts) — Apache 2.0
- [TechnicalIndicators.js v3](https://github.com/anandanand84/technicalindicators) — MIT
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) — OFL
- [Syne](https://fonts.google.com/specimen/Syne) — OFL

## ⚠️ Disclaimer
AI signals are for educational purposes only. Options trading involves substantial risk of loss. Not financial advice. Consult a SEBI-registered investment advisor before trading.
