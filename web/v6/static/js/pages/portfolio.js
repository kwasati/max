/* ==========================================================
   MAX MAHON v6 — Portfolio Page (Desktop)
   Section 04a Real Holdings + Section 04b Simulated Allocation.
   Fetches live from /api/portfolio/pnl + /api/portfolio/simulated
   — NO hardcoded stock data. No color for gains/losses; uses
   ↑/↓ chars + weight + italic.
   ========================================================== */

let _realChart = null;
let _simChart = null;
let _simState = { positions: [], cash_reserve_pct: 0, concentration_profile: '30/30/30/10' };

/** Entry point called by the shell bootstrap. */
export function mount(root) {
  root.innerHTML = _renderShell();
  _loadReal(root);
  _loadSimulated(root);
}

// ---- Shell ------------------------------------------------------------------

function _renderShell() {
  return (
    '<div class="section-num">' +
      '<span class="no">04 · Portfolio</span>' +
      '<span>Real Holdings · Simulated Allocation</span>' +
    '</div>' +
    '<h2 class="section-title">The Book.</h2>' +
    '<p style="color:var(--fg-dim);font-size:var(--fs-sm);margin-bottom:var(--sp-4)">พอร์ตจริงที่ถืออยู่ด้านบน · พอร์ตจำลองที่ตั้งใจจะถือด้านล่าง.</p>' +

    // 04a REAL
    '<div class="section-num">' +
      '<span class="no">04a · Real Holdings</span>' +
      '<span>PORT จริง</span>' +
    '</div>' +
    '<section class="portfolio-section" id="port-real">' +
      '<div class="pie-wrap">' +
        '<div class="pie-box"><canvas id="realPie"></canvas></div>' +
        '<div class="pie-total" id="real-totals">' +
          '<div class="lbl">Market Value</div>' +
          '<div class="val">—</div>' +
          '<div class="sub">loading</div>' +
        '</div>' +
      '</div>' +
      '<div id="real-right">' +
        '<div id="real-table-host"></div>' +
        '<div class="flex jb ac mt-5" style="padding-top:var(--sp-4);border-top:1px solid var(--border-subtle)">' +
          '<div class="micro" id="real-footmeta">&nbsp;</div>' +
          '<button class="btn ghost" id="real-add-btn" type="button">+ เพิ่ม Transaction</button>' +
        '</div>' +
      '</div>' +
    '</section>' +

    // DIVIDER
    '<div class="divider-block">' +
      '<div class="ornament" style="margin:0"></div>' +
      '<div class="divider-title mt-4">Simulated Allocation Below</div>' +
      '<div class="divider-sub">Target weights for future capital · not yet deployed.</div>' +
    '</div>' +

    // 04b SIMULATED
    '<div class="section-num">' +
      '<span class="no">04b · Simulated</span>' +
      '<span>PORT จำลอง · Target Weights</span>' +
    '</div>' +
    '<section class="portfolio-section" id="port-sim">' +
      '<div class="pie-wrap">' +
        '<div class="pie-box"><canvas id="simPie"></canvas></div>' +
        '<div class="pie-total" id="sim-totals">' +
          '<div class="lbl">Target Allocation</div>' +
          '<div class="val">—</div>' +
          '<div class="sub">loading</div>' +
        '</div>' +
      '</div>' +
      '<div id="sim-right">' +
        '<div id="sim-table-host"></div>' +
        '<div class="flex jb ac mt-5" style="padding-top:var(--sp-4);border-top:1px solid var(--border-subtle)">' +
          '<div class="micro" id="sim-footmeta">&nbsp;</div>' +
          '<button class="btn ghost" id="sim-add-btn" type="button">+ เพิ่มหุ้น</button>' +
        '</div>' +
      '</div>' +
    '</section>' +

    '<div class="ornament"></div>'
  );
}

// ---- Chart color palette ---------------------------------------------------
function _pieColors(n) {
  const style = getComputedStyle(document.documentElement);
  const ink    = style.getPropertyValue('--ink').trim()    || '#3b4050';
  const accent = style.getPropertyValue('--accent').trim() || '#5d8c69';
  // oxblood reserved for largest slice, grayscale for the rest
  const greys = [ink, '#5a6072', '#5a6072', '#878d9a', '#878d9a', '#b2b6c0', '#b2b6c0', '#d1cec1'];
  const out = [accent];
  for (let i = 0; i < n - 1; i++) {
    out.push(greys[i % greys.length]);
  }
  return out;
}

