/* ==========================================================
   MAX MAHON v6 — Full Report page (desktop)
   Ports web-v6-mockup/desktop/02-report.html with 10 sections,
   all data from /api/stock/{sym} + /patterns + /history + /exit-status.
   ========================================================== */

export async function mount(container) {
  window.MMComponents.renderLoading(container, 'Loading report');

  var sym = _extractSymbol();
  if (!sym) {
    window.MMComponents.renderError(container, 'No symbol in URL.');
    return;
  }

  // Fetch parallel — swallow 404s on optional endpoints
  var stockP    = window.MMApi.get('/api/stock/' + encodeURIComponent(sym));
  var patternsP = window.MMApi.get('/api/stock/' + encodeURIComponent(sym) + '/patterns').catch(function () { return null; });
  var histP     = window.MMApi.get('/api/stock/' + encodeURIComponent(sym) + '/history').catch(function () { return null; });
  var exitP     = window.MMApi.get('/api/watchlist/' + encodeURIComponent(sym) + '/exit-status').catch(function () { return null; });
  var statusP   = window.MMApi.get('/api/status').catch(function () { return null; });

  var stock, patterns, history, exitStatus, status;
  try {
    var results = await Promise.all([stockP, patternsP, histP, exitP, statusP]);
    stock = results[0];
    patterns = results[1];
    history = results[2];
    exitStatus = results[3];
    status = results[4];
  } catch (e) {
    window.MMComponents.renderError(container, e.message, function () { mount(container); });
    return;
  }

  _updateMasthead(status);
  _ensureChartJs().then(function () {
    container.innerHTML = _buildReportHtml(stock, patterns, history, exitStatus);
    _mountCharts(stock, history);
    _wireDeepAnalyze(stock.symbol || sym);
  });
}

function _extractSymbol() {
  var parts = location.pathname.split('/').filter(Boolean);
  var idx = parts.indexOf('report');
  if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
  // Fallback: last segment (mobile path)
  return parts[parts.length - 1] || '';
}

function _updateMasthead(status) {
  var host = document.getElementById('masthead');
  if (!host) return;
  var date = status && status.last_data_date
    ? window.MMUtils.fmtDateLong(status.last_data_date).toUpperCase()
    : window.MMUtils.fmtDateLong(new Date()).toUpperCase();
  host.innerHTML = window.MMComponents.renderMasthead({ active: 'report' });
}

function _ensureChartJs() {
  if (window.Chart) return Promise.resolve();
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload = resolve;
    s.onerror = function () { reject(new Error('Chart.js failed to load')); };
    document.head.appendChild(s);
  });
}

// ---------- section renderers ----------

function _renderArticleHead(stock, patterns) {
  var esc = window.MMUtils.escapeHtml;
  var sym = esc(stock.symbol || '');
  var name = esc(stock.name || '');
  var sector = esc(stock.sector || '');
  var signals = stock.signals || [];
  var tags = '';
  var caseTag = null;
  if (signals.indexOf('NIWES_5555') !== -1) tags += '<span class="tag primary">Niwes 5-5-5-5</span>';
  if (signals.indexOf('QUALITY_DIVIDEND') !== -1) tags += '<span class="tag">Quality Dividend</span>';
  if (signals.indexOf('HIDDEN_VALUE') !== -1) tags += '<span class="tag">Hidden Value</span>';
  if (signals.indexOf('DEEP_VALUE') !== -1) tags += '<span class="tag">Deep Value</span>';
  if (patterns && (patterns.case_study_tags || []).length) {
    caseTag = patterns.case_study_tags[0];
    tags += '<span class="tag">' + esc(caseTag) + '</span>';
  }
  var subtitle = name;
  if (sector) subtitle += ' · SET · ' + sector;

  return (
    '<section class="article-head" style="padding:var(--sp-6) 0 var(--sp-5);border-bottom:3px double var(--border-subtle);text-align:center">' +
      '<div class="article-kicker" style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.2em;text-transform:uppercase;color:var(--fg-dim);margin-bottom:var(--sp-3)">' +
        'Full Report' + (caseTag ? ' · ' + esc(caseTag) : '') +
      '</div>' +
      '<h1 class="article-sym" style="font-family:var(--font-head);font-weight:900;font-size:var(--fs-3xl);letter-spacing:-0.02em;line-height:0.95;margin-bottom:var(--sp-2)">' + sym + '</h1>' +
      '<div class="article-name" style="font-family:var(--font-head);font-style:italic;font-weight:400;font-size:var(--fs-md);color:var(--fg-secondary);margin-bottom:var(--sp-4)">' + subtitle + '</div>' +
      '<div class="article-tags" style="display:flex;justify-content:center;gap:4px;flex-wrap:wrap">' + tags + '</div>' +
    '</section>' +
    _renderPriceHero(stock)
  );
}

