/* ==========================================================
   MAX MAHON v6 — Full Report page (mobile)
   Ports web-v6-mockup/mobile/02-report.html → live data.
   Single-column, portrait-sized charts, bottom nav.
   ========================================================== */

export async function mount(container) {
  window.MMComponents.renderLoading(container, 'Loading report');

  var sym = _extractSymbol();
  if (!sym) {
    window.MMComponents.renderError(container, 'No symbol in URL.');
    return;
  }

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
    container.innerHTML = _buildMobileReportHtml(stock, patterns, history, exitStatus);
    _mountCharts(stock, history);
    _wireDeepAnalyze(stock.symbol || sym);
  });
}

function _extractSymbol() {
  var parts = location.pathname.split('/').filter(Boolean);
  var idx = parts.indexOf('report');
  if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
  return parts[parts.length - 1] || '';
}

function _updateMasthead(status) {
  var host = document.getElementById('masthead');
  if (!host) return;
  var date = status && status.last_data_date
    ? window.MMUtils.fmtDateLong(status.last_data_date).toUpperCase()
    : window.MMUtils.fmtDateLong(new Date()).toUpperCase();
  host.innerHTML = window.MMComponents.renderMasthead({ active: 'home' });
  var navHost = document.getElementById('mobile-nav-host');
  if (navHost) navHost.innerHTML = window.MMComponents.renderMobileNav('home');
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

// -------- section renderers --------

function _renderHero(stock, patterns) {
  var esc = window.MMUtils.escapeHtml;
  var sym = esc(stock.symbol || '');
  var name = esc(stock.name || '');
  var sector = esc(stock.sector || '');
  var signals = stock.signals || [];
  var tags = '';
  if (signals.indexOf('NIWES_5555') !== -1) tags += '<span class="tag primary">Niwes 5-5-5-5</span>';
  if (signals.indexOf('QUALITY_DIVIDEND') !== -1) tags += '<span class="tag">Quality Dividend</span>';
  if (signals.indexOf('HIDDEN_VALUE') !== -1) tags += '<span class="tag">Hidden Value</span>';
  if (signals.indexOf('DEEP_VALUE') !== -1) tags += '<span class="tag">Deep Value</span>';
  if (patterns && (patterns.case_study_tags || []).length) tags += '<span class="tag">' + esc(patterns.case_study_tags[0]) + '</span>';
  var metrics = stock.screener_metrics || stock.metrics || {};
  var price = metrics.current_price != null ? metrics.current_price : stock.price;
  var priceStr = price == null ? '—' : '฿' + window.MMUtils.fmtNum(price, 2);
  var asOf = stock.price_as_of ? ('ราคาวันที่ ' + window.MMUtils.fmtDateThaiShort(stock.price_as_of)) : '';
  var score = stock.quality_score != null ? stock.quality_score : (stock.score || 0);
  var narrative = stock.narrative || {};
  var verdictHtml = _buildVerdictChip(narrative.verdict);
  return (
    '<section class="report-hero">' +
      '<div class="report-hero-left">' +
        '<h1 style="font-family:var(--font-head);font-weight:900;font-size:clamp(1.6rem,8vw,2.4rem);letter-spacing:-0.02em;line-height:1;margin:0;color:var(--fg-primary)">' + sym + '</h1>' +
        '<div style="font-size:var(--fs-sm);color:var(--fg-secondary)">' + name + (sector ? ' · ' + sector : '') + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + tags + '</div>' +
      '</div>' +
      '<div class="report-hero-right">' +
        '<div class="report-hero-price" id="v6-mhero-price">' + priceStr + '<span style="font-size:var(--fs-sm);color:var(--fg-dim);margin-left:6px">THB</span></div>' +
        (asOf ? '<div style="font-family:var(--font-mono);font-size:var(--fs-xs);color:var(--fg-dim);letter-spacing:0.08em;text-transform:uppercase">' + esc(asOf) + '</div>' : '') +
        '<div style="display:flex;gap:var(--sp-2);align-items:center">' +
          '<span style="font-family:var(--font-mono);font-size:var(--fs-sm);color:var(--fg-dim)">Score</span>' +
          '<span id="v6-mhero-score" style="font-family:var(--font-mono);font-size:var(--fs-md);font-weight:700;color:var(--fg-primary)">' + Math.round(score) + '/100</span>' +
        '</div>' +
        '<div id="v6-mhero-verdict">' + verdictHtml + '</div>' +
      '</div>' +
    '</section>'
  );
}

function _buildVerdictChip(verdictRaw) {
  if (!verdictRaw) return '<span class="v6-verdict-chip empty">ยังไม่ได้วิเคราะห์</span>';
  var v = String(verdictRaw).trim();
  var cls = 'hold', label = 'HOLD';
  if (/^\s*BUY\b/i.test(v)) { cls = 'buy'; label = 'BUY'; }
  else if (/^\s*SELL\b/i.test(v)) { cls = 'sell'; label = 'SELL'; }
  return '<span class="v6-verdict-chip ' + cls + '">' + label + '</span>';
}

function _applyHeroVerdict(verdict) {
  var el = document.getElementById('v6-mhero-verdict');
  if (el) el.innerHTML = _buildVerdictChip(verdict);
}

function _renderScore(stock) {
  var score = stock.quality_score != null ? stock.quality_score : (stock.score || 0);
  return (
    '<div class="v6-section-head"><h2>Score</h2><small>Of One Hundred · Niwes Dividend-First</small></div>' +
    '<section class="v6-score-block">' +
      '<div class="v6-score-display">' +
        '<div class="v6-score-huge">' + Math.round(score) + '</div>' +
        '<div class="v6-score-slash">of one hundred</div>' +
        '<div class="v6-score-version">niwes-dividend-first · v2</div>' +
      '</div>' +
      '<div><div class="v6-chart-box" style="height:260px"><canvas id="v6-mscore-chart"></canvas></div></div>' +
    '</section>'
  );
}

function _renderChecklistEnriched(stock) {
  var metrics = stock.screener_metrics || {};
  var fallback = stock;
  function _get(key) { return metrics[key] != null ? metrics[key] : fallback[key]; }
  var yld = _get('dividend_yield');
  var pe = _get('pe') == null ? fallback.pe_ratio : _get('pe');
  var pb = _get('pb_ratio') == null ? fallback.pb_ratio : _get('pb_ratio');
  var mcap = _get('mcap') == null ? fallback.market_cap : _get('mcap');
  var streak = stock.dividend_streak_years || metrics.dividend_streak_years || metrics.div_streak;
  var epsPos = stock.eps_positive_count != null ? stock.eps_positive_count : metrics.eps_positive_count;
  var reasons = stock.reasons_narrative || stock.reasons || [];
  function _matchReasonFor(keys) {
    for (var i = 0; i < reasons.length; i++) {
      var r = typeof reasons[i] === 'string' ? reasons[i] : (reasons[i].text || '');
      var low = r.toLowerCase();
      for (var k = 0; k < keys.length; k++) { if (low.indexOf(keys[k]) !== -1) return r; }
    }
    return '';
  }
  function _item(label, actual, threshold, pass, keys) {
    var reason = _matchReasonFor(keys);
    var markCls = pass ? 'pass' : 'fail';
    var markIcon = pass ? '✓' : '✗';
    return (
      '<div class="v6-checklist-item">' +
        '<div class="v6-check-label">' + label + '</div>' +
        '<div class="v6-check-actual">' + actual + '</div>' +
        '<div class="v6-check-threshold">' + threshold + '</div>' +
        '<div class="v6-check-mark ' + markCls + '">' + markIcon + '</div>' +
        '<div class="v6-check-reason">' + window.MMUtils.escapeHtml(reason) + '</div>' +
      '</div>'
    );
  }
  return (
    '<div class="v6-section-head"><h2>5-5-5-5 Test</h2><small>Hard Filters · Pass All or Fail</small></div>' +
    '<div class="v6-checklist">' +
      _item('Dividend Yield', (yld == null ? '—' : window.MMUtils.fmtPercent(yld)), '≥ 5.00%', yld != null && yld >= 5, ['yield', 'ปันผล']) +
      _item('Dividend Streak', (streak == null ? '—' : (streak + ' yrs')), '≥ 5 yrs', streak != null && streak >= 5, ['streak', 'ติดต่อกัน', 'จ่ายปันผล']) +
      _item('EPS Positive (5y)', (epsPos == null ? '—' : (epsPos + ' / 5')), 'No loss years', epsPos != null && epsPos >= 5, ['eps', 'ขาดทุน']) +
      _item('P/E', (pe == null ? '—' : (window.MMUtils.fmtNum(pe, 1) + '×')), '≤ 15×', pe != null && pe <= 15, ['p/e', 'pe', 'earnings']) +
      _item('P/BV', (pb == null ? '—' : (window.MMUtils.fmtNum(pb, 2) + '×')), '≤ 1.5×', pb != null && pb <= 1.5, ['p/bv', 'pbv', 'book']) +
      _item('Market Cap', (mcap == null ? '—' : window.MMUtils.fmtCompact(mcap) + ' THB'), '≥ 5B THB', mcap != null && mcap >= 5e9, ['mcap', 'market cap']) +
    '</div>'
  );
}

function _renderPatternFootnote(patterns) {
  var matched = (patterns && patterns.matched_patterns) || [];
  if (!matched.length) return '';
  var esc = window.MMUtils.escapeHtml;
  return matched.map(function (p) {
    var src = p.source ? '<div class="src">Source: ' + esc(p.source) + '</div>' : '';
    return '<details class="v6-pattern-footnote"><summary>Reference: ' + esc(p.tag || '') + ' pattern</summary><p>' + esc(p.narrative || '') + '</p>' + src + '</details>';
  }).join('');
}

function _renderKeyNumbers(stock) {
  var rows = stock.five_year_history || [];
  if (!rows.length) {
    return (
      '<div class="v6-section-head"><h2>Key Numbers</h2><small>Five-Year Financial History</small></div>' +
      '<p class="v6-empty-state">— no five-year history —</p>'
    );
  }
  var asc = rows.slice().sort(function (a, b) { return (a.year || 0) - (b.year || 0); });
  var years = asc.map(function (r) { return '<th class="num">' + String(r.year).slice(-2) + '</th>'; }).join('');
  function fmt(v, dec) {
    if (v == null) return '—';
    if (dec === 'B') return window.MMUtils.fmtNum(v / 1e9, 0);
    return window.MMUtils.fmtNum(v, dec == null ? 1 : dec);
  }
  function row(label, key, dec) {
    var cells = asc.map(function (r) { return '<td class="num">' + fmt(r[key], dec) + '</td>'; }).join('');
    return '<tr><td class="sym">' + label + '</td>' + cells + '</tr>';
  }
  return (
    '<div class="v6-section-head"><h2>Key Numbers</h2><small>Five-Year Financial History</small></div>' +
    '<div class="data-table-wrap" style="overflow-x:auto">' +
      '<table class="data-table">' +
        '<thead><tr><th>Metric</th>' + years + '</tr></thead>' +
        '<tbody>' +
          row('Rev (B)', 'revenue', 'B') +
          row('NI (B)', 'net_income', 'B') +
          row('EPS', 'eps', 1) +
          row('ROE%', 'roe', 1) +
          row('DPS', 'dps', 1) +
        '</tbody>' +
      '</table>' +
    '</div>'
  );
}

function _renderDividendHistory(stock) {
  var rows = stock.dividend_history_10y || [];
  if (!rows.length) {
    return (
      '<div class="v6-section-head"><h2>Dividend History</h2><small>Ten Years of Distributions</small></div>' +
      '<p class="v6-empty-state">— no dividend history —</p>'
    );
  }
  return (
    '<div class="v6-section-head"><h2>Dividend History</h2><small>Ten Years of Distributions</small></div>' +
    '<div class="v6-chart-box" style="height:220px"><canvas id="v6-mdps-chart"></canvas></div>' +
    '<div class="v6-chart-caption">DPS per year · last 10 years</div>'
  );
}

function _renderScoreHistory(history) {
  var timeline = ((history || {}).timeline || []).filter(function (t) { return t.score != null; });
  if (!timeline.length) {
    return (
      '<div class="v6-section-head"><h2>Score History</h2><small>No pass history</small></div>' +
      '<p class="v6-empty-state">— not yet passed in any scan —</p>'
    );
  }
  return (
    '<div class="v6-section-head"><h2>Score History</h2><small>' + timeline.length + ' scans</small></div>' +
    '<div class="v6-chart-box" style="height:220px"><canvas id="v6-mscorehist-chart"></canvas></div>' +
    '<div class="v6-chart-caption">Score trajectory since first appearance</div>'
  );
}

function _renderExitBaseline(exitStatus) {
  if (!exitStatus || !exitStatus.in_watchlist) return '';
  var esc = window.MMUtils.escapeHtml;
  var ctx = exitStatus.entry_context || {};
  var sev = exitStatus.severity_summary || {};
  var severity = 'HOLD';
  if (sev.high > 0) severity = 'CONSIDER_EXIT';
  else if (sev.medium > 0) severity = 'REVIEW';
  var sevBadge = window.MMComponents.renderSevBadge(severity);
  var entryDate = ctx.entry_date ? window.MMUtils.fmtDateShort(ctx.entry_date) : '—';
  var entryPE = ctx.entry_pe == null ? '—' : window.MMUtils.fmtNum(ctx.entry_pe, 1) + '×';
  var entryYld = ctx.entry_yield == null ? '—' : window.MMUtils.fmtPercent(ctx.entry_yield, 1);
  var dScore = ctx.delta_score;
  var dStr = dScore == null ? '—' : (dScore > 0 ? '+' + dScore : String(dScore));

  function _cell(lbl, v) {
    return (
      '<div class="v6-exit-cell">' +
        '<span class="lbl" style="font-family:var(--font-mono);font-size:0.6rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--fg-dim)">' + lbl + '</span>' +
        '<span class="v" style="font-family:var(--font-mono);font-size:1.1rem;font-weight:500;display:block;margin-top:3px">' + v + '</span>' +
      '</div>'
    );
  }

  return (
    '<div class="v6-section-head"><h2>Exit Baseline</h2><small>Watchlist Position</small></div>' +
    '<div class="v6-exit-panel">' +
      '<div class="head" style="font-family:var(--font-mono);font-size:0.7rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--c-positive);margin-bottom:12px">Current · ' + sevBadge + '</div>' +
      '<p style="color:var(--fg-secondary);margin-bottom:14px;font-size:0.9rem">' + esc(exitStatus.narrative || '') + '</p>' +
      '<div class="v6-exit-grid">' +
        _cell('Entry Date', entryDate) +
        _cell('Entry PE', entryPE) +
        _cell('Entry Yld', entryYld) +
        _cell('Δ Score', dStr) +
      '</div>' +
    '</div>'
  );
}

function _renderDeepAnalyze() {
  return '<section class="v6-deep-analyze" id="v6-mdeep-analyze">' + _renderAnalyzeInitialInner() + '</section>';
}

function _renderAnalyzeInitialInner() {
  return (
    '<h2 style="font-family:var(--font-head);font-weight:900;font-size:var(--fs-xl);line-height:1.15;margin:4px 0 8px">ขอวิเคราะห์เจาะลึก</h2>' +
    '<p style="color:var(--fg-dim);max-width:50ch;margin:0 auto 16px;font-size:var(--fs-md)">ให้ Claude Opus วิเคราะห์ตามกรอบ ดร.นิเวศน์ 5 ด้าน + verdict สำหรับ DCA 10-20 ปี เน้นปันผลสะสม</p>' +
    '<div style="text-align:center"><button class="btn primary" id="v6-deep-btn" style="padding:12px 24px;border-radius:999px;font-weight:700;min-height:48px">ขอวิเคราะห์เพิ่มเติม</button></div>' +
    '<div style="margin-top:12px;font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.14em;text-transform:uppercase;color:var(--fg-mute);text-align:center">Cached 7 days · Claude Opus</div>'
  );
}

function _renderAnalyzeLoadingInner() {
  return (
    '<div style="padding:28px 0;text-align:center">' +
      '<div style="display:inline-block;width:24px;height:24px;border:3px solid var(--c-positive-soft);border-top-color:var(--c-positive);border-radius:50%;animation:v6spin 1s linear infinite"></div>' +
      '<style>@keyframes v6spin{to{transform:rotate(360deg)}}</style>' +
      '<div style="font-family:var(--font-mono);font-size:0.68rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--fg-dim);margin-top:10px">กำลังวิเคราะห์ · Claude Opus</div>' +
    '</div>'
  );
}

function _renderAnalyzeErrorInner(msg) {
  var esc = window.MMUtils.escapeHtml;
  return (
    '<div style="padding:18px 0;text-align:center">' +
      '<div style="color:var(--c-negative);margin-bottom:14px;font-size:0.95rem">' + esc(msg || 'Timeout · server ไม่ตอบกลับ') + '</div>' +
      '<button class="btn primary" id="v6-deep-btn" style="padding:12px 22px;border-radius:999px;font-weight:700;min-height:48px">ลองอีกครั้ง</button>' +
    '</div>'
  );
}

function _renderAnalyzeResult(data) {
  var esc = window.MMUtils.escapeHtml;
  var svg = window.MMUtils.svg;
  var analyzedAt = data.analyzed_at
    ? (window.MMUtils.fmtDateThaiShort(data.analyzed_at) + ' · Claude Opus')
    : 'Claude Opus';
  var verdictRaw = String(data.verdict || '').trim();
  var verdictClass = 'hold', badge = 'HOLD';
  if (/^\s*BUY\b/i.test(verdictRaw)) { verdictClass = 'buy'; badge = 'BUY'; }
  else if (/^\s*SELL\b/i.test(verdictRaw)) { verdictClass = 'sell'; badge = 'SELL'; }
  var verdictWhy = verdictRaw.replace(/^(BUY|HOLD|SELL)\s*[:\-·—]?\s*/i, '');

  function _sec(iconName, title, text) {
    if (!text) return '';
    return (
      '<div class="v6-deep-section">' +
        '<h4>' + svg(iconName) + title + '</h4>' +
        '<p>' + esc(text) + '</p>' +
      '</div>'
    );
  }

  var toArtParas = String(data.to_art || '').split(/\n\n+/).filter(Boolean).map(function (p) {
    return '<p>' + esc(p) + '</p>';
  }).join('');
  var talkPanel = data.to_art ? (
    '<div class="v6-deep-talk-panel">' +
      '<h4>' + svg('message-circle') + 'Max คุยกับอาร์ท' +
        '<span class="pillar-badge">เสาหลัก 1 · พอร์ตปันผล 100M</span>' +
      '</h4>' +
      toArtParas +
    '</div>'
  ) : '';

  return (
    '<div style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.12em;text-transform:uppercase;color:var(--fg-dim);margin-bottom:var(--sp-4);display:flex;justify-content:space-between">' +
      '<span>' + esc(analyzedAt) + '</span><span>Cache 7 วัน</span>' +
    '</div>' +
    '<div class="v6-deep-verdict-bar">' +
      '<span class="v6-verdict-chip ' + verdictClass + '">' + badge + '</span>' +
      '<span style="font-size:var(--fs-sm);color:var(--fg-primary);line-height:1.5;flex:1">' + esc(verdictWhy || verdictRaw) + '</span>' +
    '</div>' +
    '<div class="v6-deep-grid">' +
      _sec('banknote', 'Dividend Sustainability', data.dividend) +
      _sec('gem', 'Hidden Value Audit', data.hidden) +
      _sec('landmark', 'Business Moat', data.moat) +
      _sec('scale', 'Valuation Discipline', data.valuation) +
    '</div>' +
    talkPanel
  );
}

function _buildMobileReportHtml(stock, patterns, history, exitStatus) {
  return (
    _renderHero(stock, patterns) +
    _renderScore(stock) +
    _renderChecklistEnriched(stock) +
    _renderPatternFootnote(patterns) +
    _renderKeyNumbers(stock) +
    _renderDividendHistory(stock) +
    _renderScoreHistory(history) +
    _renderExitBaseline(exitStatus) +
    _renderDeepAnalyze()
  );
}

function _mountCharts(stock, history) {
  var root = getComputedStyle(document.documentElement);
  var textInk = root.getPropertyValue('--fg-primary').trim();
  var accent = root.getPropertyValue('--c-positive-strong').trim();
  var inkDim = root.getPropertyValue('--fg-dim').trim();
  var ruleHair = (getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim() || 'rgba(59,64,80,0.15)');
  if (!window.Chart) return;
  window.Chart.defaults.font.family = 'Inter, sans-serif';
  window.Chart.defaults.color = inkDim;

  var scoreCanvas = document.getElementById('v6-mscore-chart');
  if (scoreCanvas) {
    var bd = stock.score_breakdown || stock.breakdown || {};
    var div = bd.dividend || 0;
    var val = bd.valuation || 0;
    var cf  = bd.cashflow != null ? bd.cashflow : (bd.cash_flow || 0);
    var hv  = bd.hidden_value != null ? bd.hidden_value : (bd.hidden || 0);
    var mod = bd.modifier != null ? bd.modifier : 0;
    new window.Chart(scoreCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Dividend ' + div, 'Valuation ' + val, 'Cash Flow ' + cf, 'Hidden ' + hv, 'Mod ' + (mod > 0 ? '+' + mod : mod)],
        datasets: [{
          data: [div, val, cf, Math.max(hv, 0.1), Math.abs(mod)],
          backgroundColor: [accent, textInk, '#878d9a', '#b2b6c0', '#5a6072'],
          borderColor: '#f5f5f0',
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { position: 'bottom', labels: { font: { family: 'JetBrains Mono', size: 9 }, boxWidth: 8, padding: 6 } } }
      }
    });
  }

  var dpsCanvas = document.getElementById('v6-mdps-chart');
  if (dpsCanvas) {
    var rows = (stock.dividend_history_10y || []).slice().sort(function (a, b) { return (a.year || 0) - (b.year || 0); });
    var lastIdx = rows.length - 1;
    new window.Chart(dpsCanvas, {
      type: 'bar',
      data: {
        labels: rows.map(function (r) { return String(r.year).slice(-2); }),
        datasets: [{
          data: rows.map(function (r) { return r.dps || 0; }),
          backgroundColor: function (ctx) { return ctx.dataIndex === lastIdx ? accent : textInk; },
          barThickness: 16,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, border: { color: ruleHair }, ticks: { font: { size: 9 } } },
          y: { grid: { color: ruleHair }, border: { display: false }, ticks: { font: { size: 9 } } }
        }
      }
    });
  }

  var shCanvas = document.getElementById('v6-mscorehist-chart');
  if (shCanvas) {
    var timeline = ((history || {}).timeline || []).filter(function (t) { return t.score != null; });
    new window.Chart(shCanvas, {
      type: 'line',
      data: {
        labels: timeline.map(function (t) { return t.date ? window.MMUtils.fmtDateShort(t.date).slice(0, 6) : ''; }),
        datasets: [{ data: timeline.map(function (t) { return t.score; }), borderColor: textInk, backgroundColor: (getComputedStyle(document.documentElement).getPropertyValue('--chart-fill-soft').trim() || 'rgba(59,64,80,0.15)'), borderWidth: 2, pointRadius: 2, fill: true }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, border: { color: ruleHair }, ticks: { font: { size: 8 } } },
          y: { grid: { color: ruleHair }, border: { display: false }, ticks: { font: { size: 9 } }, suggestedMin: 0, suggestedMax: 100 }
        }
      }
    });
  }
}

