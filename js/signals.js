// ===== AI Signal Engine v2 — Smart Analysis + Trade Tracker =====
// Works 100% offline via rules engine. Optionally enriches via Claude API if available.

// ---- Persistent Trade Book ----
let tradeBook = [];
try { tradeBook = JSON.parse(localStorage.getItem('nse_tradebook') || '[]'); } catch(e) { tradeBook = []; }
function saveTradeBook() { try { localStorage.setItem('nse_tradebook', JSON.stringify(tradeBook)); } catch(e) {} }

// ---- Main Entry Point ----
async function generateSignal() {
  const symbolName = document.getElementById('sigSymbol').value;
  const strategy   = document.getElementById('sigStrategy').value;
  const btn        = document.querySelector('.generate-btn');
  const container  = document.getElementById('signalMain');

  const symbolMap = { NIFTY50:'^NSEI', BANKNIFTY:'^NSEBANK', SENSEX:'^BSESN', FINNIFTY:'NIFTY_FIN_SERVICE.NS', MIDCAP:'^CNXMIDCAP' };
  const nseMap    = { NIFTY50:'NIFTY', BANKNIFTY:'BANKNIFTY', SENSEX:'SENSEX', FINNIFTY:'FINNIFTY', MIDCAP:'MIDCPNIFTY' };
  const lotMap    = { NIFTY50:75, BANKNIFTY:30, SENSEX:10, FINNIFTY:65, MIDCAP:75 };

  const yfSymbol = symbolMap[symbolName];
  const nseSymbol = nseMap[symbolName];
  const lotSize   = lotMap[symbolName];

  btn.disabled = true;
  container.innerHTML = `<div class="sig-loading"><div class="sig-spinner"></div>Fetching live market data...</div>`;

  try {
    const [quote, candles, optData, vixData, fiiData] = await Promise.all([
      fetchQuote(yfSymbol),
      fetchHistorical(yfSymbol, '1d', '6mo'),
      fetchOptionsChain(nseSymbol),
      fetchVIX(),
      fetchFIIDII()
    ]);

    container.innerHTML = `<div class="sig-loading"><div class="sig-spinner"></div>Running multi-factor analysis (${symbolName})...</div>`;

    const indicators    = (candles && candles.length > 50) ? computeAllIndicators(candles) : {};
    const currentPrice  = quote?.price || indicators.currentPrice || 0;

    let pcr = 1, maxPain = null;
    if (optData?.records?.data) {
      pcr      = computePCR(optData.records.data);
      maxPain  = computeMaxPain(optData.records.data);
    }

    const recentFII = (fiiData || []).slice(0, 3);
    const avgFII    = recentFII.length ? recentFII.reduce((a, d) => a + (d.fiiNet || 0), 0) / recentFII.length : 0;
    const vix       = vixData?.price || 15;

    // Core rules-based signal engine (no external API needed)
    const signal = computeSmartSignal({ symbolName, strategy, currentPrice, candles, indicators, pcr, maxPain, vix, avgFII, lotSize });

    // Try to enrich reasoning via Claude API — non-blocking, 10s timeout
    try {
      const aiText = await callClaudeWithTimeout(buildEnrichPrompt(signal, symbolName, currentPrice, indicators, pcr, vix, avgFII), 10000);
      if (aiText) {
        const parsed = safeParseJSON(aiText);
        if (parsed?.reasoning && parsed.reasoning.length > 20) signal.reasoning = parsed.reasoning;
        if (parsed?.risks)                                       signal.risks     = parsed.risks;
        if (parsed?.option_recommendation)                       signal.optRec    = parsed.option_recommendation;
      }
    } catch(e) { /* API unavailable — local engine output is fine */ }

    renderSignal(container, signal, symbolName, strategy, currentPrice, lotSize, pcr, vix);
    addToTradeBook(signal, symbolName, currentPrice, lotSize);
    renderTradeHistory();

  } catch(e) {
    console.error('Signal error:', e);
    container.innerHTML = `<div class="sig-loading" style="color:var(--red);">⚠ Error: ${e.message}. Check console for details.</div>`;
  } finally {
    btn.disabled = false;
  }
}

