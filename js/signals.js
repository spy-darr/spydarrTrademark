// ===== AI Signal Engine — uses Claude API =====

const signalHistory = [];

async function generateSignal() {
  const symbolName = document.getElementById('sigSymbol').value;
  const strategy = document.getElementById('sigStrategy').value;
  const btn = document.querySelector('.generate-btn');
  const container = document.getElementById('signalMain');

  // Map to Yahoo Finance symbols
  const symbolMap = {
    'NIFTY50': '^NSEI', 'BANKNIFTY': '^NSEBANK', 'SENSEX': '^BSESN',
    'FINNIFTY': 'NIFTY_FIN_SERVICE.NS', 'MIDCAP': '^CNXMIDCAP'
  };
  const nseMap = { 'NIFTY50': 'NIFTY', 'BANKNIFTY': 'BANKNIFTY', 'SENSEX': 'SENSEX', 'FINNIFTY': 'FINNIFTY', 'MIDCAP': 'MIDCPNIFTY' };
  const yfSymbol = symbolMap[symbolName];
  const nseSymbol = nseMap[symbolName];

  btn.disabled = true;
  container.innerHTML = `<div class="sig-loading"><div class="sig-spinner"></div>Fetching market data & computing indicators...</div>`;

  try {
    // Gather all data
    const [quote, candles, optionsData, vixData, fiiData] = await Promise.all([
      fetchQuote(yfSymbol),
      fetchHistorical(yfSymbol, '1d', '3mo'),
      fetchOptionsChain(nseSymbol),
      fetchVIX(),
      fetchFIIDII()
    ]);

    container.innerHTML = `<div class="sig-loading"><div class="sig-spinner"></div>Running technical analysis...</div>`;

    const indicators = candles ? computeAllIndicators(candles) : {};
    const { rsi, macd, bb, ema20, ema50, atr } = indicators;
    const currentPrice = quote?.price || indicators.currentPrice || 0;

    // Compute PCR
    let pcr = 1, maxPain = null;
    if (optionsData?.records?.data) {
      pcr = computePCR(optionsData.records.data);
      maxPain = computeMaxPain(optionsData.records.data);
    }

    // Recent FII
    const recentFII = fiiData?.slice(0, 3) || [];
    const avgFII = recentFII.length ? recentFII.reduce((a, d) => a + (d.fiiNet || 0), 0) / recentFII.length : 0;

    // RSI / MACD interpretation
    const rsiI = interpretRSI(rsi);
    const macdI = interpretMACD(macd);
    const bbI = bb ? interpretBB(bb, currentPrice) : { signal: 'neutral', text: 'N/A' };
    const emaI = ema20 ? interpretEMA(currentPrice, ema20, ema50, null) : { signal: 'neutral', text: 'N/A' };
    const overallScore = computeOverallScore(indicators);

    container.innerHTML = `<div class="sig-loading"><div class="sig-spinner"></div>Asking AI to analyze & generate entry/exit...</div>`;

    // Build prompt for Claude
    const prompt = buildSignalPrompt({
      symbolName, yfSymbol, strategy, currentPrice,
      quote, rsi, macd: macd?.[macd.length-1], bb, ema20, ema50, atr,
      rsiSignal: rsiI.text, macdSignal: macdI.text, bbSignal: bbI.text, emaSignal: emaI.text,
      overallScore, pcr, maxPain, vix: vixData?.price, avgFII
    });

    // Call Claude API
    const aiResponse = await callClaudeAPI(prompt);
    const parsed = parseAIResponse(aiResponse);

    // Render signal
    renderSignal(container, parsed, symbolName, strategy, currentPrice, indicators, overallScore, pcr, vixData?.price);

    // Add to history
    addToHistory(symbolName, parsed, currentPrice);

  } catch(e) {
    console.error('Signal generation error:', e);
    container.innerHTML = `<div class="sig-loading" style="color:var(--red);">Error: ${e.message}. Please try again.</div>`;
  } finally {
    btn.disabled = false;
  }
}