var _mDeepState = { pollHandle: null };

function _hasAnalysisData(r) {
  return !!(r && (r.to_art || r.dividend || r.moat || r.hidden || r.valuation || r.verdict));
}

function _stopPoll() {
  if (_mDeepState.pollHandle) {
    clearInterval(_mDeepState.pollHandle);
    _mDeepState.pollHandle = null;
  }
}

function _wireDeepAnalyze(sym) {
  var block = document.getElementById('v6-mdeep-analyze');
  if (!block) return;
  _stopPoll();
  // Auto-render if cache hit — skip button
  window.MMApi.get('/api/stock/' + encodeURIComponent(sym) + '/analysis').then(function (cached) {
    if (_hasAnalysisData(cached)) {
      block.innerHTML = _renderAnalyzeResult(cached);
      _applyHeroVerdict(cached.verdict);
    } else {
      _attachClick(sym, block);
    }
  }).catch(function () {
    _attachClick(sym, block);
  });
}

function _attachClick(sym, block) {
  var btn = block.querySelector('#v6-deep-btn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    _stopPoll();
    block.innerHTML = _renderAnalyzeLoadingInner();
    window.MMApi.post('/api/stock/' + encodeURIComponent(sym) + '/analyze', {}).then(function (payload) {
      if (_hasAnalysisData(payload)) {
        block.innerHTML = _renderAnalyzeResult(payload);
        _applyHeroVerdict(payload.verdict);
        return;
      }
      _pollAnalysis(sym, block);
    }).catch(function () {
      _pollAnalysis(sym, block);
    });
  });
}

function _pollAnalysis(sym, block) {
  _stopPoll();
  var elapsed = 0;
  _mDeepState.pollHandle = setInterval(async function () {
    elapsed += 5;
    try {
      var r = await window.MMApi.get('/api/stock/' + encodeURIComponent(sym) + '/analysis');
      if (_hasAnalysisData(r)) {
        _stopPoll();
        block.innerHTML = _renderAnalyzeResult(r);
        _applyHeroVerdict(r.verdict);
        return;
      }
    } catch (_) { /* 404 = still pending */ }
    if (elapsed >= 90) {
      _stopPoll();
      block.innerHTML = _renderAnalyzeErrorInner('Timeout · server ไม่ตอบกลับ');
      _attachClick(sym, block);
    }
  }, 5000);
}
