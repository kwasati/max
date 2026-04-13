// Max Mahon Dashboard — app.js

const API = '';  // same origin
let state = { watchlist: null, screener: null, currentStock: null, activeTab: 'passed' };

// === USER DATA ===
let userData = { watchlist: [], blacklist: [], notes: {}, custom_lists: {} };

async function loadUserData() {
  try {
    userData = await fetch(API + '/api/user').then(r => r.json());
  } catch (e) { console.error('Failed to load user data:', e); }
}

async function toggleWatchlist(symbol, add) {
  try {
    await fetch(API + '/api/user/watchlist', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(add ? { add: [symbol] } : { remove: [symbol] })
    });
    await loadUserData();
    renderStockList();
  } catch (e) { console.error('Watchlist update failed:', e); }
}

async function toggleBlacklist(symbol, add) {
  try {
    await fetch(API + '/api/user/blacklist', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(add ? { add: [symbol] } : { remove: [symbol] })
    });
    await loadUserData();
    renderStockList();
  } catch (e) { console.error('Blacklist update failed:', e); }
}

async function saveNote(symbol, note) {
  try {
    await fetch(API + '/api/user/notes/' + encodeURIComponent(symbol), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });
    userData.notes[symbol] = note;
  } catch (e) { console.error('Note save failed:', e); }
}

function closeDetail() {
  const detail = document.getElementById('detail');
  state.currentStock = null;
  const layout = document.getElementById('stock-layout');
  layout.classList.remove('split-mode');
  layout.classList.add('grid-mode');
  detail.innerHTML = '';
  renderStockList();
}

// ===== INIT =====
async function init() {
  await loadUserData();
  const [wl, sc] = await Promise.all([
    fetch(API + '/api/watchlist').then(r => r.json()).catch(() => null),
    fetch(API + '/api/screener').then(r => r.json()).catch(() => null)
  ]);
  state.watchlist = wl;
  state.screener = sc;
  renderSummary();
  renderStockList();
  bindTabs();
  bindRequests();
}

// ===== HELPERS =====
function safe(v, fmt) {
  if (v == null || v === undefined || (typeof v === 'number' && isNaN(v))) return '-';
  if (fmt === 'pct') return (v * 100).toFixed(1) + '%';
  if (fmt === 'pct0') return (v * 100).toFixed(0) + '%';
  if (fmt === 'x') return v.toFixed(1) + 'x';
  if (fmt === 'x0') return v.toFixed(0) + 'x';
  if (fmt === 'B') return (v / 1e9).toFixed(1);
  if (fmt === '1d') return v.toFixed(1);
  if (fmt === '2d') return v.toFixed(2);
  return String(v);
}

function scoreClass(score) {
  if (score >= 75) return 'high';
  if (score >= 50) return 'mid';
  return 'low';
}

function tagClass(tag) {
  const map = {
    'COMPOUNDER': 'compounder',
    'DIVIDEND_KING': 'dividend-king',
    'CASH_COW': 'cash-cow',
    'CONTRARIAN': 'contrarian',
    'TURNAROUND': 'turnaround',
    'YIELD_TRAP': 'warning',
    'DATA_WARNING': 'warning'
  };
  return map[tag] || 'warning';
}

const TAG_TH = {
  COMPOUNDER: 'หุ้นเติบโต',
  DIVIDEND_KING: 'ปันผลเด่น',
  CASH_COW: 'เงินสดดี',
  CONTRARIAN: 'สวนกระแส',
  TURNAROUND: 'กำลังฟื้น',
  YIELD_TRAP: 'กับดักปันผล',
  DATA_WARNING: 'ข้อมูลผิดปกติ',
  OVERPRICED: 'ราคาสูง',
};

function tagLabel(tag) {
  return TAG_TH[tag] || tag.replace(/_/g, ' ');
}

function barColor(score) {
  if (score >= 75) return 'var(--green)';
  if (score >= 50) return 'var(--yellow)';
  return 'var(--red)';
}

// ===== SUMMARY =====
function renderSummary() {
  const sc = state.screener;
  if (!sc) return;

  const candidates = sc.candidates || [];
  const passedCount = candidates.length;
  const totalScanned = sc.total_scanned || sc.total || 0;
  const avgScore = passedCount > 0
    ? Math.round(candidates.reduce((s, c) => s + (c.quality_score || c.score || 0), 0) / passedCount)
    : 0;
  const discoveries = candidates.filter(c => !c.in_watchlist).length;
  const warnings = candidates.filter(c => (c.signals || []).includes('DATA_WARNING')).length;

  const cards = document.querySelectorAll('#summary-row .summary-card');
  if (cards[0]) {
    cards[0].querySelector('.value').textContent = passedCount;
    cards[0].querySelector('.value').style.color = 'var(--green)';
    cards[0].querySelector('.sub').textContent = `จาก ${totalScanned} ตัวที่ scan`;
  }
  if (cards[1]) {
    cards[1].querySelector('.value').textContent = avgScore;
    cards[1].querySelector('.value').style.color = 'var(--accent)';
  }
  if (cards[2]) {
    cards[2].querySelector('.value').textContent = discoveries;
    cards[2].querySelector('.value').style.color = 'var(--blue)';
  }
  if (cards[3]) {
    cards[3].querySelector('.value').textContent = warnings;
    cards[3].querySelector('.value').style.color = 'var(--red)';
  }

  // Update header meta
  const meta = document.getElementById('header-meta');
  const runDate = sc.run_date || sc.date;
  if (meta && runDate) {
    const d = new Date(runDate);
    const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    meta.innerHTML = `
      <span>Scoring: <strong>Buffett Quality + Value</strong></span>
      <span>Updated: <strong>${dateStr}</strong></span>
      <span>Scanned: <strong>${totalScanned} stocks</strong></span>
    `;
  }
}