function _renderPriceHero(stock) {
  var esc = window.MMUtils.escapeHtml;
  var metrics = stock.screener_metrics || stock.metrics || {};
  var price = metrics.current_price != null ? metrics.current_price : stock.price;
  if (price == null) return '';
  var asOf = stock.price_as_of ? window.MMUtils.fmtDateThaiShort(stock.price_as_of) : null;
  var priceStr = '฿' + window.MMUtils.fmtNum(price, 2);
  var asOfLine = asOf ? 'ราคาวันที่ ' + asOf : '';
  return (
    '<section class="report-hero" style="background:linear-gradient(135deg,var(--bg-elevated-start),var(--bg-elevated-end));border:1px solid var(--bg-elevated-border);border-radius:24px;padding:22px;margin:14px 0;box-shadow:var(--shadow-card)">' +
      '<div class="report-hero-price" style="display:flex;align-items:baseline;gap:10px">' +
        '<span style="font-family:var(--font-mono);font-size:36px;font-weight:900;color:var(--fg-primary);letter-spacing:-0.02em">' + priceStr + '</span>' +
        '<span style="color:var(--fg-dim);font-size:13px">THB</span>' +
      '</div>' +
      (asOfLine ? '<div class="report-hero-asof" style="font-family:var(--font-mono);font-size:11px;color:var(--fg-dim);margin-top:4px;letter-spacing:0.08em;text-transform:uppercase">' + esc(asOfLine) + '</div>' : '') +
    '</section>'
  );
}

function _renderTheCase(stock) {
  var esc = window.MMUtils.escapeHtml;
  var narrative = stock.narrative || {};
  var caseText = narrative.case_text;
  var byline =
    '<div class="byline" style="text-align:center;margin-bottom:var(--sp-5)">By <strong>Max Mahon</strong> · Staff Analyst · Niwes Dividend-First</div>';

  var body;
  if (caseText) {
    var paras = String(caseText).split(/\n\n+/).filter(Boolean);
    var htmlParas = paras.map(function (p, i) {
      var cls = i === 0 ? 'drop-cap' : '';
      return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(p) + '</p>';
    }).join('');
    body =
      '<div class="case-cols" id="v6-case-cols" style="column-count:2;column-gap:var(--sp-6);column-rule:1px solid var(--border-subtle);text-align:justify;hyphens:auto;font-size:1.02rem;line-height:1.7">' +
        htmlParas +
      '</div>';
  } else {
    body =
      '<div id="v6-case-cols" style="text-align:center;padding:var(--sp-6) 0;font-family:var(--font-head);font-style:italic;color:var(--fg-secondary);font-size:var(--fs-md);max-width:62ch;margin:0 auto">' +
        'The editorial case has not been generated yet. กดปุ่มข้างล่างเพื่อเรียก Max วิเคราะห์เชิงคุณภาพ — Claude Opus จะใช้เวลาประมาณ 45 วินาที.' +
      '</div>';
  }

  return (
    '<div class="section-num"><span class="no">01 · The Case</span><span>Editorial Narrative · Read First</span></div>' +
    '<section class="case-body" style="padding:var(--sp-6) 0">' + byline + body + '</section>'
  );
}

