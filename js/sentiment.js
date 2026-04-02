// ===== SENTIMENT =====

async function loadSentiment() {
  const [fii, vix, niftyCandles, pcr] = await Promise.all([
    getFIIDII(),
    getVIX(),
    getHistory('^NSEI', '1d', '1mo'),
    computeSentimentPCR(),
  ]);
  renderFIISection(fii);
  renderVIXSection(vix, niftyCandles);
  renderGauge(fii, vix, niftyCandles, pcr);
}

async function computeSentimentPCR() {
  const chain = await getNSEChain('NIFTY');
  if (!chain?.records?.data) return null;
  return computePCR(chain.records.data);
}

function renderFIISection(fii) {
  if (!fii?.length) return;
  // Bar chart
  const container = document.getElementById('fiiBarChart');
  const recent = fii.slice(0, 7).reverse();
  const max = Math.max(...recent.map(d => Math.max(Math.abs(d.fiiNet), Math.abs(d.diiNet))), 1);
  container.innerHTML = `<div style="display:flex;gap:3px;height:100%;align-items:flex-end;padding-bottom:22px;position:relative">
    ${recent.map(d => {
      const fH = Math.max(2, Math.abs(d.fiiNet)/max*130);
      const dH = Math.max(2, Math.abs(d.diiNet)/max*130);
      return `<div style="flex:1;display:flex;gap:1px;align-items:flex-end;position:relative">
        <div style="flex:1;height:${fH.toFixed(1)}px;background:${d.fiiNet>=0?'rgba(16,185,129,.8)':'rgba(244,63,94,.8)'};border-radius:2px 2px 0 0" title="FII: ${d.fiiNet.toFixed(0)} Cr"></div>
        <div style="flex:1;height:${dH.toFixed(1)}px;background:${d.diiNet>=0?'rgba(56,189,248,.7)':'rgba(245,158,11,.7)'};border-radius:2px 2px 0 0" title="DII: ${d.diiNet.toFixed(0)} Cr"></div>
        <div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:8px;color:var(--muted);white-space:nowrap">${d.date}</div>
      </div>`;
    }).join('')}
  </div>
  <div style="display:flex;gap:12px;font-size:10px;margin-top:2px"><span style="color:var(--green)">■ FII</span><span style="color:var(--accent)">■ DII</span></div>`;

  // Table
  const tbody = document.getElementById('fiiBody');
  if (tbody) tbody.innerHTML = fii.slice(0, 7).map(d => `<tr>
    <td>${d.date}</td>
    <td class="c-green">${(d.fiiBuy/100).toFixed(0)}Cr</td>
    <td class="c-red">${(d.fiiSell/100).toFixed(0)}Cr</td>
    <td class="${d.fiiNet>=0?'c-green':'c-red'}" style="font-weight:600">${d.fiiNet>=0?'+':''}${(d.fiiNet/100).toFixed(0)}Cr</td>
    <td class="c-green">${(d.diiBuy/100).toFixed(0)}Cr</td>
    <td class="c-red">${(d.diiSell/100).toFixed(0)}Cr</td>
    <td class="${d.diiNet>=0?'c-green':'c-red'}" style="font-weight:600">${d.diiNet>=0?'+':''}${(d.diiNet/100).toFixed(0)}Cr</td>
  </tr>`).join('');
}

