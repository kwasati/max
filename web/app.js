// Max Mahon Dashboard — app.js

const API = '';  // same origin
let state = { watchlist: null, screener: null, currentStock: null, activeTab: 'passed', filteredReasons: null, sortBy: 'score' };

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
  state.filteredReasons = null;
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
  bindTabs();
  bindSort();  // sync sortBy with dropdown before first render
  renderStockList();
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

  // ==== Stats Panel (P3) ====
  const slot = (k) => document.querySelector(`.stats-panel [data-stat="${k}"]`);

  // passed count (already available as passedCount variable)
  const passedEl = slot('passed');
  if (passedEl) {
    passedEl.textContent = passedCount;
    passedEl.classList.toggle('pos', passedCount > 0);
  }

  // avg quality score
  const avgEl = slot('avg-score');
  if (avgEl) avgEl.textContent = avgScore;  // existing variable

  // discoveries
  const discEl = slot('discoveries');
  if (discEl) discEl.textContent = discoveries;  // existing variable

  // warnings
  const warnEl = slot('warnings');
  if (warnEl) {
    warnEl.textContent = warnings;
    warnEl.classList.toggle('warn', warnings > 0);
  }

  // avg dividend yield across candidates (new in P3)
  const yieldEl = slot('avg-yield');
  if (yieldEl) {
    const candidates = sc.candidates || [];
    // Try common field names — pick whichever exists on the candidate objects
    const pickYield = (c) => c.dividend_yield ?? c.yield ?? c.div_yield ?? null;
    const yields = candidates.map(pickYield).filter(v => typeof v === 'number' && isFinite(v));
    if (yields.length > 0) {
      const avg = yields.reduce((a,b)=>a+b, 0) / yields.length;
      yieldEl.textContent = avg.toFixed(2) + '%';
      yieldEl.classList.toggle('pos', avg > 3);
    } else {
      yieldEl.textContent = '—';
      yieldEl.classList.remove('pos');
    }
  }

  // Update header meta (editorial masthead — P2)
  const setField = (sel, val) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = val ?? '—';
  };
  const runDate = sc.run_date || sc.date;
  const d = runDate ? new Date(runDate) : new Date();
  const weekdays = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const dateStr = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  setField('#header-meta [data-field="vol"]', 'III');
  setField('#header-meta [data-field="issue"]', sc.issue ? `№ ${sc.issue}` : '№ —');
  setField('#header-meta [data-field="weekday"]', weekdays[d.getDay()]);
  setField('#header-meta [data-field="date"]', dateStr);
  setField('#header-meta [data-field="set-index"]', sc.set_index ?? '—');
  setField('.mast-right [data-field="next-run"]', sc.next_run ?? '—');
  setField('.mast-right [data-field="scanned"]', totalScanned || '—');
  setField('.mast-right [data-field="passed"]', passedCount || '—');
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

// ===== SORT =====
function bindSort() {
  const sortSelect = document.getElementById('sort-select');
  if (!sortSelect) return;
  // Sync state with dropdown value (browser may remember selection across reloads)
  state.sortBy = sortSelect.value;
  // Avoid duplicate listeners on re-init
  if (!sortSelect._bound) {
    sortSelect._bound = true;
    sortSelect.addEventListener('change', () => {
      state.sortBy = sortSelect.value;
      renderStockList();
    });
  }
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
      el.innerHTML = '<div class="loading">ไม่มีข้อมูลหุ้นที่ไม่ผ่าน — กดปุ่ม "คัดกรอง" เพื่อรันใหม่</div>';
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

  // Sort — top-level fields may be null, fallback to metrics.*
  const getDY = c => c.dividend_yield ?? c.metrics?.dividend_yield ?? 0;
  const getAvg5 = c => c.five_year_avg_yield ?? c.metrics?.five_year_avg_yield ?? 0;
  const getPE = c => c.pe_ratio ?? c.metrics?.pe ?? 999;
  const sortFns = {
    score: (a, b) => (b.quality_score || b.score || 0) - (a.quality_score || a.score || 0),
    yield: (a, b) => getDY(b) - getDY(a),
    avg5y: (a, b) => getAvg5(b) - getAvg5(a),
    pe_asc: (a, b) => getPE(a) - getPE(b),
    de_asc: (a, b) => {
      const aDE = a.de_ratio ?? a.metrics?.de ?? 999;
      const bDE = b.de_ratio ?? b.metrics?.de ?? 999;
      return aDE - bDE;
    },
  };
  candidates.sort(sortFns[state.sortBy] || sortFns.score);

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

// ===== SELECT STOCK (from requests/search — switch to stock tab first) =====
function selectStock(symbol) {
  // Switch to "passed" tab and show stock section
  state.activeTab = 'passed';
  const stockSection = document.getElementById('stock-section');
  const pipelineBar = document.getElementById('pipeline-bar');
  stockSection.style.display = '';
  pipelineBar.style.display = '';
  document.querySelectorAll('.page-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#tabs .tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === 'passed');
  });
  loadDetail(symbol);
}

