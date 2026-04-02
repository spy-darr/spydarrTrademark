// ===== Chart Rendering with TradingView Lightweight Charts =====

const chartInstances = {};

function createMiniChart(containerId, candles, isUp) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  try {
    const chart = LightweightCharts.createChart(container, {
      width: container.offsetWidth || 160,
      height: 50,
      layout: { background: { color: 'transparent' }, textColor: 'transparent' },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: { mode: 0 },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false, borderVisible: false },
      handleScroll: false, handleScale: false,
    });
    const series = chart.addAreaSeries({
      lineColor: isUp ? '#10b981' : '#f43f5e',
      topColor: isUp ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)',
      bottomColor: 'transparent',
      lineWidth: 1.5,
      crossHairMarkerVisible: false,
    });
    const lineData = candles.slice(-30).map(c => ({ time: c.time, value: c.close }));
    series.setData(lineData);
    chart.timeScale().fitContent();
    chartInstances[containerId] = chart;
  } catch(e) { console.warn('Mini chart error:', e); }
}

let mainChart = null;
let mainCandleSeries = null;
let ema20Series = null, ema50Series = null, bbUpperSeries = null, bbMiddleSeries = null, bbLowerSeries = null;

function initMainChart(containerId, candles, indicators) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  mainChart = LightweightCharts.createChart(container, {
    width: container.offsetWidth,
    height: container.offsetHeight || 320,
    layout: { background: { color: 'transparent' }, textColor: '#94a3b8' },
    grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: 'rgba(56,189,248,0.15)', scaleMargins: { top: 0.05, bottom: 0.05 } },
    timeScale: { borderColor: 'rgba(56,189,248,0.15)', timeVisible: true },
    handleScroll: true, handleScale: true,
  });

  mainCandleSeries = mainChart.addCandlestickSeries({
    upColor: '#10b981', downColor: '#f43f5e',
    borderUpColor: '#10b981', borderDownColor: '#f43f5e',
    wickUpColor: '#10b981', wickDownColor: '#f43f5e',
  });

  const candleData = candles.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }));
  mainCandleSeries.setData(candleData);

  renderOverlayIndicators(candles, indicators);
  mainChart.timeScale().fitContent();

  // Responsive resize
  const resizeObserver = new ResizeObserver(() => {
    if (mainChart && container.offsetWidth > 0) {
      mainChart.applyOptions({ width: container.offsetWidth });
    }
  });
  resizeObserver.observe(container);
}

function renderOverlayIndicators(candles, indicators) {
  if (!mainChart) return;
  const closes = candles.map(c => c.close);
  const times = candles.map(c => c.time);

  // Remove old series
  [ema20Series, ema50Series, bbUpperSeries, bbMiddleSeries, bbLowerSeries].forEach(s => {
    try { if (s) mainChart.removeSeries(s); } catch(e){}
  });

  if (document.getElementById('tog-ema20')?.checked) {
    ema20Series = mainChart.addLineSeries({ color: '#38bdf8', lineWidth: 1.5, title: 'EMA20', priceLineVisible: false, lastValueVisible: false });
    const ema20Data = computeEMAArray(closes, 20).map((v, i) => ({ time: times[i + 20 - 1], value: v })).filter(d => d.value);
    if (ema20Data.length) ema20Series.setData(ema20Data);
  }

  if (document.getElementById('tog-ema50')?.checked) {
    ema50Series = mainChart.addLineSeries({ color: '#f59e0b', lineWidth: 1.5, title: 'EMA50', priceLineVisible: false, lastValueVisible: false });
    const ema50Data = computeEMAArray(closes, 50).map((v, i) => ({ time: times[i + 50 - 1], value: v })).filter(d => d.value);
    if (ema50Data.length) ema50Series.setData(ema50Data);
  }

  if (document.getElementById('tog-bb')?.checked) {
    bbUpperSeries = mainChart.addLineSeries({ color: 'rgba(139,92,246,0.5)', lineWidth: 1, title: 'BB Upper', priceLineVisible: false, lastValueVisible: false });
    bbMiddleSeries = mainChart.addLineSeries({ color: 'rgba(139,92,246,0.7)', lineWidth: 1, lineStyle: 1, title: 'BB Mid', priceLineVisible: false, lastValueVisible: false });
    bbLowerSeries = mainChart.addLineSeries({ color: 'rgba(139,92,246,0.5)', lineWidth: 1, title: 'BB Lower', priceLineVisible: false, lastValueVisible: false });
    const bbData = computeBBArray(closes, 20, 2);
    const upperData = bbData.map((b, i) => ({ time: times[i + 19], value: b.upper })).filter(d => d.value);
    const midData = bbData.map((b, i) => ({ time: times[i + 19], value: b.middle })).filter(d => d.value);
    const lowerData = bbData.map((b, i) => ({ time: times[i + 19], value: b.lower })).filter(d => d.value);
    if (upperData.length) { bbUpperSeries.setData(upperData); bbMiddleSeries.setData(midData); bbLowerSeries.setData(lowerData); }
  }
}

