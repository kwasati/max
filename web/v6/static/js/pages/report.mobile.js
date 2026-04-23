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

function _renderArticleHead(stock, patterns) {
  var esc = window.MMUtils.escapeHtml;
  var sym = esc(stock.symbol || '');
  var name = esc(stock.name || '');
  var signals = stock.signals || [];
  var tags = '';
  if (signals.indexOf('NIWES_5555') !== -1) tags += '<span class="tag primary">Niwes 5-5-5-5</span>';
  if (signals.indexOf('QUALITY_DIVIDEND') !== -1) tags += '<span class="tag">Quality Div</span>';
  if (signals.indexOf('HIDDEN_VALUE') !== -1) tags += '<span class="tag">Hidden Value</span>';
  var caseTag = patterns && (patterns.case_study_tags || [])[0];
  return (
    '<section class="article-head" style="padding:20px 0 16px;text-align:center;border-bottom:3px double var(--border-subtle)">' +
      '<div class="article-kicker" style="font-family:var(--font-mono);font-size:0.65rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--fg-dim);margin-bottom:8px">Full Report' + (caseTag ? ' · ' + esc(caseTag) : '') + '</div>' +
      '<h1 class="article-sym" style="font-family:var(--font-head);font-weight:900;font-size:2.8rem;line-height:0.95;letter-spacing:-0.02em">' + sym + '</h1>' +
      '<div class="article-name" style="font-family:var(--font-head);font-style:italic;font-size:0.95rem;color:var(--fg-secondary);margin:6px 0 12px">' + name + '</div>' +
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
  var caseText = (stock.narrative || {}).case_text;
  var byline = '<div class="byline" style="text-align:center;margin-bottom:16px;font-family:var(--font-mono);font-size:0.65rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--fg-dim)">By <strong style="color:var(--fg-primary);font-weight:500">Max Mahon</strong> · Staff Analyst</div>';
  var body;
  if (caseText) {
    var paras = String(caseText).split(/\n\n+/).filter(Boolean);
    body = '<div class="case-cols" id="v6-mcase-cols" style="column-count:1;font-size:0.98rem;line-height:1.65">' +
      paras.map(function (p, i) {
        var cls = i === 0 ? 'drop-cap' : '';
        return '<p' + (cls ? ' class="' + cls + '"' : '') + ' style="margin-bottom:14px">' + esc(p) + '</p>';
      }).join('') +
      '</div>';
  } else {
    body = '<div id="v6-mcase-cols" style="text-align:center;padding:16px 0;font-family:var(--font-head);font-style:italic;color:var(--fg-secondary);font-size:0.95rem">บทวิเคราะห์ยังไม่ได้ generate — กดปุ่มด้านล่างเพื่อเรียก Max.</div>';
  }
  return (
    '<div class="section-num"><span class="no">01 · The Case</span><span>Editorial</span></div>' +
    '<section class="case-body" style="padding:20px 0">' + byline + body + '</section>'
  );
}

function _renderScore(stock) {
  var score = stock.quality_score != null ? stock.quality_score : (stock.score || 0);
  return (
    '<div class="section-num"><span class="no">02 · Score</span><span>Of 100</span></div>' +
    '<div class="score-display" style="text-align:center">' +
      '<div class="huge" style="font-family:var(--font-mono);font-weight:300;font-size:7rem;line-height:0.85;color:var(--fg-primary)">' + Math.round(score) + '</div>' +
      '<div class="slash" style="font-family:var(--font-head);font-style:italic;color:var(--fg-dim);margin-top:10px">of one hundred</div>' +
    '</div>' +
    '<div class="score-chart-wrap" style="height:260px;margin-top:16px"><canvas id="v6-mscore-chart"></canvas></div>'
  );
}

function _renderChecklist(stock) {
  var metrics = stock.screener_metrics || {};
  function _get(k) { return metrics[k] != null ? metrics[k] : stock[k]; }
  var yld = _get('dividend_yield');
  var pe = _get('pe') == null ? stock.pe_ratio : _get('pe');
  var pb = _get('pb_ratio') == null ? stock.pb_ratio : _get('pb_ratio');
  var mcap = _get('mcap') == null ? stock.market_cap : _get('mcap');
  var streak = stock.dividend_streak_years == null ? metrics.dividend_streak_years : stock.dividend_streak_years;
  var epsPos = stock.eps_positive_count == null ? metrics.eps_positive_count : stock.eps_positive_count;

  function item(label, actual, threshold, pass) {
    var mark = pass ? '<div class="check-mark pass">✓</div>' : '<div class="check-mark fail">✗</div>';
    return (
      '<div class="checklist-item" style="display:grid;grid-template-columns:1fr auto auto;gap:10px;padding:12px 0;border-bottom:1px solid var(--border-subtle);align-items:baseline">' +
        '<div class="check-label" style="font-family:var(--font-head);font-size:1rem;font-weight:500">' + label + '</div>' +
        '<div class="check-actual" style="font-family:var(--font-mono);font-weight:500;font-size:1rem">' + actual + '</div>' +
        mark +
        '<div class="check-threshold" style="font-family:var(--font-mono);font-size:0.7rem;color:var(--fg-dim);grid-column:1/-1;text-align:right;margin-top:-4px">' + threshold + '</div>' +
      '</div>'
    );
  }
  return (
    '<div class="section-num"><span class="no">03 · 5-5-5-5 Test</span><span>Hard Filters</span></div>' +
    '<div>' +
      item('Dividend Yield', yld == null ? '—' : window.MMUtils.fmtPercent(yld), '≥ 5%', yld != null && yld >= 5) +
      item('Dividend Streak', streak == null ? '—' : (streak + ' yr'), '≥ 5 yr', streak != null && streak >= 5) +
      item('EPS Positive 5/5', epsPos == null ? '—' : (epsPos + '/5'), 'no loss years', epsPos != null && epsPos >= 5) +
      item('P/E', pe == null ? '—' : (window.MMUtils.fmtNum(pe, 1) + '×'), '≤ 15× (bonus ≤8×)', pe != null && pe <= 15) +
      item('P/BV', pb == null ? '—' : (window.MMUtils.fmtNum(pb, 2) + '×'), '≤ 1.5× (bonus ≤1×)', pb != null && pb <= 1.5) +
      item('Market Cap', mcap == null ? '—' : window.MMUtils.fmtCompact(mcap), '≥ 5B THB', mcap != null && mcap >= 5e9) +
    '</div>'
  );
}

function _renderPattern(patterns) {
  var esc = window.MMUtils.escapeHtml;
  var matched = (patterns && patterns.matched_patterns) || [];
  if (!matched.length) {
    return (
      '<div class="section-num"><span class="no">04 · Pattern</span><span>No Match</span></div>' +
      '<p style="text-align:center;padding:16px;font-family:var(--font-head);font-style:italic;color:var(--fg-dim);font-size:0.9rem">— ไม่มี case study pattern —</p>'
    );
  }
  var body = matched.map(function (p) {
    return (
      '<div class="pattern-block" style="border-top:3px double var(--border-subtle);border-bottom:3px double var(--border-subtle);padding:20px 0;margin:20px 0">' +
        '<div class="pattern-label" style="font-family:var(--font-mono);font-size:0.65rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--fg-dim);margin-bottom:8px">Matched Pattern</div>' +
        '<div class="pattern-name" style="font-family:var(--font-head);font-weight:900;font-size:1.3rem;line-height:1;color:var(--c-positive);margin-bottom:14px">' + esc(p.tag || '') + '</div>' +
        '<div class="pattern-body" style="font-family:var(--font-body);font-size:0.95rem;line-height:1.65;font-style:italic;color:var(--fg-secondary)"><p>' + esc(p.narrative || '') + '</p></div>' +
      '</div>'
    );
  }).join('');
  return (
    '<div class="section-num"><span class="no">04 · Pattern</span><span>Matched</span></div>' + body
  );
}

function _renderKeyNumbers(stock) {
  var rows = stock.five_year_history || [];
  if (!rows.length) return '';
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
    '<div class="section-num"><span class="no">05 · Key Numbers</span><span>5 yr</span></div>' +
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
  if (!rows.length) return '';
  return (
    '<div class="section-num"><span class="no">06 · Dividend History</span><span>10 yr</span></div>' +
    '<div class="chart-box" style="height:220px"><canvas id="v6-mdps-chart"></canvas></div>'
  );
}

function _renderScoreHistory(history) {
  var timeline = ((history || {}).timeline || []).filter(function (t) { return t.score != null; });
  if (!timeline.length) return '';
  return (
    '<div class="section-num"><span class="no">07 · Score History</span><span>' + timeline.length + ' scans</span></div>' +
    '<div class="chart-box" style="height:220px"><canvas id="v6-mscorehist-chart"></canvas></div>'
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

  return (
    '<div class="section-num"><span class="no">08 · Exit Baseline</span><span>Watchlist</span></div>' +
    '<div class="exit-panel" style="border:3px double var(--c-positive);padding:18px;margin:20px 0">' +
      '<div class="head" style="font-family:var(--font-mono);font-size:0.7rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--c-positive);margin-bottom:12px">Current · ' + sevBadge + '</div>' +
      '<p style="font-style:italic;color:var(--fg-secondary);margin-bottom:14px;font-size:0.9rem">' + esc(exitStatus.narrative || '') + '</p>' +
      '<div class="exit-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:14px 0;border-top:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle);margin:14px 0">' +
        '<div class="exit-cell"><span class="lbl" style="font-family:var(--font-mono);font-size:0.6rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--fg-dim)">Entry Date</span><span class="v" style="font-family:var(--font-mono);font-size:1.1rem;font-weight:500;display:block;margin-top:3px">' + entryDate + '</span></div>' +
        '<div class="exit-cell"><span class="lbl" style="font-family:var(--font-mono);font-size:0.6rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--fg-dim)">Entry PE</span><span class="v" style="font-family:var(--font-mono);font-size:1.1rem;font-weight:500;display:block;margin-top:3px">' + entryPE + '</span></div>' +
        '<div class="exit-cell"><span class="lbl" style="font-family:var(--font-mono);font-size:0.6rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--fg-dim)">Entry Yld</span><span class="v" style="font-family:var(--font-mono);font-size:1.1rem;font-weight:500;display:block;margin-top:3px">' + entryYld + '</span></div>' +
        '<div class="exit-cell"><span class="lbl" style="font-family:var(--font-mono);font-size:0.6rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--fg-dim)">Δ Score</span><span class="v" style="font-family:var(--font-mono);font-size:1.1rem;font-weight:500;display:block;margin-top:3px">' + dStr + '</span></div>' +
      '</div>' +
    '</div>'
  );
}

function _renderDeepAnalyze() {
  return (
    '<div class="analyze-block" id="v6-mdeep-analyze" style="padding:20px 18px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:18px;text-align:center;margin-top:28px;border-top:3px double var(--border-subtle)">' +
      _renderAnalyzeInitialInner() +
    '</div>'
  );
}

function _renderAnalyzeInitialInner() {
  return (
    '<h2 style="font-family:var(--font-head);font-weight:900;font-size:1.5rem;line-height:1.15;margin:6px 0 8px">ขอวิเคราะห์เจาะลึก</h2>' +
    '<p style="font-family:var(--font-head);font-style:italic;color:var(--fg-dim);font-size:0.95rem;margin-bottom:16px">ให้ Claude Opus วิเคราะห์ตามกรอบ ดร.นิเวศน์ 5 ด้าน + verdict สำหรับ DCA 10-20 ปี เน้นปันผลสะสม</p>' +
    '<button class="btn primary" id="v6-mdeep-btn" style="padding:12px 22px;border-radius:999px;font-weight:700;min-height:48px">ขอวิเคราะห์เพิ่มเติม</button>' +
    '<div style="margin-top:12px;font-family:var(--font-mono);font-size:0.62rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--fg-mute)">Cached 7 days · API MAX_ANTHROPIC_API_KEY</div>'
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
      '<div style="font-family:var(--font-head);font-style:italic;color:var(--c-negative);margin-bottom:14px;font-size:0.95rem">' + esc(msg || 'Timeout · server ไม่ตอบกลับ') + '</div>' +
      '<button class="btn primary" id="v6-mdeep-btn" style="padding:12px 22px;border-radius:999px;font-weight:700;min-height:48px">ลองอีกครั้ง</button>' +
    '</div>'
  );
}

function _renderAnalyzeResult(data) {
  var esc = window.MMUtils.escapeHtml;
  var analyzedAt = data.analyzed_at
    ? (window.MMUtils.fmtDateThaiShort(data.analyzed_at) + ' · Claude Opus')
    : 'Claude Opus';
  var verdictRaw = String(data.verdict || '').trim();
  var verdictClass = 'hold';
  var badge = 'HOLD';
  if (/^\s*BUY\b/i.test(verdictRaw)) { verdictClass = 'buy'; badge = 'BUY'; }
  else if (/^\s*SELL\b/i.test(verdictRaw)) { verdictClass = 'sell'; badge = 'SELL'; }
  var verdictWhy = verdictRaw.replace(/^(BUY|HOLD|SELL)\s*[:\-·—]?\s*/i, '');
  var badgeBg = verdictClass === 'buy'
    ? 'var(--c-positive)'
    : (verdictClass === 'sell' ? 'var(--c-negative)' : 'var(--fg-dim)');
  var verdictCardBg = verdictClass === 'buy'
    ? 'var(--c-positive-soft)'
    : (verdictClass === 'sell' ? 'var(--c-negative-soft)' : 'var(--bg-surface-2, #ebebe4)');
  var verdictBorder = verdictClass === 'buy'
    ? 'var(--c-positive-border)'
    : (verdictClass === 'sell' ? 'var(--c-negative-border)' : 'var(--border-subtle)');

  function _section(icon, title, text) {
    if (!text) return '';
    return (
      '<div class="sec" style="padding:14px 0;border-top:1px solid var(--border-subtle)">' +
        '<h4 style="margin:0 0 6px;font-size:0.95rem;font-weight:800;color:var(--c-positive-strong);display:flex;align-items:center;gap:8px">' +
          '<span style="width:22px;height:22px;border-radius:6px;background:var(--c-positive-soft);display:inline-grid;place-items:center;font-size:11px">' + icon + '</span>' +
          title +
        '</h4>' +
        '<p style="margin:0;font-size:0.92rem;color:var(--fg-secondary);line-height:1.6">' + esc(text) + '</p>' +
      '</div>'
    );
  }

  var toArtParas = String(data.to_art || '').split(/\n\n+/).filter(Boolean).map(function (p) {
    return '<p style="margin:0 0 10px;font-size:0.92rem;color:var(--fg-primary);line-height:1.6">' + esc(p) + '</p>';
  }).join('');
  var artTalk = data.to_art
    ? (
      '<div class="sec art-talk" style="background:var(--c-positive-tint);margin:14px -18px -2px;padding:16px 18px 18px;border-radius:0 0 18px 18px;border-top:1px solid var(--c-positive-border)">' +
        '<h4 style="margin:0 0 8px;font-size:0.95rem;font-weight:800;color:var(--c-positive-strong);display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<span style="width:22px;height:22px;border-radius:6px;background:var(--c-positive);color:#fff;display:inline-grid;place-items:center;font-size:11px">💬</span>' +
          'Max คุยกับอาร์ท' +
          '<span style="font-size:0.58rem;font-weight:700;padding:3px 10px;border-radius:999px;background:var(--bg-surface);color:var(--fg-secondary);border:1px solid var(--border-subtle);font-family:var(--font-mono);letter-spacing:0.05em;text-transform:none">เสาหลัก 1 · พอร์ตปันผล 100M</span>' +
        '</h4>' +
        toArtParas +
      '</div>'
    )
    : '';

  return (
    '<div style="text-align:left">' +
      '<div style="font-family:var(--font-mono);font-size:0.6rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--fg-dim);margin-bottom:14px;display:flex;justify-content:space-between">' +
        '<span>' + esc(analyzedAt) + '</span>' +
        '<span>Cache 7 วัน</span>' +
      '</div>' +
      '<div class="verdict ' + verdictClass + '" style="padding:14px 16px;border-radius:12px;background:' + verdictCardBg + ';border:1px solid ' + verdictBorder + ';margin-bottom:16px;display:flex;align-items:center;gap:12px">' +
        '<span style="padding:5px 12px;border-radius:8px;font-weight:800;font-size:0.8rem;letter-spacing:0.04em;background:' + badgeBg + ';color:#fff">' + badge + '</span>' +
        '<span style="font-size:0.9rem;color:var(--fg-primary);line-height:1.45;flex:1">' + esc(verdictWhy || verdictRaw) + '</span>' +
      '</div>' +
      _section('💵', 'Dividend Sustainability', data.dividend) +
      _section('💎', 'Hidden Value Audit', data.hidden) +
      _section('🏛️', 'Business Moat', data.moat) +
      _section('⚖️', 'Valuation Discipline', data.valuation) +
      artTalk +
    '</div>'
  );
}

function _buildMobileReportHtml(stock, patterns, history, exitStatus) {
  return (
    _renderArticleHead(stock, patterns) +
    _renderTheCase(stock) +
    _renderScore(stock) +
    _renderChecklist(stock) +
    _renderPattern(patterns) +
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
    } else {
      _attachClick(sym, block);
    }
  }).catch(function () {
    _attachClick(sym, block);
  });
}

function _attachClick(sym, block) {
  var btn = block.querySelector('#v6-mdeep-btn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    _stopPoll();
    block.innerHTML = _renderAnalyzeLoadingInner();
    window.MMApi.post('/api/stock/' + encodeURIComponent(sym) + '/analyze', {}).then(function (payload) {
      if (_hasAnalysisData(payload)) {
        block.innerHTML = _renderAnalyzeResult(payload);
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
