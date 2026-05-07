/* ==========================================================
   MAX MAHON v6 — Home page (mobile)
   Ports web-v6-mockup/mobile/01-home.html → live data.
   Single-column card stack, compact masthead, bottom nav.
   ========================================================== */

export async function mount(container) {
  window.MMComponents.renderLoading(container, 'Loading issue');

  let screener, trend, status;
  try {
    [screener, trend, status] = await Promise.all([
      window.MMApi.get('/api/screener'),
      window.MMApi.get('/api/screener/trend?weeks=12'),
      window.MMApi.get('/api/status'),
    ]);
  } catch (e) {
    window.MMComponents.renderError(container, e.message, function () { mount(container); });
    return;
  }

  _updateMasthead(status);
  _ensureChartJs().then(function () {
    container.innerHTML = _buildMobileHomeHtml(screener, trend);
    _mountTrendChart(trend);
    _wireControls(screener);
  });
}

function _updateMasthead(status) {
  var host = document.getElementById('masthead');
  if (!host) return;
  var date = status && status.last_data_date
    ? window.MMUtils.fmtDateLong(status.last_data_date).toUpperCase()
    : window.MMUtils.fmtDateLong(new Date()).toUpperCase();
  host.innerHTML = window.MMComponents.renderMobileMastHead(window.__MM_ME, 'Max Mahon');
  // Mobile masthead has no top nav — keep shell's bottom nav active
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

function _renderCard(stock) {
  var esc = window.MMUtils.escapeHtml;
  var sym = esc(stock.symbol || '');
  var name = esc(stock.name || '');
  var metrics = stock.metrics || {};
  var yieldPct = metrics.dividend_yield;
  var pe = metrics.pe;
  var pb = metrics.pb_ratio;
  var mcap = metrics.mcap;

  var signals = stock.signals || [];
  var tags = '';
  if (signals.indexOf('NIWES_5555') !== -1) tags += '<span class="tag primary">Niwes 5-5-5-5</span>';
  if (signals.indexOf('HIDDEN_VALUE') !== -1) tags += '<span class="tag">Hidden Value</span>';
  if (signals.indexOf('DEEP_VALUE') !== -1) tags += '<span class="tag">Deep Value</span>';
  if (signals.indexOf('QUALITY_DIVIDEND') !== -1) tags += '<span class="tag">Quality Div</span>';

  var scoreCurr = stock.score == null ? 0 : Math.round(stock.score);
  var prevScore = stock.previous_score;
  var delta = window.MMUtils.fmtScoreDelta(prevScore, scoreCurr);
  var deltaArrowStyle = (prevScore != null && scoreCurr < prevScore) ? ' style="color:var(--fg-dim)"' : '';
  var ribbon = stock.is_new_this_week ? '<div class="new-ribbon">New</div>' : '';

  var yieldStr = yieldPct == null ? '—' : window.MMUtils.fmtPercent(yieldPct);
  var peStr = pe == null ? '—' : window.MMUtils.fmtNum(pe, 1);
  var pbStr = pb == null ? '—' : window.MMUtils.fmtNum(pb, 2);
  var mcapStr = mcap == null ? '—' : window.MMUtils.fmtCompact(mcap);

  var price = metrics.current_price;
  var priceStr = price == null ? null : '฿' + window.MMUtils.fmtNum(price, 2);
  var asOf = stock.price_as_of ? window.MMUtils.fmtDateThaiShort(stock.price_as_of) : null;
  var priceRow = '';
  if (priceStr) {
    priceRow =
      '<div class="card-price-row" style="display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;padding-top:8px;border-top:1px dashed var(--border-subtle);font-family:var(--font-mono)">' +
        '<span style="font-weight:700;font-size:0.95rem;color:var(--fg-primary)">' + priceStr + '</span>' +
        (asOf ? '<span style="font-size:0.7rem;color:var(--fg-dim)">ณ ' + esc(asOf) + '</span>' : '') +
      '</div>';
  }

  var starHtml = '<span class="v6-star" data-mm-star data-sym="' + sym + '" data-watched="' + (stock.in_watchlist ? 'true' : 'false') + '" title="Toggle watchlist">★</span>';

  return (
    '<article class="card" data-sym="' + sym + '">' +
      ribbon +
      '<div class="card-head"><div>' +
        '<div class="card-sym">' + sym + '</div>' +
        '<div class="card-name">' + name + '</div>' +
      '</div>' + starHtml + '</div>' +
      '<div class="card-tags">' + tags + '</div>' +
      '<div class="card-score-row">' +
        '<div><span class="score-big">' + scoreCurr + '</span><span class="score-max">/100</span></div>' +
        '<div class="score-delta"><span class="arrow"' + deltaArrowStyle + '>' + delta.arrow + '</span>' + esc(delta.text) + '</div>' +
      '</div>' +
      '<div class="card-metrics">' +
        '<div><span class="lbl">Yld</span><span class="v">' + yieldStr + '</span></div>' +
        '<div><span class="lbl">P/E</span><span class="v">' + peStr + '</span></div>' +
        '<div><span class="lbl">P/BV</span><span class="v">' + pbStr + '</span></div>' +
        '<div><span class="lbl">Mcap</span><span class="v">' + mcapStr + '</span></div>' +
      '</div>' +
      priceRow +
    '</article>'
  );
}

function _buildMobileHomeHtml(screener, trend) {
  var esc = window.MMUtils.escapeHtml;
  var s = screener.summary || {};
  var passed = s.passed_count || 0;
  var total = s.total_scanned || 0;
  var avgYield = s.avg_yield == null ? 0 : s.avg_yield;
  var topScore = s.top_score || 0;
  var candidates = screener.candidates || [];
  var tWeeks = (trend && trend.weeks) || [];
  var tLast = tWeeks.length ? tWeeks[tWeeks.length - 1].scanned_at : null;
  var tLine = '';
  if (tLast) {
    var td = new Date(tLast);
    var tf = td.toLocaleString('th-TH', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
    tLine = '<div class="micro" style="color:var(--fg-dim);margin-bottom:4px">อัพเดตล่าสุด: ' + tf + '</div>';
  }

  var lede =
    '<div style="padding:14px 0 12px;text-align:center;border-bottom:1px solid var(--border-subtle);margin-top:12px">' +
      '<div class="micro" style="margin-bottom:6px">Latest Issue</div>' +
      '<h2 style="font-family:var(--font-head);font-weight:900;line-height:1.15;font-size:1.45rem">' +
        passed + ' names cleared 5-5-5-5 this week.' +
      '</h2>' +
      '<p class="lede" style="margin:10px 0 0;font-size:0.95rem">Universe ' + total + ' · avg yield ' +
        window.MMUtils.fmtNum(avgYield, 1) + '% · top score ' + topScore + '.</p>' +
    '</div>';

  var summary =
    '<section class="summary-strip">' +
      '<div class="summary-cell"><span class="label">Scanned</span><span class="val mono">' + total + '</span></div>' +
      '<div class="summary-cell"><span class="label">Passed</span><span class="val mono">' + passed + '</span></div>' +
      '<div class="summary-cell"><span class="label">Avg Yield</span><span class="val mono">' + window.MMUtils.fmtNum(avgYield, 1) + '%</span></div>' +
      '<div class="summary-cell"><span class="label">Top Score</span><span class="val mono">' + topScore + '</span></div>' +
    '</section>';

  var trendBox =
    '<div style="padding:12px 0;border-bottom:1px solid var(--border-subtle)">' +
      '<div class="micro" style="margin-bottom:6px">Pass Count · Trailing 12 Weeks</div>' +
      tLine +
      '<div style="height:120px"><canvas id="v6-mhome-trend"></canvas></div>' +
    '</div>';

  var sectionHdr =
    '<div class="section-num"><span class="no">01 · Watchlist</span><span>' + candidates.length + ' names</span></div>';

  var sectorSet = {};
  for (var i = 0; i < candidates.length; i++) {
    var s = candidates[i].sector;
    if (s) sectorSet[s] = true;
  }
  var sectorList = Object.keys(sectorSet).sort();
  var escSec = (window.MMUtils && window.MMUtils.escapeHtml) ? window.MMUtils.escapeHtml : function (v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  var sectorChips = sectorList.map(function (sec) {
    var attr = String(sec).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return '<button class="filter-chip" data-sector="' + attr + '">' + escSec(sec) + '</button>';
  }).join('');
  var sectorGroup = sectorList.length
    ? '<div class="filter-group">' +
        '<span class="lbl">Sector</span>' +
        sectorChips +
      '</div>'
    : '';
  var filter =
    '<div class="filter-bar" id="v6-mhome-filters">' +
      '<div class="filter-group">' +
        '<span class="lbl">Sort</span>' +
        '<button class="filter-chip active" data-sort="score">Score</button>' +
        '<button class="filter-chip" data-sort="yield">Yield</button>' +
        '<button class="filter-chip" data-sort="pe">P/E</button>' +
        '<button class="filter-chip" data-sort="delta">Δ</button>' +
      '</div>' +
      sectorGroup +
    '</div>';

  var emptyState = '';
  if (!candidates.length) {
    emptyState =
      '<section style="padding:40px 0;text-align:center">' +
        '<p style="font-family:var(--font-head);font-style:italic;color:var(--fg-secondary)">ยังไม่มีหุ้นที่ผ่านเกณฑ์ในรอบนี้</p>' +
      '</section>';
  }

  var body =
    '<section class="card-grid" id="v6-mhome-grid"></section>' +
    '<div class="ornament"></div>' +
    '<div class="text-c" id="v6-mhome-pager" style="padding:20px 0"></div>';

  return lede + summary + trendBox + sectionHdr + filter + (candidates.length ? body : emptyState);
}

function _mountTrendChart(trend) {
  var canvas = document.getElementById('v6-mhome-trend');
  if (!canvas || !window.Chart) return;
  var weeks = (trend && trend.weeks) || [];
  var root = getComputedStyle(document.documentElement);
  var textInk = root.getPropertyValue('--ink').trim();
  var inkDim = root.getPropertyValue('--ink-dim').trim();
  var ruleHair = (getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim() || 'rgba(59,64,80,0.15)');
  window.Chart.defaults.font.family = 'Inter, sans-serif';
  window.Chart.defaults.color = inkDim;
  new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: weeks.map(function (w) { return w.week_label || ''; }),
      datasets: [{ data: weeks.map(function (w) { return w.passed || 0; }), backgroundColor: textInk, borderWidth: 0, barThickness: 10 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, border: { color: ruleHair }, ticks: { font: { size: 9 } } },
        y: { grid: { color: ruleHair }, border: { display: false }, ticks: { font: { size: 9 } }, suggestedMin: 0 }
      }
    }
  });
}

