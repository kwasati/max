/* ==========================================================
   MAX MAHON v6 — Settings (Mobile)
   Plan 08 Phase 2. Vanilla JS.
   Single-column stacked form with full-width sliders,
   7-chip day row (wraps), and sticky-bottom Save button.
   ========================================================== */

var DAYS = [
  { key: 'sun', label: 'Sun' },
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' }
];

var _state = {
  dirty: false,
  initial: null,
  mounted: false,
  opsPollHandle: null
};

export async function mount(container) {
  if (!container) return;
  _ensureStyles();

  window.MMComponents.renderLoading(container, 'Loading settings');

  var data;
  try {
    data = await window.MMApi.get('/api/settings');
  } catch (e) {
    window.MMComponents.renderError(container, e.message, function () { mount(container); });
    return;
  }

  _state.initial = _extractFormState(data);
  _state.dirty = false;

  container.innerHTML = _renderShell(data);

  _wireDaychips(container);
  _wireSwitch(container);
  _wireSliders(container);
  _wireRadios(container);
  _wireTimeInput(container);
  _wireSave(container, data);
  _wireDiscard(container, data);
  _wireDirtyTracking(container);
  _wireOperations(container);

  if (!_state.mounted) {
    _state.mounted = true;
    _attachUnsavedGuards();
  }

  _updateNextRunLabel(container);
}

// ----------------------------------------------------------
// Mobile-specific styles (touch-first, single-column)
// ----------------------------------------------------------
function _ensureStyles() {
  if (document.getElementById('mm-settings-mobile-styles')) return;
  var css =
    '.setting-block{border-bottom:1px solid var(--border-subtle);padding:20px 0}' +
    '.setting-label{font-family:var(--font-head);font-weight:700;font-size:1.05rem;margin-bottom:4px}' +
    '.setting-help{font-family:var(--font-head);font-style:italic;color:var(--fg-dim);' +
      'font-size:0.85rem;margin-bottom:14px}' +
    '.switch{display:inline-flex;align-items:center;cursor:pointer;gap:10px;' +
      'font-family:var(--font-mono);font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;' +
      'color:var(--fg-dim);min-height:44px}' +
    '.switch input{display:none}' +
    '.switch-box{width:48px;height:24px;border:1px solid var(--border-subtle);background:var(--bg-base);' +
      'position:relative;transition:background 120ms ease}' +
    '.switch-box::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;' +
      'background:var(--fg-primary);transition:left 160ms ease}' +
    '.switch.on .switch-box{background:var(--c-positive)}' +
    '.switch.on .switch-box::after{left:26px;background:var(--bg-base)}' +
    '.switch.on span{color:var(--fg-primary)}' +
    '.slider-row{padding:12px 0;border-bottom:1px dotted var(--border-subtle)}' +
    '.slider-row .label-row{display:flex;justify-content:space-between;align-items:baseline;' +
      'font-family:var(--font-body);font-size:0.95rem;margin-bottom:4px}' +
    '.slider-row .sub{font-family:var(--font-mono);font-size:0.62rem;color:var(--fg-dim);' +
      'letter-spacing:0.1em;text-transform:uppercase;display:block}' +
    '.slider-val{font-family:var(--font-mono);font-weight:500;font-size:1rem;color:var(--fg-primary)}' +
    '.slider-val.error{color:var(--c-positive)}' +
    'input[type="range"]{-webkit-appearance:none;appearance:none;width:100%;height:4px;' +
      'background:var(--fg-primary);outline:none;margin-top:10px}' +
    'input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;' +
      'background:var(--c-positive);cursor:pointer;border:1px solid var(--c-positive)}' +
    'input[type="range"]::-moz-range-thumb{width:22px;height:22px;background:var(--c-positive);' +
      'cursor:pointer;border:1px solid var(--c-positive)}' +
    '.radio-card{border:1px solid var(--border-subtle);padding:16px;cursor:pointer;margin-bottom:10px;' +
      'min-height:44px;background:var(--bg-base)}' +
    '.radio-card.active{border:2px solid var(--c-positive);background:var(--bg-surface)}' +
    '.radio-card .r-title{font-family:var(--font-head);font-weight:700;font-size:1rem}' +
    '.radio-card .r-sub{font-family:var(--font-mono);font-size:0.68rem;letter-spacing:0.12em;' +
      'text-transform:uppercase;color:var(--fg-dim);margin-top:3px}' +
    '.radio-card.active .r-sub{color:var(--c-positive)}' +
    '.day-chips{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px}' +
    '.day-chip{flex:1;min-width:40px;height:44px;border:1px solid var(--border-subtle);' +
      'background:var(--bg-base);font-family:var(--font-mono);font-size:0.68rem;letter-spacing:0.1em;' +
      'text-transform:uppercase;color:var(--fg-dim);display:flex;align-items:center;justify-content:center;' +
      'cursor:pointer}' +
    '.day-chip.active{border-color:var(--c-positive);background:var(--c-positive);color:var(--bg-base)}' +
    '.time-input{font-family:var(--font-mono);font-size:1.1rem;font-weight:500;padding:10px 14px;' +
      'border:1px solid var(--border-subtle);background:var(--bg-base);width:100%;text-align:center;min-height:44px;' +
      'color:var(--fg-primary);box-sizing:border-box}' +
    '.time-input:focus{outline:none;border-color:var(--c-positive)}' +
    /* sticky save row */
    '.save-row-mobile{position:sticky;bottom:0;background:var(--bg-base);' +
      'border-top:3px double var(--border-subtle);margin-top:28px;padding:18px 0 calc(18px + env(safe-area-inset-bottom));' +
      'text-align:center;z-index:5}' +
    '.save-row-mobile .btn.primary{padding:14px 40px;letter-spacing:0.2em;font-size:0.85rem;min-height:48px}' +
    '.save-row-mobile .btn.ghost{margin-top:10px;padding:10px 20px;letter-spacing:0.16em;font-size:0.75rem}' +
    '.save-row-mobile .btn.primary[disabled]{opacity:0.4}' +
    '.save-row-mobile .last-saved{font-family:var(--font-head);font-style:italic;color:var(--fg-dim);' +
      'font-size:0.82rem;margin-top:10px;padding:0 12px}' +
    /* bottom pad so mobile-nav doesn't overlap last block */
    '.settings-wrap-mobile{padding-bottom:20px}';
  var el = document.createElement('style');
  el.id = 'mm-settings-mobile-styles';
  el.textContent = css;
  document.head.appendChild(el);
}