function _renderScoreBreakdown(stock) {
  var esc = window.MMUtils.escapeHtml;
  var score = stock.quality_score != null ? stock.quality_score : (stock.score || 0);
  var breakdown = stock.score_breakdown || stock.breakdown || {};
  // Schema: breakdown often has {dividend, valuation, cashflow, hidden_value, modifier}
  var div = breakdown.dividend == null ? null : breakdown.dividend;
  var val = breakdown.valuation == null ? null : breakdown.valuation;
  var cf  = breakdown.cashflow == null ? breakdown.cash_flow : breakdown.cashflow;
  var hv  = breakdown.hidden_value == null ? breakdown.hidden : breakdown.hidden_value;
  var mod = breakdown.modifier == null ? (breakdown.modifiers || 0) : breakdown.modifier;

  function _val(v) { return v == null ? 0 : v; }
  function _cell(label, max, scored, driver) {
    var cls = (scored && scored > 0) ? 'pos' : '';
    return '<tr><td class="sym">' + label + '</td><td class="num">' + max + '</td><td class="num ' + cls + '">' + (scored == null ? '—' : scored) + '</td><td class="dim">' + esc(driver || '') + '</td></tr>';
  }

  return (
    '<div class="section-num"><span class="no">02 · Score Breakdown</span><span>Of One Hundred · Per Niwes Dividend-First Schema</span></div>' +
    '<section class="score-block" style="display:grid;grid-template-columns:1fr 1.4fr;gap:var(--sp-6);padding:var(--sp-6) 0;align-items:center">' +
      '<div class="score-display" style="text-align:center">' +
        '<div class="huge" style="font-family:var(--font-mono);font-weight:300;font-size:11rem;line-height:0.8;letter-spacing:-0.05em;color:var(--fg-primary)">' + Math.round(score) + '</div>' +
        '<div class="slash" style="font-family:var(--font-head);font-style:italic;color:var(--fg-dim);font-size:var(--fs-lg);margin-top:var(--sp-3)">of one hundred</div>' +
        '<div class="scoring-version" style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.14em;text-transform:uppercase;color:var(--fg-mute);margin-top:var(--sp-4)">niwes-dividend-first · v2</div>' +
      '</div>' +
      '<div><div class="score-chart-wrap" style="position:relative;height:320px"><canvas id="v6-score-chart"></canvas></div></div>' +
    '</section>' +
    '<table class="data-table" style="margin-top:var(--sp-4)">' +
      '<thead><tr><th style="width:40%">Component</th><th class="num">Max</th><th class="num">Scored</th><th>Driver</th></tr></thead>' +
      '<tbody>' +
        _cell('Dividend Sustainability', 50, _val(div), 'Yield · Streak · Payout · Growth') +
        _cell('Valuation', 25, _val(val), 'P/E · P/BV · EV/EBITDA') +
        _cell('Cash Flow Strength', 15, _val(cf), 'FCF · OCF/NI · Int Coverage') +
        _cell('Hidden Value', 10, _val(hv), breakdown.hidden_value_note || '') +
        '<tr><td class="sym italic">Modifier</td><td class="num">—</td><td class="num pos">' + (mod > 0 ? '+' + mod : mod) + '</td><td class="dim">Valuation grade / signals</td></tr>' +
        '<tr style="border-top:2px solid var(--border-subtle)"><td class="sym">Total</td><td class="num">100</td><td class="num" style="font-size:1.2em">' + Math.round(score) + '</td><td></td></tr>' +
      '</tbody>' +
    '</table>'
  );
}

function _renderChecklist(stock) {
  var metrics = stock.screener_metrics || {};
  var fallback = stock; // top-level fields normalized
  function _get(key) {
    if (metrics[key] != null) return metrics[key];
    return fallback[key];
  }
  var yld = _get('dividend_yield');
  var pe = _get('pe') == null ? fallback.pe_ratio : _get('pe');
  var pb = _get('pb_ratio') == null ? fallback.pb_ratio : _get('pb_ratio');
  var mcap = _get('mcap') == null ? fallback.market_cap : _get('mcap');
  var streak = stock.dividend_streak_years == null ? (metrics.dividend_streak_years || metrics.div_streak) : stock.dividend_streak_years;
  var epsPos = stock.eps_positive_count == null ? metrics.eps_positive_count : stock.eps_positive_count;

  function _item(label, actual, threshold, pass) {
    var mark = pass ? '<div class="check-mark pass">✓</div>' : '<div class="check-mark fail">✗</div>';
    return (
      '<div class="checklist-item">' +
        '<div class="check-label">' + label + '</div>' +
        '<div class="check-actual">' + actual + '</div>' +
        '<div class="check-threshold">' + threshold + '</div>' +
        mark +
      '</div>'
    );
  }

  var yldOk = yld != null && yld >= 5;
  var streakOk = streak != null && streak >= 5;
  var epsOk = epsPos != null && epsPos >= 5;
  var peOk = pe != null && pe <= 15;
  var pbOk = pb != null && pb <= 1.5;
  var mcapOk = mcap != null && mcap >= 5e9;

  return (
    '<div class="section-num"><span class="no">03 · The 5-5-5-5 Test</span><span>Hard Filters · Pass All or Fail</span></div>' +
    '<div class="checklist" style="margin:var(--sp-5) 0">' +
      _item('Dividend Yield', (yld == null ? '—' : window.MMUtils.fmtPercent(yld)), '≥ 5.00%', yldOk) +
      _item('Dividend Streak', (streak == null ? '—' : (streak + ' yrs')), '≥ 5 yrs consecutive', streakOk) +
      _item('EPS Positive · Last Five Years', (epsPos == null ? '—' : (epsPos + ' / 5')), 'No loss years', epsOk) +
      _item('Price / Earnings', (pe == null ? '—' : (window.MMUtils.fmtNum(pe, 1) + '×')), '≤ 15× (bonus ≤ 8×)', peOk) +
      _item('Price / Book', (pb == null ? '—' : (window.MMUtils.fmtNum(pb, 2) + '×')), '≤ 1.5× (bonus ≤ 1.0×)', pbOk) +
      _item('Market Cap', (mcap == null ? '—' : window.MMUtils.fmtCompact(mcap) + ' THB'), '≥ 5B THB', mcapOk) +
    '</div>'
  );
}

