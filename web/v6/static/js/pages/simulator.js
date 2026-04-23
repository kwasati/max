/* ==========================================================
   MAX MAHON v6 — Simulator (Desktop)
   Plan 07. Vanilla JS + Chart.js (global via shell).
   Phases 1-3: Tab 1 DCA รายตัว + Tab 2 DCA ทั้งพอร์ต + Tab 3 Portfolio Backtest.
   ========================================================== */

export function mount(root) {
  if (!root) return;

  root.innerHTML = renderShell();
  wireTabs(root);

  initSingleTab(root);
  initMultiTab(root);
  initBacktestTab(root);

  loadScreenerSymbols(root);
}

/* --------------------------------------------------------------
 * Shell / layout
 * ------------------------------------------------------------ */

function renderShell() {
  return (
    '<div class="section-title" style="margin:var(--sp-6) 0 var(--sp-4);font-weight:700;font-size:var(--fs-lg);color:var(--fg-primary)">Simulator</div>' +
    '<h2 class="section-title">What-If.</h2>' +
    '<p style="color:var(--fg-dim);font-size:var(--fs-sm);margin-bottom:var(--sp-4)">' +
      'วิเคราะห์ย้อนหลัง — ถ้าทยอยเก็บรายเดือน · ทยอยเก็บทั้งพอร์ต · หรือถือพอร์ตตั้งแต่ปีนู้น — วันนี้จะเป็นยังไง' +
    '</p>' +
    '<div class="tab-bar" role="tablist">' +
      '<button class="tab active" data-tab="single" type="button">DCA รายตัว</button>' +
      '<button class="tab" data-tab="multi" type="button">DCA ทั้งพอร์ต</button>' +
      '<button class="tab" data-tab="backtest" type="button">Portfolio Backtest</button>' +
    '</div>' +
    '<div id="tab-single" class="tab-content active">' + renderSingleTabBody() + '</div>' +
    '<div id="tab-multi" class="tab-content">' + renderMultiTabBody() + '</div>' +
    '<div id="tab-backtest" class="tab-content">' + renderBacktestTabBody() + '</div>' +
    '<div class="ornament"></div>'
  );
}

function wireTabs(root) {
  var tabs = root.querySelectorAll('.tab');
  tabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-tab');
      tabs.forEach(function (t) { t.classList.remove('active'); });
      btn.classList.add('active');
      ['single', 'multi', 'backtest'].forEach(function (k) {
        var el = root.querySelector('#tab-' + k);
        if (el) el.classList.toggle('active', k === key);
      });
      setTimeout(function () {
        if (window.Chart && window.Chart.instances) {
          Object.values(window.Chart.instances).forEach(function (c) { c.resize(); });
        }
      }, 50);
    });
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
    // fall back silently
  }
  if (sel) {
    sel.innerHTML = symbols.map(function (s) {
      return '<option value="' + MMUtils.escapeHtml(s) + '">' + MMUtils.escapeHtml(s) + '</option>';
    }).join('');
  }
}

/* --------------------------------------------------------------
 * TAB 1 — DCA Single Stock
 * ------------------------------------------------------------ */

function renderSingleTabBody() {
  return (
    '<section class="sim-layout">' +
      '<aside class="sim-inputs">' +
        '<div class="input-group">' +
          '<div class="input-label">Stock</div>' +
          '<select class="input-sel" id="single-stock"><option>BBL</option></select>' +
          '<div class="input-help">หุ้นที่ผ่าน 5-5-5-5 ในรอบล่าสุด</div>' +
        '</div>' +
        '<div class="input-group">' +
          '<div class="input-label">Monthly Amount (฿)</div>' +
          '<input class="input-number-big" id="single-amount" value="20000" />' +
          '<div class="input-help">จำนวนเงินที่ลงทุกเดือน · ทบต่อเนื่อง</div>' +
        '</div>' +
        '<div class="input-group">' +
          '<div class="input-label">Duration (years)</div>' +
          '<input class="input-number-big" id="single-years" value="15" />' +
          '<div class="input-help">ช่วงเวลา DCA</div>' +
        '</div>' +
        '<div class="input-group">' +
          '<div class="input-label">Dividend Reinvestment</div>' +
          '<select class="input-sel" id="single-reinvest">' +
            '<option value="true">Yes · reinvest into same stock</option>' +
            '<option value="false">No · take as cash</option>' +
          '</select>' +
        '</div>' +
        '<button class="btn primary w-full" id="single-run" type="button">Run Simulation</button>' +
      '</aside>' +
      '<div id="single-result">' +
        '<div class="sim-empty">กรอกข้อมูลแล้วกด Run Simulation</div>' +
      '</div>' +
    '</section>'
  );
}

