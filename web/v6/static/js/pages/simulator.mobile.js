/* ==========================================================
   MAX MAHON v6 — Simulator (Mobile)
   Plan 07 · Phase 4. Vanilla JS + Chart.js (global via shell).
   3 modes via dropdown (Karl decision) — DCA รายตัว / DCA ทั้งพอร์ต / Portfolio Backtest.
   ========================================================== */

export function mount(root) {
  if (!root) return;

  root.innerHTML = renderShell();
  wireModeSwitch(root);

  initSingleMode(root);
  initMultiMode(root);
  initBacktestMode(root);

  loadScreenerSymbols(root);
}

/* --------------------------------------------------------------
 * Shell / mode dropdown
 * ------------------------------------------------------------ */

function renderShell() {
  return (
    '<div class="section-title" style="margin:var(--sp-6) 0 var(--sp-4);font-weight:700;font-size:var(--fs-lg);color:var(--fg-primary)">Simulator</div>' +
    '<select class="mode-select" id="mode-select">' +
      '<option value="single">DCA รายตัว</option>' +
      '<option value="multi">DCA ทั้งพอร์ต</option>' +
      '<option value="backtest">Portfolio Backtest</option>' +
    '</select>' +
    '<div id="mode-single" class="mode-panel">' + renderSingleBody() + '</div>' +
    '<div id="mode-multi" class="mode-panel" style="display:none">' + renderMultiBody() + '</div>' +
    '<div id="mode-backtest" class="mode-panel" style="display:none">' + renderBacktestBody() + '</div>' +
    '<div class="ornament"></div>'
  );
}

function wireModeSwitch(root) {
  var sel = root.querySelector('#mode-select');
  if (!sel) return;
  sel.addEventListener('change', function () {
    var v = sel.value;
    ['single', 'multi', 'backtest'].forEach(function (k) {
      var el = root.querySelector('#mode-' + k);
      if (el) el.style.display = (k === v ? 'block' : 'none');
    });
    setTimeout(function () {
      if (window.Chart && window.Chart.instances) {
        Object.values(window.Chart.instances).forEach(function (c) { c.resize(); });
      }
    }, 50);
  });
}

/* --------------------------------------------------------------
 * Screener symbols populate dropdowns
 * ------------------------------------------------------------ */

async function loadScreenerSymbols(root) {
  var fallbackList = ['BBL', 'TCAP', 'INTUCH', 'KBANK', 'ADVANC', 'QH', 'LH', 'AOT', 'PTT', 'TOP'];
  var sel = root.querySelector('#single-stock');
  var symbols = fallbackList;
  try {
    var data = await MMApi.get('/api/screener');
    var cands = (data && data.candidates) || [];
    if (cands.length) {
      symbols = cands.map(function (c) {
        return (c.symbol || '').replace(/\.BK$/i, '');
      }).filter(Boolean);
    }
  } catch (e) {
    // silent fallback
  }
  if (sel) {
    sel.innerHTML = symbols.map(function (s) {
      return '<option value="' + MMUtils.escapeHtml(s) + '">' + MMUtils.escapeHtml(s) + '</option>';
    }).join('');
  }
}

/* --------------------------------------------------------------
 * MODE 1 — DCA Single Stock (mobile)
 * ------------------------------------------------------------ */

function renderSingleBody() {
  return (
    '<div class="input-group">' +
      '<div class="input-label">Stock</div>' +
      '<select class="input-sel" id="single-stock"><option>BBL</option></select>' +
    '</div>' +
    '<div class="input-group">' +
      '<div class="input-label">Monthly Amount (฿)</div>' +
      '<input class="input-number-big" id="single-amount" value="20000" />' +
    '</div>' +
    '<div class="input-group">' +
      '<div class="input-label">Duration (years)</div>' +
      '<input class="input-number-big" id="single-years" value="15" />' +
    '</div>' +
    '<div class="input-group">' +
      '<div class="input-label">Dividend Reinvest</div>' +
      '<select class="input-sel" id="single-reinvest">' +
        '<option value="true">Yes · reinvest</option>' +
        '<option value="false">No · take cash</option>' +
      '</select>' +
    '</div>' +
    '<div style="margin-top:20px">' +
      '<button class="btn primary w-full" id="single-run" type="button">Run Simulation</button>' +
    '</div>' +
    '<div id="single-result">' +
      '<div class="sim-empty" style="margin-top:20px">กรอกข้อมูลแล้วกด Run Simulation</div>' +
    '</div>'
  );
}

