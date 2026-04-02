// ===== Technical Indicators Engine =====

function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  try {
    const result = technicalindicators.RSI.calculate({ values: closes, period });
    return result[result.length - 1];
  } catch(e) {
    // Manual fallback
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains / period, avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
}

function computeMACD(closes) {
  try {
    const result = technicalindicators.MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
    return result.slice(-12);
  } catch(e) {
    return computeMACDManual(closes);
  }
}

function computeMACDManual(closes) {
  const ema = (data, p) => {
    const k = 2 / (p + 1);
    let e = data.slice(0, p).reduce((a, b) => a + b, 0) / p;
    return data.slice(p).map(v => { e = v * k + e * (1 - k); return e; });
  };
  const fast = ema(closes, 12), slow = ema(closes, 26);
  const len = Math.min(fast.length, slow.length);
  const macdLine = fast.slice(fast.length - len).map((v, i) => v - slow[slow.length - len + i]);
  const signal = ema(macdLine, 9);
  return macdLine.slice(-12).map((v, i) => ({
    MACD: v, signal: signal[Math.max(0, signal.length - 12 + i)], histogram: v - (signal[Math.max(0, signal.length - 12 + i)] || 0)
  }));
}

function computeBollingerBands(closes, period = 20, stdDev = 2) {
  try {
    const result = technicalindicators.BollingerBands.calculate({ values: closes, period, stdDev });
    return result[result.length - 1];
  } catch(e) {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const sd = Math.sqrt(variance);
    return { upper: mean + stdDev * sd, middle: mean, lower: mean - stdDev * sd, pb: (closes[closes.length-1] - (mean - stdDev*sd)) / (stdDev*2*sd) };
  }
}

function computeEMA(closes, period) {
  if (closes.length < period) return null;
  try {
    const result = technicalindicators.EMA.calculate({ values: closes, period });
    return result[result.length - 1];
  } catch(e) {
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    closes.slice(period).forEach(v => { ema = v * k + ema * (1 - k); });
    return ema;
  }
}

function computeAllIndicators(candles) {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  const rsi = computeRSI(closes);
  const macd = computeMACD(closes);
  const bb = computeBollingerBands(closes);
  const ema20 = computeEMA(closes, 20);
  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const currentPrice = closes[closes.length - 1];

  // Stochastic
  let stoch = null;
  try {
    const s = technicalindicators.Stochastic.calculate({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 });
    stoch = s[s.length - 1];
  } catch(e) {}

  // ATR
  let atr = null;
  try {
    const a = technicalindicators.ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
    atr = a[a.length - 1];
  } catch(e) {}

  return { rsi, macd, bb, ema20, ema50, ema200, currentPrice, stoch, atr, closes };
}

function interpretRSI(rsi) {
  if (rsi === null) return { signal: 'neutral', text: 'Insufficient data', class: 'signal-neutral' };
  if (rsi >= 70) return { signal: 'bear', text: `Overbought (${rsi.toFixed(1)}) — Bearish`, class: 'signal-bear' };
  if (rsi <= 30) return { signal: 'bull', text: `Oversold (${rsi.toFixed(1)}) — Bullish`, class: 'signal-bull' };
  if (rsi >= 55) return { signal: 'bull', text: `Bullish Zone (${rsi.toFixed(1)})`, class: 'signal-bull' };
  if (rsi <= 45) return { signal: 'bear', text: `Bearish Zone (${rsi.toFixed(1)})`, class: 'signal-bear' };
  return { signal: 'neutral', text: `Neutral (${rsi.toFixed(1)})`, class: 'signal-neutral' };
}