function initSingleTab(root) {
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
  if (years <= 0 || years > 30) { MMComponents.showToast('Duration must be 1-30 years', 'warn'); return; }

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
  var months = Math.round(years * 12);
  var yearlyArr = bt.yearly || [];

  host.innerHTML =
    '<div class="result-head">' +
      cell('Invested', MMUtils.fmtCompact(totalInvested), '฿' + MMUtils.fmtNum(amount, 0) + ' × ' + months + ' months', true) +
      cell('Accumulated Value', MMUtils.fmtCompact(accumulated), (retPct >= 0 ? '+' : '') + MMUtils.fmtNum(retPct, 1) + '% total return', true) +
      cell('Shares Held', MMUtils.fmtNum(shares, 0), 'avg cost ' + MMUtils.fmtNum(avgCost, 2), false, true) +
      cell('Div Paid Lifetime', MMUtils.fmtCompact(totalDiv), 'yield-on-cost ' + MMUtils.fmtNum(yoc, 1) + '%', true) +
    '</div>' +
    '<div class="sim-chart-big"><canvas id="chart-single"></canvas></div>' +
    '<p class="lede" style="margin-top:var(--sp-5);max-width:64ch">' +
      MMUtils.escapeHtml(sym) + ' · ถ้าทยอยซื้อเดือนละ ฿' + MMUtils.fmtNum(amount, 0) +
      ' ต่อเนื่อง ' + years + ' ปี · ลงทุนรวม ฿' + MMUtils.fmtCompact(totalInvested) +
      ' · วันนี้ถือมูลค่า ฿' + MMUtils.fmtCompact(accumulated) +
      ' และได้ปันผลสะสม ฿' + MMUtils.fmtCompact(totalDiv) +
      ' · yield-on-cost อยู่ที่ ' + MMUtils.fmtNum(yoc, 1) + '%' +
    '</p>';

  drawSingleChart(host.querySelector('#chart-single'), yearlyArr);
}

function drawSingleChart(canvas, yearly) {
  if (!canvas || !window.Chart) return;
  var labels = yearly.map(function (y) { return String(y.year || ''); });
  var invested = yearly.map(function (y) { return y.total_invested || 0; });
  var value = yearly.map(function (y) { return y.portfolio_value || 0; });
  if (!labels.length) return;

  var style = chartStyle();
  new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Accumulated Value',
          data: value,
          borderColor: style.ink,
          backgroundColor: (getComputedStyle(document.documentElement).getPropertyValue('--chart-fill-soft').trim() || 'rgba(59,64,80,0.15)'),
          fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
        },
        {
          label: 'Invested',
          data: invested,
          borderColor: style.accent,
          borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, fill: false,
        },
      ],
    },
    options: chartOpts(style),
  });
}

/* --------------------------------------------------------------
 * TAB 2 — DCA Portfolio (multi-stock)
 * ------------------------------------------------------------ */