function initSingleMode(root) {
  var btn = root.querySelector('#single-run');
  if (!btn) return;
  btn.addEventListener('click', function () { runSingleDca(root); });
}

async function runSingleDca(root) {
  var result = root.querySelector('#single-result');
  if (!result) return;

  var sym = (root.querySelector('#single-stock').value || '').trim().toUpperCase();
  var amount = parseFloat(root.querySelector('#single-amount').value) || 0;
  var years = parseInt(root.querySelector('#single-years').value, 10) || 0;
  var reinvestStr = root.querySelector('#single-reinvest').value;

  if (!sym) { MMComponents.showToast('Select a stock', 'warn'); return; }
  if (amount <= 0) { MMComponents.showToast('Monthly amount must be > 0', 'warn'); return; }
  if (years <= 0 || years > 30) { MMComponents.showToast('Duration 1-30 years', 'warn'); return; }

  MMComponents.renderLoading(result, 'Simulating');

  try {
    var qs = '?amount=' + amount + '&backtest_years=' + years +
             '&forward_years=0&reinvest=' + reinvestStr;
    var data = await MMApi.get('/api/dca/' + encodeURIComponent(sym) + qs);
    renderSingleResult(result, data, sym, amount, years);
  } catch (e) {
    MMComponents.renderError(result, (e && e.message) || 'Simulation failed', function () { runSingleDca(root); });
  }
}

function renderSingleResult(host, data, sym, amount, years) {
  var bt = (data && data.backtest) || {};
  var totalInvested = bt.total_invested || 0;
  var shares = bt.total_shares || 0;
  var avgCost = bt.avg_cost || 0;
  var currentPrice = bt.current_price || 0;
  var accumulated = shares * currentPrice;
  var totalDiv = bt.total_dividends || 0;
  var retPct = bt.total_return_pct || 0;
  var yoc = bt.yield_on_cost || 0;

  host.innerHTML =
    '<div class="result-head">' +
      cell('Invested', MMUtils.fmtCompact(totalInvested), '฿' + MMUtils.fmtNum(amount, 0) + '/mo', true) +
      cell('Value Today', MMUtils.fmtCompact(accumulated), (retPct >= 0 ? '+' : '') + MMUtils.fmtNum(retPct, 0) + '%', true) +
      cell('Shares', MMUtils.fmtNum(shares, 0), 'avg ' + MMUtils.fmtNum(avgCost, 2), false, true) +
      cell('Div Lifetime', MMUtils.fmtCompact(totalDiv), 'YoC ' + MMUtils.fmtNum(yoc, 1) + '%', true) +
    '</div>' +
    '<div class="sim-chart-big"><canvas id="chart-single-m"></canvas></div>';

  drawSingleChart(host.querySelector('#chart-single-m'), bt.yearly || []);
}

function drawSingleChart(canvas, yearly) {
  if (!canvas || !window.Chart || !yearly.length) return;
  var labels = yearly.map(function (y) { return String(y.year || ''); });
  var invested = yearly.map(function (y) { return y.total_invested || 0; });
  var value = yearly.map(function (y) { return y.portfolio_value || 0; });
  var style = chartStyle();
  new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Value', data: value, borderColor: style.ink,
          backgroundColor: (getComputedStyle(document.documentElement).getPropertyValue('--chart-fill-soft').trim() || 'rgba(59,64,80,0.15)'), fill: true, tension: 0.3,
          pointRadius: 0, borderWidth: 2 },
        { label: 'Invested', data: invested, borderColor: style.accent,
          borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, fill: false },
      ],
    },
    options: chartOpts(style, true),
  });
}