function _pieBorder() {
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue('--paper').trim() || '#f5f5f0';
}

// ---- P&L sign rendering (NO color — use arrows + italic) -------------------
function _renderPct(p) {
  if (p == null || isNaN(p)) return '—';
  const v = Number(p);
  const abs = Math.abs(v).toFixed(1) + '%';
  if (v > 0.05) return '<span class="pnl-up">&uarr; ' + abs + '</span>';
  if (v < -0.05) return '<span class="pnl-down">&darr; ' + abs + '</span>';
  return '<span class="pnl-flat">· ' + abs + '</span>';
}

// ============================================================================
// PHASE 1 — Real holdings
// ============================================================================

async function _loadReal(root) {
  const tableHost = root.querySelector('#real-table-host');
  window.MMComponents.renderLoading(tableHost, 'Loading positions');
  try {
    const data = await window.MMApi.get('/api/portfolio/pnl');
    _renderReal(root, data);
  } catch (e) {
    window.MMComponents.renderError(
      tableHost,
      'โหลดพอร์ตจริงไม่สำเร็จ: ' + (e && e.message || e),
      function () { _loadReal(root); }
    );
  }
  _bindRealActions(root);
}

function _renderReal(root, data) {
  const positions = (data && data.positions) || [];
  const total = (data && data.total) || {};
  const tableHost = root.querySelector('#real-table-host');
  const totalsHost = root.querySelector('#real-totals');
  const footMeta = root.querySelector('#real-footmeta');
  const E = window.MMUtils.escapeHtml;
  const F = window.MMUtils;

  // --- Empty state ---
  if (positions.length === 0) {
    tableHost.innerHTML =
      '<div class="empty-note">' +
        'ยังไม่มีตำแหน่งจริง · กด <strong>+ เพิ่ม Transaction</strong> เพื่อเริ่มต้น.' +
      '</div>';
    totalsHost.innerHTML =
      '<div class="lbl">Market Value</div>' +
      '<div class="val">฿ 0</div>' +
      '<div class="sub italic">no positions tracked</div>';
    footMeta.textContent = 'Total positions · 0 · cash reserve ' + F.fmtCurrency(total.cash_reserve || 0);
    _drawRealChart([], []);
    return;
  }

  // --- Table ---
  let rows = '';
  positions.forEach(function (p) {
    const arrow = _renderPct(p.unrealized_pct);
    const div = (p.dividends_received != null && p.dividends_received > 0)
      ? F.fmtNum(p.dividends_received, 0) : '—';
    rows += '<tr data-sym="' + E(p.symbol) + '">' +
      '<td><span class="sym">' + E(p.symbol) + '</span> <span class="dim italic">· ' + E(p.name || '') + '</span></td>' +
      '<td class="num">' + F.fmtNum(p.qty, 0) + '</td>' +
      '<td class="num">' + F.fmtNum(p.avg_cost, 2) + '</td>' +
      '<td class="num">' + (p.current_price != null ? F.fmtNum(p.current_price, 2) : '—') + '</td>' +
      '<td class="num">' + (p.market_value != null ? F.fmtNum(p.market_value, 0) : '—') + '</td>' +
      '<td class="num">' + arrow + '</td>' +
      '<td class="num">' + div + '</td>' +
      '<td class="num"><button class="row-del" data-real-del="' + E(p.symbol) + '" title="View / delete transactions for ' + E(p.symbol) + '">&times;</button></td>' +
      '</tr>';
  });

  tableHost.innerHTML =
    '<table class="data-table">' +
      '<thead><tr>' +
        '<th>Position</th>' +
        '<th class="num">Qty</th>' +
        '<th class="num">Avg Cost</th>' +
        '<th class="num">Price</th>' +
        '<th class="num">Value</th>' +
        '<th class="num">P&amp;L %</th>' +
        '<th class="num">Div Rcvd</th>' +
        '<th style="width:30px"></th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';

  // --- Totals panel ---
  const mv = total.market_value;
  const pct = total.unrealized_pct;
  const pctText = (pct == null)
    ? '—'
    : ((pct >= 0 ? '+' : '-') + Math.abs(pct).toFixed(1) + '%');
  totalsHost.innerHTML =
    '<div class="lbl">Market Value</div>' +
    '<div class="val">' + (mv != null ? F.fmtCurrency(mv, 0) : '—') + '</div>' +
    '<div class="sub">unrealized · <span class="mono" style="font-style:normal">' + pctText + '</span>' +
      ' · div received ' + F.fmtCurrency(total.dividends_received || 0, 0) + '</div>';

  // --- Footer meta ---
  footMeta.textContent =
    'Total positions · ' + positions.length +
    ' · cash reserve ' + F.fmtCurrency(total.cash_reserve || 0, 0);

  // --- Chart (sorted by market_value desc for legend order) ---
  const sorted = positions
    .filter(function (p) { return p.market_value != null && p.market_value > 0; })
    .slice()
    .sort(function (a, b) { return (b.market_value || 0) - (a.market_value || 0); });
  const labels = sorted.map(function (p) {
    const w = p.weight_pct != null ? (' ' + p.weight_pct.toFixed(1) + '%') : '';
    return p.symbol + w;
  });
  const vals = sorted.map(function (p) { return p.market_value; });
  _drawRealChart(labels, vals);

  // Bind delete buttons
  root.querySelectorAll('[data-real-del]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      _openDeleteTxModal(root, btn.getAttribute('data-real-del'));
    });
  });
}