// ===== LOAD DETAIL =====
async function loadDetail(symbol) {
  state.currentStock = symbol;

  const filteredStock = (state.screener?.filtered_out_stocks || []).find(
    s => s.symbol === symbol || s.symbol === symbol.replace('.BK','')
  );
  state.filteredReasons = filteredStock ? (filteredStock.reasons || []) : null;

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
    detail.innerHTML = `<div class="loading">
      <div style="margin-bottom:8px;">ไม่มีข้อมูลละเอียดสำหรับหุ้นนี้</div>
      <div style="font-size:0.78rem;color:var(--text3);">ลองกดปุ่ม "วิเคราะห์ทั้งหมด" เพื่อดึงข้อมูลใหม่</div>
    </div>`;
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

function buffettChecklistSplit(data) {
  const yearly = data.yearly_metrics || [];
  const agg = data.aggregates || {};
  const m = data.metrics || {};
  const latestDE = yearly.length > 0 ? yearly[yearly.length-1].de_ratio : null;

  const buffett = [
    { label: 'ROE ≥15% สม่ำเสมอ', pass: agg.avg_roe >= 0.15, value: safe(agg.avg_roe, 'pct') },
    { label: 'Gross Margin ≥30%', pass: agg.avg_gross_margin >= 0.30, value: safe(agg.avg_gross_margin, 'pct') },
    { label: 'หนี้ต่ำ (D/E < 1.0)', pass: latestDE != null && latestDE < 1.0, value: latestDE != null ? latestDE.toFixed(2) : '-' },
    { label: 'FCF บวกทุกปี', pass: agg.fcf_positive_years >= agg.fcf_total_years && agg.fcf_total_years > 0, value: (agg.fcf_positive_years || 0) + '/' + (agg.fcf_total_years || 0) + ' ปี' },
    { label: 'ปันผล ≥5 ปีติด', pass: agg.dividend_streak >= 5, value: (agg.dividend_streak || 0) + ' ปี' },
    { label: 'EPS โตสม่ำเสมอ', pass: agg.eps_cagr > 0, value: safe(agg.eps_cagr, 'pct') },
  ];

  const payoutVal = data.payout_ratio != null ? data.payout_ratio : m.payout;
  const payoutPct = payoutVal != null ? (payoutVal * 100) : null;
  const ocfNi = agg.latest_ocf_ni_ratio;
  const intCov = agg.latest_interest_coverage;
  const revGrowthYears = agg.revenue_growth_years || 0;
  const totalYears = agg.revenue_total_years || (yearly.length > 1 ? yearly.length - 1 : 0);

  const hong = [
    { label: 'กำไรมีเงินสดรองรับ (OCF/NI 0.8-3.0)', pass: ocfNi != null && ocfNi >= 0.8 && ocfNi <= 3.0, value: ocfNi != null ? ocfNi.toFixed(2) + 'x' : '-' },
    { label: 'Interest Coverage >5x', pass: intCov != null && intCov > 5, value: intCov != null ? intCov.toFixed(1) + 'x' : '-' },
    { label: 'Payout Ratio 30-70%', pass: payoutPct != null && payoutPct >= 30 && payoutPct <= 70, value: payoutPct != null ? payoutPct.toFixed(0) + '%' : '-' },
    { label: 'Revenue โตสม่ำเสมอ', pass: totalYears > 0 && revGrowthYears >= totalYears, value: revGrowthYears + '/' + totalYears + ' ปี' },
    { label: 'Net Margin ≥10%', pass: agg.avg_net_margin >= 0.10, value: safe(agg.avg_net_margin, 'pct') },
    { label: 'หนี้ต่ำ (D/E < 1.5)', pass: latestDE != null && latestDE < 1.5, value: latestDE != null ? latestDE.toFixed(2) : '-' },
  ];

  function renderChecks(checks) {
    return checks.map(c =>
      `<div class="checklist-item ${c.pass ? 'pass' : 'fail'}">
        <span class="check-icon">${c.pass ? '✓' : '✗'}</span>
        <span class="check-text">${c.label}</span>
        <span class="check-val">${c.value}</span>
      </div>`
    ).join('');
  }

  return { buffett: renderChecks(buffett), hong: renderChecks(hong) };
}

function scoreBreakdownHTML(breakdown, score) {
  const cats = [
    { key: 'profitability', label: 'กำไร', max: 25, sub: 'Buffett' },
    { key: 'growth', label: 'เติบโต', max: 20, sub: '' },
    { key: 'dividend', label: 'ปันผล', max: 35, sub: 'Dividend-First' },
    { key: 'strength', label: 'แข็งแกร่ง', max: 20, sub: 'เซียนฮง' },
  ];
  return cats.map(c => {
    const val = breakdown[c.key] != null ? breakdown[c.key] : 0;
    const pct = c.max > 0 ? Math.min(val / c.max * 100, 100) : 0;
    return `<div class="sb-item">
      <div class="sb-head">
        <span class="sb-label">${c.label}${c.sub ? ' <span class="sb-sub">' + c.sub + '</span>' : ''}</span>
      </div>
      <div class="sb-bar"><div class="sb-bar-fill" style="width:${pct}%"></div></div>
      <span class="sb-pts">${val}/${c.max}</span>
    </div>`;
  }).join('');
}

function valuationDetailHTML(val, d) {
  if (!val) return '';
  const m = d.metrics || {};
  const agg = d.aggregates || {};
  const peg = val.peg != null ? val.peg.toFixed(2) : 'N/A';
  const pe = d.pe_ratio != null ? d.pe_ratio.toFixed(1) : '-';
  const fwdPE = m.forward_pe != null ? m.forward_pe.toFixed(1) : '-';
  const curYield = d.dividend_yield != null ? d.dividend_yield.toFixed(1) + '%' : '-';
  const avgYield = m.five_year_avg_yield != null ? m.five_year_avg_yield.toFixed(1) + '%' : '-';
  const low52 = d.fifty_two_week_low || d['52w_low'] || m['52w_low'];
  const high52 = d.fifty_two_week_high || d['52w_high'] || m['52w_high'];
  const price = d.price;
  let w52Pct = null;
  if (low52 != null && high52 != null && high52 !== low52 && price != null) {
    w52Pct = Math.round((price - low52) / (high52 - low52) * 100);
    w52Pct = Math.max(0, Math.min(100, w52Pct));
  }
  const colors = { A: 'var(--green)', B: 'var(--blue)', C: 'var(--yellow)', D: 'var(--orange)', F: 'var(--red)' };
  const gradeColor = colors[val.grade] || 'var(--text3)';

  return `<div class="val-detail-card">
    <div class="val-detail-grid">
      <div class="vd-item"><span class="vd-label">PEG Ratio</span><span class="vd-value">${peg}</span></div>
      <div class="vd-item"><span class="vd-label">P/E</span><span class="vd-value">${pe}</span></div>
      <div class="vd-item"><span class="vd-label">Forward P/E</span><span class="vd-value">${fwdPE}</span></div>
      <div class="vd-item"><span class="vd-label">Yield ปัจจุบัน</span><span class="vd-value">${curYield}</span></div>
      <div class="vd-item"><span class="vd-label">Yield เฉลี่ย 5 ปี</span><span class="vd-value">${avgYield}</span></div>
      <div class="vd-item"><span class="vd-label">สรุประดับราคา</span><span class="vd-value" style="color:${gradeColor};font-weight:700">${val.grade || '-'} — ${val.label || ''}</span></div>
    </div>
    ${w52Pct != null ? `<div class="w52-section">
      <div class="w52-label">52-Week Range</div>
      <div class="w52-bar-wrap">
        <span class="w52-lo">${low52 != null ? low52.toFixed(2) : '-'}</span>
        <div class="w52-bar"><div class="w52-marker" style="left:${w52Pct}%"><span class="w52-pct">${w52Pct}%</span></div></div>
        <span class="w52-hi">${high52 != null ? high52.toFixed(2) : '-'}</span>
      </div>
    </div>` : ''}
  </div>`;
}

function keyMetricsHTML(d) {
  const agg = d.aggregates || {};
  const m = d.metrics || {};
  const revCAGR = agg.revenue_cagr != null ? (agg.revenue_cagr * 100).toFixed(1) + '%' : '-';
  const epsCAGR = agg.eps_cagr != null ? (agg.eps_cagr * 100).toFixed(1) + '%' : '-';
  const dpsCAGR = agg.dps_cagr != null ? (agg.dps_cagr * 100).toFixed(1) + '%' : '-';
  const fwdPE = m.forward_pe != null ? m.forward_pe.toFixed(1) : '-';
  const pb = m.pb_ratio != null ? m.pb_ratio.toFixed(1) : '-';
  const fcf = m.fcf; const mcap = m.mcap || d.market_cap;
  const fcfYield = (fcf != null && mcap != null && mcap > 0) ? (fcf / mcap * 100).toFixed(1) + '%' : '-';

  const items = [
    { label: 'Revenue CAGR', value: revCAGR },
    { label: 'EPS CAGR', value: epsCAGR },
    { label: 'DPS CAGR', value: dpsCAGR },
    { label: 'Forward P/E', value: fwdPE },
    { label: 'P/B Ratio', value: pb },
    { label: 'FCF Yield', value: fcfYield },
  ];
  return '<div class="key-metrics-grid">' + items.map(i =>
    `<div class="km-item"><span class="km-label">${i.label}</span><span class="km-value">${i.value}</span></div>`
  ).join('') + '</div>';
}

function reasonsListHTML(reasons) {
  if (!reasons || reasons.length === 0) return '';
  return '<ul class="reasons-list">' + reasons.map(r => `<li>${r}</li>`).join('') + '</ul>';
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

  // Filtered banner
  const filteredBannerHTML = state.filteredReasons
    ? `<div class="filtered-banner">ไม่ผ่านเกณฑ์: ${state.filteredReasons.join(', ')}</div>`
    : '';

  // Near miss signals
  const nearMissSignals = signals.filter(s => s.startsWith('NEAR_MISS'));
  const nearMissHTML = nearMissSignals.length > 0
    ? '<div class="near-miss-banner">' + nearMissSignals.map(s => TAG_TH[s] || s.replace(/_/g, ' ')).join(', ') + ' (เกือบผ่านเกณฑ์)</div>'
    : '';

  // Note
  const noteVal = (userData.notes || {})[d.symbol || ''] || '';

  // Pre-compute checklists
  const checklists = buffettChecklistSplit(d);

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

    ${filteredBannerHTML}

    ${nearMissHTML}

    <div class="section-title">Score Breakdown <span>${score}/100</span></div>
    <div class="sb-grid">
      ${scoreBreakdownHTML(breakdown, score)}
    </div>

    <div class="quick-metrics">
      <div class="qm-item"><div class="qm-label">Price</div><div class="qm-value">${price}</div></div>
      <div class="qm-item"><div class="qm-label">P/E</div><div class="qm-value">${peRatio != null ? peRatio.toFixed(1) : '-'}</div></div>
      <div class="qm-item"><div class="qm-label">Yield</div><div class="qm-value">${divYield != null ? divYield.toFixed(1) + '%' : '-'}</div></div>
      <div class="qm-item"><div class="qm-label">Payout</div><div class="qm-value">${payoutRatio != null ? (payoutRatio * 100).toFixed(0) + '%' : '-'}</div></div>
      <div class="qm-item"><div class="qm-label">D/E</div><div class="qm-value">${latestYM.de_ratio != null ? latestYM.de_ratio.toFixed(2) : '-'}</div></div>
    </div>

    <div class="section-title">เกณฑ์ Buffett <span>Warren Buffett Quality</span></div>
    ${checklists.buffett}

    <div class="section-title">เกณฑ์เซียนฮง <span>สถาพร งามเสถียร — Cash Flow Quality</span></div>
    ${checklists.hong}

    <div class="section-title">Valuation Detail</div>
    ${valuationDetailHTML(val, d)}

    <div class="section-title">Key Growth Metrics</div>
    ${keyMetricsHTML(d)}

    ${(d.reasons && d.reasons.length > 0) ? '<div class="section-title">เหตุผลคะแนน</div>' + reasonsListHTML(d.reasons) : ''}

    <div class="section-title">วิเคราะห์เชิงลึก</div>
    <div id="analysis-section" class="analysis-section">
      <div class="analysis-loading">กำลังวิเคราะห์...</div>
    </div>

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
  setTimeout(() => {
    renderDetailCharts(d);
    fetchAnalysis(fullSymbol);
  }, 50);

  // Scroll to detail (desktop only, mobile is fullscreen)
  if (window.innerWidth >= 1024) {
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function fetchAnalysis(symbol) {
  const section = document.getElementById('analysis-section');
  if (!section) return;
  try {
    const res = await fetch(API + '/api/stock/' + encodeURIComponent(symbol) + '/analysis');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      section.innerHTML = '<div class="analysis-loading">' + (err.detail || 'ไม่สามารถวิเคราะห์ได้') + '</div>';
      return;
    }
    const data = await res.json();
    section.innerHTML = `
      <div class="analysis-card">
        <div class="analysis-header">
          <span class="analysis-icon">\uD83C\uDFA9</span>
          <span class="analysis-name">มุมมอง Buffett</span>
        </div>
        <p class="analysis-text">${escapeHtml(data.buffett || '')}</p>
      </div>
      <div class="analysis-card">
        <div class="analysis-header">
          <span class="analysis-icon">\uD83D\uDCB0</span>
          <span class="analysis-name">มุมมองเซียนฮง</span>
        </div>
        <p class="analysis-text">${escapeHtml(data.hong || '')}</p>
      </div>
      <div class="analysis-card">
        <div class="analysis-header">
          <span class="analysis-icon">\uD83D\uDCCA</span>
          <span class="analysis-name">Max Mahon สรุป</span>
        </div>
        <p class="analysis-text">${escapeHtml(data.max || '')}</p>
      </div>
      ${data.cached ? '<div class="analysis-cached">cached</div>' : ''}
    `;
  } catch (e) {
    console.error('Analysis fetch failed:', e);
    section.innerHTML = '<div class="analysis-loading">ไม่สามารถวิเคราะห์ได้</div>';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

// ===== SEARCH =====
const SEARCH_PRESETS = {
  dividend: {
    label: 'ปันผลดี',
    criteria: [
      { metric: 'dividend_yield', op: '>=', value: 4 },
      { metric: 'dividend_streak', op: '>=', value: 5 }
    ],
    sort_by: 'dividend_yield'
  },
  growth: {
    label: 'เติบโตสม่ำเสมอ',
    criteria: [
      { metric: 'quality_score', op: '>=', value: 60 },
      { metric: 'roe', op: '>=', value: 0.15 }
    ],
    sort_by: 'quality_score'
  },
  value: {
    label: 'ราคาถูก',
    criteria: [
      { metric: 'pe_ratio', op: '<=', value: 15 },
      { metric: 'de_ratio', op: '<=', value: 1.0 }
    ],
    sort_by: 'pe_ratio'
  },
  quality: {
    label: 'คุณภาพสูง',
    criteria: [
      { metric: 'quality_score', op: '>=', value: 70 }
    ],
    sort_by: 'quality_score'
  }
};

let searchCriteria = [];

function bindSearch() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = SEARCH_PRESETS[btn.dataset.preset];
      if (!preset) return;
      searchCriteria = [...preset.criteria];
      renderSearchFilters();
      runSearch(preset.sort_by);
    });
  });

  document.getElementById('search-add')?.addEventListener('click', addSearchFilter);
  document.getElementById('search-run')?.addEventListener('click', () => runSearch());
  document.getElementById('search-clear')?.addEventListener('click', clearSearch);
}

