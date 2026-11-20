// PSE Performance Dashboard — application logic
// Requires (loaded before this file): Chart.js, Leaflet, data.js

// ─── DATA ENGINE ──────────────────────────────────────────────────────────────
// Row cols: [site, date, actual_kwh, expected_kwh, inverter_kwh, inverter_kw, downtime_kwh, estimated_kwh, pr, er, iso_week, dow]
const F = { SITE:0, DATE:1, ACTUAL:2, EXPECTED:3, INV_KWH:4, INV_KW:5, DOWNTIME:6, ESTIMATED:7, PR:8, ER:9, WEEK:10, DOW:11 };

let state = {
  site: 'ALL',
  dateFrom: '2026-04-01',
  dateTo: '2026-04-30',
  activeWeeks: new Set(),
  sortCol: 'gap_pct',
  sortAsc: true
};

let SITES, DATES, ROWS;
let charts = {};

function initData(d) {
  SITES = d.sites;
  DATES = d.dates;
  ROWS = d.rows;
  
  // Populate site select
  const sel = document.getElementById('site-select');
  SITES.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    sel.appendChild(opt);
  });
  
  initCharts();
  applyFilters();
}

function getFilteredRows() {
  return ROWS.filter(r => {
    if (state.site !== 'ALL' && r[F.SITE] !== state.site) return false;
    if (r[F.DATE] < state.dateFrom || r[F.DATE] > state.dateTo) return false;
    if (state.activeWeeks.size > 0 && !state.activeWeeks.has(r[F.WEEK])) return false;
    return true;
  });
}

function applyFilters() {
  state.dateFrom = document.getElementById('date-from').value;
  state.dateTo = document.getElementById('date-to').value;
  renderAll();
}

function applySiteFilter() {
  state.site = document.getElementById('site-select').value;
  const label = state.site === 'ALL' ? 'FLEET VIEW — 44 SITES' : `SITE VIEW — ${state.site.toUpperCase()}`;
  document.getElementById('mode-label').textContent = label;
  renderAll();
}

function toggleWeek(w) {
  if (state.activeWeeks.has(w)) {
    state.activeWeeks.delete(w);
    document.querySelector(`[onclick="toggleWeek(${w})"]`).classList.remove('active');
  } else {
    state.activeWeeks.add(w);
    document.querySelector(`[onclick="toggleWeek(${w})"]`).classList.add('active');
  }
  applyFilters();
}