function _drawRealChart(labels, data) {
  const canvas = document.getElementById('realPie');
  if (!canvas || typeof Chart === 'undefined') return;
  if (_realChart) { _realChart.destroy(); _realChart = null; }
  if (!data.length) return;
  _realChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: _pieColors(data.length),
        borderColor: _pieBorder(),
        borderWidth: 2,
        spacing: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: {
          position: 'right',
          labels: { font: { size: 10 }, boxWidth: 10, padding: 6 }
        }
      }
    }
  });
}

function _bindRealActions(root) {
  const addBtn = root.querySelector('#real-add-btn');
  if (addBtn && !addBtn._bound) {
    addBtn._bound = true;
    addBtn.addEventListener('click', function () { _openAddTxModal(root); });
  }
}

// ---- Add transaction modal -------------------------------------------------

function _openAddTxModal(root) {
  const today = new Date().toISOString().slice(0, 10);
  const html =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4)">' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Symbol' +
        '<input type="text" id="tx-symbol" placeholder="BBL" style="margin-top:4px;width:100%;padding:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);color:var(--fg-primary)">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Date' +
        '<input type="date" id="tx-date" value="' + today + '" style="margin-top:4px;width:100%;padding:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);color:var(--fg-primary)">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim);grid-column:1/-1">Type' +
        '<div style="margin-top:6px;display:flex;gap:var(--sp-4)">' +
          '<label style="font-family:var(--font-body);text-transform:none;letter-spacing:0;font-size:var(--fs-sm);color:var(--fg-primary)"><input type="radio" name="tx-type" value="BUY" checked> BUY</label>' +
          '<label style="font-family:var(--font-body);text-transform:none;letter-spacing:0;font-size:var(--fs-sm);color:var(--fg-primary)"><input type="radio" name="tx-type" value="SELL"> SELL</label>' +
        '</div>' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Price' +
        '<input type="number" id="tx-price" step="0.01" min="0" placeholder="150.00" style="margin-top:4px;width:100%;padding:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);color:var(--fg-primary)">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Qty' +
        '<input type="number" id="tx-qty" step="1" min="0" placeholder="100" style="margin-top:4px;width:100%;padding:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);color:var(--fg-primary)">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim);grid-column:1/-1">Note' +
        '<input type="text" id="tx-note" placeholder="(optional)" style="margin-top:4px;width:100%;padding:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);color:var(--fg-primary)">' +
      '</label>' +
    '</div>' +
    '<div style="display:flex;justify-content:flex-end;gap:var(--sp-3);margin-top:var(--sp-5)">' +
      '<button type="button" class="btn ghost" id="tx-cancel">Cancel</button>' +
      '<button type="button" class="btn primary" id="tx-save">Save Transaction</button>' +
    '</div>';
  window.MMComponents.openModal(html, {
    kicker: 'Portfolio',
    headline: 'เพิ่ม Transaction',
    dek: 'บันทึกการซื้อขายหุ้นลงพอร์ตจริง.'
  });

  document.getElementById('tx-cancel').addEventListener('click', function () {
    window.MMComponents.closeModal();
  });
  document.getElementById('tx-save').addEventListener('click', function () {
    _submitTx(root);
  });
}