function renderVIXSection(vix, candles) {
  const vixDiv = document.getElementById('vixSparkDiv');
  if (vixDiv && candles?.length) {
    const closes = candles.slice(-25).map(c => c.close);
    const min = Math.min(...closes), max = Math.max(...closes), range = max - min || 1;
    const pts = closes.map((v, i) => `${(i/(closes.length-1)*100).toFixed(1)},${((max-v)/range*80+10).toFixed(1)}`).join(' ');
    vixDiv.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%">
      <defs><linearGradient id="vg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(56,189,248,.3)"/><stop offset="100%" stop-color="rgba(56,189,248,0)"/></linearGradient></defs>
      <polygon points="${pts} 100,100 0,100" fill="url(#vg)"/>
      <polyline points="${pts}" fill="none" stroke="rgba(56,189,248,.8)" stroke-width=".7" stroke-linejoin="round"/>
    </svg>`;
  }
  const v = vix?.price || 15;
  const el = document.getElementById('vixInterp');
  if (!el) return;
  let txt, col;
  if (v < 12)      { txt = `VIX ${v.toFixed(1)} — Extreme complacency. Options premiums are cheap. Ideal for long straddles/strangles. Expect volatility expansion soon.`; col='var(--green)'; }
  else if (v < 16) { txt = `VIX ${v.toFixed(1)} — Low volatility. Premium selling (Iron Condor, Short Strangle) is favorable. Market movement may be limited.`; col='var(--green)'; }
  else if (v < 20) { txt = `VIX ${v.toFixed(1)} — Moderate. Normal market conditions. Both buying and selling strategies can work. Follow technicals carefully.`; col='var(--amber)'; }
  else if (v < 25) { txt = `VIX ${v.toFixed(1)} — Elevated fear. Reduce position size. Buy puts for protection. Avoid naked short selling.`; col='var(--amber)'; }
  else             { txt = `VIX ${v.toFixed(1)} — High panic zone. Market is in fear. Contrarian buy zone for brave traders. Consider straddles to capture the move. Avoid fresh short positions.`; col='var(--red)'; }
  el.innerHTML = `<span style="color:${col}">${txt}</span>`;
}

function renderGauge(fii, vix, niftyCandles, pcr) {
  let sc = 50;
  const factors = [];

  if (fii?.length) {
    const avg3 = fii.slice(0,3).reduce((a,d)=>a+d.fiiNet,0)/3;
    const s = avg3 > 2000?14: avg3>0?7: avg3>-2000?-7:-14;
    sc += s;
    factors.push({ name:'FII (3d avg)', val:`${avg3>=0?'+':''}${(avg3/100).toFixed(0)} Cr`, bull: s>=0 });

    const avgDII = fii.slice(0,3).reduce((a,d)=>a+d.diiNet,0)/3;
    const ds = avgDII>1000?7: avgDII>0?3:-3;
    sc += ds;
    factors.push({ name:'DII (3d avg)', val:`${avgDII>=0?'+':''}${(avgDII/100).toFixed(0)} Cr`, bull: ds>=0 });
  }
  if (vix?.price) {
    const v = vix.price;
    const vs = v<12?10: v<16?5: v<20?-5: v<26?-12:-18;
    sc += vs;
    factors.push({ name:'India VIX', val:v.toFixed(1), bull:vs>=0 });
  }
  if (niftyCandles?.length >= 20) {
    const closes = niftyCandles.map(c=>c.close);
    const s20 = closes.slice(-20).reduce((a,b)=>a+b,0)/20;
    const cur = closes[closes.length-1];
    const ps = cur>s20*1.02?10: cur>s20?5: cur<s20*0.98?-10:-5;
    sc += ps;
    factors.push({ name:'Price vs SMA20', val:cur>s20?'Above':'Below', bull:ps>=0 });
  }
  if (pcr) {
    const ps = pcr>1.3?10: pcr>1.0?5: pcr>0.8?-5:-10;
    sc += ps;
    factors.push({ name:`PCR (${pcr.toFixed(2)})`, val:pcr>1.0?'Bullish':'Bearish', bull:ps>=0 });
  }
  sc = Math.max(5, Math.min(95, Math.round(sc)));

  const needle = document.getElementById('gNeedle');
  if (needle) needle.setAttribute('transform', `rotate(${-90 + sc * 1.8},110,110)`);

  const lbl = sc>=80?'Extremely Bullish': sc>=65?'Bullish': sc>=50?'Mildly Bullish': sc>=40?'Neutral': sc>=28?'Bearish': 'Extremely Bearish';
  const col = sc>=60?'var(--green)': sc>=45?'var(--amber)':'var(--red)';
  setHTML('gaugeLbl', `<span style="color:${col}">${lbl}</span>`);
  setText('gaugeSc', `${sc} / 100`);
  setHTML('sentFactors', factors.map(f=>`<div class="sf-row"><span class="sf-name">${f.name}</span><span class="sf-val" style="color:${f.bull?'var(--green)':'var(--red)'}">${f.val}</span></div>`).join(''));
}