function renderMultiTabBody() {
  return (
    '<section class="sim-layout">' +
      '<aside class="sim-inputs">' +
        '<div class="input-group">' +
          '<div class="input-label">Portfolio Composition</div>' +
          '<div id="multi-rows">' + defaultMultiRowsHtml() + '</div>' +
          '<button class="btn ghost mt-4 w-full" id="multi-add" type="button">+ Add Stock</button>' +
          '<div class="sim-weight-warn" id="multi-weight-warn"></div>' +
        '</div>' +
        '<div class="input-group">' +
          '<div class="input-label">Monthly Amount (total ฿)</div>' +
          '<input class="input-number-big" id="multi-amount" value="50000" />' +
        '</div>' +
        '<div class="input-group">' +
          '<div class="input-label">Duration (years)</div>' +
          '<input class="input-number-big" id="multi-years" value="10" />' +
        '</div>' +
        '<div class="input-group">' +
          '<div class="input-label">Dividend Reinvestment</div>' +
          '<select class="input-sel" id="multi-reinvest">' +
            '<option value="true">Yes · reinvest</option>' +
            '<option value="false">No · take cash</option>' +
          '</select>' +
        '</div>' +
        '<button class="btn primary w-full" id="multi-run" type="button">Run Portfolio DCA</button>' +
      '</aside>' +
      '<div id="multi-result">' +
        '<div class="sim-empty">เพิ่มหุ้น + weight รวม 100% แล้วกด Run Portfolio DCA</div>' +
      '</div>' +
    '</section>'
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

function initMultiTab(root) {
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
      if (Math.abs(sum - 100) < 0.01) {
        warn.textContent = '';
      } else {
        warn.textContent = 'Weights sum = ' + sum + '% (must be 100%)';
      }
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
  if (!positions.length) { MMComponents.showToast('Add at least one position', 'warn'); return; }
  var sum = positions.reduce(function (a, p) { return a + p.weight_pct; }, 0);
  if (Math.abs(sum - 100) > 0.01) {
    MMComponents.showToast('Weights must sum to 100% (got ' + sum + ')', 'warn');
    return;
  }

  var amount = parseFloat(root.querySelector('#multi-amount').value) || 0;
  var years = parseInt(root.querySelector('#multi-years').value, 10) || 0;
  var reinvest = root.querySelector('#multi-reinvest').value === 'true';
  if (amount <= 0) { MMComponents.showToast('Monthly amount must be > 0', 'warn'); return; }
  if (years <= 0) { MMComponents.showToast('Duration must be > 0', 'warn'); return; }

  MMComponents.renderLoading(result, 'Simulating portfolio');

  try {
    var body = {
      positions: positions,
      monthly_amount: amount,
      duration_years: years,
      reinvest_dividends: reinvest,
    };
    var data = await MMApi.post('/api/simulate/dca-portfolio', body);
    renderMultiResult(result, data, amount);
  } catch (e) {
    MMComponents.renderError(result, (e && e.message) || 'Simulation failed', function () { runMultiDca(root); });
  }
}

function renderMultiResult(host, data, amountMonthly) {
  var invested = data.total_invested || 0;
  var ending = data.ending_value || 0;
  var cagr = data.cagr_pct || 0;
  var totalDiv = data.total_dividends || 0;
  var retPct = data.total_return_pct || 0;
  var months = data.duration_months || 0;
  var per = data.per_position || [];
  var timeline = data.timeline || [];

  host.innerHTML =
    '<div class="result-head">' +
      cell('Invested', MMUtils.fmtCompact(invested), '฿' + MMUtils.fmtNum(amountMonthly, 0) + ' × ' + months + ' months', true) +
      cell('Ending Value', MMUtils.fmtCompact(ending), (retPct >= 0 ? '+' : '') + MMUtils.fmtNum(retPct, 1) + '% total return', true) +
      cell('CAGR', MMUtils.fmtNum(cagr, 1) + '%', 'annualized', false, true) +
      cell('Div Paid Lifetime', MMUtils.fmtCompact(totalDiv), 'avg YoC ' + MMUtils.fmtNum(data.avg_yoc_pct || 0, 1) + '%', true) +
    '</div>' +
    '<div class="sim-chart-big"><canvas id="chart-multi"></canvas></div>' +
    renderPerPositionTable(per);

  drawMultiChart(host.querySelector('#chart-multi'), timeline);
}

function renderPerPositionTable(per) {
  if (!per.length) return '';
  var rows = per.map(function (p) {
    var retCls = (p.return_pct || 0) >= 0 ? 'pos' : 'neg';
    var symShort = (p.symbol || '').replace(/\.BK$/i, '');
    return (
      '<tr>' +
        '<td class="sym">' + MMUtils.escapeHtml(symShort) + '</td>' +
        '<td class="num">' + MMUtils.fmtNum(p.weight_pct, 0) + '%</td>' +
        '<td class="num">' + MMUtils.fmtNum(p.invested, 0) + '</td>' +
        '<td class="num">' + MMUtils.fmtNum(p.ending_value, 0) + '</td>' +
        '<td class="num ' + retCls + '">' + ((p.return_pct || 0) >= 0 ? '+' : '') + MMUtils.fmtNum(p.return_pct, 0) + '%</td>' +
        '<td class="num">' + MMUtils.fmtNum(p.dividends, 0) + '</td>' +
      '</tr>'
    );
  }).join('');
  return (
    '<table class="data-table mt-5">' +
      '<thead>' +
        '<tr><th>Position</th><th class="num">Weight</th><th class="num">Invested</th><th class="num">Ending Value</th><th class="num">Return</th><th class="num">Div Paid</th></tr>' +
      '</thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>'
  );
}

function drawMultiChart(canvas, timeline) {
  if (!canvas || !window.Chart || !timeline.length) return;
  var labels = timeline.map(function (t, i) {
    return i % 12 === 0 ? formatMonthLabel(t.date) : '';
  });
  var value = timeline.map(function (t) { return t.portfolio_value || 0; });
  var invested = timeline.map(function (t) { return t.invested_cumulative || 0; });
  var style = chartStyle();
  new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Portfolio Value', data: value, borderColor: style.ink,
          backgroundColor: (getComputedStyle(document.documentElement).getPropertyValue('--chart-fill-soft').trim() || 'rgba(59,64,80,0.15)'), fill: true, tension: 0.3,
          pointRadius: 0, borderWidth: 2 },
        { label: 'Invested', data: invested, borderColor: style.accent,
          borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, fill: false },
      ],
    },
    options: chartOpts(style),
  });
}