async function _submitTx(root) {
  const symRaw = (document.getElementById('tx-symbol').value || '').trim().toUpperCase();
  const date = document.getElementById('tx-date').value;
  const type = (document.querySelector('input[name="tx-type"]:checked') || {}).value || 'BUY';
  const price = parseFloat(document.getElementById('tx-price').value);
  const qty = parseFloat(document.getElementById('tx-qty').value);
  const note = (document.getElementById('tx-note').value || '').trim();
  if (!symRaw) return window.MMComponents.showToast('ใส่ symbol', 'error');
  if (!date) return window.MMComponents.showToast('ใส่ date', 'error');
  if (!price || price <= 0) return window.MMComponents.showToast('price ต้อง > 0', 'error');
  if (!qty || qty <= 0) return window.MMComponents.showToast('qty ต้อง > 0', 'error');
  const body = { symbol: symRaw, date: date, type: type, price: price, qty: qty };
  if (note) body.note = note;
  try {
    await window.MMApi.post('/api/portfolio/transactions', body);
    window.MMComponents.closeModal();
    window.MMComponents.showToast('เพิ่ม ' + symRaw + ' แล้ว');
    _loadReal(root);
  } catch (e) {
    window.MMComponents.showToast('เพิ่มไม่สำเร็จ: ' + (e && e.message || e), 'error');
  }
}

// ---- Delete transaction modal ---------------------------------------------
// Lists all transactions for a symbol → user picks which tx_id to delete.

async function _openDeleteTxModal(root, symbol) {
  try {
    const resp = await window.MMApi.get('/api/portfolio/transactions?symbol=' + encodeURIComponent(symbol));
    const txs = (resp && resp.transactions) || [];
    if (!txs.length) {
      window.MMComponents.showToast('ไม่พบ transaction ของ ' + symbol, 'warn');
      return;
    }
    const E = window.MMUtils.escapeHtml;
    let rows = '';
    txs.forEach(function (t) {
      rows +=
        '<div class="flex jb ac" style="padding:10px 0;border-bottom:1px solid var(--border-subtle)">' +
          '<div>' +
            '<span class="mono" style="font-size:var(--fs-sm)">' + E(t.date) + ' · ' + E(t.type) + '</span>' +
            ' <span class="dim italic">' + E(String(t.qty)) + ' × ' + E(String(t.price)) + '</span>' +
          '</div>' +
          '<button class="btn ghost" data-txdel="' + E(t.id) + '">ลบ</button>' +
        '</div>';
    });
    window.MMComponents.openModal(
      '<div>' + rows + '</div>',
      { kicker: 'Portfolio', headline: symbol + ' — Transactions', dek: 'กดลบเพื่อถอด transaction ออกจากพอร์ต.' }
    );
    document.querySelectorAll('[data-txdel]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.getAttribute('data-txdel');
        if (!window.confirm('ยืนยันลบ transaction นี้?')) return;
        try {
          await window.MMApi.delete('/api/portfolio/transactions/' + encodeURIComponent(id));
          window.MMComponents.closeModal();
          window.MMComponents.showToast('ลบ transaction แล้ว');
          _loadReal(root);
        } catch (e) {
          window.MMComponents.showToast('ลบไม่สำเร็จ: ' + (e && e.message || e), 'error');
        }
      });
    });
  } catch (e) {
    window.MMComponents.showToast('โหลด transactions ไม่สำเร็จ', 'error');
  }
}

// ============================================================================
// PHASE 2 — Simulated allocation
// ============================================================================

