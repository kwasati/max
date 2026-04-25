/* ==========================================================
   MAX MAHON v6 — Portfolio Builder (Desktop)
   Restyled to match mockup/portfolio-builder-robinhood-desktop.html
   — 2-column layout (380px left + fluid right)
   — Capital input + chip rows show by default (no submit required)
   — Result section shows empty state first, populates after API call
   ========================================================== */

let _state = {
  capital: 1000000,
  pins: [],
  excludes: [],
  loading: false,
  result: null,
  error: null,
};

export function mount(root) {
  root.innerHTML = _renderShell();
  _bindForm(root);
  // initial empty state in result host
  _renderEmptyResult(root.querySelector('#pb-result'));
}

function _renderShell() {
  return (
    '<section class="headline" style="padding:var(--sp-6) 0 var(--sp-5)">' +
      '<h1 style="font-family:var(--font-head);font-weight:800;font-size:var(--fs-2xl);line-height:1.15;letter-spacing:-0.015em;margin:0 0 var(--sp-3);color:var(--fg-primary)">จัดพอร์ตสไตล์แมกซ์</h1>' +
      '<p style="color:var(--fg-dim);font-size:var(--fs-md);margin:0">5 หุ้น · 5 sector · น้ำหนัก 80/20 · ตามแนว ดร.นิเวศน์</p>' +
    '</section>' +

    '<div class="mm-pb-cols">' +
      '<aside class="mm-pb-left-col">' +
        _renderCapitalCard() +
        _renderChipSection('ปักหมุด', 'pb-pins-row', 'pin') +
        _renderChipSection('ถอดออก', 'pb-excludes-row', 'exc') +
        '<button class="mm-pb-run" id="pb-submit" type="button">จัดพอร์ต</button>' +
        '<div class="mm-pb-algo-foot">' +
          '<h5>Niwes Composite</h5>' +
          '<p>คัดด้วย <code>yield + value + hidden + quality</code> · weighting ' +
          '<code>40/35/12/8/5</code> · group top-1 ต่อ sector แล้วถ่วงน้ำหนักตามลำดับ</p>' +
        '</div>' +
      '</aside>' +

      '<main class="mm-pb-right-col">' +
        '<div id="pb-result"></div>' +
      '</main>' +
    '</div>'
  );
}

function _renderCapitalCard() {
  return (
    '<div class="mm-pb-capital">' +
      '<div class="lbl">เงินลงทุน (บาท)</div>' +
      '<div class="amt">' +
        '<input class="mm-pb-input" type="number" id="pb-capital" min="0" step="10000" ' +
               'value="1000000" ' +
               'style="font-size:42px;font-weight:900;letter-spacing:-0.03em;line-height:1;border:0;background:transparent;padding:0;color:var(--fg-primary);width:100%;font-family:var(--font-head)" />' +
        '<span class="thb">THB</span>' +
      '</div>' +
      '<div class="meta"><span>· จัดพอร์ตตามเงินต้นที่ระบุ · กด <strong>จัดพอร์ต</strong> เพื่อคำนวณ</span></div>' +
    '</div>'
  );
}

function _renderChipSection(title, rowId, kind) {
  const placeholder = kind === 'pin' ? '+ เพิ่ม pin' : '+ exclude';
  const color = kind === 'pin' ? 'var(--c-positive)' : 'var(--c-negative)';
  return (
    '<div class="mm-pb-chip-section">' +
      '<div class="mm-pb-chip-title">' + title +
        ' <button class="mm-pb-chip add" data-kind="' + kind + '" data-action="add-chip" ' +
                 'style="color:' + color + ';border-color:' + color + '">' + placeholder + '</button>' +
      '</div>' +
      '<div class="mm-pb-chip-row" id="' + rowId + '"></div>' +
    '</div>'
  );
}

function _bindForm(root) {
  const btn = root.querySelector('#pb-submit');
  if (btn) btn.addEventListener('click', function () { _submit(root); });
  const capInput = root.querySelector('#pb-capital');
  if (capInput) {
    capInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); _submit(root); }
    });
  }
  // Delegate add-chip click
  root.addEventListener('click', function (e) {
    const target = e.target.closest('[data-action="add-chip"]');
    if (!target) return;
    const kind = target.getAttribute('data-kind');
    const label = kind === 'pin' ? 'Pin symbol (เช่น TCAP)' : 'Exclude symbol';
    const sym = (window.prompt(label) || '').trim().toUpperCase();
    if (!sym) return;
    if (kind === 'pin') {
      if (_state.pins.indexOf(sym) < 0) _state.pins.push(sym);
      _renderChipRow(root, 'pb-pins-row', _state.pins, 'pin');
    } else {
      if (_state.excludes.indexOf(sym) < 0) _state.excludes.push(sym);
      _renderChipRow(root, 'pb-excludes-row', _state.excludes, 'exc');
    }
  });
  // Delegate chip remove
  root.addEventListener('click', function (e) {
    const x = e.target.closest('.x');
    if (!x) return;
    const chip = x.closest('.mm-pb-chip');
    if (!chip) return;
    const kind = chip.getAttribute('data-kind');
    const sym = chip.getAttribute('data-sym');
    if (kind === 'pin') {
      _state.pins = _state.pins.filter(function (s) { return s !== sym; });
      _renderChipRow(root, 'pb-pins-row', _state.pins, 'pin');
    } else if (kind === 'exc') {
      _state.excludes = _state.excludes.filter(function (s) { return s !== sym; });
      _renderChipRow(root, 'pb-excludes-row', _state.excludes, 'exc');
    }
  });
}