function resetFilters() {
  state = { site:'ALL', dateFrom:'2026-04-01', dateTo:'2026-04-30', activeWeeks: new Set(), sortCol:'gap_pct', sortAsc:true };
  document.getElementById('site-select').value = 'ALL';
  document.getElementById('date-from').value = '2026-04-01';
  document.getElementById('date-to').value = '2026-04-30';
  document.querySelectorAll('.week-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('mode-label').textContent = 'FLEET VIEW — 44 SITES';
  closePanel();
  renderAll();
}

function sum(rows, field) { return rows.reduce((a,r) => a + (r[field] || 0), 0); }
function avg(rows, field) {
  const v = rows.filter(r => r[field] != null && r[field] > 0 && r[field] <= 1.5).map(r => r[field]);
  return v.length ? v.reduce((a,b) => a+b,0)/v.length : null;
}

function aggByDate(rows) {
  const m = {};
  rows.forEach(r => {
    if (!m[r[F.DATE]]) m[r[F.DATE]] = { actual:0, expected:0, inv_kwh:0, downtime:0, estimated:0, pr_vals:[] };
    m[r[F.DATE]].actual += r[F.ACTUAL]||0;
    m[r[F.DATE]].expected += r[F.EXPECTED]||0;
    m[r[F.DATE]].inv_kwh += r[F.INV_KWH]||0;
    m[r[F.DATE]].downtime += r[F.DOWNTIME]||0;
    m[r[F.DATE]].estimated += r[F.ESTIMATED]||0;
    if (r[F.PR] != null && r[F.PR] > 0 && r[F.PR] <= 1.5) m[r[F.DATE]].pr_vals.push(r[F.PR]);
  });
  return m;
}

function aggBySite(rows) {
  const m = {};
  rows.forEach(r => {
    if (!m[r[F.SITE]]) m[r[F.SITE]] = { actual:0, expected:0, downtime:0, estimated:0, pr_vals:[], er_vals:[] };
    m[r[F.SITE]].actual += r[F.ACTUAL]||0;
    m[r[F.SITE]].expected += r[F.EXPECTED]||0;
    m[r[F.SITE]].downtime += r[F.DOWNTIME]||0;
    m[r[F.SITE]].estimated += r[F.ESTIMATED]||0;
    if (r[F.PR] != null && r[F.PR] > 0 && r[F.PR] <= 1.5) m[r[F.SITE]].pr_vals.push(r[F.PR]);
    if (r[F.ER] != null && r[F.ER] > 0 && r[F.ER] <= 2) m[r[F.SITE]].er_vals.push(r[F.ER]);
  });
  return m;
}

function aggByWeek(rows) {
  const m = {};
  rows.forEach(r => {
    const w = r[F.WEEK];
    if (!m[w]) m[w] = { actual:0, expected:0, downtime:0, estimated:0 };
    m[w].actual += r[F.ACTUAL]||0;
    m[w].expected += r[F.EXPECTED]||0;
    m[w].downtime += r[F.DOWNTIME]||0;
    m[w].estimated += r[F.ESTIMATED]||0;
  });
  return m;
}

// ─── RENDER ALL ───────────────────────────────────────────────────────────────
function renderAll() {
  const rows = getFilteredRows();
  renderKPIs(rows);
  renderSiteBar(rows);
  renderMonthlyBar(rows);
  renderDailyLine(rows);
  renderHeatmap(rows);
  renderWeeklyBar(rows);
  renderWaterfall(rows);
  renderCurtailment(rows);
  renderScatter(rows);
  renderIrradiance(rows);
  renderUnderperformingSites(rows);
  renderERTrend(rows);
}

// ─── KPI CARDS ────────────────────────────────────────────────────────────────
function renderKPIs(rows) {
  const totalGen = sum(rows, F.ACTUAL);
  const totalDown = sum(rows, F.DOWNTIME);
  const totalEst = sum(rows, F.ESTIMATED);
  const totalExp = sum(rows, F.EXPECTED);
  const avgPR = avg(rows, F.PR);
  
  // CUF: total kWh / (total DC kWp * hours in period)
  // Use 723.5 MWp total fleet DC capacity as denominator for fleet
  const daysInRange = Math.max(1, (new Date(state.dateTo) - new Date(state.dateFrom)) / 86400000 + 1);
  const fleetDCkWp = 233500; // approx fleet total kWp
  const cuf = totalGen / (fleetDCkWp * daysInRange * 24) * 100;
  
  const avail = totalEst > 0 ? (1 - totalDown/totalEst)*100 : null;
  
  document.getElementById('kpi-gen').textContent = (totalGen/1000).toFixed(1) + ' MWh';
  document.getElementById('kpi-pr').textContent = avgPR ? (avgPR*100).toFixed(1)+'%' : '—';
  document.getElementById('kpi-cuf').textContent = cuf ? cuf.toFixed(1)+'%' : '—';
  document.getElementById('kpi-avail').textContent = avail ? avail.toFixed(1)+'%' : '—';
  document.getElementById('kpi-dt').textContent = (totalDown/1000).toFixed(1)+' MWh';
  
  const siteCount = new Set(rows.map(r=>r[F.SITE])).size;
  document.getElementById('kpi-gen-sub').textContent = `${siteCount} sites · ${rows.length} day-records`;
  
  const ragPR = document.getElementById('rag-pr');
  if (avgPR >= 0.85) { ragPR.className='rag green'; document.getElementById('kpi-pr-sub').textContent='On target'; }
  else if (avgPR >= 0.7) { ragPR.className='rag amber'; document.getElementById('kpi-pr-sub').textContent='Below target'; }
  else { ragPR.className='rag red'; document.getElementById('kpi-pr-sub').textContent='Critical underperformance'; }
  
  const ragAvail = document.getElementById('rag-avail');
  if (avail >= 98) { ragAvail.className='rag green'; }
  else if (avail >= 95) { ragAvail.className='rag amber'; }
  else { ragAvail.className='rag red'; }
}

// ─── CHART HELPERS ────────────────────────────────────────────────────────────
const ChartDefaults = {
  color: { text: '#4A6B55', grid: 'rgba(27,122,74,0.08)' },
  font: { family: "'DM Sans', sans-serif" }
};

function baseScales(xLabel, yLabel, y2Label) {
  const s = {
    x: { ticks: { color: ChartDefaults.color.text, font: { family: ChartDefaults.font.family, size: 10 }, maxRotation: 45 }, grid: { color: ChartDefaults.color.grid }, border: { color: 'transparent' } },
    y: { ticks: { color: ChartDefaults.color.text, font: { family: ChartDefaults.font.family, size: 10 } }, grid: { color: ChartDefaults.color.grid }, border: { color: 'transparent' } }
  };
  if (xLabel) s.x.title = { display: false };
  if (y2Label) s.y2 = { position: 'right', ticks: { color: ChartDefaults.color.text, font: { size: 10, family: ChartDefaults.font.family } }, grid: { display: false }, border: { color: 'transparent' } };
  return s;
}

function baseTooltip() {
  return {
    backgroundColor: 'rgba(240,247,244,0.97)',
    borderColor: 'rgba(27,122,74,0.2)',
    borderWidth: 1,
    titleColor: '#1B7A4A',
    bodyColor: '#1A2E22',
    padding: 10,
    titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 13, weight: 'bold' },
    bodyFont: { family: "'DM Sans', sans-serif", size: 11 }
  };
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function prColor(pr) {
  if (pr == null) return '#8BAA96';
  if (pr >= 0.85) return '#2EA06A';
  if (pr >= 0.70) return '#F59E0B';
  return '#E53935';
}

// ─── SITE BAR ─────────────────────────────────────────────────────────────────
function renderSiteBar(rows) {
  const bysite = aggBySite(rows);
  const sorted = Object.entries(bysite).sort((a,b) => b[1].actual - a[1].actual);
  
  const labels = sorted.map(([s]) => s.length > 18 ? s.slice(0,16)+'…' : s);
  const vals = sorted.map(([,v]) => +(v.actual/1000).toFixed(2));
  const avgPRs = sorted.map(([,v]) => v.pr_vals.length ? v.pr_vals.reduce((a,b)=>a+b,0)/v.pr_vals.length : null);
  const colors = avgPRs.map(prColor);
  const fullNames = sorted.map(([s]) => s);
  
  destroyChart('site-bar');
  charts['site-bar'] = new Chart(document.getElementById('chart-site-bar').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: vals,
        backgroundColor: colors,
        borderColor: colors.map(c => c+'cc'),
        borderWidth: 1,
        borderRadius: 2
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...baseTooltip(), callbacks: {
          title: (ctx) => fullNames[ctx[0].dataIndex],
          label: (ctx) => {
            const [,v] = sorted[ctx.dataIndex];
            const pr = avgPRs[ctx.dataIndex];
            return [`  Generation: ${ctx.raw.toFixed(2)} MWh`, `  Avg PR: ${pr ? (pr*100).toFixed(1)+'%' : 'N/A'}`, `  Downtime: ${(v.downtime/1000).toFixed(2)} MWh`];
          }
        }}
      },
      scales: {
        x: { ticks: { color: ChartDefaults.color.text, font:{size:10, family:ChartDefaults.font.family} }, grid: { color: ChartDefaults.color.grid }, border:{color:'transparent'}, title:{display:true,text:'MWh',color:'#8BAA96',font:{size:10}} },
        y: { ticks: { color: ChartDefaults.color.text, font:{size:10, family:ChartDefaults.font.family} }, grid: { display:false }, border:{color:'transparent'} }
      },
      onClick: (e, el) => {
        if (el.length) {
          const site = fullNames[el[0].index];
          document.getElementById('site-select').value = site;
          applySiteFilter();
        }
      }
    }
  });
}

