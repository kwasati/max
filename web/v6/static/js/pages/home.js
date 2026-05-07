/* ==========================================================
   MAX MAHON v6 — Home page (desktop)
   Ports web-v6-mockup/desktop/01-home.html → live data.
   All sample content replaced with /api/screener,
   /api/screener/trend, /api/status calls.
   ========================================================== */

// Public: shell imports this module and calls mount()
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
    container.innerHTML = _buildHomeHtml(screener, trend);
    _mountTrendChart(trend);
    _wireControls(screener);
  });
}

// ----- Masthead re-render with live status -----
function _updateMasthead(status) {
  var host = document.getElementById('masthead');
  if (!host) return;
  host.innerHTML = window.MMComponents.renderMasthead({ active: 'home' }, window.__MM_ME);
}

// ----- Chart.js loader -----
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

// ----- Card renderer -----
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
  if (signals.indexOf('NIWES_5555') !== -1) {
    tags += '<span class="tag primary">Niwes 5-5-5-5</span>';
  }
  if (signals.indexOf('HIDDEN_VALUE') !== -1) {
    tags += '<span class="tag">Hidden Value</span>';
  }
  if (signals.indexOf('DEEP_VALUE') !== -1) {
    tags += '<span class="tag">Deep Value</span>';
  }
  if (signals.indexOf('QUALITY_DIVIDEND') !== -1) {
    tags += '<span class="tag">Quality Div</span>';
  }

  var scoreCurr = stock.score == null ? 0 : Math.round(stock.score);
  var prevScore = stock.previous_score;
  var delta = window.MMUtils.fmtScoreDelta(prevScore, scoreCurr);
  var streak = stock.score_streak_weeks;
  var deltaArrowStyle = '';
  if (prevScore != null && scoreCurr < prevScore) {
    deltaArrowStyle = ' style="color:var(--ink-dim)"';
  }
  var streakLine = '';
  if (streak && streak >= 2) {
    streakLine = '<br>' + esc(streak + ' wk streak');
  } else if (prevScore == null) {
    streakLine = '<br>first pass';
  }

  var ribbon = stock.is_new_this_week
    ? '<div class="new-ribbon">New</div>'
    : '';

  var yieldStr = yieldPct == null ? '—' : window.MMUtils.fmtPercent(yieldPct);
  var peStr = pe == null ? '—' : window.MMUtils.fmtNum(pe, 1);
  var pbStr = pb == null ? '—' : window.MMUtils.fmtNum(pb, 2);
  var mcapStr = mcap == null ? '—' : window.MMUtils.fmtCompact(mcap);

  var price = metrics.current_price;
  var priceStr = price == null ? null : '฿' + window.MMUtils.fmtNum(price, 2);
  var asOf = stock.price_as_of ? window.MMUtils.fmtDateThaiShort(stock.price_as_of) : null;
  var priceRow = '';
  if (priceStr) {
    var asOfLabel = asOf ? ' · ณ ' + asOf : '';
    priceRow =
      '<div class="card-price-row" style="display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;padding-top:8px;border-top:1px dashed var(--border-subtle);font-family:var(--font-mono)">' +
        '<span style="font-weight:700;font-size:1rem;color:var(--fg-primary)">' + priceStr + '</span>' +
        '<span style="font-size:0.7rem;color:var(--fg-dim)">' + esc(asOfLabel.replace(/^ · /, '')) + '</span>' +
      '</div>';
  }

  var starHtml = '<span class="v6-star compact" data-mm-star data-sym="' + sym + '" data-watched="' + (stock.in_watchlist ? 'true' : 'false') + '" title="Toggle watchlist">★</span>';

  return (
    '<article class="card" data-sym="' + sym + '">' +
      ribbon +
      '<div class="card-head">' +
        '<div>' +
          '<div class="card-sym">' + sym + '</div>' +
          '<div class="card-name">' + name + '</div>' +
        '</div>' +
        starHtml +
      '</div>' +
      '<div class="card-tags">' + tags + '</div>' +
      '<div class="card-score-row">' +
        '<div><span class="score-big">' + scoreCurr + '</span><span class="score-max">/100</span></div>' +
        '<div class="score-delta"><span class="arrow"' + deltaArrowStyle + '>' + delta.arrow + '</span>' + esc(delta.text) + streakLine + '</div>' +
      '</div>' +
      '<div class="card-metrics">' +
        '<div><span class="lbl">Yield</span><span class="v">' + yieldStr + '</span></div>' +
        '<div><span class="lbl">P/E</span><span class="v">' + peStr + '</span></div>' +
        '<div><span class="lbl">P/BV</span><span class="v">' + pbStr + '</span></div>' +
        '<div><span class="lbl">Mcap</span><span class="v">' + mcapStr + '</span></div>' +
      '</div>' +
      priceRow +
    '</article>'
  );
}

