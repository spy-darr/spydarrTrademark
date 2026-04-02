// ===== TECHNICAL INDICATORS =====

function ema(arr, period) {
  if (arr.length < period) return [];
  const k = 2 / (period + 1);
  const out = new Array(period - 1).fill(null);
  let e = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(e);
  for (let i = period; i < arr.length; i++) { e = arr[i] * k + e * (1 - k); out.push(e); }
  return out;
}

function sma(arr, period) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    out.push(arr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
  }
  return out;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  try {
    const vals = technicalindicators.RSI.calculate({ values: closes, period });
    return vals.length ? vals[vals.length - 1] : null;
  } catch(e) {
    // Manual fallback
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) gains += d; else losses -= d;
    }
    const ag = gains / period, al = losses / period;
    if (al === 0) return 100;
    return 100 - (100 / (1 + ag / al));
  }
}

function calcMACD(closes) {
  try {
    const vals = technicalindicators.MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
    return vals.slice(-14);
  } catch(e) {
    // Manual fallback
    const fast = ema(closes, 12), slow = ema(closes, 26);
    const len = Math.min(fast.length, slow.length);
    const macdLine = [];
    for (let i = 0; i < len; i++) {
      const f = fast[fast.length - len + i], s = slow[slow.length - len + i];
      macdLine.push((f != null && s != null) ? f - s : null);
    }
    const validMacd = macdLine.filter(v => v != null);
    const signal = ema(validMacd, 9);
    return validMacd.slice(-14).map((v, i) => ({
      MACD: v,
      signal: signal[Math.max(0, signal.length - 14 + i)] || 0,
      histogram: v - (signal[Math.max(0, signal.length - 14 + i)] || 0)
    }));
  }
}

function calcBB(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return { upper: mean + mult * sd, middle: mean, lower: mean - mult * sd, sd, mean };
}

function calcBBArray(closes, period = 20, mult = 2) {
  const out = [];
  for (let i = period - 1; i < closes.length; i++) {
    const s = closes.slice(i - period + 1, i + 1);
    const m = s.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / period);
    out.push({ upper: m + mult * sd, middle: m, lower: m - mult * sd });
  }
  return out;
}

function calcATR(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function computeAll(candles) {
  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);

  const rsi    = calcRSI(closes);
  const macdArr= calcMACD(closes);
  const bb     = calcBB(closes);
  const atr    = calcATR(highs, lows, closes);
  const ema20v = ema(closes, 20);
  const ema50v = ema(closes, 50);
  const ema200v= ema(closes, 200);
  const e20    = ema20v[ema20v.length - 1];
  const e50    = ema50v[ema50v.length - 1];
  const e200   = ema200v[ema200v.length - 1];
  const price  = closes[closes.length - 1];

  // VWAP (approximate daily)
  const vol   = candles.map(c => c.volume);
  const tp    = candles.map(c => (c.high + c.low + c.close) / 3);
  const last30= tp.slice(-30), vol30 = vol.slice(-30);
  const vwap  = last30.reduce((s, v, i) => s + v * vol30[i], 0) / Math.max(1, vol30.reduce((a, b) => a + b, 0));

  // Stochastic
  let stoch = null;
  try {
    const sv = technicalindicators.Stochastic.calculate({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 });
    stoch = sv[sv.length - 1];
  } catch(e) {}

  return { rsi, macdArr, bb, atr, e20, e50, e200, vwap, stoch, price, closes, ema20v, ema50v, ema200v };
}

// ── Interpretation ──
function intRSI(v) {
  if (v === null) return { cls:'sig-neutral', txt:'No data' };
  if (v >= 75) return { cls:'sig-bear', txt:`Heavily Overbought (${v.toFixed(1)}) — Strong Sell Signal` };
  if (v >= 65) return { cls:'sig-bear', txt:`Overbought (${v.toFixed(1)}) — Caution, possible reversal` };
  if (v <= 25) return { cls:'sig-bull', txt:`Heavily Oversold (${v.toFixed(1)}) — Strong Buy Signal` };
  if (v <= 35) return { cls:'sig-bull', txt:`Oversold (${v.toFixed(1)}) — Bullish bias` };
  if (v >= 55) return { cls:'sig-bull', txt:`Bullish zone (${v.toFixed(1)})` };
  if (v <= 45) return { cls:'sig-bear', txt:`Bearish zone (${v.toFixed(1)})` };
  return { cls:'sig-neutral', txt:`Neutral (${v.toFixed(1)})` };
}