function computeEMAArray(closes, period) {
  const k = 2 / (period + 1);
  const result = new Array(period - 1).fill(null);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  closes.slice(period).forEach(v => { ema = v * k + ema * (1 - k); result.push(ema); });
  return result;
}

function computeBBArray(closes, period = 20, mult = 2) {
  const result = [];
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
    result.push({ upper: mean + mult * sd, middle: mean, lower: mean - mult * sd });
  }
  return result;
}

function renderIndicators() {
  if (window._lastCandles && window._lastIndicators) {
    renderOverlayIndicators(window._lastCandles, window._lastIndicators);
  }
}

// ---- MACD mini chart ----
function renderMACDBars(macdArr) {
  const container = document.getElementById('macdBars');
  if (!container || !macdArr) return;
  container.innerHTML = '';
  const max = Math.max(...macdArr.map(m => Math.abs(m.histogram || 0)));
  macdArr.forEach(m => {
    const bar = document.createElement('div');
    bar.className = 'macd-bar';
    const h = max > 0 ? Math.abs((m.histogram || 0) / max) * 40 : 2;
    bar.style.height = Math.max(2, h) + 'px';
    bar.style.background = (m.histogram || 0) >= 0 ? 'var(--green)' : 'var(--red)';
    bar.style.alignSelf = (m.histogram || 0) >= 0 ? 'flex-end' : 'flex-start';
    bar.style.opacity = '0.7';
    container.appendChild(bar);
  });
}

// ---- BB visual ----
function renderBBVisual(bb, price) {
  const container = document.getElementById('bbVisual');
  if (!container || !bb) return;
  const range = bb.upper - bb.lower;
  const pct = range > 0 ? ((price - bb.lower) / range * 100) : 50;
  container.innerHTML = `
    <div style="position:relative;height:100%;display:flex;align-items:center;">
      <div style="position:absolute;left:0;right:0;height:2px;background:rgba(139,92,246,0.3);top:50%;transform:translateY(-50%);">
        <div style="position:absolute;left:0;top:-8px;bottom:-8px;width:2px;background:rgba(139,92,246,0.5);"></div>
        <div style="position:absolute;right:0;top:-8px;bottom:-8px;width:2px;background:rgba(139,92,246,0.5);"></div>
        <div style="position:absolute;left:50%;top:-6px;bottom:-6px;width:1px;background:rgba(139,92,246,0.3);transform:translateX(-50%);"></div>
        <div style="position:absolute;left:${Math.max(0,Math.min(100,pct))}%;top:-6px;width:3px;height:12px;background:var(--accent);transform:translateX(-50%);border-radius:2px;margin-top:-3px;"></div>
      </div>
      <span style="position:absolute;left:0;bottom:0;font-size:9px;color:var(--text-muted);">${bb.lower.toFixed(0)}</span>
      <span style="position:absolute;right:0;bottom:0;font-size:9px;color:var(--text-muted);">${bb.upper.toFixed(0)}</span>
    </div>
  `;
}

// ---- EMA trend display ----
function renderEMATrend(price, ema20, ema50) {
  const container = document.getElementById('emaTrend');
  if (!container) return;
  const items = [
    { label: 'EMA20', value: ema20, bull: price > ema20 },
    { label: 'EMA50', value: ema50, bull: price > ema50 },
  ];
  container.innerHTML = items.map(item => `
    <div style="display:flex;flex-direction:column;gap:2px;flex:1;">
      <span style="font-size:9px;color:var(--text-muted);">${item.label}</span>
      <span style="font-size:12px;font-weight:600;color:${item.bull ? 'var(--green)' : 'var(--red)'}">${item.value ? item.value.toFixed(0) : '--'}</span>
      <span style="font-size:9px;color:${item.bull ? 'var(--green)' : 'var(--red)'}">${item.bull ? '▲ Above' : '▼ Below'}</span>
    </div>
  `).join('');
}

