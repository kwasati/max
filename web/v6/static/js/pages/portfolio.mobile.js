/* ==========================================================
   MAX MAHON v6 — Portfolio Page (Mobile)
   Stacks sections 04a Real + 04b Simulated vertically.
   Tables → card list; donuts smaller (240px); modals slide
   up from bottom. Fetches same APIs as desktop.
   ========================================================== */

let _realChart = null;
let _simChart = null;
let _simState = { positions: [], cash_reserve_pct: 0, concentration_profile: '30/30/30/10' };

/** Entry point called by the mobile shell bootstrap. */
export function mount(root) {
  root.innerHTML = _renderShell();
  _loadReal(root);
  _loadSimulated(root);
}

// ---- Shell ------------------------------------------------------------------

function _renderShell() {
  return (
    // 04a REAL
    '<div class="section-num">' +
      '<span class="no">04a · Real Holdings</span>' +
      '<span>PORT จริง</span>' +
    '</div>' +
    '<div class="port-m-pie-box"><canvas id="realPie"></canvas></div>' +
    '<div class="port-m-pie-total" id="real-totals">' +
      '<div class="lbl">Market Value</div>' +
      '<div class="val">—</div>' +
      '<div class="sub">loading</div>' +
    '</div>' +
    '<div id="real-list" style="margin-top:20px"></div>' +
    '<div class="foot-cta">' +
      '<button class="btn ghost" id="real-add-btn" type="button">+ เพิ่ม Transaction</button>' +
    '</div>' +

    // DIVIDER
    '<div class="divider-block">' +
      '<div class="ornament" style="margin:0"></div>' +
      '<div style="font-family:var(--font-head);font-weight:900;font-size:1.2rem;margin-top:10px">Simulated Below</div>' +
      '<div style="font-family:var(--font-head);font-style:italic;color:var(--fg-secondary);font-size:0.85rem;margin-top:3px">Target weights · not yet deployed</div>' +
    '</div>' +

    // 04b SIMULATED
    '<div class="section-num">' +
      '<span class="no">04b · Simulated</span>' +
      '<span>PORT จำลอง</span>' +
    '</div>' +
    '<div class="port-m-pie-box"><canvas id="simPie"></canvas></div>' +
    '<div class="port-m-pie-total" id="sim-totals">' +
      '<div class="lbl">Target Allocation</div>' +
      '<div class="val">—</div>' +
      '<div class="sub">loading</div>' +
    '</div>' +
    '<div id="sim-list" style="margin-top:20px"></div>' +
    '<div class="foot-cta" id="sim-footmeta-wrap">' +
      '<div class="micro" id="sim-footmeta" style="margin-bottom:12px">&nbsp;</div>' +
      '<button class="btn ghost" id="sim-add-btn" type="button">+ เพิ่มหุ้น</button>' +
    '</div>'
  );
}

// ---- Shared chart helpers --------------------------------------------------
function _pieColors(n) {
  const style = getComputedStyle(document.documentElement);
  const ink    = style.getPropertyValue('--ink').trim()    || '#3b4050';
  const accent = style.getPropertyValue('--accent').trim() || '#5d8c69';
  const greys = [ink, '#5a6072', '#5a6072', '#878d9a', '#878d9a', '#b2b6c0', '#b2b6c0', '#d1cec1'];
  const out = [accent];
  for (let i = 0; i < n - 1; i++) out.push(greys[i % greys.length]);
  return out;
}
function _pieBorder() {
  return getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#f5f5f0';
}

function _renderPct(p) {
  if (p == null || isNaN(p)) return '—';
  const v = Number(p);
  const abs = Math.abs(v).toFixed(1) + '%';
  if (v > 0.05)  return '<span class="pnl-up">&uarr; ' + abs + '</span>';
  if (v < -0.05) return '<span class="pnl-down">&darr; ' + abs + '</span>';
  return '<span class="pnl-flat">· ' + abs + '</span>';
}

// ============================================================================
// Real holdings
// ============================================================================