// ===== TABS =====
function bindTabs() {
  document.querySelectorAll('#tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tabs .tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeTab = btn.dataset.tab;
      const type = btn.dataset.type; // 'stock' or 'page'

      const stockSection = document.getElementById('stock-section');
      const pipelineBar = document.getElementById('pipeline-bar');

      // Hide all page panels
      document.querySelectorAll('.page-panel').forEach(p => p.classList.remove('active'));

      if (type === 'stock') {
        stockSection.style.display = '';
        pipelineBar.style.display = '';
        renderStockList();
      } else {
        stockSection.style.display = 'none';
        pipelineBar.style.display = 'none';
        const panel = document.getElementById('page-' + btn.dataset.tab);
        if (panel) panel.classList.add('active');
        // Load data for specific tabs
        if (btn.dataset.tab === 'requests') loadRequests();
        else if (btn.dataset.tab === 'dca') populateDCASymbols();
        else if (btn.dataset.tab === 'settings') loadSettings();
      }
    });
  });
}

// ===== STOCK LIST =====
function renderStockList() {
  const el = document.getElementById('stock-list');
  const sc = state.screener;
  if (!sc || !sc.candidates) {
    el.innerHTML = '<div class="loading">No data available</div>';
    return;
  }

  let candidates = sc.candidates || [];
  const tab = state.activeTab;

  // Update tab labels
  const tabs = document.querySelectorAll('#tabs .tab');
  const passedCount = candidates.length;
  const wlCount = candidates.filter(c => c.in_watchlist).length;
  const discCount = candidates.filter(c => !c.in_watchlist).length;
  const filteredCount = (sc.total_scanned || sc.total || 0) - passedCount;

  if (tabs[0]) tabs[0].textContent = `ผ่านเกณฑ์ (${passedCount})`;
  if (tabs[1]) tabs[1].textContent = `ติดตาม (${wlCount})`;
  if (tabs[2]) tabs[2].textContent = `ค้นพบใหม่ (${discCount})`;
  if (tabs[3]) tabs[3].textContent = `ไม่ผ่าน (${filteredCount})`;

  // Filter
  if (tab === 'watchlist') candidates = candidates.filter(c => c.in_watchlist);
  else if (tab === 'discoveries') candidates = candidates.filter(c => !c.in_watchlist);
  else if (tab === 'filtered') {
    const filtered = sc.filtered_out_stocks || [];
    if (filtered.length === 0) {
      el.innerHTML = '<div class="loading">ไม่มีข้อมูลหุ้นที่ไม่ผ่าน</div>';
      return;
    }
    el.innerHTML = '<div class="stock-grid">' + filtered.map(s => {
      const sym = (s.symbol || '').replace('.BK','');
      const fullSym = s.symbol || '';
      const sector = s.sector || '';
      const metrics = s.basic_metrics || {};
      const dy = metrics.dividend_yield != null ? metrics.dividend_yield.toFixed(1) + '%' : '-';
      const roe = metrics.roe != null ? (metrics.roe * 100).toFixed(0) + '%' : '-';
      const reasons = (s.reasons || []).join(', ');
      const selected = state.currentStock === fullSym ? ' selected' : '';
      return `<div class="stock-card filtered-card${selected}" data-symbol="${fullSym}">
        <div class="card-row">
          <div class="card-info">
            <h3>${sym}</h3>
            <div class="sector">${sector}</div>
          </div>
        </div>
        ${s.name ? '<div style="font-size:0.78rem;color:var(--text3);margin:4px 0;">' + s.name + '</div>' : ''}
        <div class="filtered-reasons">${reasons}</div>
        <div class="card-metrics-row">
          <div class="card-metric"><span class="label">Yield</span><span class="value">${dy}</span></div>
          <div class="card-metric"><span class="label">ROE</span><span class="value">${roe}</span></div>
        </div>
      </div>`;
    }).join('') + '</div>';

    el.querySelectorAll('.stock-card').forEach(row => {
      row.addEventListener('click', () => loadDetail(row.dataset.symbol));
    });
    return;
  } else if (tab === 'requests') {
    el.innerHTML = '';
    return;
  } else if (tab === 'dca') {
    el.innerHTML = '';
    return;
  } else if (tab === 'settings') {
    el.innerHTML = '';
    return;
  }

  // Sort by score desc
  candidates.sort((a, b) => (b.quality_score || b.score || 0) - (a.quality_score || a.score || 0));

  if (candidates.length === 0) {
    el.innerHTML = '<div class="loading">No stocks in this category</div>';
    return;
  }

  el.innerHTML = '<div class="stock-grid">' + candidates.map(c => {
    const sym = c.symbol || '';
    const sector = c.sector || '';
    const score = c.quality_score || c.score || 0;
    const signals = c.signals || [];
    const price = c.price ?? c.metrics?.current_price;
    const priceStr = price != null ? safe(price, '2d') : '-';
    const yld = c.dividend_yield ?? c.metrics?.dividend_yield;
    const yldStr = yld != null ? Number(yld).toFixed(1) : '-';
    const yldColor = (yld != null && yld > 15) ? 'style="color: var(--red);"' : '';
    const selected = state.currentStock === sym ? ' selected' : '';
    const val = c.valuation || {};
    const valGrade = val.grade || '-';
    const valLabel = val.label || '';
    const valClass = valGrade === 'A' ? 'val-a' : valGrade === 'B' ? 'val-b' : valGrade === 'C' ? 'val-c' : valGrade === 'D' ? 'val-d' : 'val-f';
    const fiveYrYld = c.five_year_avg_yield ?? c.metrics?.five_year_avg_yield;
    const fiveYrStr = fiveYrYld != null ? Number(fiveYrYld).toFixed(1) : '-';

    const isWatched = (userData.watchlist || []).includes(sym);
    const isBlacklisted = (userData.blacklist || []).includes(sym);

    return `<div class="stock-card${selected}" data-symbol="${sym}">
      <div class="card-actions">
        <button class="action-btn ${isWatched ? 'active' : ''}" onclick="event.stopPropagation(); toggleWatchlist('${sym}', ${!isWatched})" title="${isWatched ? 'เอาออกจากติดตาม' : 'เพิ่มติดตาม'}">
          ${isWatched ? '\u2605' : '\u2606'}
        </button>
        <button class="action-btn hide-btn ${isBlacklisted ? 'active' : ''}" onclick="event.stopPropagation(); toggleBlacklist('${sym}', ${!isBlacklisted})" title="${isBlacklisted ? 'เลิกซ่อน' : 'ซ่อน'}">
          ${isBlacklisted ? '\uD83D\uDC41' : '\uD83D\uDEAB'}
        </button>
      </div>
      <div class="card-row">
        <div class="card-score-circle ${scoreClass(score)}">${score}</div>
        <div class="card-info">
          <h3>${sym.replace('.BK', '')}</h3>
          <div class="sector">${sector}</div>
        </div>
      </div>
      <div class="card-metrics-row">
        <div class="card-metric"><span class="label">Yield</span><span class="value" ${yldColor}>${yldStr}%</span></div>
        <div class="card-metric"><span class="label">Avg 5y</span><span class="value">${fiveYrStr}%</span></div>
        <div class="card-metric"><span class="label">ระดับราคา</span><span class="val-badge ${valClass}">${valGrade}</span></div>
      </div>
      <div class="card-tags">${signals.map(s => `<span class="tag ${tagClass(s)}">${tagLabel(s)}</span>`).join('')}</div>
    </div>`;
  }).join('') + '</div>';

  // Bind clicks
  el.querySelectorAll('.stock-card').forEach(row => {
    row.addEventListener('click', () => loadDetail(row.dataset.symbol));
  });
}