// ---- OI Chart ----
function renderOIChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (!data || data.length === 0) { container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:12px;">No data</div>'; return; }
  try {
    const chart = LightweightCharts.createChart(container, {
      width: container.offsetWidth, height: container.offsetHeight || 280,
      layout: { background: { color: 'transparent' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderColor: 'rgba(56,189,248,0.15)' },
      timeScale: { borderColor: 'rgba(56,189,248,0.15)', visible: false },
      handleScroll: false, handleScale: false,
    });
    const ceSeries = chart.addHistogramSeries({ color: 'rgba(16,185,129,0.7)', priceScaleId: 'right', title: 'CE OI' });
    const peSeries = chart.addHistogramSeries({ color: 'rgba(244,63,94,0.5)', priceScaleId: 'right', title: 'PE OI' });
    // Use strike as time approximation
    const baseTime = Math.floor(Date.now() / 1000) - data.length * 60;
    const ceData = data.map((d, i) => ({ time: baseTime + i * 60, value: d.ceOI / 100000 }));
    const peData = data.map((d, i) => ({ time: baseTime + i * 60, value: -(d.peOI / 100000) }));
    ceSeries.setData(ceData);
    peSeries.setData(peData);
    chart.timeScale().fitContent();
    chartInstances[containerId] = chart;
  } catch(e) { container.innerHTML = `<div style="color:var(--text-muted);font-size:11px;padding:8px;">${e.message}</div>`; }
}

function showChart(name, symbol) {
  document.getElementById('modalTitle').textContent = name + ' — Deep Analysis';
  document.getElementById('chartModal').classList.add('open');
  const container = document.getElementById('modalChartContainer');
  container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:var(--text-muted);">Loading chart...</div>';
  fetchHistorical(symbol, '1d', '1y').then(candles => {
    if (candles && candles.length > 0) {
      window._lastCandles = candles;
      const indicators = computeAllIndicators(candles);
      window._lastIndicators = indicators;
      initMainChart('modalChartContainer', candles, indicators);
      const indHtml = document.getElementById('modalIndicators');
      if (indHtml) {
        const rsiI = interpretRSI(indicators.rsi);
        const macdI = interpretMACD(indicators.macd);
        indHtml.innerHTML = `<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
          <span class="ind-signal ${rsiI.class}">RSI: ${rsiI.text}</span>
          <span class="ind-signal ${macdI.class}">MACD: ${macdI.text}</span>
          ${indicators.bb ? `<span class="ind-signal ${interpretBB(indicators.bb, indicators.currentPrice).class}">BB: ${interpretBB(indicators.bb, indicators.currentPrice).text}</span>` : ''}
          ${indicators.ema20 ? `<span class="ind-signal ${interpretEMA(indicators.currentPrice, indicators.ema20, indicators.ema50, indicators.ema200).class}">EMA: ${interpretEMA(indicators.currentPrice, indicators.ema20, indicators.ema50, indicators.ema200).text}</span>` : ''}
        </div>`;
      }
    }
  });
}

function closeModal(e) {
  if (e.target.id === 'chartModal') document.getElementById('chartModal').classList.remove('open');
}

async function loadTechChart() {
  const val = document.getElementById('techSymbol').value;
  const [symbol, name] = val.split('|');
  const interval = document.getElementById('techInterval').value;
  const range = interval === '1d' ? '3mo' : interval === '1wk' ? '1y' : '5y';
  const container = document.getElementById('mainChartContainer');
  container.innerHTML = '<div class="chart-placeholder">Loading...</div>';
  const candles = await fetchHistorical(symbol, interval, range);
  if (!candles || candles.length === 0) { container.innerHTML = '<div class="chart-placeholder">Failed to load — try refreshing</div>'; return; }
  window._lastCandles = candles;
  const indicators = computeAllIndicators(candles);
  window._lastIndicators = indicators;
  initMainChart('mainChartContainer', candles, indicators);
  updateIndicatorPanels(indicators);
}

function updateIndicatorPanels(indicators) {
  const { rsi, macd, bb, ema20, ema50, ema200, currentPrice } = indicators;

  // RSI
  const rsiEl = document.getElementById('rsiValue');
  const rsiBar = document.getElementById('rsiBar');
  const rsiSig = document.getElementById('rsiSignal');
  if (rsi !== null) {
    rsiEl.textContent = rsi.toFixed(1);
    rsiEl.style.color = rsi > 70 ? 'var(--red)' : rsi < 30 ? 'var(--green)' : 'var(--text-primary)';
    rsiBar.style.width = rsi + '%';
    const ri = interpretRSI(rsi);
    rsiSig.textContent = ri.text;
    rsiSig.className = 'ind-signal ' + ri.class;
  }

  // MACD
  if (macd && macd.length > 0) {
    const last = macd[macd.length - 1];
    if (last) {
      document.getElementById('macdValue').textContent = (last.MACD || 0).toFixed(2);
      renderMACDBars(macd);
      const mi = interpretMACD(macd);
      document.getElementById('macdSignal').textContent = mi.text;
      document.getElementById('macdSignal').className = 'ind-signal ' + mi.class;
    }
  }

  // BB
  if (bb) {
    document.getElementById('bbValue').textContent = currentPrice.toFixed(0);
    renderBBVisual(bb, currentPrice);
    const bi = interpretBB(bb, currentPrice);
    document.getElementById('bbSignal').textContent = bi.text;
    document.getElementById('bbSignal').className = 'ind-signal ' + bi.class;
  }

  // EMA
  if (ema20) {
    document.getElementById('emaValue').textContent = currentPrice.toFixed(0);
    renderEMATrend(currentPrice, ema20, ema50);
    const ei = interpretEMA(currentPrice, ema20, ema50, ema200);
    document.getElementById('emaSignal').textContent = ei.text;
    document.getElementById('emaSignal').className = 'ind-signal ' + ei.class;
  }
}