// ─── MONTHLY BAR ──────────────────────────────────────────────────────────────
function renderMonthlyBar(rows) {
  const byDate = aggByDate(rows);
  const allDates = Object.keys(byDate).sort();
  
  const actuals = allDates.map(d => +(byDate[d].actual/1000).toFixed(2));
  const expected = allDates.map(d => +(byDate[d].expected/1000).toFixed(2));
  const colors = allDates.map((d,i) => {
    const a = byDate[d].actual, e = byDate[d].expected;
    if (e > 0 && a < e * 0.95) return '#E5393588';
    return '#43A04788';
  });
  const borderColors = colors.map(c => c === '#E5393588' ? '#E53935' : '#2EA06A');
  
  const labels = allDates.map(d => d.slice(5));
  
  destroyChart('monthly-bar');
  charts['monthly-bar'] = new Chart(document.getElementById('chart-monthly-bar').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Actual MWh', data: actuals, backgroundColor: colors, borderColor: borderColors, borderWidth: 1, borderRadius: 2 },
        { label: 'Expected MWh', data: expected, type: 'line', borderColor: '#F59E0B', backgroundColor: 'transparent', borderDash: [4,2], pointRadius: 2, pointBackgroundColor: '#F59E0B', tension: 0.3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { color: '#4A6B55', font:{size:10,family:"'DM Sans',sans-serif"}, boxWidth: 12 } }, tooltip: { ...baseTooltip(), callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw} MWh` } } },
      scales: baseScales('Date','MWh')
    }
  });
}

// ─── DAILY LINE ───────────────────────────────────────────────────────────────
function renderDailyLine(rows) {
  const byDate = aggByDate(rows);
  const allDates = Object.keys(byDate).sort();
  
  const actuals = allDates.map(d => +(byDate[d].actual/1000).toFixed(2));
  const prs = allDates.map(d => { const v = byDate[d].pr_vals; return v.length ? +(v.reduce((a,b)=>a+b,0)/v.length*100).toFixed(1) : null; });
  
  // 7-day rolling avg
  const rolling = actuals.map((_, i) => {
    const slice = actuals.slice(Math.max(0, i-6), i+1).filter(v => v != null);
    return slice.length ? +(slice.reduce((a,b)=>a+b,0)/slice.length).toFixed(2) : null;
  });
  
  const labels = allDates.map(d => d.slice(5));
  
  destroyChart('daily-line');
  charts['daily-line'] = new Chart(document.getElementById('chart-daily-line').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Actual MWh', data: actuals, backgroundColor: 'rgba(21,101,192,0.45)', borderColor: '#1565C0', borderWidth: 1, borderRadius: 2, order: 3 },
        { label: '7-day Avg', data: rolling, type: 'line', borderColor: '#00ACC1', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.4, order: 1 },
        { label: 'Avg PR %', data: prs, type: 'line', borderColor: '#F59E0B', backgroundColor: 'transparent', pointRadius: 2, pointBackgroundColor: '#F59E0B', yAxisID: 'y2', tension: 0.3, order: 2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { color:'#4A6B55', font:{size:10,family:"'DM Sans',sans-serif"}, boxWidth:12 } }, tooltip: { ...baseTooltip() } },
      scales: { ...baseScales('Date','MWh','PR %'), y2: { position:'right', ticks:{color:'#F59E0B',font:{size:10,family:"'DM Sans',sans-serif"},callback:v=>v+'%'}, grid:{display:false}, border:{color:'transparent'}, min:0,max:120 } }
    }
  });
}

// ─── HEATMAP ──────────────────────────────────────────────────────────────────
function renderHeatmap(rows) {
  const byDate = aggByDate(rows);
  const allDates = Object.keys(byDate).sort();
  
  const grid = document.getElementById('heatmap-grid');
  grid.innerHTML = '';
  
  const days = ['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  days.forEach(d => {
    const el = document.createElement('div');
    el.className = 'hm-header'; el.textContent = d; grid.appendChild(el);
  });
  
  const weeks = [...new Set(allDates.map(d => {
    const r = rows.find(r => r[F.DATE] === d);
    return r ? r[F.WEEK] : null;
  }).filter(Boolean))].sort((a,b)=>a-b);
  
  weeks.forEach(wk => {
    const wkLabel = document.createElement('div');
    wkLabel.className = 'hm-week-label'; wkLabel.textContent = 'W'+wk; grid.appendChild(wkLabel);
    
    for (let dow = 0; dow < 7; dow++) {
      const date = allDates.find(d => {
        const r = rows.find(r => r[F.DATE] === d);
        return r && r[F.WEEK] === wk && r[F.DOW] === dow;
      });
      
      const cell = document.createElement('div');
      if (!date || !byDate[date]) {
        cell.className = 'hm-cell empty'; grid.appendChild(cell); continue;
      }
      
      const d = byDate[date];
      const pr_vals = d.pr_vals;
      const avgPR = pr_vals.length ? pr_vals.reduce((a,b)=>a+b,0)/pr_vals.length : null;
      
      let bg, textColor;
      if (!avgPR) { bg = 'rgba(27,122,74,0.07)'; textColor = '#8BAA96'; }
      else if (avgPR >= 0.85) { const t = (avgPR-0.85)/0.15; bg = `rgba(39,${Math.round(100+t*74)},${Math.round(60+t*20)},0.8)`; textColor = '#fff'; }
      else if (avgPR >= 0.70) { const t = (avgPR-0.70)/0.15; bg = `rgba(${Math.round(200+t*45)},${Math.round(120+t*46)},${Math.round(30+t*10)},0.8)`; textColor = '#fff'; }
      else { bg = `rgba(180,40,40,0.8)`; textColor = '#fff'; }
      
      cell.className = 'hm-cell';
      cell.style.background = bg; cell.style.color = textColor;
      cell.textContent = avgPR ? (avgPR*100).toFixed(0)+'%' : date.slice(8);
      cell.title = `${date} · PR: ${avgPR ? (avgPR*100).toFixed(1)+'%' : 'N/A'} · ${(d.actual/1000).toFixed(1)} MWh`;
      cell.onclick = () => showDayDetail(date, rows);
      grid.appendChild(cell);
    }
  });
}

// ─── WEEKLY BAR ───────────────────────────────────────────────────────────────
function renderWeeklyBar(rows) {
  const byWeek = aggByWeek(rows);
  const weeks = Object.keys(byWeek).sort((a,b)=>+a-+b);
  const labels = weeks.map(w => 'Wk'+w);
  const actuals = weeks.map(w => +(byWeek[w].actual/1000).toFixed(1));
  const expected = weeks.map(w => +(byWeek[w].expected/1000).toFixed(1));
  const varPct = weeks.map((w,i) => expected[i] > 0 ? +((actuals[i]-expected[i])/expected[i]*100).toFixed(1) : null);
  
  destroyChart('weekly-bar');
  charts['weekly-bar'] = new Chart(document.getElementById('chart-weekly-bar').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Actual MWh', data: actuals, backgroundColor: 'rgba(21,101,192,0.65)', borderColor: '#1565C0', borderWidth: 1, borderRadius: 3 },
        { label: 'Expected MWh', data: expected, backgroundColor: 'rgba(245,158,11,0.25)', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color:'#4A6B55', font:{size:10,family:"'DM Sans',sans-serif"}, boxWidth:12 } },
        tooltip: { ...baseTooltip(), callbacks: { afterBody: (ctx) => [`  Variance: ${varPct[ctx[0].dataIndex]}%`] } },
        datalabels: { display: false }
      },
      scales: baseScales('Week','MWh')
    },
    plugins: [{
      afterDraw(chart) {
        const ctx2 = chart.ctx;
        chart.data.labels.forEach((label, i) => {
          const meta = chart.getDatasetMeta(0);
          const bar = meta.data[i];
          const v = varPct[i];
          if (v == null) return;
          ctx2.save();
          ctx2.font = "bold 10px 'IBM Plex Mono'";
          ctx2.fillStyle = v < -10 ? '#E53935' : v < 0 ? '#F59E0B' : '#2EA06A';
          ctx2.textAlign = 'center';
          ctx2.fillText((v > 0 ? '+' : '') + v + '%', bar.x, bar.y - 6);
          ctx2.restore();
        });
      }
    }]
  });
}

// ─── WATERFALL ────────────────────────────────────────────────────────────────
function renderWaterfall(rows) {
  const byWeek = aggByWeek(rows);
  const weeks = Object.keys(byWeek).sort((a,b)=>+a-+b);
  const labels = weeks.map(w => 'Wk'+w);
  
  const estimated = weeks.map(w => +(byWeek[w].estimated/1000).toFixed(1));
  const actual = weeks.map(w => +(byWeek[w].actual/1000).toFixed(1));
  const downtime = weeks.map(w => +(byWeek[w].downtime/1000).toFixed(1));
  const unexplained = weeks.map((w,i) => {
    const u = estimated[i] - actual[i] - downtime[i];
    return +Math.max(0, u).toFixed(1);
  });
  
  destroyChart('waterfall');
  charts['waterfall'] = new Chart(document.getElementById('chart-waterfall').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Actual Generated', data: actual, backgroundColor: 'rgba(46,160,106,0.70)', borderColor: '#2EA06A', borderWidth: 1, borderRadius: 3 },
        { label: 'Downtime Loss', data: downtime, backgroundColor: 'rgba(229,57,53,0.70)', borderColor: '#E53935', borderWidth: 1, borderRadius: 3 },
        { label: 'Unexplained Loss', data: unexplained, backgroundColor: 'rgba(245,158,11,0.50)', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { color:'#4A6B55', font:{size:10,family:"'DM Sans',sans-serif"}, boxWidth:12 } }, tooltip: { ...baseTooltip() } },
      scales: { ...baseScales(), x: { stacked: true, ticks:{color:ChartDefaults.color.text,font:{size:10,family:ChartDefaults.font.family}}, grid:{color:ChartDefaults.color.grid}, border:{color:'transparent'} }, y: { stacked: true, ticks:{color:ChartDefaults.color.text,font:{size:10,family:ChartDefaults.font.family}}, grid:{color:ChartDefaults.color.grid}, border:{color:'transparent'} } }
    }
  });
}

// ─── CURTAILMENT ─────────────────────────────────────────────────────────────
function renderCurtailment(rows) {
  const byDate = aggByDate(rows);
  const allDates = Object.keys(byDate).sort();
  const labels = allDates.map(d => d.slice(5));
  const daily = allDates.map(d => +(byDate[d].downtime/1000).toFixed(2));
  
  let cumulative = 0;
  const cumDt = daily.map(v => { cumulative += v; return +cumulative.toFixed(2); });
  const pctExp = allDates.map(d => {
    const e = byDate[d].expected;
    return e > 0 ? +(byDate[d].downtime/e*100).toFixed(1) : 0;
  });
  
  destroyChart('curtailment');
  charts['curtailment'] = new Chart(document.getElementById('chart-curtailment').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Daily Downtime MWh', data: daily, backgroundColor: 'rgba(229,57,53,0.60)', borderColor: '#E53935', borderWidth: 1, borderRadius: 2, order: 2 },
        { label: 'Cumulative MWh', data: cumDt, type: 'line', borderColor: '#F59E0B', backgroundColor: 'transparent', pointRadius: 2, tension: 0.3, yAxisID: 'y', order: 1 },
        { label: '% of Expected', data: pctExp, type: 'line', borderColor: '#00ACC1', backgroundColor: 'transparent', pointRadius: 0, tension: 0.3, yAxisID: 'y2', order: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { color:'#4A6B55', font:{size:10,family:"'DM Sans',sans-serif"}, boxWidth:12 } }, tooltip: { ...baseTooltip() } },
      scales: { ...baseScales('Date','MWh'), y2: { position:'right', ticks:{color:'#00ACC1',font:{size:10,family:"'DM Sans',sans-serif"},callback:v=>v+'%'}, grid:{display:false}, border:{color:'transparent'} } }
    }
  });
}

// ─── SCATTER ──────────────────────────────────────────────────────────────────
function renderScatter(rows) {
  // Sample to max 400 points for performance
  const sample = rows.filter(r => r[F.ESTIMATED] > 0 && r[F.INV_KW] > 0);
  const step = Math.max(1, Math.floor(sample.length / 400));
  const sampled = sample.filter((_, i) => i % step === 0);
  
  const siteColors = {};
  const palette = ['#1565C0','#2EA06A','#F59E0B','#E53935','#00ACC1','#7C3AED','#0D9488','#EA580C','#0284C7','#DB2777'];
  SITES.forEach((s, i) => { siteColors[s] = palette[i % palette.length]; });
  
  const points = sampled.map(r => ({ x: r[F.ESTIMATED]/1000, y: r[F.INV_KW], site: r[F.SITE] }));
  
  // Simple linear regression
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const n = xs.length;
  const xm = xs.reduce((a,b)=>a+b,0)/n, ym = ys.reduce((a,b)=>a+b,0)/n;
  const slope = xs.reduce((a,x,i)=>a+(x-xm)*(ys[i]-ym),0)/xs.reduce((a,x)=>a+(x-xm)**2,0);
  const intercept = ym - slope*xm;
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const regLine = [{x: xmin, y: slope*xmin+intercept}, {x: xmax, y: slope*xmax+intercept}];
  
  destroyChart('scatter');
  charts['scatter'] = new Chart(document.getElementById('chart-scatter').getContext('2d'), {
    type: 'scatter',
    data: {
      datasets: [
        { label: 'Site-Day', data: points, backgroundColor: points.map(p => siteColors[p.site]+'88'), pointRadius: 3, pointHoverRadius: 5 },
        { label: 'Regression', data: regLine, type: 'line', borderColor: '#1B7A4A', backgroundColor:'transparent', pointRadius: 0, borderWidth: 1.5, borderDash: [6,3] }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...baseTooltip(), callbacks: { label: ctx => ctx.datasetIndex === 0 ? ` ${points[ctx.dataIndex].site}: (${ctx.raw.x.toFixed(1)} MWh, ${ctx.raw.y.toFixed(0)} kW)` : null } } },
      scales: { x: { title:{display:true,text:'Estimated Production (MWh)',color:'#8BAA96',font:{size:10}}, ticks:{color:ChartDefaults.color.text,font:{size:10}}, grid:{color:ChartDefaults.color.grid}, border:{color:'transparent'} }, y: { title:{display:true,text:'Inverter Power (kW)',color:'#8BAA96',font:{size:10}}, ticks:{color:ChartDefaults.color.text,font:{size:10}}, grid:{color:ChartDefaults.color.grid}, border:{color:'transparent'} } }
    }
  });
}

// ─── IRRADIANCE vs ENERGY ─────────────────────────────────────────────────────
function renderIrradiance(rows) {
  const byDate = aggByDate(rows);
  const allDates = Object.keys(byDate).sort();
  const labels = allDates.map(d => d.slice(5));
  const expected = allDates.map(d => +(byDate[d].expected/1000).toFixed(2));
  const inverter = allDates.map(d => +(byDate[d].inv_kwh/1000).toFixed(2));
  
  destroyChart('irradiance');
  charts['irradiance'] = new Chart(document.getElementById('chart-irradiance').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Expected Energy (MWh)', data: expected, fill: true, backgroundColor: 'rgba(245,158,11,0.12)', borderColor: '#F59E0B', borderWidth: 1.5, pointRadius: 0, tension: 0.4 },
        { label: 'Inverter Energy (MWh)', data: inverter, fill: false, borderColor: '#1565C0', borderWidth: 2, pointRadius: 2, tension: 0.4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { color:'#4A6B55', font:{size:10,family:"'DM Sans',sans-serif"}, boxWidth:12 } }, tooltip: { ...baseTooltip(), callbacks: { afterBody: ctx => { const i=ctx[0].dataIndex; return [`  Gap: ${(expected[i]-inverter[i]).toFixed(2)} MWh`]; } } } },
      scales: baseScales('Date','MWh')
    }
  });
}

// ─── TABLE ────────────────────────────────────────────────────────────────────
function drillSite(site) {
  document.getElementById('site-select').value = site;
  applySiteFilter();
}

// ─── UNDERPERFORMING SITES ───────────────────────────────────────────────────
function renderUnderperformingSites(rows) {
  const SITES_CONFIG = [
    { name: 'Forbes',                rank: 1, avgPR: 0.389 },
    { name: 'Westport A',            rank: 2, avgPR: 0.493 },
    { name: 'Oak Hill Solar 2',      rank: 3, avgPR: 0.598 },
    { name: 'Greendale',             rank: 4, avgPR: 0.651 },
    { name: 'Cotuit',                rank: 5, avgPR: 0.683 },
    { name: 'East Brookfield Adams', rank: 6, avgPR: 0.762 }
  ];

  const grid = document.getElementById('underperforming-grid');
  if (!grid) return;

  const cards = SITES_CONFIG.map(cfg => {
    // Compute totalMWh from filtered rows
    const siteRows = rows.filter(r => r[F.SITE] === cfg.name);
    const totalMWh = siteRows.reduce((a, r) => a + (r[F.ACTUAL] || 0), 0) / 1000;

    // Compute sparkline data
    const sparkData = siteRows
      .filter(r => r[F.PR] != null && r[F.PR] > 0 && r[F.PR] <= 1.5)
      .sort((a, b) => a[F.DATE] < b[F.DATE] ? -1 : 1)
      .map(r => r[F.PR]);

    // Generate sparkline SVG path
    let sparkSVG = '';
    if (sparkData.length >= 2) {
      const minV = Math.min(...sparkData);
      const maxV = Math.max(...sparkData);
      const range = maxV - minV || 0.001;
      const pts = sparkData.map((v, i) => {
        const x = (i / (sparkData.length - 1)) * 200;
        const y = 34 - ((v - minV) / range) * 32;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      sparkSVG = `<polyline points="${pts.join(' ')}" fill="none" stroke="#F59E0B" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    } else {
      sparkSVG = `<line x1="0" y1="18" x2="200" y2="18" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="4,3"/>`;
    }

    return `<div style="background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;box-shadow:var(--shadow);">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="background:#F59E0B;color:#fff;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;">#${cfg.rank}</span>
        <span style="font-weight:600;font-size:14px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cfg.name}</span>
      </div>
      <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;">PR</div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-family:'Plus Jakarta Sans',sans-serif;font-size:28px;font-weight:800;color:#F59E0B;">${(cfg.avgPR * 100).toFixed(1)}%</span>
        <span style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);color:#D97706;font-size:9px;font-weight:700;border-radius:20px;padding:3px 8px;letter-spacing:0.5px;white-space:nowrap;">⚠ REVIEW</span>
      </div>
      <svg viewBox="0 0 200 36" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:36px;">${sparkSVG}</svg>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;">MWH (MONTH)</span>
        <span style="font-weight:700;font-size:14px;color:var(--text);">${totalMWh.toFixed(1)}</span>
      </div>
    </div>`;
  });

  grid.innerHTML = cards.join('');
}