/* --------------------------------------------------------------
 * MODE 2 — DCA Portfolio
 * ------------------------------------------------------------ */

function renderMultiBody() {
  return (
    '<div class="input-group">' +
      '<div class="input-label">Portfolio Composition</div>' +
      '<div id="multi-rows">' + defaultMultiRowsHtml() + '</div>' +
      '<button class="btn ghost mt-4 w-full" id="multi-add" type="button">+ Add Stock</button>' +
      '<div class="sim-weight-warn" id="multi-weight-warn"></div>' +
    '</div>' +
    '<div class="input-group">' +
      '<div class="input-label">Monthly Total (฿)</div>' +
      '<input class="input-number-big" id="multi-amount" value="50000" />' +
    '</div>' +
    '<div class="input-group">' +
      '<div class="input-label">Duration (years)</div>' +
      '<input class="input-number-big" id="multi-years" value="10" />' +
    '</div>' +
    '<div class="input-group">' +
      '<div class="input-label">Dividend Reinvest</div>' +
      '<select class="input-sel" id="multi-reinvest">' +
        '<option value="true">Yes · reinvest</option>' +
        '<option value="false">No · take cash</option>' +
      '</select>' +
    '</div>' +
    '<div style="margin-top:20px">' +
      '<button class="btn primary w-full" id="multi-run" type="button">Run Portfolio DCA</button>' +
    '</div>' +
    '<div id="multi-result">' +
      '<div class="sim-empty" style="margin-top:20px">เพิ่มหุ้น + weight รวม 100%</div>' +
    '</div>'
  );
}

function defaultMultiRowsHtml() {
  var defaults = [
    ['BBL', 30], ['TCAP', 25], ['INTUCH', 20], ['ADVANC', 15], ['QH', 10],
  ];
  return defaults.map(multiRowHtml).join('');
}

function multiRowHtml(item) {
  var sym = item[0] || '';
  var wt = item[1] == null ? '' : item[1];
  return (
    '<div class="multi-row">' +
      '<input type="text" class="sym-input" value="' + MMUtils.escapeHtml(sym) + '" placeholder="SYMBOL" />' +
      '<input type="number" class="weight-input" value="' + wt + '" placeholder="%" min="0" max="100" step="1" />' +
      '<button type="button" class="x" aria-label="Remove row">×</button>' +
    '</div>'
  );
}

function initMultiMode(root) {
  var host = root.querySelector('#multi-rows');
  var addBtn = root.querySelector('#multi-add');
  var runBtn = root.querySelector('#multi-run');
  if (!host || !addBtn || !runBtn) return;

  function recalcWarn() {
    var weights = Array.from(host.querySelectorAll('.weight-input'))
      .map(function (i) { return parseFloat(i.value) || 0; });
    var sum = weights.reduce(function (a, b) { return a + b; }, 0);
    var warn = root.querySelector('#multi-weight-warn');
    if (warn) {
      if (Math.abs(sum - 100) < 0.01) warn.textContent = '';
      else warn.textContent = 'Weights = ' + sum + '% (must be 100%)';
    }
  }

  host.addEventListener('input', recalcWarn);
  host.addEventListener('click', function (e) {
    if (e.target && e.target.classList.contains('x')) {
      var row = e.target.closest('.multi-row');
      if (row) row.remove();
      recalcWarn();
    }
  });
  addBtn.addEventListener('click', function () {
    host.insertAdjacentHTML('beforeend', multiRowHtml(['', '']));
    recalcWarn();
  });
  runBtn.addEventListener('click', function () { runMultiDca(root); });
  recalcWarn();
}