var _state = { sort: 'score', sectors: [], page: 1, pageSize: 10, all: [] };

function _applyFilterSort() {
  var arr = _state.all.slice();
  if (_state.sectors && _state.sectors.length > 0) {
    arr = arr.filter(function (c) {
      return _state.sectors.indexOf(c.sector) !== -1;
    });
  }
  arr.sort(function (a, b) {
    if (_state.sort === 'score') return (b.score || 0) - (a.score || 0);
    if (_state.sort === 'yield') return ((b.metrics || {}).dividend_yield || 0) - ((a.metrics || {}).dividend_yield || 0);
    if (_state.sort === 'pe') return ((a.metrics || {}).pe || 999) - ((b.metrics || {}).pe || 999);
    if (_state.sort === 'delta') return (b.score_delta || 0) - (a.score_delta || 0);
    return 0;
  });
  return arr;
}

function _renderGrid() {
  var grid = document.getElementById('v6-mhome-grid');
  var pager = document.getElementById('v6-mhome-pager');
  if (!grid) return;
  var filtered = _applyFilterSort();
  var visible = filtered.slice(0, _state.page * _state.pageSize);
  grid.innerHTML = visible.map(_renderCard).join('');
  Array.prototype.forEach.call(grid.querySelectorAll('.card'), function (card) {
    card.addEventListener('click', function () {
      var sym = card.getAttribute('data-sym');
      if (sym) location.href = '/m/report/' + encodeURIComponent(sym);
    });
  });
  _wireStarButtons(grid);
  if (pager) {
    var remaining = filtered.length - visible.length;
    if (remaining > 0) {
      pager.innerHTML = '<button class="btn ghost" id="v6-mhome-loadmore">Load ' + remaining + ' more →</button>';
      var btn = document.getElementById('v6-mhome-loadmore');
      if (btn) btn.addEventListener('click', function () { _state.page++; _renderGrid(); });
    } else {
      pager.innerHTML = '';
    }
  }
}

