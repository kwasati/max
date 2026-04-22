/* ==========================================================
   MAX MAHON v6 — Watchlist Page (Desktop) · Phase 1
   Renders summary strip + table. Fetches live from
   /api/watchlist/enriched — NO hardcoded stock data.
   Compare + add-by-symbol wired in Phase 2/3.
   ========================================================== */

const MAX_COMPARE = 3;
const MIN_COMPARE = 2;
const _selected = new Set();
let _positions = [];

/** Entry point called by the shell bootstrap after shared
 *  components + API are loaded. */
export function mount(root) {
  root.innerHTML = _renderShell();
  const tbody = root.querySelector('#wl-tbody');
  if (tbody) window.MMComponents.renderLoading(tbody, 'Loading positions');
  _bindFooter(root);
  _load(root);
}

function _renderShell() {
  return (
    '<div class="section-num">' +
      '<span class="no">02 · Watchlist</span>' +
      '<span id="wl-sectaside"></span>' +
    '</div>' +
    '<h2 class="section-title">Saved Positions.</h2>' +
    '<p class="section-kicker">หุ้นที่คุณกำลังติดตาม — อัปเดตจาก scan ล่าสุดทุกสัปดาห์.</p>' +
    '<section class="summary-strip" id="wl-summary"></section>' +
    '<div id="wl-table-host">' +
      '<table class="data-table">' +
        '<thead>' +
          '<tr>' +
            '<th style="width:34px"></th>' +
            '<th>Symbol · Name</th>' +
            '<th class="num">Score</th>' +
            '<th class="num">Δ Entry</th>' +
            '<th>Entry</th>' +
            '<th>Exit Signal</th>' +
            '<th>Notes</th>' +
            '<th style="width:40px" class="num">Cmp</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody id="wl-tbody"></tbody>' +
      '</table>' +
    '</div>' +
    '<div class="foot-action">' +
      '<div class="foot-hint">Select two or three positions to compare side-by-side.</div>' +
      '<div class="flex gap-3">' +
        '<button class="btn ghost" id="wl-add-btn" type="button" disabled>+ Add by Symbol</button>' +
        '<button class="btn primary" id="wl-cmp-btn" type="button" disabled>เทียบหุ้นที่เลือก · 0/' + MAX_COMPARE + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="ornament"></div>'
  );
}

async function _load(root) {
  const tbody = root.querySelector('#wl-tbody');
  const summaryHost = root.querySelector('#wl-summary');
  try {
    const data = await window.MMApi.get('/api/watchlist/enriched');
    _positions = data.positions || [];
    _selected.clear();
    _renderSummary(summaryHost, data.summary || {});
    _renderTable(tbody);
    _renderSectionAside(root, data.summary || {});
    _updateCompareButton(root);
  } catch (e) {
    window.MMComponents.renderError(
      root.querySelector('#wl-table-host') || root,
      'โหลด watchlist ไม่สำเร็จ: ' + (e && e.message || e),
      function () { _load(root); }
    );
  }
}

function _renderSectionAside(root, summary) {
  const aside = root.querySelector('#wl-sectaside');
  if (!aside) return;
  const n = summary.tracked || 0;
  const exits = summary.consider_exit || 0;
  const reviews = summary.review || 0;
  let txt = n + ' positions';
  if (exits > 0) txt += ' · ' + exits + ' exit alert' + (exits > 1 ? 's' : '');
  else if (reviews > 0) txt += ' · ' + reviews + ' under review';
  aside.textContent = txt;
}

function _renderSummary(host, s) {
  if (!host) return;
  const cells = [
    ['Tracked', s.tracked],
    ['Hold', s.hold],
    ['Review', s.review],
    ['Consider Exit', s.consider_exit],
    ['Avg Δ Entry', _fmtDelta(s.avg_delta_entry)],
    ['Oldest Position', (s.oldest_position_days || 0) + ' d']
  ];
  let html = '';
  for (let i = 0; i < cells.length; i++) {
    const label = window.MMUtils.escapeHtml(String(cells[i][0]));
    const raw = cells[i][1];
    const val = (raw === undefined || raw === null) ? '—' : String(raw);
    html +=
      '<div class="summary-cell">' +
        '<span class="label">' + label + '</span>' +
        '<span class="val mono">' + window.MMUtils.escapeHtml(val) + '</span>' +
      '</div>';
  }
  host.innerHTML = html;
}

function _fmtDelta(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  const sign = n > 0 ? '+' : (n < 0 ? '' : '');
  return sign + n;
}