// ─── ER TREND ────────────────────────────────────────────────────────────────
function renderERTrend(rows) {
  const bysite = aggBySite(rows);
  const siteERs = Object.entries(bysite)
    .map(([s,v]) => ({ site: s, avgER: v.er_vals.length ? v.er_vals.reduce((a,b)=>a+b,0)/v.er_vals.length : null }))
    .filter(x => x.avgER != null)
    .sort((a,b) => b.avgER - a.avgER);
  
  const top5 = siteERs.slice(0,5);
  const bot5 = siteERs.slice(-5).reverse();
  const selected = [...top5, ...bot5];
  
  const allDates = [...new Set(rows.map(r=>r[F.DATE]))].sort();
  const labels = allDates.map(d => d.slice(5));
  
  const datasets = selected.map((item, i) => {
    const isTop = i < 5;
    const siteRows = rows.filter(r => r[F.SITE] === item.site);
    const erByDate = {};
    siteRows.forEach(r => { if (r[F.ER] != null && r[F.ER] > 0 && r[F.ER] <= 2) erByDate[r[F.DATE]] = r[F.ER]; });
    const data = allDates.map(d => erByDate[d] != null ? +erByDate[d].toFixed(3) : null);
    const color = isTop ? `hsl(${i*25+140},60%,55%)` : `hsl(${i*25+0},70%,60%)`;
    return { label: item.site.slice(0,14), data, borderColor: color, backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 1.5, tension: 0.3, spanGaps: true };
  });
  
  destroyChart('er-trend');
  charts['er-trend'] = new Chart(document.getElementById('chart-er-trend').getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color:'#4A6B55', font:{size:9,family:"'IBM Plex Mono',monospace"}, boxWidth:10, padding:4 }, position:'bottom' },
        tooltip: { ...baseTooltip() },
        annotation: {}
      },
      scales: {
        x: { ticks:{color:ChartDefaults.color.text,font:{size:9},maxRotation:60}, grid:{color:ChartDefaults.color.grid}, border:{color:'transparent'} },
        y: { ticks:{color:ChartDefaults.color.text,font:{size:10}}, grid:{color:ChartDefaults.color.grid}, border:{color:'transparent'}, min:0, max:1.5,
          afterDrawChartArea(axis) {} }
      }
    },
    plugins: [{
      afterDraw(chart) {
        const ctx2 = chart.ctx;
        const yScale = chart.scales.y;
        const xScale = chart.scales.x;
        if (!yScale || !xScale) return;
        const y = yScale.getPixelForValue(0.85);
        ctx2.save();
        ctx2.strokeStyle = 'rgba(229,57,53,0.4)';
        ctx2.setLineDash([4,4]);
        ctx2.lineWidth = 1;
        ctx2.beginPath();
        ctx2.moveTo(xScale.left, y);
        ctx2.lineTo(xScale.right, y);
        ctx2.stroke();
        ctx2.fillStyle = 'rgba(231,76,60,0.7)';
        ctx2.font = "9px 'IBM Plex Mono'";
        ctx2.fillText('0.85', xScale.right - 30, y - 3);
        ctx2.restore();
      }
    }]
  });
}