// ===== LOAD DETAIL =====
async function loadDetail(symbol) {
  state.currentStock = symbol;
  const layout = document.getElementById('stock-layout');
  layout.classList.remove('grid-mode');
  layout.classList.add('split-mode');
  renderStockList(); // highlight selected

  const detail = document.getElementById('detail');
  detail.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const data = await fetch(API + '/api/stock/' + encodeURIComponent(symbol)).then(r => r.json());
    renderDetail(data);
  } catch (e) {
    detail.innerHTML = '<div class="loading">Error loading stock data</div>';
  }
}

// ===== CHART RENDERING =====
function renderDetailCharts(stockData) {
  const yearly = stockData.yearly_metrics || [];
  if (yearly.length < 2 && Object.keys(stockData.dividend_history || {}).length < 2) return;

  // Destroy existing charts
  ['divChart', 'roeChart', 'revenueChart'].forEach(id => {
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
  });

  const chartTextColor = '#888';
  const chartGridColor = 'rgba(0,0,0,0.05)';

  // 1. Dividend chart (from dividend_history)
  const divHistory = stockData.dividend_history || {};
  const divYears = Object.keys(divHistory).sort().slice(-10);
  const divValues = divYears.map(y => divHistory[y] || 0);

  if (divYears.length > 0) {
    const ctx1 = document.getElementById('divChart');
    if (ctx1) {
      new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: divYears,
          datasets: [{
            label: 'ปันผล/หุ้น (บาท)',
            data: divValues,
            backgroundColor: 'rgba(30, 111, 92, 0.7)',
            borderRadius: 4,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, grid: { color: chartGridColor }, ticks: { color: chartTextColor } }, x: { grid: { display: false }, ticks: { color: chartTextColor } } }
        }
      });
    }
  }

  // 2. ROE chart
  const years = yearly.map(y => y.year);
  const roeValues = yearly.map(y => y.roe != null ? (y.roe * 100).toFixed(1) : null);
  const ctx2 = document.getElementById('roeChart');
  if (ctx2 && yearly.length >= 2) {
    new Chart(ctx2, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: 'ROE %',
          data: roeValues,
          borderColor: 'rgba(30, 111, 92, 0.8)',
          backgroundColor: 'rgba(30, 111, 92, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { grid: { color: chartGridColor }, ticks: { color: chartTextColor } }, x: { grid: { display: false }, ticks: { color: chartTextColor } } }
      }
    });
  }

  // 3. Revenue + Net Income chart
  if (yearly.length >= 2) {
    const revValues = yearly.map(y => y.revenue ? y.revenue / 1e9 : null);
    const niValues = yearly.map(y => y.net_income ? y.net_income / 1e9 : null);
    const ctx3 = document.getElementById('revenueChart');
    if (ctx3) {
      new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: years,
          datasets: [
            { label: 'Revenue (B฿)', data: revValues, backgroundColor: 'rgba(37, 88, 166, 0.6)', borderRadius: 4 },
            { label: 'Net Income (B฿)', data: niValues, backgroundColor: 'rgba(13, 128, 80, 0.6)', borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: chartTextColor, font: { size: 11 } } } },
          scales: { y: { grid: { color: chartGridColor }, ticks: { color: chartTextColor } }, x: { grid: { display: false }, ticks: { color: chartTextColor } } }
        }
      });
    }
  }
}

// ===== DETAIL HELPERS =====
function scoreCircleSVG(score) {
  const pct = score / 100;
  const color = score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';
  const circumference = 2 * Math.PI * 40;
  const dashoffset = circumference * (1 - pct);
  return `<svg width="100" height="100" viewBox="0 0 100 100" class="score-circle-svg">
    <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" stroke-width="8"/>
    <circle cx="50" cy="50" r="40" fill="none" stroke="${color}" stroke-width="8"
      stroke-dasharray="${circumference}" stroke-dashoffset="${dashoffset}"
      stroke-linecap="round" transform="rotate(-90 50 50)"/>
    <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
      fill="${color}" font-size="24" font-weight="bold" font-family="JetBrains Mono">${score}</text>
  </svg>`;
}