async function _loadReal(root) {
  const listHost = root.querySelector('#real-list');
  window.MMComponents.renderLoading(listHost, 'Loading positions');
  try {
    const data = await window.MMApi.get('/api/portfolio/pnl');
    _renderReal(root, data);
  } catch (e) {
    window.MMComponents.renderError(
      listHost,
      'โหลดพอร์ตไม่สำเร็จ: ' + (e && e.message || e),
      function () { _loadReal(root); }
    );
  }
  _bindRealActions(root);
}

function _renderReal(root, data) {
  const positions = (data && data.positions) || [];
  const total = (data && data.total) || {};
  const listHost = root.querySelector('#real-list');
  const totalsHost = root.querySelector('#real-totals');
  const E = window.MMUtils.escapeHtml;
  const F = window.MMUtils;

  if (positions.length === 0) {
    listHost.innerHTML =
      '<div class="empty-note">ยังไม่มีตำแหน่งจริง · กด <strong>+ เพิ่ม Transaction</strong> เพื่อเริ่มต้น.</div>';
    totalsHost.innerHTML =
      '<div class="lbl">Market Value</div>' +
      '<div class="val">฿ 0</div>' +
      '<div class="sub italic">no positions tracked</div>';
    _drawRealChart([], []);
    return;
  }

  let cards = '';
  positions.forEach(function (p) {
    const arrow = _renderPct(p.unrealized_pct);
    const mv = (p.market_value != null) ? '฿' + F.fmtNum(p.market_value, 0) : '—';
    const div = (p.dividends_received != null && p.dividends_received > 0)
      ? ' · div ' + F.fmtCompact(p.dividends_received) : '';
    const qty = F.fmtNum(p.qty, 0);
    const price = (p.current_price != null) ? F.fmtNum(p.current_price, 2) : '—';
    cards += '<div class="stock-row" data-sym="' + E(p.symbol) + '">' +
      '<div class="left">' +
        '<div class="sym">' + E(p.symbol) + '</div>' +
        '<div class="meta">' + qty + ' × ' + price + ' · cost ' + F.fmtNum(p.avg_cost, 2) + '</div>' +
      '</div>' +
      '<div class="right">' +
        '<div class="val">' + mv + '</div>' +
        '<div class="pl">' + arrow + div + '</div>' +
      '</div>' +
      '</div>';
  });
  listHost.innerHTML = cards;

  const mv = total.market_value;
  const pct = total.unrealized_pct;
  const pctText = (pct == null) ? '—' : ((pct >= 0 ? '+' : '-') + Math.abs(pct).toFixed(1) + '%');
  const divRcvd = total.dividends_received || 0;
  totalsHost.innerHTML =
    '<div class="lbl">Market Value</div>' +
    '<div class="val">' + (mv != null ? F.fmtCurrency(mv, 0) : '—') + '</div>' +
    '<div class="sub">' + pctText + (divRcvd > 0 ? ' · div received ' + F.fmtCurrency(divRcvd, 0) : '') + '</div>';

  const sorted = positions
    .filter(function (p) { return p.market_value != null && p.market_value > 0; })
    .slice()
    .sort(function (a, b) { return (b.market_value || 0) - (a.market_value || 0); });
  const labels = sorted.map(function (p) { return p.symbol; });
  const vals = sorted.map(function (p) { return p.market_value; });
  _drawRealChart(labels, vals);
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
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 9 }, boxWidth: 8, padding: 4 } }
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

// ---- Add-transaction modal (mobile — same content, bottom-sheet via CSS) ----

