/* ==========================================================
   MAX MAHON v6 — Settings (Desktop)
   Plan 08. Vanilla JS.
   Three blocks: Auto Scan + Niwes Thresholds + Stock Universe.
   GET /api/settings on mount → POST /api/settings on Save.
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

// Module-scoped state so nav-intercept + beforeunload handler share it.
var _state = {
  dirty: false,
  initial: null,
  mounted: false
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

  if (!_state.mounted) {
    _state.mounted = true;
    _attachUnsavedGuards();
  }

  _updateNextRunLabel(container);
}

// ----------------------------------------------------------
// Style injection (page-scoped — mirrors mockup 06-settings.html)
// ----------------------------------------------------------
function _ensureStyles() {
  if (document.getElementById('mm-settings-styles')) return;
  var css =
    '.settings-wrap{max-width:820px;margin:0 auto}' +
    '.setting-block{border-bottom:1px solid var(--border-subtle);padding:var(--sp-6) 0;' +
      'display:grid;grid-template-columns:240px 1fr;gap:var(--sp-6)}' +
    '.setting-label{font-family:var(--font-head);font-weight:700;font-size:var(--fs-md);line-height:1.2}' +
    '.setting-help{font-family:var(--font-head);font-style:italic;color:var(--fg-dim);' +
      'font-size:var(--fs-sm);margin-top:6px}' +
    '.setting-control{display:flex;flex-direction:column;gap:var(--sp-3)}' +
    /* Switch */
    '.switch{display:inline-flex;align-items:center;cursor:pointer;gap:var(--sp-3);' +
      'font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.14em;' +
      'text-transform:uppercase;color:var(--fg-dim)}' +
    '.switch-box{width:52px;height:24px;border:1px solid var(--border-subtle);background:var(--bg-surface);' +
      'position:relative;transition:background 120ms ease}' +
    '.switch-box::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;' +
      'background:var(--fg-primary);transition:left 160ms ease}' +
    '.switch input{display:none}' +
    '.switch.on .switch-box{background:var(--c-positive)}' +
    '.switch.on .switch-box::after{left:28px;background:var(--bg-surface)}' +
    '.switch.on span{color:var(--fg-primary)}' +
    /* Slider rows */
    '.slider-row{display:grid;grid-template-columns:1fr auto;gap:var(--sp-4);align-items:center;' +
      'padding:var(--sp-3) 0;border-bottom:1px dotted var(--border-subtle)}' +
    '.slider-label{font-family:var(--font-body);font-size:var(--fs-md)}' +
    '.slider-label .sub{display:block;font-family:var(--font-mono);font-size:var(--fs-xs);' +
      'color:var(--fg-dim);letter-spacing:0.1em;text-transform:uppercase;margin-top:2px}' +
    '.slider-wrap{display:flex;align-items:center;gap:var(--sp-3);min-width:260px}' +
    '.slider-val{font-family:var(--font-mono);font-size:var(--fs-md);font-weight:500;min-width:70px;' +
      'text-align:right;color:var(--fg-primary);border-bottom:1px solid var(--border-subtle);padding-bottom:2px}' +
    '.slider-val.error{color:var(--c-positive);border-bottom-color:var(--c-positive)}' +
    'input[type="range"]{-webkit-appearance:none;appearance:none;width:180px;height:2px;' +
      'background:var(--fg-primary);outline:none}' +
    'input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;' +
      'background:var(--c-positive);cursor:pointer;border:1px solid var(--c-positive)}' +
    'input[type="range"]::-moz-range-thumb{width:14px;height:14px;background:var(--c-positive);' +
      'cursor:pointer;border:1px solid var(--c-positive)}' +
    /* Radio card */
    '.radio-row{display:flex;gap:var(--sp-3)}' +
    '.radio-card{flex:1;border:1px solid var(--border-subtle);padding:var(--sp-4);cursor:pointer;' +
      'transition:all 120ms ease;background:var(--bg-surface)}' +
    '.radio-card:hover{border-color:var(--border-subtle)}' +
    '.radio-card.active{border:2px solid var(--c-positive);background:var(--bg-surface)}' +
    '.radio-card .r-title{font-family:var(--font-head);font-weight:700;font-size:var(--fs-md);margin-bottom:4px}' +
    '.radio-card .r-sub{font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.12em;' +
      'text-transform:uppercase;color:var(--fg-dim)}' +
    '.radio-card.active .r-sub{color:var(--c-positive)}' +
    /* Time row / day chips */
    '.time-row{display:flex;gap:var(--sp-4);align-items:center;flex-wrap:wrap}' +
    '.day-chips{display:flex;gap:2px}' +
    '.day-chip{width:40px;height:40px;border:1px solid var(--border-subtle);background:var(--bg-surface);' +
      'cursor:pointer;font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.1em;' +
      'text-transform:uppercase;color:var(--fg-dim);display:flex;align-items:center;justify-content:center}' +
    '.day-chip.active{border-color:var(--c-positive);background:var(--c-positive);color:var(--bg-surface)}' +
    '.time-input{font-family:var(--font-mono);font-size:var(--fs-lg);font-weight:500;' +
      'padding:var(--sp-2) var(--sp-3);border:1px solid var(--border-subtle);background:var(--bg-surface);width:110px;color:var(--fg-primary)}' +
    '.time-input:focus{outline:none;border-color:var(--c-positive)}' +
    /* Save row */
    '.save-row{text-align:center;padding:var(--sp-7) 0;border-top:3px double var(--border-subtle);margin-top:var(--sp-7)}' +
    '.save-row .btn.primary{font-size:var(--fs-sm);padding:var(--sp-4) var(--sp-7);letter-spacing:0.22em}' +
    '.save-row .btn.ghost{margin-left:var(--sp-3);font-size:var(--fs-sm);padding:var(--sp-4) var(--sp-6);letter-spacing:0.18em}' +
    '.save-row .last-saved{font-family:var(--font-head);font-style:italic;color:var(--fg-dim);' +
      'font-size:var(--fs-sm);margin-top:var(--sp-4)}' +
    '.save-row .btn.primary[disabled]{opacity:0.4;cursor:not-allowed}';
  var el = document.createElement('style');
  el.id = 'mm-settings-styles';
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
    '<div class="radio-row">' +
      '<div class="radio-card' + (universe === 'set_only' ? ' active' : '') + '" data-universe="set_only" role="radio" tabindex="0">' +
        '<div class="r-title">SET Only</div>' +
        '<div class="r-sub">704 stocks &middot; faster</div>' +
      '</div>' +
      '<div class="radio-card' + (universe === 'set_mai' ? ' active' : '') + '" data-universe="set_mai" role="radio" tabindex="0">' +
        '<div class="r-title">SET + mai</div>' +
        '<div class="r-sub">933 stocks &middot; default</div>' +
      '</div>' +
    '</div>';

  var lastSaved = data.last_saved_at
    ? 'Last saved &middot; ' + _formatSavedDate(data.last_saved_at)
    : 'All changes captured &middot; next scan uses these values.';

  return (
    opsSection +
    sectionNum +
    '<h2 class="section-title">House Rules.</h2>' +
    '<p style="color:var(--fg-dim);font-size:var(--fs-sm);margin-bottom:var(--sp-4)">ตั้งค่าการ scan + เกณฑ์กรองของ ดร.นิเวศน์. บันทึกเมื่อกด Save ด้านล่าง.</p>' +
    '<div class="settings-wrap">' +
      /* AUTO SCAN */
      '<div class="setting-block">' +
        '<div>' +
          '<div class="setting-label">Auto Scan</div>' +
          '<div class="setting-help">ระบบจะดึงข้อมูลใหม่ + เรียก screen ทุกสัปดาห์ในเวลาที่กำหนด</div>' +
        '</div>' +
        '<div class="setting-control">' +
          '<label class="switch' + (enabled ? ' on' : '') + '" id="sched-switch">' +
            '<input type="checkbox" id="sched-enabled"' + (enabled ? ' checked' : '') + '>' +
            '<div class="switch-box"></div>' +
            '<span>' + (enabled ? 'Enabled' : 'Disabled') + '</span>' +
          '</label>' +
          '<div class="time-row" style="margin-top:var(--sp-2)">' +
            '<div class="day-chips" id="day-chips">' + dayChips + '</div>' +
            '<input class="time-input" id="sched-time" type="time" value="' + timeStr + '">' +
            '<span class="micro">ICT &middot; Next run &middot; ' +
              '<strong id="next-run" style="color:var(--fg-primary)">&mdash;</strong>' +
            '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      /* NIWES THRESHOLDS */
      '<div class="setting-block">' +
        '<div>' +
          '<div class="setting-label">Niwes Filter Thresholds</div>' +
          '<div class="setting-help">เกณฑ์ 5-5-5-5 + market cap &middot; ปรับให้เข้มขึ้น = หุ้นผ่านน้อยลง &middot; ย่อหย่อน = ผ่านมากขึ้น</div>' +
        '</div>' +
        '<div class="setting-control">' +
          _sliderRow('f-yield', 'Min Dividend Yield', 'Niwes default &middot; 5.0%', 1, 10, 0.5, minYield, '%', 1) +
          _sliderRow('f-streak', 'Min Dividend Streak', 'Niwes default &middot; 5 years', 1, 15, 1, minStreak, 'yrs', 0) +
          _sliderRow('f-pe', 'Max P/E', 'Niwes default &middot; &le; 15&times;', 5, 30, 0.5, maxPe, '×', 1) +
          _sliderRow('f-pbv', 'Max P/BV', 'Niwes default &middot; &le; 1.5&times;', 0.3, 5, 0.1, maxPbv, '×', 1) +
          _sliderRow('f-mcap', 'Min Market Cap', 'Niwes default &middot; 5B THB', 1, 50, 1, minMcapB, 'B THB', 0) +
        '</div>' +
      '</div>' +
      /* UNIVERSE */
      '<div class="setting-block">' +
        '<div>' +
          '<div class="setting-label">Stock Universe</div>' +
          '<div class="setting-help">จำนวนหุ้นที่ scan ทุกสัปดาห์ &middot; ยิ่งเยอะยิ่งช้า &middot; แต่ครอบคลุมกว่า</div>' +
        '</div>' +
        '<div class="setting-control">' + universeCards + '</div>' +
      '</div>' +
      /* SAVE */
      '<div class="save-row">' +
        '<button class="btn primary" id="btn-save" type="button" disabled>Save All Changes</button>' +
        '<button class="btn ghost" id="btn-discard" type="button" disabled>Discard</button>' +
        '<div class="last-saved" id="last-saved">' + lastSaved + '</div>' +
      '</div>' +
    '</div>'
  );
}