function intMACD(arr) {
  if (!arr?.length) return { cls:'sig-neutral', txt:'No data' };
  const last = arr[arr.length - 1];
  const prev = arr[arr.length - 2];
  if (!last) return { cls:'sig-neutral', txt:'Calculating...' };
  const cross_up   = prev && prev.MACD < prev.signal && last.MACD > last.signal;
  const cross_down = prev && prev.MACD > prev.signal && last.MACD < last.signal;
  if (cross_up)   return { cls:'sig-bull', txt:'Bullish Crossover ↑ — Buy signal' };
  if (cross_down) return { cls:'sig-bear', txt:'Bearish Crossover ↓ — Sell signal' };
  if (last.MACD > last.signal && last.histogram > 0) return { cls:'sig-bull', txt:`Bullish momentum (hist: +${last.histogram.toFixed(1)})` };
  if (last.MACD < last.signal && last.histogram < 0) return { cls:'sig-bear', txt:`Bearish momentum (hist: ${last.histogram.toFixed(1)})` };
  return { cls:'sig-neutral', txt:'Consolidating' };
}

function intBB(bb, price) {
  if (!bb) return { cls:'sig-neutral', txt:'No data' };
  const pct = (price - bb.lower) / (bb.upper - bb.lower);
  const bw  = (bb.upper - bb.lower) / bb.middle * 100;
  if (pct > 0.97) return { cls:'sig-bear', txt:`At Upper Band — Reversal zone. BW: ${bw.toFixed(1)}%` };
  if (pct < 0.03) return { cls:'sig-bull', txt:`At Lower Band — Bounce zone. BW: ${bw.toFixed(1)}%` };
  if (pct > 0.7)  return { cls:'sig-bull', txt:`Upper half (${(pct*100).toFixed(0)}%) — Bullish momentum` };
  if (pct < 0.3)  return { cls:'sig-bear', txt:`Lower half (${(pct*100).toFixed(0)}%) — Bearish pressure` };
  return { cls:'sig-neutral', txt:`Mid-band (${(pct*100).toFixed(0)}%) — Range-bound` };
}

function intEMA(price, e20, e50, e200) {
  let bull = 0, bear = 0, notes = [];
  if (e20)  { if (price > e20)  { bull++; notes.push(`P>EMA20(${e20.toFixed(0)})`); } else { bear++; notes.push(`P<EMA20(${e20.toFixed(0)})`); } }
  if (e50)  { if (price > e50)  { bull++; notes.push(`P>EMA50(${e50.toFixed(0)})`); } else { bear++; notes.push(`P<EMA50(${e50.toFixed(0)})`); } }
  if (e200) { if (price > e200) { bull++; notes.push(`P>EMA200`); }                  else { bear++; notes.push(`P<EMA200 ⚠`); } }
  if (e20 && e50) { if (e20 > e50) { bull++; notes.push('Golden X'); } else { bear++; notes.push('Death X'); } }
  const cls = bull > bear ? 'sig-bull' : bear > bull ? 'sig-bear' : 'sig-neutral';
  return { cls, txt: notes.slice(0, 3).join(' · ') };
}

function scoreMarket(ind, pcr, vix) {
  let sc = 50;
  const { rsi, macdArr, bb, e20, e50, price } = ind;
  if (rsi !== null) {
    if (rsi > 70) sc -= 15; else if (rsi < 30) sc += 15;
    else if (rsi > 58) sc += 8; else if (rsi < 42) sc -= 8;
  }
  if (macdArr?.length) {
    const last = macdArr[macdArr.length - 1];
    if (last?.histogram > 0) sc += 8; else if (last?.histogram < 0) sc -= 8;
  }
  if (bb && price) {
    const pct = (price - bb.lower) / (bb.upper - bb.lower);
    if (pct > 0.8) sc -= 8; else if (pct < 0.2) sc += 8;
  }
  if (e20) { if (price > e20) sc += 7; else sc -= 7; }
  if (e50) { if (price > e50) sc += 7; else sc -= 7; }
  if (pcr) { if (pcr > 1.2) sc += 8; else if (pcr < 0.8) sc -= 8; }
  if (vix) { if (vix < 14) sc += 5; else if (vix > 20) sc -= 10; else if (vix > 16) sc -= 5; }
  return Math.max(5, Math.min(95, Math.round(sc)));
}