function interpretMACD(macdArr) {
  if (!macdArr || macdArr.length < 2) return { signal: 'neutral', text: 'Insufficient data', class: 'signal-neutral' };
  const last = macdArr[macdArr.length - 1];
  const prev = macdArr[macdArr.length - 2];
  if (!last || !prev) return { signal: 'neutral', text: 'Calculating...', class: 'signal-neutral' };
  const crossover = prev.MACD < prev.signal && last.MACD > last.signal;
  const crossunder = prev.MACD > prev.signal && last.MACD < last.signal;
  if (crossover) return { signal: 'bull', text: 'Bullish Crossover ↑', class: 'signal-bull' };
  if (crossunder) return { signal: 'bear', text: 'Bearish Crossunder ↓', class: 'signal-bear' };
  if (last.MACD > last.signal && last.histogram > 0) return { signal: 'bull', text: 'Bullish momentum', class: 'signal-bull' };
  if (last.MACD < last.signal && last.histogram < 0) return { signal: 'bear', text: 'Bearish momentum', class: 'signal-bear' };
  return { signal: 'neutral', text: 'Consolidating', class: 'signal-neutral' };
}

function interpretBB(bb, price) {
  if (!bb) return { signal: 'neutral', text: 'Calculating...', class: 'signal-neutral' };
  const pb = (price - bb.lower) / (bb.upper - bb.lower);
  if (pb > 0.95) return { signal: 'bear', text: 'Near Upper Band — Overbought', class: 'signal-bear' };
  if (pb < 0.05) return { signal: 'bull', text: 'Near Lower Band — Oversold', class: 'signal-bull' };
  if (pb > 0.6) return { signal: 'bull', text: 'Upper Half — Bullish', class: 'signal-bull' };
  if (pb < 0.4) return { signal: 'bear', text: 'Lower Half — Bearish', class: 'signal-bear' };
  return { signal: 'neutral', text: 'Mid-band — Neutral', class: 'signal-neutral' };
}

function interpretEMA(price, ema20, ema50, ema200) {
  const signals = [];
  let bullCount = 0, bearCount = 0;
  if (ema20 && price > ema20) { bullCount++; signals.push('Price > EMA20'); } else if (ema20) { bearCount++; signals.push('Price < EMA20'); }
  if (ema50 && price > ema50) { bullCount++; signals.push('Price > EMA50'); } else if (ema50) { bearCount++; signals.push('Price < EMA50'); }
  if (ema20 && ema50 && ema20 > ema50) { bullCount++; signals.push('EMA20 > EMA50 (Golden)'); } else if (ema20 && ema50) { bearCount++; signals.push('EMA20 < EMA50 (Death)'); }
  const dominant = bullCount > bearCount ? 'bull' : bearCount > bullCount ? 'bear' : 'neutral';
  return { signal: dominant, text: signals.slice(0, 2).join(' · '), class: dominant === 'bull' ? 'signal-bull' : dominant === 'bear' ? 'signal-bear' : 'signal-neutral' };
}

function computeOverallScore(indicators) {
  const { rsi, macd, bb, ema20, ema50, ema200, currentPrice } = indicators;
  let score = 50;
  // RSI
  if (rsi !== null) {
    if (rsi > 70) score -= 15;
    else if (rsi < 30) score += 15;
    else if (rsi > 55) score += 8;
    else if (rsi < 45) score -= 8;
  }
  // MACD
  if (macd && macd.length > 0) {
    const last = macd[macd.length - 1];
    if (last) {
      if (last.histogram > 0) score += 10;
      else if (last.histogram < 0) score -= 10;
    }
  }
  // BB
  if (bb && currentPrice) {
    const pb = (currentPrice - bb.lower) / (bb.upper - bb.lower);
    if (pb > 0.7) score -= 8;
    else if (pb < 0.3) score += 8;
  }
  // EMA
  if (ema20 && currentPrice > ema20) score += 7;
  else if (ema20 && currentPrice < ema20) score -= 7;
  if (ema50 && currentPrice > ema50) score += 7;
  else if (ema50 && currentPrice < ema50) score -= 7;
  if (ema200 && currentPrice > ema200) score += 3;
  else if (ema200 && currentPrice < ema200) score -= 3;

  return Math.max(5, Math.min(95, Math.round(score)));
}