function addSearchFilter() {
  const metric = document.getElementById('search-metric').value;
  const op = document.getElementById('search-op').value;
  const value = parseFloat(document.getElementById('search-value').value);
  if (isNaN(value)) return;
  searchCriteria.push({ metric, op, value });
  renderSearchFilters();
  document.getElementById('search-value').value = '';
}

function renderSearchFilters() {
  const el = document.getElementById('search-filters');
  if (!el) return;
  const METRIC_LABELS = {
    dividend_yield: 'Yield', five_year_avg_yield: 'Avg 5y', quality_score: 'Score',
    pe_ratio: 'P/E', de_ratio: 'D/E', roe: 'ROE', dividend_streak: 'Streak', market_cap: 'MCap'
  };
  el.innerHTML = searchCriteria.map((c, i) =>
    `<span class="filter-chip">${METRIC_LABELS[c.metric] || c.metric} ${c.op} ${c.value} <button onclick="removeFilter(${i})">×</button></span>`
  ).join('');
}

function removeFilter(index) {
  searchCriteria.splice(index, 1);
  renderSearchFilters();
}

function clearSearch() {
  searchCriteria = [];
  renderSearchFilters();
  document.getElementById('search-results').innerHTML = '';
}

async function runSearch(sort_by) {
  const el = document.getElementById('search-results');
  if (!el || searchCriteria.length === 0) return;
  el.innerHTML = '<div class="loading">กำลังค้นหา...</div>';

  try {
    const resp = await fetch(API + '/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteria: searchCriteria, sort_by: sort_by || 'quality_score', limit: 50 })
    });
    const data = await resp.json();
    renderSearchResults(data);
  } catch (e) {
    el.innerHTML = '<div class="loading" style="color:var(--red)">เกิดข้อผิดพลาด</div>';
  }
}