function _renderReasonsGrid(stock) {
  var esc = window.MMUtils.escapeHtml;
  var reasons = stock.reasons_narrative || stock.reasons || [];
  if (!reasons.length) {
    return (
      '<div class="section-num"><span class="no">04 · Reasons</span><span>Why This Passes</span></div>' +
      '<p style="text-align:center;padding:var(--sp-5);font-family:var(--font-head);font-style:italic;color:var(--fg-dim)">— no reasons logged —</p>'
    );
  }
  var items = reasons.map(function (r, i) {
    var num = String(i + 1).padStart(2, '0');
    // Reasons may be strings or {text} objects
    var text = typeof r === 'string' ? r : (r.text || r.reason || JSON.stringify(r));
    return (
      '<div class="reason-item" style="break-inside:avoid;padding:var(--sp-3) 0;border-bottom:1px solid var(--border-subtle);display:flex;gap:var(--sp-3);align-items:baseline">' +
        '<span class="reason-num" style="font-family:var(--font-mono);font-size:var(--fs-sm);color:var(--fg-mute);min-width:24px">' + num + '</span>' +
        '<div class="reason-text" style="font-family:var(--font-body);font-size:var(--fs-sm);line-height:1.5">' + esc(text) + '</div>' +
      '</div>'
    );
  }).join('');
  return (
    '<div class="section-num"><span class="no">04 · Reasons</span><span>Why This Passes · ' + reasons.length + ' Points</span></div>' +
    '<div class="reasons-grid" style="column-count:3;column-gap:var(--sp-5);margin:var(--sp-5) 0">' + items + '</div>'
  );
}

function _renderPatternSection(patterns) {
  var esc = window.MMUtils.escapeHtml;
  var matched = (patterns && patterns.matched_patterns) || [];
  if (!matched.length) {
    return (
      '<div class="section-num"><span class="no">05 · Case Study Pattern</span><span>No Matches</span></div>' +
      '<p style="text-align:center;padding:var(--sp-5);font-family:var(--font-head);font-style:italic;color:var(--fg-dim)">ไม่มี case study pattern ที่ match ในรอบนี้.</p>'
    );
  }
  var blocks = matched.map(function (p) {
    var tag = esc(p.tag || '');
    var nar = esc(p.narrative || '');
    var src = p.source ? '<div class="dim" style="margin-top:var(--sp-3);font-family:var(--font-mono);font-size:var(--fs-xs);color:var(--fg-mute)">Source: ' + esc(p.source) + '</div>' : '';
    return (
      '<div class="pattern-block" style="border-top:3px double var(--border-subtle);border-bottom:3px double var(--border-subtle);padding:var(--sp-5);margin:var(--sp-5) 0;display:grid;grid-template-columns:auto 1fr;gap:var(--sp-6)">' +
        '<div>' +
          '<div class="pattern-label" style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.14em;text-transform:uppercase;color:var(--fg-dim);margin-bottom:var(--sp-2)">Pattern</div>' +
          '<div class="pattern-name" style="font-family:var(--font-head);font-weight:900;font-size:var(--fs-xl);line-height:1;color:var(--c-positive);letter-spacing:-0.01em">' + tag + '</div>' +
        '</div>' +
        '<div class="pattern-body" style="font-family:var(--font-body);font-size:var(--fs-md);line-height:1.65;font-style:italic;color:var(--fg-secondary)"><p>' + nar + '</p>' + src + '</div>' +
      '</div>'
    );
  }).join('');
  return (
    '<div class="section-num"><span class="no">05 · Case Study Pattern</span><span>Matched · ' + matched.length + '</span></div>' +
    blocks
  );
}