function _renderTable(tbody) {
  if (!tbody) return;
  if (!_positions.length) {
    tbody.innerHTML =
      '<tr><td colspan="8" style="text-align:center;padding:var(--sp-7) 0;' +
      'font-family:var(--font-head);font-style:italic;color:var(--ink-dim)">' +
        'ยังไม่มีหุ้นใน watchlist.' +
      '</td></tr>';
    return;
  }
  const esc = window.MMUtils.escapeHtml;
  let html = '';
  for (let i = 0; i < _positions.length; i++) {
    const p = _positions[i];
    const sym = esc(p.symbol || '');
    const name = esc(p.name || sym);
    const score = p.current_score == null ? '—' : String(p.current_score);
    const delta = _formatDeltaCell(p);
    const entry = p.entry_date ? window.MMUtils.fmtDateShort(p.entry_date) : '—';
    const sev = window.MMComponents.renderSevBadge(p.exit_signal || 'HOLD');
    const note = esc(p.note || '');
    const checked = _selected.has(p.symbol) ? ' checked' : '';
    html +=
      '<tr data-sym="' + sym + '">' +
        '<td><span class="star filled" data-mm-star="' + sym + '" role="button" aria-label="Remove ' + sym + ' from watchlist">★</span></td>' +
        '<td><span class="sym">' + sym + '</span> <span class="dim italic">· ' + name + '</span></td>' +
        '<td class="num">' + score + '</td>' +
        '<td class="num">' + delta + '</td>' +
        '<td class="mono">' + esc(entry) + '</td>' +
        '<td>' + sev + '</td>' +
        '<td><input class="notes-input" data-mm-note="' + sym + '" value="' + note + '" placeholder="note&hellip;" /></td>' +
        '<td class="num"><input type="checkbox" class="cmp-check" data-mm-cmp="' + sym + '"' + checked + ' /></td>' +
      '</tr>';
  }
  tbody.innerHTML = html;
  _bindRows(tbody);
}

function _formatDeltaCell(p) {
  const d = p.delta_entry;
  const entry = p.entry_score;
  if (d === null || d === undefined || entry === null || entry === undefined) return '—';
  const sign = d > 0 ? '+' : (d < 0 ? '−' : '');
  const abs = Math.abs(d);
  const cls = d >= 0 ? 'delta up' : 'delta down';
  return '<span class="' + cls + '">' + sign + abs + ' vs ' + entry + '</span>';
}

function _bindRows(tbody) {
  const stars = tbody.querySelectorAll('[data-mm-star]');
  for (let i = 0; i < stars.length; i++) {
    stars[i].addEventListener('click', function () {
      const sym = this.getAttribute('data-mm-star');
      _onStarRemove(sym, this.closest('tr'));
    });
  }
  const notes = tbody.querySelectorAll('[data-mm-note]');
  for (let i = 0; i < notes.length; i++) {
    notes[i].addEventListener('blur', function () {
      const sym = this.getAttribute('data-mm-note');
      _onNoteBlur(sym, this);
    });
  }
  const cmps = tbody.querySelectorAll('[data-mm-cmp]');
  for (let i = 0; i < cmps.length; i++) {
    cmps[i].addEventListener('change', function () {
      const sym = this.getAttribute('data-mm-cmp');
      _onCompareToggle(sym, this);
    });
  }
}

function _bindFooter(root) {
  // Phase 2/3 wire the actual handlers; buttons are disabled until then.
}

async function _onStarRemove(sym, rowEl) {
  try {
    await window.MMApi.put('/api/user/watchlist', { remove: [sym] });
    _selected.delete(sym);
    _positions = _positions.filter(function (p) { return p.symbol !== sym; });
    if (rowEl && rowEl.parentNode) rowEl.parentNode.removeChild(rowEl);
    const root = document.getElementById('app') || document;
    _updateCompareButton(root);
    window.MMComponents.showToast('ลบ ' + sym + ' ออกจาก watchlist แล้ว', 'info');
    if (!_positions.length) {
      const tbody = document.getElementById('wl-tbody');
      _renderTable(tbody);
    }
  } catch (e) {
    window.MMComponents.showToast('ลบไม่สำเร็จ: ' + (e && e.message || e), 'error');
  }
}

async function _onNoteBlur(sym, input) {
  const newNote = input.value.trim();
  try {
    await window.MMApi.put('/api/user/notes/' + encodeURIComponent(sym), { note: newNote });
    const p = _positions.find(function (x) { return x.symbol === sym; });
    if (p) p.note = newNote;
    window.MMComponents.showToast('บันทึก note แล้ว', 'info');
  } catch (e) {
    window.MMComponents.showToast('Save failed: ' + (e && e.message || e), 'error');
  }
}

function _onCompareToggle(sym, el) {
  if (el.checked) {
    if (_selected.size >= MAX_COMPARE) {
      el.checked = false;
      window.MMComponents.showToast('เลือกได้สูงสุด ' + MAX_COMPARE + ' ตัว', 'warn');
      return;
    }
    _selected.add(sym);
  } else {
    _selected.delete(sym);
  }
  _updateCompareButton(document);
}

function _updateCompareButton(scope) {
  const btn = (scope || document).querySelector('#wl-cmp-btn');
  if (!btn) return;
  const n = _selected.size;
  btn.textContent = 'เทียบหุ้นที่เลือก · ' + n + '/' + MAX_COMPARE;
  btn.disabled = (n < MIN_COMPARE);
}