function renderSearchResults(data) {
  const el = document.getElementById('search-results');
  const results = data.results || [];
  if (results.length === 0) {
    el.innerHTML = '<div class="loading">ไม่พบหุ้นที่ตรงเงื่อนไข</div>';
    return;
  }
  el.innerHTML = `<div class="search-count">พบ ${data.total} หุ้น</div>` +
    '<div class="stock-grid">' + results.map(s => {
      const sym = (s.symbol || '').replace('.BK', '');
      const score = s.quality_score || 0;
      const sc = score >= 75 ? 'high' : score >= 50 ? 'mid' : 'low';
      const dy = s.dividend_yield != null ? s.dividend_yield.toFixed(1) + '%' : '-';
      const pe = s.pe_ratio != null ? s.pe_ratio.toFixed(1) : '-';
      return `<div class="stock-card" data-symbol="${s.symbol}" onclick="loadDetail('${s.symbol}')">
        <div class="card-row">
          <div class="card-score-circle ${sc}">${score}</div>
          <div class="card-info">
            <h3>${sym}</h3>
            <div class="sector">${s.sector || ''}</div>
          </div>
        </div>
        <div class="card-metrics-row">
          <div class="card-metric"><span class="label">Yield</span><span class="value">${dy}</span></div>
          <div class="card-metric"><span class="label">P/E</span><span class="value">${pe}</span></div>
        </div>
      </div>`;
    }).join('') + '</div>';
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
bindSearch();
bindDCA();
bindSettings();
loadSettings(); // update schedule text on load