// ----------------------------------------------------------
// Render
// ----------------------------------------------------------
function _renderShell(data) {
  var schedule = data.schedule || {};
  var filters = data.filters || {};
  var universe = data.universe || 'set_mai';
  var enabled = schedule.enabled !== false;
  var activeDay = schedule.day_of_week || 'sat';
  var hour = typeof schedule.hour === 'number' ? schedule.hour : 9;
  var minute = typeof schedule.minute === 'number' ? schedule.minute : 0;
  var timeStr = _pad2(hour) + ':' + _pad2(minute);

  var minYield = filters.min_dividend_yield != null ? filters.min_dividend_yield : 5.0;
  var minStreak = filters.min_dividend_streak != null ? filters.min_dividend_streak : 5;
  var maxPe = filters.max_pe != null ? filters.max_pe : 15;
  var maxPbv = filters.max_pbv != null ? filters.max_pbv : 1.5;
  var minMcap = filters.min_market_cap != null ? filters.min_market_cap : 5e9;
  var minMcapB = Math.round(minMcap / 1e9);

  var sectionNum = '<div class="section-title" style="margin:var(--sp-6) 0 var(--sp-4);font-weight:700;font-size:var(--fs-lg);color:var(--fg-primary)">Settings</div>';

  var opsSection =
    '<section class="v6-ops-panel">' +
      '<div class="v6-ops-head">' +
        '<h2>Operations</h2>' +
        '<small>Server status &amp; manual actions</small>' +
      '</div>' +
      '<div class="v6-ops-grid">' +
        '<div class="v6-ops-cell">' +
          '<span class="lbl">Server Uptime</span>' +
          '<span class="val" id="v6-ops-uptime">—</span>' +
        '</div>' +
        '<div class="v6-ops-cell">' +
          '<span class="lbl">Last Data Date</span>' +
          '<span class="val" id="v6-ops-last-data">—</span>' +
        '</div>' +
        '<div class="v6-ops-cell">' +
          '<span class="lbl">Last Scan</span>' +
          '<span class="val" id="v6-ops-last-scan">—</span>' +
        '</div>' +
        '<div class="v6-ops-cell">' +
          '<span class="lbl">Pipeline State</span>' +
          '<span class="v6-ops-status-badge idle" id="v6-ops-pipeline-state">idle</span>' +
        '</div>' +
      '</div>' +
      '<div class="v6-ops-actions">' +
        '<button class="btn primary v6-ops-action-btn" id="v6-ops-scan-btn" type="button">รันสแกนตอนนี้</button>' +
        '<button class="btn primary v6-ops-action-btn" id="v6-ops-refresh-btn" type="button">รีเฟรชราคาตอนนี้</button>' +
      '</div>' +
    '</section>';

  var dayChips = '';
  for (var i = 0; i < DAYS.length; i++) {
    var d = DAYS[i];
    dayChips += '<div class="day-chip' + (d.key === activeDay ? ' active' : '') +
      '" data-day="' + d.key + '" role="button" tabindex="0">' + d.label + '</div>';
  }

  var universeCards =
    '<div class="radio-card' + (universe === 'set_only' ? ' active' : '') + '" data-universe="set_only" role="radio" tabindex="0">' +
      '<div class="r-title">SET Only</div>' +
      '<div class="r-sub">704 stocks &middot; faster</div>' +
    '</div>' +
    '<div class="radio-card' + (universe === 'set_mai' ? ' active' : '') + '" data-universe="set_mai" role="radio" tabindex="0">' +
      '<div class="r-title">SET + mai</div>' +
      '<div class="r-sub">933 stocks &middot; default</div>' +
    '</div>';

  var lastSaved = data.last_saved_at
    ? 'Last saved &middot; ' + _formatSavedDate(data.last_saved_at)
    : 'All changes captured &middot; next scan uses these values.';

  return (
    opsSection +
    sectionNum +
    '<div class="settings-wrap-mobile">' +
      /* AUTO SCAN */
      '<div class="setting-block">' +
        '<div class="setting-label">Auto Scan</div>' +
        '<div class="setting-help">ดึงข้อมูล + scan ทุกสัปดาห์</div>' +
        '<label class="switch' + (enabled ? ' on' : '') + '" id="sched-switch" style="margin-bottom:14px">' +
          '<input type="checkbox" id="sched-enabled"' + (enabled ? ' checked' : '') + '>' +
          '<div class="switch-box"></div>' +
          '<span>' + (enabled ? 'Enabled' : 'Disabled') + '</span>' +
        '</label>' +
        '<div class="micro" style="margin-bottom:8px">Scan Day</div>' +
        '<div class="day-chips" id="day-chips">' + dayChips + '</div>' +
        '<div class="micro" style="margin-bottom:6px">Time (ICT)</div>' +
        '<input class="time-input" id="sched-time" type="time" value="' + timeStr + '">' +
        '<div class="micro" style="margin-top:10px">Next run &middot; ' +
          '<strong id="next-run" style="color:var(--fg-primary)">&mdash;</strong>' +
        '</div>' +
      '</div>' +
      /* NIWES THRESHOLDS */
      '<div class="setting-block">' +
        '<div class="setting-label">Niwes Filters</div>' +
        '<div class="setting-help">5-5-5-5 + market cap</div>' +
        _sliderRow('f-yield', 'Min Yield', 'Niwes default 5.0%', 1, 10, 0.5, minYield, '%', 1) +
        _sliderRow('f-streak', 'Min Streak', 'Niwes default 5 yrs', 1, 15, 1, minStreak, ' y', 0) +
        _sliderRow('f-pe', 'Max P/E', 'Niwes default &le; 15&times;', 5, 30, 0.5, maxPe, '×', 1) +
        _sliderRow('f-pbv', 'Max P/BV', 'Niwes default &le; 1.5&times;', 0.3, 5, 0.1, maxPbv, '×', 1) +
        _sliderRow('f-mcap', 'Min Market Cap', 'Niwes default 5B', 1, 50, 1, minMcapB, 'B', 0) +
      '</div>' +
      /* UNIVERSE */
      '<div class="setting-block">' +
        '<div class="setting-label">Stock Universe</div>' +
        '<div class="setting-help">ยิ่งเยอะยิ่งช้า แต่ครอบคลุมกว่า</div>' +
        universeCards +
      '</div>' +
    '</div>' +
    /* SAVE — sticky bottom */
    '<div class="save-row-mobile">' +
      '<button class="btn primary" id="btn-save" type="button" disabled>Save All Changes</button>' +
      '<div>' +
        '<button class="btn ghost" id="btn-discard" type="button" disabled>Discard</button>' +
      '</div>' +
      '<div class="last-saved" id="last-saved">' + lastSaved + '</div>' +
    '</div>'
  );
}