// ============================================================
// SMART SIGNAL ENGINE — Multi-factor rules + probabilistic
// ============================================================
function computeSmartSignal({ symbolName, strategy, currentPrice, candles, indicators, pcr, maxPain, vix, avgFII, lotSize }) {
  const { rsi, macd, bb, ema20, ema50, ema200, atr } = indicators;
  const price = currentPrice;
  let bull = 0, bear = 0;
  const reasons = [];

  // Factor 1: RSI
  if (rsi != null) {
    if      (rsi < 32) { bull += 2; reasons.push(`RSI ${rsi.toFixed(0)} — deeply oversold, high bounce probability`); }
    else if (rsi < 45) { bull += 1; reasons.push(`RSI ${rsi.toFixed(0)} — approaching oversold zone`); }
    else if (rsi > 68) { bear += 2; reasons.push(`RSI ${rsi.toFixed(0)} — overbought, pullback risk elevated`); }
    else if (rsi > 55) { bear += 1; reasons.push(`RSI ${rsi.toFixed(0)} — mildly stretched`); }
    else                reasons.push(`RSI ${rsi.toFixed(0)} — neutral`);
  }

  // Factor 2: MACD crossover
  if (macd && macd.length >= 2) {
    const l = macd[macd.length - 1], p = macd[macd.length - 2];
    if (l && p) {
      if      (p.MACD < p.signal && l.MACD > l.signal)             { bull += 2; reasons.push('MACD bullish crossover — momentum turning up'); }
      else if (p.MACD > p.signal && l.MACD < l.signal)             { bear += 2; reasons.push('MACD bearish crossunder — momentum turning down'); }
      else if (l.histogram > 0 && l.histogram > p.histogram)        { bull += 1; reasons.push('MACD histogram expanding bullishly'); }
      else if (l.histogram < 0 && l.histogram < p.histogram)        { bear += 1; reasons.push('MACD histogram expanding bearishly'); }
    }
  }

  // Factor 3: Bollinger Bands
  if (bb && price) {
    const pb = (price - bb.lower) / Math.max(1, bb.upper - bb.lower);
    if      (pb < 0.06) { bull += 2; reasons.push('Price at lower Bollinger Band — strong mean-reversion zone'); }
    else if (pb < 0.22) { bull += 1; reasons.push('Price near lower BB — watch for bounce'); }
    else if (pb > 0.94) { bear += 2; reasons.push('Price at upper Bollinger Band — overbought extreme'); }
    else if (pb > 0.78) { bear += 1; reasons.push('Price near upper BB — resistance zone'); }
  }

  // Factor 4: EMA structure
  if (ema20 && ema50 && price) {
    if      (price > ema20 && price > ema50 && ema20 > ema50) { bull += 2; reasons.push('Price above EMA20 & EMA50 in uptrend alignment'); }
    else if (price < ema20 && price < ema50 && ema20 < ema50) { bear += 2; reasons.push('Price below EMA20 & EMA50 in downtrend alignment'); }
    else if (price > ema20)                                    { bull += 1; reasons.push('Price above EMA20 — short-term bullish'); }
    else                                                        { bear += 1; reasons.push('Price below EMA20 — short-term bearish'); }
  }

  // Factor 5: PCR (put-call ratio)
  if (pcr) {
    if      (pcr > 1.4)  { bull += 2; reasons.push(`PCR ${pcr.toFixed(2)} — extreme put OI, contrarian bullish signal`); }
    else if (pcr > 1.15) { bull += 1; reasons.push(`PCR ${pcr.toFixed(2)} — put-heavy, mild bullish bias`); }
    else if (pcr < 0.7)  { bear += 2; reasons.push(`PCR ${pcr.toFixed(2)} — extreme call OI, contrarian bearish signal`); }
    else if (pcr < 0.85) { bear += 1; reasons.push(`PCR ${pcr.toFixed(2)} — call-heavy, mild bearish bias`); }
    else                  reasons.push(`PCR ${pcr.toFixed(2)} — balanced`);
  }

  // Factor 6: Max Pain gravity
  if (maxPain && price) {
    const pct = ((maxPain - price) / price) * 100;
    if      (pct > 1.5)  { bull += 1; reasons.push(`Max Pain ₹${maxPain} is ${pct.toFixed(1)}% above spot — expiry pull upward`); }
    else if (pct < -1.5) { bear += 1; reasons.push(`Max Pain ₹${maxPain} is ${Math.abs(pct).toFixed(1)}% below spot — expiry pull downward`); }
  }

  // Factor 7: VIX
  if (vix > 22) { bull += 1; reasons.push(`VIX ${vix.toFixed(1)} — fear elevated, contrarian buy opportunity`); }
  else if (vix < 12) reasons.push(`VIX ${vix.toFixed(1)} — complacency high, options cheap`);

  // Factor 8: FII flow
  if      (avgFII > 800)  { bull += 1; reasons.push(`FII net buying ₹${avgFII.toFixed(0)}Cr (3d avg) — strong institutional inflow`); }
  else if (avgFII < -800) { bear += 1; reasons.push(`FII net selling ₹${Math.abs(avgFII).toFixed(0)}Cr (3d avg) — institutional outflow`); }

  // Direction & confidence
  const net = bull - bear;
  let direction, confidence;
  if      (net >= 5)  { direction = 'BULLISH'; confidence = Math.min(9, 7 + Math.floor((net - 5) / 2)); }
  else if (net >= 3)  { direction = 'BULLISH'; confidence = 7; }
  else if (net >= 1)  { direction = 'BULLISH'; confidence = 6; }
  else if (net <= -5) { direction = 'BEARISH'; confidence = Math.min(9, 7 + Math.floor((Math.abs(net) - 5) / 2)); }
  else if (net <= -3) { direction = 'BEARISH'; confidence = 7; }
  else if (net <= -1) { direction = 'BEARISH'; confidence = 6; }
  else                { direction = 'NEUTRAL';  confidence = 4; }

  // Safe strategy: only trade if confidence >= 6 and net >= 2
  if (strategy === 'safe' && Math.abs(net) < 2) direction = 'NEUTRAL';

  // ---- Compute realistic entry / exit levels ----
  const atrVal  = atr && atr > 0 ? atr : price * 0.008;
  const mult    = strategy === 'safe' ? 0.9 : strategy === 'moderate' ? 1.3 : 2.0;
  const snap    = price > 50000 ? 100 : price > 20000 ? 50 : 25;
  const entry   = Math.round(price / snap) * snap;

  let target1, target2, stopLoss, strategyName, optRec;

  if (direction === 'BULLISH') {
    stopLoss = +(entry - atrVal * mult).toFixed(0);
    target1  = +(entry + atrVal * mult * 1.6).toFixed(0);
    target2  = +(entry + atrVal * mult * 3.0).toFixed(0);
    const ceATM = Math.round(price / snap) * snap;
    const ceOTM = ceATM + snap;
    const exp   = nextExpiryStr(symbolName);
    if (strategy === 'safe') {
      strategyName = 'Bull Call Spread';
      optRec = `Buy ${ceATM} CE + Sell ${ceOTM} CE (${exp}). Max loss = net debit paid. Max profit = ${snap} points × lot size. Break-even = ${ceATM} + net debit.`;
    } else if (strategy === 'moderate') {
      strategyName = 'Long ATM CE';
      optRec = `Buy ${ceATM} CE (${exp}). Book 50% at T1 ₹${target1}. Trail remaining to T2 ₹${target2}. Hard stop on index @ ₹${stopLoss}.`;
    } else {
      strategyName = 'Long OTM CE';
      optRec = `Buy ${ceOTM} CE (${exp}). High leverage play — premium may 2–4× if index moves ${snap}+ pts. Exit at ₹${target1} on index. Strict stop @ ₹${stopLoss}.`;
    }
  } else if (direction === 'BEARISH') {
    stopLoss = +(entry + atrVal * mult).toFixed(0);
    target1  = +(entry - atrVal * mult * 1.6).toFixed(0);
    target2  = +(entry - atrVal * mult * 3.0).toFixed(0);
    const peATM = Math.round(price / snap) * snap;
    const peOTM = peATM - snap;
    const exp   = nextExpiryStr(symbolName);
    if (strategy === 'safe') {
      strategyName = 'Bear Put Spread';
      optRec = `Buy ${peATM} PE + Sell ${peOTM} PE (${exp}). Max loss = net debit. Max profit = ${snap} pts × lot. Break-even = ${peATM} − net debit.`;
    } else if (strategy === 'moderate') {
      strategyName = 'Long ATM PE';
      optRec = `Buy ${peATM} PE (${exp}). Book 50% at T1 ₹${target1}. Trail remaining to T2 ₹${target2}. Stop on index @ ₹${stopLoss}.`;
    } else {
      strategyName = 'Long OTM PE';
      optRec = `Buy ${peOTM} PE (${exp}). High leverage — exit at ₹${target1} on index. Hard stop @ ₹${stopLoss}.`;
    }
  } else {
    strategyName = 'Iron Condor';
    stopLoss = +(entry - atrVal).toFixed(0);
    target1  = entry; target2 = entry;
    const atmS = Math.round(price / snap) * snap;
    const w    = snap * 2;
    const exp  = nextExpiryStr(symbolName);
    optRec = `Market lacks direction — Iron Condor preferred. Sell ${atmS + snap} CE + Buy ${atmS + snap + w} CE + Sell ${atmS - snap} PE + Buy ${atmS - snap - w} PE (${exp}). Profit if ${symbolName} stays between ${atmS - snap} and ${atmS + snap} till expiry.`;
  }

  const risk = Math.abs(entry - stopLoss);
  const rew  = Math.abs(target1 - entry);
  const rrRatio = risk > 0 ? (rew / risk).toFixed(1) : '1';

  const retPct1 = direction !== 'NEUTRAL' ? +((Math.abs(target1 - entry) / entry) * 100).toFixed(2) : 0;
  const retPct2 = direction !== 'NEUTRAL' ? +((Math.abs(target2 - entry) / entry) * 100).toFixed(2) : 0;

  const premEst = Math.max(10, +(price * (vix / 100) * Math.sqrt(daysToExpiry(symbolName) / 365) * 0.4).toFixed(0));

  const support1    = ema20  ? +ema20.toFixed(0)   : +(price * 0.985).toFixed(0);
  const support2    = ema50  ? +ema50.toFixed(0)   : +(price * 0.970).toFixed(0);
  const resistance1 = bb?.upper ? +bb.upper.toFixed(0) : +(price * 1.015).toFixed(0);
  const resistance2 = +(price * 1.030).toFixed(0);

  const capitalPct = strategy === 'safe' ? '2–3%' : strategy === 'moderate' ? '4–5%' : '5–8%';

  const reasoning = `${direction} signal with ${bull} bullish vs ${bear} bearish factors (net score: ${net > 0 ? '+' : ''}${net}). ` +
    `Key drivers: ${reasons.slice(0, 3).join('; ')}. ` +
    (maxPain ? `Max Pain at ₹${maxPain} provides options-market gravity reference. ` : '') +
    `Signal confidence ${confidence}/10 — ${confidence >= 7 ? 'suitable for entry' : confidence >= 5 ? 'enter with caution and smaller size' : 'borderline — wait for confirmation'}.`;

  const risks = direction === 'NEUTRAL'
    ? 'No clear edge — avoid directional bets. Wait for PCR to cross 1.2 (bull) or 0.8 (bear), or price to break key EMA with volume.'
    : direction === 'BULLISH'
    ? `Hard stop at ₹${stopLoss} (${((Math.abs(stopLoss - entry) / entry) * 100).toFixed(1)}% below entry). If VIX spikes above ${(vix + 4).toFixed(0)}, exit immediately. Global cues can gap against position overnight.`
    : `Hard stop at ₹${stopLoss} (${((Math.abs(stopLoss - entry) / entry) * 100).toFixed(1)}% above entry). Strong bounce from EMA50 ₹${ema50?.toFixed(0) || '--'} could invalidate the bear case.`;

  return {
    direction, confidence, strategyName, entryPrice: entry,
    target1, target2, stopLoss, riskReward: `1:${rrRatio}`,
    optRec, capitalPct, retPct1, retPct2,
    keyLevels: { support1, support2, resistance1, resistance2 },
    reasoning, risks,
    timeHorizon: strategy === 'safe' ? 'Weekly' : strategy === 'moderate' ? '2–3 Days' : 'Intraday–2 Days',
    premEst, lotSize, bull, bear, net
  };
}

