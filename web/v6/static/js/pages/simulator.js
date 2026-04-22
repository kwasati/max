/* ==========================================================
   MAX MAHON v6 — Simulator (Desktop)
   Plan 07. Vanilla JS + Chart.js (global via shell).
   Phases 1-2: Tab 1 DCA รายตัว + Tab 2 DCA ทั้งพอร์ต.
   ========================================================== */

export function mount(root) {
  if (!root) return;

  root.innerHTML = renderShell();
  wireTabs(root);

  initSingleTab(root);
  initMultiTab(root);

  loadScreenerSymbols(root);
}

/* --------------------------------------------------------------
 * Shell / layout
 * ------------------------------------------------------------ */

function renderShell() {
  return (
    MMComponents.renderSectionNum('05', 'Simulator', 'Three Modes · Retrospective + Accumulation') +
    '<h2 class="section-title">What-If.</h2>' +
    '<p class="section-kicker">' +
      'วิเคราะห์ย้อนหลัง — ถ้าทยอยเก็บรายเดือน · ทยอยเก็บทั้งพอร์ต · หรือถือพอร์ตตั้งแต่ปีนู้น — วันนี้จะเป็นยังไง' +
    '</p>' +
    '<div class="tab-bar" role="tablist">' +
      '<button class="tab active" data-tab="single" type="button">DCA รายตัว</button>' +
      '<button class="tab" data-tab="multi" type="button">DCA ทั้งพอร์ต</button>' +
      '<button class="tab" data-tab="backtest" type="button">Portfolio Backtest</button>' +
    '</div>' +
    '<div id="tab-single" class="tab-content active">' + renderSingleTabBody() + '</div>' +
    '<div id="tab-multi" class="tab-content">' + renderMultiTabBody() + '</div>' +
    '<div id="tab-backtest" class="tab-content">' +
      '<div class="sim-empty">Tab 3 — coming next commit</div>' +
    '</div>' +
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
          backgroundColor: 'rgba(26,24,20,0.08)',
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
          backgroundColor: 'rgba(26,24,20,0.06)', fill: true, tension: 0.3,
          pointRadius: 0, borderWidth: 2 },
        { label: 'Invested', data: invested, borderColor: style.accent,
          borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, fill: false },
      ],
    },
    options: chartOpts(style),
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
    ink: (cs.getPropertyValue('--ink') || '#1a1814').trim() || '#1a1814',
    accent: (cs.getPropertyValue('--accent') || '#7a1f2b').trim() || '#7a1f2b',
    inkDim: (cs.getPropertyValue('--ink-dim') || '#6a6459').trim() || '#6a6459',
    ruleHair: 'rgba(26,24,20,0.12)',
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