function _renderKeyNumbers(stock) {
  var rows = stock.five_year_history || [];
  if (!rows.length) {
    return (
      '<div class="section-num"><span class="no">06 · Key Numbers</span><span>Five-Year Financial History</span></div>' +
      '<p style="text-align:center;padding:var(--sp-4);font-family:var(--font-head);font-style:italic;color:var(--fg-dim)">— no five-year history —</p>'
    );
  }
  // Sort ascending for display
  var asc = rows.slice().sort(function (a, b) { return (a.year || 0) - (b.year || 0); });
  var years = asc.map(function (r) { return '<th class="num">' + r.year + '</th>'; }).join('');
  function fmt(v, dec) {
    if (v == null) return '—';
    if (dec === 'B') {
      return window.MMUtils.fmtNum(v / 1e9, 1);
    }
    return window.MMUtils.fmtNum(v, dec == null ? 2 : dec);
  }
  function row(label, key, dec) {
    var cells = asc.map(function (r) { return '<td class="num">' + fmt(r[key], dec) + '</td>'; }).join('');
    return '<tr><td class="sym">' + label + '</td>' + cells + '</tr>';
  }
  return (
    '<div class="section-num"><span class="no">06 · Key Numbers</span><span>Five-Year Financial History</span></div>' +
    '<table class="data-table">' +
      '<thead><tr><th>Metric</th>' + years + '</tr></thead>' +
      '<tbody>' +
        row('Revenue (B THB)', 'revenue', 'B') +
        row('Net Income (B THB)', 'net_income', 'B') +
        row('EPS (THB)', 'eps', 2) +
        row('ROE (%)', 'roe', 1) +
        row('Net Margin (%)', 'net_margin', 1) +
        row('D/E (×)', 'de', 2) +
        row('OCF (B THB)', 'ocf', 'B') +
        row('DPS (THB)', 'dps', 2) +
      '</tbody>' +
    '</table>'
  );
}

function _renderDividendHistory(stock) {
  var rows = stock.dividend_history_10y || [];
  if (!rows.length) {
    return (
      '<div class="section-num"><span class="no">07 · Dividend History</span><span>Ten Years of Distributions</span></div>' +
      '<p style="text-align:center;padding:var(--sp-4);font-family:var(--font-head);font-style:italic;color:var(--fg-dim)">— no dividend history —</p>'
    );
  }
  var asc = rows.slice().sort(function (a, b) { return (a.year || 0) - (b.year || 0); });
  var tableRows = asc.slice().reverse().map(function (r) {
    var yClass = r.yield_pct != null && r.yield_pct >= 5 ? 'num pos' : 'num';
    return '<tr><td class="sym">' + r.year + '</td><td class="num">' + (r.dps == null ? '—' : window.MMUtils.fmtNum(r.dps, 2)) + '</td><td class="' + yClass + '">' + (r.yield_pct == null ? '—' : window.MMUtils.fmtNum(r.yield_pct, 1)) + '</td></tr>';
  }).join('');

  return (
    '<div class="section-num"><span class="no">07 · Dividend History</span><span>Ten Years of Distributions</span></div>' +
    '<div class="chart-pair" style="display:grid;grid-template-columns:1.6fr 1fr;gap:var(--sp-6);margin:var(--sp-5) 0;align-items:flex-start">' +
      '<div>' +
        '<div class="chart-box" style="height:260px"><canvas id="v6-dps-chart"></canvas></div>' +
        '<div class="chart-caption" style="font-family:var(--font-head);font-style:italic;font-size:var(--fs-sm);color:var(--fg-dim);text-align:center;margin-top:var(--sp-3)">DPS per year · last 10 years</div>' +
      '</div>' +
      '<div>' +
        '<table class="data-table">' +
          '<thead><tr><th>Year</th><th class="num">DPS</th><th class="num">Yield %</th></tr></thead>' +
          '<tbody>' + tableRows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>'
  );
}

function _renderScoreHistory(history) {
  var timeline = (history && history.timeline) || [];
  if (!timeline.length) {
    return (
      '<div class="section-num"><span class="no">08 · Score History</span><span>No history</span></div>' +
      '<p style="text-align:center;padding:var(--sp-4);font-family:var(--font-head);font-style:italic;color:var(--fg-dim)">— first scan, no prior history —</p>'
    );
  }
  var passedOnly = timeline.filter(function (t) { return t.score != null; });
  if (!passedOnly.length) {
    return (
      '<div class="section-num"><span class="no">08 · Score History</span><span>No pass history</span></div>' +
      '<p style="text-align:center;padding:var(--sp-4);font-family:var(--font-head);font-style:italic;color:var(--fg-dim)">— not yet passed in any scan —</p>'
    );
  }
  var rows = '';
  for (var i = 0; i < passedOnly.length; i++) {
    var t = passedOnly[i];
    var delta = '—';
    var deltaCls = 'num';
    if (i > 0) {
      var d = (t.score || 0) - (passedOnly[i - 1].score || 0);
      if (d > 0) { delta = '+' + d; deltaCls = 'num pos'; }
      else if (d < 0) { delta = String(d); deltaCls = 'num neg'; }
      else delta = '0';
    }
    var dateShort = t.date ? window.MMUtils.fmtDateShort(t.date) : '—';
    var signals = (t.signals || []).join(', ');
    rows += '<tr><td class="mono">' + window.MMUtils.escapeHtml(dateShort) + '</td><td class="num">' + t.score + '</td><td class="dim">' + window.MMUtils.escapeHtml(signals) + '</td><td class="' + deltaCls + '">' + delta + '</td></tr>';
  }
  return (
    '<div class="section-num"><span class="no">08 · Score History</span><span>' + passedOnly.length + ' scans</span></div>' +
    '<div class="chart-pair" style="display:grid;grid-template-columns:1.6fr 1fr;gap:var(--sp-6);margin:var(--sp-5) 0;align-items:flex-start">' +
      '<div>' +
        '<div class="chart-box" style="height:260px"><canvas id="v6-scorehist-chart"></canvas></div>' +
        '<div class="chart-caption" style="font-family:var(--font-head);font-style:italic;font-size:var(--fs-sm);color:var(--fg-dim);text-align:center;margin-top:var(--sp-3)">Score trajectory since first appearance</div>' +
      '</div>' +
      '<div>' +
        '<table class="data-table">' +
          '<thead><tr><th>Scan Date</th><th class="num">Score</th><th>Signals</th><th class="num">Δ</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>'
  );
}