function signalBadge(signal) {
  const colors = {
    'COMPOUNDER': 'var(--green)',
    'DIVIDEND_KING': 'var(--yellow)',
    'CASH_COW': 'var(--purple)',
    'CONTRARIAN': 'var(--blue)',
    'TURNAROUND': 'var(--accent)',
    'YIELD_TRAP': 'var(--red)',
    'DATA_WARNING': 'var(--orange)',
    'OVERPRICED': 'var(--red)',
    'NEAR_MISS_ROE': 'var(--yellow)',
    'NEAR_MISS_NM': 'var(--yellow)',
  };
  const color = colors[signal] || 'var(--text3)';
  return `<span class="signal-badge" style="background:color-mix(in srgb, ${color} 15%, transparent);color:${color};border:1px solid color-mix(in srgb, ${color} 30%, transparent)">${(TAG_TH[signal] || signal.replace(/_/g, ' '))}</span>`;
}

function valGradeBadge(val) {
  if (!val || !val.grade) return '';
  const colors = { A: 'var(--green)', B: 'var(--blue)', C: 'var(--yellow)', D: 'var(--orange)', F: 'var(--red)' };
  const color = colors[val.grade] || 'var(--text3)';
  return `<div class="val-grade" style="background:color-mix(in srgb, ${color} 10%, transparent);border-color:${color}">
    <span class="val-letter" style="color:${color}">${val.grade}</span>
    <span class="val-label">${val.label || ''}</span>
  </div>`;
}

function buffettChecklist(data) {
  const yearly = data.yearly_metrics || [];
  const agg = data.aggregates || {};
  const checks = [
    { label: 'ROE \u226515% สม่ำเสมอ', pass: agg.avg_roe >= 0.15 && agg.min_roe >= 0.12 },
    { label: 'Gross Margin \u226530%', pass: agg.avg_gross_margin >= 0.30 },
    { label: 'หนี้ต่ำ (D/E < 1.0)', pass: yearly.length > 0 && yearly[yearly.length-1].de_ratio < 1.0 },
    { label: 'FCF บวกทุกปี', pass: agg.fcf_positive_years >= agg.fcf_total_years && agg.fcf_total_years > 0 },
    { label: 'ปันผล \u22655 ปีติด', pass: agg.dividend_streak >= 5 },
    { label: 'EPS โตสม่ำเสมอ', pass: agg.eps_cagr > 0.05 },
  ];
  return checks.map(c =>
    `<div class="checklist-item ${c.pass ? 'pass' : 'fail'}">
      <span class="check-icon">${c.pass ? '\u2713' : '\u2717'}</span> ${c.label}
    </div>`
  ).join('');
}