function _sliderRow(id, labelText, subHtml, min, max, step, value, unit, decimals) {
  return (
    '<div class="slider-row">' +
      '<div class="label-row">' +
        '<div>' + labelText + '<span class="sub">' + subHtml + '</span></div>' +
        '<div class="slider-val" id="' + id + '-val" data-unit="' + unit + '" data-decimals="' + decimals + '">' +
          _fmtSliderVal(value, unit, decimals) +
        '</div>' +
      '</div>' +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '">' +
    '</div>'
  );
}

function _fmtSliderVal(v, unit, decimals) {
  var num = Number(v);
  var s = decimals > 0 ? num.toFixed(decimals) : String(Math.round(num));
  if (unit === '%') return s + '%';
  if (unit === '×') return s + '×';
  if (unit === ' y') return s + ' y';
  return s + unit;
}

// ----------------------------------------------------------
// Wiring (same shape as desktop)
// ----------------------------------------------------------
function _wireDaychips(root) {
  var chips = root.querySelectorAll('.day-chip');
  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      chips.forEach(function (x) { x.classList.remove('active'); });
      c.classList.add('active');
      _markDirty(root);
      _updateNextRunLabel(root);
    });
  });
}

function _wireSwitch(root) {
  var sw = root.querySelector('#sched-switch');
  var inp = root.querySelector('#sched-enabled');
  if (!sw || !inp) return;
  sw.addEventListener('click', function (e) {
    e.preventDefault();
    inp.checked = !inp.checked;
    sw.classList.toggle('on', inp.checked);
    var span = sw.querySelector('span');
    if (span) span.textContent = inp.checked ? 'Enabled' : 'Disabled';
    _markDirty(root);
    _updateNextRunLabel(root);
  });
}