function _renderExitBaseline(exitStatus) {
  if (!exitStatus || !exitStatus.in_watchlist) {
    return (
      '<div class="section-num"><span class="no">09 · Exit Baseline</span><span>Not in Watchlist</span></div>' +
      '<p style="text-align:center;padding:var(--sp-5);font-family:var(--font-head);font-style:italic;color:var(--fg-dim)">หุ้นนี้ยังไม่ได้เข้า watchlist — ไม่มี baseline ให้ monitor.</p>'
    );
  }
  var esc = window.MMUtils.escapeHtml;
  var ctx = exitStatus.entry_context || {};
  var sev = exitStatus.severity_summary || {};
  var severity = 'HOLD';
  if (sev.high > 0) severity = 'CONSIDER_EXIT';
  else if (sev.medium > 0) severity = 'REVIEW';
  var sevBadge = window.MMComponents.renderSevBadge(severity);

  var rules = exitStatus.trigger_rules || [];
  var ruleRows = rules.map(function (r) {
    var statusBadge = r.status === 'FIRED'
      ? window.MMComponents.renderSevBadge('CONSIDER_EXIT')
      : window.MMComponents.renderSevBadge('HOLD');
    var curVal = r.current == null ? '—' : (typeof r.current === 'number' ? window.MMUtils.fmtNum(r.current, 2) : esc(r.current));
    return '<tr><td class="sym">' + esc(r.label) + '</td><td class="num">' + esc(r.threshold || '') + '</td><td class="num">' + curVal + '</td><td>' + statusBadge + '</td></tr>';
  }).join('');

  function _cell(lbl, v, sub) {
    return (
      '<div class="exit-cell">' +
        '<span class="lbl" style="font-family:var(--font-mono);font-size:0.65rem;letter-spacing:0.16em;text-transform:uppercase;color:var(--fg-dim)">' + lbl + '</span>' +
        '<span class="v" style="font-family:var(--font-mono);font-size:var(--fs-lg);font-weight:500;display:block;margin-top:4px">' + v + '</span>' +
        (sub ? '<span class="sub" style="font-family:var(--font-head);font-style:italic;font-size:var(--fs-xs);color:var(--fg-dim);display:block;margin-top:2px">' + esc(sub) + '</span>' : '') +
      '</div>'
    );
  }

  var entryDate = ctx.entry_date ? window.MMUtils.fmtDateShort(ctx.entry_date) : '—';
  var entryPE = ctx.entry_pe == null ? '—' : window.MMUtils.fmtNum(ctx.entry_pe, 1) + '×';
  var entryYld = ctx.entry_yield == null ? '—' : window.MMUtils.fmtPercent(ctx.entry_yield, 1);
  var dScore = ctx.delta_score;
  var dStr = dScore == null ? '—' : (dScore > 0 ? '+' + dScore : String(dScore));
  var weeks = ctx.weeks_held == null ? '' : (ctx.weeks_held + ' weeks ago');

  return (
    '<div class="section-num"><span class="no">09 · Exit Baseline</span><span>Watchlist Position · Monitoring Active</span></div>' +
    '<div class="exit-panel" style="border:3px double var(--c-positive);padding:var(--sp-5);margin:var(--sp-5) 0">' +
      '<div class="head" style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.18em;text-transform:uppercase;color:var(--c-positive);margin-bottom:var(--sp-3)">Current Assessment · ' + sevBadge + '</div>' +
      '<p class="body" style="font-style:italic;color:var(--fg-secondary);margin-bottom:var(--sp-4)">' + esc(exitStatus.narrative || '') + '</p>' +
      '<div class="exit-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-5);padding:var(--sp-4) 0;border-top:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle);margin:var(--sp-4) 0">' +
        _cell('Entry Date', entryDate, weeks) +
        _cell('Entry P/E', entryPE, '') +
        _cell('Entry Yield', entryYld, '') +
        _cell('Δ Score', dStr, '') +
      '</div>' +
      '<table class="data-table"><thead><tr><th>Trigger Rule</th><th class="num">Threshold</th><th class="num">Current</th><th>Status</th></tr></thead><tbody>' + ruleRows + '</tbody></table>' +
    '</div>'
  );
}