async function _loadSimulated(root) {
  const tableHost = root.querySelector('#sim-table-host');
  window.MMComponents.renderLoading(tableHost, 'Loading target allocation');
  try {
    const data = await window.MMApi.get('/api/portfolio/simulated');
    _simState.positions = (data.positions || []).map(function (p) { return Object.assign({}, p); });
    _simState.cash_reserve_pct = data.cash_reserve_pct || 0;
    _simState.concentration_profile = data.concentration_profile || '30/30/30/10';
    _simState.total_weight_pct = data.total_weight_pct || 0;
    _simState.projected_yoc_pct = data.projected_yoc_pct || 0;
    _renderSimulated(root);
  } catch (e) {
    window.MMComponents.renderError(
      tableHost,
      'โหลด Simulated ไม่สำเร็จ: ' + (e && e.message || e),
      function () { _loadSimulated(root); }
    );
  }
  _bindSimActions(root);
}

function _renderSimulated(root) {
  const tableHost = root.querySelector('#sim-table-host');
  const totalsHost = root.querySelector('#sim-totals');
  const footMeta = root.querySelector('#sim-footmeta');
  const E = window.MMUtils.escapeHtml;
  const F = window.MMUtils;
  const positions = _simState.positions || [];
  const cashPct = _simState.cash_reserve_pct || 0;

  // --- Empty state ---
  if (positions.length === 0) {
    tableHost.innerHTML =
      '<div class="empty-note">' +
        'ยังไม่มี allocation จำลอง · กด <strong>+ เพิ่มหุ้น</strong> เพื่อตั้งพอร์ตเป้าหมาย.' +
      '</div>';
    totalsHost.innerHTML =
      '<div class="lbl">Target Allocation</div>' +
      '<div class="val">0.0%</div>' +
      '<div class="sub italic">projected yoc · —</div>';
    footMeta.textContent = 'Target 0 positions · ' + _simState.concentration_profile;
    _drawSimChart([], []);
    return;
  }

  // --- Table ---
  let totalW = 0;
  positions.forEach(function (p) { totalW += Number(p.weight_pct || 0); });

  let rows = '';
  positions.forEach(function (p, i) {
    const wVisual = Math.max(2, Math.min(60, Math.round((p.weight_pct || 0) * 1.5)));
    const yld = (p.target_yield_pct != null) ? p.target_yield_pct.toFixed(2) + '%' : '—';
    const price = (p.current_price != null) ? F.fmtNum(p.current_price, 2) : '—';
    const score = (p.score != null) ? String(p.score) : '—';
    let signalHtml = '';
    (p.signals || []).forEach(function (s) {
      const cls = (s === 'NIWES_5555') ? 'tag primary' : 'tag';
      signalHtml += '<span class="' + cls + '" style="font-size:0.58rem">' + E(s) + '</span>';
    });

    rows += '<tr data-sim-idx="' + i + '">' +
      '<td>' +
        '<span class="sym">' + E(p.symbol) + '</span> ' +
        '<input type="text" class="dim italic" data-sim-label="' + i + '" value="' + E(p.label || '') + '" placeholder="label..." style="background:transparent;border:none;border-bottom:1px dashed var(--border-subtle);color:var(--fg-dim);font-family:var(--font-head);font-style:italic;font-size:var(--fs-sm);width:150px;padding:2px 4px">' +
      '</td>' +
      '<td class="num">' +
        '<span class="weight-bar" style="width:' + wVisual + 'px"></span>' +
        '<input type="number" class="weight-input" data-sim-weight="' + i + '" value="' + (p.weight_pct || 0) + '" step="0.5" min="0" max="100"> %' +
      '</td>' +
      '<td class="num">' + price + '</td>' +
      '<td class="num">' + yld + '</td>' +
      '<td class="num">' + score + '</td>' +
      '<td><span class="sim-signals">' + signalHtml + '</span></td>' +
      '<td class="num"><button class="row-del" data-sim-del="' + i + '" title="ลบออกจาก allocation">&times;</button></td>' +
      '</tr>';
  });

  // Cash row
  const cashVisual = Math.max(2, Math.min(60, Math.round(cashPct * 1.5)));
  rows += '<tr data-sim-cash="1">' +
    '<td class="italic dim">Cash reserve</td>' +
    '<td class="num">' +
      '<span class="weight-bar" style="width:' + cashVisual + 'px"></span>' +
      '<input type="number" class="weight-input" id="sim-cash-pct" value="' + cashPct + '" step="0.5" min="0" max="100"> %' +
    '</td>' +
    '<td class="num dim">—</td>' +
    '<td class="num dim">—</td>' +
    '<td class="num dim">—</td>' +
    '<td></td>' +
    '<td></td>' +
    '</tr>';

  tableHost.innerHTML =
    '<table class="data-table">' +
      '<thead><tr>' +
        '<th>Position</th>' +
        '<th class="num">Weight</th>' +
        '<th class="num">Price Now</th>' +
        '<th class="num">Target Yield</th>' +
        '<th class="num">Score</th>' +
        '<th>Signal</th>' +
        '<th style="width:30px"></th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';

  // --- Totals panel ---
  const grandTotal = totalW + cashPct;
  const warnClass = Math.abs(grandTotal - 100) > 0.1 ? ' weight-sum-warn' : '';
  totalsHost.innerHTML =
    '<div class="lbl">Target Allocation</div>' +
    '<div class="val">' + grandTotal.toFixed(1) + '%</div>' +
    '<div class="sub' + warnClass + '">' +
      (Math.abs(grandTotal - 100) > 0.1 ? '⚠ sum ≠ 100%' : 'projected yoc · ') +
      (Math.abs(grandTotal - 100) > 0.1 ? '' : '<span class="mono" style="font-style:normal">' + (_simState.projected_yoc_pct || 0).toFixed(2) + '%</span>') +
    '</div>';

  // --- Footer meta ---
  footMeta.textContent =
    'Target ' + positions.length + ' positions + cash · ' + _simState.concentration_profile + ' · ตาม ดร.นิเวศน์';

  // --- Chart ---
  const labels = positions.map(function (p) { return p.symbol + ' ' + (p.weight_pct || 0).toFixed(0) + '%'; });
  const vals = positions.map(function (p) { return Number(p.weight_pct || 0); });
  if (cashPct > 0) {
    labels.push('Cash ' + cashPct.toFixed(0) + '%');
    vals.push(cashPct);
  }
  _drawSimChart(labels, vals);

  // --- Wire inline edits ---
  tableHost.querySelectorAll('[data-sim-weight]').forEach(function (inp) {
    inp.addEventListener('blur', function () {
      const i = parseInt(inp.getAttribute('data-sim-weight'), 10);
      const v = parseFloat(inp.value);
      if (isNaN(v) || v < 0) { inp.value = _simState.positions[i].weight_pct || 0; return; }
      _simState.positions[i].weight_pct = v;
      _persistSim(root);
    });
  });
  tableHost.querySelectorAll('[data-sim-label]').forEach(function (inp) {
    inp.addEventListener('blur', function () {
      const i = parseInt(inp.getAttribute('data-sim-label'), 10);
      _simState.positions[i].label = inp.value || '';
      _persistSim(root);
    });
  });
  tableHost.querySelectorAll('[data-sim-del]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const i = parseInt(btn.getAttribute('data-sim-del'), 10);
      const sym = _simState.positions[i].symbol;
      if (!window.confirm('ลบ ' + sym + ' ออกจาก allocation?')) return;
      _simState.positions.splice(i, 1);
      _persistSim(root);
    });
  });
  const cashInp = tableHost.querySelector('#sim-cash-pct');
  if (cashInp) {
    cashInp.addEventListener('blur', function () {
      const v = parseFloat(cashInp.value);
      if (isNaN(v) || v < 0) { cashInp.value = _simState.cash_reserve_pct || 0; return; }
      _simState.cash_reserve_pct = v;
      _persistSim(root);
    });
  }
}