// ===== RENDER DETAIL =====
function renderDetail(d) {
  const detail = document.getElementById('detail');
  if (!d) { detail.innerHTML = '<div class="loading">No data</div>'; return; }

  const sym = (d.symbol || '').replace('.BK', '');
  const fullSymbol = d.symbol || '';
  const name = d.name || d.long_name || sym;
  const sector = d.sector || '';
  const mktCap = d.market_cap != null ? Math.round(d.market_cap / 1e9) + 'B' : '-';
  const price = d.price != null ? safe(d.price, '2d') : '-';
  const low52 = d.fifty_two_week_low || d['52w_low'];
  const high52 = d.fifty_two_week_high || d['52w_high'];
  const rangePos = (low52 != null && high52 != null && high52 !== low52)
    ? Math.round((d.price - low52) / (high52 - low52) * 100) : null;

  const agg = d.aggregates || {};
  const ym = d.yearly_metrics || [];
  const totalYears = ym.length;
  const divHist = d.dividend_history || {};
  const score = d.quality_score || d.score || 0;
  const breakdown = d.score_breakdown || d.breakdown || {};
  const signals = d.signals || [];
  const val = d.valuation || {};

  // Quick metrics
  const latestYM = ym.length > 0 ? ym[ym.length - 1] : {};
  const divYield = d.dividend_yield;
  const payoutRatio = d.payout_ratio;
  const peRatio = d.pe_ratio;

  // Yearly table data
  const years = ym.map(y => y.year).sort((a, b) => a - b);

  function yearlyTableHTML() {
    if (years.length === 0) return '';
    const rows = [
      { label: 'Revenue (B)', get: r => r.revenue, fmt: v => safe(v, 'B') },
      { label: 'Net Income (B)', get: r => r.net_income, fmt: v => safe(v, 'B') },
      { label: 'EPS', get: r => r.eps, fmt: v => safe(v, '2d') },
      { label: 'ROE', get: r => r.roe, fmt: v => v != null ? (v * 100).toFixed(1) + '%' : '-' },
      { label: 'Net Margin', get: r => r.net_margin, fmt: v => v != null ? (v * 100).toFixed(1) + '%' : '-' },
      { label: 'D/E', get: r => r.de_ratio, fmt: v => safe(v, '2d') },
      { label: 'FCF (B)', get: r => r.fcf, fmt: v => safe(v, 'B') },
    ];

    return '<div class="yearly-table-wrap"><table class="yearly-table"><thead><tr><th></th>'
      + years.map(y => '<th>' + y + '</th>').join('')
      + '</tr></thead><tbody>'
      + rows.map(r => '<tr><td>' + r.label + '</td>'
        + years.map(yr => {
          const row = ym.find(y => y.year === yr);
          const v = row ? r.get(row) : null;
          return '<td>' + (v != null ? r.fmt(v) : '-') + '</td>';
        }).join('')
        + '</tr>').join('')
      + '<tr><td>DPS</td>'
      + years.map(yr => '<td>' + (divHist[yr] != null ? safe(divHist[yr], '2d') : '-') + '</td>').join('')
      + '</tr></tbody></table></div>';
  }

  // Near miss signals
  const nearMissSignals = signals.filter(s => s.startsWith('NEAR_MISS'));
  const nearMissHTML = nearMissSignals.length > 0
    ? '<div class="near-miss-banner">' + nearMissSignals.map(s => TAG_TH[s] || s.replace(/_/g, ' ')).join(', ') + ' (เกือบผ่านเกณฑ์)</div>'
    : '';

  // Note
  const noteVal = (userData.notes || {})[d.symbol || ''] || '';

  // ===== BUILD HTML =====
  detail.innerHTML = `
    <button class="detail-close-btn" onclick="closeDetail()">ปิด &times;</button>

    <div class="detail-close" id="detail-close">
      <button onclick="closeDetail()">\u2190 กลับ</button>
    </div>

    <div class="detail-header">
      <div class="detail-info">
        <div class="detail-symbol">${sym}</div>
        <div class="detail-name">${name}</div>
        <div class="detail-sector">${sector} &middot; Market Cap ${mktCap}</div>
      </div>
      ${scoreCircleSVG(score)}
    </div>

    <div class="signal-badges">
      ${signals.map(s => signalBadge(s)).join('')}
    </div>

    ${valGradeBadge(val)}

    ${nearMissHTML}

    <div class="quick-metrics">
      <div class="qm-item"><div class="qm-label">Price</div><div class="qm-value">${price}</div></div>
      <div class="qm-item"><div class="qm-label">P/E</div><div class="qm-value">${peRatio != null ? peRatio.toFixed(1) : '-'}</div></div>
      <div class="qm-item"><div class="qm-label">Yield</div><div class="qm-value">${divYield != null ? divYield.toFixed(1) + '%' : '-'}</div></div>
      <div class="qm-item"><div class="qm-label">Payout</div><div class="qm-value">${payoutRatio != null ? (payoutRatio * 100).toFixed(0) + '%' : '-'}</div></div>
      <div class="qm-item"><div class="qm-label">D/E</div><div class="qm-value">${latestYM.de_ratio != null ? latestYM.de_ratio.toFixed(2) : '-'}</div></div>
    </div>

    <div class="section-title">Buffett Checklist</div>
    ${buffettChecklist(d)}

    <div class="chart-section">
      <h4>ปันผลต่อหุ้น (10 ปี)</h4>
      <div class="chart-container"><canvas id="divChart"></canvas></div>
    </div>
    <div class="chart-section">
      <h4>ROE %</h4>
      <div class="chart-container"><canvas id="roeChart"></canvas></div>
    </div>
    <div class="chart-section">
      <h4>รายได้ vs กำไร (พันล้าน฿)</h4>
      <div class="chart-container"><canvas id="revenueChart"></canvas></div>
    </div>

    <div class="section-title">Year-over-Year Financials</div>
    ${yearlyTableHTML()}

    <div class="note-section">
      <label>บันทึก:</label>
      <textarea class="note-input" id="note-${d.symbol || ''}" placeholder="เพิ่มบันทึก...">${noteVal}</textarea>
      <button class="note-save" onclick="saveNote('${d.symbol || ''}', document.getElementById('note-${d.symbol || ''}').value)">บันทึก</button>
    </div>
  `;

  // Render charts after DOM is ready
  setTimeout(() => renderDetailCharts(d), 50);

  // Scroll to detail (desktop only, mobile is fullscreen)
  if (window.innerWidth >= 1024) {
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ===== REQUEST PANEL =====
function bindRequests() {
  const btn = document.getElementById('request-submit');
  const input = document.getElementById('request-input');
  if (!btn || !input) return;

  btn.addEventListener('click', async () => {
    const raw = input.value.trim();
    if (!raw) return;
    const symbols = raw.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);

    btn.disabled = true;
    btn.textContent = 'กำลังส่ง...';

    const resultsEl = document.getElementById('request-results');
    if (resultsEl) resultsEl.innerHTML = '<div class="loading">กำลังดึงข้อมูล...</div>';

    try {
      const resp = await fetch(API + '/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols })
      });
      if (!resp.ok) throw new Error('Request failed');
      input.value = '';

      // Poll for completion
      setTimeout(() => loadRequests(), 3000);
      setTimeout(() => loadRequests(), 10000);
      setTimeout(() => loadRequests(), 30000);
    } catch (e) {
      if (resultsEl) resultsEl.innerHTML = '<div class="error">เกิดข้อผิดพลาด กรุณาลองใหม่</div>';
    }
    btn.disabled = false;
    btn.textContent = 'ส่งคำขอ';
  });
}