function collectMultiPositions(root) {
  var rows = Array.from(root.querySelectorAll('#multi-rows .multi-row'));
  return rows.map(function (r) {
    var sym = (r.querySelector('.sym-input').value || '').trim().toUpperCase();
    var wt = parseFloat(r.querySelector('.weight-input').value) || 0;
    return { symbol: sym, weight_pct: wt };
  }).filter(function (p) { return p.symbol && p.weight_pct > 0; });
}

async function runMultiDca(root) {
  var result = root.querySelector('#multi-result');
  if (!result) return;

  var positions = collectMultiPositions(root);
  if (!positions.length) { MMComponents.showToast('Add a position', 'warn'); return; }
  var sum = positions.reduce(function (a, p) { return a + p.weight_pct; }, 0);
  if (Math.abs(sum - 100) > 0.01) {
    MMComponents.showToast('Weights must = 100% (got ' + sum + ')', 'warn');
    return;
  }

  var amount = parseFloat(root.querySelector('#multi-amount').value) || 0;
  var years = parseInt(root.querySelector('#multi-years').value, 10) || 0;
  var reinvest = root.querySelector('#multi-reinvest').value === 'true';
  if (amount <= 0) { MMComponents.showToast('Monthly amount > 0', 'warn'); return; }
  if (years <= 0) { MMComponents.showToast('Duration > 0', 'warn'); return; }

  MMComponents.renderLoading(result, 'Simulating');

  try {
    var data = await MMApi.post('/api/simulate/dca-portfolio', {
      positions: positions, monthly_amount: amount,
      duration_years: years, reinvest_dividends: reinvest,
    });
    renderMultiResult(result, data);
  } catch (e) {
    MMComponents.renderError(result, (e && e.message) || 'Simulation failed', function () { runMultiDca(root); });
  }
}

function renderMultiResult(host, data) {
  var per = data.per_position || [];
  var timeline = data.timeline || [];

  host.innerHTML =
    '<div class="result-head">' +
      cell('Invested', MMUtils.fmtCompact(data.total_invested), '', true) +
      cell('Ending', MMUtils.fmtCompact(data.ending_value), (data.total_return_pct >= 0 ? '+' : '') + MMUtils.fmtNum(data.total_return_pct, 0) + '%', true) +
      cell('CAGR', MMUtils.fmtNum(data.cagr_pct, 1) + '%', '', false, true) +
      cell('Div Total', MMUtils.fmtCompact(data.total_dividends), 'YoC ' + MMUtils.fmtNum(data.avg_yoc_pct || 0, 1) + '%', true) +
    '</div>' +
    '<div class="sim-chart-big"><canvas id="chart-multi-m"></canvas></div>' +
    renderPerPositionList(per);

  drawMultiChart(host.querySelector('#chart-multi-m'), timeline);
}

function renderPerPositionList(per) {
  if (!per.length) return '';
  var items = per.map(function (p) {
    var symShort = (p.symbol || '').replace(/\.BK$/i, '');
    var retCls = (p.return_pct || 0) >= 0 ? 'pos' : 'neg';
    return (
      '<div style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px 0;border-bottom:1px dotted var(--border-subtle);font-family:var(--font-mono);font-size:0.8rem">' +
        '<div><span style="font-family:var(--font-head);font-weight:700">' + MMUtils.escapeHtml(symShort) + '</span>' +
          ' · ' + MMUtils.fmtNum(p.weight_pct, 0) + '%</div>' +
        '<div class="num ' + retCls + '">' + ((p.return_pct || 0) >= 0 ? '+' : '') + MMUtils.fmtNum(p.return_pct, 0) + '%</div>' +
        '<div style="color:var(--fg-dim);font-size:0.72rem">inv ฿' + MMUtils.fmtCompact(p.invested) +
          ' → ฿' + MMUtils.fmtCompact(p.ending_value) + '</div>' +
        '<div style="color:var(--fg-dim);font-size:0.72rem;text-align:right">div ฿' + MMUtils.fmtCompact(p.dividends) + '</div>' +
      '</div>'
    );
  }).join('');
  return (
    '<h3 style="font-family:var(--font-head);font-weight:700;font-size:1rem;margin-top:20px;margin-bottom:8px">Per Position</h3>' +
    items
  );
}

