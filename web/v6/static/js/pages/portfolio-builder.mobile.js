/* ==========================================================
   MAX MAHON v6 — Portfolio Builder Page (Mobile)
   จัดพอร์ตสไตล์แมกซ์ — 5 หุ้น 5 sector Niwes 80/20 pattern.
   Mobile-first: stacked cards instead of table.
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
      '<span>จัดพอร์ต · Niwes 80/20</span>' +
    '</div>' +
    '<h2 class="section-title">Build the Port.</h2>' +
    '<p class="section-kicker">5 หุ้น 5 sector — weight 40/35/12/8/5.</p>' +

    '<section id="pb-form" style="display:flex;flex-direction:column;gap:var(--sp-3);margin-bottom:var(--sp-4)">' +
      '<label style="display:flex;flex-direction:column;gap:var(--sp-2)">' +
        '<span class="micro">ทุน (บาท) — optional</span>' +
        '<input type="number" id="pb-capital" min="0" step="10000" placeholder="เช่น 1000000" inputmode="numeric" ' +
          'style="padding:12px;border:1px solid var(--rule);background:var(--paper-3);' +
          'font-family:var(--font-mono);font-size:var(--fs-md);color:var(--ink);outline:none;width:100%" />' +
      '</label>' +
      '<label style="display:flex;flex-direction:column;gap:var(--sp-2)">' +
        '<span class="micro">Pin symbols — comma separated</span>' +
        '<input type="text" id="pb-pins" placeholder="TCAP.BK, QH.BK" ' +
          'style="padding:12px;border:1px solid var(--rule);background:var(--paper-3);' +
          'font-family:var(--font-mono);font-size:var(--fs-md);color:var(--ink);outline:none;width:100%" />' +
      '</label>' +
      '<label style="display:flex;flex-direction:column;gap:var(--sp-2)">' +
        '<span class="micro">Exclude symbols — comma separated</span>' +
        '<input type="text" id="pb-excludes" placeholder="CPALL.BK" ' +
          'style="padding:12px;border:1px solid var(--rule);background:var(--paper-3);' +
          'font-family:var(--font-mono);font-size:var(--fs-md);color:var(--ink);outline:none;width:100%" />' +
      '</label>' +
      '<button class="btn primary" id="pb-submit" type="button" style="width:100%">จัดพอร์ต</button>' +
    '</section>' +

    '<div id="pb-result"></div>' +
    '<div class="ornament"></div>'
  );
}

function _bindForm(root) {
  const btn = root.querySelector('#pb-submit');
  if (!btn) return;
  btn.addEventListener('click', function () { _submit(root); });
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

  html +=
    '<div class="micro" style="padding:var(--sp-3) 0;border-bottom:1px solid var(--rule)">' +
      'Screener: ' + _esc(screenerDate) +
      ' · Sectors: ' + sectorCount +
      ' · Avg: ' + _fmtNum(avgScore, 1) +
    '</div>';

  if (warnings.length > 0) {
    html += '<div style="margin:var(--sp-3) 0;padding:var(--sp-3);border:1px dashed var(--rule);font-family:var(--font-mono);font-size:var(--fs-sm);color:var(--ink-soft)">';
    html += '<strong>⚠ คำเตือน</strong><ul style="margin:var(--sp-2) 0 0 var(--sp-4)">';
    warnings.forEach(function (w) {
      html += '<li>' + _esc(w) + '</li>';
    });
    html += '</ul></div>';
  }

  // Stacked cards
  html += '<div style="display:flex;flex-direction:column;gap:var(--sp-3);margin-top:var(--sp-3)">';
  port.forEach(function (s, idx) {
    const pinned = s._pinned ? ' <span class="micro" style="color:var(--accent)">[PIN]</span>' : '';
    html +=
      '<article style="border:1px solid var(--rule);padding:var(--sp-3);background:var(--paper)">' +
        '<div class="flex jb ac">' +
          '<div style="font-family:var(--font-display);font-size:var(--fs-lg);font-weight:700">' +
            (idx + 1) + '. ' + _esc(s.symbol) + pinned +
          '</div>' +
          '<div class="micro">' + _fmtNum(s.weight_pct, 1) + '%</div>' +
        '</div>' +
        '<div class="micro" style="margin-top:var(--sp-2)">' +
          _esc(s.sector || '—') +
          ' · Score ' + _fmtNum(s.score, 0) +
        '</div>' +
        '<div style="margin-top:var(--sp-2);font-family:var(--font-mono);font-size:var(--fs-sm)">' +
          (s.amount_thb != null
            ? '฿ ' + _fmtNum(s.amount_thb, 2) + ' · ' + _fmtNum(s.shares, 0) + ' หุ้น'
            : 'ยังไม่ระบุทุน') +
        '</div>' +
      '</article>';
  });
  html += '</div>';

  host.innerHTML = html;
}
