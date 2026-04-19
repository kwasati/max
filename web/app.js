// Max Mahon Dashboard — app.js

const API = '';  // same origin
let state = { watchlist: null, screener: null, currentStock: null, activeTab: 'home', filteredReasons: null, sortBy: 'score' };

// ==== Chart.js Editorial Theme (P5) ====
if (typeof Chart !== 'undefined' && !Chart.__editorialThemed) {
  Chart.__editorialThemed = true;
  Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--ink-dim').trim() || '#595c6b';
  Chart.defaults.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '#d6cfbd';
  Chart.defaults.font.family = 'JetBrains Mono, monospace';
  Chart.defaults.font.size = 10;
  Chart.defaults.responsive = true;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.plugins = Chart.defaults.plugins || {};
  Chart.defaults.plugins.legend = { display: false };
}

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
  detail.classList.remove('open');
  detail.innerHTML = '';
  renderStockList();
}

// ===== INIT =====
async function init() {
  try {
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
    bindRequests();
    // Default landing = Home. Activate tab (hides stock-section + loads home data).
    activateTab('home');
  } catch (err) {
    const el = document.getElementById('stock-list');
    if (el) el.innerHTML = errorRowHTML(err && err.message ? err.message : 'โหลดข้อมูลไม่ได้');
    console.error('init() failed:', err);
  }
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
function activateTab(tabName) {
  const btn = document.querySelector(`#tabs .tab[data-tab="${tabName}"]`);
  if (!btn) return;
  document.querySelectorAll('#tabs .tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.activeTab = tabName;
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
    const panel = document.getElementById('page-' + tabName);
    if (panel) panel.classList.add('active');
    // Load data for specific tabs
    if (tabName === 'home') loadHomeData();
    else if (tabName === 'history') loadHistory();
    else if (tabName === 'requests') loadRequests();
    else if (tabName === 'dca') populateDCASymbols();
    else if (tabName === 'settings') loadSettings();
  }
}

function bindTabs() {
  document.querySelectorAll('#tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activateTab(btn.dataset.tab);
    });
  });
  // Wire latest-report-card click → open report viewer
  const card = document.getElementById('latest-report-card');
  if (card && !card._bound) {
    card._bound = true;
    card.addEventListener('click', () => {
      const num = card.dataset.scanNum;
      if (num) {
        sessionStorage.setItem('report-from', 'home');
        openReport(num);
      }
    });
  }
  // Wire report back button once
  const backBtn = document.getElementById('report-back-btn');
  if (backBtn && !backBtn._bound) {
    backBtn._bound = true;
    backBtn.addEventListener('click', () => {
      const prev = sessionStorage.getItem('report-from') || 'home';
      activateTab(prev);
    });
  }
}

// ===== HOME FEED =====
async function loadHomeData() {
  try {
    const history = await fetch(API + '/api/history').then(r => r.json());
    const card = document.getElementById('latest-report-card');
    const kickerText = card?.querySelector('.kicker-text');
    const picksEl = document.getElementById('latest-report-picks');
    const bylineEl = document.getElementById('latest-report-byline');
    const summaryEl = document.getElementById('latest-report-summary');

    if (history && history.scans && history.scans.length) {
      const latest = history.scans[0];
      if (card) card.dataset.scanNum = latest.num;
      if (kickerText) kickerText.textContent = `รายงานล่าสุด · SCAN #${latest.num}`;

      // Extract "top picks" as the leading phrase of summary (before " · " if any)
      const summary = latest.summary || '';
      const picksMatch = summary.match(/^([^·]+?)(?:\s*·|$)/);
      const picksPhrase = picksMatch ? picksMatch[1].trim() : '';
      if (picksEl) {
        picksEl.innerHTML = picksPhrase
          ? `Top Picks: <em>${picksPhrase}</em>`
          : 'รายงานล่าสุด';
      }
      if (bylineEl) bylineEl.textContent = formatScanByline(latest.date, latest.num);
      if (summaryEl) summaryEl.textContent = summary;

      // Update stats panel with counts from latest scan
      const counts = latest.counts || {};
      setStatText('passed', counts.passed ?? '—');
      setStatText('discoveries', counts.new ?? '—');
    } else {
      if (card) card.dataset.scanNum = '';
      if (kickerText) kickerText.textContent = 'รายงานล่าสุด · ยังไม่มี';
      if (picksEl) picksEl.textContent = 'ยังไม่มีรายงาน — กดปุ่ม Scan ด้านบน';
      if (bylineEl) bylineEl.textContent = '';
      if (summaryEl) summaryEl.textContent = '';
    }
  } catch (e) {
    console.error('loadHomeData failed:', e);
  }
}

function setStatText(key, val) {
  const el = document.querySelector(`[data-stat="${key}"]`);
  if (el) el.textContent = (val === null || val === undefined) ? '—' : String(val);
}