function drawMultiChart(canvas, timeline) {
  if (!canvas || !window.Chart || !timeline.length) return;
  var labels = timeline.map(function (t, i) {
    return i % 24 === 0 ? formatMonthLabel(t.date) : '';
  });
  var style = chartStyle();
  new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Value', data: timeline.map(function (t) { return t.portfolio_value || 0; }),
          borderColor: style.ink, backgroundColor: (getComputedStyle(document.documentElement).getPropertyValue('--chart-fill-soft').trim() || 'rgba(59,64,80,0.15)'),
          fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
        { label: 'Invested', data: timeline.map(function (t) { return t.invested_cumulative || 0; }),
          borderColor: style.accent, borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, fill: false },
      ],
    },
    options: chartOpts(style, true),
  });
}

/* --------------------------------------------------------------
 * MODE 3 — Portfolio Backtest (CRITICAL mobile)
 * ------------------------------------------------------------ */

function renderBacktestBody() {
  var defaultPortfolio =
    'BBL 20\n' +
    'TCAP 15\n' +
    'INTUCH 13\n' +
    'QH 10\n' +
    'ADVANC 10\n' +
    'AOT 8\n' +
    'PTT 8\n' +
    'KBANK 7\n' +
    'TOP 5\n' +
    'Cash 4';

  return (
    '<h3 id="backtest-title" style="font-family:var(--font-head);font-weight:900;font-size:1.5rem;line-height:1.15;margin:10px 0 6px">' +
      'ถ้า DCA ตั้งแต่<br><span style="font-style:italic;color:var(--c-positive)">มกราคม 2015</span> จนถึงวันนี้' +
    '</h3>' +
    '<p id="backtest-kicker" style="font-family:var(--font-head);font-style:italic;color:var(--fg-secondary);font-size:0.85rem;margin-bottom:16px">' +
      'Monthly DCA · dividends reinvested' +
    '</p>' +
    '<div class="input-group">' +
      '<div class="input-label">Portfolio (Symbol + Weight%)</div>' +
      '<textarea class="input-textarea" id="backtest-portfolio" style="font-size:0.85rem">' +
        defaultPortfolio + '</textarea>' +
    '</div>' +
    '<div class="input-group">' +
      '<div class="input-label">Start Date</div>' +
      '<input class="input-text" id="backtest-start" value="2015-01-01" />' +
    '</div>' +
    '<div class="input-group">' +
      '<div class="input-label">Monthly DCA Amount (฿)</div>' +
      '<input class="input-number-big" id="backtest-amount" value="10000" />' +
    '</div>' +
    '<div class="input-group">' +
      '<div class="input-label">Dividend Reinvestment</div>' +
      '<select class="input-sel" id="backtest-reinvest">' +
        '<option value="true">Yes · reinvest</option>' +
        '<option value="false">No · take cash</option>' +
      '</select>' +
    '</div>' +
    '<div style="margin-top:20px">' +
      '<button class="btn primary w-full" id="backtest-run" type="button">Run DCA Backtest</button>' +
    '</div>' +
    '<div id="backtest-result">' +
      '<div class="sim-empty" style="margin-top:20px">กรอกพอร์ตแล้วกด Run Backtest</div>' +
    '</div>'
  );
}

function initBacktestMode(root) {
  var btn = root.querySelector('#backtest-run');
  if (!btn) return;
  btn.addEventListener('click', function () { runBacktest(root); });
}

