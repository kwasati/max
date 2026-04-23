/* ==========================================================
   MAX MAHON v6 — Portfolio Builder Page (Desktop)
   จัดพอร์ตสไตล์แมกซ์ — 5 หุ้น 5 sector Niwes 80/20 pattern.
   Fetches from POST /api/portfolio/builder.
   Uses existing vintage tokens (plan 03 will restyle).
   ========================================================== */

let _state = {
  capital: null,
  pins: [],
  excludes: [],
  loading: false,
  result: null,
  error: null,
};

/** Entry point called by the shell bootstrap. */
export function mount(root) {
  root.innerHTML = _renderShell();
  _bindForm(root);
}

function _renderShell() {
  return (
    '<div class="section-num">' +
      '<span class="no">05 · Portfolio Builder</span>' +
      '<span>จัดพอร์ตสไตล์แมกซ์ · Niwes 80/20</span>' +
    '</div>' +
    '<h2 class="section-title">Build the Port.</h2>' +
    '<p class="section-kicker">5 หุ้น 5 sector — top-1 per sector by Niwes composite · weight 40/35/12/8/5.</p>' +

    '<section class="portfolio-section" id="pb-form">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4);margin-bottom:var(--sp-4)">' +
        '<label style="display:flex;flex-direction:column;gap:var(--sp-2)">' +
          '<span class="micro">ทุน (บาท) — optional</span>' +
          '<input type="number" id="pb-capital" min="0" step="10000" placeholder="เช่น 1000000" ' +
            'style="padding:10px 12px;border:1px solid var(--rule);background:var(--paper-3);' +
            'font-family:var(--font-mono);font-size:var(--fs-md);color:var(--ink);outline:none" />' +
        '</label>' +
        '<label style="display:flex;flex-direction:column;gap:var(--sp-2)">' +
          '<span class="micro">Pin symbols (comma-separated) — e.g. TCAP.BK</span>' +
          '<input type="text" id="pb-pins" placeholder="TCAP.BK, QH.BK" ' +
            'style="padding:10px 12px;border:1px solid var(--rule);background:var(--paper-3);' +
            'font-family:var(--font-mono);font-size:var(--fs-md);color:var(--ink);outline:none" />' +
        '</label>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4);margin-bottom:var(--sp-4)">' +
        '<label style="display:flex;flex-direction:column;gap:var(--sp-2)">' +
          '<span class="micro">Exclude symbols (comma-separated)</span>' +
          '<input type="text" id="pb-excludes" placeholder="CPALL.BK" ' +
            'style="padding:10px 12px;border:1px solid var(--rule);background:var(--paper-3);' +
            'font-family:var(--font-mono);font-size:var(--fs-md);color:var(--ink);outline:none" />' +
        '</label>' +
        '<div style="display:flex;align-items:flex-end">' +
          '<button class="btn primary" id="pb-submit" type="button">จัดพอร์ต</button>' +
        '</div>' +
      '</div>' +
    '</section>' +

    '<div id="pb-result"></div>' +
    '<div class="ornament"></div>'
  );
}

function _bindForm(root) {
  const btn = root.querySelector('#pb-submit');
  if (!btn) return;
  btn.addEventListener('click', function () { _submit(root); });
  const capInput = root.querySelector('#pb-capital');
  if (capInput) {
    capInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); _submit(root); }
    });
  }
}

function _parseList(s) {
  return (s || '')
    .split(',')
    .map(function (x) { return x.trim().toUpperCase(); })
    .filter(function (x) { return x.length > 0; });
}

async function _submit(root) {
  if (_state.loading) return;
  const capRaw = (root.querySelector('#pb-capital') || {}).value || '';
  const pinsRaw = (root.querySelector('#pb-pins') || {}).value || '';
  const excRaw = (root.querySelector('#pb-excludes') || {}).value || '';
  const capital = capRaw ? Number(capRaw) : null;
  const pins = _parseList(pinsRaw);
  const excludes = _parseList(excRaw);
  _state = Object.assign({}, _state, {
    capital: capital, pins: pins, excludes: excludes,
    loading: true, error: null,
  });

  const host = root.querySelector('#pb-result');
  if (!host) {
    _state.loading = false;
    return;
  }
  if (window.MMComponents && window.MMComponents.renderLoading) {
    window.MMComponents.renderLoading(host, 'สร้างพอร์ต…');
  } else {
    host.innerHTML = '<div class="mm-shell-empty">สร้างพอร์ต…</div>';
  }

  try {
    const body = { capital: capital, pins: pins, excludes: excludes };
    const data = await window.MMApi.post('/api/portfolio/builder', body);
    _state.loading = false;
    _state.result = data;
    _renderResult(host, data);
  } catch (e) {
    _state.loading = false;
    _state.error = (e && e.message) || String(e);
    host.innerHTML =
      '<div class="mm-shell-empty">' +
        'โหลดพอร์ตไม่สำเร็จ: ' +
        (window.MMUtils ? window.MMUtils.escapeHtml(_state.error) : _state.error) +
      '</div>';
  }
}