function _openAddTxModal(root) {
  const today = new Date().toISOString().slice(0, 10);
  const html =
    '<div style="display:flex;flex-direction:column;gap:var(--sp-4)">' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Symbol' +
        '<input type="text" id="tx-symbol" placeholder="BBL" inputmode="text" autocapitalize="characters" style="margin-top:4px;width:100%;padding:12px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);font-size:16px;color:var(--fg-primary);min-height:44px">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Date' +
        '<input type="date" id="tx-date" value="' + today + '" style="margin-top:4px;width:100%;padding:12px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);font-size:16px;color:var(--fg-primary);min-height:44px">' +
      '</label>' +
      '<div>' +
        '<div style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Type</div>' +
        '<div style="margin-top:6px;display:flex;gap:var(--sp-5)">' +
          '<label style="font-family:var(--font-body);font-size:16px;color:var(--fg-primary);min-height:44px;display:inline-flex;align-items:center"><input type="radio" name="tx-type" value="BUY" checked style="margin-right:6px"> BUY</label>' +
          '<label style="font-family:var(--font-body);font-size:16px;color:var(--fg-primary);min-height:44px;display:inline-flex;align-items:center"><input type="radio" name="tx-type" value="SELL" style="margin-right:6px"> SELL</label>' +
        '</div>' +
      '</div>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Price' +
        '<input type="number" id="tx-price" step="0.01" min="0" inputmode="decimal" placeholder="150.00" style="margin-top:4px;width:100%;padding:12px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);font-size:16px;color:var(--fg-primary);min-height:44px">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Qty' +
        '<input type="number" id="tx-qty" step="1" min="0" inputmode="numeric" placeholder="100" style="margin-top:4px;width:100%;padding:12px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);font-size:16px;color:var(--fg-primary);min-height:44px">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Note' +
        '<input type="text" id="tx-note" placeholder="(optional)" style="margin-top:4px;width:100%;padding:12px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);font-size:16px;color:var(--fg-primary);min-height:44px">' +
      '</label>' +
    '</div>' +
    '<div style="display:flex;gap:var(--sp-3);margin-top:var(--sp-5)">' +
      '<button type="button" class="btn ghost" id="tx-cancel" style="flex:1;min-height:44px">Cancel</button>' +
      '<button type="button" class="btn primary" id="tx-save" style="flex:1;min-height:44px">Save</button>' +
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

// ============================================================================
// Simulated allocation
// ============================================================================

async function _loadSimulated(root) {
  const listHost = root.querySelector('#sim-list');
  window.MMComponents.renderLoading(listHost, 'Loading allocation');
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
      listHost,
      'โหลด Simulated ไม่สำเร็จ: ' + (e && e.message || e),
      function () { _loadSimulated(root); }
    );
  }
  _bindSimActions(root);
}