async function loadRequests() {
  const el = document.getElementById('request-results');
  if (!el) return;
  try {
    const data = await fetch(API + '/api/requests').then(r => r.json());
    const requests = data.requests || [];
    if (requests.length === 0) {
      el.innerHTML = '<div class="loading">ยังไม่มีคำขอ</div>';
      return;
    }
    el.innerHTML = requests.map(req => {
      const stocks = req.stocks || [];
      const stockCards = stocks.map(s => {
        if (s.error) {
          return `<div class="request-item error"><span class="symbol">${s.symbol}</span><span class="status error">ไม่พบข้อมูล</span></div>`;
        }
        const dy = s.dividend_yield != null ? s.dividend_yield.toFixed(1) + '%' : 'N/A';
        const price = s.price != null ? '฿' + s.price.toFixed(2) : 'N/A';
        return `<div class="request-item" onclick="selectStock('${s.symbol}')">
          <span class="symbol">${(s.symbol || '').replace('.BK','')}</span>
          <span class="price">${price}</span>
          <span class="yield">${dy}</span>
        </div>`;
      }).join('');
      return `<div class="request-group">
        <div class="request-header">${req.date} (${req.count} stocks)</div>
        ${stockCards}
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = '<div class="loading">ไม่สามารถโหลดคำขอได้</div>';
  }
}

// ===== PIPELINE CONTROL =====
function bindPipeline() {
  document.querySelectorAll('.pipe-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (!confirm(`รัน ${action}?`)) return;
      runPipeline(action);
    });
  });
  // Toggle advanced buttons
  const toggleBtn = document.getElementById('toggle-advanced');
  const advPanel = document.getElementById('pipeline-advanced');
  if (toggleBtn && advPanel) {
    toggleBtn.addEventListener('click', () => {
      const visible = advPanel.style.display !== 'none';
      advPanel.style.display = visible ? 'none' : 'flex';
      toggleBtn.textContent = visible ? 'ขั้นสูง ▾' : 'ขั้นสูง ▴';
    });
  }
  // Start SSE listener
  connectSSE();
}

async function runPipeline(action) {
  const btns = document.querySelectorAll('.pipe-btn');
  btns.forEach(b => b.disabled = true);
  const statusEl = document.getElementById('pipeline-status');
  statusEl.innerHTML = '<div class="pipe-spinner"></div><span class="running">Starting...</span>';

  try {
    const res = await fetch(API + '/api/run/' + action, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      statusEl.innerHTML = `<span class="error">${err.detail || 'Error'}</span>`;
      btns.forEach(b => b.disabled = false);
    }
  } catch (e) {
    statusEl.innerHTML = `<span class="error">Connection failed</span>`;
    btns.forEach(b => b.disabled = false);
  }
}

function connectSSE() {
  const statusEl = document.getElementById('pipeline-status');
  if (!statusEl) return;

  const es = new EventSource(API + '/api/events');
  es.addEventListener('status', (e) => {
    const data = JSON.parse(e.data);
    const btns = document.querySelectorAll('.pipe-btn');

    if (data.pipeline_running) {
      btns.forEach(b => b.disabled = true);
      const task = data.current_task || 'processing';
      statusEl.innerHTML = `<div class="pipe-spinner"></div><span class="running">${task}</span>`;
    } else {
      btns.forEach(b => b.disabled = false);
      if (data.last_result) {
        const isOK = data.last_result.startsWith('OK');
        const cls = isOK ? 'done' : 'error';
        const time = data.last_run ? new Date(data.last_run).toLocaleTimeString('en-GB') : '';
        statusEl.innerHTML = `<span class="${cls}">${data.last_result}</span> <span>${time}</span>`;
        // Auto-refresh data after pipeline completes
        if (isOK && statusEl.dataset.wasRunning === 'true') {
          statusEl.dataset.wasRunning = 'false';
          setTimeout(() => { init(); }, 1000);
        }
      } else {
        statusEl.innerHTML = '';
      }
    }
    statusEl.dataset.wasRunning = String(data.pipeline_running);
  });

  es.onerror = () => {
    statusEl.innerHTML = '<span class="error">SSE disconnected</span>';
    es.close();
    // Reconnect after 5s
    setTimeout(connectSSE, 5000);
  };
}

// ===== DCA SIMULATOR =====
function bindDCA() {
  const btn = document.getElementById('dca-submit');
  if (!btn) return;

  // Populate symbol autocomplete from screener data
  populateDCASymbols();

  btn.addEventListener('click', runDCA);
}

function populateDCASymbols() {
  const datalist = document.getElementById('dca-symbols-list');
  if (!datalist) return;
  const symbols = new Set();

  if (state.screener && state.screener.candidates) {
    state.screener.candidates.forEach(c => { if (c.symbol) symbols.add(c.symbol); });
  }
  if (state.watchlist && state.watchlist.stocks) {
    state.watchlist.stocks.forEach(s => { if (s.symbol) symbols.add(s.symbol); });
  }

  datalist.innerHTML = [...symbols].sort().map(s => `<option value="${s}">`).join('');
}

async function runDCA() {
  const symbolInput = document.getElementById('dca-symbol');
  const amountInput = document.getElementById('dca-amount');
  const backtestYearsInput = document.getElementById('dca-backtest-years');
  const forwardYearsInput = document.getElementById('dca-forward-years');
  const reinvestInput = document.getElementById('dca-reinvest');
  const priceGrowthInput = document.getElementById('dca-price-growth');
  const divGrowthInput = document.getElementById('dca-div-growth');
  const resultsEl = document.getElementById('dca-results');
  const btn = document.getElementById('dca-submit');

  let symbol = symbolInput.value.trim();
  if (!symbol) { alert('กรุณาใส่ชื่อหุ้น'); return; }

  // Collect selected days
  const dayCheckboxes = document.querySelectorAll('#dca-days-chips input[type="checkbox"]:checked');
  const days = [...dayCheckboxes].map(cb => cb.value).join(',');
  if (!days) { alert('กรุณาเลือกวันที่ซื้ออย่างน้อย 1 วัน'); return; }

  const amount = parseFloat(amountInput.value) || 5000;
  const backtest_years = parseInt(backtestYearsInput.value) || 0;
  const forward_years = parseInt(forwardYearsInput.value) || 10;
  const reinvest = reinvestInput.checked;

  btn.disabled = true;
  btn.textContent = 'กำลังคำนวณ...';
  resultsEl.innerHTML = '<div class="loading">กำลังดึงข้อมูลและคำนวณ... (อาจใช้เวลา 10-30 วินาที)</div>';

  try {
    const params = new URLSearchParams({ days, amount, backtest_years, forward_years, reinvest });
    // Add optional growth overrides
    const pg = parseFloat(priceGrowthInput.value);
    if (!isNaN(pg)) params.set('price_growth', (pg / 100).toFixed(4));
    const dg = parseFloat(divGrowthInput.value);
    if (!isNaN(dg)) params.set('div_growth', (dg / 100).toFixed(4));
    const res = await fetch(API + `/api/dca/${encodeURIComponent(symbol)}?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
      resultsEl.innerHTML = `<div class="loading" style="color:var(--red);">Error: ${err.detail || res.statusText}</div>`;
      return;
    }
    const data = await res.json();
    renderDCAResults(data);
  } catch (e) {
    resultsEl.innerHTML = `<div class="loading" style="color:var(--red);">Connection error: ${e.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'คำนวณ';
  }
}

function renderDCAResults(data) {
  const el = document.getElementById('dca-results');
  const bt = data.backtest;
  const pj = data.projection;

  function fmtMoney(v) {
    if (v == null) return '-';
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + ' ล้าน';
    return Math.round(v).toLocaleString('th-TH');
  }

  function fmtFull(v) {
    if (v == null) return '-';
    return Math.round(v).toLocaleString('th-TH');
  }

  // Profit calculations
  const profit = bt.current_value - bt.total_invested;
  const profitSign = profit >= 0 ? '+' : '';
  const profitColor = profit >= 0 ? 'var(--green)' : 'var(--red)';
  const totalGain = profit + bt.total_dividends;
  const totalGainSign = totalGain >= 0 ? '+' : '';
  const totalGainColor = totalGain >= 0 ? 'var(--green)' : 'var(--red)';

  // Summary — streaming portfolio style
  const summaryHTML = `
    <div class="dca-portfolio">
      <div class="dca-portfolio-header">
        <div class="dca-port-row">
          <div class="dca-port-item">
            <div class="dca-port-label">จำนวนหุ้น</div>
            <div class="dca-port-value">${bt.total_shares.toLocaleString('th-TH', {maximumFractionDigits: 0})}</div>
          </div>
          <div class="dca-port-item">
            <div class="dca-port-label">ต้นทุนเฉลี่ย</div>
            <div class="dca-port-value">${bt.avg_cost.toLocaleString('th-TH', {maximumFractionDigits: 2})} ฿</div>
          </div>
          <div class="dca-port-item">
            <div class="dca-port-label">ราคาปัจจุบัน</div>
            <div class="dca-port-value">${bt.current_price.toLocaleString('th-TH', {maximumFractionDigits: 2})} ฿</div>
          </div>
        </div>
      </div>

      <div class="dca-port-cards">
        <div class="dca-port-card">
          <div class="dca-port-card-label">ลงทุนรวม</div>
          <div class="dca-port-card-value">${fmtMoney(bt.total_invested)}</div>
          <div class="dca-port-card-sub">${bt.years} ปี</div>
        </div>
        <div class="dca-port-card">
          <div class="dca-port-card-label">มูลค่าปัจจุบัน</div>
          <div class="dca-port-card-value" style="color:${profitColor};">${fmtMoney(bt.current_value)}</div>
          <div class="dca-port-card-sub" style="color:${profitColor};">${profitSign}${fmtMoney(profit)} (${profitSign}${bt.total_return_pct}%)</div>
        </div>
      </div>

      <div class="dca-port-breakdown">
        <div class="dca-port-break-item">
          <span class="dca-port-break-label">กำไรจากราคาหุ้น</span>
          <span class="dca-port-break-value" style="color:${profitColor};">${profitSign}${fmtMoney(profit)}</span>
        </div>
        <div class="dca-port-break-item">
          <span class="dca-port-break-label">ปันผลสะสม</span>
          <span class="dca-port-break-value" style="color:var(--green);">+${fmtMoney(bt.total_dividends)}</span>
        </div>
        <div class="dca-port-break-item dca-port-break-total">
          <span class="dca-port-break-label">รวมเติบโตทั้งหมด</span>
          <span class="dca-port-break-value" style="color:${totalGainColor};">${totalGainSign}${fmtMoney(totalGain)} (${totalGainSign}${bt.total_return_pct}%)</span>
        </div>
      </div>

      <div class="dca-port-forecast">
        <div class="dca-port-card-label">คาดการณ์ ${data.forward_years} ปี</div>
        <div class="dca-port-card-value" style="color:var(--blue);">${fmtMoney(pj.projected_value)}</div>
        <div class="dca-port-card-sub">เติบโตเฉลี่ย ${pj.cagr}%/ปี &middot; Yield on Cost ${bt.yield_on_cost}%</div>
      </div>
    </div>
  `;

  // Backtest table
  const btYearly = bt.yearly || [];
  const btTableHTML = btYearly.length > 0 ? `
    <div class="dca-section">
      <div class="section-title">Historical Backtest <span>ผลจริงย้อนหลัง ${bt.years} ปี</span></div>
      <div class="yoy-scroll">
        <table class="yoy-table">
          <thead>
            <tr>
              <th>ปี</th>
              <th>ลงทุนปีนี้</th>
              <th>หุ้นสะสม</th>
              <th>ลงทุนรวม</th>
              <th>มูลค่าพอร์ต</th>
              <th>ปันผลปีนี้</th>
              <th>ปันผลสะสม</th>
            </tr>
          </thead>
          <tbody>
            ${btYearly.map(r => `<tr>
              <td>${r.year}</td>
              <td>${fmtFull(r.invested_this_year)}</td>
              <td>${r.total_shares.toLocaleString('th-TH', {maximumFractionDigits: 0})}</td>
              <td>${fmtFull(r.total_invested)}</td>
              <td>${fmtFull(r.portfolio_value)}</td>
              <td>${fmtFull(r.dividends_received)}</td>
              <td>${fmtFull(r.total_dividends)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : '';

  // Projection table
  const pjYearly = pj.yearly || [];
  const pjTableHTML = pjYearly.length > 0 ? `
    <div class="dca-section">
      <div class="section-title">Forward Projection <span>${data.forward_years} ปีข้างหน้า</span></div>
      <div class="dca-assumptions">
        <span>ราคาโต ${pj.assumptions.price_growth_rate}%/ปี <small>(${pj.assumptions.price_growth_source})</small></span>
        <span>ปันผลโต ${pj.assumptions.div_growth_rate}%/ปี <small>(${pj.assumptions.div_growth_source})</small></span>
      </div>
      <div class="yoy-scroll">
        <table class="yoy-table">
          <thead>
            <tr>
              <th>ปีที่</th>
              <th>ราคาคาด</th>
              <th>หุ้นสะสม</th>
              <th>ลงทุนรวม</th>
              <th>มูลค่าพอร์ต</th>
              <th>ปันผลปีนี้</th>
              <th>ปันผลสะสม</th>
            </tr>
          </thead>
          <tbody>
            ${pjYearly.map(r => `<tr>
              <td>${r.year}</td>
              <td>${r.price.toLocaleString('th-TH', {maximumFractionDigits: 2})}</td>
              <td>${r.total_shares.toLocaleString('th-TH', {maximumFractionDigits: 0})}</td>
              <td>${fmtFull(r.total_invested)}</td>
              <td>${fmtFull(r.portfolio_value)}</td>
              <td>${fmtFull(r.dividends_this_year)}</td>
              <td>${fmtFull(r.total_dividends)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : '';

  el.innerHTML = summaryHTML + btTableHTML + pjTableHTML;
}

// ===== SETTINGS =====
const DAY_LABELS = { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัสบดี', fri: 'ศุกร์', sat: 'เสาร์', sun: 'อาทิตย์' };

async function loadSettings() {
  try {
    const config = await fetch(API + '/api/settings').then(r => r.json());
    const sched = config.schedule || {};
    const el = (id) => document.getElementById(id);
    if (el('sched-enabled')) el('sched-enabled').checked = sched.enabled !== false;
    if (el('sched-day')) el('sched-day').value = sched.day_of_week || 'sun';
    if (el('sched-hour')) el('sched-hour').value = sched.hour ?? 9;
    if (el('sched-minute')) el('sched-minute').value = sched.minute ?? 0;

    // Pipeline
    const pipe = config.pipeline || {};
    if (el('pipe-odd-weeks')) el('pipe-odd-weeks').value = pipe.odd_weeks || 'weekly';
    if (el('pipe-even-weeks')) el('pipe-even-weeks').value = pipe.even_weeks || 'discovery';

    // Filters
    const f = config.filters || {};
    if (el('filter-roe')) el('filter-roe').value = Math.round((f.min_roe_avg || 0.15) * 100);
    if (el('filter-nm')) el('filter-nm').value = Math.round((f.min_net_margin || 0.10) * 100);
    if (el('filter-de')) el('filter-de').value = f.max_de_non_fin ?? 1.5;
    if (el('filter-mcap')) el('filter-mcap').value = Math.round((f.min_market_cap || 5e9) / 1e6);

    // Update pipeline bar schedule text
    const schedText = document.querySelector('.pipeline-schedule');
    if (schedText) {
      if (sched.enabled === false) {
        schedText.textContent = 'การรันอัตโนมัติ: ปิดอยู่';
      } else {
        const dayTh = DAY_LABELS[sched.day_of_week] || sched.day_of_week;
        const h = String(sched.hour ?? 9).padStart(2, '0');
        const m = String(sched.minute ?? 0).padStart(2, '0');
        schedText.textContent = `รันอัตโนมัติทุก${dayTh} ${h}:${m}`;
      }
    }
    return config;
  } catch (e) {
    return null;
  }
}

async function saveSettings() {
  const el = (id) => document.getElementById(id);
  const statusEl = el('settings-status');

  const config = {
    schedule: {
      enabled: el('sched-enabled')?.checked ?? true,
      day_of_week: el('sched-day')?.value || 'sun',
      hour: parseInt(el('sched-hour')?.value) || 9,
      minute: parseInt(el('sched-minute')?.value) || 0,
    },
  };

  // Include pipeline + filter fields if they exist (Phase 2)
  if (el('pipe-odd-weeks')) {
    config.pipeline = {
      odd_weeks: el('pipe-odd-weeks').value,
      even_weeks: el('pipe-even-weeks').value,
    };
  }
  if (el('filter-roe')) {
    config.filters = {
      min_roe_avg: parseFloat(el('filter-roe').value) / 100,
      min_net_margin: parseFloat(el('filter-nm').value) / 100,
      max_de_non_fin: parseFloat(el('filter-de').value),
      min_market_cap: parseFloat(el('filter-mcap').value) * 1e6,
    };
  }

  try {
    const res = await fetch(API + '/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (res.ok) {
      statusEl.textContent = 'บันทึกแล้ว';
      statusEl.className = 'settings-status success';
      loadSettings(); // refresh schedule display
      setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'settings-status'; }, 3000);
    } else {
      throw new Error('Server error');
    }
  } catch (e) {
    statusEl.textContent = 'เกิดข้อผิดพลาด';
    statusEl.className = 'settings-status error';
  }
}

function bindSettings() {
  const saveBtn = document.getElementById('settings-save');
  if (saveBtn) saveBtn.addEventListener('click', saveSettings);
}

// ===== START =====
init();
bindPipeline();
bindDCA();
bindSettings();
loadSettings(); // update schedule text on load