function _renderDeepAnalyze() {
  return (
    '<div class="analyze-block" style="text-align:center;padding:var(--sp-7) 0;border-top:3px double var(--border-subtle);margin-top:var(--sp-7)" id="v6-deep-analyze">' +
            '<h2 style="font-family:var(--font-head);font-weight:900;font-size:var(--fs-2xl);line-height:1.1;margin-bottom:var(--sp-3)">Ask Max to go deeper.</h2>' +
      '<p class="sub" style="font-family:var(--font-head);font-style:italic;color:var(--fg-dim);max-width:50ch;margin:var(--sp-4) auto;font-size:var(--fs-md)">The algorithm scores what can be measured. For qualitative assessment — competitive moat, management quality, sector structural risk — invoke deep analysis powered by Claude Opus.</p>' +
      '<button class="btn primary" id="v6-deep-btn" style="margin-top:var(--sp-4)">ขอ Max วิเคราะห์เพิ่มเติม</button>' +
      '<div class="analyze-status" id="v6-deep-status" style="margin-top:var(--sp-4);font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.14em;text-transform:uppercase;color:var(--fg-dim)">Cached 7 days · est. 45 seconds</div>' +
    '</div>'
  );
}

// ---------- assembly ----------

function _buildReportHtml(stock, patterns, history, exitStatus) {
  var esc = window.MMUtils.escapeHtml;
  var foot =
    '<div class="page-foot" style="padding:var(--sp-6) 0;border-top:3px double var(--border-subtle);margin-top:var(--sp-7);text-align:center;font-family:var(--font-head);font-style:italic;color:var(--fg-dim);font-size:var(--fs-sm)">' +
      'End of Report · ' + esc(stock.symbol || '') + ' · Max Mahon — The Dividend Review' +
    '</div>';

  return (
    _renderArticleHead(stock, patterns) +
    _renderTheCase(stock) +
    _renderScoreBreakdown(stock) +
    _renderChecklist(stock) +
    _renderReasonsGrid(stock) +
    _renderPatternSection(patterns) +
    _renderKeyNumbers(stock) +
    _renderDividendHistory(stock) +
    _renderScoreHistory(history) +
    _renderExitBaseline(exitStatus) +
    _renderDeepAnalyze() +
    foot
  );
}

// ---------- charts ----------