function parsePortfolioText(text) {
  return String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (line) {
    var parts = line.split(/\s+/);
    var symbol = parts[0];
    var weight = parseFloat(parts[1]);
    if (!symbol || isNaN(weight)) return null;
    if (symbol.toLowerCase() === 'cash') return { symbol: 'Cash', weight_pct: weight };
    var sym = symbol.toUpperCase();
    if (!sym.endsWith('.BK') && sym !== 'CASH') sym = sym + '.BK';
    return { symbol: sym, weight_pct: weight };
  }).filter(Boolean);
}

function normalizeStartDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return s + '-01';
  var thaiMonths = {
    'มกราคม': '01', 'กุมภาพันธ์': '02', 'มีนาคม': '03', 'เมษายน': '04',
    'พฤษภาคม': '05', 'มิถุนายน': '06', 'กรกฎาคม': '07', 'สิงหาคม': '08',
    'กันยายน': '09', 'ตุลาคม': '10', 'พฤศจิกายน': '11', 'ธันวาคม': '12',
  };
  var m = s.match(/([\u0E00-\u0E7F]+)\s+(\d{4})/);
  if (m && thaiMonths[m[1]]) return m[2] + '-' + thaiMonths[m[1]] + '-01';
  var dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    var y = dt.getFullYear();
    var mm = ('0' + (dt.getMonth() + 1)).slice(-2);
    return y + '-' + mm + '-01';
  }
  return null;
}

async function runBacktest(root) {
  var result = root.querySelector('#backtest-result');
  if (!result) return;

  var positions = parsePortfolioText(root.querySelector('#backtest-portfolio').value);
  if (!positions.length) { MMComponents.showToast('กรุณาใส่พอร์ต', 'warn'); return; }

  var sum = positions.reduce(function (a, p) { return a + p.weight_pct; }, 0);
  if (Math.abs(sum - 100) > 0.01) {
    MMComponents.showToast('Weights = ' + sum + '% · ต้องรวม 100%', 'warn');
    return;
  }

  var startDate = normalizeStartDate((root.querySelector('#backtest-start').value || '').trim());
  if (!startDate) { MMComponents.showToast('Start date ต้องเป็น YYYY-MM-DD', 'warn'); return; }

  var amount = parseFloat(root.querySelector('#backtest-amount').value) || 0;
  var reinvest = root.querySelector('#backtest-reinvest').value === 'true';
  if (amount <= 0) { MMComponents.showToast('Monthly amount > 0', 'warn'); return; }

  MMComponents.renderLoading(result, 'Running backtest');

  try {
    var data = await MMApi.post('/api/simulate/portfolio-backtest', {
      positions: positions,
      start_date: startDate,
      monthly_amount: amount,
      reinvest_dividends: reinvest,
      benchmark: 'SET',
    });
    updateBacktestTitle(root, data);
    renderBacktestResult(result, data, amount);
  } catch (e) {
    MMComponents.renderError(result, (e && e.message) || 'Backtest failed', function () { runBacktest(root); });
  }
}

function updateBacktestTitle(root, data) {
  var title = root.querySelector('#backtest-title');
  var kicker = root.querySelector('#backtest-kicker');
  var sd = data.start_date || '';
  var year = sd.slice(0, 4);
  var monthIdx = parseInt(sd.slice(5, 7), 10) - 1;
  var thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var label = (thaiMonths[monthIdx] || '') + ' ' + year;
  if (title) {
    title.innerHTML = 'ถ้า DCA ตั้งแต่<br><span style="font-style:italic;color:var(--c-positive)">' +
      MMUtils.escapeHtml(label.trim()) + '</span> จนถึงวันนี้';
  }
  if (kicker) {
    var months = data.duration_months || 0;
    var years = Math.floor(months / 12);
    var rem = months % 12;
    kicker.textContent = 'Monthly DCA · div reinvested · ' + years + ' yr ' + rem + ' mo';
  }
}

