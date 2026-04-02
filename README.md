# NSE Intelligence Dashboard

A real-time options trading intelligence dashboard for Indian markets — built with pure HTML/CSS/JS, hostable on GitHub Pages for free.

## Features

- **Live Index Prices** — Nifty 50, Bank Nifty, Sensex, Fin Nifty, Mid Cap Nifty
- **Technical Analysis** — RSI, MACD, Bollinger Bands, EMA 20/50 with candlestick charts
- **Options Chain** — OI, PCR, Max Pain, IV, full strike-by-strike table
- **Sentiment Panel** — FII/DII activity, India VIX with interpretation, Market Breadth
- **AI Signals** — Claude AI analyzes all data to generate Entry, Target, Stop Loss, Risk:Reward

## Data Sources (Free)

| Source | Data | Rate |
|--------|------|------|
| Yahoo Finance | OHLCV, Quotes | Unlimited (via proxy) |
| NSE India (public API) | Options Chain, FII/DII, VIX | Unlimited (via proxy) |
| allorigins.win | CORS Proxy | Free |
| Anthropic Claude API | AI Signal Analysis | Pay-per-use |

## Setup & Deployment

### 1. Clone/Download
```bash
git clone https://github.com/yourusername/nse-dashboard
cd nse-dashboard
```

### 2. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/nse-dashboard.git
git push -u origin main
```

### 3. Enable GitHub Pages
1. Go to your repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main**, Folder: **/ (root)**
4. Click **Save**
5. Your dashboard will be live at: `https://yourusername.github.io/nse-dashboard`

## Important Notes

### CORS Proxy
This dashboard uses `allorigins.win` as a free CORS proxy to fetch data from Yahoo Finance and NSE. If the proxy is down, the dashboard falls back to realistic mock data automatically.

**Alternative free proxies (if allorigins is down):**
- `https://corsproxy.io/?`
- `https://api.codetabs.com/v1/proxy?quest=`

To switch proxy, edit the `PROXY` constant in `js/api.js`.

### AI Signal Generation
The AI Signals tab uses the Anthropic Claude API. The API key is handled by the Claude.ai embedded environment when previewed in Claude. For your own deployment, you'll need to:
1. Get a free API key from [console.anthropic.com](https://console.anthropic.com)
2. Note: The Anthropic API requires a backend to keep keys secure. For GitHub Pages (frontend-only), consider using a free serverless function (Vercel/Netlify free tier) as a proxy.

### NSE Data
NSE India's API has CORS restrictions and may require headers. If options chain data fails to load, it uses realistic mock data for demonstration.

## File Structure
```
nse-dashboard/
├── index.html          # Main dashboard
├── css/
│   └── style.css       # Dark terminal theme
├── js/
│   ├── api.js          # Data fetching (Yahoo + NSE)
│   ├── indicators.js   # RSI, MACD, BB, EMA calculations
│   ├── charts.js       # Lightweight Charts rendering
│   ├── options.js      # Options chain, PCR, Max Pain
│   ├── sentiment.js    # FII/DII, VIX, sentiment score
│   ├── signals.js      # AI signal generation
│   └── main.js         # App controller
└── README.md
```

## Disclaimer

⚠️ This dashboard is for **educational and informational purposes only**. AI-generated signals are NOT financial advice. Options trading involves substantial risk of loss. Always consult a SEBI-registered investment advisor before making trading decisions. Past signal accuracy does not guarantee future results.

## Libraries Used (All Free)

- [Lightweight Charts](https://github.com/tradingview/lightweight-charts) by TradingView (Apache 2.0)
- [TechnicalIndicators.js](https://github.com/anandanand84/technicalindicators) (MIT)
- [Syne Font](https://fonts.google.com/specimen/Syne) (OFL)
- [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) (OFL)