function _renderChipRow(root, rowId, list, kind) {
  const row = root.querySelector('#' + rowId);
  if (!row) return;
  row.innerHTML = list.map(function (s) {
    return '<span class="mm-pb-chip ' + kind + '" data-kind="' + kind + '" data-sym="' + _esc(s) + '">' +
             _esc(s) + ' <span class="x">×</span>' +
           '</span>';
  }).join('');
}

function _renderEmptyResult(host) {
  if (!host) return;
  host.innerHTML =
    '<div class="mm-pb-empty" style="padding:var(--sp-7) var(--sp-5);text-align:center;color:var(--fg-dim);' +
    'background:var(--bg-surface);border:1px dashed var(--border-subtle);border-radius:var(--r-4)">' +
      'กดจัดพอร์ตเพื่อดูผล' +
    '</div>';
}

async function _submit(root) {
  if (_state.loading) return;
  const capRaw = (root.querySelector('#pb-capital') || {}).value || '';
  const capital = capRaw ? Number(capRaw) : null;
  _state.capital = capital;
  _state.loading = true;
  _state.error = null;

  const host = root.querySelector('#pb-result');
  if (!host) { _state.loading = false; return; }
  if (window.MMComponents && window.MMComponents.renderLoading) {
    window.MMComponents.renderLoading(host, 'สร้างพอร์ต…');
  } else {
    host.innerHTML = '<div class="mm-pb-empty">สร้างพอร์ต…</div>';
  }

  try {
    const body = {
      capital: capital,
      pins: _state.pins.slice(),
      excludes: _state.excludes.slice()
    };
    const data = await window.MMApi.post('/api/portfolio/builder', body);
    _state.loading = false;
    _state.result = data;
    _renderResult(host, data);
  } catch (e) {
    _state.loading = false;
    _state.error = (e && e.message) || String(e);
    host.innerHTML =
      '<div class="mm-pb-empty" style="color:var(--c-negative)">' +
        'โหลดพอร์ตไม่สำเร็จ: ' + _esc(_state.error) +
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

function _sectorClass(sector) {
  const s = (sector || '').toLowerCase();
  if (s.indexOf('property') >= 0 || s.indexOf('real') >= 0) return 'mm-pb-sec-prop';
  if (s.indexOf('bank') >= 0 || s.indexOf('finance') >= 0) return 'mm-pb-sec-bank';
  if (s.indexOf('commerce') >= 0 || s.indexOf('retail') >= 0 || s.indexOf('consumer') >= 0) return 'mm-pb-sec-comm';
  if (s.indexOf('ict') >= 0 || s.indexOf('tech') >= 0 || s.indexOf('telecom') >= 0) return 'mm-pb-sec-ict';
  if (s.indexOf('energy') >= 0 || s.indexOf('petro') >= 0) return 'mm-pb-sec-nrg';
  return 'mm-pb-sec-other';
}

function _rankClass(idx) {
  if (idx === 0) return 'rank gold';
  if (idx === 1) return 'rank silver';
  return 'rank';
}

function _renderResult(host, data) {
  if (!host) return;
  const port = (data && data.portfolio) || [];
  const warnings = (data && data.warnings) || [];
  const sectorCount = (data && data.sector_count) || 0;
  const avgScore = (data && data.total_score_avg) || 0;
  const capital = _state.capital || 0;

  if (port.length === 0) {
    host.innerHTML =
      '<div class="mm-pb-empty">ไม่มีหุ้นผ่านเกณฑ์ — ' +
      _esc(warnings.join(' · ') || 'no candidates') + '</div>';
    return;
  }

  let html = '';

  // SUMMARY STRIP (3 cells)
  html += '<div class="mm-pb-summary">';
  html +=   '<div class="cell"><div class="v">' + port.length + '</div>' +
           '<div class="l">หุ้น</div></div>';
  html +=   '<div class="cell"><div class="v up">' + sectorCount + '/5</div>' +
           '<div class="l">sector</div></div>';
  html +=   '<div class="cell"><div class="v">' + _fmtNum(avgScore, 0) + '</div>' +
           '<div class="l">score avg.</div></div>';
  html += '</div>';

  // Warnings
  warnings.forEach(function (w) {
    html += '<div class="mm-pb-warn">⚠ ' + _esc(w) + '</div>';
  });

  // SECTION HEAD — positions
  const weightHint = port.map(function (p) { return _fmtNum(p.weight_pct, 0); }).join(' · ');
  html += '<div class="mm-pb-sec-h"><h3>น้ำหนักพอร์ต</h3>' +
          '<span class="hint">' + weightHint + '</span></div>';

  // POSITIONS LIST
  html += '<div class="mm-pb-pos-list">';
  const maxWeight = Math.max.apply(null, port.map(function (p) { return Number(p.weight_pct || 0); }));
  port.forEach(function (s, idx) {
    const weight = Number(s.weight_pct || 0);
    const trackPct = maxWeight > 0 ? Math.min(100, (weight / maxWeight) * 100) : 0;
    const tags = [];
    if ((s.signals || []).indexOf('NIWES_5555') >= 0) tags.push('<span class="tag pass">PASS</span>');
    if ((s.signals || []).indexOf('HIDDEN_VALUE') >= 0) tags.push('<span class="tag hidden">Hidden</span>');
    if (s._pinned) tags.push('<span class="tag pin">Pin</span>');
    const scoreClass = (s.score || 0) >= 70 ? 'a' : 'b';

    const reasonParts = [];
    if (s.dividend_yield) reasonParts.push('yield ' + _fmtNum(s.dividend_yield, 2) + '%');
    if (s.pe_ratio) reasonParts.push('PE ' + _fmtNum(s.pe_ratio, 1));
    if (s.pb_ratio) reasonParts.push('PBV ' + _fmtNum(s.pb_ratio, 2));
    if ((s.signals || []).indexOf('HIDDEN_VALUE') >= 0) reasonParts.push('hidden value in holdings');

    html += '<div class="mm-pb-pos">';
    html +=   '<div class="' + _rankClass(idx) + '">' + (idx + 1) + '</div>';
    html +=   '<div class="body">';
    html +=     '<div class="row1">';
    html +=       '<span class="sym">' + _esc((s.symbol || '').replace('.BK', '')) + '</span>';
    if (s.name) html += '<span class="th-name">' + _esc(s.name) + '</span>';
    html +=       '<span class="sector ' + _sectorClass(s.sector) + '">' + _esc(s.sector || '—') + '</span>';
    html +=     '</div>';
    if (tags.length) html += '<div class="tags">' + tags.join('') + '</div>';
    html +=   '</div>';
    html +=   '<div class="weight-col">';
    html +=     '<div class="weight-num' + (idx === 0 ? ' anchor' : '') + '">' + _fmtNum(weight, 0) + '%</div>';
    if (s.amount_thb != null) {
      html +=   '<div class="weight-amt">฿' + _fmtNum(s.amount_thb, 0) + '</div>';
    }
    if (s.shares != null && s.current_price) {
      html +=   '<div class="shares">' + _fmtNum(s.shares, 0) + ' หุ้น @ ' + _fmtNum(s.current_price, 2) + '</div>';
    }
    html +=     '<div class="score"><span class="s-dot ' + scoreClass + '">' + _fmtNum(s.score, 0) + '</span> Niwes</div>';
    html +=   '</div>';
    if (reasonParts.length) {
      html += '<div class="reason">' + _esc(reasonParts.join(' · ')) + '</div>';
    }
    html +=   '<div class="w-track"><i style="width:' + trackPct.toFixed(1) + '%"></i></div>';
    html += '</div>';
  });
  html += '</div>';

  // TOTAL
  if (capital > 0) {
    const totalAmount = port.reduce(function (acc, s) { return acc + Number(s.amount_thb || 0); }, 0);
    html += '<div class="mm-pb-total">' +
              '<span class="l">รวมทั้งพอร์ต</span>' +
              '<span class="v">฿' + _fmtNum(totalAmount, 0) + '</span>' +
              '<span class="v2">/ ' + _fmtNum(capital, 0) + '</span>' +
            '</div>';
  }

  // DIVERSIFICATION
  const palette = ['var(--c-positive)', 'var(--c-info)', 'var(--c-warn)', 'var(--c-purple)', 'var(--c-negative)'];
  html += '<div class="mm-pb-diversify">';
  html +=   '<div class="mm-pb-dv-head">';
  html +=     '<h4>กระจายตัวรายเซกเตอร์</h4>';
  html +=     '<span class="badge">' + sectorCount + '/5 sector</span>';
  html +=   '</div>';
  html +=   '<div class="mm-pb-seg-bar">';
  port.forEach(function (s, idx) {
    const w = Number(s.weight_pct || 0);
    html += '<div class="mm-pb-seg" style="width:' + w + '%;background:' + palette[idx % palette.length] + '"></div>';
  });
  html +=   '</div>';
  html +=   '<div class="mm-pb-dv-legend">';
  port.forEach(function (s, idx) {
    html += '<div class="mm-pb-lg-row">' +
              '<span class="mm-pb-lg-dot" style="background:' + palette[idx % palette.length] + '"></span>' +
              '<span class="mm-pb-lg-label">' + _esc(s.sector || '—') +
                ' <span style="color:var(--fg-dim)">· ' + _esc((s.symbol || '').replace('.BK', '')) + '</span></span>' +
              '<span class="mm-pb-lg-val">' + _fmtNum(s.weight_pct, 0) + '%</span>' +
            '</div>';
  });
  html +=   '</div>';
  html += '</div>';

  host.innerHTML = html;
}