// ─── DETAIL PANEL ─────────────────────────────────────────────────────────────
function showDayDetail(date, allRows) {
  const dayRows = allRows.filter(r => r[F.DATE] === date);
  if (!dayRows.length) return;
  
  const totalActual = dayRows.reduce((a,r) => a+(r[F.ACTUAL]||0), 0);
  const totalExpected = dayRows.reduce((a,r) => a+(r[F.EXPECTED]||0), 0);
  const totalDown = dayRows.reduce((a,r) => a+(r[F.DOWNTIME]||0), 0);
  const prs = dayRows.filter(r=>r[F.PR]&&r[F.PR]>0&&r[F.PR]<=1.5).map(r=>r[F.PR]);
  const avgPR = prs.length ? prs.reduce((a,b)=>a+b,0)/prs.length : null;
  const pctDiff = totalExpected > 0 ? (totalActual-totalExpected)/totalExpected*100 : null;
  
  document.getElementById('panel-title').textContent = date;
  document.getElementById('panel-subtitle').textContent = `${dayRows.length} sites reporting · Fleet Day View`;
  
  const metricsEl = document.getElementById('panel-metrics');
  const color = pctDiff == null ? 'var(--text)' : pctDiff >= 0 ? 'var(--grass)' : pctDiff >= -10 ? 'var(--sun)' : 'var(--coral)';
  metricsEl.innerHTML = `
    <div class="panel-metric"><div class="panel-metric-label">Actual</div><div class="panel-metric-val" style="color:var(--sky)">${(totalActual/1000).toFixed(1)} MWh</div></div>
    <div class="panel-metric"><div class="panel-metric-label">Expected</div><div class="panel-metric-val" style="color:var(--sun)">${(totalExpected/1000).toFixed(1)} MWh</div></div>
    <div class="panel-metric"><div class="panel-metric-label">Variance</div><div class="panel-metric-val" style="color:${color}">${pctDiff != null ? (pctDiff>0?'+':'')+pctDiff.toFixed(1)+'%' : '—'}</div></div>
    <div class="panel-metric"><div class="panel-metric-label">Avg PR</div><div class="panel-metric-val" style="color:${prColor(avgPR)}">${avgPR ? (avgPR*100).toFixed(1)+'%' : '—'}</div></div>
    <div class="panel-metric"><div class="panel-metric-label">Downtime</div><div class="panel-metric-val" style="color:var(--coral)">${(totalDown/1000).toFixed(2)} MWh</div></div>
    <div class="panel-metric"><div class="panel-metric-label">Sites</div><div class="panel-metric-val" style="color:var(--text)">${dayRows.length}</div></div>
  `;
  
  // Ranked sites by gap %
  const siteData = dayRows.map(r => {
    const gap = r[F.EXPECTED] > 0 ? (r[F.ACTUAL]-r[F.EXPECTED])/r[F.EXPECTED]*100 : null;
    return { site: r[F.SITE], actual: r[F.ACTUAL], gap };
  }).sort((a,b) => (a.gap??0) - (b.gap??0));
  
  const sitesEl = document.getElementById('panel-sites');
  sitesEl.innerHTML = siteData.slice(0, 15).map((s, i) => {
    const gapColor = s.gap == null ? 'var(--text-muted)' : s.gap >= 0 ? 'var(--grass)' : s.gap >= -10 ? 'var(--sun)' : 'var(--coral)';
    return `<div class="panel-site-row">
      <span class="panel-rank">${i+1}</span>
      <span class="panel-site-name">${s.site}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:${gapColor}">${s.gap != null ? (s.gap>0?'+':'')+s.gap.toFixed(1)+'%' : '—'}</span>
    </div>`;
  }).join('');
  
  document.getElementById('detail-panel').classList.add('open');
}