function _esc(s) {
  return window.MMUtils && window.MMUtils.escapeHtml
    ? window.MMUtils.escapeHtml(s == null ? '' : String(s))
    : String(s == null ? '' : s);
}

function _fmtNum(n, d) {
  if (n == null || isNaN(n)) return '—';
  const dd = d == null ? 0 : d;
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: dd,
    maximumFractionDigits: dd,
  });
}

function _renderResult(host, data) {
  if (!host) return;
  const port = (data && data.portfolio) || [];
  const warnings = (data && data.warnings) || [];
  const sectorCount = (data && data.sector_count) || 0;
  const avgScore = (data && data.total_score_avg) || 0;
  const screenerDate = (data && data.screener_date) || '';

  if (port.length === 0) {
    host.innerHTML =
      '<div class="mm-shell-empty">ไม่มีหุ้นผ่านเกณฑ์ — ' +
      _esc(warnings.join(' · ') || 'no candidates') + '</div>';
    return;
  }

  let html = '';

  // Meta header
  html +=
    '<div class="flex jb ac mt-5" style="padding:var(--sp-3) 0;border-bottom:1px solid var(--rule)">' +
      '<div class="micro">Screener: ' + _esc(screenerDate) +
      ' · Sectors: ' + sectorCount +
      ' · Avg score: ' + _fmtNum(avgScore, 1) + '</div>' +
    '</div>';

  // Warnings
  if (warnings.length > 0) {
    html += '<div style="margin:var(--sp-3) 0;padding:var(--sp-3);border:1px dashed var(--rule);font-family:var(--font-mono);font-size:var(--fs-sm);color:var(--ink-soft)">';
    html += '<strong>⚠ คำเตือน:</strong><ul style="margin:var(--sp-2) 0 0 var(--sp-4)">';
    warnings.forEach(function (w) {
      html += '<li>' + _esc(w) + '</li>';
    });
    html += '</ul></div>';
  }

  // Result table
  html += '<table style="width:100%;border-collapse:collapse;margin-top:var(--sp-4);font-family:var(--font-body)">';
  html += '<thead><tr style="border-bottom:2px solid var(--ink)">';
  ['#', 'Symbol', 'Sector', 'Score', 'Weight %', 'Amount (฿)', 'Shares', 'Note']
    .forEach(function (h) {
      html += '<th style="text-align:left;padding:var(--sp-3) var(--sp-2);font-size:var(--fs-sm);font-weight:700">' +
        _esc(h) + '</th>';
    });
  html += '</tr></thead><tbody>';

  port.forEach(function (s, idx) {
    const pinned = s._pinned ? ' <span class="micro" style="color:var(--accent)">[PIN]</span>' : '';
    const reason = [];
    if ((s.signals || []).indexOf('HIDDEN_VALUE') >= 0) reason.push('Hidden');
    if (s._pinned) reason.push('Pinned');
    html += '<tr style="border-bottom:1px solid var(--rule)">';
    html += '<td style="padding:var(--sp-3) var(--sp-2)">' + (idx + 1) + '</td>';
    html += '<td style="padding:var(--sp-3) var(--sp-2);font-family:var(--font-mono);font-weight:600">' +
      _esc(s.symbol) + pinned + '</td>';
    html += '<td style="padding:var(--sp-3) var(--sp-2)"><span class="micro">' +
      _esc(s.sector || '—') + '</span></td>';
    html += '<td style="padding:var(--sp-3) var(--sp-2);font-family:var(--font-mono)">' +
      _fmtNum(s.score, 0) + '</td>';
    html += '<td style="padding:var(--sp-3) var(--sp-2);font-family:var(--font-mono)">' +
      _fmtNum(s.weight_pct, 1) + '%</td>';
    html += '<td style="padding:var(--sp-3) var(--sp-2);font-family:var(--font-mono)">' +
      (s.amount_thb != null ? _fmtNum(s.amount_thb, 2) : '—') + '</td>';
    html += '<td style="padding:var(--sp-3) var(--sp-2);font-family:var(--font-mono)">' +
      (s.shares != null ? _fmtNum(s.shares, 0) : '—') + '</td>';
    html += '<td style="padding:var(--sp-3) var(--sp-2)"><span class="micro">' +
      _esc(reason.join(' · ')) + '</span></td>';
    html += '</tr>';
  });
  html += '</tbody></table>';

  host.innerHTML = html;
}
