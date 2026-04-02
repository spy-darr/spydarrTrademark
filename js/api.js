// ===== API LAYER =====
// Tries multiple CORS proxies. Falls back to realistic mock data.

async function proxyFetch(url, ttlKey = 'hist') {
  const ckey = url;
  const now = Date.now();
  const ttl = CACHE_TTL[ttlKey] || 120000;
  if (CACHE[ckey] && (now - CACHE[ckey].ts) < ttl) return CACHE[ckey].data;

  // Try each proxy in order
  for (let pi = 0; pi < CFG.proxies.length; pi++) {
    try {
      const proxy = CFG.proxies[pi];
      const fullUrl = proxy + encodeURIComponent(url);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(fullUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const wrap = await res.json();
      // allorigins wraps in {contents:...}, corsproxy returns direct
      const raw = wrap.contents !== undefined ? wrap.contents : (typeof wrap === 'string' ? wrap : JSON.stringify(wrap));
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      CACHE[ckey] = { data, ts: now };
      return data;
    } catch(e) { /* try next proxy */ }
  }
  return null;
}

// ── Yahoo Finance Quote ──
async function getQuote(symbol) {
  const urls = [
    `${CFG.yfQuote}${encodeURIComponent(symbol)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,regularMarketPreviousClose,regularMarketOpen`,
    `${CFG.yfQuote2}${encodeURIComponent(symbol)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,regularMarketPreviousClose,regularMarketOpen`,
  ];
  for (const url of urls) {
    const data = await proxyFetch(url, 'quote');
    if (data?.quoteResponse?.result?.[0]) {
      const q = data.quoteResponse.result[0];
      return {
        price:    parseFloat(q.regularMarketPrice)       || 0,
        change:   parseFloat(q.regularMarketChange)      || 0,
        changePct:parseFloat(q.regularMarketChangePercent)|| 0,
        high:     parseFloat(q.regularMarketDayHigh)     || 0,
        low:      parseFloat(q.regularMarketDayLow)      || 0,
        volume:   parseInt(q.regularMarketVolume)        || 0,
        prevClose:parseFloat(q.regularMarketPreviousClose)||0,
        open:     parseFloat(q.regularMarketOpen)        || 0,
        _live: true
      };
    }
  }
  return mockQuote(symbol);
}

// ── Yahoo Finance Historical ──
async function getHistory(symbol, interval = '1d', range = '3mo') {
  const urls = [
    `${CFG.yfChart}${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`,
    `${CFG.yfChart2}${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`,
  ];
  for (const url of urls) {
    const data = await proxyFetch(url, 'hist');
    if (data?.chart?.result?.[0]) {
      const r = data.chart.result[0];
      const ts = r.timestamp || [];
      const q  = r.indicators.quote[0] || {};
      const candles = ts.map((t, i) => ({
        time:   t,
        open:   parseFloat(q.open?.[i])   || 0,
        high:   parseFloat(q.high?.[i])   || 0,
        low:    parseFloat(q.low?.[i])    || 0,
        close:  parseFloat(q.close?.[i])  || 0,
        volume: parseInt(q.volume?.[i])   || 0,
      })).filter(c => c.open > 0 && c.high > 0 && c.close > 0);
      if (candles.length > 10) return candles;
    }
  }
  return mockHistory(symbol);
}

// ── NSE Options Chain ──
async function getNSEChain(symbol) {
  const url = `${CFG.nseBase}option-chain-indices?symbol=${symbol}`;
  const data = await proxyFetch(url, 'chain');
  if (data?.records?.data?.length) {
    return {
      records: data.records,
      filtered: data.filtered,
      expiryDates: data.records.expiryDates || [],
      underlyingValue: parseFloat(data.records.underlyingValue) || 0,
    };
  }
  return mockChain(symbol);
}

// ── NSE VIX via Yahoo ──
async function getVIX() {
  const q = await getQuote('^INDIAVIX');
  if (q._live && q.price > 5) return q;
  // fallback: try NSE all indices
  const url = `${CFG.nseBase}allIndices`;
  const data = await proxyFetch(url, 'quote');
  if (data?.data) {
    const vix = data.data.find(d => d.indexSymbol === 'India VIX' || d.index === 'INDIA VIX');
    if (vix) return { price: parseFloat(vix.last), change: parseFloat(vix.variation || 0), changePct: parseFloat(vix.percentChange || 0) };
  }
  return { price: 14.5, change: 0.2, changePct: 1.4 };
}

// ── NSE FII / DII ──
async function getFIIDII() {
  const url = `${CFG.nseBase}fiidiiTradeReact`;
  const data = await proxyFetch(url, 'fii');
  if (Array.isArray(data) && data.length) {
    return data.slice(0, 10).map(d => ({
      date:     d.date || '--',
      fiiBuy:   parseFloat((d.fiiBuy  || '0').replace(/,/g,'')),
      fiiSell:  parseFloat((d.fiiSell || '0').replace(/,/g,'')),
      fiiNet:   parseFloat((d.fiiNet  || '0').replace(/,/g,'')),
      diiBuy:   parseFloat((d.diiBuy  || '0').replace(/,/g,'')),
      diiSell:  parseFloat((d.diiSell || '0').replace(/,/g,'')),
      diiNet:   parseFloat((d.diiNet  || '0').replace(/,/g,'')),
    }));
  }
  return mockFII();
}

// ── NSE Breadth ──
async function getBreadth() {
  const url = `${CFG.nseBase}allIndices`;
  const data = await proxyFetch(url, 'quote');
  if (data?.data) {
    let adv = 0, dec = 0, unc = 0;
    data.data.forEach(d => {
      if (d.advances)  adv += parseInt(d.advances);
      if (d.declines)  dec += parseInt(d.declines);
      if (d.unchanged) unc += parseInt(d.unchanged);
    });
    if (adv + dec > 0) return { advances: adv, declines: dec, unchanged: unc };
  }
  return { advances: 1200, declines: 920, unchanged: 180 };
}

// ════════════ MOCK DATA (realistic NSE closing prices for 02-Apr-2026) ════════════
function mockQuote(sym) {
  // NOTE: These are the actual approximate values from the screenshots provided
  const base = {
    '^NSEI':                 { price:22161, chg:-418,  pct:-1.85 },
    '^NSEBANK':              { price:49500, chg:-850,  pct:-1.69 },
    '^BSESN':                { price:72700, chg:-1380, pct:-1.86 },
    'NIFTY_FIN_SERVICE.NS':  { price:21200, chg:-380,  pct:-1.76 },
    '^CNXMIDCAP':            { price:11200, chg:-195,  pct:-1.71 },
    '^INDIAVIX':             { price:19.2,  chg:3.4,   pct:21.5  },
  };
  const b = base[sym] || { price:10000, chg:-100, pct:-1.0 };
  const noise = (Math.random() - 0.5) * b.price * 0.001;
  const p = b.price + noise;
  return { price:p, change:b.chg, changePct:b.pct, high:p*1.005, low:p*0.993, volume:Math.floor(Math.random()*8e6+2e6), prevClose:p-b.chg, open:p+b.chg*0.1, _live:false };
}

function mockHistory(sym) {
  const base = { '^NSEI':22161, '^NSEBANK':49500, '^BSESN':72700, 'NIFTY_FIN_SERVICE.NS':21200, '^CNXMIDCAP':11200 };
  let price = base[sym] || 10000;
  // Generate 90 days back, with a realistic recent downtrend
  const candles = [];
  const now = Math.floor(Date.now() / 1000);
  for (let i = 89; i >= 0; i--) {
    const t = now - i * 86400;
    const trend = i < 10 ? -0.005 : (Math.random() - 0.48) * 0.012; // recent bearish
    const chg = price * trend;
    const open = price;
    price = Math.max(price * 0.85, price + chg);
    candles.push({ time: t, open, high: Math.max(open, price) * (1 + Math.random() * 0.004), low: Math.min(open, price) * (1 - Math.random() * 0.004), close: price, volume: Math.floor(Math.random() * 1e7 + 5e6) });
  }
  return candles;
}

function mockChain(sym) {
  const atmMap = { NIFTY:22150, BANKNIFTY:49500, SENSEX:72700, FINNIFTY:21200, MIDCPNIFTY:11200 };
  const stepMap= { NIFTY:50,   BANKNIFTY:100,   SENSEX:200,   FINNIFTY:50,    MIDCPNIFTY:25 };
  const atm  = atmMap[sym] || 22000;
  const step = stepMap[sym] || 50;
  const exp  = nextThursday(0);
  const data = [];
  for (let i = -12; i <= 12; i++) {
    const strike = atm + i * step;
    const dist = Math.abs(i);
    const ceOI = Math.max(5000, Math.floor((2000000 - dist * 120000) + Math.random() * 200000));
    const peOI = Math.max(5000, Math.floor((1800000 - dist * 100000) + Math.random() * 200000));
    const ceIV = (18 + dist * 1.8 + Math.random() * 2).toFixed(2);
    const peIV = (20 + dist * 1.6 + Math.random() * 2).toFixed(2);
    const ceOTC = i <= 0 ? (atm - strike) + Math.random() * 30 : Math.max(1, 80 - dist * 18 + Math.random() * 20);
    const peOTC = i >= 0 ? (strike - atm) + Math.random() * 30 : Math.max(1, 80 - dist * 15 + Math.random() * 20);
    data.push({
      strikePrice: strike, expiryDate: exp,
      CE: { openInterest: ceOI, changeinOpenInterest: Math.floor((Math.random()-0.5)*ceOI*0.12), totalTradedVolume: Math.floor(ceOI*0.25), impliedVolatility: ceIV, lastPrice: Math.max(0.5, ceOTC).toFixed(2) },
      PE: { openInterest: peOI, changeinOpenInterest: Math.floor((Math.random()-0.5)*peOI*0.10), totalTradedVolume: Math.floor(peOI*0.22), impliedVolatility: peIV, lastPrice: Math.max(0.5, peOTC).toFixed(2) },
    });
  }
  return { records: { data, expiryDates: [exp, nextThursday(7), nextThursday(14), nextThursday(28)], underlyingValue: atm }, filtered: { data }, expiryDates: [exp, nextThursday(7), nextThursday(14)], underlyingValue: atm };
}

function nextThursday(addDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  const day = d.getDay();
  const diff = (4 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }).replace(/ /g,'-').toUpperCase();
}

