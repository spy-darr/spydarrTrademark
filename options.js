// ===== Options Chain Analysis =====

let currentOptionsData = null;

async function loadOptionsChain() {
  const symbol = document.getElementById('optSymbol').value;
  const tbody = document.getElementById('optionsBody');
  tbody.innerHTML = '<tr><td colspan="11" class="loading-row">Loading options chain...</td></tr>';

  const data = await fetchOptionsChain(symbol);
  if (!data) { tbody.innerHTML = '<tr><td colspan="11" class="loading-row">Failed to load. API may be blocked — using demo data.</td></tr>'; return; }

  currentOptionsData = data;
  const records = data.records?.data || data.filtered?.data || [];
  const underlyingValue = data.records?.underlyingValue || 0;
  const expiries = data.records?.expiryDates || [];

  // Populate expiry dropdown
  const expirySelect = document.getElementById('optExpiry');
  if (expiries.length) {
    expirySelect.innerHTML = expiries.slice(0, 5).map(e => `<option value="${e}">${e}</option>`).join('');
  }

  const selectedExpiry = expirySelect.value || (expiries[0] || '');
  const filteredByExpiry = selectedExpiry ? records.filter(r => r.expiryDate === selectedExpiry) : records;

  // Calculate ATM, PCR, Max Pain
  const atm = findATM(filteredByExpiry, underlyingValue);
  const pcr = computePCR(filteredByExpiry);
  const maxPain = computeMaxPain(filteredByExpiry);

  document.getElementById('atmValue').textContent = atm?.toFixed(0) || '--';
  document.getElementById('pcrValue').textContent = pcr?.toFixed(2) || '--';
  const pcrEl = document.getElementById('pcrValue');
  pcrEl.style.color = pcr > 1.2 ? 'var(--green)' : pcr < 0.8 ? 'var(--red)' : 'var(--amber)';
  document.getElementById('maxPainValue').textContent = maxPain?.toFixed(0) || '--';

  // Render table — ATM ± 10 strikes
  renderOptionsTable(filteredByExpiry, atm);
  renderOICharts(filteredByExpiry, atm);
}

function findATM(data, underlying) {
  if (!data.length) return underlying;
  const strikes = data.map(d => d.strikePrice);
  const uniq = [...new Set(strikes)].sort((a, b) => a - b);
  let closest = uniq[0];
  let minDiff = Math.abs(uniq[0] - underlying);
  uniq.forEach(s => { const d = Math.abs(s - underlying); if (d < minDiff) { minDiff = d; closest = s; } });
  return closest;
}

function computePCR(data) {
  let totalPEOI = 0, totalCEOI = 0;
  data.forEach(d => {
    totalCEOI += parseInt(d.CE?.openInterest || 0);
    totalPEOI += parseInt(d.PE?.openInterest || 0);
  });
  return totalCEOI > 0 ? totalPEOI / totalCEOI : 1;
}

function computeMaxPain(data) {
  const strikes = [...new Set(data.map(d => d.strikePrice))].sort((a, b) => a - b);
  let minPain = Infinity, maxPainStrike = strikes[0];
  strikes.forEach(s => {
    let totalLoss = 0;
    data.forEach(d => {
      const ceOI = parseInt(d.CE?.openInterest || 0);
      const peOI = parseInt(d.PE?.openInterest || 0);
      // CE writers lose if price > strike, PE writers lose if price < strike
      if (s > d.strikePrice) totalLoss += ceOI * (s - d.strikePrice);
      if (s < d.strikePrice) totalLoss += peOI * (d.strikePrice - s);
    });
    if (totalLoss < minPain) { minPain = totalLoss; maxPainStrike = s; }
  });
  return maxPainStrike;
}

