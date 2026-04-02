// ===== Sentiment Analysis: FII/DII, VIX, Market Score =====

async function loadSentimentData() {
  const [fiiData, vixData, niftyCandles] = await Promise.all([
    fetchFIIDII(),
    fetchVIX(),
    fetchHistorical('^NSEI', '1d', '1mo')
  ]);

  renderFIITable(fiiData);
  renderVIXSection(vixData, niftyCandles);
  renderSentimentGauge(fiiData, vixData, niftyCandles);
}

function renderFIITable(fiiData) {
  if (!fiiData || !fiiData.length) return;

  // Mini FII/DII bar chart in container
  const fiiChartDiv = document.getElementById('fiiChartContainer');
  if (fiiChartDiv) {
    const recent = fiiData.slice(0, 7).reverse();
    const maxAbs = Math.max(...recent.map(d => Math.max(Math.abs(d.fiiNet), Math.abs(d.diiNet))));
    fiiChartDiv.innerHTML = `
      <div style="display:flex;gap:4px;height:100%;align-items:flex-end;padding-bottom:20px;position:relative;">
        ${recent.map((d, i) => {
          const fiiH = maxAbs > 0 ? Math.abs(d.fiiNet / maxAbs * 90) : 5;
          const diiH = maxAbs > 0 ? Math.abs(d.diiNet / maxAbs * 90) : 5;
          return `<div style="flex:1;display:flex;gap:1px;align-items:flex-end;position:relative;">
            <div style="flex:1;height:${fiiH.toFixed(1)}%;background:${d.fiiNet>=0?'rgba(16,185,129,0.8)':'rgba(244,63,94,0.8)'};border-radius:2px 2px 0 0;min-height:3px;"></div>
            <div style="flex:1;height:${diiH.toFixed(1)}%;background:${d.diiNet>=0?'rgba(56,189,248,0.6)':'rgba(245,158,11,0.6)'};border-radius:2px 2px 0 0;min-height:3px;"></div>
            <div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:8px;color:var(--text-muted);white-space:nowrap;">${d.date}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:12px;font-size:10px;margin-top:4px;">
        <span style="color:var(--green);">■ FII Net</span>
        <span style="color:var(--accent);">■ DII Net</span>
      </div>
    `;
  }

  // Table
  const tbody = document.getElementById('fiiBody');
  if (!tbody) return;
  tbody.innerHTML = fiiData.slice(0, 7).map(d => `
    <tr>
      <td>${d.date}</td>
      <td style="color:var(--green)">+${formatCr(d.fiiBuy)}</td>
      <td style="color:var(--red)">-${formatCr(d.fiiSell)}</td>
      <td style="color:${d.fiiNet>=0?'var(--green)':'var(--red)';font-weight:500}">${d.fiiNet>=0?'+':''}${formatCr(d.fiiNet)}</td>
      <td style="color:var(--green)">+${formatCr(d.diiBuy)}</td>
      <td style="color:var(--red)">-${formatCr(d.diiSell)}</td>
      <td style="color:${d.diiNet>=0?'var(--green)':'var(--red)';font-weight:500}">${d.diiNet>=0?'+':''}${formatCr(d.diiNet)}</td>
    </tr>
  `).join('');
}

function renderVIXSection(vixData, niftyCandles) {
  const vixDiv = document.getElementById('vixChartContainer');
  if (vixDiv && niftyCandles) {
    // Plot nifty close as proxy VIX trend visual
    const closes = niftyCandles.slice(-25);
    const minC = Math.min(...closes.map(c => c.low));
    const maxC = Math.max(...closes.map(c => c.high));
    const points = closes.map((c, i) => {
      const x = (i / (closes.length - 1) * 100).toFixed(1);
      const y = ((maxC - c.close) / (maxC - minC) * 80 + 10).toFixed(1);
      return `${x},${y}`;
    }).join(' ');

    vixDiv.innerHTML = `
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;">
        <defs>
          <linearGradient id="vixGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(56,189,248,0.3)"/>
            <stop offset="100%" stop-color="rgba(56,189,248,0)"/>
          </linearGradient>
        </defs>
        <polyline points="${points}" fill="none" stroke="rgba(56,189,248,0.8)" stroke-width="0.8" stroke-linejoin="round"/>
        <polygon points="${points} 100,100 0,100" fill="url(#vixGrad)"/>
      </svg>
    `;
  }

  const vixVal = vixData?.price || 15;
  const interpretDiv = document.getElementById('vixInterpret');
  if (!interpretDiv) return;
  let interp = '', color = 'var(--text-secondary)';
  if (vixVal < 12) { interp = `VIX at ${vixVal.toFixed(1)} — Extreme complacency. Market priced for perfection. Options are cheap — good time to buy premium (long straddle/strangle). Watch for sharp reversal.`; color = 'var(--green)'; }
  else if (vixVal < 16) { interp = `VIX at ${vixVal.toFixed(1)} — Low volatility environment. Premium selling (Iron Condor, Covered Calls) is favorable. Directional moves may be limited.`; color = 'var(--green)'; }
  else if (vixVal < 20) { interp = `VIX at ${vixVal.toFixed(1)} — Moderate volatility. Normal market conditions. Both buying and selling strategies can work. Follow technical levels carefully.`; color = 'var(--amber)'; }
  else if (vixVal < 25) { interp = `VIX at ${vixVal.toFixed(1)} — Elevated fear. Consider reducing position size. Good for buying puts as protection. Avoid naked selling strategies.`; color = 'var(--amber)'; }
  else { interp = `VIX at ${vixVal.toFixed(1)} — High fear zone. Market is panicking. This is often a contrarian BUY signal for index. Avoid new short positions. Consider straddles/strangles.`; color = 'var(--red)'; }
  interpretDiv.innerHTML = `<span style="color:${color}">${interp}</span>`;
}

function renderSentimentGauge(fiiData, vixData, niftyCandles) {
  let score = 50;
  const factors = [];

  // FII factor
  if (fiiData && fiiData.length) {
    const recentFII = fiiData.slice(0, 3);
    const avgFII = recentFII.reduce((a, d) => a + d.fiiNet, 0) / recentFII.length;
    const fiiScore = avgFII > 1000 ? 15 : avgFII > 0 ? 8 : avgFII > -1000 ? -5 : -15;
    score += fiiScore;
    factors.push({ name: 'FII Activity (3d avg)', value: `₹${formatCr(avgFII)}`, score: fiiScore, bull: fiiScore >= 0 });

    const recentDII = fiiData.slice(0, 3);
    const avgDII = recentDII.reduce((a, d) => a + d.diiNet, 0) / recentDII.length;
    const diiScore = avgDII > 500 ? 8 : avgDII > 0 ? 4 : -4;
    score += diiScore;
    factors.push({ name: 'DII Activity (3d avg)', value: `₹${formatCr(avgDII)}`, score: diiScore, bull: diiScore >= 0 });
  }

  // VIX factor
  if (vixData?.price) {
    const v = vixData.price;
    const vixScore = v < 14 ? 10 : v < 18 ? 5 : v < 22 ? -5 : v < 28 ? -12 : -18;
    score += vixScore;
    factors.push({ name: 'VIX Level', value: v.toFixed(1), score: vixScore, bull: vixScore >= 0 });
  }

  // Price trend factor
  if (niftyCandles && niftyCandles.length >= 20) {
    const closes = niftyCandles.map(c => c.close);
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const current = closes[closes.length - 1];
    const trendScore = current > sma20 * 1.02 ? 10 : current > sma20 ? 5 : current < sma20 * 0.98 ? -10 : -5;
    score += trendScore;
    factors.push({ name: 'Price vs 20-Day SMA', value: current > sma20 ? 'Above' : 'Below', score: trendScore, bull: trendScore >= 0 });
  }

  score = Math.max(5, Math.min(95, Math.round(score)));

  // Update gauge needle
  const needle = document.getElementById('gaugeNeedle');
  if (needle) {
    const angle = -90 + (score / 100) * 180;
    needle.setAttribute('transform', `rotate(${angle},100,100)`);
  }

  const label = score >= 75 ? 'Greedy' : score >= 60 ? 'Bullish' : score >= 45 ? 'Neutral' : score >= 30 ? 'Bearish' : 'Fearful';
  const labelColor = score >= 60 ? 'var(--green)' : score >= 45 ? 'var(--amber)' : 'var(--red)';
  const gaugeLabel = document.getElementById('gaugeLabel');
  const gaugeScore = document.getElementById('gaugeScore');
  if (gaugeLabel) { gaugeLabel.textContent = label; gaugeLabel.style.color = labelColor; }
  if (gaugeScore) { gaugeScore.textContent = `${score}/100`; }

  const sentFactors = document.getElementById('sentFactors');
  if (sentFactors) {
    sentFactors.innerHTML = factors.map(f => `
      <div class="sent-factor">
        <span class="sent-factor-name">${f.name}</span>
        <span class="sent-factor-score" style="color:${f.bull ? 'var(--green)' : 'var(--red)'};">${f.value}</span>
      </div>
    `).join('');
  }
}

function formatCr(val) {
  const n = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (n >= 10000) return sign + (n / 100).toFixed(0) + 'Cr';
  if (n >= 100) return sign + (n).toFixed(0) + ' Cr';
  return sign + n.toFixed(0) + ' Cr';
}
