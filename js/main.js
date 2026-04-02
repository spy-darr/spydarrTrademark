// ===== MAIN CONTROLLER =====

const INDICES_LIST = [
  { id:'nifty50',   yfSym:'^NSEI',               label:'Nifty 50' },
  { id:'banknifty', yfSym:'^NSEBANK',             label:'Bank Nifty' },
  { id:'sensex',    yfSym:'^BSESN',               label:'Sensex' },
  { id:'finnifty',  yfSym:'NIFTY_FIN_SERVICE.NS', label:'Fin Nifty' },
  { id:'midcap',    yfSym:'^CNXMIDCAP',           label:'Mid Cap Nifty' },
];

// ── Tab Navigation ──
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    // Lazy-load tabs
    if (tab === 'technicals'  && !window._techDone)  { loadTechChart();   window._techDone = true; }
    if (tab === 'options'     && !window._optDone)   { loadChain();       window._optDone = true; }
    if (tab === 'sentiment'   && !window._sentDone)  { loadSentiment();   window._sentDone = true; }
  });
});

// ── Market Status ──
async function updateStatus() {
  const open = isMarketOpen();
  const dot  = document.getElementById('mktDot');
  const txt  = document.getElementById('mktText');
  if (dot) { dot.style.background = open ? 'var(--green)' : 'var(--red)'; dot.style.animation = open ? 'pulse 2s infinite' : 'none'; }
  if (txt) { txt.textContent = open ? 'Market Open' : 'Market Closed'; txt.style.color = open ? 'var(--green)' : 'var(--txt2)'; }
  document.getElementById('updTime').textContent = new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'})+' IST';
}

// ── Load one index card ──
async function loadCard(idx) {
  const [quote, candles] = await Promise.all([
    getQuote(idx.yfSym),
    getHistory(idx.yfSym, '1d', '1mo'),
  ]);
  if (!quote?.price) return;

  const p = quote.price, chg = quote.change, pct = quote.changePct;
  const isUp = chg >= 0;

  // Price
  const pel = document.getElementById(`p-${idx.id}`);
  if (pel) { pel.textContent = fmtPrice(p); pel.style.color = isUp ? 'var(--green)' : 'var(--red)'; }

  // Change
  const cel = document.getElementById(`ch-${idx.id}`);
  if (cel) {
    cel.textContent = `${isUp?'+':''}${chg.toFixed(2)} (${isUp?'+':''}${pct.toFixed(2)}%)`;
    cel.className = `idx-chg ${isUp?'c-green':'c-red'}`;
  }

  // H/L/Vol
  setText(`h-${idx.id}`, quote.high.toFixed(0));
  setText(`l-${idx.id}`, quote.low.toFixed(0));
  setText(`v-${idx.id}`, fmtVol(quote.volume));

  // Mini chart
  if (candles?.length) drawMini(`mc-${idx.id}`, candles, isUp);
}

// ── VIX ──
async function loadVIXPanel() {
  const vix = await getVIX();
  const v = vix?.price || 15;
  const el = document.getElementById('vixNum');
  if (el) { el.textContent = v.toFixed(1); el.style.color = v<14?'var(--green)': v<20?'var(--amber)':'var(--red)'; }
  const desc = v<12?'Extreme Low — Buy Premium': v<16?'Low — Sell Premium Favored': v<20?'Moderate Volatility': v<26?'High Fear — Reduce Size':'Extreme Fear';
  const del = document.getElementById('vixDesc');
  if (del) { del.textContent = desc; del.style.color = v<14?'var(--green)': v<20?'var(--amber)':'var(--red)'; }
  const fill = document.getElementById('vixFill');
  if (fill) fill.style.width = Math.min(100, (v/40)*100) + '%';
}

// ── Market Breadth ──
async function loadBreadth() {
  const b = await getBreadth();
  const total = b.advances + b.declines + b.unchanged || 1;
  setText('brAdvN', b.advances.toLocaleString());
  setText('brDecN', b.declines.toLocaleString());
  setText('brUnchN', b.unchanged.toLocaleString());
  const ap = (b.advances / total * 100).toFixed(1);
  const dp = (b.declines / total * 100).toFixed(1);
  setStyle('brAdv', 'width', ap + '%');
  setStyle('brDec', 'width', dp + '%');
}

// ── FII Summary ──
async function loadFIISummary() {
  const fii = await getFIIDII();
  if (!fii?.length) return;
  const today = fii[0];
  const fe = document.getElementById('fiiVal');
  const de = document.getElementById('diiVal');
  const ne = document.getElementById('fiiNote');
  if (fe) { fe.textContent = `${today.fiiNet>=0?'+':''}${(today.fiiNet/100).toFixed(0)} Cr`; fe.style.color = today.fiiNet>=0?'var(--green)':'var(--red)'; }
  if (de) { de.textContent = `${today.diiNet>=0?'+':''}${(today.diiNet/100).toFixed(0)} Cr`; de.style.color = today.diiNet>=0?'var(--green)':'var(--red)'; }
  if (ne) ne.textContent = `As of ${today.date} — Source: NSE`;
}

// ── Full Overview ──
async function loadOverview() {
  await Promise.all([
    ...INDICES_LIST.map(loadCard),
    loadVIXPanel(),
    loadBreadth(),
    loadFIISummary(),
  ]);
}

// ── Refresh All ──
async function refreshAll() {
  const btn = document.querySelector('.btn-refresh');
  if (btn) { btn.textContent = '↻ Loading...'; btn.disabled = true; }

  // Clear cache
  Object.keys(CACHE).forEach(k => delete CACHE[k]);
  window._techDone = false;
  window._optDone  = false;
  window._sentDone = false;

  await Promise.all([updateStatus(), loadOverview()]);

  // Reload active tab
  const active = document.querySelector('.tab.active')?.dataset?.tab;
  if (active === 'technicals') { loadTechChart(); window._techDone = true; }
  if (active === 'options')    { loadChain();     window._optDone = true; }
  if (active === 'sentiment')  { loadSentiment(); window._sentDone = true; }

  if (btn) { btn.textContent = '↻ Refresh'; btn.disabled = false; }
}

// ── Auto-refresh every 5 min during market hours ──
function startAutoRefresh() {
  setInterval(() => {
    if (isMarketOpen()) {
      // Invalidate quote cache only
      Object.keys(CACHE).filter(k => k.includes('quote') || k.includes('v7/finance')).forEach(k => delete CACHE[k]);
      loadOverview();
      updateStatus();
    }
  }, 5 * 60 * 1000);
}

// ── INIT ──
(async () => {
  await updateStatus();
  await loadOverview();
  startAutoRefresh();
})();