function _sliderRow(id, labelText, subHtml, min, max, step, value, unit, decimals) {
  return (
    '<div class="slider-row">' +
      '<div class="slider-label">' + labelText +
        '<span class="sub">' + subHtml + '</span>' +
      '</div>' +
      '<div class="slider-wrap">' +
        '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '">' +
        '<div class="slider-val" id="' + id + '-val" data-unit="' + unit + '" data-decimals="' + decimals + '">' +
          _fmtSliderVal(value, unit, decimals) +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function _fmtSliderVal(v, unit, decimals) {
  var num = Number(v);
  var s = decimals > 0 ? num.toFixed(decimals) : String(Math.round(num));
  if (unit === '%') return s + '%';
  if (unit === '×') return s + '×';
  return s + ' ' + unit;
}

// ----------------------------------------------------------
// Wiring
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
    // prevent native label-click double-fire
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
  t.addEventListener('input', function () {
    _markDirty(root);
    _updateNextRunLabel(root);
  });
  t.addEventListener('change', function () {
    _markDirty(root);
    _updateNextRunLabel(root);
  });
}

function _wireSave(root, originalData) {
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
      // reset dirty state to current form values
      _state.initial = _extractFormState(config);
      _state.dirty = false;
      var disc = root.querySelector('#btn-discard');
      if (disc) disc.disabled = true;
      // server returned next_run_at — prefer that, else compute client-side
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

function _wireDiscard(root, originalData) {
  var btn = root.querySelector('#btn-discard');
  if (!btn) return;
  btn.addEventListener('click', function () {
    mount(root);
  });
}

function _wireDirtyTracking(root) {
  // Generic input listener covers manual typing; specific wires above already flag dirty.
  root.addEventListener('change', function () { _markDirty(root); });
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
  var clearErr = function () {
    root.querySelectorAll('.slider-val.error').forEach(function (x) { x.classList.remove('error'); });
  };
  clearErr();
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
// Next-run computation (client-side)
// Next occurrence of the selected day + time (ICT). If that moment
// already passed today, roll forward 7 days. Displayed like "SAT MAY 02, 09:00".
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
  var dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  var monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return dayNames[d.getDay()] + ' ' + monthNames[d.getMonth()] + ' ' + _pad2(d.getDate()) +
    ', ' + _pad2(d.getHours()) + ':' + _pad2(d.getMinutes());
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
// Unsaved-changes guards (beforeunload + in-app nav intercept)
// ----------------------------------------------------------
function _attachUnsavedGuards() {
  window.addEventListener('beforeunload', function (e) {
    if (!_state.dirty) return;
    // Modern browsers display their own generic string; this is best-effort.
    e.preventDefault();
    e.returnValue = '';
    return '';
  });

  // In-app nav intercept — catches masthead link clicks.
  document.addEventListener('click', function (e) {
    if (!_state.dirty) return;
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    // Only intercept same-origin nav away from current page.
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