function formatScanByline(iso, num) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return `MAX · SCAN #${num}`;
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `MAX · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} · SCAN #${num}`;
  } catch (e) {
    return `MAX · SCAN #${num}`;
  }
}

// ===== REPORT VIEWER (P4.2) =====
async function openReport(num) {
  // Show report page, hide everything else (stock-section + pipeline-bar + other panels)
  const stockSection = document.getElementById('stock-section');
  const pipelineBar = document.getElementById('pipeline-bar');
  if (stockSection) stockSection.style.display = 'none';
  if (pipelineBar) pipelineBar.style.display = 'none';
  document.querySelectorAll('.page-panel').forEach(p => {
    p.classList.remove('active');
    if (p.id !== 'page-report') p.hidden = false; // reset (they're controlled by .active normally)
  });
  const panel = document.getElementById('page-report');
  if (!panel) return;
  panel.hidden = false;
  panel.classList.add('active');

  const bodyEl = document.getElementById('report-body-content');
  if (bodyEl) bodyEl.innerHTML = '<div class="loading-state">กำลังโหลด…</div>';

  try {
    const q = num != null && num !== '' ? `?num=${encodeURIComponent(num)}` : '';
    const res = await fetch(API + '/api/reports/scan' + q);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const n = data.num ?? '—';
    const byline = `MAX MAHON · ${data.counts?.scanned ?? '—'} SCANNED · ${data.counts?.passed ?? 0} PASSED · +${data.counts?.new ?? 0} NEW`;
    document.getElementById('report-back-title').textContent = `Scan Report #${n}`;
    document.getElementById('report-back-sub').textContent = formatScanDate(data.date);
    document.getElementById('report-section-num').textContent = `№ ${String(n).padStart(2, '0')} / SCAN`;
    document.getElementById('report-headline').innerHTML = data.summary || 'รายงาน';
    document.getElementById('report-byline').textContent = byline;
    if (bodyEl) bodyEl.innerHTML = data.html || '';
    transformPicks(bodyEl);
  } catch (e) {
    console.error('openReport', e);
    if (bodyEl) bodyEl.innerHTML = '<div class="empty-state"><p>โหลดรายงานไม่ได้</p></div>';
  }
}