/* --------------------------------------------------------------
 * TAB 3 — Portfolio Backtest (CRITICAL per Karl)
 * ------------------------------------------------------------ */

function renderBacktestTabBody() {
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
    '<div class="section-num" style="border-top:none;margin-top:0">' +
      '<span class="no">05c · Portfolio Backtest</span>' +
      '<span>DCA Simulation · Dividends Reinvested</span>' +
    '</div>' +
    '<h3 class="section-title" id="backtest-title" style="font-size:var(--fs-2xl)">ถ้า DCA ตั้งแต่ ' +
      '<span style="font-style:italic;color:var(--c-positive)">มกราคม 2015</span> จนถึงวันนี้</h3>' +
    '<p id="backtest-kicker" style="color:var(--fg-dim);font-size:var(--fs-sm);margin-bottom:var(--sp-4)">' +
      'Portfolio Backtest · simulated monthly dollar-cost averaging · dividends reinvested.' +
    '</p>' +
    '<section class="sim-layout">' +
      '<aside class="sim-inputs">' +
        '<div class="input-group">' +
          '<div class="input-label">Portfolio (Symbol + Weight%)</div>' +
          '<textarea class="input-textarea" id="backtest-portfolio">' + defaultPortfolio + '</textarea>' +
          '<div class="input-help">Symbol + weight% ต่อบรรทัด (เช่น "BBL 20")</div>' +
        '</div>' +
        '<div class="input-group">' +
          '<div class="input-label">Start Date</div>' +
          '<input class="input-text" id="backtest-start" value="2015-01-01" />' +
          '<div class="input-help">รูปแบบ YYYY-MM-DD · default มกราคม 2015</div>' +
        '</div>' +
        '<div class="input-group">' +
          '<div class="input-label">Monthly DCA Amount (฿)</div>' +
          '<input class="input-number-big" id="backtest-amount" value="10000" />' +
          '<div class="input-help">จำนวนที่ลงสม่ำเสมอทุกเดือน</div>' +
        '</div>' +
        '<div class="input-group">' +
          '<div class="input-label">Dividend Reinvestment</div>' +
          '<select class="input-sel" id="backtest-reinvest">' +
            '<option value="true">Yes · reinvest</option>' +
            '<option value="false">No · take cash</option>' +
          '</select>' +
        '</div>' +
        '<button class="btn primary w-full" id="backtest-run" type="button">Run DCA Backtest</button>' +
      '</aside>' +
      '<div id="backtest-result">' +
        '<div class="sim-empty">กรอกพอร์ต + start date แล้วกด Run DCA Backtest</div>' +
      '</div>' +
    '</section>'
  );
}