function _mountCharts(stock, history) {
  var root = getComputedStyle(document.documentElement);
  var textInk = root.getPropertyValue('--fg-primary').trim();
  var accent = root.getPropertyValue('--c-positive-strong').trim();
  var inkDim = root.getPropertyValue('--fg-dim').trim();
  var gray500 = root.getPropertyValue('--fg-dim').trim() || '#878d9a';
  var gray300 = root.getPropertyValue('--fg-mute').trim() || '#b2b6c0';
  var ruleHair = (getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim() || 'rgba(59,64,80,0.15)');
  if (!window.Chart) return;
  window.Chart.defaults.font.family = 'Inter, sans-serif';
  window.Chart.defaults.color = inkDim;

  // Score donut
  var scoreCanvas = document.getElementById('v6-score-chart');
  if (scoreCanvas) {
    var bd = stock.score_breakdown || stock.breakdown || {};
    var div = bd.dividend || 0;
    var val = bd.valuation || 0;
    var cf  = bd.cashflow != null ? bd.cashflow : (bd.cash_flow || 0);
    var hv  = bd.hidden_value != null ? bd.hidden_value : (bd.hidden || 0);
    var mod = bd.modifier != null ? bd.modifier : (bd.modifiers || 0);
    var score = stock.quality_score != null ? stock.quality_score : (stock.score || 0);
    var remaining = Math.max(0, 100 - (div + val + cf + hv));
    new window.Chart(scoreCanvas, {
      type: 'doughnut',
      data: {
        labels: [
          'Dividend · ' + div,
          'Valuation · ' + val,
          'Cash Flow · ' + cf,
          'Hidden Value · ' + hv,
          'Modifier · ' + (mod > 0 ? '+' + mod : mod),
          'Remaining · ' + remaining
        ],
        datasets: [{
          data: [div, val, cf, Math.max(hv, 0.1), Math.abs(mod), remaining],
          backgroundColor: [accent, textInk, gray500, gray300, '#5a6072', (getComputedStyle(document.documentElement).getPropertyValue('--chart-fill-soft').trim() || 'rgba(59,64,80,0.15)')],
          borderColor: '#f5f5f0',
          borderWidth: 2,
          spacing: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'right',
            align: 'center',
            labels: { font: { family: 'JetBrains Mono', size: 10 }, boxWidth: 10, boxHeight: 10, padding: 8 }
          }
        }
      }
    });
  }

  // DPS bar
  var dpsCanvas = document.getElementById('v6-dps-chart');
  if (dpsCanvas) {
    var rows = (stock.dividend_history_10y || []).slice().sort(function (a, b) { return (a.year || 0) - (b.year || 0); });
    var lastIdx = rows.length - 1;
    new window.Chart(dpsCanvas, {
      type: 'bar',
      data: {
        labels: rows.map(function (r) { return String(r.year); }),
        datasets: [{
          data: rows.map(function (r) { return r.dps || 0; }),
          backgroundColor: function (ctx) { return ctx.dataIndex === lastIdx ? accent : textInk; },
          borderWidth: 0,
          barThickness: 22,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, border: { color: ruleHair }, ticks: { font: { size: 10 } } },
          y: { grid: { color: ruleHair }, border: { display: false }, ticks: { font: { size: 10 }, callback: function (v) { return v + ' ฿'; } } }
        }
      }
    });
  }

  // Score history line
  var shCanvas = document.getElementById('v6-scorehist-chart');
  if (shCanvas) {
    var timeline = ((history || {}).timeline || []).filter(function (t) { return t.score != null; });
    new window.Chart(shCanvas, {
      type: 'line',
      data: {
        labels: timeline.map(function (t) { return t.date ? window.MMUtils.fmtDateShort(t.date).slice(0, 6) : ''; }),
        datasets: [{
          data: timeline.map(function (t) { return t.score; }),
          borderColor: textInk,
          backgroundColor: (getComputedStyle(document.documentElement).getPropertyValue('--chart-fill-soft').trim() || 'rgba(59,64,80,0.15)'),
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: textInk,
          pointBorderWidth: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: accent,
          tension: 0,
          fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, border: { color: ruleHair }, ticks: { font: { size: 9 } } },
          y: { grid: { color: ruleHair }, border: { display: false }, ticks: { font: { size: 10 } }, suggestedMin: 0, suggestedMax: 100 }
        }
      }
    });
  }
}

// ---------- Deep Analyze polling ----------

function _wireDeepAnalyze(sym) {
  var btn = document.getElementById('v6-deep-btn');
  var status = document.getElementById('v6-deep-status');
  if (!btn) return;
  btn.addEventListener('click', function () {
    btn.disabled = true;
    btn.textContent = 'Requesting…';
    if (status) status.textContent = '∙ Pending · est. 45 seconds';
    window.MMApi.post('/api/stock/' + encodeURIComponent(sym) + '/analyze', {}).catch(function (e) {
      // surface fire-and-forget errors but keep polling the GET
      console.error(e);
    });
    var elapsed = 0;
    var handle = setInterval(async function () {
      elapsed += 5;
      try {
        var r = await window.MMApi.get('/api/stock/' + encodeURIComponent(sym) + '/analysis');
        var narrative = r && (r.narrative || r.case_text || r.max || r.buffett);
        if (narrative) {
          clearInterval(handle);
          _injectNarrative(narrative);
          btn.textContent = 'Deep Analyzed ✓';
          if (status) status.textContent = 'Cached · updated just now';
        }
      } catch (_) { /* 404 = still pending */ }
      if (elapsed >= 90) {
        clearInterval(handle);
        btn.disabled = false;
        btn.textContent = 'Retry Deep Analyze';
        if (status) status.textContent = 'Timeout · retry or check server logs';
      }
    }, 5000);
  });
}

function _injectNarrative(text) {
  var host = document.getElementById('v6-case-cols');
  if (!host) return;
  var esc = window.MMUtils.escapeHtml;
  var paras = String(text).split(/\n\n+/).filter(Boolean);
  host.className = 'case-cols';
  host.setAttribute('style', 'column-count:2;column-gap:var(--sp-6);column-rule:1px solid var(--border-subtle);text-align:justify;hyphens:auto;font-size:1.02rem;line-height:1.7');
  host.innerHTML = paras.map(function (p, i) {
    var cls = i === 0 ? 'drop-cap' : '';
    return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(p) + '</p>';
  }).join('');
}