// ----- Summary / lede strip -----
function _buildLedeAndSummary(screener) {
  var s = screener.summary || {};
  var esc = window.MMUtils.escapeHtml;
  var passed = s.passed_count || 0;
  var avgYield = s.avg_yield == null ? 0 : s.avg_yield;
  var topScore = s.top_score || 0;
  var newEnt = s.new_entrants || 0;
  var total = s.total_scanned || 0;
  var topSyms = (screener.candidates || [])
    .slice()
    .sort(function (a, b) { return (b.score || 0) - (a.score || 0); })
    .slice(0, 5);
  var topSymLabel = topSyms.length ? topSyms[0].symbol : '—';

  var ledeHtml =
    '<section class="headline" style="padding:var(--sp-6) 0 var(--sp-5)">' +
      '<h1 style="font-family:var(--font-head);font-weight:800;font-size:var(--fs-2xl);line-height:1.15;letter-spacing:-0.015em;margin-bottom:var(--sp-3);color:var(--fg-primary)">' +
        passed + ' names cleared the 5-5-5-5 gate this week.' +
      '</h1>' +
      '<p style="font-family:var(--font-body);font-size:var(--fs-md);color:var(--fg-secondary);line-height:1.5;max-width:68ch">' +
        esc(newEnt) + ' first-time entrants. Average yield held at ' +
        esc(window.MMUtils.fmtNum(avgYield, 1)) + '%, with top scorer ' +
        esc(topSymLabel) + ' clearing ' + esc(topScore) + ' on the Niwes Dividend-First scale. ' +
        'The universe stood at ' + esc(total) + '.' +
      '</p>' +
    '</section>';

  var summaryHtml =
    '<section class="summary-strip">' +
      '<div class="summary-cell"><span class="label">Scanned</span><span class="val mono">' + total + '</span></div>' +
      '<div class="summary-cell"><span class="label">Passed</span><span class="val mono">' + passed + '</span></div>' +
      '<div class="summary-cell"><span class="label">Review Bucket</span><span class="val mono">' + (s.review_count || 0) + '</span></div>' +
      '<div class="summary-cell"><span class="label">Avg Yield</span><span class="val mono">' + window.MMUtils.fmtNum(avgYield, 1) + '<span style="font-size:0.7em">%</span></span></div>' +
      '<div class="summary-cell"><span class="label">Top Score</span><span class="val mono">' + topScore + '</span></div>' +
      '<div class="summary-cell"><span class="label">New Entrants</span><span class="val mono">' + newEnt + '</span></div>' +
      '<div class="summary-cell"><span class="label">Sectors</span><span class="val mono">' + (s.sectors || 0) + '</span></div>' +
    '</section>';

  return ledeHtml + summaryHtml;
}