function initBacktestTab(root) {
  var btn = root.querySelector('#backtest-run');
  if (!btn) return;
  btn.addEventListener('click', function () { runBacktest(root); });
}

function parsePortfolioText(text) {
  return String(text || '').split('\n').map(function (line) {
    return line.trim();
  }).filter(Boolean).map(function (line) {
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

async function runBacktest(root) {
  var result = root.querySelector('#backtest-result');
  if (!result) return;

  var portfolioText = root.querySelector('#backtest-portfolio').value;
  var positions = parsePortfolioText(portfolioText);
  if (!positions.length) { MMComponents.showToast('กรุณาใส่พอร์ต', 'warn'); return; }

  var sum = positions.reduce(function (a, p) { return a + p.weight_pct; }, 0);
  if (Math.abs(sum - 100) > 0.01) {
    MMComponents.showToast('Weights sum = ' + sum + '% · ต้องรวม 100%', 'warn');
    return;
  }

  var startDateRaw = (root.querySelector('#backtest-start').value || '').trim();
  var startDate = normalizeStartDate(startDateRaw);
  if (!startDate) { MMComponents.showToast('Start date ต้องเป็น YYYY-MM-DD', 'warn'); return; }

  var amount = parseFloat(root.querySelector('#backtest-amount').value) || 0;
  var reinvest = root.querySelector('#backtest-reinvest').value === 'true';
  if (amount <= 0) { MMComponents.showToast('Monthly amount must be > 0', 'warn'); return; }

  MMComponents.renderLoading(result, 'Running portfolio backtest');

  try {
    var body = {
      positions: positions,
      start_date: startDate,
      monthly_amount: amount,
      reinvest_dividends: reinvest,
      benchmark: 'SET',
    };
    var data = await MMApi.post('/api/simulate/portfolio-backtest', body);
    updateBacktestTitle(root, data);
    renderBacktestResult(result, data, amount);
  } catch (e) {
    MMComponents.renderError(result, (e && e.message) || 'Backtest failed', function () { runBacktest(root); });
  }
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
  if (m && thaiMonths[m[1]]) {
    return m[2] + '-' + thaiMonths[m[1]] + '-01';
  }
  var dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    var y = dt.getFullYear();
    var mm = ('0' + (dt.getMonth() + 1)).slice(-2);
    return y + '-' + mm + '-01';
  }
  return null;
}

function updateBacktestTitle(root, data) {
  var title = root.querySelector('#backtest-title');
  if (!title) return;
  var sd = data.start_date || '';
  var year = sd.slice(0, 4);
  var monthIdx = parseInt(sd.slice(5, 7), 10) - 1;
  var thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var label = (thaiMonths[monthIdx] || '') + ' ' + year;
  title.innerHTML = 'ถ้า DCA ตั้งแต่ <span style="font-style:italic;color:var(--c-positive)">' +
    MMUtils.escapeHtml(label.trim()) + '</span> จนถึงวันนี้';

  var kicker = root.querySelector('#backtest-kicker');
  if (kicker) {
    var months = data.duration_months || 0;
    var years = Math.floor(months / 12);
    var rem = months % 12;
    kicker.textContent = 'Portfolio Backtest · simulated monthly dollar-cost averaging from ' +
      (data.start_date || '') + ' through ' + (data.end_date || '') +
      ' · ' + years + ' years ' + rem + ' months · dividends reinvested.';
  }
}

function renderBacktestResult(host, data, amountMonthly) {
  var timeline = data.timeline || [];
  var yearly = data.yearly_breakdown || [];
  var bench = data.benchmark || {};
  var assump = data.assumptions || {};
  var months = data.duration_months || 0;

  host.innerHTML =
    // Row 1: 4 cards (Invested / Value Today / Total Return / CAGR)
    '<div class="result-head" style="grid-template-columns:repeat(4,1fr);">' +
      cell('Total Invested', MMUtils.fmtCompact(data.total_invested), '฿' + MMUtils.fmtNum(amountMonthly, 0) + ' × ' + months + ' months', true) +
      cell('Portfolio Value Today', MMUtils.fmtCompact(data.portfolio_value_today), 'dividends reinvested', true) +
      cell('Total Return', (data.total_return_pct >= 0 ? '+' : '') + MMUtils.fmtNum(data.total_return_pct, 1) + '%', 'value / invested − 1', false, true) +
      cell('CAGR', (data.cagr_pct >= 0 ? '+' : '') + MMUtils.fmtNum(data.cagr_pct, 1) + '%', 'annualized · on DCA schedule', false, true) +
    '</div>' +
    // Row 2: 3 cards (Dividends / Max DD / Benchmark)
    '<div class="result-head" style="grid-template-columns:repeat(3,1fr);margin-top:calc(-1 * var(--sp-5));border-top:none;">' +
      cell('Dividends Received', MMUtils.fmtCompact(data.dividends_received_total), 'cumulative · reinvested', true) +
      cell('Max Drawdown', MMUtils.fmtNum(data.max_drawdown_pct, 1) + '%', (data.max_drawdown_date || '—'), false, true) +
      cell('SET Benchmark (same DCA)',
           (bench.return_pct >= 0 ? '+' : '') + MMUtils.fmtNum(bench.return_pct, 1) + '%',
           '฿' + MMUtils.fmtCompact(data.total_invested) + ' → ฿' + MMUtils.fmtCompact(bench.ending_value) +
           ' · Δ ' + ((bench.delta_vs_portfolio >= 0) ? '+' : '') + '฿' + MMUtils.fmtCompact(bench.delta_vs_portfolio),
           false, true) +
    '</div>' +
    '<div class="sim-chart-big" style="height:440px"><canvas id="chart-backtest"></canvas></div>' +
    '<p class="lede" style="margin-top:var(--sp-5);max-width:68ch;text-align:left;font-size:var(--fs-sm);border-top:1px solid var(--border-subtle);padding-top:var(--sp-4)">' +
      '<strong>Assumptions.</strong> Simulated monthly dollar-cost averaging of ฿' + MMUtils.fmtNum(amountMonthly, 0) +
      ' from ' + MMUtils.escapeHtml(data.start_date || '—') + ' through ' + MMUtils.escapeHtml(data.end_date || '—') +
      '. Dividends reinvested at declaration date. Benchmark proxy: ' +
      MMUtils.escapeHtml(assump.benchmark_proxy || 'TDEX / SET') + '.' +
      ' Transaction costs ' + (assump.transaction_costs_modeled ? 'modeled' : 'not modeled') + '.' +
      ' Tax ' + (assump.tax_modeled ? 'modeled' : 'not modeled') + '.' +
      ' Cash return rate: ' + (assump.cash_return_rate_pct || 0) + '%.' +
      ' Past performance does not predict future returns.' +
    '</p>' +
    '<h3 style="font-family:var(--font-head);font-weight:700;font-size:var(--fs-md);margin-top:var(--sp-6);margin-bottom:var(--sp-3)">Yearly Breakdown</h3>' +
    renderYearlyTable(yearly);

  drawBacktestChart(host.querySelector('#chart-backtest'), timeline);
}

function renderYearlyTable(yearly) {
  if (!yearly.length) return '';
  var rows = yearly.map(function (y) {
    return (
      '<tr>' +
        '<td class="sym">' + y.year + '</td>' +
        '<td class="num">' + MMUtils.fmtNum(y.invested_ytd, 0) + '</td>' +
        '<td class="num">' + MMUtils.fmtNum(y.port_value_ytd, 0) + '</td>' +
        '<td class="num">' + MMUtils.fmtNum(y.dividends_ytd, 0) + '</td>' +
        '<td class="num">' + MMUtils.fmtNum(y.benchmark_ytd, 0) + '</td>' +
      '</tr>'
    );
  }).join('');
  return (
    '<table class="data-table">' +
      '<thead>' +
        '<tr>' +
          '<th>Year</th>' +
          '<th class="num">Invested YTD</th>' +
          '<th class="num">Port Value YTD</th>' +
          '<th class="num">Dividends YTD</th>' +
          '<th class="num">SET YTD</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>'
  );
}

function drawBacktestChart(canvas, timeline) {
  if (!canvas || !window.Chart || !timeline.length) return;
  var labels = timeline.map(function (t, i) {
    return i % 12 === 0 ? formatMonthLabel(t.date) : '';
  });
  var portfolioVals = timeline.map(function (t) { return t.portfolio_value || 0; });
  var benchVals = timeline.map(function (t) { return t.benchmark_value || 0; });
  var investedVals = timeline.map(function (t) { return t.invested_cumulative || 0; });

  var style = chartStyle();

  new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Portfolio Value (DCA, div reinvested)',
          data: portfolioVals,
          borderColor: 'rgba(93,140,105,1)',
          backgroundColor: 'rgba(93,140,105,0.15)',
          fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2.2,
          order: 1,
        },
        {
          label: 'SET Benchmark (same DCA schedule)',
          data: benchVals,
          borderColor: (getComputedStyle(document.documentElement).getPropertyValue('--fg-primary').trim() || '#3b4050'),
          borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false,
          order: 2,
        },
        {
          label: 'Cumulative Invested',
          data: investedVals,
          borderColor: (getComputedStyle(document.documentElement).getPropertyValue('--chart-grid-strong').trim() || 'rgba(59,64,80,0.15)'),
          borderWidth: 1.5, pointRadius: 0, fill: false,
          order: 3,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'JetBrains Mono', size: 10 }, usePointStyle: true, padding: 14, boxWidth: 24 },
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
             ticks: { font: { size: 10 },
                      callback: function (v) { return '฿' + (v / 1e6).toFixed(1) + 'M'; } } },
      },
    },
  });
}

/* --------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------ */

/**
 * Render a result-cell.
 *  - valueWrapMono=true  → value renders as "฿ <mono>value</mono>"
 *  - valueItselfMono=true → whole value is mono (e.g. "+109%", "8.9%")
 *  - neither → plain headline value
 */
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
    ink: (cs.getPropertyValue('--fg-primary') || '#3b4050').trim() || '#3b4050',
    accent: (cs.getPropertyValue('--c-positive-strong') || '#5d8c69').trim() || '#5d8c69',
    inkDim: (cs.getPropertyValue('--fg-dim') || '#878d9a').trim() || '#878d9a',
    ruleHair: (getComputedStyle(document.documentElement).getPropertyValue('--chart-fill-medium').trim() || 'rgba(59,64,80,0.15)'),
  };
}

function chartOpts(style) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { font: { family: 'JetBrains Mono', size: 10 }, usePointStyle: true },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { color: style.ruleHair },
           ticks: { font: { size: 9 }, maxRotation: 0 } },
      y: { grid: { color: style.ruleHair }, border: { display: false },
           ticks: { font: { size: 10 },
                    callback: function (v) { return '฿' + (v / 1e6).toFixed(1) + 'M'; } } },
    },
  };
}