function renderOptionsTable(data, atm) {
  const tbody = document.getElementById('optionsBody');
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="11" class="loading-row">No data</td></tr>'; return; }

  const strikes = [...new Set(data.map(d => d.strikePrice))].sort((a, b) => a - b);
  const atmIdx = strikes.indexOf(atm);
  const start = Math.max(0, atmIdx - 10);
  const end = Math.min(strikes.length, atmIdx + 11);
  const displayStrikes = strikes.slice(start, end);

  const rows = displayStrikes.map(strike => {
    const row = data.find(d => d.strikePrice === strike) || { strikePrice: strike };
    const ce = row.CE || {};
    const pe = row.PE || {};
    const isATM = strike === atm;
    const ceOI = parseInt(ce.openInterest || 0);
    const peOI = parseInt(pe.openInterest || 0);
    const ceChg = parseInt(ce.changeinOpenInterest || 0);
    const peChg = parseInt(pe.changeinOpenInterest || 0);

    return `<tr class="${isATM ? 'atm-row' : ''}">
      <td class="ce-col">${formatOI(ceOI)}</td>
      <td class="ce-col ${ceChg >= 0 ? 'oi-up' : 'oi-down'}">${ceChg >= 0 ? '+' : ''}${formatOI(ceChg)}</td>
      <td class="ce-col">${formatOI(parseInt(ce.totalTradedVolume || 0))}</td>
      <td class="ce-col">${ce.impliedVolatility ? parseFloat(ce.impliedVolatility).toFixed(1) + '%' : '--'}</td>
      <td class="ce-col" style="font-weight:600;">₹${parseFloat(ce.lastPrice || 0).toFixed(1)}</td>
      <td class="strike-col">${strike}</td>
      <td class="pe-col" style="font-weight:600;">₹${parseFloat(pe.lastPrice || 0).toFixed(1)}</td>
      <td class="pe-col">${pe.impliedVolatility ? parseFloat(pe.impliedVolatility).toFixed(1) + '%' : '--'}</td>
      <td class="pe-col">${formatOI(parseInt(pe.totalTradedVolume || 0))}</td>
      <td class="pe-col ${peChg >= 0 ? 'oi-up' : 'oi-down'}">${peChg >= 0 ? '+' : ''}${formatOI(peChg)}</td>
      <td class="pe-col">${formatOI(peOI)}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

function renderOICharts(data, atm) {
  const strikes = [...new Set(data.map(d => d.strikePrice))].sort((a, b) => a - b);
  const atmIdx = strikes.indexOf(atm);
  const displayStrikes = strikes.slice(Math.max(0, atmIdx - 8), Math.min(strikes.length, atmIdx + 9));

  const oiData = displayStrikes.map(s => {
    const row = data.find(d => d.strikePrice === s) || {};
    return { strike: s, ceOI: parseInt(row.CE?.openInterest || 0), peOI: parseInt(row.PE?.openInterest || 0), ceChg: parseInt(row.CE?.changeinOpenInterest || 0), peChg: parseInt(row.PE?.changeinOpenInterest || 0) };
  });

  renderBarChart('oiChartContainer', oiData, 'oi');
  renderBarChart('oiChangeContainer', oiData, 'change');
}

function renderBarChart(containerId, data, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const maxVal = type === 'oi'
    ? Math.max(...data.map(d => Math.max(d.ceOI, d.peOI)))
    : Math.max(...data.map(d => Math.max(Math.abs(d.ceChg), Math.abs(d.peChg))));

  if (maxVal === 0) { container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:12px;">No OI data</div>'; return; }

  const html = `
    <div style="display:flex;height:100%;align-items:flex-end;gap:1px;padding-bottom:20px;position:relative;">
      ${data.map(d => {
        const ceVal = type === 'oi' ? d.ceOI : d.ceChg;
        const peVal = type === 'oi' ? d.peOI : d.peChg;
        const ceH = Math.abs(ceVal / maxVal * 100);
        const peH = Math.abs(peVal / maxVal * 100);
        return `
          <div style="flex:1;display:flex;gap:1px;align-items:flex-end;position:relative;">
            <div style="flex:1;height:${ceH.toFixed(1)}%;background:${type==='oi'?'rgba(16,185,129,0.7)':ceVal>=0?'rgba(16,185,129,0.7)':'rgba(244,63,94,0.7)'};border-radius:2px 2px 0 0;min-height:2px;" title="CE: ${formatOI(ceVal)}"></div>
            <div style="flex:1;height:${peH.toFixed(1)}%;background:${type==='oi'?'rgba(244,63,94,0.5)':peVal>=0?'rgba(16,185,129,0.5)':'rgba(244,63,94,0.5)'};border-radius:2px 2px 0 0;min-height:2px;" title="PE: ${formatOI(peVal)}"></div>
            <div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:8px;color:var(--text-muted);white-space:nowrap;">${d.strike}</div>
          </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:12px;margin-top:4px;font-size:10px;">
      <span style="color:var(--green);">■ CE ${type==='change'?'Chg':''}</span>
      <span style="color:var(--red);">■ PE ${type==='change'?'Chg':''}</span>
    </div>
  `;
  container.innerHTML = html;
}

function formatOI(val) {
  const n = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (n >= 10000000) return sign + (n / 10000000).toFixed(1) + 'Cr';
  if (n >= 100000) return sign + (n / 100000).toFixed(1) + 'L';
  if (n >= 1000) return sign + (n / 1000).toFixed(1) + 'K';
  return sign + n.toString();
}