function _renderSimulated(root) {
  const listHost = root.querySelector('#sim-list');
  const totalsHost = root.querySelector('#sim-totals');
  const footMeta = root.querySelector('#sim-footmeta');
  const E = window.MMUtils.escapeHtml;
  const positions = _simState.positions || [];
  const cashPct = _simState.cash_reserve_pct || 0;

  if (positions.length === 0) {
    listHost.innerHTML =
      '<div class="empty-note">ยังไม่มี allocation จำลอง · กด <strong>+ เพิ่มหุ้น</strong> เพื่อตั้งพอร์ตเป้าหมาย.</div>';
    totalsHost.innerHTML =
      '<div class="lbl">Target Allocation</div>' +
      '<div class="val">0.0%</div>' +
      '<div class="sub italic">projected yoc · —</div>';
    footMeta.textContent = 'Target 0 positions · ' + _simState.concentration_profile;
    _drawSimChart([], []);
    return;
  }

  let totalW = 0;
  positions.forEach(function (p) { totalW += Number(p.weight_pct || 0); });

  let cards = '';
  positions.forEach(function (p, i) {
    const wVisual = Math.max(2, Math.min(60, Math.round((p.weight_pct || 0) * 1.5)));
    const yld = (p.target_yield_pct != null) ? (p.target_yield_pct.toFixed(2) + '%') : '—';
    const score = (p.score != null) ? ('Score ' + p.score) : 'Score —';
    cards += '<div class="stock-row" data-sim-idx="' + i + '">' +
      '<div class="left">' +
        '<div class="sym"><span class="weight-tiny" style="width:' + wVisual + 'px"></span>' + E(p.symbol) + '</div>' +
        '<div class="meta">' + (p.weight_pct || 0).toFixed(0) + '% · ' + E(p.label || '—') + ' · Y ' + yld + '</div>' +
      '</div>' +
      '<div class="right">' +
        '<div class="val">' + (p.weight_pct || 0).toFixed(0) + '%</div>' +
        '<div class="pl">' + E(score) + '</div>' +
      '</div>' +
      '<button class="row-del" data-sim-del="' + i + '" title="ลบ" style="position:absolute;right:-4px;top:4px;display:none">&times;</button>' +
      '</div>';
  });
  // Cash row
  const cashVisual = Math.max(2, Math.min(60, Math.round(cashPct * 1.5)));
  cards += '<div class="stock-row" data-sim-cash="1">' +
    '<div class="left">' +
      '<div class="sym italic dim"><span class="weight-tiny" style="width:' + cashVisual + 'px"></span>Cash</div>' +
      '<div class="meta">' + cashPct.toFixed(0) + '% · reserve</div>' +
    '</div>' +
    '<div class="right">' +
      '<div class="val">' + cashPct.toFixed(0) + '%</div>' +
      '<div class="pl">—</div>' +
    '</div>' +
    '</div>';
  listHost.innerHTML = cards;

  const grandTotal = totalW + cashPct;
  const warn = Math.abs(grandTotal - 100) > 0.1;
  totalsHost.innerHTML =
    '<div class="lbl">Target Allocation</div>' +
    '<div class="val">' + grandTotal.toFixed(1) + '%</div>' +
    '<div class="sub' + (warn ? ' weight-sum-warn' : '') + '">' +
      (warn ? '⚠ sum ≠ 100%' : 'projected yoc · ' + (_simState.projected_yoc_pct || 0).toFixed(2) + '%') +
    '</div>';
  footMeta.textContent = 'Target ' + positions.length + ' positions · ' + _simState.concentration_profile;

  // Chart
  const labels = positions.map(function (p) { return p.symbol + ' ' + (p.weight_pct || 0).toFixed(0); });
  const vals = positions.map(function (p) { return Number(p.weight_pct || 0); });
  if (cashPct > 0) {
    labels.push('Cash ' + cashPct.toFixed(0));
    vals.push(cashPct);
  }
  _drawSimChart(labels, vals);

  // Tap-to-edit: long-press on a row to reveal delete; short-tap opens edit sheet.
  listHost.querySelectorAll('[data-sim-idx]').forEach(function (row) {
    const idx = parseInt(row.getAttribute('data-sim-idx'), 10);
    row.style.position = 'relative';
    row.addEventListener('click', function () { _openEditSimModal(root, idx); });
  });
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
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 8 }, boxWidth: 8, padding: 3 } }
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

async function _persistSim(root) {
  let sumW = 0;
  _simState.positions.forEach(function (p) { sumW += Number(p.weight_pct || 0); });
  const grand = sumW + (_simState.cash_reserve_pct || 0);
  if (grand > 100.01) {
    window.MMComponents.showToast('รวม > 100% (' + grand.toFixed(1) + '%)', 'error');
    _renderSimulated(root);
    return;
  }
  try {
    const body = {
      positions: _simState.positions.map(function (p) {
        return { symbol: p.symbol, label: p.label || '', weight_pct: Number(p.weight_pct || 0) };
      }),
      cash_reserve_pct: Number(_simState.cash_reserve_pct || 0)
    };
    await window.MMApi.put('/api/portfolio/simulated', body);
    window.MMComponents.showToast('Saved');
    _loadSimulated(root);
  } catch (e) {
    window.MMComponents.showToast('บันทึกไม่สำเร็จ: ' + (e && e.message || e), 'error');
  }
}

// ---- Edit / add simulated modal --------------------------------------------

