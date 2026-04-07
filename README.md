# NSE Intelligence Dashboard v3

## What's Fixed in v3
- ✅ **Single `index.html` file** — no separate JS files to misconfigure
- ✅ **API Key input in the UI** — enter your Anthropic key directly in the Signals tab, stored in localStorage (no server needed for the key itself)
- ✅ **Data status banner** — clearly shows "Live data" or "Demo data (CORS unavailable)"
- ✅ **4 CORS proxy fallback chain** — allorigins → corsproxy → thingproxy → codetabs
- ✅ **Graceful mock data** — realistic values (Apr 2026 actuals) when all proxies fail
- ✅ **Technicals chart fixed** — now loads on tab switch correctly
- ✅ **Options chain shows immediately** — uses computed mock if NSE API blocked
- ✅ **Sentiment gauge renders immediately** — with mock FII/DII/VIX data

---

## Why Data Shows as "Demo" on GitHub Pages

GitHub Pages runs your HTML on users' browsers. Browsers have a CORS security restriction — they block requests to `nseindia.com` and `finance.yahoo.com` unless those servers send `Access-Control-Allow-Origin` headers.

**Solution options:**

### Option 1: Use as-is (Demo mode)
The dashboard works fully with realistic demo data. Good for:
- Testing the UI and signals logic
- Understanding the tool before going live

### Option 2: Deploy on Netlify (Free — Live Data)
Netlify lets you add a small backend "Function" that proxies the API calls server-side (no CORS issue).

**Step 1:** Create `netlify/functions/proxy.js`:
```javascript
const fetch = require('node-fetch');

exports.handler = async (event) => {
  const { url } = JSON.parse(event.body || '{}');
  if (!url) return { statusCode: 400, body: 'Missing url' };
  
  // Whitelist only safe domains
  const allowed = ['finance.yahoo.com', 'nseindia.com', 'api.anthropic.com'];
  if (!allowed.some(d => url.includes(d))) {
    return { statusCode: 403, body: 'Domain not allowed' };
  }
  
  try {
    const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };
    if (url.includes('nseindia.com')) {
      headers['Referer'] = 'https://www.nseindia.com';
      headers['Cookie'] = ''; // NSE may need session cookie — see notes
    }
    const res = await fetch(url, { headers });
    const body = await res.text();
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: body })
    };
  } catch(e) {
    return { statusCode: 500, body: e.message };
  }
};
```

**Step 2:** Add `ANTHROPIC_API_KEY` to Netlify environment variables.

**Step 3:** In `index.html`, change the first CORS proxy to your Netlify function:
```javascript
const PROXIES = [
  u => `/.netlify/functions/proxy?` + new URLSearchParams({url:u}),
  // ... rest as fallbacks
];
```

**Step 4:** For AI Signals, change the fetch URL from `api.anthropic.com` to `/.netlify/functions/claude` and create a separate Claude proxy function.

### Option 3: Local Development (Full Live Data)
Run a local proxy with Python:
```bash
pip install flask flask-cors requests
python local_proxy.py
```
Then open `index.html` in a browser. The CORS proxies will work through the local server.

---

## AI Signals — API Key

1. Get a free key at [console.anthropic.com](https://console.anthropic.com) (new accounts get $5 free credit)
2. Open the dashboard → go to **AI Signals** tab
3. Paste your key in the API Key field → click **Save Key**
4. Your key is stored in `localStorage` — never transmitted except directly to `api.anthropic.com`

**Note:** Direct browser → Claude API calls work when:
- Running locally
- The API CORS policy allows it (Anthropic currently allows browser calls)

If you get a CORS error on GitHub Pages, use the Netlify backend approach above.

---

## GitHub Pages Deployment

```bash
# Just push the single index.html file
git init
git add index.html README.md
git commit -m "NSE Intelligence v3"
git remote add origin https://github.com/YOURUSERNAME/nse-dashboard.git
git push -u origin main
```

Go to **Repo Settings → Pages → Branch: main → / (root) → Save**

Live at: `https://YOURUSERNAME.github.io/nse-dashboard`

---

## NSE Data Notes

NSE India's API (`nseindia.com/api/`) requires:
- A valid browser session cookie (set by visiting the NSE website first)
- A `Referer: https://www.nseindia.com` header
- Proper `User-Agent`

This is why direct CORS proxy calls often fail for NSE data specifically. The dashboard falls back to a computed options chain based on live Yahoo Finance spot prices, which is nearly equivalent for analysis purposes.

For a production setup with real NSE options chain data, you need a backend service. See the Netlify setup above.

---

## ⚠️ Disclaimer
AI signals are for educational purposes only. Options trading involves substantial risk of loss. Not financial advice. Consult a SEBI-registered investment advisor before trading.