function _wireStarButtons(container) {
  if (!container) return;
  container.querySelectorAll('[data-mm-star]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var sym = el.getAttribute('data-sym');
      var watched = el.getAttribute('data-watched') === 'true';
      var body = watched ? { remove: [sym] } : { add: [sym] };
      window.MMApi.put('/api/user/watchlist', body).then(function () {
        el.setAttribute('data-watched', String(!watched));
      }).catch(function (err) {
        console.error('watchlist toggle failed', err);
      });
    });
  });
}

function _wireControls(screener) {
  _state.all = screener.candidates || [];
  _state.page = 1;
  var bar = document.getElementById('v6-mhome-filters');
  if (bar) {
    Array.prototype.forEach.call(bar.querySelectorAll('[data-sort]'), function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(bar.querySelectorAll('[data-sort]'), function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _state.sort = btn.getAttribute('data-sort');
        _state.page = 1;
        _renderGrid();
      });
    });
    Array.prototype.forEach.call(bar.querySelectorAll('[data-sector]'), function (btn) {
      btn.addEventListener('click', function () {
        var sector = btn.getAttribute('data-sector');
        var idx = _state.sectors.indexOf(sector);
        if (idx >= 0) {
          _state.sectors.splice(idx, 1);
          btn.classList.remove('active');
        } else {
          _state.sectors.push(sector);
          btn.classList.add('active');
        }
        _state.page = 1;
        _renderGrid();
      });
    });
  }
  _renderGrid();
}
