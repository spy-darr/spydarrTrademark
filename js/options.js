// ===== OPTIONS CHAIN =====

let _chainData = null;

async function loadChain() {
  const sym = document.getElementById('optSym')?.value || 'NIFTY';
  document.getElementById('optBody').innerHTML = '<tr><td colspan="11" class="tbl-empty">Loading options chain...</td></tr>';
  document.getElementById('oiBar').innerHTML = '';
  document.getElementById('oiChgBar').innerHTML = '';

  const chain = await getNSEChain(sym);
  if (!chain) { document.getElementById('optBody').innerHTML = '<tr><td colspan="11" class="tbl-empty">Failed — using demo data</td></tr>'; return; }
  _chainData = chain;

  // Populate expiry dropdown
  const expSel = document.getElementById('optExp');
  const expiries = chain.expiryDates || chain.records?.expiryDates || [];
  if (expiries.length) {
    expSel.innerHTML = expiries.slice(0, 6).map(e => `<option value="${e}">${e}</option>`).join('');
  }
  renderChainForExpiry();
}

function renderChainForExpiry() {
  if (!_chainData) return;
  const expiry = document.getElementById('optExp')?.value;
  const allData = _chainData.records?.data || _chainData.filtered?.data || [];
  const spot = parseFloat(_chainData.records?.underlyingValue || _chainData.underlyingValue || 0);

  const rows = expiry ? allData.filter(r => r.expiryDate === expiry) : allData;

  // Compute ATM, PCR, Max Pain
  const atm = findATM(rows, spot);
  const pcr = computePCR(rows);
  const mp  = computeMaxPain(rows);

  document.getElementById('atmVal').textContent  = atm ? atm.toLocaleString('en-IN') : '--';
  document.getElementById('spotVal').textContent = spot ? fmtPrice(spot) : '--';
  document.getElementById('mpVal').textContent   = mp  ? mp.toLocaleString('en-IN') : '--';
  const pcrEl = document.getElementById('pcrVal');
  if (pcrEl && pcr) {
    pcrEl.textContent = pcr.toFixed(2);
    pcrEl.className = pcr > 1.2 ? 'c-green' : pcr < 0.8 ? 'c-red' : 'c-amber';
  }

  renderChainTable(rows, atm, mp);
  renderOIBars(rows, atm);
  renderOIChgBars(rows, atm);
}

function findATM(data, spot) {
  if (!data.length) return spot;
  const strikes = [...new Set(data.map(d => d.strikePrice))].sort((a,b)=>a-b);
  let best = strikes[0], bestD = Math.abs(strikes[0] - spot);
  strikes.forEach(s => { const d = Math.abs(s - spot); if (d < bestD) { bestD = d; best = s; } });
  return best;
}

function computePCR(data) {
  let ceOI = 0, peOI = 0;
  data.forEach(d => { ceOI += parseInt(d.CE?.openInterest || 0); peOI += parseInt(d.PE?.openInterest || 0); });
  return ceOI > 0 ? peOI / ceOI : 1;
}

function computeMaxPain(data) {
  const strikes = [...new Set(data.map(d => d.strikePrice))].sort((a,b)=>a-b);
  let minPain = Infinity, best = strikes[0];
  strikes.forEach(s => {
    let loss = 0;
    data.forEach(d => {
      const ceOI = parseInt(d.CE?.openInterest || 0);
      const peOI = parseInt(d.PE?.openInterest || 0);
      if (s > d.strikePrice) loss += ceOI * (s - d.strikePrice);
      if (s < d.strikePrice) loss += peOI * (d.strikePrice - s);
    });
    if (loss < minPain) { minPain = loss; best = s; }
  });
  return best;
}

