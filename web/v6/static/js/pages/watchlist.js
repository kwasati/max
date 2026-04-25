/* ==========================================================
   MAX MAHON v6 — Watchlist Page (Desktop)
   Renders summary strip + table + compare modal overlay.
   Fetches live from /api/watchlist/enriched — NO hardcoded data.
   Add-by-symbol wired in Phase 3.
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
    '<p style="color:var(--fg-dim);font-size:var(--fs-sm);margin-bottom:var(--sp-4)">หุ้นที่คุณกำลังติดตาม — อัปเดตจาก scan ล่าสุดทุกสัปดาห์.</p>' +
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
        '<button class="btn ghost" id="wl-add-btn" type="button">+ Add by Symbol</button>' +
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
      'font-family:var(--font-head);font-style:italic;color:var(--fg-dim)">' +
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
        '<td><a href="/report/' + sym + '" class="sym-link" style="color:inherit;text-decoration:none"><span class="sym">' + sym + '</span> <span class="dim italic">· ' + name + '</span></a></td>' +
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
  const cmpBtn = root.querySelector('#wl-cmp-btn');
  if (cmpBtn) cmpBtn.addEventListener('click', function () { _openCompare(root); });
  const addBtn = root.querySelector('#wl-add-btn');
  if (addBtn) addBtn.addEventListener('click', function () { _openAddModal(root); });
}

function _openAddModal(root) {
  const html =
    '<p style="font-family:var(--font-body);color:var(--fg-secondary);margin-bottom:var(--sp-4)">' +
      'กรอก symbol (เช่น "CPALL" หรือ "CPALL.BK") — ถ้าไม่ใส่ <code>.BK</code> ระบบจะเติมให้อัตโนมัติ.' +
    '</p>' +
    '<input type="text" id="wl-add-input" ' +
      'style="width:100%;padding:10px 12px;border:1px solid var(--border-subtle);' +
      'background:var(--bg-surface);font-family:var(--font-mono);font-size:var(--fs-md);' +
      'color:var(--fg-primary);outline:none;margin-bottom:var(--sp-4);text-transform:uppercase" ' +
      'placeholder="BBL" autocomplete="off" />' +
    '<div id="wl-add-err" style="display:none;color:var(--c-positive);font-family:var(--font-body);' +
      'font-size:var(--fs-sm);margin-bottom:var(--sp-3)"></div>' +
    '<div style="display:flex;justify-content:flex-end;gap:var(--sp-3)">' +
      '<button type="button" class="btn ghost" id="wl-add-cancel">Cancel</button>' +
      '<button type="button" class="btn primary" id="wl-add-save">เพิ่มหุ้น</button>' +
    '</div>';
  window.MMComponents.openModal(html, {
    kicker: 'Supplementary · Add Position',
    headline: 'Add by Symbol',
    dek: 'เพิ่มหุ้นใน watchlist ด้วย ticker — auto-append .BK ถ้าจำเป็น.'
  });
  const input = document.getElementById('wl-add-input');
  const save = document.getElementById('wl-add-save');
  const cancel = document.getElementById('wl-add-cancel');
  const err = document.getElementById('wl-add-err');
  if (input) {
    input.focus();
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (save) save.click(); }
    });
  }
  if (cancel) cancel.addEventListener('click', function () { window.MMComponents.closeModal(); });
  if (save) save.addEventListener('click', async function () {
    const raw = input ? input.value : '';
    const sym = _normalizeSymbol(raw);
    if (!sym) {
      if (err) { err.style.display = 'block'; err.textContent = 'กรุณากรอก symbol'; }
      return;
    }
    save.disabled = true;
    try {
      await window.MMApi.put('/api/user/watchlist', { add: [sym] });
      window.MMComponents.closeModal();
      window.MMComponents.showToast('เพิ่ม ' + sym + ' เข้า watchlist แล้ว', 'info');
      if (root) _load(root);
    } catch (e) {
      save.disabled = false;
      if (err) {
        err.style.display = 'block';
        err.textContent = 'เพิ่มไม่สำเร็จ: ' + (e && e.message || e);
      }
    }
  });
}

function _normalizeSymbol(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return '';
  if (s.indexOf('.') !== -1) return s;
  return s + '.BK';
}

async function _openCompare(root) {
  const syms = Array.from(_selected);
  if (syms.length < MIN_COMPARE) return;
  window.MMComponents.openModal(
    '<div id="wl-cmp-body"></div>',
    {
            headline: 'COMPARISON · ' + syms.length + ' STOCKS',
      dek: syms.join(' · ') + ' — best values bolded in oxblood'
    }
  );
  const body = document.getElementById('wl-cmp-body');
  window.MMComponents.renderLoading(body, 'Loading comparison');
  try {
    const data = await window.MMApi.get('/api/watchlist/compare?symbols=' + encodeURIComponent(syms.join(',')));
    body.innerHTML = _renderCompareGrid(data);
  } catch (e) {
    window.MMComponents.renderError(
      body,
      'โหลดเปรียบเทียบไม่สำเร็จ: ' + (e && e.message || e)
    );
  }
}

function _renderCompareGrid(data) {
  const syms = data.symbols || [];
  const rows = data.rows || [];
  const esc = window.MMUtils.escapeHtml;

  const cols = 'auto repeat(' + syms.length + ', 1fr) auto';
  let html =
    '<div class="compare-grid" style="grid-template-columns:' + cols + '">' +
      '<div class="row-label"></div>';
  for (let i = 0; i < syms.length; i++) {
    html += '<div class="sym-head">' + esc(syms[i]) + '</div>';
  }
  html += '<div class="sym-head dim" style="font-style:italic;font-family:var(--font-head);font-weight:400">Delta</div>';

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    html += '<div class="row-label">' + esc(row.label) + '</div>';
    const vals = row.values || [];
    for (let c = 0; c < vals.length; c++) {
      const v = vals[c];
      const cls = (row.best_index === c) ? 'val best' : 'val';
      html += '<div class="' + cls + '">' + _fmtCompareCell(row.label, v) + '</div>';
    }
    for (let c = vals.length; c < syms.length; c++) {
      html += '<div class="val">—</div>';
    }
    html += '<div class="val dim">' + esc(row.delta || '—') + '</div>';
  }
  html += '</div>';

  html +=
    '<p class="lede" style="margin-top:var(--sp-6);max-width:60ch">' +
      'เปรียบเทียบ ' + syms.length + ' หุ้น · ค่าที่ดีที่สุดในแต่ละบรรทัดเน้นสี. ' +
      'อ่านประกอบกับสัญญาณ exit + Niwes signals ที่ด้านล่าง.' +
    '</p>';
  return html;
}

function _fmtCompareCell(label, v) {
  if (v === null || v === undefined) return '—';
  if (label === 'Exit Signal') {
    return '<span style="font-size:var(--fs-sm)">' + window.MMComponents.renderSevBadge(String(v)) + '</span>';
  }
  if (label === 'Yield' || label === 'Payout' || label === 'ROE') {
    return window.MMUtils.fmtPercent(v, 2);
  }
  if (label === 'P/E' || label === 'P/BV') {
    return Number(v).toFixed(2) + '×';
  }
  if (label === 'Streak') {
    return String(v) + ' y';
  }
  if (label === 'Mcap (B THB)') {
    return String(v);
  }
  if (label === 'Signals') {
    return window.MMUtils.escapeHtml(String(v || '—')) || '—';
  }
  if (typeof v === 'number') {
    return String(v);
  }
  return window.MMUtils.escapeHtml(String(v));
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
