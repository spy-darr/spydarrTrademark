// ===== AI SIGNALS =====

async function generateSignal() {
  const parts   = (document.getElementById('sigSym')?.value || 'NIFTY50|^NSEI|NIFTY').split('|');
  const name    = parts[0], yfSym = parts[1], nseSym = parts[2];
  const risk    = document.getElementById('sigRisk')?.value || 'safe';
  const btn     = document.getElementById('genBtn');
  const main    = document.getElementById('sigMain');

  btn.disabled = true;
  main.innerHTML = `<div class="sig-loading"><div class="spinner"></div>Fetching live market data for ${name}...</div>`;

  try {
    // Fetch all required data in parallel
    main.innerHTML = `<div class="sig-loading"><div class="spinner"></div>Loading quotes, history, options chain, VIX, FII/DII...</div>`;
    const [quote, candles, chain, vix, fii] = await Promise.all([
      getQuote(yfSym),
      getHistory(yfSym, '1d', '3mo'),
      getNSEChain(nseSym),
      getVIX(),
      getFIIDII(),
    ]);

    main.innerHTML = `<div class="sig-loading"><div class="spinner"></div>Computing technical indicators...</div>`;
    const ind = candles?.length ? computeAll(candles) : {};

    // Options analysis
    const chainData = chain?.records?.data || chain?.filtered?.data || [];
    const spot = parseFloat(chain?.records?.underlyingValue || chain?.underlyingValue || quote?.price || 0);
    const atm = chainData.length ? findATM(chainData, spot) : spot;
    const pcr = chainData.length ? computePCR(chainData) : 1;
    const mp  = chainData.length ? computeMaxPain(chainData) : spot;

    // Expiry info
    const expiries = chain?.records?.expiryDates || chain?.expiryDates || [];
    const nearExp  = expiries[0] || 'nearest Thursday';
    const nextExp  = expiries[1] || 'next Thursday';

    // FII recent avg
    const fii3 = fii?.slice(0,3) || [];
    const avgFII = fii3.length ? fii3.reduce((a,d)=>a+d.fiiNet,0)/fii3.length : 0;
    const avgDII = fii3.length ? fii3.reduce((a,d)=>a+d.diiNet,0)/fii3.length : 0;

    // ATR for stop calc
    const atr = ind.atr || (spot * 0.008);

    // Get CE and PE LTPs near ATM for option pricing
    const atmRow    = chainData.find(d => d.strikePrice === atm) || {};
    const atmCE_ltp = parseFloat(atmRow.CE?.lastPrice || 0);
    const atmPE_ltp = parseFloat(atmRow.PE?.lastPrice || 0);
    const atmCE_iv  = parseFloat(atmRow.CE?.impliedVolatility || 16);
    const atmPE_iv  = parseFloat(atmRow.PE?.impliedVolatility || 18);

    // Nearby strikes for spread candidates
    const cfg = CFG.indices[name.toLowerCase()] || CFG.indices['nifty50'];
    const step = cfg?.step || 50;
    const lot  = cfg?.lot  || 75;

    // Build the comprehensive prompt
    const prompt = buildPrompt({
      name, yfSym, nseSym, risk,
      spot: spot || quote?.price || 0,
      atm, pcr, mp, nearExp, nextExp,
      step, lot,
      vix: vix?.price || 15,
      avgFII, avgDII,
      atr,
      rsi:    ind.rsi,
      macd:   ind.macdArr?.[ind.macdArr.length-1],
      bb:     ind.bb,
      e20:    ind.e20, e50: ind.e50, e200: ind.e200,
      atmCE_ltp, atmPE_ltp, atmCE_iv, atmPE_iv,
      rsiInterp:  intRSI(ind.rsi).txt,
      macdInterp: intMACD(ind.macdArr).txt,
      bbInterp:   intBB(ind.bb, ind.price).txt,
      emaInterp:  intEMA(ind.price, ind.e20, ind.e50, ind.e200).txt,
    });

    main.innerHTML = `<div class="sig-loading"><div class="spinner"></div>AI analysing all data and computing precise entry/exit levels...</div>`;
    const aiRaw = await callClaude(prompt);
    const sig   = parseSignal(aiRaw);
    renderSignal(main, sig, { name, spot: spot||quote?.price||0, risk, nearExp, nextExp, lot, step, pcr, mp, atm, vix: vix?.price, avgFII, atr });
    addToLog(name, sig, spot||quote?.price||0);

  } catch(e) {
    main.innerHTML = `<div class="sig-loading" style="color:var(--red)">Error: ${e.message}</div>`;
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

function buildPrompt(d) {
  const riskDetails = {
    safe:       { capital:'1-2%', sl:'0.5-0.8% of index', lot:'1 lot', desc:'Capital preservation — tight stops, defined-risk strategies only (spreads preferred over naked positions)' },
    moderate:   { capital:'3-5%', sl:'1.0-1.5% of index', lot:'1-2 lots', desc:'Balanced risk/reward — directional or slightly OTM options acceptable' },
    aggressive: { capital:'5-10%', sl:'1.5-2.5% of index', lot:'2-5 lots', desc:'Higher risk accepted — can use naked CE/PE, ATM straddle/strangle, larger positions' },
  }[d.risk];

  return `You are a professional NSE-certified options trader with 15 years of experience in Indian equity derivatives. Generate a PRECISE, HIGH-CONFIDENCE trade signal.

═══ LIVE MARKET DATA (${new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}) ═══

INSTRUMENT: ${d.name} (Yahoo: ${d.yfSym} | NSE: ${d.nseSym})
SPOT PRICE: ₹${d.spot.toFixed(2)}
ATM STRIKE: ₹${d.atm}
STEP SIZE:  ₹${d.step} | LOT SIZE: ${d.lot} units

═══ TECHNICAL INDICATORS ═══
RSI (14):          ${d.rsi?.toFixed(2) || 'N/A'} → ${d.rsiInterp}
MACD (12,26,9):    ${d.macd ? `Line: ${d.macd.MACD?.toFixed(2)}, Signal: ${d.macd.signal?.toFixed(2)}, Histogram: ${d.macd.histogram?.toFixed(2)}` : 'N/A'} → ${d.macdInterp}
Bollinger Bands:   ${d.bb ? `Upper: ₹${d.bb.upper?.toFixed(0)}, Mid: ₹${d.bb.middle?.toFixed(0)}, Lower: ₹${d.bb.lower?.toFixed(0)}` : 'N/A'} → ${d.bbInterp}
EMA 20:            ${d.e20?.toFixed(0) || 'N/A'} | EMA 50: ${d.e50?.toFixed(0) || 'N/A'} | EMA 200: ${d.e200?.toFixed(0) || 'N/A'} → ${d.emaInterp}
ATR (14):          ₹${d.atr?.toFixed(0) || 'N/A'} (daily expected range)

═══ OPTIONS / DERIVATIVES DATA ═══
Put-Call Ratio:    ${d.pcr?.toFixed(3)} ${d.pcr > 1.2 ? '→ Bearish extreme, watch for reversal' : d.pcr < 0.8 ? '→ Bullish extreme, watch for reversal' : '→ Neutral'}
Max Pain Level:    ₹${d.mp} ${Math.abs(d.spot - d.mp) < d.step * 2 ? '(Spot near Max Pain — expiry magnet)' : `(${d.spot > d.mp ? 'Spot above' : 'Spot below'} max pain by ₹${Math.abs(d.spot - d.mp).toFixed(0)})`}
Near Expiry:       ${d.nearExp}
Next Expiry:       ${d.nextExp}
ATM CE LTP:        ₹${d.atmCE_ltp.toFixed(1)} | IV: ${d.atmCE_iv.toFixed(1)}%
ATM PE LTP:        ₹${d.atmPE_ltp.toFixed(1)} | IV: ${d.atmPE_iv.toFixed(1)}%
India VIX:         ${d.vix?.toFixed(1)} ${d.vix < 14 ? '(Low — options cheap, buy premium)' : d.vix > 20 ? '(High — options expensive, sell premium)' : '(Moderate)'}

═══ INSTITUTIONAL FLOW (3-day avg) ═══
FII Net:  ₹${(d.avgFII/100).toFixed(0)} Cr ${d.avgFII >= 0 ? '(Buying — Bullish)' : '(Selling — Bearish)'}
DII Net:  ₹${(d.avgDII/100).toFixed(0)} Cr ${d.avgDII >= 0 ? '(Buying — Supportive)' : '(Selling)'}

═══ RISK PROFILE: ${d.risk.toUpperCase()} ═══
${riskDetails.desc}
Capital to deploy: ${riskDetails.capital} | Stop Loss budget: ${riskDetails.sl} | Position: ${riskDetails.lot}

═══ YOUR TASK ═══
1. Determine the PRIMARY DIRECTION (BULLISH/BEARISH/NEUTRAL) based on the CONFLUENCE of ALL indicators above.
2. Pick the SINGLE BEST options strategy for this exact setup.
3. Give EXACT STRIKE PRICES (multiples of ₹${d.step}) for the trade.
4. Give EXACT INDEX ENTRY LEVEL (where to enter based on spot).
5. Compute PRECISE Target and Stop Loss in both index points AND option premium.
6. Confidence must be based on actual indicator confluence — do NOT inflate artificially.

RESPOND ONLY WITH THIS JSON (no explanation, no markdown fences, no preamble):
{
  "direction": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": <integer 1-10>,
  "strategy_name": "<e.g. Bull Call Spread | Long CE | Long PE | Iron Condor | Short Strangle | Bear Put Spread | Straddle>",
  "index_entry": <exact spot level to enter, e.g. 22100>,
  "index_target1": <first target in index points>,
  "index_target2": <second target in index points>,
  "index_sl": <strict stop loss in index points>,
  "risk_reward": "<e.g. 1:2.5>",
  "time_horizon": "Intraday" | "1-2 Days" | "Weekly" | "Monthly",
  "position_size_pct": "<e.g. 1.5%>",
  "legs": [
    { "action": "BUY" | "SELL", "type": "CE" | "PE", "strike": <exact NSE strike>, "expiry": "<DD-MON-YYYY>", "ltp_approx": <approximate current LTP>, "target_premium": <premium target>, "sl_premium": <stop loss on premium> }
  ],
  "max_loss_per_lot": <max loss in rupees per lot, integer>,
  "max_profit_per_lot": <max profit in rupees per lot, integer>,
  "key_support1": <support level>,
  "key_support2": <second support>,
  "key_resistance1": <resistance level>,
  "key_resistance2": <second resistance>,
  "analysis": "<4-5 detailed sentences explaining WHY this trade makes sense — mention specific indicator values, PCR, VIX, FII flow>",
  "risk_factors": "<2-3 specific risks that would invalidate this trade>",
  "invalidation_level": <exact index price at which to exit immediately if wrong>
}`;
}

async function callClaude(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${r.statusText}`);
  const d = await r.json();
  return d.content.map(b => b.text || '').join('');
}

function parseSignal(text) {
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch(e) { console.warn('Parse error', e); }
  return { direction:'NEUTRAL', confidence:5, strategy_name:'Wait & Watch', analysis:text.slice(0,400), legs:[], risk_factors:'Signal parsing failed.', time_horizon:'--' };
}

function renderSignal(container, sig, ctx) {
  const { name, spot, risk, nearExp, lot, pcr, vix } = ctx;
  const dirCol = sig.direction==='BULLISH'?'var(--green)': sig.direction==='BEARISH'?'var(--red)':'var(--amber)';
  const dirIcon= sig.direction==='BULLISH'?'↑ ': sig.direction==='BEARISH'?'↓ ':'→ ';
  const confCol= sig.confidence>=8?'var(--green)': sig.confidence>=6?'var(--amber)':'var(--red)';

  const legsHtml = (sig.legs || []).map(leg => {
    const col = leg.action === 'BUY' ? 'var(--green)' : 'var(--red)';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px">
      <span style="color:${col};font-weight:600;min-width:40px">${leg.action}</span>
      <span style="min-width:30px">${leg.type}</span>
      <span style="color:var(--accent);font-weight:600;min-width:70px">₹${(leg.strike||0).toLocaleString('en-IN')}</span>
      <span style="color:var(--muted);min-width:90px">${leg.expiry||nearExp}</span>
      <span style="min-width:60px">LTP ≈ ₹${(leg.ltp_approx||0).toFixed(1)}</span>
      <span class="c-green">Tgt ₹${(leg.target_premium||0).toFixed(1)}</span>
      <span class="c-red">SL ₹${(leg.sl_premium||0).toFixed(1)}</span>
    </div>`;
  }).join('');

  container.innerHTML = `<div class="sig-out">
    <div class="sig-dir-row">
      <div class="sig-dir" style="color:${dirCol}">${dirIcon}${sig.direction} — ${sig.strategy_name}</div>
      <div class="sig-conf"><div class="sig-conf-lbl">Confidence</div><div class="sig-conf-num" style="color:${confCol}">${sig.confidence}/10</div></div>
    </div>

    <div class="sig-metrics">
      <div class="sm-box"><div class="sm-lbl">Index Entry</div><div class="sm-val c-accent">₹${(sig.index_entry||spot).toFixed(0)}</div></div>
      <div class="sm-box"><div class="sm-lbl">Target 1</div><div class="sm-val c-green">₹${(sig.index_target1||0).toFixed(0)}</div></div>
      <div class="sm-box"><div class="sm-lbl">Target 2</div><div class="sm-val c-green">₹${(sig.index_target2||0).toFixed(0)}</div></div>
      <div class="sm-box"><div class="sm-lbl">Stop Loss</div><div class="sm-val c-red">₹${(sig.index_sl||0).toFixed(0)}</div></div>
      <div class="sm-box"><div class="sm-lbl">Risk : Reward</div><div class="sm-val">${sig.risk_reward||'--'}</div></div>
      <div class="sm-box"><div class="sm-lbl">Time Horizon</div><div class="sm-val">${sig.time_horizon||'--'}</div></div>
    </div>

    ${legsHtml ? `<div class="sig-opt-box">
      <div class="sig-opt-title">📋 Trade Legs — Exact Strikes</div>
      ${legsHtml}
      <div class="sig-opt-meta">Lot size: ${lot} units &nbsp;|&nbsp; Max Loss/Lot: ₹${(sig.max_loss_per_lot||0).toLocaleString()} &nbsp;|&nbsp; Max Profit/Lot: ₹${(sig.max_profit_per_lot||0).toLocaleString()} &nbsp;|&nbsp; Capital: ${sig.position_size_pct||'--'}</div>
    </div>` : ''}

    <div class="sig-klevels">
      <strong style="color:var(--txt2)">Key Levels &nbsp;|&nbsp;</strong>
      <span class="c-green">Supp: ₹${(sig.key_support1||0).toFixed(0)} / ₹${(sig.key_support2||0).toFixed(0)}</span> &nbsp;|&nbsp;
      <span class="c-red">Res: ₹${(sig.key_resistance1||0).toFixed(0)} / ₹${(sig.key_resistance2||0).toFixed(0)}</span> &nbsp;|&nbsp;
      <span class="c-amber">Invalidation: ₹${(sig.invalidation_level||0).toFixed(0)}</span> &nbsp;|&nbsp;
      <span class="c-muted">PCR: ${(pcr||0).toFixed(2)} &nbsp;|&nbsp; VIX: ${(vix||0).toFixed(1)}</span>
    </div>

    <div class="sig-tags">
      <span class="sig-tag ${sig.direction==='BULLISH'?'st-bull':sig.direction==='BEARISH'?'st-bear':'st-neutral'}">${sig.direction}</span>
      <span class="sig-tag st-info">Conf ${sig.confidence}/10</span>
      <span class="sig-tag st-info">${risk.toUpperCase()} RISK</span>
      <span class="sig-tag st-neutral">${sig.time_horizon}</span>
      <span class="sig-tag st-info">${name}</span>
    </div>

    <div class="sig-analysis">${sig.analysis || '--'}</div>

    ${sig.risk_factors ? `<div class="sig-risk"><strong>⚠ Risk Factors:</strong> ${sig.risk_factors}</div>` : ''}

    <div class="sig-footer">Generated ${new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'})} IST · Spot ₹${(spot).toFixed(0)} · ${name}</div>
  </div>`;
}

function addToLog(name, sig, spot) {
  sigHistory.unshift({ name, sig, spot, ts: new Date() });
  const el = document.getElementById('sigLog');
  if (!el) return;
  el.innerHTML = sigHistory.slice(0, 10).map(h => {
    const col = h.sig.direction==='BULLISH'?'var(--green)': h.sig.direction==='BEARISH'?'var(--red)':'var(--amber)';
    return `<div class="sl-item">
      <div class="sl-top"><span class="sl-sym">${h.name}</span><span class="sl-time">${h.ts.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span></div>
      <div style="display:flex;justify-content:space-between">
        <span class="sl-dir" style="color:${col}">${h.sig.direction} — ${h.sig.strategy_name}</span>
        <span class="c-muted" style="font-size:10px">₹${h.spot.toFixed(0)}</span>
      </div>
      <div style="font-size:10px;color:var(--muted)">Conf: ${h.sig.confidence}/10 · Entry ₹${(h.sig.index_entry||0).toFixed(0)} · SL ₹${(h.sig.index_sl||0).toFixed(0)}</div>
    </div>`;
  }).join('');
}