function _wireSliders(root) {
  var sliders = root.querySelectorAll('input[type="range"]');
  sliders.forEach(function (s) {
    s.addEventListener('input', function () {
      var valEl = root.querySelector('#' + s.id + '-val');
      if (valEl) {
        var unit = valEl.getAttribute('data-unit') || '';
        var dec = parseInt(valEl.getAttribute('data-decimals') || '0', 10);
        valEl.textContent = _fmtSliderVal(s.value, unit, dec);
        valEl.classList.remove('error');
      }
      _markDirty(root);
    });
  });
}

function _wireRadios(root) {
  var cards = root.querySelectorAll('.radio-card');
  cards.forEach(function (c) {
    c.addEventListener('click', function () {
      cards.forEach(function (x) { x.classList.remove('active'); });
      c.classList.add('active');
      _markDirty(root);
    });
  });
}

function _wireTimeInput(root) {
  var t = root.querySelector('#sched-time');
  if (!t) return;
  ['input', 'change'].forEach(function (ev) {
    t.addEventListener(ev, function () {
      _markDirty(root);
      _updateNextRunLabel(root);
    });
  });
}

function _wireSave(root) {
  var btn = root.querySelector('#btn-save');
  if (!btn) return;
  btn.addEventListener('click', async function () {
    var body = _collectFormState(root);
    var valid = _validateBody(root, body);
    if (!valid) {
      window.MMComponents.showToast('กรอกค่าให้ถูกต้อง', 'error');
      return;
    }
    btn.disabled = true;
    try {
      var r = await window.MMApi.post('/api/settings', body);
      var config = (r && r.config) ? r.config : r;
      window.MMComponents.showToast('Saved', 'info');
      var ls = root.querySelector('#last-saved');
      if (ls) ls.innerHTML = 'Last saved &middot; ' + _formatSavedDate(config.last_saved_at || new Date().toISOString());
      _state.initial = _extractFormState(config);
      _state.dirty = false;
      var disc = root.querySelector('#btn-discard');
      if (disc) disc.disabled = true;
      if (config.next_run_at) {
        _renderNextRun(root, _formatNextRun(config.next_run_at));
      } else {
        _updateNextRunLabel(root);
      }
    } catch (e) {
      window.MMComponents.showToast((e && e.message) || 'Save failed', 'error');
      btn.disabled = false;
    }
  });
}