function nextExpiryStr(symbol) {
  const now = new Date();
  const day = now.getDay();
  const dtu = (4 - day + 7) % 7 || 7;
  const exp = new Date(now);
  exp.setDate(exp.getDate() + dtu);
  return exp.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function daysToExpiry(symbol) {
  const now = new Date();
  const day = now.getDay();
  return (4 - day + 7) % 7 || 7;
}

// ---- Claude API enrichment (optional, non-blocking) ----
async function callClaudeWithTimeout(prompt, ms) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const d = await res.json();
    return d.content?.map(b => b.text || '').join('') || null;
  } catch(e) { clearTimeout(timer); return null; }
}

function buildEnrichPrompt(sig, sym, price, ind, pcr, vix, avgFII) {
  return `Expert NSE trader. Given pre-computed signal, respond ONLY with JSON (no markdown):
{"reasoning":"2-3 professional sentences","risks":"1 key risk","option_recommendation":"specific trade with strike, expiry, premium estimate"}

Signal: ${sig.direction} on ${sym} @ ₹${price.toFixed(0)} | Entry ₹${sig.entryPrice} | T1 ₹${sig.target1} | SL ₹${sig.stopLoss} | RR ${sig.riskReward}
RSI:${ind.rsi?.toFixed(1)||'N/A'} MACD:${ind.macd?.[ind.macd.length-1]?.histogram?.toFixed(1)||'N/A'} PCR:${pcr?.toFixed(2)||'N/A'} VIX:${vix?.toFixed(1)||'N/A'} FII:₹${avgFII?.toFixed(0)||'0'}Cr
Strategy: ${sig.strategyName}`;
}