function buildSignalPrompt(d) {
  const riskDesc = d.strategy === 'safe' ? 'conservative, capital-preservation focus with tight stop losses' :
                   d.strategy === 'moderate' ? 'moderate risk/reward with balanced position sizing' :
                   'aggressive with wider targets and accepting higher drawdown';

  return `You are an expert NSE options trader specializing in index derivatives. Analyze the following market data and provide a structured trading signal.

INSTRUMENT: ${d.symbolName} (${d.yfSymbol})
CURRENT PRICE: ₹${d.currentPrice?.toFixed(2) || 'N/A'}
RISK PROFILE: ${riskDesc}

TECHNICAL INDICATORS:
- RSI (14): ${d.rsi?.toFixed(2) || 'N/A'} → ${d.rsiSignal}
- MACD: ${d.macd ? `Line: ${d.macd.MACD?.toFixed(2)}, Signal: ${d.macd.signal?.toFixed(2)}, Histogram: ${d.macd.histogram?.toFixed(2)}` : 'N/A'} → ${d.macdSignal}
- Bollinger Bands: ${d.bb ? `Upper: ${d.bb.upper?.toFixed(0)}, Mid: ${d.bb.middle?.toFixed(0)}, Lower: ${d.bb.lower?.toFixed(0)}` : 'N/A'} → ${d.bbSignal}
- EMA 20: ${d.ema20?.toFixed(0) || 'N/A'}, EMA 50: ${d.ema50?.toFixed(0) || 'N/A'} → ${d.emaSignal}
- ATR (14): ${d.atr?.toFixed(0) || 'N/A'}
- Overall Momentum Score: ${d.overallScore}/100

DERIVATIVES DATA:
- Put-Call Ratio (PCR): ${d.pcr?.toFixed(2) || 'N/A'} (>1.2 bullish, <0.8 bearish)
- Max Pain Level: ₹${d.maxPain || 'N/A'}
- India VIX: ${d.vix?.toFixed(1) || 'N/A'}

INSTITUTIONAL FLOW:
- FII Net (3-day avg): ₹${d.avgFII?.toFixed(0) || 'N/A'} Cr

Based on this data, provide a JSON trading signal with this EXACT structure (respond ONLY with JSON, no explanation):
{
  "direction": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": 1-10,
  "strategy": "strategy name (e.g., Bull Call Spread, Long CE, Iron Condor, Long Put, Straddle)",
  "entry_price": number (index level to enter),
  "target_1": number,
  "target_2": number,
  "stop_loss": number,
  "risk_reward": "x:y format",
  "option_recommendation": "specific option recommendation e.g. Buy 24200 CE expiry DD-Mon",
  "position_size": "% of capital to deploy, e.g. 2-3% for safe",
  "key_levels": { "support_1": number, "support_2": number, "resistance_1": number, "resistance_2": number },
  "reasoning": "3-4 sentences explaining the signal based on the technical and derivative data",
  "risks": "1-2 key risks to watch",
  "time_horizon": "Intraday | 1-2 Days | Weekly | Monthly"
}`;
}

async function callClaudeAPI(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = await response.json();
  return data.content.map(b => b.text || '').join('');
}

function parseAIResponse(text) {
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch(e) {}
  // Fallback
  return {
    direction: 'NEUTRAL', confidence: 5, strategy: 'Wait & Watch',
    entry_price: 0, target_1: 0, target_2: 0, stop_loss: 0,
    risk_reward: '1:1', option_recommendation: 'Avoid new positions',
    position_size: '0%', key_levels: {},
    reasoning: text.slice(0, 300),
    risks: 'Unclear market direction — avoid trading until signal confirms.',
    time_horizon: '1-2 Days'
  };
}