function _wireDiscard(root) {
  var btn = root.querySelector('#btn-discard');
  if (!btn) return;
  btn.addEventListener('click', function () {
    mount(root);
  });
}

function _wireDirtyTracking(root) {
  root.addEventListener('change', function () { _markDirty(root); });
}

// ----------------------------------------------------------
// Operations panel — server status + manual triggers
// ----------------------------------------------------------
function _wireOperations(container) {
  if (!container) return;
  var scanBtn = container.querySelector('#v6-ops-scan-btn');
  var refreshBtn = container.querySelector('#v6-ops-refresh-btn');
  if (scanBtn) {
    scanBtn.addEventListener('click', function () {
      if (!window.confirm('รันสแกน 933 หุ้นเลยไหม? ใช้เวลา 10-15 นาที')) return;
      window.MMApi.post('/api/admin/scan/trigger', {}).then(function () {
        _showOpsToast(container, 'สแกนเริ่มแล้ว');
        _refreshStatus(container);
      }).catch(function (e) {
        _showOpsToast(container, 'ผิดพลาด: ' + (e.message || 'request failed'), true);
      });
    });
  }
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      window.MMApi.post('/api/admin/price-refresh/trigger', {}).then(function () {
        _showOpsToast(container, 'รีเฟรชราคาแล้ว');
        _refreshStatus(container);
      }).catch(function (e) {
        _showOpsToast(container, 'ผิดพลาด: ' + (e.message || 'request failed'), true);
      });
    });
  }
  _refreshStatus(container);
  if (_state.opsPollHandle) clearInterval(_state.opsPollHandle);
  _state.opsPollHandle = setInterval(function () { _refreshStatus(container); }, 5000);
}

function _refreshStatus(container) {
  if (!container || !document.body.contains(container)) {
    if (_state.opsPollHandle) { clearInterval(_state.opsPollHandle); _state.opsPollHandle = null; }
    return;
  }
  window.MMApi.get('/api/status').then(function (s) {
    var uptime = container.querySelector('#v6-ops-uptime');
    var lastData = container.querySelector('#v6-ops-last-data');
    var lastScan = container.querySelector('#v6-ops-last-scan');
    var pipeState = container.querySelector('#v6-ops-pipeline-state');
    var scanBtn = container.querySelector('#v6-ops-scan-btn');
    var refreshBtn = container.querySelector('#v6-ops-refresh-btn');
    if (uptime) uptime.textContent = _fmtUptime(s.uptime_seconds);
    if (lastData) lastData.textContent = s.last_data_date ? window.MMUtils.fmtDateThaiShort(s.last_data_date) : '—';
    if (lastScan) lastScan.textContent = s.last_run ? _fmtRelative(s.last_run) : 'ยังไม่เคยสแกน';
    if (pipeState) {
      if (s.pipeline_running) {
        pipeState.textContent = (s.current_task || 'running');
        pipeState.className = 'v6-ops-status-badge running';
      } else {
        pipeState.textContent = 'idle';
        pipeState.className = 'v6-ops-status-badge idle';
      }
    }
    if (scanBtn) scanBtn.disabled = !!s.pipeline_running;
    if (refreshBtn) refreshBtn.disabled = !!s.pipeline_running;
  }).catch(function () { /* silent — keep last good values */ });
}