function closePanel() {
  document.getElementById('detail-panel').classList.remove('open');
}

// ─── INIT CHARTS (empty canvases) ─────────────────────────────────────────────
function initCharts() {
  Chart.defaults.color = '#4A6B55';
  Chart.defaults.font.family = "'DM Sans', sans-serif";
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
}

// ─── CHART VISIBILITY FILTER ──────────────────────────────────────────────────
const chartVisibility = {};

function toggleChart(chartId, btn) {
  const isActive = btn.classList.contains('active');
  if (isActive) {
    btn.classList.remove('active');
    chartVisibility[chartId] = false;
  } else {
    btn.classList.add('active');
    chartVisibility[chartId] = true;
  }
  applyChartVisibility();
}

function applyChartVisibility() {
  // Show/hide each chart-card by its data-section
  document.querySelectorAll('[data-section]').forEach(card => {
    const section = card.getAttribute('data-section');
    card.style.display = chartVisibility[section] !== false ? '' : 'none';
  });
  // Hide a chart-row entirely if every one of its [data-section] cards is hidden
  document.querySelectorAll('.chart-row').forEach(row => {
    const cards = row.querySelectorAll('[data-section]');
    if (!cards.length) return;
    const allHidden = Array.from(cards).every(c => c.style.display === 'none');
    row.style.display = allHidden ? 'none' : '';
  });
  // Update toggle-all button label
  const allActive = document.querySelectorAll('.chart-toggle-btn.active').length === document.querySelectorAll('.chart-toggle-btn').length;
  document.getElementById('chart-filter-toggle-all').textContent = allActive ? 'Hide All' : 'Show All';
}

let allChartsVisible = true;
function toggleAllCharts() {
  allChartsVisible = !allChartsVisible;
  document.querySelectorAll('.chart-toggle-btn').forEach(btn => {
    const chartId = btn.getAttribute('data-chart');
    if (allChartsVisible) {
      btn.classList.add('active');
      chartVisibility[chartId] = true;
    } else {
      btn.classList.remove('active');
      chartVisibility[chartId] = false;
    }
  });
  document.getElementById('chart-filter-toggle-all').textContent = allChartsVisible ? 'Hide All' : 'Show All';
  applyChartVisibility();
}

// ─── DARK MODE TOGGLE ─────────────────────────────────────────────────────
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark-mode');
  document.getElementById('theme-icon').textContent  = isDark ? '🌙' : '☀️';
  document.getElementById('theme-label').textContent = isDark ? 'Dark' : 'Light';
  try { localStorage.setItem('pse-theme', isDark ? 'dark' : 'light'); } catch(e) {}
}

// Restore saved preference on load
(function() {
  try {
    const saved = localStorage.getItem('pse-theme');
    if (saved === 'dark') {
      document.documentElement.classList.add('dark-mode');
      // Icons set after DOM ready
      window.addEventListener('DOMContentLoaded', function() {
        const icon  = document.getElementById('theme-icon');
        const label = document.getElementById('theme-label');
        if (icon)  icon.textContent  = '🌙';
        if (label) label.textContent = 'Dark';
      });
    }
  } catch(e) {}
})();

