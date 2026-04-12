// Max Mahon Dashboard — app.js

const API = '';  // same origin
let state = { watchlist: null, screener: null, currentStock: null, activeTab: 'passed' };

// ===== INIT =====
async function init() {
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
      <span>Scoring: <strong>Buffett + เซียนฮง v2</strong></span>
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
      renderStockList();

      const reqPanel = document.getElementById('request-panel');
      const dcaPanel = document.getElementById('dca-panel');
      const settingsPanel = document.getElementById('settings-panel');
      const detail = document.getElementById('detail');
      if (state.activeTab === 'requests') {
        reqPanel.style.display = '';
        dcaPanel.style.display = 'none';
        settingsPanel.style.display = 'none';
        detail.style.display = 'none';
        loadRequests();
      } else if (state.activeTab === 'dca') {
        reqPanel.style.display = 'none';
        dcaPanel.style.display = '';
        settingsPanel.style.display = 'none';
        detail.style.display = 'none';
        populateDCASymbols();
      } else if (state.activeTab === 'settings') {
        reqPanel.style.display = 'none';
        dcaPanel.style.display = 'none';
        settingsPanel.style.display = '';
        detail.style.display = 'none';
        loadSettings();
      } else {
        reqPanel.style.display = 'none';
        dcaPanel.style.display = 'none';
        settingsPanel.style.display = 'none';
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
    el.innerHTML = `<div class="loading">${filteredCount} stocks filtered out (ไม่ผ่านเกณฑ์)</div>`;
    return;
  } else if (tab === 'requests') {
    el.innerHTML = '';
    return;
  } else if (tab === 'dca') {
    el.innerHTML = '';
    return;
  }

  // Sort by score desc
  candidates.sort((a, b) => (b.quality_score || b.score || 0) - (a.quality_score || a.score || 0));

  if (candidates.length === 0) {
    el.innerHTML = '<div class="loading">No stocks in this category</div>';
    return;
  }

  el.innerHTML = candidates.map(c => {
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

    return `<div class="stock-card${selected}" data-symbol="${sym}">
      <div class="card-top">
        <div class="card-identity">
          <h3>${sym.replace('.BK', '')}</h3>
          <div class="sector">${sector}</div>
        </div>
        <div class="card-score"><div class="score-circle ${scoreClass(score)}">${score}</div></div>
      </div>
      <div class="card-metrics">
        <div class="card-metric"><span class="label">Yield</span><span class="value" ${yldColor}>${yldStr}%</span></div>
        <div class="card-metric"><span class="label">Avg 5y</span><span class="value">${fiveYrStr}%</span></div>
        <div class="card-metric"><span class="label">ระดับราคา</span><span class="val-badge ${valClass}">${valGrade}</span></div>
      </div>
      <div class="card-tags">${signals.map(s => `<span class="tag ${tagClass(s)}">${tagLabel(s)}</span>`).join('')}</div>
    </div>`;
  }).join('');

  // Bind clicks
  el.querySelectorAll('.stock-card').forEach(row => {
    row.addEventListener('click', () => loadDetail(row.dataset.symbol));
  });
}

// ===== LOAD DETAIL =====
async function loadDetail(symbol) {
  state.currentStock = symbol;
  renderStockList(); // highlight selected

  const detail = document.getElementById('detail');
  detail.style.display = '';
  detail.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const data = await fetch(API + '/api/stock/' + encodeURIComponent(symbol)).then(r => r.json());
    renderDetail(data);
  } catch (e) {
    detail.innerHTML = '<div class="loading">Error loading stock data</div>';
  }
}