function _fmtUptime(seconds) {
  if (seconds == null) return '—';
  var hours = Math.floor(seconds / 3600);
  var mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return hours + ' ชม ' + mins + ' นาที';
  return mins + ' นาที';
}

function _fmtRelative(iso) {
  try {
    var t = new Date(iso).getTime();
    var diff = (Date.now() - t) / 1000;
    if (diff < 60) return 'เพิ่งเสร็จ';
    if (diff < 3600) return Math.floor(diff / 60) + ' นาทีที่แล้ว';
    if (diff < 86400) return Math.floor(diff / 3600) + ' ชม.ที่แล้ว';
    return window.MMUtils.fmtDateThaiShort(iso);
  } catch (e) { return iso; }
}

function _showOpsToast(container, msg, isError) {
  var existing = container.querySelector('.v6-ops-toast');
  if (existing) existing.remove();
  var t = document.createElement('div');
  t.className = 'v6-ops-toast' + (isError ? ' err' : '');
  t.textContent = msg;
  var panel = container.querySelector('.v6-ops-panel');
  if (panel) panel.appendChild(t);
  setTimeout(function () { if (t.parentNode) t.remove(); }, 3500);
}

// ----------------------------------------------------------
// State helpers
// ----------------------------------------------------------
function _extractFormState(data) {
  var s = data.schedule || {};
  var f = data.filters || {};
  return {
    enabled: s.enabled !== false,
    day_of_week: s.day_of_week || 'sat',
    hour: typeof s.hour === 'number' ? s.hour : 9,
    minute: typeof s.minute === 'number' ? s.minute : 0,
    min_dividend_yield: f.min_dividend_yield != null ? f.min_dividend_yield : 5.0,
    min_dividend_streak: f.min_dividend_streak != null ? f.min_dividend_streak : 5,
    max_pe: f.max_pe != null ? f.max_pe : 15,
    max_pbv: f.max_pbv != null ? f.max_pbv : 1.5,
    min_market_cap: f.min_market_cap != null ? f.min_market_cap : 5e9,
    universe: data.universe || 'set_mai'
  };
}

function _collectFormState(root) {
  var timeStr = (root.querySelector('#sched-time') || {}).value || '09:00';
  var parts = timeStr.split(':');
  var hour = parseInt(parts[0], 10);
  var minute = parseInt(parts[1] || '0', 10);
  if (isNaN(hour)) hour = 9;
  if (isNaN(minute)) minute = 0;

  var activeChip = root.querySelector('.day-chip.active');
  var activeRadio = root.querySelector('.radio-card.active');
  var enabledInp = root.querySelector('#sched-enabled');

  var get = function (id) { var el = root.querySelector('#' + id); return el ? parseFloat(el.value) : NaN; };
  var getInt = function (id) { var el = root.querySelector('#' + id); return el ? parseInt(el.value, 10) : NaN; };

  return {
    schedule: {
      enabled: !!(enabledInp && enabledInp.checked),
      day_of_week: activeChip ? activeChip.getAttribute('data-day') : 'sat',
      hour: hour,
      minute: minute
    },
    filters: {
      min_dividend_yield: get('f-yield'),
      min_dividend_streak: getInt('f-streak'),
      max_pe: get('f-pe'),
      max_pbv: get('f-pbv'),
      min_market_cap: getInt('f-mcap') * 1e9
    },
    universe: activeRadio ? activeRadio.getAttribute('data-universe') : 'set_mai'
  };
}