// ─── LOAD DATA ────────────────────────────────────────────────────────────────
// Data will be injected here
window.addEventListener('DOMContentLoaded', () => {
  if (window.DASHBOARD_DATA) {
    initData(window.DASHBOARD_DATA);
  }
});

// ═══ SITE LOCATIONS MAP SECTION ═══
(function() {
  if (typeof L === 'undefined') {
    var el = document.getElementById('site-map');
    if (el) el.innerHTML = '<div style="padding:24px;color:#8BAA96;font-size:13px;">Map library could not be loaded. Check your internet connection and reload.</div>';
    return;
  }
  // ── SITE COORDINATE & INFO DATA ─────────────────────────────────────────
  // Coordinates geocoded from PSE_longitudes.xlsx addresses
  const SITE_GEO = {
    "Adirondack":              { lat: 42.3601, lng: -70.9400, address: "70 Adirondack Lane, Westport, MA", capacity: "7.06 MWp" },
    "Arney":                   { lat: 42.7306, lng: -77.8758, address: "2535 Hendershot Rd, Mt Morris, NY", capacity: "6.51 MWp" },
    "Blackwater":              { lat: 44.6015, lng: -75.4041, address: "104 Horseshoe Road, Heuvelton, NY", capacity: "3.05 MWp" },
    "Blossom B":               { lat: 42.3601, lng: -70.9400, address: "Blossom Road B, Westport, MA", capacity: "6.44 MWp" },
    "Canandaigua":             { lat: 42.8762, lng: -77.2939, address: "2890 Country Road 10, Canandaigua, NY", capacity: "4.62 MWp" },
    "Cedar Hill Solar":        { lat: 42.4959, lng: -73.6629, address: "2579 Brookview Road, Schodack, NY", capacity: "7.51 MWp" },
    "Clayton":                 { lat: 44.2367, lng: -76.0869, address: "13647 County Route 5, Clayton, NY", capacity: "1.68 MWp" },
    "Clover Meadow":           { lat: 42.2529, lng: -73.7951, address: "151 Humane Society Road, Hudson, NY", capacity: "7.27 MWp" },
    "Cotuit":                  { lat: 41.7140, lng: -70.4717, address: "180 Cotuit Rd, Sandwich, MA", capacity: "4.36 MWp" },
    "DeKalb I":                { lat: 44.4851, lng: -75.3048, address: "2536 County Route 17, DeKalb, NY", capacity: "6.03 MWp" },
    "DeKalb II":               { lat: 44.4900, lng: -75.3100, address: "2496 County Rte. 17, DeKalb, NY", capacity: "3.86 MWp" },
    "DeKalb III":              { lat: 44.3900, lng: -75.3600, address: "2700 US Hwy 11, Richville, NY", capacity: "4.00 MWp" },
    "Dover":                   { lat: 42.2340, lng: -71.2734, address: "211 Powisset St, Dover, MA", capacity: "1.42 MWp" },
    "Dudley Ground Mount (1-3)": { lat: 42.0454, lng: -71.9218, address: "124 W Main St, Dudley, MA", capacity: "4.11 MWp" },
    "East Brookfield Adams":   { lat: 42.2195, lng: -72.0657, address: "165 Adams Road, East Brookfield, MA", capacity: "7.03 MWp" },
    "Elmbrook Solar":          { lat: 42.5012, lng: -73.6700, address: "2191 Brookview Road, Schodack, NY", capacity: "8.31 MWp" },
    "Forbes":                  { lat: 42.7270, lng: -77.8900, address: "6468 Creek Rd, Mt Morris, NY", capacity: "6.37 MWp" },
    "Gouverneur I":            { lat: 44.3350, lng: -75.4670, address: "88 Welch Road, Richville, NY", capacity: "1.94 MWp" },
    "Gouverneur II":           { lat: 44.3300, lng: -75.4660, address: "1645 US Highway 11, Gouverneur, NY", capacity: "5.23 MWp" },
    "Grand Island A":          { lat: 43.0264, lng: -78.9684, address: "2411 Bedell Road, Grand Island, NY", capacity: "2.11 MWp" },
    "Greendale":               { lat: 42.5115, lng: -73.5787, address: "201 County Rt 32, Nassau, NY", capacity: "7.54 MWp" },
    "Heath":                   { lat: 43.2348, lng: -73.8290, address: "14 Butler Drive, Corinth, NY", capacity: "N/A" },
    "Joe Jenny":               { lat: 42.1195, lng: -72.0013, address: "17 Joe Jenny Road, Oxford, MA", capacity: "2.04 MWp" },
    "Lake Waconia":            { lat: 44.8485, lng: -93.7924, address: "7025 Country Road 10 N, Waconia, MN", capacity: "2.69 MWp" },
    "Mendon Cape Rd / Hartford Ave": { lat: 42.0993, lng: -71.5393, address: "36 Cape Road, Mendon, MA", capacity: "3.24 MWp" },
    "New Germany":             { lat: 44.8802, lng: -94.0148, address: "5595 Yancy Ave, New Germany, MN", capacity: "1.30 MWp" },
    "Oak Hill Solar 1":        { lat: 42.7705, lng: -74.1326, address: "13590 Duanesburg Road, Duanesburg, NY", capacity: "8.30 MWp" },
    "Oak Hill Solar 2":        { lat: 42.7705, lng: -74.1280, address: "13590 Duanesburg Road, Duanesburg, NY", capacity: "8.30 MWp" },
    "Quiet Meadows 1":         { lat: 43.0742, lng: -75.6546, address: "4330 Stoney Brook Rd, Oneida, NY", capacity: "5.82 MWp" },
    "Quiet Meadows 2":         { lat: 43.0730, lng: -75.6510, address: "4426 Sholtz Rd, Oneida, NY", capacity: "7.55 MWp" },
    "Sand Brook":              { lat: 43.2340, lng: -73.8200, address: "44 Stark Road, Corinth, NY", capacity: "N/A" },
    "Tamarac":                 { lat: 42.7440, lng: -73.5590, address: "126 Brick Church Road, Brunswick, NY", capacity: "6.80 MWp" },
    "Three Rivers":            { lat: 42.1193, lng: -72.3849, address: "285 Three Rivers Road, Wilbraham, MA", capacity: "4.55 MWp" },
    "Veseli":                  { lat: 44.5394, lng: -93.3611, address: "5216 40th St W Unit 1, Webster, MN", capacity: "1.30 MWp" },
    "Volney":                  { lat: 43.3665, lng: -76.3538, address: "1232 County Rte. 6, Town of Volney, NY", capacity: "6.25 MWp" },
    "Wallum":                  { lat: 42.0485, lng: -71.7320, address: "269 Wallum Lake Road, Douglas, MA", capacity: "8.74 MWp" },
    "Ware":                    { lat: 42.2598, lng: -72.2401, address: "313 Palmer Rd, Ware, MA", capacity: "4.26 MWp" },
    "Westport A":              { lat: 41.5762, lng: -71.0762, address: "205 Blossom Road, Westport, MA", capacity: "2.79 MWp" },
    "White River Solar":       { lat: 42.4910, lng: -73.6610, address: "2270 River Road, Schodack, NY", capacity: "7.51 MWp" },
    "Winters 1":               { lat: 42.7306, lng: -77.8758, address: "2535 Hendershot Rd, Mt Morris, NY", capacity: "6.57 MWp" },
    "Winters 2":               { lat: 42.7310, lng: -77.8750, address: "2535 Hendershot Rd, Mt Morris, NY", capacity: "1.83 MWp" },
    "Wolcott 1":               { lat: 42.4530, lng: -78.1580, address: "11500 Dugway Road, Hume, NY", capacity: "6.19 MWp" },
    "Wolcott 2":               { lat: 42.4520, lng: -78.1570, address: "11438 Dugway Road, Hume, NY", capacity: "6.77 MWp" },
    "Zumbro":                  { lat: 44.2957, lng: -92.6718, address: "43701 County 6 Blvd, Zumbrota, MN", capacity: "1.30 MWp" },
  };

  // ── LIVE-STYLE POPUP DATA (from the dashboard dataset) ───────────────────
  function siteStatus(name) {
    const rows = (window.DASHBOARD_DATA && window.DASHBOARD_DATA.rows || []).filter(r => r[0] === name);
    if (!rows.length) return null;
    rows.sort((x, y) => x[1] < y[1] ? -1 : 1);
    const r = rows[rows.length - 1];           // latest day in dataset
    const actual = r[2] || 0, invKw = r[5] || 0, downtime = r[6] || 0, pr = r[8], er = r[9];
    let alerts = 0;
    if (actual <= 0) alerts++;                  // no generation
    if (downtime > 0) alerts++;                 // downtime / curtailment loss
    if (pr != null && pr < 0.70) alerts++;      // low performance ratio
    if (er != null && er < 0.85) alerts++;      // low energy ratio
    return { date: r[1], actual, invKw, alerts };
  }
  const fmt = (v, d) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d || 0 });

  function popupHTML(name, info) {
    return `
      <div class="map-popup-name">&#9729;&#65039; ${name}</div>
      <div class="map-popup-address">&#128205; ${info.address}</div>`;
  }

  // Green pin (grey when another site is selected)
  function makeIcon(isSelected, isAll, hasAlert) {
    const dim = !isSelected && !isAll;
    const fill = dim ? '#b8b8b8' : '#1b7a4a';
    const w = isSelected ? 30 : 22, h = isSelected ? 40 : 30;
    const tri = (false)
      ? `<path d="M13 5.5 L18 14 L8 14 Z" fill="#fff"/><rect x="12.3" y="8.2" width="1.4" height="3.3" fill="${fill}"/><rect x="12.3" y="12" width="1.4" height="1.2" fill="${fill}"/>`
      : `<circle cx="13" cy="12" r="4" fill="#fff"/>`;
    return L.divIcon({
      className: '',
      html: `<div class="map-pin"><svg width="${w}" height="${h}" viewBox="0 0 26 34">
        <path d="M13 1C6.4 1 1 6.2 1 12.7 1 21.5 13 33 13 33S25 21.5 25 12.7C25 6.2 19.6 1 13 1Z" fill="${fill}" stroke="#fff" stroke-width="1.5"/>
        ${tri}</svg></div>`,
      iconSize: [w, h],
      iconAnchor: [w/2, h],
      popupAnchor: [0, -h + 4]
    });
  }

  // ── INIT MAP ───────────────────────────────────────────────────────────────
  const map = L.map('site-map', { zoomControl: true, scrollWheelZoom: false });

  // Basemaps that need no API key and load from any page (including a local file)
  const esriStreet = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, USGS, NPS',
    maxZoom: 19
  });
  const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 19
  });
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19
  });
  esriStreet.addTo(map);
  L.control.layers({ 'Street': esriStreet, 'OpenStreetMap': osmLayer, 'Satellite': esriSat }, null, { position: 'topright' }).addTo(map);

  // If the street tiles fail to load, fall back to OpenStreetMap automatically
  let tileErrors = 0;
  esriStreet.on('tileerror', function() {
    if (++tileErrors === 6 && map.hasLayer(esriStreet)) {
      map.removeLayer(esriStreet);
      osmLayer.addTo(map);
    }
  });

  // Place all markers
  const markers = {};
  const alertFlags = {};
  Object.entries(SITE_GEO).forEach(([name, info]) => {
    const st = siteStatus(name);
    alertFlags[name] = !!(st && st.alerts > 0);
    const marker = L.marker([info.lat, info.lng], { icon: makeIcon(false, true, alertFlags[name]) })
      .addTo(map)
      .bindPopup(() => popupHTML(name, info), { maxWidth: 240, minWidth: 200 });
    markers[name] = marker;
  });

  // Fit map to all markers
  const allCoords = Object.values(SITE_GEO).map(s => [s.lat, s.lng]);
  map.fitBounds(allCoords, { padding: [30, 30] });

  // ── REACT TO SITE FILTER ──────────────────────────────────────────────────
  function updateMapForSite(selectedSite) {
    if (!selectedSite || selectedSite === 'ALL') {
      // Show all markers normally
      Object.entries(markers).forEach(([name, m]) => {
        m.setIcon(makeIcon(false, true, alertFlags[name]));
        m.setZIndexOffset(0);
      });
      if (allCoords.length > 0) {
        map.fitBounds(allCoords, { padding: [30, 30] });
      }
      return;
    }

    // Highlight selected, dim others
    Object.entries(markers).forEach(([name, m]) => {
      const isSelected = (name === selectedSite);
      m.setIcon(makeIcon(isSelected, false, alertFlags[name]));
      m.setZIndexOffset(isSelected ? 1000 : 0);
    });

    // Fly to selected site
    const info = SITE_GEO[selectedSite];
    if (info) {
      map.flyTo([info.lat, info.lng], 13, { duration: 1.0 });
      setTimeout(() => {
        if (markers[selectedSite]) markers[selectedSite].openPopup();
      }, 1100);
    }
  }

  // Hook into the dashboard's site select element
  const siteSelectEl = document.getElementById('site-select');
  if (siteSelectEl) {
    siteSelectEl.addEventListener('change', function() {
      updateMapForSite(this.value);
    });
  }

  // Also watch for programmatic changes (e.g. from table clicks)
  const origApplySiteFilter = window.applySiteFilter;
  window.applySiteFilter = function() {
    if (origApplySiteFilter) origApplySiteFilter.apply(this, arguments);
    const sel = document.getElementById('site-select');
    if (sel) updateMapForSite(sel.value);
  };

  // Initial state
  window.addEventListener('load', function() {
    const sel = document.getElementById('site-select');
    if (sel) updateMapForSite(sel.value);
  });

  // Make map refresh when section becomes visible
  setTimeout(() => { map.invalidateSize(); }, 500);
  window.addEventListener('load', () => map.invalidateSize());
})();