function _openEditSimModal(root, idx) {
  const p = _simState.positions[idx];
  if (!p) return;
  const E = window.MMUtils.escapeHtml;
  const html =
    '<div style="display:flex;flex-direction:column;gap:var(--sp-4)">' +
      '<div>' +
        '<div style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Symbol</div>' +
        '<div style="margin-top:4px;font-family:var(--font-head);font-weight:700;font-size:1.2rem">' + E(p.symbol) + '</div>' +
      '</div>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Weight %' +
        '<input type="number" id="sim-edit-weight" step="0.5" min="0" max="100" inputmode="decimal" value="' + (p.weight_pct || 0) + '" style="margin-top:4px;width:100%;padding:12px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);font-size:16px;color:var(--fg-primary);min-height:44px">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Label' +
        '<input type="text" id="sim-edit-label" value="' + E(p.label || '') + '" placeholder="core defensive / hidden value / ..." style="margin-top:4px;width:100%;padding:12px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);font-size:16px;color:var(--fg-primary);min-height:44px">' +
      '</label>' +
    '</div>' +
    '<div style="display:flex;gap:var(--sp-3);margin-top:var(--sp-5)">' +
      '<button type="button" class="btn ghost" id="sim-edit-del" style="flex:1;min-height:44px;color:var(--c-positive)">ลบ</button>' +
      '<button type="button" class="btn ghost" id="sim-edit-cancel" style="flex:1;min-height:44px">Cancel</button>' +
      '<button type="button" class="btn primary" id="sim-edit-save" style="flex:1;min-height:44px">Save</button>' +
    '</div>';
  window.MMComponents.openModal(html, {
    kicker: 'Simulated',
    headline: 'แก้ไข ' + p.symbol,
    dek: 'ปรับ weight หรือลบออกจาก allocation.'
  });

  document.getElementById('sim-edit-cancel').addEventListener('click', function () {
    window.MMComponents.closeModal();
  });
  document.getElementById('sim-edit-save').addEventListener('click', function () {
    const w = parseFloat(document.getElementById('sim-edit-weight').value);
    const lbl = (document.getElementById('sim-edit-label').value || '').trim();
    if (isNaN(w) || w < 0) return window.MMComponents.showToast('weight ต้อง >= 0', 'error');
    _simState.positions[idx].weight_pct = w;
    _simState.positions[idx].label = lbl;
    window.MMComponents.closeModal();
    _persistSim(root);
  });
  document.getElementById('sim-edit-del').addEventListener('click', function () {
    if (!window.confirm('ลบ ' + p.symbol + ' ออกจาก allocation?')) return;
    _simState.positions.splice(idx, 1);
    window.MMComponents.closeModal();
    _persistSim(root);
  });
}

function _openAddSimModal(root) {
  const html =
    '<div style="display:flex;flex-direction:column;gap:var(--sp-4)">' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Symbol' +
        '<input type="text" id="sim-add-symbol" placeholder="BBL" inputmode="text" autocapitalize="characters" style="margin-top:4px;width:100%;padding:12px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);font-size:16px;color:var(--fg-primary);min-height:44px">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Weight %' +
        '<input type="number" id="sim-add-weight" step="0.5" min="0" max="100" inputmode="decimal" placeholder="10" style="margin-top:4px;width:100%;padding:12px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);font-size:16px;color:var(--fg-primary);min-height:44px">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-dim)">Label' +
        '<input type="text" id="sim-add-label" placeholder="core defensive / hidden value / ..." style="margin-top:4px;width:100%;padding:12px;border:1px solid var(--border-subtle);background:var(--bg-surface);font-family:var(--font-mono);font-size:16px;color:var(--fg-primary);min-height:44px">' +
      '</label>' +
    '</div>' +
    '<div style="display:flex;gap:var(--sp-3);margin-top:var(--sp-5)">' +
      '<button type="button" class="btn ghost" id="sim-add-cancel" style="flex:1;min-height:44px">Cancel</button>' +
      '<button type="button" class="btn primary" id="sim-add-save" style="flex:1;min-height:44px">Add</button>' +
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
    if (isNaN(w) || w <= 0) return window.MMComponents.showToast('weight > 0', 'error');
    let curSum = _simState.cash_reserve_pct || 0;
    _simState.positions.forEach(function (p) { curSum += Number(p.weight_pct || 0); });
    if (curSum + w > 100.01) {
      return window.MMComponents.showToast('เกิน 100% (' + (curSum + w).toFixed(1) + '%)', 'error');
    }
    const dup = _simState.positions.some(function (p) { return p.symbol === sym; });
    if (dup) return window.MMComponents.showToast(sym + ' มีอยู่แล้ว', 'warn');
    _simState.positions.push({ symbol: sym, label: lbl, weight_pct: w });
    window.MMComponents.closeModal();
    _persistSim(root);
  });
}