function renderSignal(container, sig, symbolName, strategy, price, indicators, score, pcr, vix) {
  const dirClass = sig.direction === 'BULLISH' ? 'dir-bull' : sig.direction === 'BEARISH' ? 'dir-bear' : 'dir-neutral';
  const dirIcon = sig.direction === 'BULLISH' ? '↑' : sig.direction === 'BEARISH' ? '↓' : '→';
  const confidence = sig.confidence || 5;
  const confColor = confidence >= 7 ? 'var(--green)' : confidence >= 5 ? 'var(--amber)' : 'var(--red)';

  container.innerHTML = `
    <div class="signal-output">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div class="signal-direction ${dirClass}">${dirIcon} ${sig.direction} — ${sig.strategy}</div>
        <div style="text-align:right;">
          <div style="font-size:10px;color:var(--text-muted);">Confidence</div>
          <div style="font-size:18px;font-weight:600;color:${confColor};">${confidence}/10</div>
        </div>
      </div>

      <div class="signal-grid">
        <div class="sig-metric">
          <div class="sig-metric-label">Entry Level</div>
          <div class="sig-metric-value" style="color:var(--accent);">₹${(sig.entry_price||price).toFixed(0)}</div>
        </div>
        <div class="sig-metric">
          <div class="sig-metric-label">Target 1 / 2</div>
          <div class="sig-metric-value" style="color:var(--green);">₹${(sig.target_1||0).toFixed(0)} / ₹${(sig.target_2||0).toFixed(0)}</div>
        </div>
        <div class="sig-metric">
          <div class="sig-metric-label">Stop Loss</div>
          <div class="sig-metric-value" style="color:var(--red);">₹${(sig.stop_loss||0).toFixed(0)}</div>
        </div>
        <div class="sig-metric">
          <div class="sig-metric-label">Risk : Reward</div>
          <div class="sig-metric-value">${sig.risk_reward || '--'}</div>
        </div>
        <div class="sig-metric">
          <div class="sig-metric-label">Position Size</div>
          <div class="sig-metric-value">${sig.position_size || '--'}</div>
        </div>
        <div class="sig-metric">
          <div class="sig-metric-label">Time Horizon</div>
          <div class="sig-metric-value">${sig.time_horizon || '--'}</div>
        </div>
      </div>

      <div class="signal-strategy">
        <strong>📋 Option Recommendation:</strong> ${sig.option_recommendation || '--'}<br>
        ${sig.key_levels?.support_1 ? `<strong>Support:</strong> ₹${sig.key_levels.support_1} / ₹${sig.key_levels.support_2} &nbsp;|&nbsp; <strong>Resistance:</strong> ₹${sig.key_levels.resistance_1} / ₹${sig.key_levels.resistance_2}` : ''}
      </div>

      <div class="signal-tags">
        <span class="sig-tag sig-tag-info">PCR: ${pcr?.toFixed(2)||'--'}</span>
        <span class="sig-tag sig-tag-info">VIX: ${vix?.toFixed(1)||'--'}</span>
        <span class="sig-tag sig-tag-info">Score: ${score}/100</span>
        <span class="sig-tag ${sig.direction==='BULLISH'?'sig-tag-bull':sig.direction==='BEARISH'?'sig-tag-bear':'sig-tag-neutral'}">${sig.direction}</span>
        <span class="sig-tag sig-tag-neutral">${strategy.toUpperCase()} RISK</span>
      </div>

      <div class="signal-reasoning">
        <strong>Analysis:</strong> ${sig.reasoning || '--'}<br><br>
        <strong>⚠ Risks:</strong> ${sig.risks || '--'}
      </div>

      <div style="margin-top:12px;font-size:10px;color:var(--text-muted);">
        Generated at ${new Date().toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'})} IST — ${symbolName} @ ₹${price.toFixed(0)}
      </div>
    </div>
  `;
}

function addToHistory(symbolName, sig, price) {
  const item = { symbolName, sig, price, time: new Date() };
  signalHistory.unshift(item);
  const histContainer = document.getElementById('signalHistory');
  if (!histContainer) return;
  histContainer.innerHTML = signalHistory.slice(0, 8).map(h => {
    const dirColor = h.sig.direction === 'BULLISH' ? 'var(--green)' : h.sig.direction === 'BEARISH' ? 'var(--red)' : 'var(--amber)';
    return `<div class="hist-item">
      <div class="hist-header">
        <span class="hist-symbol">${h.symbolName}</span>
        <span class="hist-time">${h.time.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="hist-dir" style="color:${dirColor};">${h.sig.direction} — ${h.sig.strategy}</span>
        <span style="font-size:10px;color:var(--text-muted);">₹${h.price.toFixed(0)}</span>
      </div>
    </div>`;
  }).join('') || '<p class="no-history">No signals yet</p>';
}