// ----- Trend + leaders strip -----
function _buildTrendStrip(screener, trend) {
  var esc = window.MMUtils.escapeHtml;
  var topSyms = (screener.candidates || [])
    .slice()
    .sort(function (a, b) { return (b.score || 0) - (a.score || 0); })
    .slice(0, 5);
  var leadersHtml = '';
  topSyms.forEach(function (s) {
    var yld = (s.metrics || {}).dividend_yield;
    leadersHtml +=
      '<li>' +
        '<span class="sym">' + esc(s.symbol) + '</span>' +
        '<span class="val">' + (s.score == null ? '—' : Math.round(s.score)) +
        ' · Yld ' + (yld == null ? '—' : window.MMUtils.fmtPercent(yld, 1)) +
        '</span>' +
      '</li>';
  });
  if (!leadersHtml) leadersHtml = '<li><span class="val" style="color:var(--ink-dim);font-style:italic">No leaders this week</span></li>';

  var weeks = (trend && trend.weeks) || [];
  var lastScanned = weeks.length ? weeks[weeks.length - 1].scanned_at : null;
  var scanLine = '';
  if (lastScanned) {
    var d = new Date(lastScanned);
    var fmt = d.toLocaleString('th-TH', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
    scanLine = '<div class="micro" style="color:var(--fg-dim);margin-bottom:var(--sp-2)">อัพเดตล่าสุด: ' + fmt + '</div>';
  }

  return (
    '<section class="mini-chart-strip" style="display:grid;grid-template-columns:2fr 1fr;gap:var(--sp-6);padding:var(--sp-5) 0;border-bottom:1px solid var(--rule);align-items:center">' +
      '<div>' +
        '<div class="micro" style="margin-bottom:var(--sp-2)">Pass Count · Trailing 12 Weeks</div>' +
        scanLine +
        '<div class="mini-chart-box" style="height:140px"><canvas id="v6-home-trend"></canvas></div>' +
      '</div>' +
      '<div class="strip-right" style="border-left:1px solid var(--rule-hair);padding-left:var(--sp-5)">' +
        '<h3 style="font-family:var(--font-head);font-weight:700;font-size:var(--fs-md);margin-bottom:var(--sp-3)">This Week\'s Leaders</h3>' +
        '<ul style="list-style:none;font-family:var(--font-body)">' + leadersHtml + '</ul>' +
      '</div>' +
    '</section>'
  );
}

// ----- Filter bar -----
function _buildFilterBar(totalCount, candidates) {
  candidates = candidates || [];
  var sectorSet = {};
  for (var i = 0; i < candidates.length; i++) {
    var s = candidates[i].sector;
    if (s) sectorSet[s] = true;
  }
  var sectors = Object.keys(sectorSet).sort();
  var escSec = (window.MMUtils && window.MMUtils.escapeHtml) ? window.MMUtils.escapeHtml : function (v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  var sectorChips = sectors.map(function (sec) {
    var attr = String(sec).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return '<button class="filter-chip" data-sector="' + attr + '">' + escSec(sec) + '</button>';
  }).join('');
  var sectorGroup = sectors.length
    ? '<div class="filter-group">' +
        '<span class="lbl">Sector</span>' +
        sectorChips +
      '</div>'
    : '';
  return (
    '<div class="filter-bar" style="margin-bottom:var(--sp-5)" id="v6-home-filters">' +
      '<div class="filter-group">' +
        '<span class="lbl">Sort</span>' +
        '<button class="filter-chip active" data-sort="score">Score</button>' +
        '<button class="filter-chip" data-sort="yield">Yield</button>' +
        '<button class="filter-chip" data-sort="pe">P/E</button>' +
        '<button class="filter-chip" data-sort="pb">P/BV</button>' +
        '<button class="filter-chip" data-sort="delta">&Delta; Score</button>' +
      '</div>' +
      '<div class="filter-group">' +
        '<span class="lbl">Signal</span>' +
        '<button class="filter-chip active" data-signal="ALL">All</button>' +
        '<button class="filter-chip" data-signal="NIWES_5555">Niwes 5-5-5-5</button>' +
        '<button class="filter-chip" data-signal="HIDDEN_VALUE">Hidden Value</button>' +
        '<button class="filter-chip" data-signal="DEEP_VALUE">Deep Value</button>' +
        '<button class="filter-chip" data-signal="QUALITY_DIVIDEND">Quality Div</button>' +
      '</div>' +
      sectorGroup +
      '<div class="filter-group">' +
        '<span class="lbl" style="margin-right:0">Showing</span>' +
        '<span class="val mono" style="color:var(--ink);font-weight:500" id="v6-home-count">— of ' + totalCount + '</span>' +
      '</div>' +
    '</div>'
  );
}

// ----- Top-level assembly -----
function _buildHomeHtml(screener, trend) {
  var candidates = (screener.candidates || []).slice();
  var sectionHdr =
    '<div class="filter-bar" style="margin-bottom:0">' +
      '<strong style="font-family:var(--font-head);font-weight:700;font-size:var(--fs-md);color:var(--fg-primary);letter-spacing:normal;text-transform:none">Watchlist</strong>' +
      '<span style="color:var(--fg-dim)">' + candidates.length + ' names · Sorted by score · Descending</span>' +
    '</div>';

  var emptyState = '';
  if (candidates.length === 0) {
    emptyState =
      '<section style="padding:var(--sp-7) 0;text-align:center">' +
        '<p style="font-size:var(--fs-lg);color:var(--fg-secondary)">' +
          'ยังไม่มีหุ้นที่ผ่านเกณฑ์ในรอบนี้' +
        '</p>' +
      '</section>';
  }

  var gridHtml =
    '<section class="card-grid" id="v6-home-grid"></section>' +
    '<section class="text-c" style="padding:var(--sp-5) 0" id="v6-home-pager"></section>';

  return _buildLedeAndSummary(screener) +
         _buildTrendStrip(screener, trend) +
         sectionHdr +
         _buildFilterBar(candidates.length, candidates) +
         (candidates.length ? gridHtml : emptyState);
}

// ----- Trend chart -----
function _mountTrendChart(trend) {
  var canvas = document.getElementById('v6-home-trend');
  if (!canvas || !window.Chart) return;
  var weeks = (trend && trend.weeks) || [];
  var labels = weeks.map(function (w) { return w.week_label || w.scan_date || ''; });
  var data = weeks.map(function (w) { return w.passed || 0; });
  var root = getComputedStyle(document.documentElement);
  var textInk = root.getPropertyValue('--fg-primary').trim();
  var inkDim = root.getPropertyValue('--fg-dim').trim();
  var ruleHair = (getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim() || 'rgba(59,64,80,0.15)');
  window.Chart.defaults.font.family = 'Inter, sans-serif';
  window.Chart.defaults.color = inkDim;
  new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: textInk,
        borderWidth: 0,
        barThickness: 14,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, border: { color: ruleHair }, ticks: { font: { size: 10 } } },
        y: { grid: { color: ruleHair, drawBorder: false }, border: { display: false }, ticks: { font: { size: 10 } }, suggestedMin: 0 }
      }
    }
  });
}

