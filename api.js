// ===== API Layer: Yahoo Finance + NSE India via CORS Proxy =====
// Uses allorigins.win as a free CORS proxy

const PROXY = 'https://api.allorigins.win/get?url=';
const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const YF_QUOTE = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=';
const NSE_BASE = 'https://www.nseindia.com/api/';

// Cache to avoid repeated calls
const cache = {};
const CACHE_TTL = 60000; // 1 min

async function fetchWithProxy(url, ttl = CACHE_TTL) {
  const key = url;
  const now = Date.now();
  if (cache[key] && (now - cache[key].ts) < ttl) return cache[key].data;
  try {
    const proxyUrl = PROXY + encodeURIComponent(url);
    const res = await fetch(proxyUrl, { timeout: 15000 });
    const wrapper = await res.json();
    const data = JSON.parse(wrapper.contents);
    cache[key] = { data, ts: now };
    return data;
  } catch (e) {
    console.warn('Fetch failed for', url, e.message);
    return null;
  }
}

// ---- Yahoo Finance: Quote (current price) ----
async function fetchQuote(symbol) {
  const url = `${YF_QUOTE}${encodeURIComponent(symbol)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketDayHigh,regularMarketDayLow,regularMarketOpen,regularMarketPreviousClose,regularMarketVolume`;
  const data = await fetchWithProxy(url, 30000);
  if (!data) return getMockQuote(symbol);
  try {
    const q = data.quoteResponse.result[0];
    return {
      symbol: q.symbol,
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePct: q.regularMarketChangePercent,
      high: q.regularMarketDayHigh,
      low: q.regularMarketDayLow,
      open: q.regularMarketOpen,
      prevClose: q.regularMarketPreviousClose,
      volume: q.regularMarketVolume
    };
  } catch(e) { return getMockQuote(symbol); }
}

// ---- Yahoo Finance: Historical OHLCV ----
async function fetchHistorical(symbol, interval = '1d', range = '3mo') {
  const url = `${YF_BASE}${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&events=div,splits`;
  const data = await fetchWithProxy(url, 120000);
  if (!data) return getMockHistorical(symbol);
  try {
    const r = data.chart.result[0];
    const ts = r.timestamps || r.timestamp;
    const q = r.indicators.quote[0];
    const candles = ts.map((t, i) => ({
      time: t,
      open: q.open[i],
      high: q.high[i],
      low: q.low[i],
      close: q.close[i],
      volume: q.volume[i]
    })).filter(c => c.open && c.high && c.low && c.close);
    return candles;
  } catch(e) { return getMockHistorical(symbol); }
}

// ---- NSE: Options Chain ----
async function fetchOptionsChain(symbol) {
  const url = `${NSE_BASE}option-chain-indices?symbol=${symbol}`;
  const data = await fetchWithProxy(url, 60000);
  if (!data) return getMockOptionsChain(symbol);
  try {
    return {
      records: data.records,
      filtered: data.filtered,
      expiryDates: data.records.expiryDates
    };
  } catch(e) { return getMockOptionsChain(symbol); }
}

// ---- NSE: Market Status ----
async function fetchMarketStatus() {
  const url = `${NSE_BASE}market-status`;
  const data = await fetchWithProxy(url, 30000);
  if (!data) return { isOpen: isMarketHours(), status: 'Unknown' };
  try {
    const m = data.marketState[0];
    return { isOpen: m.marketStatus === 'Open', status: m.marketStatus };
  } catch(e) { return { isOpen: isMarketHours(), status: 'Unknown' }; }
}

// ---- NSE: VIX ----
async function fetchVIX() {
  // VIX from Yahoo Finance as ^INDIAVIX
  const data = await fetchQuote('^INDIAVIX');
  if (data && data.price) return data;
  // Fallback: from NSE
  const nseData = await fetchWithProxy(`${NSE_BASE}allIndices`, 60000);
  if (nseData) {
    const vix = nseData.data?.find(d => d.indexSymbol === 'India VIX');
    if (vix) return { price: parseFloat(vix.last), change: parseFloat(vix.variation), changePct: parseFloat(vix.percentChange) };
  }
  return { price: 15.0, change: 0.2, changePct: 1.1 };
}

// ---- NSE: FII / DII Data ----
async function fetchFIIDII() {
  const url = `${NSE_BASE}fiidiiTradeReact`;
  const data = await fetchWithProxy(url, 300000); // 5min cache
  if (!data) return getMockFIIDII();
  try {
    return data.map(d => ({
      date: d.date,
      fiiBuy: parseFloat(d.fiiBuy?.replace(/,/g,'')||0),
      fiiSell: parseFloat(d.fiiSell?.replace(/,/g,'')||0),
      fiiNet: parseFloat(d.fiiNet?.replace(/,/g,'')||0),
      diiBuy: parseFloat(d.diiBuy?.replace(/,/g,'')||0),
      diiSell: parseFloat(d.diiSell?.replace(/,/g,'')||0),
      diiNet: parseFloat(d.diiNet?.replace(/,/g,'')||0),
    })).slice(0, 10);
  } catch(e) { return getMockFIIDII(); }
}