function _drawSimChart(labels, data) {
  const canvas = document.getElementById('simPie');
  if (!canvas || typeof Chart === 'undefined') return;
  if (_simChart) { _simChart.destroy(); _simChart = null; }
  if (!data.length) return;
  _simChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: _pieColors(data.length),
        borderColor: _pieBorder(),
        borderWidth: 2,
        spacing: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: {
          position: 'right',
          labels: { font: { size: 10 }, boxWidth: 10, padding: 5 }
        }
      }
    }
  });
}

function _bindSimActions(root) {
  const addBtn = root.querySelector('#sim-add-btn');
  if (addBtn && !addBtn._bound) {
    addBtn._bound = true;
    addBtn.addEventListener('click', function () { _openAddSimModal(root); });
  }
}

// ---- Persist simulated state ----------------------------------------------

async function _persistSim(root) {
  // Validate sum
  let sumW = 0;
  _simState.positions.forEach(function (p) { sumW += Number(p.weight_pct || 0); });
  const grand = sumW + (_simState.cash_reserve_pct || 0);
  if (grand > 100.01) {
    window.MMComponents.showToast('รวม weight + cash > 100% (' + grand.toFixed(1) + '%)', 'error');
    // Re-render to revert any visual change? Just re-render state.
    _renderSimulated(root);
    return;
  }
  try {
    const body = {
      positions: _simState.positions.map(function (p) {
        return {
          symbol: p.symbol,
          label: p.label || '',
          weight_pct: Number(p.weight_pct || 0)
        };
      }),
      cash_reserve_pct: Number(_simState.cash_reserve_pct || 0)
    };
    await window.MMApi.put('/api/portfolio/simulated', body);
    window.MMComponents.showToast('Saved');
    // Re-fetch to refresh computed metrics (projected_yoc, price, score, signals)
    _loadSimulated(root);
  } catch (e) {
    window.MMComponents.showToast('บันทึกไม่สำเร็จ: ' + (e && e.message || e), 'error');
  }
}

