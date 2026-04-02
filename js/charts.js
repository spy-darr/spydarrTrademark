// ===== CHARTS =====

// ── Mini canvas sparkline ──
function drawMini(canvasId, candles, isUp) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 160;
  canvas.width = W * window.devicePixelRatio;
  canvas.height = 48 * window.devicePixelRatio;
  canvas.style.width = W + 'px';
  canvas.style.height = '48px';
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  const data = candles.slice(-40).map(c => c.close);
  if (!data.length) return;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pad = 3;
  const xs = (i) => pad + i * (W - pad * 2) / (data.length - 1);
  const ys = (v) => pad + (1 - (v - min) / range) * (48 - pad * 2);
  ctx.beginPath();
  data.forEach((v, i) => { i === 0 ? ctx.moveTo(xs(i), ys(v)) : ctx.lineTo(xs(i), ys(v)); });
  const color = isUp ? '#10b981' : '#f43f5e';
  const fillColor = isUp ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)';
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.lineTo(xs(data.length - 1), 48); ctx.lineTo(xs(0), 48); ctx.closePath();
  ctx.fillStyle = fillColor; ctx.fill();
}

// ── Lightweight Charts main chart ──
let _mainChart = null, _mainSeries = null, _overlaySeries = [];

function buildMainChart(containerId, candles, indicators) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (_mainChart) { try { _mainChart.remove(); } catch(e) {} _mainChart = null; }
  _overlaySeries = [];

  _mainChart = LightweightCharts.createChart(container, {
    width: container.clientWidth, height: container.clientHeight || 380,
    layout: { background: { color: 'transparent' }, textColor: '#94a3b8', fontSize: 11 },
    grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: 'rgba(56,189,248,0.15)', scaleMargins: { top: 0.08, bottom: 0.05 } },
    timeScale: { borderColor: 'rgba(56,189,248,0.15)', timeVisible: true, secondsVisible: false },
  });

  _mainSeries = _mainChart.addCandlestickSeries({
    upColor:'#10b981', downColor:'#f43f5e',
    borderUpColor:'#10b981', borderDownColor:'#f43f5e',
    wickUpColor:'rgba(16,185,129,0.7)', wickDownColor:'rgba(244,63,94,0.7)',
  });

  const cdata = candles.map(c => ({ time:c.time, open:c.open, high:c.high, low:c.low, close:c.close }));
  _mainSeries.setData(cdata);
  addOverlays(candles, indicators);
  _mainChart.timeScale().fitContent();

  // Responsive resize
  const ro = new ResizeObserver(() => { if (_mainChart && container.clientWidth > 0) _mainChart.applyOptions({ width: container.clientWidth }); });
  ro.observe(container);
}