function mockFII() {
  const rows = [];
  const d = new Date();
  for (let i = 0; i < 10; i++) {
    const dd = new Date(d); dd.setDate(dd.getDate() - i);
    // Bearish recent days
    const fiiNet = i < 3 ? -(Math.random()*3000+1000) : (Math.random()-0.6)*3000;
    const diiNet = i < 3 ? (Math.random()*2000+500)   : (Math.random()-0.4)*2000;
    rows.push({ date: dd.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}), fiiBuy: 8000+Math.random()*2000, fiiSell: 8000+Math.random()*2000-fiiNet, fiiNet, diiBuy: 6000+Math.random()*1500, diiSell: 6000+Math.random()*1500-diiNet, diiNet });
  }
  return rows;
}

function fmtCr(v) { const n=Math.abs(v); return (v<0?'-':'+')+(n>=10000?(n/100).toFixed(0):n.toFixed(0))+' Cr'; }
function fmtOI(v) { const n=Math.abs(v); if(n>=1e7)return(v<0?'-':'')+(n/1e7).toFixed(1)+'Cr'; if(n>=1e5)return(v<0?'-':'')+(n/1e5).toFixed(1)+'L'; if(n>=1e3)return(v<0?'-':'')+(n/1e3).toFixed(1)+'K'; return String(Math.round(v)); }
function fmtPrice(v) { return '₹'+v.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtVol(v)   { if(v>=1e7)return(v/1e7).toFixed(2)+'Cr'; if(v>=1e5)return(v/1e5).toFixed(1)+'L'; if(v>=1e3)return(v/1e3).toFixed(1)+'K'; return String(v); }
function isMarketOpen() {
  const ist = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
  const day = ist.getDay(), h = ist.getHours(), m = ist.getMinutes(), mins = h*60+m;
  return day >= 1 && day <= 5 && mins >= 555 && mins <= 930;
}