function renderChainTable(data, atm, maxPain) {
  const tbody = document.getElementById('optBody');
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="11" class="tbl-empty">No data</td></tr>'; return; }
  const strikes = [...new Set(data.map(d => d.strikePrice))].sort((a,b)=>a-b);
  const atmIdx = strikes.indexOf(atm);
  const lo = Math.max(0, atmIdx - 10), hi = Math.min(strikes.length, atmIdx + 11);
  const display = strikes.slice(lo, hi);

  tbody.innerHTML = display.map(st => {
    const row = data.find(d => d.strikePrice === st) || { strikePrice: st };
    const ce = row.CE || {}, pe = row.PE || {};
    const isATM = st === atm, isMP = st === maxPain;
    const ceOI  = parseInt(ce.openInterest || 0);
    const peOI  = parseInt(pe.openInterest || 0);
    const ceChg = parseInt(ce.changeinOpenInterest || 0);
    const peChg = parseInt(pe.changeinOpenInterest || 0);
    const cls = isATM ? 'atm-row' : isMP ? 'max-pain-row' : '';
    return `<tr class="${cls}">
      <td class="ce-cell">${fmtOI(ceOI/100000)}</td>
      <td class="ce-cell ${ceChg>=0?'oi-pos':'oi-neg'}">${ceChg>=0?'+':''}${fmtOI(ceChg/100000)}</td>
      <td class="ce-cell">${fmtOI(parseInt(ce.totalTradedVolume||0)/1000)}K</td>
      <td class="ce-cell">${ce.impliedVolatility?parseFloat(ce.impliedVolatility).toFixed(1)+'%':'--'}</td>
      <td class="ce-cell" style="font-weight:600">₹${parseFloat(ce.lastPrice||0).toFixed(1)}</td>
      <td class="sk-cell">${st.toLocaleString('en-IN')}${isATM?' ⬡':''}${isMP?' ⚡':''}</td>
      <td class="pe-cell" style="font-weight:600">₹${parseFloat(pe.lastPrice||0).toFixed(1)}</td>
      <td class="pe-cell">${pe.impliedVolatility?parseFloat(pe.impliedVolatility).toFixed(1)+'%':'--'}</td>
      <td class="pe-cell">${fmtOI(parseInt(pe.totalTradedVolume||0)/1000)}K</td>
      <td class="pe-cell ${peChg>=0?'oi-pos':'oi-neg'}">${peChg>=0?'+':''}${fmtOI(peChg/100000)}</td>
      <td class="pe-cell">${fmtOI(peOI/100000)}</td>
    </tr>`;
  }).join('');
}

function renderOIBars(data, atm) {
  renderBarChart('oiBar', data, atm, 'oi');
}
function renderOIChgBars(data, atm) {
  renderBarChart('oiChgBar', data, atm, 'chg');
}

function renderBarChart(containerId, data, atm, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const strikes = [...new Set(data.map(d => d.strikePrice))].sort((a,b)=>a-b);
  const atmIdx = strikes.indexOf(atm);
  const display = strikes.slice(Math.max(0,atmIdx-8), Math.min(strikes.length, atmIdx+9));

  const rows = display.map(s => {
    const r = data.find(d => d.strikePrice === s) || {};
    return {
      s, isATM: s === atm,
      ceV: type === 'oi' ? parseInt(r.CE?.openInterest||0) : parseInt(r.CE?.changeinOpenInterest||0),
      peV: type === 'oi' ? parseInt(r.PE?.openInterest||0) : parseInt(r.PE?.changeinOpenInterest||0),
    };
  });

  const maxV = Math.max(...rows.map(r => Math.max(Math.abs(r.ceV), Math.abs(r.peV))), 1);

  container.innerHTML = `
    <div style="display:flex;height:180px;align-items:flex-end;gap:1px;padding:0 4px 22px;position:relative">
      ${rows.map(r => {
        const ceH = Math.max(1, Math.abs(r.ceV) / maxV * 150);
        const peH = Math.max(1, Math.abs(r.peV) / maxV * 150);
        const ceBg = type==='oi' ? 'rgba(16,185,129,0.75)' : r.ceV>=0?'rgba(16,185,129,0.75)':'rgba(244,63,94,0.75)';
        const peBg = type==='oi' ? 'rgba(244,63,94,0.6)'  : r.peV>=0?'rgba(16,185,129,0.5)':'rgba(244,63,94,0.6)';
        const atmStyle = r.isATM ? 'outline:1px solid rgba(56,189,248,.5);' : '';
        return `<div style="flex:1;display:flex;gap:1px;align-items:flex-end;position:relative;${atmStyle}min-width:0">
          <div style="flex:1;height:${ceH.toFixed(1)}px;background:${ceBg};border-radius:2px 2px 0 0" title="CE ${type}: ${fmtOI(r.ceV)}"></div>
          <div style="flex:1;height:${peH.toFixed(1)}px;background:${peBg};border-radius:2px 2px 0 0" title="PE ${type}: ${fmtOI(r.peV)}"></div>
          <div style="position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);font-size:8px;color:${r.isATM?'var(--accent)':'var(--muted)'};white-space:nowrap">${r.s}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:12px;font-size:10px;margin-top:4px;padding:0 4px">
      <span style="color:var(--green)">■ CE${type==='chg'?' Chg':' OI'}</span>
      <span style="color:var(--red)">■ PE${type==='chg'?' Chg':' OI'}</span>
    </div>`;
}