function addOverlays(candles, ind) {
  if (!_mainChart || !candles.length) return;
  const closes = candles.map(c => c.close);
  const times  = candles.map(c => c.time);

  // Remove old overlays
  _overlaySeries.forEach(s => { try { _mainChart.removeSeries(s); } catch(e) {} });
  _overlaySeries = [];

  if (document.getElementById('togEma20')?.checked) {
    const s = _mainChart.addLineSeries({ color:'rgba(56,189,248,0.85)', lineWidth:1.5, title:'EMA20', priceLineVisible:false, lastValueVisible:true, crosshairMarkerVisible:false });
    const ev = ema(closes, 20);
    s.setData(ev.map((v,i) => v != null ? { time: times[i], value: v } : null).filter(Boolean));
    _overlaySeries.push(s);
  }
  if (document.getElementById('togEma50')?.checked) {
    const s = _mainChart.addLineSeries({ color:'rgba(245,158,11,0.85)', lineWidth:1.5, title:'EMA50', priceLineVisible:false, lastValueVisible:true, crosshairMarkerVisible:false });
    const ev = ema(closes, 50);
    s.setData(ev.map((v,i) => v != null ? { time: times[i], value: v } : null).filter(Boolean));
    _overlaySeries.push(s);
  }
  if (document.getElementById('togEma200')?.checked) {
    const s = _mainChart.addLineSeries({ color:'rgba(167,139,250,0.75)', lineWidth:1.5, title:'EMA200', priceLineVisible:false, lastValueVisible:true, crosshairMarkerVisible:false });
    const ev = ema(closes, 200);
    s.setData(ev.map((v,i) => v != null ? { time: times[i], value: v } : null).filter(Boolean));
    _overlaySeries.push(s);
  }
  if (document.getElementById('togBB')?.checked) {
    const bba = calcBBArray(closes);
    const bbTimes = times.slice(19);
    const addBBLine = (color, key) => {
      const s = _mainChart.addLineSeries({ color, lineWidth:1, lineStyle:LightweightCharts.LineStyle.Dashed, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
      s.setData(bba.map((b, i) => ({ time: bbTimes[i], value: b[key] })));
      _overlaySeries.push(s);
    };
    addBBLine('rgba(167,139,250,0.7)', 'upper');
    addBBLine('rgba(167,139,250,0.4)', 'middle');
    addBBLine('rgba(167,139,250,0.7)', 'lower');
  }
  if (document.getElementById('togVwap')?.checked && ind?.vwap) {
    const s = _mainChart.addLineSeries({ color:'rgba(251,191,36,0.8)', lineWidth:1, title:'VWAP', priceLineVisible:false, lastValueVisible:true, crosshairMarkerVisible:false });
    // Approximate VWAP as flat line at computed value
    s.setData(times.slice(-30).map(t => ({ time: t, value: ind.vwap })));
    _overlaySeries.push(s);
  }
}

function reRenderOverlays() {
  if (window._lastCandles && window._lastInd) addOverlays(window._lastCandles, window._lastInd);
}

async function loadTechChart() {
  const [sym, label] = (document.getElementById('techSym')?.value || '^NSEI|Nifty 50').split('|');
  const [interval, range] = (document.getElementById('techInt')?.value || '1d|3mo').split('|');
  const panel = document.getElementById('techChartDiv');
  const empty = document.getElementById('techEmpty');
  if (empty) empty.style.display = 'none';
  if (panel) panel.style.display = 'block';

  // Show loading
  if (panel) panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:380px;color:var(--muted)">Loading chart data...</div>';

  const candles = await getHistory(sym, interval, range);
  if (!candles?.length) {
    if (panel) panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:380px;color:var(--red)">Failed to load — try refreshing</div>';
    return;
  }
  window._lastCandles = candles;
  const ind = computeAll(candles);
  window._lastInd = ind;

  if (panel) panel.innerHTML = '';
  buildMainChart('techChartDiv', candles, ind);
  updateIndPanels(ind, candles);

  // Stats
  const s = document.getElementById('techStats');
  if (s && ind.e20) s.innerHTML = `<div>Price: <b>${ind.price.toFixed(0)}</b></div><div>EMA20: <b>${ind.e20?.toFixed(0)||'--'}</b></div><div>EMA50: <b>${ind.e50?.toFixed(0)||'--'}</b></div>${ind.e200?`<div>EMA200: <b>${ind.e200.toFixed(0)}</b></div>`:''}<div>ATR: <b>${ind.atr?.toFixed(0)||'--'}</b></div><div>VWAP: <b>${ind.vwap?.toFixed(0)||'--'}</b></div>`;
}

function updateIndPanels(ind, candles) {
  const { rsi, macdArr, bb, e20, e50, e200, price } = ind;

  // RSI
  const ri = intRSI(rsi);
  if (rsi !== null) {
    setText('rsiVal', rsi.toFixed(1));
    setStyle('rsiVal', 'color', rsi > 70 ? 'var(--red)' : rsi < 30 ? 'var(--green)' : 'var(--txt)');
    setStyle('rsiFill', 'width', rsi + '%');
    setHTML('rsiSig', `<span class="ind-sig ${ri.cls}">${ri.txt}</span>`);
  }

  // MACD
  if (macdArr?.length) {
    const last = macdArr[macdArr.length - 1];
    if (last) {
      setText('macdVal', (last.MACD || 0).toFixed(2));
      const mi = intMACD(macdArr);
      setHTML('macdSig', `<span class="ind-sig ${mi.cls}">${mi.txt}</span>`);
      // Histogram bars
      const max = Math.max(...macdArr.map(m => Math.abs(m.histogram || 0)), 0.01);
      setHTML('macdHist', macdArr.map(m => {
        const h = Math.max(2, Math.abs((m.histogram || 0) / max * 44));
        const col = (m.histogram || 0) >= 0 ? 'rgba(16,185,129,0.75)' : 'rgba(244,63,94,0.75)';
        const align = (m.histogram || 0) >= 0 ? 'flex-end' : 'flex-start';
        return `<div class="mh-bar" style="height:${h.toFixed(1)}px;background:${col};align-self:${align}"></div>`;
      }).join(''));
    }
  }

  // BB
  if (bb) {
    const bi = intBB(bb, price);
    setText('bbVal', price.toFixed(0));
    setHTML('bbVis', `<div style="position:relative;height:100%;display:flex;align-items:center;padding:0 4px">
      <div style="position:absolute;left:4px;right:4px;height:2px;background:rgba(167,139,250,0.25);border-radius:1px">
        <div style="position:absolute;left:0;top:-5px;bottom:-5px;width:1px;background:rgba(167,139,250,.6)"></div>
        <div style="position:absolute;right:0;top:-5px;bottom:-5px;width:1px;background:rgba(167,139,250,.6)"></div>
        <div style="position:absolute;left:50%;top:-4px;bottom:-4px;width:1px;background:rgba(167,139,250,.35);transform:translateX(-50%)"></div>
        <div style="position:absolute;left:${Math.max(0,Math.min(100,((price-bb.lower)/(bb.upper-bb.lower)*100))).toFixed(1)}%;top:-5px;width:3px;height:12px;background:var(--accent);transform:translateX(-50%);border-radius:2px;margin-top:-4px"></div>
      </div>
      <span style="position:absolute;left:4px;bottom:0;font-size:9px;color:var(--muted)">${bb.lower.toFixed(0)}</span>
      <span style="position:absolute;right:4px;bottom:0;font-size:9px;color:var(--muted)">${bb.upper.toFixed(0)}</span>
    </div>`);
    setHTML('bbSig', `<span class="ind-sig ${bi.cls}">${bi.txt}</span>`);
  }

  // EMA
  const ei = intEMA(price, e20, e50, e200);
  setText('emaVal', price.toFixed(0));
  setHTML('emaVis', [
    { lbl:'EMA20', val:e20, bull:price>e20 },
    { lbl:'EMA50', val:e50, bull:price>e50 },
  ].map(x => x.val ? `<div style="flex:1;text-align:center"><div style="font-size:9px;color:var(--muted)">${x.lbl}</div><div style="font-size:13px;font-weight:600;color:${x.bull?'var(--green)':'var(--red)'}">${x.val.toFixed(0)}</div><div style="font-size:9px;color:${x.bull?'var(--green)':'var(--red)'}">${x.bull?'▲ Above':'▼ Below'}</div></div>` : '').join(''));
  setHTML('emaSig', `<span class="ind-sig ${ei.cls}">${ei.txt}</span>`);
}

function setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
function setHTML(id, v) { const e = document.getElementById(id); if (e) e.innerHTML = v; }
function setStyle(id, prop, val) { const e = document.getElementById(id); if (e) e.style[prop] = val; }

// Deep Analyze Modal
async function deepAnalyze(key, yfSym, label) {
  document.getElementById('modalTitle').textContent = `${label} — Deep Analysis`;
  document.getElementById('modal').classList.add('open');
  const div = document.getElementById('modalChartDiv');
  div.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:var(--muted)">Loading...</div>';
  document.getElementById('modalIndLine').innerHTML = '';

  const candles = await getHistory(yfSym, '1d', '6mo');
  if (!candles?.length) { div.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:var(--red)">Failed to load</div>'; return; }

  const ind = computeAll(candles);
  div.innerHTML = '';

  // Temp build modal chart (reuse same function with modal container)
  const prevMain = _mainChart;
  _mainChart = null;
  buildMainChart('modalChartDiv', candles, ind);

  // Indicator pills
  const ri=intRSI(ind.rsi), mi=intMACD(ind.macdArr), bi=intBB(ind.bb, ind.price), ei=intEMA(ind.price, ind.e20, ind.e50, ind.e200);
  document.getElementById('modalIndLine').innerHTML = [
    `<span class="ind-sig ${ri.cls}">RSI: ${ri.txt}</span>`,
    `<span class="ind-sig ${mi.cls}">MACD: ${mi.txt}</span>`,
    `<span class="ind-sig ${bi.cls}">BB: ${bi.txt}</span>`,
    `<span class="ind-sig ${ei.cls}">EMA: ${ei.txt}</span>`,
    ind.atr ? `<span class="ind-sig sig-neutral">ATR: ${ind.atr.toFixed(0)}</span>` : '',
  ].join('');
}

function closeModal(e) { if (e.target.id === 'modal') document.getElementById('modal').classList.remove('open'); }