// ---- NSE: Market Breadth (Advances/Declines) ----
async function fetchMarketBreadth() {
  const url = `${NSE_BASE}allIndices`;
  const data = await fetchWithProxy(url, 60000);
  if (!data) return { advances: 1100, declines: 900, unchanged: 200 };
  try {
    const total = data.data;
    let adv = 0, dec = 0, unch = 0;
    total.forEach(i => {
      if (i.advance) adv += parseInt(i.advance.advances||0);
      if (i.advance) dec += parseInt(i.advance.declines||0);
      if (i.advance) unch += parseInt(i.advance.unchanged||0);
    });
    return { advances: adv||1100, declines: dec||900, unchanged: unch||200 };
  } catch(e) { return { advances: 1100, declines: 900, unchanged: 200 }; }
}

// ---- Helper ----
function isMarketHours() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const h = ist.getHours(), m = ist.getMinutes(), day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const mins = h * 60 + m;
  return mins >= 555 && mins <= 930; // 9:15 - 15:30
}

// ============ MOCK DATA (fallback when APIs are blocked) ============
function getMockQuote(symbol) {
  const base = { '^NSEI': 24150, '^NSEBANK': 52300, '^BSESN': 79800, 'NIFTY_FIN_SERVICE.NS': 23400, '^CNXMIDCAP': 11800, '^INDIAVIX': 14.5 };
  const price = base[symbol] || 10000;
  const chg = (Math.random() - 0.45) * price * 0.012;
  return { symbol, price: price + chg, change: chg, changePct: (chg/price)*100, high: price + Math.abs(chg)*1.5, low: price - Math.abs(chg)*1.5, open: price, prevClose: price, volume: Math.floor(Math.random()*5000000) };
}

function getMockHistorical(symbol) {
  const base = { '^NSEI': 24150, '^NSEBANK': 52300, '^BSESN': 79800, 'NIFTY_FIN_SERVICE.NS': 23400, '^CNXMIDCAP': 11800 };
  let price = base[symbol] || 10000;
  const candles = [];
  const now = Math.floor(Date.now() / 1000);
  for (let i = 90; i >= 0; i--) {
    const t = now - (i * 86400);
    const chg = (Math.random() - 0.48) * price * 0.015;
    const open = price;
    price += chg;
    candles.push({ time: t, open, high: Math.max(open, price) * 1.003, low: Math.min(open, price) * 0.997, close: price, volume: Math.floor(Math.random() * 10000000) });
  }
  return candles;
}

function getMockOptionsChain(symbol) {
  const atmMap = { NIFTY: 24150, BANKNIFTY: 52300, SENSEX: 79800, FINNIFTY: 23400, MIDCPNIFTY: 11800 };
  const atm = atmMap[symbol] || 24000;
  const step = symbol === 'BANKNIFTY' ? 100 : symbol === 'SENSEX' ? 500 : 50;
  const expiry = getNextExpiry();
  const data = [];
  for (let i = -10; i <= 10; i++) {
    const strike = atm + (i * step);
    const dist = Math.abs(i);
    const ceOI = Math.floor((800000 - dist * 50000 + Math.random() * 100000));
    const peOI = Math.floor((700000 - dist * 40000 + Math.random() * 100000));
    const ceIV = 12 + dist * 1.5 + Math.random() * 2;
    const peIV = 13 + dist * 1.4 + Math.random() * 2;
    const ceLTP = Math.max(1, (atm - strike < 0 ? (atm - strike + 200) : (200 - (strike - atm) * 0.5)));
    const peLTP = Math.max(1, (strike - atm < 0 ? (strike - atm + 200) : (200 - (atm - strike) * 0.5)));
    data.push({
      strikePrice: strike, expiryDate: expiry, CE: { openInterest: ceOI, changeinOpenInterest: Math.floor((Math.random()-0.4)*ceOI*0.1), totalTradedVolume: Math.floor(ceOI*0.3), impliedVolatility: ceIV.toFixed(2), lastPrice: Math.max(0.5, ceLTP).toFixed(2) },
      PE: { openInterest: peOI, changeinOpenInterest: Math.floor((Math.random()-0.4)*peOI*0.1), totalTradedVolume: Math.floor(peOI*0.3), impliedVolatility: peIV.toFixed(2), lastPrice: Math.max(0.5, peLTP).toFixed(2) }
    });
  }
  return { records: { data, expiryDates: [expiry, getNextExpiry(7), getNextExpiry(14)], underlyingValue: atm }, filtered: { data } };
}

function getNextExpiry(addDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + addDays);
  // Find next Thursday
  const day = now.getDay();
  const daysUntilThur = (4 - day + 7) % 7 || 7;
  now.setDate(now.getDate() + daysUntilThur);
  return now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-').toUpperCase();
}

function getMockFIIDII() {
  const rows = [];
  const now = new Date();
  for (let i = 0; i < 10; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const fiiNet = (Math.random() - 0.45) * 3000;
    const diiNet = -fiiNet * 0.7 + (Math.random() - 0.5) * 500;
    rows.push({
      date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      fiiBuy: Math.abs(fiiNet) + 5000, fiiSell: Math.abs(fiiNet) + 5000 - fiiNet, fiiNet,
      diiBuy: Math.abs(diiNet) + 4000, diiSell: Math.abs(diiNet) + 4000 - diiNet, diiNet
    });
  }
  return rows;
}