function renderBacktestResult(host, data, amountMonthly) {
  var timeline = data.timeline || [];
  var yearly = data.yearly_breakdown || [];
  var bench = data.benchmark || {};
  var assump = data.assumptions || {};
  var months = data.duration_months || 0;

  // Mobile: 7 cards stacked 2-col, with benchmark spanning 2
  host.innerHTML =
    '<div class="result-head">' +
      cell('Total Invested', MMUtils.fmtCompact(data.total_invested), '฿' + MMUtils.fmtNum(amountMonthly, 0) + ' × ' + months + ' mo', true) +
      cell('Port Value Today', MMUtils.fmtCompact(data.portfolio_value_today), 'div reinvested', true) +
      cell('Total Return', (data.total_return_pct >= 0 ? '+' : '') + MMUtils.fmtNum(data.total_return_pct, 1) + '%', 'over invested', false, true) +
      cell('CAGR', (data.cagr_pct >= 0 ? '+' : '') + MMUtils.fmtNum(data.cagr_pct, 1) + '%', 'annualized', false, true) +
      cell('Div Received', MMUtils.fmtCompact(data.dividends_received_total), 'cumulative', true) +
      cell('Max DD', MMUtils.fmtNum(data.max_drawdown_pct, 1) + '%', (data.max_drawdown_date || '—'), false, true) +
      '<div class="result-cell" style="grid-column:span 2">' +
        '<span class="lbl">SET Benchmark (same DCA)</span>' +
        '<span class="v mono">' + ((bench.return_pct >= 0 ? '+' : '')) + MMUtils.fmtNum(bench.return_pct, 0) + '% · ฿' + MMUtils.fmtCompact(bench.ending_value) + '</span>' +
        '<span class="sub">Δ ' + ((bench.delta_vs_portfolio >= 0) ? '+' : '') + '฿' + MMUtils.fmtCompact(bench.delta_vs_portfolio) + ' vs portfolio</span>' +
      '</div>' +
    '</div>' +
    '<div class="sim-chart-big" style="height:320px"><canvas id="chart-backtest-m"></canvas></div>' +
    '<p style="font-family:var(--font-head);font-style:italic;color:var(--fg-secondary);font-size:0.82rem;margin-top:14px;padding-top:10px;border-top:1px solid var(--border-subtle);line-height:1.5">' +
      '<strong>Assumptions.</strong> Monthly DCA of ฿' + MMUtils.fmtNum(amountMonthly, 0) +
      ' from ' + MMUtils.escapeHtml(data.start_date || '—') + ' to ' + MMUtils.escapeHtml(data.end_date || '—') +
      '. Dividends reinvested at declaration date. Benchmark proxy: ' +
      MMUtils.escapeHtml(assump.benchmark_proxy || 'TDEX / SET') +
      '. No transaction costs or tax modeled.' +
    '</p>' +
    '<h3 style="font-family:var(--font-head);font-weight:700;font-size:1rem;margin-top:22px;margin-bottom:10px;border-top:3px double var(--border-subtle);padding-top:14px">Yearly Breakdown</h3>' +
    renderMobileYearly(yearly);

  drawBacktestChart(host.querySelector('#chart-backtest-m'), timeline);
}

function renderMobileYearly(yearly) {
  if (!yearly.length) return '';
  // card-list view: 2 cols of small cards
  var items = yearly.map(function (y) {
    return (
      '<div style="border-top:1px solid var(--border-subtle);padding-top:6px">' +
        '<div style="font-family:var(--font-head);font-weight:700;font-size:0.9rem">' + y.year + '</div>' +
        '<div>inv ฿' + MMUtils.fmtCompact(y.invested_ytd) + '</div>' +
        '<div>port ฿' + MMUtils.fmtCompact(y.port_value_ytd) + '</div>' +
        '<div>div ฿' + MMUtils.fmtCompact(y.dividends_ytd) + '</div>' +
        '<div style="color:var(--fg-dim)">SET ฿' + MMUtils.fmtCompact(y.benchmark_ytd) + '</div>' +
      '</div>'
    );
  }).join('');
  return (
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-family:var(--font-mono);font-size:0.72rem">' +
      items +
    '</div>'
  );
}