// ===== RENDER DETAIL =====
function renderDetail(d) {
  const detail = document.getElementById('detail');
  if (!d) { detail.innerHTML = '<div class="loading">No data</div>'; return; }

  const sym = (d.symbol || '').replace('.BK', '');
  const name = d.name || d.long_name || sym;
  const sector = d.sector || '';
  const mktCap = d.market_cap != null ? Math.round(d.market_cap / 1e9) + 'B' : '-';
  const price = d.price != null ? safe(d.price, '2d') : '-';
  const low52 = d.fifty_two_week_low || d['52w_low'];
  const high52 = d.fifty_two_week_high || d['52w_high'];
  const rangePos = (low52 != null && high52 != null && high52 !== low52)
    ? Math.round((d.price - low52) / (high52 - low52) * 100) : null;
  const rangeText = (low52 != null && high52 != null)
    ? `52W: ${safe(low52, '1d')} — ${safe(high52, '1d')}${rangePos != null ? ` (อยู่ที่ ${rangePos}% ของ range)` : ''}`
    : '-';

  const agg = d.aggregates || {};
  const ym = d.yearly_metrics || [];
  const totalYears = ym.length;
  const divHist = d.dividend_history || {};
  const score = d.quality_score || d.score || 0;
  const breakdown = d.score_breakdown || d.breakdown || {};

  // Score breakdown
  const profScore = breakdown.profitability != null ? breakdown.profitability : '-';
  const growthScore = breakdown.growth != null ? breakdown.growth : '-';
  const divScore = breakdown.dividend != null ? breakdown.dividend : '-';
  const strScore = breakdown.strength != null ? breakdown.strength : '-';

  function scoreBarWidth(val, max) {
    if (val == null || val === '-') return '0%';
    return Math.round((val / max) * 100) + '%';
  }

  // Buffett metrics computation
  const latestYM = ym.length > 0 ? ym[ym.length - 1] : {};
  const firstYM = ym.length > 0 ? ym[0] : {};

  // ROE consistency count
  const roeAbove15 = ym.filter(y => y.roe != null && y.roe >= 0.15).length;

  // Gross margin trend
  function computeTrend(firstVal, lastVal) {
    if (firstVal == null || lastVal == null) return '-';
    if (lastVal > firstVal * 1.02) return 'ขยายตัว';
    if (lastVal < firstVal * 0.98) return 'หดตัว';
    return 'คงที่';
  }
  const gmTrend = computeTrend(firstYM.gross_margin, latestYM.gross_margin);
  const sgaTrend = (() => {
    const first = firstYM.sga_ratio, last = latestYM.sga_ratio;
    if (first == null || last == null) return '-';
    if (last < first * 0.98) return 'ลดลง';
    if (last > first * 1.02) return 'เพิ่มขึ้น';
    return 'คงที่';
  })();

  // FCF positive years
  const fcfPositiveYears = ym.filter(y => y.fcf != null && y.fcf > 0).length;

  // EPS positive
  const epsPositiveYears = agg.eps_positive_years != null ? agg.eps_positive_years : ym.filter(y => y.eps != null && y.eps > 0).length;
  const epsTotalYears = agg.eps_total_years != null ? agg.eps_total_years : totalYears;

  // Dividend metrics
  const divYield = d.dividend_yield;
  const fiveYrYield = d.five_year_avg_yield;
  const payoutRatio = d.payout_ratio;
  const divStreak = agg.dividend_streak;
  const divGrowthStreak = agg.dividend_growth_streak;
  const peRatio = d.pe_ratio;
  const forwardPe = d.forward_pe;
  const pbRatio = d.pb_ratio;
  const earningsGrowth = d.earnings_growth;
  const freeCashflow = d.free_cashflow;
  const marketCap = d.market_cap;
  const fcfYield = (freeCashflow != null && marketCap != null && marketCap > 0)
    ? (freeCashflow / marketCap * 100) : null;

  // DPS Trend from dividend_history (last 5 years)
  const divYears = Object.keys(divHist).map(Number).sort((a, b) => a - b);
  const last5Div = divYears.slice(-5);
  const dpsTrend = (() => {
    if (last5Div.length < 2) return '-';
    let increasing = 0, decreasing = 0;
    for (let i = 1; i < last5Div.length; i++) {
      if (divHist[last5Div[i]] > divHist[last5Div[i - 1]]) increasing++;
      else if (divHist[last5Div[i]] < divHist[last5Div[i - 1]]) decreasing++;
    }
    if (increasing === last5Div.length - 1) return 'เพิ่มทุกปี';
    if (increasing > decreasing) return 'เพิ่มรวม';
    if (decreasing > increasing) return 'ลดรวม';
    return 'ขึ้นลง';
  })();

  // Color helpers
  function roeColor(v) { return v == null ? '' : v >= 0.15 ? 'good' : 'bad'; }
  function netMarginColor(v) { return v == null ? '' : v >= 0.10 ? 'good' : 'bad'; }
  function deColor(v) { return v == null ? '' : v < 0.5 ? 'good' : v <= 1.5 ? 'warn' : 'bad'; }
  function icColor(v) { return v == null ? '' : v > 10 ? 'good' : v >= 5 ? 'warn' : v < 3 ? 'bad' : 'warn'; }
  function payoutColor(v) {
    if (v == null) return '';
    if (v >= 0.3 && v <= 0.7) return 'good';
    if (v > 0.7 && v <= 0.85) return 'warn';
    if (v > 1.0) return 'bad';
    return '';
  }
  function yieldColor(v) {
    if (v == null) return '';
    if (v > 15) return 'warn';
    if (v >= 4) return 'good';
    if (v >= 2) return 'warn';
    return '';
  }
  function peColor(v) {
    if (v == null) return '';
    if (v < 15) return 'good';
    if (v > 30) return 'warn';
    return '';
  }
  function gmTrendColor(t) { return t === 'ขยายตัว' ? 'good' : t === 'หดตัว' ? 'bad' : ''; }
  function sgaTrendColor(t) { return t === 'ลดลง' ? 'good' : t === 'เพิ่มขึ้น' ? 'bad' : ''; }
  function consistencyColor(count, total) { return count === total ? 'good' : count >= total * 0.75 ? 'warn' : 'bad'; }
  function dpsTrendColor(t) { return t === 'เพิ่มทุกปี' ? 'good' : t === 'เพิ่มรวม' ? 'good' : t === 'ลดรวม' ? 'bad' : ''; }
  function currentRatioColor(v) { return v == null ? '' : v >= 2.0 ? 'good' : v >= 1.5 ? 'warn' : v < 1.0 ? 'bad' : 'warn'; }
  function ocfNiColor(v) { return v == null ? '' : v >= 1.0 ? 'good' : v >= 0.8 ? 'warn' : 'bad'; }
  function cagrColor(v) { return v == null ? '' : v > 0.15 ? 'good' : v > 0.05 ? '' : v < 0 ? 'bad' : ''; }
  function capIntColor(v) { return v == null ? '' : v < 0.3 ? 'good' : v <= 0.6 ? 'warn' : 'bad'; }
  function pbColor(v) { return v == null ? '' : v < 1.5 ? 'good' : v > 5 ? 'bad' : ''; }
  function fcfYieldColor(v) { return v == null ? '' : v > 8 ? 'good' : v > 4 ? '' : 'warn'; }
  function egColor(v) { return v == null ? '' : v > 0.26 ? 'good' : v > 0.10 ? '' : 'bad'; }
  function streakColor(v) { return v == null ? '' : v > 10 ? 'good' : v >= 5 ? 'warn' : 'bad'; }

  // Build metric HTML helper
  function metric(label, value, colorClass, criterion, explainHtml) {
    const critSpan = criterion ? ` <span class="criterion">${criterion}</span>` : '';
    const cls = colorClass ? ` ${colorClass}` : '';
    return `<details class="metric-explain">
      <summary>
        <span class="metric-label">${label}</span>
        <span class="metric-value${cls}">${value}${critSpan}</span>
      </summary>
      <div class="explain-box">${explainHtml}</div>
    </details>`;
  }

  // ===== YoY Table =====
  const years = ym.map(y => y.year).sort((a, b) => a - b);
  function yoyRow(label, getter, fmtFn, trendFn) {
    const vals = years.map(yr => {
      const row = ym.find(y => y.year === yr);
      return row ? getter(row) : null;
    });
    const trend = trendFn(vals);
    const lastVal = vals[vals.length - 1];
    const lastColor = trend.color ? ` style="color:var(--green);"` : '';
    const trendColor = trend.color ? ` style="color:var(--green);"` : '';
    return `<tr>
      <td>${label}</td>
      ${vals.map((v, i) => {
        const isLast = i === vals.length - 1;
        return `<td${isLast ? lastColor : ''}>${v != null ? fmtFn(v) : '-'}</td>`;
      }).join('')}
      <td${trendColor}>${trend.text}</td>
    </tr>`;
  }

  function trendDirection(vals) {
    const valid = vals.filter(v => v != null);
    if (valid.length < 2) return { text: '-', color: false };
    let up = 0, down = 0;
    for (let i = 1; i < valid.length; i++) {
      if (valid[i] > valid[i - 1]) up++;
      else if (valid[i] < valid[i - 1]) down++;
    }
    const total = valid.length - 1;
    if (up === total) return { text: 'โตทุกปี', color: true };
    if (up > down && up >= total * 0.6) return { text: 'โตรวม', color: true };
    if (down === total) return { text: 'ลดลง', color: false };
    return { text: 'ขึ้นลง', color: false };
  }

  function trendDecreasing(vals) {
    const valid = vals.filter(v => v != null);
    if (valid.length < 2) return { text: '-', color: false };
    let down = 0;
    for (let i = 1; i < valid.length; i++) {
      if (valid[i] < valid[i - 1]) down++;
    }
    if (down === valid.length - 1) return { text: 'ลดลง', color: true };
    if (down > (valid.length - 1) / 2) return { text: 'ลดรวม', color: true };
    return { text: 'ขึ้นลง', color: false };
  }

  function trendStable(vals, label) {
    const valid = vals.filter(v => v != null);
    if (valid.length < 2) return { text: '-', color: false };
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const allHigh = valid.every(v => v >= 0.20);
    if (allHigh && label === 'ROE') return { text: `สม่ำเสมอ >${(min * 100).toFixed(0)}%`, color: true };
    const range = `${(min * 100).toFixed(0)}-${(max * 100).toFixed(0)}%`;
    return { text: `คงที่ ${range}`, color: false };
  }

  function trendPositive(vals) {
    const valid = vals.filter(v => v != null);
    const allPos = valid.every(v => v > 0);
    if (allPos) return { text: 'บวกทุกปี', color: true };
    return { text: `บวก ${valid.filter(v => v > 0).length}/${valid.length} ปี`, color: false };
  }

  function trendDPS(yrs) {
    const divVals = yrs.map(yr => divHist[yr] != null ? divHist[yr] : null);
    const valid = divVals.filter(v => v != null);
    if (valid.length < 2) return { text: '-', color: false };
    let up = 0;
    for (let i = 1; i < valid.length; i++) {
      if (valid[i] > valid[i - 1]) up++;
    }
    if (up === valid.length - 1) return { text: 'เพิ่มทุกปี', color: true };
    if (up > (valid.length - 1) / 2) return { text: 'เพิ่มรวม', color: true };
    return { text: 'ขึ้นลง', color: false };
  }

  // ===== Dividend Chart =====
  const chartYears = divYears.slice(-15);
  const maxDPS = chartYears.length > 0 ? Math.max(...chartYears.map(y => divHist[y] || 0)) : 1;

  // ===== DCA Verdict =====
  const stars = score >= 80 ? '5/5' : score >= 65 ? '4/5' : score >= 50 ? '3/5' : score >= 35 ? '2/5' : '1/5';
  const verdictParts = [];
  if (agg.avg_roe != null && agg.avg_roe > 0.2) verdictParts.push('ทำกำไรสม่ำเสมอไม่เคยต่ำกว่า 20% ของทุน');
  if (divStreak != null && divStreak > 10) verdictParts.push(`จ่ายปันผลมา ${divStreak} ปีไม่เคยขาด`);
  if (divGrowthStreak != null && divGrowthStreak > 0) verdictParts.push(`เพิ่มปันผลขึ้นทุกปี ${divGrowthStreak} ปีติด`);
  if (agg.revenue_cagr != null && agg.revenue_cagr > 0.1) verdictParts.push('ยอดขายโตต่อเนื่อง');
  if (latestYM.de_ratio != null && latestYM.de_ratio < 0.5) verdictParts.push('หนี้ต่ำ');
  if (payoutRatio != null && payoutRatio < 0.6) verdictParts.push(`จ่ายแค่ ${(payoutRatio * 100).toFixed(0)}% ของกำไร ยังมี room เหลือ`);
  if (fcfPositiveYears === totalYears && totalYears > 0) verdictParts.push('เงินสดจริงรองรับทั้งปันผลและการขยายธุรกิจ');

  const verdictLabel = score >= 65 ? 'เหมาะมากสำหรับ DCA ระยะยาว' :
    score >= 50 ? 'พอเหมาะสำหรับ DCA ระยะยาว' :
    score >= 35 ? 'ต้องพิจารณาเพิ่มเติม' : 'ยังไม่แนะนำสำหรับ DCA';
  const verdictSummary = verdictParts.length > 0
    ? `<strong>${verdictLabel}</strong> — ${verdictParts.join(', ')}`
    : `<strong>${verdictLabel}</strong>`;

  // ===== BUILD HTML =====
  detail.innerHTML = `
    <div class="detail-header">
      <div class="detail-title">
        <h2>${name}</h2>
        <div class="subtitle">${sector} &middot; Market Cap ${mktCap} &middot; ${totalYears} ปี data</div>
      </div>
      <div class="detail-price-block">
        <div class="price">${price}</div>
        <div class="range">${rangeText}</div>
      </div>
    </div>

    <!-- Quality Score -->
    <div class="section-title">Quality Score <span>${score} / 100</span></div>
    <div class="score-breakdown">
      <div class="score-item">
        <div class="score-label">Profitability</div>
        <div class="score-val">${profScore}</div>
        <div class="score-max">/ 30</div>
        <div class="score-bar"><div class="score-bar-fill" style="width: ${scoreBarWidth(profScore, 30)}; background: ${barColor(profScore === '-' ? 0 : profScore / 30 * 100)};"></div></div>
      </div>
      <div class="score-item">
        <div class="score-label">Growth</div>
        <div class="score-val">${growthScore}</div>
        <div class="score-max">/ 25</div>
        <div class="score-bar"><div class="score-bar-fill" style="width: ${scoreBarWidth(growthScore, 25)}; background: ${barColor(growthScore === '-' ? 0 : growthScore / 25 * 100)};"></div></div>
      </div>
      <div class="score-item">
        <div class="score-label">Dividend</div>
        <div class="score-val">${divScore}</div>
        <div class="score-max">/ 25</div>
        <div class="score-bar"><div class="score-bar-fill" style="width: ${scoreBarWidth(divScore, 25)}; background: ${barColor(divScore === '-' ? 0 : divScore / 25 * 100)};"></div></div>
      </div>
      <div class="score-item">
        <div class="score-label">Strength</div>
        <div class="score-val">${strScore}</div>
        <div class="score-max">/ 20</div>
        <div class="score-bar"><div class="score-bar-fill" style="width: ${scoreBarWidth(strScore, 20)}; background: ${barColor(strScore === '-' ? 0 : strScore / 20 * 100)};"></div></div>
      </div>
    </div>

    <!-- Buffett Checklist -->
    <div class="section-title">Buffett Checklist <span>คุณภาพธุรกิจ + ความแข็งแกร่ง</span></div>
    <div class="metrics-4col">
      <!-- COL 1: PROFITABILITY -->
      <div class="metric-group">
        <h4>Profitability</h4>
        ${metric('Avg ROE (5yr)', agg.avg_roe != null ? safe(agg.avg_roe, 'pct') : '-', roeColor(agg.avg_roe), 'pass 15%',
          `<strong>Return on Equity</strong> — กำไรที่บริษัทสร้างได้จากเงินของผู้ถือหุ้น ยิ่งสูงยิ่งดี Buffett มองว่า <strong>15% ขึ้นไปทุกปี</strong> คือธุรกิจคุณภาพ
          <div class="explain-scale">
            <span class="scale-item scale-good">20%+ ยอดเยี่ยม</span>
            <span class="scale-item scale-ok">15-20% ดี</span>
            <span class="scale-item scale-bad">&lt;15% ต่ำ</span>
          </div>`
        )}
        ${metric('Min ROE (5yr)', agg.min_roe != null ? safe(agg.min_roe, 'pct') : '-', roeColor(agg.min_roe), 'pass 12%',
          `<strong>ROE ต่ำสุดใน 5 ปี</strong> — ดูว่าปีที่แย่ที่สุดยังรักษาคุณภาพได้ไหม ถ้าปีแย่สุดยัง >12% แปลว่าธุรกิจมี moat แข็ง`
        )}
        ${metric('Avg Net Margin', agg.avg_net_margin != null ? safe(agg.avg_net_margin, 'pct') : '-', netMarginColor(agg.avg_net_margin), '',
          `<strong>อัตรากำไรสุทธิ</strong> — จากยอดขาย 100 บาท เหลือเป็นกำไรจริงกี่บาท ยิ่งสูง = มีอำนาจต่อรอง คู่แข่งแย่งยาก
          <div class="explain-scale">
            <span class="scale-item scale-good">15%+ มี moat</span>
            <span class="scale-item scale-ok">10-15% ดี</span>
            <span class="scale-item scale-bad">&lt;10% เสี่ยง</span>
          </div>`
        )}
        ${metric('Gross Margin', agg.avg_gross_margin != null ? safe(agg.avg_gross_margin, 'pct') : '-', '', '',
          `<strong>อัตรากำไรขั้นต้น</strong> — สะท้อนมูลค่าเพิ่มของสินค้า Buffett ใช้ดู moat ถ้าสูงต่อเนื่อง = สินค้าขายได้ราคาดี
          <div class="explain-scale">
            <span class="scale-item scale-good">40%+ moat แข็ง</span>
            <span class="scale-item scale-ok">20-40% ปานกลาง</span>
            <span class="scale-item scale-bad">&lt;20% แข่งขันสูง</span>
          </div>`
        )}
        ${metric('Operating Margin', agg.avg_operating_margin != null ? safe(agg.avg_operating_margin, 'pct') : '-', '', '',
          `<strong>อัตรากำไรจากการดำเนินงาน</strong> — กำไรจากธุรกิจหลัก ถ้าใกล้ Net Margin = โครงสร้างการเงินสะอาด`
        )}
      </div>

      <!-- COL 2: MOAT -->
      <div class="metric-group">
        <h4>Moat / Competitive Advantage</h4>
        ${metric('ROE >15% ทุกปี?', `${roeAbove15}/${totalYears} ปี`, consistencyColor(roeAbove15, totalYears), '',
          `<strong>ความสม่ำเสมอของ ROE</strong> — หัวใจ Buffett: ไม่ใช่แค่ปีเดียวเก่ง แต่ต้องเก่งทุกปี = moat จริง`
        )}
        ${metric('Gross Margin Trend', gmTrend, gmTrendColor(gmTrend), '',
          `<strong>แนวโน้ม Gross Margin</strong> — เพิ่มขึ้น = อำนาจต่อรองมากขึ้น, ลดลง = คู่แข่งบีบราคา
          <div class="explain-scale">
            <span class="scale-item scale-good">ขยายตัว</span>
            <span class="scale-item scale-ok">คงที่</span>
            <span class="scale-item scale-bad">หดตัว</span>
          </div>`
        )}
        ${metric('SG&amp;A / Revenue', sgaTrend, sgaTrendColor(sgaTrend), '',
          `<strong>ค่าใช้จ่ายขาย+บริหาร ต่อ ยอดขาย</strong> — ลดลง = มี scale advantage, เพิ่มขึ้น = ค่าใช้จ่ายบาน`
        )}
        ${metric('Revenue Consistency',
          agg.revenue_growth_years != null ? `${agg.revenue_growth_years}/${agg.revenue_growth_total_comparisons} ปี` : '-',
          agg.revenue_growth_years != null ? consistencyColor(agg.revenue_growth_years, agg.revenue_growth_total_comparisons) : '',
          '',
          `<strong>ยอดขายโตกี่ปี</strong> — โตทุกปี = demand สม่ำเสมอ ถ้ามีปีลด = อาจเป็น cyclical เสี่ยงกว่าสำหรับ DCA`
        )}
      </div>

      <!-- COL 3: FINANCIAL STRENGTH -->
      <div class="metric-group">
        <h4>Financial Strength</h4>
        ${metric('D/E Ratio', latestYM.de_ratio != null ? safe(latestYM.de_ratio, '2d') : '-', deColor(latestYM.de_ratio), '&lt;1.5',
          `<strong>Debt-to-Equity</strong> — หนี้สินเทียบกับทุน Buffett ชอบหนี้ต่ำ เพราะเศรษฐกิจแย่จะอยู่รอดได้
          <div class="explain-scale">
            <span class="scale-item scale-good">&lt;0.5 ยอดเยี่ยม</span>
            <span class="scale-item scale-ok">0.5-1.5 พอได้</span>
            <span class="scale-item scale-bad">&gt;1.5 สูง</span>
          </div>`
        )}
        ${metric('Interest Coverage',
          agg.latest_interest_coverage != null ? safe(agg.latest_interest_coverage, 'x') : '-',
          icColor(agg.latest_interest_coverage), '&gt;5x',
          `<strong>ความสามารถจ่ายดอกเบี้ย</strong> — EBITDA / ดอกเบี้ยจ่าย ยิ่งสูง = ปลอดภัยมาก
          <div class="explain-scale">
            <span class="scale-item scale-good">&gt;10x ปลอดภัย</span>
            <span class="scale-item scale-ok">5-10x โอเค</span>
            <span class="scale-item scale-bad">&lt;3x อันตราย</span>
          </div>`
        )}
        ${metric('Current Ratio', latestYM.current_ratio != null ? safe(latestYM.current_ratio, '1d') : '-', currentRatioColor(latestYM.current_ratio), '',
          `<strong>สภาพคล่อง</strong> — สินทรัพย์หมุนเวียน / หนี้สินระยะสั้น >2.0 = จ่ายบิลได้สบาย
          <div class="explain-scale">
            <span class="scale-item scale-good">&gt;2.0 ดีมาก</span>
            <span class="scale-item scale-ok">1.5-2.0 พอดี</span>
            <span class="scale-item scale-bad">&lt;1.0 เสี่ยง</span>
          </div>`
        )}
        ${metric('FCF Positive', `${fcfPositiveYears}/${totalYears} ปี`, consistencyColor(fcfPositiveYears, totalYears), '',
          `<strong>Free Cash Flow เป็นบวก</strong> — เงินสดจริงที่เหลือหลังลงทุน ถ้าบวกทุกปี = กำไรเป็นเงินจริง จ่ายปันผลได้จริง`
        )}
        ${metric('OCF / Net Income',
          agg.latest_ocf_ni_ratio != null ? safe(agg.latest_ocf_ni_ratio, 'x') : '-',
          ocfNiColor(agg.latest_ocf_ni_ratio), '',
          `<strong>คุณภาพกำไร</strong> — เงินสดจริง / กำไรในบัญชี >1.0 = กำไรแท้ <0.7 = กำไรกระดาษ ระวัง
          <div class="explain-scale">
            <span class="scale-item scale-good">&gt;1.0 กำไรแท้</span>
            <span class="scale-item scale-ok">0.8-1.0 พอได้</span>
            <span class="scale-item scale-bad">&lt;0.7 ระวัง</span>
          </div>`
        )}
      </div>

      <!-- COL 4: GROWTH -->
      <div class="metric-group">
        <h4>Growth</h4>
        ${metric('Revenue CAGR (5yr)', agg.revenue_cagr != null ? safe(agg.revenue_cagr, 'pct') : '-', cagrColor(agg.revenue_cagr), '',
          `<strong>อัตราเติบโตเฉลี่ยยอดขาย 5 ปี</strong> — ยิ่งสูง = ธุรกิจขยายตัวเร็ว
          <div class="explain-scale">
            <span class="scale-item scale-good">&gt;15% โตเร็ว</span>
            <span class="scale-item scale-ok">5-15% โตดี</span>
            <span class="scale-item scale-bad">&lt;0% หดตัว</span>
          </div>`
        )}
        ${metric('EPS CAGR (5yr)', agg.eps_cagr != null ? safe(agg.eps_cagr, 'pct') : '-', cagrColor(agg.eps_cagr), '',
          `<strong>อัตราเติบโตกำไรต่อหุ้น</strong> — ดูควบคู่ Revenue CAGR ถ้า EPS โตเร็วกว่า = margin ขยาย ถ้าช้ากว่า = margin หด`
        )}
        ${metric('EPS Positive', `${epsPositiveYears}/${epsTotalYears} ปี`, consistencyColor(epsPositiveYears, epsTotalYears), '',
          `<strong>จำนวนปีที่มีกำไร</strong> — กำไรทุกปี = ธุรกิจพื้นฐานแข็ง สำหรับ DCA ต้องการสม่ำเสมอ`
        )}
        ${metric('Capital Intensity',
          agg.latest_capital_intensity != null ? safe(agg.latest_capital_intensity, 'pct') : '-',
          capIntColor(agg.latest_capital_intensity), '',
          `<strong>CapEx / Operating Cash Flow</strong> — ต่ำ = ธุรกิจเบา ไม่ต้องลงทุนเยอะ เงินเหลือจ่ายปันผล Buffett ชอบแบบนี้
          <div class="explain-scale">
            <span class="scale-item scale-good">&lt;30% เบา</span>
            <span class="scale-item scale-ok">30-60% ปานกลาง</span>
            <span class="scale-item scale-bad">&gt;60% หนัก</span>
          </div>`
        )}
      </div>
    </div>

    <!-- เซียนฮง Checklist -->
    <div class="section-title">เซียนฮง Checklist <span>ปันผล + มูลค่า</span></div>
    <div class="metrics-2col">
      <!-- COL 1: DIVIDEND -->
      <div class="metric-group">
        <h4>Dividend</h4>
        ${metric('Dividend Yield', divYield != null ? divYield.toFixed(1) + '%' : '-', yieldColor(divYield), 'pass 4%',
          `<strong>อัตราผลตอบแทนปันผล</strong> — ลงทุน 100 บาท ได้ปันผลกี่บาท/ปี เซียนฮงต้องการ 4-5%+ แต่ >15% ต้องระวัง yield trap
          <div class="explain-scale">
            <span class="scale-item scale-good">4-8% ดีมาก</span>
            <span class="scale-item scale-ok">2-4% พอใช้</span>
            <span class="scale-item scale-bad">&gt;15% ตรวจสอบ!</span>
          </div>`
        )}
        ${metric('5yr Avg Yield', fiveYrYield != null ? fiveYrYield.toFixed(1) + '%' : '-', '', '',
          `<strong>ค่าเฉลี่ย yield 5 ปี</strong> — เทียบกับ yield ปัจจุบันเพื่อดูว่า "ปกติ" หรือ "ผิดปกติ" ถ้าสูงกว่ามาก อาจเป็นราคาตก หรือปันผลพิเศษ`
        )}
        ${metric('Payout Ratio', payoutRatio != null ? (payoutRatio * 100).toFixed(1) + '%' : '-', payoutColor(payoutRatio), '',
          `<strong>สัดส่วนจ่ายปันผล</strong> — จ่ายกี่ % ของกำไร Payout ต่ำ = ยั่งยืน + มี room โต
          <div class="explain-scale">
            <span class="scale-item scale-good">30-60% สมดุล</span>
            <span class="scale-item scale-ok">60-80% สูง</span>
            <span class="scale-item scale-bad">&gt;100% อันตราย</span>
          </div>`
        )}
        ${metric('Dividend Streak', divStreak != null ? divStreak + ' ปี' : '-', streakColor(divStreak), '',
          `<strong>จ่ายปันผลต่อเนื่อง</strong> — ผ่านวิกฤตหลายรอบยังจ่ายได้ ตัวเลขสำคัญที่สุดสำหรับ DCA
          <div class="explain-scale">
            <span class="scale-item scale-good">&gt;10 ปี เชื่อถือได้</span>
            <span class="scale-item scale-ok">5-10 ปี ดี</span>
            <span class="scale-item scale-bad">&lt;3 ปี ยังไม่พิสูจน์</span>
          </div>`
        )}
        ${metric('Div Growth Streak', divGrowthStreak != null ? divGrowthStreak + ' ปีติด' : '-', divGrowthStreak != null && divGrowthStreak >= 3 ? 'good' : '', '',
          `<strong>เพิ่มปันผลต่อเนื่อง</strong> — ไม่ใช่แค่จ่าย แต่เพิ่มทุกปีด้วย สำหรับ DCA yield on cost จะโตตามเวลา`
        )}
        ${metric('DPS Trend', dpsTrend, dpsTrendColor(dpsTrend), '',
          `<strong>แนวโน้ม Dividend Per Share</strong> — เพิ่มสม่ำเสมอ = ผู้บริหารให้ความสำคัญกับผู้ถือหุ้น`
        )}
      </div>

      <!-- COL 2: VALUATION -->
      <div class="metric-group">
        <h4>Valuation</h4>
        ${metric('P/E (TTM)', peRatio != null ? peRatio.toFixed(1) + 'x' : '-', peColor(peRatio), '',
          `<strong>ราคาต่อกำไร 12 เดือนล่าสุด</strong> — เซียนฮงต้องการ P/E ไม่เกิน 15
          <div class="explain-scale">
            <span class="scale-item scale-good">&lt;15 ถูก</span>
            <span class="scale-item scale-ok">15-25 เหมาะสม</span>
            <span class="scale-item scale-bad">&gt;30 แพง</span>
          </div>`
        )}
        ${metric('Forward P/E', forwardPe != null ? forwardPe.toFixed(1) + 'x' : '-', forwardPe != null && forwardPe < 15 ? 'good' : '', 'pass 15',
          `<strong>P/E จากกำไรที่คาดการณ์</strong> — ต่ำกว่า TTM เยอะ = นักวิเคราะห์คาดกำไรจะเพิ่มมาก (turnaround signal)`
        )}
        ${metric('P/B Ratio', pbRatio != null ? pbRatio.toFixed(1) + 'x' : '-', pbColor(pbRatio), '',
          `<strong>ราคาต่อมูลค่าทางบัญชี</strong> — สูงปกติสำหรับ ROE สูง คนยอมจ่ายแพงเพราะบริษัทสร้างกำไรเก่ง
          <div class="explain-scale">
            <span class="scale-item scale-good">&lt;1.5 ถูก (ถ้า ROE ดี)</span>
            <span class="scale-item scale-ok">1.5-3.0 สมเหตุสมผล</span>
            <span class="scale-item scale-bad">&gt;5.0 แพงมาก</span>
          </div>`
        )}
        ${metric('FCF Yield', fcfYield != null ? fcfYield.toFixed(1) + '%' : '-', fcfYieldColor(fcfYield), '',
          `<strong>ผลตอบแทนจากเงินสดจริง</strong> — FCF / Market Cap สูงกว่า Dividend Yield = มี room เพิ่มปันผลหรือ buyback ได้อีก`
        )}
        ${metric('52W Range Position', rangePos != null ? rangePos + '%' : '-', '', '',
          `<strong>ตำแหน่งราคาเทียบ 52 สัปดาห์</strong> — 0% = ต่ำสุด 100% = สูงสุด สำหรับ DCA คุณภาพสำคัญกว่าราคา`
        )}
        ${metric('Earnings Growth', earningsGrowth != null ? (earningsGrowth * 100).toFixed(0) + '%/yr' : '-', egColor(earningsGrowth), '',
          `<strong>เกณฑ์เซียนฮง</strong> — กำไรโตอย่างน้อย 26%/ปี = เพิ่มเท่าตัวใน 3 ปี ผ่านเกณฑ์ + P/E ต่ำ + yield ดี = หุ้นในฝัน`
        )}
      </div>
    </div>

    <!-- Year-over-Year -->
    <div class="section-title">Year-over-Year Financials <span>Trend ย้อนหลัง ${totalYears} ปี</span></div>
    <details class="section-explain">
      <summary></summary>
      <div class="section-explain-content">
        ดู <strong>trend</strong> ไม่ใช่แค่ตัวเลขปีเดียว:
        Revenue ต้องโตสม่ำเสมอ, Net Income/EPS ต้องโตตาม, ROE ต้องสูงทุกปี, D/E ต้องไม่เพิ่ม, FCF ต้องเป็นบวก, DPS ต้องไม่ลด
      </div>
    </details>
    <div class="yoy-scroll">
    <table class="yoy-table">
      <thead>
        <tr><th></th>${years.map(y => `<th>${y}</th>`).join('')}<th>Trend</th></tr>
      </thead>
      <tbody>
        ${yoyRow('Revenue (B)', r => r.revenue, v => safe(v, 'B'), trendDirection)}
        ${yoyRow('Net Income (B)', r => r.net_income, v => safe(v, 'B'), trendDirection)}
        ${yoyRow('EPS', r => r.eps, v => safe(v, '2d'), trendDirection)}
        ${yoyRow('ROE', r => r.roe, v => (v * 100).toFixed(1) + '%', vs => trendStable(vs, 'ROE'))}
        ${yoyRow('Net Margin', r => r.net_margin, v => (v * 100).toFixed(1) + '%', vs => trendStable(vs, 'Margin'))}
        ${yoyRow('D/E', r => r.de_ratio, v => safe(v, '2d'), trendDecreasing)}
        ${yoyRow('FCF (B)', r => r.fcf, v => safe(v, 'B'), trendPositive)}
        <tr>
          <td>DPS</td>
          ${years.map((yr, i) => {
            const dps = divHist[yr];
            const isLast = i === years.length - 1;
            const t = trendDPS(years);
            const color = isLast && t.color ? ' style="color:var(--green);"' : '';
            return `<td${color}>${dps != null ? safe(dps, '2d') : '-'}</td>`;
          }).join('')}
          <td${trendDPS(years).color ? ' style="color:var(--green);"' : ''}>${trendDPS(years).text}</td>
        </tr>
      </tbody>
    </table>
    </div>

    <!-- Dividend History -->
    <div class="section-title">Dividend History <span>${chartYears.length}+ ปี ย้อนหลัง</span></div>
    <details class="section-explain">
      <summary></summary>
      <div class="section-explain-content">
        มองหา pattern: <strong>แท่งสูงขึ้นเรื่อยๆ</strong> = สุดยอด, <strong>คงที่</strong> = พอใช้, <strong>ขึ้นลง</strong> = ไม่มีนโยบายชัด, <strong>ลดลง</strong> = อันตราย — Hover ดู DPS แต่ละปี
      </div>
    </details>
    <div class="div-section">
      <div class="div-chart">
        ${chartYears.map(yr => {
          const dps = divHist[yr] || 0;
          const pct = maxDPS > 0 ? Math.round((dps / maxDPS) * 100) : 0;
          return `<div class="div-bar" style="height: ${Math.max(pct, 2)}%;"><div class="div-tip">${yr}: ${safe(dps, '2d')}</div></div>`;
        }).join('')}
      </div>
      <div class="div-years">
        ${chartYears.map(yr => `<span>'${String(yr).slice(-2)}</span>`).join('')}
      </div>
    </div>

    <!-- DCA Verdict -->
    <div class="section-title">DCA Suitability <span>เหมาะสะสมระยะยาวไหม?</span></div>
    <div class="verdict-box">
      <div class="verdict-stars">${stars}</div>
      <div class="verdict-text">${verdictSummary}</div>
    </div>
  `;

  // Scroll to detail
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== REQUEST PANEL =====
function bindRequests() {
  const btn = document.getElementById('request-submit');
  const input = document.getElementById('request-input');
  if (!btn || !input) return;

  btn.addEventListener('click', async () => {
    const raw = input.value.trim();
    if (!raw) return;
    const symbols = raw.split(',').map(s => s.trim()).filter(Boolean);
    btn.disabled = true;
    btn.textContent = 'Submitting...';
    try {
      await fetch(API + '/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols })
      });
      input.value = '';
      loadRequests();
    } catch (e) {
      console.error('Request failed:', e);
    }
    btn.disabled = false;
    btn.textContent = 'Submit';
  });
}

async function loadRequests() {
  const el = document.getElementById('request-results');
  if (!el) return;
  try {
    const data = await fetch(API + '/api/requests').then(r => r.json());
    const items = data.requests || data || [];
    el.innerHTML = items.map(r => {
      const statusCls = r.status === 'done' ? 'done' : 'pending';
      return `<div class="request-item">
        <span class="symbol">${r.symbol}</span>
        <span class="status ${statusCls}">${r.status || 'pending'}</span>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = '<div class="loading">No requests</div>';
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