function safeParseJSON(text) {
  try {
    const m = (text || '').replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch(e) { return null; }
}

// ============================================================
// RENDER SIGNAL
// ============================================================
function renderSignal(container, s, symbolName, strategy, price, lotSize, pcr, vix) {
  const isUp   = s.direction === 'BULLISH';
  const isDown = s.direction === 'BEARISH';
  const dc     = isUp ? 'var(--green)' : isDown ? 'var(--red)' : 'var(--amber)';
  const di     = isUp ? '↑' : isDown ? '↓' : '↔';
  const cc     = s.confidence >= 7 ? 'var(--green)' : s.confidence >= 5 ? 'var(--amber)' : 'var(--red)';
  const stars  = '●'.repeat(s.confidence) + '○'.repeat(10 - s.confidence);
  const riskPct = +((Math.abs(s.stopLoss - s.entryPrice) / s.entryPrice) * 100).toFixed(2);

  container.innerHTML = `
  <div style="padding:4px;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px;">${symbolName} · ₹${price.toFixed(0)} · ${new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
        <div style="font-family:var(--font-display);font-size:21px;font-weight:700;color:${dc};">${di} ${s.direction} — ${s.strategyName}</div>
        <div style="margin-top:4px;display:flex;gap:8px;font-size:10px;">
          <span style="color:var(--green);">${s.bull} ▲ Bullish</span>
          <span style="color:var(--red);">${s.bear} ▼ Bearish</span>
          <span style="color:var(--text-muted);">Net: ${s.net > 0 ? '+' : ''}${s.net}</span>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px;">Confidence</div>
        <div style="font-size:10px;color:${cc};letter-spacing:1px;">${stars}</div>
        <div style="font-size:20px;font-weight:700;color:${cc};">${s.confidence}/10</div>
      </div>
    </div>

    <!-- Trade levels -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">
      <div class="sig-metric" style="border-left:3px solid var(--accent);">
        <div class="sig-metric-label">Entry Level</div>
        <div class="sig-metric-value" style="color:var(--accent);">₹${s.entryPrice.toLocaleString('en-IN')}</div>
        <div style="font-size:9px;color:var(--text-muted);">Current ₹${price.toFixed(0)}</div>
      </div>
      <div class="sig-metric" style="border-left:3px solid var(--red);">
        <div class="sig-metric-label">Stop Loss</div>
        <div class="sig-metric-value" style="color:var(--red);">₹${s.stopLoss.toLocaleString('en-IN')}</div>
        <div style="font-size:9px;color:var(--red);">−${riskPct}% risk</div>
      </div>
      <div class="sig-metric" style="border-left:3px solid var(--amber);">
        <div class="sig-metric-label">Risk:Reward</div>
        <div class="sig-metric-value">${s.riskReward}</div>
        <div style="font-size:9px;color:var(--text-muted);">${s.capitalPct} capital</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
      <div class="sig-metric" style="border-left:3px solid var(--green);">
        <div class="sig-metric-label">Target 1 (50% exit)</div>
        <div class="sig-metric-value" style="color:var(--green);">₹${s.target1.toLocaleString('en-IN')}</div>
        <div style="font-size:10px;color:var(--green);font-weight:600;">+${s.retPct1}% return on index</div>
      </div>
      <div class="sig-metric" style="border-left:3px solid #10b981aa;">
        <div class="sig-metric-label">Target 2 (trail exit)</div>
        <div class="sig-metric-value" style="color:var(--green);">₹${s.target2.toLocaleString('en-IN')}</div>
        <div style="font-size:10px;color:var(--green);font-weight:600;">+${s.retPct2}% return on index</div>
      </div>
    </div>

    <!-- Option Rec -->
    <div style="background:rgba(56,189,248,0.07);border:1px solid rgba(56,189,248,0.2);border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-size:10px;color:var(--accent);font-weight:600;letter-spacing:.06em;margin-bottom:5px;">📋 OPTION RECOMMENDATION</div>
      <div style="font-size:12px;color:var(--text-primary);line-height:1.75;">${s.optRec}</div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:10px;font-size:10px;color:var(--text-muted);">
        <span>Est. ATM Premium: <strong style="color:var(--text-primary);">₹${s.premEst}</strong></span>
        <span>Lot: <strong style="color:var(--text-primary);">${lotSize} units</strong></span>
        <span>~1 lot cost: <strong style="color:var(--text-primary);">₹${(s.premEst * lotSize).toLocaleString('en-IN')}</strong></span>
        <span>Time: <strong style="color:var(--text-primary);">${s.timeHorizon}</strong></span>
      </div>
    </div>

    <!-- Key levels -->
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:rgba(255,255,255,0.03);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:11px;">
      <span style="font-size:9px;color:var(--text-muted);font-weight:600;">KEY LEVELS</span>
      <span>Supp: <span style="color:var(--green);">₹${s.keyLevels.support1}</span> / <span style="color:var(--green);">₹${s.keyLevels.support2}</span></span>
      <span style="color:var(--border-accent);">|</span>
      <span>Res: <span style="color:var(--red);">₹${s.keyLevels.resistance1}</span> / <span style="color:var(--red);">₹${s.keyLevels.resistance2}</span></span>
      <span style="color:var(--border-accent);">|</span>
      <span>PCR: <span style="color:${(pcr||1)>1.2?'var(--green)':(pcr||1)<0.8?'var(--red)':'var(--amber)'};">${pcr?.toFixed(2)||'--'}</span></span>
      <span style="color:var(--border-accent);">|</span>
      <span>VIX: <span style="color:${vix>20?'var(--red)':vix>15?'var(--amber)':'var(--green)'};">${vix?.toFixed(1)||'--'}</span></span>
    </div>

    <!-- Reasoning -->
    <div style="border-left:2px solid ${dc};padding-left:12px;margin-bottom:12px;">
      <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:4px;letter-spacing:.05em;">ANALYSIS</div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.8;">${s.reasoning}</div>
    </div>

    <!-- Risk -->
    <div style="background:rgba(244,63,94,0.05);border:1px solid rgba(244,63,94,0.15);border-radius:8px;padding:10px 12px;margin-bottom:12px;">
      <div style="font-size:10px;font-weight:600;color:var(--red);margin-bottom:4px;">⚠ RISK MANAGEMENT</div>
      <div style="font-size:11px;color:var(--text-secondary);line-height:1.7;">${s.risks}</div>
    </div>

    <!-- Tags + mark buttons -->
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
      <span class="sig-tag ${isUp?'sig-tag-bull':isDown?'sig-tag-bear':'sig-tag-neutral'}">${s.direction}</span>
      <span class="sig-tag sig-tag-info">${strategy.toUpperCase()} RISK</span>
      <span class="sig-tag sig-tag-neutral">Conf ${s.confidence}/10</span>
      <span class="sig-tag sig-tag-neutral">${s.timeHorizon}</span>
      <div style="margin-left:auto;display:flex;gap:5px;">
        <button onclick="markTradeResultById(${tradeBook[0]?.id},'WIN')"  style="font-size:10px;padding:4px 12px;background:var(--green-dim);color:var(--green);border:1px solid var(--green);border-radius:4px;cursor:pointer;font-family:var(--font-mono);">✓ Win</button>
        <button onclick="markTradeResultById(${tradeBook[0]?.id},'LOSS')" style="font-size:10px;padding:4px 12px;background:var(--red-dim);color:var(--red);border:1px solid var(--red);border-radius:4px;cursor:pointer;font-family:var(--font-mono);">✗ Loss</button>
      </div>
    </div>
  </div>`;
}

// ============================================================
// TRADE BOOK
// ============================================================
function addToTradeBook(s, symbolName, price, lotSize) {
  const trade = {
    id: Date.now(), symbol: symbolName, direction: s.direction,
    strategy: s.strategyName, entryPrice: s.entryPrice,
    target1: s.target1, target2: s.target2, stopLoss: s.stopLoss,
    retPct1: s.retPct1, retPct2: s.retPct2, riskReward: s.riskReward,
    confidence: s.confidence, optRec: s.optRec, premEst: s.premEst,
    lotSize, timeHorizon: s.timeHorizon, status: 'OPEN',
    actualReturn: null, actualPnL: null,
    generatedAt: new Date().toISOString(), generatedPrice: price
  };
  tradeBook.unshift(trade);
  if (tradeBook.length > 60) tradeBook = tradeBook.slice(0, 60);
  saveTradeBook();
}

function markTradeResultById(id, result) {
  const t = tradeBook.find(x => x.id === id);
  if (!t || t.status !== 'OPEN') return;
  if (result === 'WIN') {
    t.status       = 'WIN';
    t.actualReturn = +t.retPct1;
    t.actualPnL    = +((t.retPct1 / 100) * t.entryPrice * t.lotSize).toFixed(0);
  } else {
    t.status       = 'LOSS';
    t.actualReturn = -(+((Math.abs(t.stopLoss - t.entryPrice) / t.entryPrice) * 100).toFixed(2));
    t.actualPnL    = +((Math.abs(t.actualReturn) / 100) * t.entryPrice * t.lotSize * -1).toFixed(0);
  }
  saveTradeBook();
  renderTradeHistory();
}

function clearTradeBook() {
  if (confirm('Clear all trade history?')) { tradeBook = []; saveTradeBook(); renderTradeHistory(); }
}

function renderTradeHistory() {
  const container = document.getElementById('signalHistory');
  if (!container) return;

  const closed  = tradeBook.filter(t => t.status !== 'OPEN');
  const wins    = tradeBook.filter(t => t.status === 'WIN').length;
  const losses  = tradeBook.filter(t => t.status === 'LOSS').length;
  const open    = tradeBook.filter(t => t.status === 'OPEN').length;
  const wr      = closed.length > 0 ? ((wins / closed.length) * 100).toFixed(0) : '--';
  const totalPnL = tradeBook.filter(t => t.actualPnL != null).reduce((a, t) => a + t.actualPnL, 0);
  const avgRet  = closed.length > 0
    ? (tradeBook.filter(t => t.actualReturn != null).reduce((a, t) => a + parseFloat(t.actualReturn || 0), 0) / closed.length).toFixed(2)
    : '--';
  const wrNum   = parseFloat(wr);
  const wrColor = wrNum >= 60 ? 'var(--green)' : wrNum >= 45 ? 'var(--amber)' : 'var(--red)';

  const stats = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
      <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:8px;text-align:center;">
        <div style="font-size:9px;color:var(--text-muted);">Win Rate</div>
        <div style="font-size:20px;font-weight:700;color:${wrColor};">${wr}${wr!=='--'?'%':''}</div>
        <div style="font-size:9px;color:var(--text-muted);">${wins}W · ${losses}L · ${open} Open</div>
      </div>
      <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:8px;text-align:center;">
        <div style="font-size:9px;color:var(--text-muted);">Total P&amp;L</div>
        <div style="font-size:17px;font-weight:700;color:${totalPnL>=0?'var(--green)':'var(--red)'};">${totalPnL>=0?'+':''}₹${Math.abs(totalPnL).toLocaleString('en-IN')}</div>
        <div style="font-size:9px;color:var(--text-muted);">Avg return: ${avgRet}%</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <div style="font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:.05em;">TRADE LOG (${tradeBook.length})</div>
      ${tradeBook.length ? `<button onclick="clearTradeBook()" style="font-size:9px;background:none;border:1px solid var(--border);color:var(--text-muted);padding:2px 7px;border-radius:3px;cursor:pointer;">Clear All</button>` : ''}
    </div>`;

  if (!tradeBook.length) { container.innerHTML = stats + '<p style="text-align:center;color:var(--text-muted);font-size:12px;padding:16px;">No trades generated yet.</p>'; return; }

  const rows = tradeBook.slice(0, 20).map(t => {
    const sc = t.status === 'WIN' ? 'var(--green)' : t.status === 'LOSS' ? 'var(--red)' : 'var(--amber)';
    const dc = t.direction === 'BULLISH' ? 'var(--green)' : t.direction === 'BEARISH' ? 'var(--red)' : 'var(--amber)';
    const di = t.direction === 'BULLISH' ? '↑' : t.direction === 'BEARISH' ? '↓' : '↔';
    const dt = new Date(t.generatedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    return `<div style="padding:8px 4px;border-bottom:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
        <span style="font-size:11px;font-weight:700;color:${dc};">${di} ${t.symbol}</span>
        <span style="font-size:10px;font-weight:600;padding:1px 7px;border-radius:3px;background:${t.status==='WIN'?'var(--green-dim)':t.status==='LOSS'?'var(--red-dim)':'var(--amber-dim)'};color:${sc};">${t.status}</span>
      </div>
      <div style="font-size:9px;color:var(--text-muted);margin-bottom:3px;">${t.strategy} · ${dt} · Conf ${t.confidence}/10</div>
      <div style="display:flex;gap:8px;font-size:10px;margin-bottom:4px;">
        <span>E: <strong style="color:var(--accent);">₹${t.entryPrice}</strong></span>
        <span>T1: <strong style="color:var(--green);">₹${t.target1}</strong></span>
        <span>SL: <strong style="color:var(--red);">₹${t.stopLoss}</strong></span>
        <span style="color:var(--text-muted);">${t.riskReward}</span>
      </div>
      ${t.actualReturn != null
        ? `<div style="font-size:11px;font-weight:700;color:${parseFloat(t.actualReturn)>=0?'var(--green)':'var(--red)'};">
             ${parseFloat(t.actualReturn)>=0?'+':''}${t.actualReturn}% &nbsp;|&nbsp; P&amp;L: ${t.actualPnL>=0?'+':''}₹${Math.abs(t.actualPnL).toLocaleString('en-IN')}
           </div>`
        : `<div style="display:flex;gap:4px;">
             <button onclick="markTradeResultById(${t.id},'WIN')" style="flex:1;font-size:9px;padding:3px 0;background:var(--green-dim);color:var(--green);border:1px solid var(--green);border-radius:3px;cursor:pointer;font-family:var(--font-mono);">✓ Win</button>
             <button onclick="markTradeResultById(${t.id},'LOSS')" style="flex:1;font-size:9px;padding:3px 0;background:var(--red-dim);color:var(--red);border:1px solid var(--red);border-radius:3px;cursor:pointer;font-family:var(--font-mono);">✗ Loss</button>
           </div>`
      }
    </div>`;
  }).join('');

  container.innerHTML = stats + `<div style="overflow-y:auto;max-height:520px;">${rows}</div>`;
}

// Init on load
window.addEventListener('load', () => setTimeout(renderTradeHistory, 500));