function drawBacktestChart(canvas, timeline) {
  if (!canvas || !window.Chart || !timeline.length) return;
  var labels = timeline.map(function (t, i) {
    return i % 24 === 0 ? formatMonthLabel(t.date) : '';
  });
  var style = chartStyle();
  new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Portfolio',
          data: timeline.map(function (t) { return t.portfolio_value || 0; }),
          borderColor: 'rgba(93,140,105,1)',
          backgroundColor: 'rgba(93,140,105,0.15)',
          fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2, order: 1 },
        { label: 'SET',
          data: timeline.map(function (t) { return t.benchmark_value || 0; }),
          borderColor: (getComputedStyle(document.documentElement).getPropertyValue('--fg-primary').trim() || '#3b4050'),
          borderDash: [6, 4], borderWidth: 1.3, pointRadius: 0, fill: false, order: 2 },
        { label: 'Invested',
          data: timeline.map(function (t) { return t.invested_cumulative || 0; }),
          borderColor: (getComputedStyle(document.documentElement).getPropertyValue('--chart-grid-strong').trim() || 'rgba(59,64,80,0.15)'),
          borderWidth: 1.3, pointRadius: 0, fill: false, order: 3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'JetBrains Mono', size: 8 }, usePointStyle: true, padding: 8, boxWidth: 18 },
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + ': ฿' + (ctx.parsed.y / 1e6).toFixed(2) + 'M';
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { color: style.ruleHair },
             ticks: { font: { size: 9 }, maxRotation: 0 } },
        y: { grid: { color: style.ruleHair }, border: { display: false },
             ticks: { font: { size: 9 },
                      callback: function (v) { return '฿' + (v / 1e6).toFixed(1) + 'M'; } } },
      },
    },
  });
}

/* --------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------ */

function cell(label, value, sub, valueWrapMono, valueItselfMono) {
  var inner;
  if (valueWrapMono) {
    var rest = String(value).replace(/^฿\s*/, '');
    inner = '<span class="v">฿ <span class="mono">' + MMUtils.escapeHtml(rest) + '</span></span>';
  } else if (valueItselfMono) {
    inner = '<span class="v mono">' + MMUtils.escapeHtml(String(value)) + '</span>';
  } else {
    inner = '<span class="v">' + MMUtils.escapeHtml(String(value)) + '</span>';
  }
  return (
    '<div class="result-cell">' +
      '<span class="lbl">' + MMUtils.escapeHtml(label) + '</span>' +
      inner +
      '<span class="sub">' + MMUtils.escapeHtml(sub || '') + '</span>' +
    '</div>'
  );
}

function formatMonthLabel(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  if (parts.length < 2) return dateStr;
  var monthIdx = parseInt(parts[1], 10) - 1;
  var year = parts[0].slice(2);
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return (months[monthIdx] || '') + ' ' + year;
}

function chartStyle() {
  var cs = getComputedStyle(document.documentElement);
  return {
    ink: (cs.getPropertyValue('--ink') || '#3b4050').trim() || '#3b4050',
    accent: (cs.getPropertyValue('--accent') || '#5d8c69').trim() || '#5d8c69',
    inkDim: (cs.getPropertyValue('--ink-dim') || '#878d9a').trim() || '#878d9a',
    ruleHair: (getComputedStyle(document.documentElement).getPropertyValue('--chart-fill-medium').trim() || 'rgba(59,64,80,0.15)'),
  };
}

function chartOpts(style, small) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { font: { family: 'JetBrains Mono', size: small ? 9 : 10 }, usePointStyle: true },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { color: style.ruleHair },
           ticks: { font: { size: 9 }, maxRotation: 0 } },
      y: { grid: { color: style.ruleHair }, border: { display: false },
           ticks: { font: { size: 9 },
                    callback: function (v) { return '฿' + (v / 1e6).toFixed(1) + 'M'; } } },
    },
  };
}