function transformPicks(container) {
  // Heuristic: wrap H3 blocks whose text starts with a rank marker ("#N", "1.", emoji medal)
  // plus the following sibling paragraph into a .pick card.
  if (!container) return;
  const h3s = Array.from(container.querySelectorAll('h3'));
  h3s.forEach(h3 => {
    const text = (h3.textContent || '').trim();
    const isPick = /^(#\d+|\d+\.|[🥇🥈🥉]|[1-9][0-9]?️⃣)/.test(text);
    if (!isPick) return;
    const box = document.createElement('div');
    box.className = 'pick';
    const sym = document.createElement('div');
    sym.className = 'sym';
    sym.textContent = text;
    box.appendChild(sym);
    // move next sibling paragraph (if any) into the box
    const next = h3.nextElementSibling;
    if (next && next.tagName === 'P') {
      box.appendChild(next);
    }
    h3.replaceWith(box);
  });
}

// ===== HISTORY PAGE =====
async function loadHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  list.innerHTML = '<div class="loading-state">กำลังโหลด…</div>';
  try {
    const data = await fetch(API + '/api/history').then(r => r.json());
    const scans = (data && data.scans) || [];
    if (!scans.length) {
      list.innerHTML = '<div class="empty-state"><h3>ยังไม่มีประวัติ scan</h3><p>กดปุ่ม scan เพื่อเริ่ม</p></div>';
      const chipEmpty = document.querySelector('#page-history .scan-count-chip');
      if (chipEmpty) chipEmpty.textContent = '0 SCANS';
      return;
    }
    list.innerHTML = scans.map(s => `
      <div class="history-item" data-scan-num="${s.num}">
        <div class="history-head">
          <div class="history-num">Scan #${s.num}</div>
          <div class="history-date">${formatScanDate(s.date)}</div>
        </div>
        <div class="history-summary">${escapeHtml(s.summary || '')}</div>
        <div class="history-stats">
          <span><em>${s.counts?.passed ?? '—'}</em>ผ่าน</span>
          <span><em>+${s.counts?.new ?? 0}</em>ใหม่</span>
          <span><em>${s.counts?.filtered ?? '—'}</em>คัดออก</span>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const num = item.dataset.scanNum;
        sessionStorage.setItem('report-from', 'history');
        if (typeof openReport === 'function') openReport(num);
      });
    });
    const chip = document.querySelector('#page-history .scan-count-chip');
    if (chip) chip.textContent = `${scans.length} SCANS`;
  } catch (e) {
    console.error('loadHistory', e);
    list.innerHTML = '<div class="empty-state"><p>โหลดประวัติไม่ได้</p></div>';
  }
}

function formatScanDate(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${d.getDate()} ${months[d.getMonth()]} · ${hh}:${mm}`;
  } catch (e) {
    return '—';
  }
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

// ==== State row helpers (P4) ====
const loadingRowHTML = () => `<tr class="state-row"><td colspan="11"><div class="loading-state">กำลังโหลด…</div></td></tr>`;
const emptyRowHTML = (msg) => `<tr class="state-row"><td colspan="11"><div class="empty-state">${msg || 'ไม่มีหุ้นในรายการนี้'}</div></td></tr>`;
const errorRowHTML = (msg) => `<tr class="state-row"><td colspan="11"><div class="error-state">${msg || 'โหลดข้อมูลไม่ได้'} · <a onclick="location.reload()">ลองใหม่</a></div></td></tr>`;

// ==== Star cell helper (P3.3) ====
function starCellHTML(sym, on) {
  const onCls = on ? ' on' : '';
  const ch = on ? '★' : '☆';
  const title = on ? 'unfollow' : 'follow';
  return `<td class="star-cell"><span class="card-star${onCls}" data-sym="${sym}" title="${title}">${ch}</span></td>`;
}

// ==== Tag helpers (P4) ====
function rowTagClass(sig) {
  const s = String(sig).toLowerCase();
  if (s.includes('compounder')) return 'compounder';
  if (s.includes('dividend_king') || s === 'king') return 'king';
  if (s.includes('cash_cow') || s === 'cow') return 'cow';
  if (s.includes('contra')) return 'contra';
  if (s.includes('trap') || s.includes('yield_trap')) return 'trap';
  if (s.includes('turnaround')) return 'turnaround';
  if (s.includes('warning') || s.includes('data_warning')) return 'warning';
  return '';
}

// ==== Row formatters (P4) ====
function stockRowHTML(c) {
  const sym = c.symbol || '';
  const symShort = sym.replace('.BK', '');
  const name = c.name || c.company || c.sector || '';
  const selected = state.currentStock === sym ? ' selected' : '';
  const fmtPct = (v) => (v == null || !isFinite(v)) ? '—' : (Number(v).toFixed(1) + '%');
  const fmtPctFrac = (v) => (v == null || !isFinite(v)) ? '—' : (Number(v) * 100).toFixed(1) + '%';
  const fmtNum = (v, d) => (v == null || !isFinite(v)) ? '—' : Number(v).toFixed(d);
  const fmtStreak = (v) => (v == null || !isFinite(v)) ? '—' : `${Math.round(v)}y`;
  const fmtPrice = (v) => (v == null || !isFinite(v)) ? '—' : Number(v).toFixed(2);

  // Failed state (watchlist tab shows failed stocks too — overlay fail-badge, grey score, reason line)
  if (c._failed) {
    const bm = c.basic_metrics || {};
    const reasons = (c._fail_reasons || c.reasons || []).slice(0, 2).join(', ') || '—';
    const fRoe = bm.roe ?? null;
    const fRoeStr = (fRoe == null || !isFinite(fRoe)) ? '—'
      : (Math.abs(fRoe) <= 2 ? fmtPctFrac(fRoe) : fmtPct(fRoe));
    return `<tr class="watch-row failed-row${selected}" data-sym="${sym}">
      ${starCellHTML(sym, !!c.in_watchlist)}
      <td><div class="sym">${symShort}<span class="fail-badge">หลุดรอบนี้</span></div><div class="sym-name">${name}</div><div class="sym-name fail-reason">${reasons}</div></td>
      <td><span class="tag warning">หลุดรอบ</span></td>
      <td><span class="score-cell"><span class="score-num failed">—</span></span></td>
      <td class="num">${fmtPct(bm.dividend_yield)}</td>
      <td class="num">—</td>
      <td class="num">${fmtNum(bm.pe, 1)}</td>
      <td class="num">—</td>
      <td class="num">${fRoeStr}</td>
      <td class="num">—</td>
      <td class="num">${fmtPrice(bm.price)}</td>
    </tr>`;
  }

  const score = c.quality_score ?? c.score ?? 0;
  const y = c.dividend_yield ?? c.metrics?.dividend_yield ?? null;
  const y5 = c.five_year_avg_yield ?? c.metrics?.five_year_avg_yield ?? null;
  const pe = c.pe_ratio ?? c.metrics?.pe ?? null;
  const de = c.de_ratio ?? c.metrics?.de ?? null;
  const roe = c.roe ?? c.metrics?.roe ?? null;
  const streak = c.dividend_streak ?? c.streak ?? c.metrics?.dividend_streak ?? null;
  const price = c.price ?? c.metrics?.current_price ?? c.close ?? null;
  const signals = c.signals || [];

  const tagsHTML = signals.slice(0, 3).map(s =>
    `<span class="tag ${rowTagClass(s)}">${tagLabel(s)}</span>`
  ).join('');

  const scoreVal = Math.max(0, Math.min(100, Number(score) || 0));
  const isLow = scoreVal < 50;
  const scoreHTML = `<span class="score-cell">
    <span class="score-bar${isLow ? ' low' : ''}"><i style="width:${scoreVal}%"></i></span>
    <span class="score-num${isLow ? ' low' : ''}">${Math.round(scoreVal)}</span>
  </span>`;

  // roe in this codebase is stored as fraction (0.18 = 18%) — convert
  const roeStr = (roe == null || !isFinite(roe)) ? '—'
    : (Math.abs(roe) <= 2 ? fmtPctFrac(roe) : fmtPct(roe));

  const yClass = (y != null && y >= 4) ? ' pos' : '';
  const newBadge = c.is_new_in_batch ? '<span class="new-badge">NEW</span>' : '';

  return `<tr class="watch-row${selected}" data-sym="${sym}">
    ${starCellHTML(sym, !!c.in_watchlist)}
    <td><div class="sym">${symShort}${newBadge}</div><div class="sym-name">${name}</div></td>
    <td>${tagsHTML || '<span class="tag">—</span>'}</td>
    <td>${scoreHTML}</td>
    <td class="num${yClass}">${fmtPct(y)}</td>
    <td class="num">${fmtPct(y5)}</td>
    <td class="num">${fmtNum(pe, 1)}</td>
    <td class="num">${fmtNum(de, 2)}</td>
    <td class="num">${roeStr}</td>
    <td class="num">${fmtStreak(streak)}</td>
    <td class="num">${fmtPrice(price)}</td>
  </tr>`;
}

function filteredRowHTML(s) {
  const sym = s.symbol || '';
  const symShort = sym.replace('.BK', '');
  const sector = s.sector || '';
  const metrics = s.basic_metrics || {};
  const reasons = (s.reasons || []).join(', ');
  const y = metrics.dividend_yield ?? null;
  const roe = metrics.roe ?? null;
  const selected = state.currentStock === sym ? ' selected' : '';

  const fmtPct = (v) => (v == null || !isFinite(v)) ? '—' : (Number(v).toFixed(1) + '%');
  const fmtPctFrac = (v) => (v == null || !isFinite(v)) ? '—' : (Number(v) * 100).toFixed(0) + '%';
  const roeStr = (roe == null || !isFinite(roe)) ? '—'
    : (Math.abs(roe) <= 2 ? fmtPctFrac(roe) : fmtPct(roe));

  const nameLine = s.name ? `<div class="sym-name">${s.name}</div>` : (sector ? `<div class="sym-name">${sector}</div>` : '');
  const reasonLine = reasons ? `<div class="sym-name">${reasons}</div>` : '';

  return `<tr class="watch-row${selected}" data-sym="${sym}">
    ${starCellHTML(sym, !!s.in_watchlist)}
    <td><div class="sym">${symShort}</div>${nameLine}${reasonLine}</td>
    <td><span class="tag warning">FILTERED</span></td>
    <td>—</td>
    <td class="num">${fmtPct(y)}</td>
    <td class="num">—</td>
    <td class="num">—</td>
    <td class="num">—</td>
    <td class="num">${roeStr}</td>
    <td class="num">—</td>
    <td class="num">—</td>
  </tr>`;
}

function bindRowClicks() {
  document.querySelectorAll('#stock-list tr[data-sym]').forEach(row => {
    row.addEventListener('click', (e) => {
      // Don't open detail when clicking the star
      if (e.target.closest('.card-star')) return;
      loadDetail(row.dataset.sym);
    });
  });
}

// ===== STAR TOGGLE (P3.3) =====
async function toggleStar(sym, el) {
  if (!sym || !el) return;
  const normSym = (sym || '').toUpperCase().replace('.BK', '');
  const current = (userData.watchlist || []).slice();
  const has = current.some(s => (s || '').toUpperCase().replace('.BK', '') === normSym);

  // Optimistic UI flip
  const wasOn = el.classList.contains('on');
  el.classList.toggle('on');
  el.textContent = wasOn ? '☆' : '★';
  el.title = wasOn ? 'follow' : 'unfollow';

  try {
    const body = has ? { remove: [sym] } : { add: [sym] };
    const res = await fetch(API + '/api/user/watchlist', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('http ' + res.status);
    const data = await res.json();
    userData.watchlist = data.watchlist || (has
      ? current.filter(s => (s || '').toUpperCase().replace('.BK', '') !== normSym)
      : [...current, sym.endsWith('.BK') ? sym : sym + '.BK']);

    // Update in-memory in_watchlist flags on screener data so tabs/counts stay in sync
    if (state.screener) {
      for (const c of state.screener.candidates || []) {
        if ((c.symbol || '').toUpperCase().replace('.BK', '') === normSym) c.in_watchlist = !has;
      }
      for (const c of state.screener.filtered_out_stocks || []) {
        if ((c.symbol || '').toUpperCase().replace('.BK', '') === normSym) c.in_watchlist = !has;
      }
    }
    // Update any other visible star for same symbol (e.g. detail header mirror)
    document.querySelectorAll(`.card-star[data-sym="${sym}"], .detail-star[data-sym="${sym}"]`).forEach(node => {
      if (node === el) return;
      node.classList.toggle('on', !has);
      node.textContent = has ? '☆' : '★';
    });
    // Refresh tab counts without re-rendering current view
    updateStockTabCounts();
  } catch (err) {
    console.error('toggleStar failed:', err);
    // Revert UI
    el.classList.toggle('on');
    el.textContent = wasOn ? '★' : '☆';
    el.title = wasOn ? 'unfollow' : 'follow';
    alert('บันทึก watchlist ไม่สำเร็จ');
  }
}

function updateStockTabCounts() {
  const sc = state.screener;
  if (!sc) return;
  const passedCount = (sc.candidates || []).length;
  const passedWL = (sc.candidates || []).filter(c => c.in_watchlist).length;
  const failedWL = (sc.filtered_out_stocks || []).filter(c => c.in_watchlist).length;
  const wlCount = passedWL + failedWL;
  const filteredCount = (sc.total_scanned || sc.total || 0) - passedCount;
  const setTabText = (tabName, text) => {
    const btn = document.querySelector(`#tabs .tab[data-tab="${tabName}"]`);
    if (btn) btn.textContent = text;
  };
  setTabText('passed', `ผ่านเกณฑ์ (${passedCount})`);
  setTabText('watchlist', `ติดตาม (${wlCount})`);
  setTabText('filtered', `หลุดรอบ (${filteredCount})`);
}

// Global delegated click for any star element
document.addEventListener('click', (e) => {
  const star = e.target.closest('.card-star, .detail-star');
  if (!star) return;
  e.stopPropagation();
  const sym = star.dataset.sym;
  if (!sym) return;
  toggleStar(sym, star);
});

function renderStockList() {
  const el = document.getElementById('stock-list');
  const sc = state.screener;

  if (!sc || !sc.candidates) {
    el.innerHTML = loadingRowHTML();
    return;
  }

  let candidates = sc.candidates || [];
  const tab = state.activeTab;

  // Update tab labels — 3 stock tabs only (ผ่านเกณฑ์ / ติดตาม / หลุดรอบ) via data-tab lookup
  const passedCount = candidates.length;
  const passedWL = candidates.filter(c => c.in_watchlist).length;
  const failedWL = (sc.filtered_out_stocks || []).filter(c => c.in_watchlist).length;
  const wlCount = passedWL + failedWL;
  const filteredCount = (sc.total_scanned || sc.total || 0) - passedCount;

  const setTabText = (tabName, text) => {
    const btn = document.querySelector(`#tabs .tab[data-tab="${tabName}"]`);
    if (btn) btn.textContent = text;
  };
  setTabText('passed', `ผ่านเกณฑ์ (${passedCount})`);
  setTabText('watchlist', `ติดตาม (${wlCount})`);
  setTabText('filtered', `หลุดรอบ (${filteredCount})`);

  // Filter
  if (tab === 'watchlist') {
    const passedInWatch = (sc.candidates || []).filter(c => c.in_watchlist);
    const failedInWatch = (sc.filtered_out_stocks || [])
      .filter(c => c.in_watchlist)
      .map(c => ({ ...c, _failed: true, _fail_reasons: c.reasons || c.filter_reasons || [] }));
    candidates = [...passedInWatch, ...failedInWatch];
  }
  else if (tab === 'filtered') {
    const filtered = sc.filtered_out_stocks || [];
    if (filtered.length === 0) {
      el.innerHTML = emptyRowHTML('ไม่มีข้อมูลหุ้นที่หลุดรอบ — กดปุ่ม "คัดกรอง" เพื่อรันใหม่');
      return;
    }
    el.innerHTML = filtered.map(filteredRowHTML).join('');
    bindRowClicks();
    return;
  } else if (tab === 'requests' || tab === 'dca' || tab === 'settings') {
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
    el.innerHTML = emptyRowHTML();
    return;
  }

  el.innerHTML = candidates.map(stockRowHTML).join('');
  bindRowClicks();
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
  detail.classList.add('open');
  detail.innerHTML = '<div class="dive-body"><div class="analysis-loading serif">กำลังโหลด…</div></div>';

  try {
    const data = await fetch(API + '/api/stock/' + encodeURIComponent(symbol)).then(r => r.json());
    renderDetail(data);
  } catch (e) {
    detail.classList.add('open');
    detail.innerHTML = `<div class="dive-body">
      <div class="analysis-loading serif" style="margin-bottom:8px;">ไม่มีข้อมูลละเอียดสำหรับหุ้นนี้</div>
      <div class="analysis-loading serif" style="font-size:0.78rem;">ลองกดปุ่ม "วิเคราะห์ทั้งหมด" เพื่อดึงข้อมูลใหม่</div>
    </div>`;
  }
}

// ===== CHART RENDERING (P5 Editorial Palette) =====
function renderDetailCharts(stockData) {
  const yearly = stockData.yearly_metrics || [];
  if (yearly.length < 2 && Object.keys(stockData.dividend_history || {}).length < 2) return;

  // Destroy existing charts
  ['divChart', 'roeChart', 'revenueChart'].forEach(id => {
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
  });

  const gridColor = 'rgba(30, 29, 26, 0.06)';
  const FOREST = '#1d5b4f';
  const AMBER = '#b45309';
  const BURGUNDY = '#8a2e3e';
  const NAVY = '#1f3f76';

  // 1. Dividend per share — line + area fill (forest)
  const divHistory = stockData.dividend_history || {};
  const divYears = Object.keys(divHistory).sort().slice(-10);
  const divValues = divYears.map(y => divHistory[y] || 0);

  if (divYears.length > 0) {
    const ctx1 = document.getElementById('divChart');
    if (ctx1) {
      let divFill = 'rgba(29, 91, 79, 0.15)';
      try {
        const g = ctx1.getContext('2d').createLinearGradient(0, 0, 0, 160);
        g.addColorStop(0, 'rgba(29, 91, 79, 0.35)');
        g.addColorStop(1, 'rgba(29, 91, 79, 0)');
        divFill = g;
      } catch (_) { /* keep fallback */ }
      const lastIdx = divValues.length - 1;
      const pointRadii = divValues.map((_, i) => i === lastIdx ? 3.5 : 2.5);
      const pointBorderColors = divValues.map((_, i) => i === lastIdx ? '#fff' : FOREST);
      const pointBorderWidths = divValues.map((_, i) => i === lastIdx ? 2 : 0);
      new Chart(ctx1, {
        type: 'line',
        data: {
          labels: divYears,
          datasets: [{
            label: 'ปันผล/หุ้น (บาท)',
            data: divValues,
            borderColor: FOREST,
            backgroundColor: divFill,
            fill: true,
            tension: 0.25,
            borderWidth: 1.5,
            pointBackgroundColor: FOREST,
            pointBorderColor: pointBorderColors,
            pointBorderWidth: pointBorderWidths,
            pointRadius: pointRadii,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: gridColor, drawBorder: false }, ticks: { font: { size: 10 } } },
            x: { grid: { display: false }, ticks: { font: { size: 10 } } }
          }
        }
      });
    }
  }

  // 2. ROE — line + points (amber), optional 15% baseline
  const years = yearly.map(y => y.year);
  const roeValues = yearly.map(y => y.roe != null ? +(y.roe * 100).toFixed(1) : null);
  const ctx2 = document.getElementById('roeChart');
  if (ctx2 && yearly.length >= 2) {
    const datasets = [{
      label: 'ROE %',
      data: roeValues,
      borderColor: AMBER,
      backgroundColor: 'rgba(180, 83, 9, 0.08)',
      fill: false,
      tension: 0.3,
      borderWidth: 1.75,
      pointBackgroundColor: AMBER,
      pointBorderColor: AMBER,
      pointRadius: 3,
    }, {
      label: 'Baseline 15%',
      data: years.map(() => 15),
      borderColor: BURGUNDY,
      borderDash: [4, 4],
      borderWidth: 1,
      pointRadius: 0,
      fill: false,
      tension: 0,
    }];
    new Chart(ctx2, {
      type: 'line',
      data: { labels: years, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: gridColor, drawBorder: false }, ticks: { font: { size: 10 } } },
          x: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  // 3. Revenue — navy bars, optional amber average line
  if (yearly.length >= 2) {
    const revValues = yearly.map(y => y.revenue ? y.revenue / 1e6 : null);
    const niValues = yearly.map(y => y.net_income ? y.net_income / 1e6 : null);
    const ctx3 = document.getElementById('revenueChart');
    if (ctx3) {
      const validRev = revValues.filter(v => v != null);
      const avgRev = validRev.length ? validRev.reduce((a, b) => a + b, 0) / validRev.length : null;
      const datasets = [{
        type: 'bar',
        label: 'Revenue (M฿)',
        data: revValues,
        backgroundColor: NAVY,
        borderRadius: 2,
        barPercentage: 0.65,
        categoryPercentage: 0.75,
      }];
      if (avgRev != null) {
        datasets.push({
          type: 'line',
          label: 'avg',
          data: years.map(() => avgRev),
          borderColor: AMBER,
          borderDash: [4, 4],
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
        });
      }
      // keep net income as faint secondary bar if useful
      if (niValues.some(v => v != null)) {
        datasets.push({
          type: 'bar',
          label: 'Net Income (M฿)',
          data: niValues,
          backgroundColor: 'rgba(31, 63, 118, 0.35)',
          borderRadius: 2,
          barPercentage: 0.65,
          categoryPercentage: 0.75,
        });
      }
      new Chart(ctx3, {
        data: { labels: years, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { grid: { color: gridColor, drawBorder: false }, ticks: { font: { size: 10 } } },
            x: { grid: { display: false }, ticks: { font: { size: 10 } } }
          }
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

// ===== DEEP DIVE COPY + FACT SHEET (P5) =====
function detailCopy(c) {
  const score = Math.round(c.quality_score ?? c.score ?? 0);
  const y = c.dividend_yield ?? c.metrics?.dividend_yield;
  const agg = c.aggregates || {};
  const streak = c.dividend_streak ?? c.metrics?.dividend_streak ?? agg.dividend_streak;
  const roe = c.roe ?? c.metrics?.roe ?? agg.avg_roe;
  const roePct = roe != null && Math.abs(roe) <= 2 ? (roe * 100) : roe;
  const sector = c.sector ?? c.metrics?.sector ?? '—';
  const deRaw = c.de_ratio ?? c.debt_to_equity ?? c.metrics?.de;
  const peRaw = c.pe_ratio ?? c.metrics?.pe;

  let headline = 'คุณภาพที่ไม่ต้องลุ้น.';
  if (score >= 85) headline = 'คุณภาพชั้นบน.';
  else if (score >= 70) headline = 'ของดีในเรทสม่ำเสมอ.';
  else if (score < 50) headline = 'ต้องดูใกล้ๆ.';

  const parts = [];
  if (score) parts.push(`คะแนนรวม ${score}`);
  if (y != null) parts.push(`Yield ${Number(y).toFixed(1)}%`);
  if (streak != null) parts.push(`จ่ายต่อเนื่อง ${Math.round(streak)} ปี`);
  const deck = parts.join(' · ') || 'ข้อมูลสรุปโดย Max Mahon';

  const p1 = `<p><strong>${c.name ?? c.symbol ?? ''}</strong> อยู่ในกลุ่ม ${sector}. ${score >= 70 ? 'ตัวเลขเบื้องหลังนิ่งสะอาด — ' : ''}ROE ${roePct != null ? Number(roePct).toFixed(1)+'%' : '—'}, D/E ${deRaw != null ? Number(deRaw).toFixed(2) : '—'}, P/E ${peRaw != null ? Number(peRaw).toFixed(1) : '—'}</p>`;
  const p2 = (c.signals && c.signals.length)
    ? `<p>สัญญาณ: <strong>${c.signals.join(' · ')}</strong></p>`
    : '';
  const prose = p1 + p2;

  let insight;
  if (c.analysis && c.analysis.insight) {
    insight = `"${c.analysis.insight}"`;
  } else if (score >= 85) {
    insight = `"หุ้นแบบนี้ไม่ต้องดูทุกวัน — ถือได้ 10 ปี หลับได้ทุกคืน"`;
  } else if (score < 50) {
    insight = `"ตัวเลข yield สูงไม่ได้แปลว่าของดี — ROE กับ payout ต้องนิ่งด้วย"`;
  } else {
    insight = `"คุณภาพสม่ำเสมอชนะหวือหวาในระยะยาว"`;
  }
  return { headline, deck, prose, insight };
}

function factRowsHTML(c) {
  const fmtPct = (v) => (v == null || !isFinite(v)) ? '—' : Number(v).toFixed(1) + '%';
  const fmtNum = (v, d = 2) => (v == null || !isFinite(v)) ? '—' : Number(v).toFixed(d);
  const fmtMcap = (v) => {
    if (v == null || !isFinite(v)) return '—';
    const n = Number(v);
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    return n.toFixed(0);
  };
  const agg = c.aggregates || {};
  const roe = c.roe ?? c.metrics?.roe;
  const roePct = roe != null && Math.abs(roe) <= 2 ? (roe * 100) : roe;
  const nm = c.net_margin ?? c.profit_margin ?? c.metrics?.net_margin;
  const nmPct = nm != null && Math.abs(nm) <= 2 ? (nm * 100) : nm;
  const roeAvg = c.roe_5y_avg ?? c.metrics?.roe_5y_avg ?? agg.avg_roe ?? roe;
  const roeAvgPct = roeAvg != null && Math.abs(roeAvg) <= 2 ? (roeAvg * 100) : roeAvg;
  const payout = c.payout_ratio ?? c.metrics?.payout;
  const payoutPct = payout != null && Math.abs(payout) <= 2 ? (payout * 100) : payout;
  const mcap = c.market_cap ?? c.metrics?.mcap;
  const fcfRaw = c.fcf ?? c.free_cashflow ?? c.metrics?.fcf;
  let fcfY = c.fcf_yield ?? c.metrics?.fcf_yield;
  if (fcfY == null && fcfRaw != null && mcap != null && mcap > 0) fcfY = (fcfRaw / mcap) * 100;
  const fcfYPct = fcfY != null && Math.abs(fcfY) <= 2 ? (fcfY * 100) : fcfY;
  const ic = c.interest_coverage ?? c.metrics?.interest_coverage ?? agg.latest_interest_coverage;
  const deRaw = c.de_ratio ?? c.debt_to_equity ?? c.metrics?.de;
  const streak = c.dividend_streak ?? c.metrics?.dividend_streak ?? agg.dividend_streak;
  const score = c.quality_score ?? c.score;

  const rows = [
    ['Sector', c.sector ?? c.metrics?.sector ?? '—', ''],
    ['Market cap', fmtMcap(mcap), ''],
    ['ROE 5y avg', fmtPct(roeAvgPct), roeAvgPct != null && roeAvgPct >= 15 ? 'pos' : ''],
    ['Net margin', fmtPct(nmPct), nmPct != null && nmPct >= 10 ? 'pos' : ''],
    ['D/E', fmtNum(deRaw, 2), deRaw != null && deRaw <= 1 ? 'pos' : ''],
    ['Payout ratio', fmtPct(payoutPct), ''],
    ['Dividend streak', (streak != null ? Math.round(streak) + 'y' : '—'), ''],
    ['FCF yield', fmtPct(fcfYPct), fcfYPct != null && fcfYPct >= 5 ? 'pos' : ''],
    ['Interest coverage', ic != null ? Number(ic).toFixed(1) + '×' : '—', ic != null && ic >= 5 ? 'pos' : ''],
    ['P/E trailing', fmtNum(c.pe_ratio ?? c.metrics?.pe, 1), ''],
    ['P/E forward', fmtNum(c.forward_pe ?? c.metrics?.forward_pe, 1), ''],
    ['Quality score', score != null ? `${Math.round(score)} / 100` : '—', score != null && score >= 70 ? 'pos' : (score != null && score < 50 ? 'warn' : '')]
  ];
  return rows.map(([k, v, cls]) => `<div class="fact-row"><span class="k">${k}</span><span class="v${cls ? ' ' + cls : ''}">${v}</span></div>`).join('');
}

// ===== RENDER DETAIL =====
function renderDetail(d) {
  const detail = document.getElementById('detail');
  if (!d) { detail.innerHTML = '<div class="loading">No data</div>'; return; }

  const sym = (d.symbol || '').replace('.BK', '');
  const fullSymbol = d.symbol || '';
  const { headline, deck, prose, insight } = detailCopy(d);

  // Determine watchlist state from userData (source of truth)
  const starNorm = fullSymbol.toUpperCase().replace('.BK', '');
  const inWL = (userData.watchlist || []).some(s => (s || '').toUpperCase().replace('.BK', '') === starNorm);
  const starChar = inWL ? '★' : '☆';
  const starOnCls = inWL ? ' on' : '';
  const detailStarHTML = `<span class="detail-star${starOnCls}" data-sym="${fullSymbol}" title="${inWL ? 'unfollow' : 'follow'}">${starChar}</span>`;

  detail.innerHTML = `
    <div class="dive-body">
      <div class="dive-kicker">DEEP DIVE &middot; ${sym} ${detailStarHTML}</div>
      <h2 class="dive-headline serif">${sym}: <em>${headline}</em></h2>
      <div class="dive-deck">${deck}</div>
      ${prose}
      <blockquote class="pull-quote">
        ${insight}
        <cite>— Max Analysis &middot; Claude Opus 4.7</cite>
      </blockquote>
      <div id="analysis-section" class="analysis-section">
        <div class="analysis-loading serif">กำลังวิเคราะห์…</div>
      </div>
    </div>
    <aside class="dive-aside">
      <div class="fact-sheet">
        <div class="fact-head">
          <span>Fact sheet</span>
          <span class="fact-symbol">${sym}</span>
        </div>
        ${factRowsHTML(d)}
      </div>
      <div class="mini-chart"><div class="mini-head"><span>Dividend per share</span><span>฿/share</span></div><canvas id="divChart"></canvas></div>
      <div class="mini-chart"><div class="mini-head"><span>ROE history</span><span>%</span></div><canvas id="roeChart"></canvas></div>
      <div class="mini-chart"><div class="mini-head"><span>Revenue trend</span><span>M฿</span></div><canvas id="revenueChart"></canvas></div>
    </aside>
  `;
  detail.classList.add('open');

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
  el.innerHTML = '<div class="search-state loading">กำลังค้นหา…</div>';

  try {
    const resp = await fetch(API + '/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteria: searchCriteria, sort_by: sort_by || 'quality_score', limit: 50 })
    });
    const data = await resp.json();
    renderSearchResults(data);
  } catch (e) {
    el.innerHTML = '<div class="search-state error">ค้นหาไม่ได้ · <a onclick="location.reload()">ลองใหม่</a></div>';
  }
}

function renderSearchResults(data) {
  const el = document.getElementById('search-results');
  const results = data.results || [];
  if (results.length === 0) {
    el.innerHTML = '<div class="search-state empty">ไม่พบหุ้นที่ตรงเงื่อนไข</div>';
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
