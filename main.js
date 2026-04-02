// ===== Main App Controller =====

const INDICES = [
  { id: 'nifty50', symbol: '^NSEI', name: 'Nifty 50' },
  { id: 'banknifty', symbol: '^NSEBANK', name: 'Bank Nifty' },
  { id: 'sensex', symbol: '^BSESN', name: 'Sensex' },
  { id: 'finnifty', symbol: 'NIFTY_FIN_SERVICE.NS', name: 'Fin Nifty' },
  { id: 'midcap', symbol: '^CNXMIDCAP', name: 'Mid Cap Nifty' },
];

// ---- Tab Navigation ----
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('tab-' + tab).classList.add('active');
    // Lazy load on tab switch
    if (tab === 'technicals' && !window._techLoaded) { loadTechChart(); window._techLoaded = true; }
    if (tab === 'options' && !window._optLoaded) { loadOptionsChain(); window._optLoaded = true; }
    if (tab === 'sentiment' && !window._sentLoaded) { loadSentimentData(); window._sentLoaded = true; }
  });
});

// ---- Overview: Load All Index Quotes ----
async function loadOverview() {
  await Promise.all(INDICES.map(loadIndexCard));
  await Promise.all([loadVIX(), loadBreadth(), loadFIISummary()]);
}

async function loadIndexCard(idx) {
  try {
    const [quote, candles] = await Promise.all([
      fetchQuote(idx.symbol),
      fetchHistorical(idx.symbol, '1d', '1mo')
    ]);
    if (!quote) return;

    const priceEl = document.getElementById(`price-${idx.id}`);
    const changeEl = document.getElementById(`change-${idx.id}`);
    const highEl = document.getElementById(`high-${idx.id}`);
    const lowEl = document.getElementById(`low-${idx.id}`);
    const card = document.getElementById(`card-${idx.id}`);

    if (priceEl) priceEl.textContent = '₹' + quote.price.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    if (highEl) highEl.textContent = quote.high.toFixed(0);
    if (lowEl) lowEl.textContent = quote.low.toFixed(0);

    if (changeEl) {
      const isUp = quote.change >= 0;
      changeEl.textContent = `${isUp ? '+' : ''}${quote.change.toFixed(2)} (${isUp ? '+' : ''}${quote.changePct.toFixed(2)}%)`;
      changeEl.className = 'card-change ' + (isUp ? 'up' : 'down');
    }

    // Color the card price
    if (priceEl) priceEl.style.color = quote.change >= 0 ? 'var(--green)' : 'var(--red)';

    // Mini chart
    if (candles && candles.length > 5) {
      createMiniChart(`mini-${idx.id}`, candles, quote.change >= 0);
    }

  } catch(e) { console.warn('Error loading card', idx.id, e); }
}

async function loadVIX() {
  const vix = await fetchVIX();
  if (!vix) return;
  const v = vix.price;
  const vixEl = document.getElementById('vixValue');
  const vixLabel = document.getElementById('vixLabel');
  const vixBar = document.getElementById('vixBar');
  if (vixEl) {
    vixEl.textContent = v.toFixed(1);
    vixEl.style.color = v < 14 ? 'var(--green)' : v < 20 ? 'var(--amber)' : 'var(--red)';
  }
  if (vixLabel) {
    const label = v < 14 ? 'Low Fear — Options Cheap' : v < 20 ? 'Moderate Volatility' : v < 28 ? 'High Fear — Options Expensive' : 'Extreme Fear';
    vixLabel.textContent = label;
    vixLabel.style.color = v < 14 ? 'var(--green)' : v < 20 ? 'var(--amber)' : 'var(--red)';
  }
  if (vixBar) vixBar.style.width = Math.min(100, (v / 40) * 100) + '%';
}

async function loadBreadth() {
  const b = await fetchMarketBreadth();
  const total = b.advances + b.declines + b.unchanged;
  document.getElementById('advCount').textContent = b.advances.toLocaleString();
  document.getElementById('decCount').textContent = b.declines.toLocaleString();
  document.getElementById('unchCount').textContent = b.unchanged.toLocaleString();
  const advPct = total > 0 ? (b.advances / total * 100) : 50;
  const decPct = total > 0 ? (b.declines / total * 100) : 50;
  document.getElementById('advBar').style.width = advPct.toFixed(1) + '%';
  document.getElementById('decBar').style.width = decPct.toFixed(1) + '%';
}

async function loadFIISummary() {
  const fiiData = await fetchFIIDII();
  if (!fiiData || !fiiData.length) return;
  const today = fiiData[0];
  const fiiNet = document.getElementById('fiiNet');
  const diiNet = document.getElementById('diiNet');
  const fiiNote = document.getElementById('fiiNote');
  if (fiiNet) {
    fiiNet.textContent = (today.fiiNet >= 0 ? '+' : '') + formatFII(today.fiiNet) + ' Cr';
    fiiNet.style.color = today.fiiNet >= 0 ? 'var(--green)' : 'var(--red)';
  }
  if (diiNet) {
    diiNet.textContent = (today.diiNet >= 0 ? '+' : '') + formatFII(today.diiNet) + ' Cr';
    diiNet.style.color = today.diiNet >= 0 ? 'var(--green)' : 'var(--red)';
  }
  if (fiiNote) fiiNote.textContent = `As of ${today.date} — Source: NSE`;
}

function formatFII(val) {
  const n = Math.abs(val);
  if (n >= 1000) return (val < 0 ? '-' : '') + (n / 100).toFixed(0);
  return val.toFixed(0);
}

// ---- Market Status ----
async function updateMarketStatus() {
  const status = await fetchMarketStatus();
  const dot = document.querySelector('.status-dot');
  const text = document.getElementById('statusText');
  if (status.isOpen) {
    dot.style.background = 'var(--green)';
    text.textContent = 'Market Open';
    text.style.color = 'var(--green)';
  } else {
    dot.style.background = 'var(--red)';
    dot.style.animation = 'none';
    text.textContent = 'Market Closed';
    text.style.color = 'var(--text-muted)';
  }
  document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';
}

// ---- Refresh All ----
async function refreshAll() {
  const btn = document.getElementById('refreshBtn');
  btn.textContent = '↻ Refreshing...';
  btn.disabled = true;

  // Clear cache
  Object.keys(cache).forEach(k => delete cache[k]);
  window._techLoaded = false;
  window._optLoaded = false;
  window._sentLoaded = false;

  await Promise.all([loadOverview(), updateMarketStatus()]);

  // Reload active tab
  const activeTab = document.querySelector('.tab-btn.active')?.dataset?.tab;
  if (activeTab === 'technicals') { loadTechChart(); window._techLoaded = true; }
  if (activeTab === 'options') { loadOptionsChain(); window._optLoaded = true; }
  if (activeTab === 'sentiment') { loadSentimentData(); window._sentLoaded = true; }

  btn.textContent = '↻ Refresh';
  btn.disabled = false;
}

// ---- Auto-refresh every 5 minutes during market hours ----
function startAutoRefresh() {
  setInterval(() => {
    if (isMarketHours()) {
      loadOverview();
      updateMarketStatus();
    }
  }, 5 * 60 * 1000);
}

// ---- Init ----
(async function init() {
  await updateMarketStatus();
  await loadOverview();
  startAutoRefresh();
})();
