/* ==========================================================
   MAX MAHON v6 — Portfolio Page (Desktop)
   Section 04a Real Holdings (Simulated allocation added next
   commit / Phase 2 of Plan 06).
   Fetches live from /api/portfolio/pnl — NO hardcoded stock
   data. No color for gains/losses; uses ↑/↓ chars + italic.
   ========================================================== */

let _realChart = null;

/** Entry point called by the shell bootstrap. */
export function mount(root) {
  root.innerHTML = _renderShell();
  _loadReal(root);
}

// ---- Shell ------------------------------------------------------------------

function _renderShell() {
  return (
    '<div class="section-num">' +
      '<span class="no">04 · Portfolio</span>' +
      '<span>Real Holdings · Simulated Allocation</span>' +
    '</div>' +
    '<h2 class="section-title">The Book.</h2>' +
    '<p class="section-kicker">พอร์ตจริงที่ถืออยู่ด้านบน · พอร์ตจำลองที่ตั้งใจจะถือด้านล่าง.</p>' +

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
        '<div class="flex jb ac mt-5" style="padding-top:var(--sp-4);border-top:1px solid var(--rule)">' +
          '<div class="micro" id="real-footmeta">&nbsp;</div>' +
          '<button class="btn ghost" id="real-add-btn" type="button">+ เพิ่ม Transaction</button>' +
        '</div>' +
      '</div>' +
    '</section>' +


    '<div class="ornament"></div>'
  );
}

// ---- Chart color palette ---------------------------------------------------
function _pieColors(n) {
  const style = getComputedStyle(document.documentElement);
  const ink    = style.getPropertyValue('--ink').trim()    || '#1a1814';
  const accent = style.getPropertyValue('--accent').trim() || '#7a1a1a';
  // oxblood reserved for largest slice, grayscale for the rest
  const greys = [ink, '#3A362E', '#4F4A42', '#6A6459', '#857F74', '#A09A8E', '#B7B0A1', '#CEC8B9'];
  const out = [accent];
  for (let i = 0; i < n - 1; i++) {
    out.push(greys[i % greys.length]);
  }
  return out;
}

function _pieBorder() {
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue('--paper').trim() || '#F4EFE6';
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
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-dim)">Symbol' +
        '<input type="text" id="tx-symbol" placeholder="BBL" style="margin-top:4px;width:100%;padding:8px;border:1px solid var(--rule);background:var(--paper-3);font-family:var(--font-mono);color:var(--ink)">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-dim)">Date' +
        '<input type="date" id="tx-date" value="' + today + '" style="margin-top:4px;width:100%;padding:8px;border:1px solid var(--rule);background:var(--paper-3);font-family:var(--font-mono);color:var(--ink)">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-dim);grid-column:1/-1">Type' +
        '<div style="margin-top:6px;display:flex;gap:var(--sp-4)">' +
          '<label style="font-family:var(--font-body);text-transform:none;letter-spacing:0;font-size:var(--fs-sm);color:var(--ink)"><input type="radio" name="tx-type" value="BUY" checked> BUY</label>' +
          '<label style="font-family:var(--font-body);text-transform:none;letter-spacing:0;font-size:var(--fs-sm);color:var(--ink)"><input type="radio" name="tx-type" value="SELL"> SELL</label>' +
        '</div>' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-dim)">Price' +
        '<input type="number" id="tx-price" step="0.01" min="0" placeholder="150.00" style="margin-top:4px;width:100%;padding:8px;border:1px solid var(--rule);background:var(--paper-3);font-family:var(--font-mono);color:var(--ink)">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-dim)">Qty' +
        '<input type="number" id="tx-qty" step="1" min="0" placeholder="100" style="margin-top:4px;width:100%;padding:8px;border:1px solid var(--rule);background:var(--paper-3);font-family:var(--font-mono);color:var(--ink)">' +
      '</label>' +
      '<label style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-dim);grid-column:1/-1">Note' +
        '<input type="text" id="tx-note" placeholder="(optional)" style="margin-top:4px;width:100%;padding:8px;border:1px solid var(--rule);background:var(--paper-3);font-family:var(--font-mono);color:var(--ink)">' +
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
        '<div class="flex jb ac" style="padding:10px 0;border-bottom:1px solid var(--rule-hair)">' +
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

// Simulated allocation (Phase 2 — implemented next commit)
function _loadSimulated(_root) { /* phase-2 */ }
function _bindSimActions(_root) { /* phase-2 */ }
