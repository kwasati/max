/* ==========================================================
   MAX MAHON v6 — Portfolio Builder (Mobile)
   จัดพอร์ตสไตล์แมกซ์ — 5 หุ้น 5 sector Niwes 80/20 pattern.
   Mobile-first stacked cards. Restyled with Robinhood muted sage
   tokens (components.css .mm-pb-*).
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

    '<div class="mm-pb-headline">' +
      '<h2>Build the Port.</h2>' +
      '<p>5 หุ้น · 5 sector · 40/35/12/8/5</p>' +
    '</div>' +

    '<section id="pb-form" style="display:flex;flex-direction:column;gap:var(--sp-3);margin-top:var(--sp-3)">' +
      '<label class="mm-pb-form-row">' +
        '<span class="micro">ทุน (บาท) — optional</span>' +
        '<input class="mm-pb-input" type="number" id="pb-capital" min="0" step="10000" placeholder="เช่น 1000000" inputmode="numeric" />' +
      '</label>' +
      '<label class="mm-pb-form-row">' +
        '<span class="micro">Pin symbols — comma separated</span>' +
        '<input class="mm-pb-input" type="text" id="pb-pins" placeholder="TCAP.BK, QH.BK" />' +
      '</label>' +
      '<label class="mm-pb-form-row">' +
        '<span class="micro">Exclude symbols — comma separated</span>' +
        '<input class="mm-pb-input" type="text" id="pb-excludes" placeholder="CPALL.BK" />' +
      '</label>' +
      '<button class="mm-pb-run" id="pb-submit" type="button" style="width:100%;justify-content:center">จัดพอร์ต</button>' +
    '</section>' +

    '<div id="pb-result"></div>' +
    '<div class="ornament"></div>'
  );
}

function _bindForm(root) {
  const btn = root.querySelector('#pb-submit');
  if (!btn) return;
  btn.addEventListener('click', function () { _submit(root); });
  ['#pb-capital', '#pb-pins', '#pb-excludes'].forEach(function (sel) {
    const el = root.querySelector(sel);
    if (el) {
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); _submit(root); }
      });
    }
  });
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
    host.innerHTML = '<div class="mm-pb-empty">สร้างพอร์ต…</div>';
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
      '<div class="mm-pb-empty">' +
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
  const screenerDate = (data && data.screener_date) || '';
  const capital = _state.capital || 0;

  if (port.length === 0) {
    host.innerHTML =
      '<div class="mm-pb-empty">ไม่มีหุ้นผ่านเกณฑ์ — ' +
      _esc(warnings.join(' · ') || 'no candidates') + '</div>';
    return;
  }

  // Weighted yield
  let weightedYield = 0;
  let totalWeight = 0;
  port.forEach(function (s) {
    const dy = Number(s.dividend_yield || 0);
    const w = Number(s.weight_pct || 0);
    weightedYield += dy * w;
    totalWeight += w;
  });
  const yieldPct = totalWeight > 0 ? weightedYield / totalWeight : 0;

  let html = '';

  // CAPITAL CARD
  html += '<div class="mm-pb-capital">';
  html +=   '<div class="lbl">เงินลงทุน</div>';
  html +=   '<div class="amt">' +
    (capital > 0 ? _fmtNum(capital, 0) : '—') +
    '<span class="thb">THB</span></div>';
  html +=   '<div class="meta">';
  if (yieldPct > 0) {
    html += '<span class="up">▲ yield ' + _fmtNum(yieldPct, 2) + '%</span>';
  }
  html +=     '<span>· ' + sectorCount + ' sector</span>';
  html +=   '</div>';
  html += '</div>';

  // WARNINGS
  warnings.forEach(function (w) {
    html += '<div class="mm-pb-warn">⚠ ' + _esc(w) + '</div>';
  });

  // SUMMARY STRIP
  html += '<div class="mm-pb-summary">';
  html +=   '<div class="cell"><div class="v">' + port.length + '</div>' +
           '<div class="l">หุ้น</div></div>';
  html +=   '<div class="cell"><div class="v up">' + sectorCount + '/5</div>' +
           '<div class="l">sector</div></div>';
  html +=   '<div class="cell"><div class="v">' + _fmtNum(avgScore, 0) + '</div>' +
           '<div class="l">score</div></div>';
  html += '</div>';

  // SECTION HEAD
  const weightHint = port.map(function (p) { return _fmtNum(p.weight_pct, 0); }).join('·');
  html += '<div class="mm-pb-sec-h"><h3>น้ำหนักพอร์ต</h3>' +
          '<span class="hint">' + weightHint + '</span></div>';

  // POSITION CARDS
  html += '<div class="mm-pb-pos-list">';
  const maxWeight = Math.max.apply(null, port.map(function (p) {
    return Number(p.weight_pct || 0);
  }));
  port.forEach(function (s, idx) {
    const weight = Number(s.weight_pct || 0);
    const trackPct = maxWeight > 0 ? Math.min(100, (weight / maxWeight) * 100) : 0;
    const tags = [];
    if ((s.signals || []).indexOf('NIWES_5555') >= 0) tags.push('<span class="tag pass">PASS</span>');
    if ((s.signals || []).indexOf('HIDDEN_VALUE') >= 0) tags.push('<span class="tag hidden">Hidden</span>');
    if (s._pinned) tags.push('<span class="tag pin">Pin</span>');

    const scoreClass = (s.score || 0) >= 70 ? '' : 'b';
    const reasonParts = [];
    if (s.dividend_yield) reasonParts.push('yield ' + _fmtNum(s.dividend_yield, 2) + '%');
    if (s.pe_ratio) reasonParts.push('PE ' + _fmtNum(s.pe_ratio, 1));
    if (s.pb_ratio) reasonParts.push('PBV ' + _fmtNum(s.pb_ratio, 2));

    html += '<div class="mm-pb-pos">';
    html +=   '<div class="' + _rankClass(idx) + '">' + (idx + 1) + '</div>';
    html +=   '<div class="body">';
    html +=     '<div class="row1">';
    html +=       '<span class="sym">' + _esc((s.symbol || '').replace('.BK', '')) + '</span>';
    if (s.name) html += '<span class="th-name">' + _esc(s.name) + '</span>';
    html +=     '</div>';
    html +=     '<span class="sector ' + _sectorClass(s.sector) + '">' + _esc(s.sector || '—') + '</span>';
    if (tags.length) html += '<div class="tags">' + tags.join('') + '</div>';
    html +=   '</div>';
    html +=   '<div class="weight-col">';
    html +=     '<div class="weight-num' + (idx === 0 ? ' anchor' : '') + '">' +
                _fmtNum(weight, 0) + '%</div>';
    if (s.amount_thb != null) {
      html +=   '<div class="weight-amt">฿' + _fmtNum(s.amount_thb, 0) + '</div>';
    }
    html +=   '</div>';
    html +=   '<div class="w-track"><i style="width:' + trackPct.toFixed(1) + '%"></i></div>';
    html +=   '<div class="foot">';
    if (s.shares != null && s.current_price) {
      html += '<div class="shares">' + _fmtNum(s.shares, 0) + ' @ ' +
              _fmtNum(s.current_price, 2) + '</div>';
    } else if (s.current_price) {
      html += '<div class="shares">@ ' + _fmtNum(s.current_price, 2) + '</div>';
    } else {
      html += '<div class="shares"></div>';
    }
    html +=     '<div class="score"><span class="s-dot ' + scoreClass + '">' +
                _fmtNum(s.score, 0) + '</span></div>';
    html +=   '</div>';
    if (reasonParts.length) {
      html += '<div class="reason">' + _esc(reasonParts.join(' · ')) + '</div>';
    }
    html += '</div>';
  });
  html += '</div>';

  // TOTAL BAR
  if (capital > 0) {
    const totalAmount = port.reduce(function (acc, s) {
      return acc + Number(s.amount_thb || 0);
    }, 0);
    html += '<div class="mm-pb-total">' +
            '<span class="l">รวม</span>' +
            '<span class="v">฿' + _fmtNum(totalAmount, 0) + '</span>' +
            '<span class="v2">/ ' + _fmtNum(capital, 0) + '</span>' +
            '</div>';
  }

  // DIVERSIFICATION PANEL
  const palette = ['var(--c-positive)', 'var(--c-info)', 'var(--c-warn)', 'var(--c-purple)', 'var(--c-negative)'];
  html += '<div class="mm-pb-diversify">';
  html +=   '<div class="mm-pb-dv-head">';
  html +=     '<h4>กระจายเซกเตอร์</h4>';
  html +=     '<span class="badge">' + sectorCount + '/5</span>';
  html +=   '</div>';
  html +=   '<div class="mm-pb-seg-bar">';
  port.forEach(function (s, idx) {
    const w = Number(s.weight_pct || 0);
    html += '<div class="mm-pb-seg" style="width:' + w + '%;background:' +
            palette[idx % palette.length] + '"></div>';
  });
  html +=   '</div>';
  html +=   '<div class="mm-pb-dv-legend">';
  port.forEach(function (s, idx) {
    html += '<div class="mm-pb-lg-row">' +
              '<span class="mm-pb-lg-dot" style="background:' +
                palette[idx % palette.length] + '"></span>' +
              '<span class="mm-pb-lg-label">' +
                _esc((s.symbol || '').replace('.BK', '')) +
                ' <span style="color:var(--fg-dim)">· ' + _esc(s.sector || '—') + '</span>' +
              '</span>' +
              '<span class="mm-pb-lg-val">' + _fmtNum(s.weight_pct, 0) + '%</span>' +
            '</div>';
  });
  html +=   '</div>';
  html += '</div>';

  if (screenerDate) {
    html += '<div style="padding:var(--sp-3) 0;text-align:center;font-family:var(--font-mono);' +
            'font-size:var(--fs-xs);color:var(--fg-dim)">Screener: ' +
            _esc(screenerDate) + '</div>';
  }

  host.innerHTML = html;
}