// ---- Add simulated position modal -----------------------------------------

function _openAddSimModal(root) {
  const html =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4)">' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Symbol' +
        '<input type="text" id="sim-add-symbol" placeholder="BBL" style="margin-top:4px;width:100%;padding:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);color:var(--fg-primary)">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Weight %' +
        '<input type="number" id="sim-add-weight" step="0.5" min="0" max="100" placeholder="10" style="margin-top:4px;width:100%;padding:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);color:var(--fg-primary)">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim);grid-column:1/-1">Label' +
        '<input type="text" id="sim-add-label" placeholder="core defensive / hidden value / ..." style="margin-top:4px;width:100%;padding:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);color:var(--fg-primary)">' +
      '</label>' +
    '</div>' +
    '<div style="display:flex;justify-content:flex-end;gap:var(--sp-3);margin-top:var(--sp-5)">' +
      '<button type="button" class="btn ghost" id="sim-add-cancel">Cancel</button>' +
      '<button type="button" class="btn primary" id="sim-add-save">Add</button>' +
    '</div>';
  window.MMComponents.openModal(html, {
    kicker: 'Simulated',
    headline: 'เพิ่มหุ้นใน allocation',
    dek: 'กำหนด weight เป้าหมาย · label ช่วยจัดกลุ่ม.'
  });

  document.getElementById('sim-add-cancel').addEventListener('click', function () {
    window.MMComponents.closeModal();
  });
  document.getElementById('sim-add-save').addEventListener('click', function () {
    const sym = (document.getElementById('sim-add-symbol').value || '').trim().toUpperCase();
    const w = parseFloat(document.getElementById('sim-add-weight').value);
    const lbl = (document.getElementById('sim-add-label').value || '').trim();
    if (!sym) return window.MMComponents.showToast('ใส่ symbol', 'error');
    if (isNaN(w) || w <= 0) return window.MMComponents.showToast('weight ต้อง > 0', 'error');
    // Check sum
    let curSum = _simState.cash_reserve_pct || 0;
    _simState.positions.forEach(function (p) { curSum += Number(p.weight_pct || 0); });
    if (curSum + w > 100.01) {
      return window.MMComponents.showToast('เกิน 100% (จะกลายเป็น ' + (curSum + w).toFixed(1) + '%)', 'error');
    }
    // Duplicate check
    const dup = _simState.positions.some(function (p) { return p.symbol === sym; });
    if (dup) return window.MMComponents.showToast(sym + ' มีอยู่แล้ว', 'warn');

    _simState.positions.push({ symbol: sym, label: lbl, weight_pct: w });
    window.MMComponents.closeModal();
    _persistSim(root);
  });
}