// ----- Client-side filter / sort / pagination -----
var _state = {
  sort: 'score',
  signal: 'ALL',
  sectors: [],
  page: 1,
  pageSize: 15,
  all: []
};

function _applyFilterSort() {
  var arr = _state.all.slice();
  if (_state.signal !== 'ALL') {
    arr = arr.filter(function (c) {
      return (c.signals || []).indexOf(_state.signal) !== -1;
    });
  }
  if (_state.sectors && _state.sectors.length > 0) {
    arr = arr.filter(function (c) {
      return _state.sectors.indexOf(c.sector) !== -1;
    });
  }
  arr.sort(function (a, b) {
    if (_state.sort === 'score') return (b.score || 0) - (a.score || 0);
    if (_state.sort === 'yield') {
      return ((b.metrics || {}).dividend_yield || 0) - ((a.metrics || {}).dividend_yield || 0);
    }
    if (_state.sort === 'pe') {
      return ((a.metrics || {}).pe || 999) - ((b.metrics || {}).pe || 999);
    }
    if (_state.sort === 'pb') {
      return ((a.metrics || {}).pb_ratio || 999) - ((b.metrics || {}).pb_ratio || 999);
    }
    if (_state.sort === 'delta') {
      return (b.score_delta || 0) - (a.score_delta || 0);
    }
    return 0;
  });
  return arr;
}

function _renderGrid() {
  var grid = document.getElementById('v6-home-grid');
  var pager = document.getElementById('v6-home-pager');
  var countEl = document.getElementById('v6-home-count');
  if (!grid) return;
  var filtered = _applyFilterSort();
  var visible = filtered.slice(0, _state.page * _state.pageSize);
  grid.innerHTML = visible.map(_renderCard).join('');
  // wire click
  Array.prototype.forEach.call(grid.querySelectorAll('.card'), function (card) {
    card.addEventListener('click', function () {
      var sym = card.getAttribute('data-sym');
      if (sym) location.href = '/report/' + encodeURIComponent(sym);
    });
  });
  _wireStarButtons(grid);
  // count label
  if (countEl) {
    countEl.textContent = visible.length + ' of ' + filtered.length;
  }
  // pager
  if (pager) {
    var remaining = filtered.length - visible.length;
    if (remaining > 0) {
      pager.innerHTML = '<button class="btn ghost" id="v6-home-loadmore">Load remaining ' + remaining + ' of ' + filtered.length + ' &rarr;</button>';
      var btn = document.getElementById('v6-home-loadmore');
      if (btn) btn.addEventListener('click', function () {
        _state.page++;
        _renderGrid();
      });
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
  var bar = document.getElementById('v6-home-filters');
  if (bar) {
    Array.prototype.forEach.call(bar.querySelectorAll('[data-sort]'), function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(bar.querySelectorAll('[data-sort]'), function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        _state.sort = btn.getAttribute('data-sort');
        _state.page = 1;
        _renderGrid();
      });
    });
    Array.prototype.forEach.call(bar.querySelectorAll('[data-signal]'), function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(bar.querySelectorAll('[data-signal]'), function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        _state.signal = btn.getAttribute('data-signal');
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