function _validateBody(root, body) {
  var ok = true;
  var f = body.filters || {};
  root.querySelectorAll('.slider-val.error').forEach(function (x) { x.classList.remove('error'); });
  var mark = function (id) {
    var v = root.querySelector('#' + id + '-val');
    if (v) v.classList.add('error');
  };
  if (!(f.min_dividend_yield >= 0)) { ok = false; mark('f-yield'); }
  if (!(f.min_dividend_streak >= 1)) { ok = false; mark('f-streak'); }
  if (!(f.max_pe > 0)) { ok = false; mark('f-pe'); }
  if (!(f.max_pbv > 0)) { ok = false; mark('f-pbv'); }
  if (!(f.min_market_cap > 0)) { ok = false; mark('f-mcap'); }
  var sched = body.schedule || {};
  if (sched.hour < 0 || sched.hour > 23) ok = false;
  if (sched.minute < 0 || sched.minute > 59) ok = false;
  return ok;
}

function _markDirty(root) {
  _state.dirty = true;
  var save = root.querySelector('#btn-save');
  var disc = root.querySelector('#btn-discard');
  if (save) save.disabled = false;
  if (disc) disc.disabled = false;
}

// ----------------------------------------------------------
// Next-run computation
// ----------------------------------------------------------
function _updateNextRunLabel(root) {
  var enabledInp = root.querySelector('#sched-enabled');
  if (!enabledInp || !enabledInp.checked) {
    _renderNextRun(root, 'off');
    return;
  }
  var chip = root.querySelector('.day-chip.active');
  if (!chip) return;
  var dayKey = chip.getAttribute('data-day');
  var timeStr = (root.querySelector('#sched-time') || {}).value || '09:00';
  var parts = timeStr.split(':');
  var hour = parseInt(parts[0], 10) || 0;
  var minute = parseInt(parts[1] || '0', 10) || 0;
  var next = _computeNextRun(dayKey, hour, minute);
  _renderNextRun(root, _formatNextRun(next));
}

function _computeNextRun(dayKey, hour, minute) {
  var order = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  var target = order[dayKey] != null ? order[dayKey] : 6;
  var now = new Date();
  var cand = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  var delta = target - now.getDay();
  if (delta < 0 || (delta === 0 && cand.getTime() <= now.getTime())) {
    delta += 7;
  }
  cand.setDate(cand.getDate() + delta);
  return cand;
}

function _renderNextRun(root, text) {
  var el = root.querySelector('#next-run');
  if (el) el.textContent = text;
}

function _formatNextRun(dateOrIso) {
  var d;
  if (dateOrIso instanceof Date) {
    d = dateOrIso;
  } else if (typeof dateOrIso === 'string') {
    d = new Date(dateOrIso);
    if (isNaN(d.getTime())) return dateOrIso;
  } else {
    return '—';
  }
  var monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return monthNames[d.getMonth()] + ' ' + _pad2(d.getDate()) + ', ' +
    _pad2(d.getHours()) + ':' + _pad2(d.getMinutes());
}

function _formatSavedDate(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  var monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return monthNames[d.getMonth()] + ' ' + _pad2(d.getDate()) + ', ' +
    _pad2(d.getHours()) + ':' + _pad2(d.getMinutes());
}

function _pad2(n) {
  var s = String(Math.max(0, Math.floor(Number(n))));
  return s.length < 2 ? '0' + s : s;
}

// ----------------------------------------------------------
// Unsaved-changes guards
// ----------------------------------------------------------
function _attachUnsavedGuards() {
  window.addEventListener('beforeunload', function (e) {
    if (!_state.dirty) return;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });
  document.addEventListener('click', function (e) {
    if (!_state.dirty) return;
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    try {
      var url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
    } catch (_) { /* ignore */ }
    var ok = window.confirm('มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก — ออกจากหน้านี้เลย?');
    if (!ok) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}
